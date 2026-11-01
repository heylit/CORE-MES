import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { malzemeFisiAyrintiCevabi, malzemeFisiOzeti, malzemeFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { LogoFisBilgisi, MalKabulCevabi, MalzemeFisiAyrintiCevabi, MalzemeFisiListeSatiri, MalzemeFisiOzeti, MalzemeFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirAcildiYansit, hurdaSayimiYansit, logoIcinMalzemeFisleri, malzemeFisiDegisiklikleri, malzemeFisiLogoCozucusu } from './disari.ts';
import type { LogoDurumuSorusu } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// Kart #492 (293 a, 294 c, 295 a): fiş stok hareketinden doğar; emir fişleri emirle açılır, sayım ve ambar fişi komut başına tektir.
describe('stok malzeme fişleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let yoneticiId = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yon = <T>(y: 'GET' | 'POST', yol: string, g?: unknown) => istek<T>('yonetici', y, yol, g);
  async function giris(ad: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let sira = 0;
  async function kart(tur: 'hammadde' | 'mamul' = 'hammadde'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['MF-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'MF-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`mf-dnm-${sira}`, tur, sira, JSON.stringify({ id: `mf-dnm-${sira}`, com: { ad: `Fiş deneme ${sira}`, birim: 'adet' } }), yoneticiId],
    );
    return r!.no;
  }
  async function emir(): Promise<number> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`MFM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`MFI${sira}`, `Deneme ${sira}`, im!.id]);
    const e = await o().sahip.tek<{ id: number }>('INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 10, $3, $4) RETURNING id', [`MF-${sira}`, 'Deneme', ist!.id, yoneticiId]);
    return e!.id;
  }
  const konumId = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [kod]))!.id;
  async function malKabul(malzemeId: number, miktar: string): Promise<void> {
    const c = await yon('POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  }
  const fisler = (sorgu: string) => yon<MalzemeFisleriCevabi>('GET', `/stok/malzeme-fisleri?${sorgu}`);
  const ayrinti = async (id: number): Promise<MalzemeFisiAyrintiCevabi> => {
    const c = await yon<MalzemeFisiAyrintiCevabi>('GET', `/stok/malzeme-fisleri/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malzemeFisiAyrintiCevabi.parse(c.govde);
  };
  const emirFisi = async (e: number, tur: string): Promise<MalzemeFisiListeSatiri> => {
    const c = await fisler(`uretimEmriId=${e}&tur=${tur}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.satirlar.length, 1);
    return c.govde.satirlar[0]!;
  };
  const degisiklik = async (id: number): Promise<number> => (await o().vt.tek<{ d: number }>('SELECT degisiklik AS d FROM stok_malzeme_fisi WHERE id = $1', [id]))!.d;

  before(async () => {
    ortam = await testVeritabaniKur('stokmalzemefisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme fiş yöneticisi', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    // Kalite rolü stok okur ama fiş göndermez (299 a: yalnız yönetici ve depo).
    const rol = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'");
    const yr = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme kalite', kullaniciAdi: 'kalite', parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol!.id);
      await rolAl(db, yoneticiId, k, yr!.id);
    });
    await o().sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.stok' FROM rol WHERE kod = 'kalite' ON CONFLICT DO NOTHING");
    await giris('kalite');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('emir açılınca sarf, üretimden giriş ve fire fişi boş açılır; ikinci açılış çiftlemez', async () => {
    const e = await emir();
    await o().vt.tx((db) => emirAcildiYansit(db, { uretimEmriId: e, kisiId: yoneticiId, stoktanRezerve: false }));
    await o().vt.tx((db) => emirAcildiYansit(db, { uretimEmriId: e, kisiId: yoneticiId, stoktanRezerve: false }));
    const c = await fisler(`uretimEmriId=${e}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    malzemeFisleriCevabi.parse(c.govde);
    assert.deepEqual(c.govde.satirlar.map((f) => f.tur).sort(), ['fire', 'sarf', 'uretim_girisi']);
    assert.ok(c.govde.satirlar.every((f) => f.satirSayisi === 0 && f.emirNo !== null && f.no === f.emirNo));
    // Logo modülü kablolamayla bağlı (kart #493): sarf ve giriş otomatik türde sıraya girecek, fire kapalı; hiçbiri elle gönderilemez.
    assert.deepEqual(Object.fromEntries(c.govde.satirlar.map((f) => [f.tur, f.logo.durum])), { sarf: 'bekliyor', uretim_girisi: 'bekliyor', fire: 'gonderilmez' });
    assert.ok(c.govde.satirlar.every((f) => !f.gonderilebilir));
  });

  test('emirli sarf ve fire ayrı fişe yazılır; geri alma satırı düşürür ve değişiklik sayılır', async () => {
    const e = await emir();
    const k = await kart();
    await malKabul(k, '10');
    const kabul = await konumId('KABUL');
    const sarf = await yon<{ hareketIdler: number[] }>('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, miktar: '4', cikisNedeni: 'uretime_sarf', uretimEmriId: e });
    assert.equal(sarf.durum, 200, JSON.stringify(sarf.govde));
    assert.equal((await yon('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, miktar: '1', cikisNedeni: 'fire', uretimEmriId: e })).durum, 200);
    const s = await emirFisi(e, 'sarf');
    const f = await emirFisi(e, 'fire');
    assert.equal(s.satirSayisi, 1);
    assert.equal(f.satirSayisi, 1);
    const a = await ayrinti(s.id);
    assert.deepEqual(a.satirlar.map((x) => [x.malzemeId, x.miktar, x.aciklama]), [[k, '4', null]]);
    assert.equal(a.hareketler.length, 1);
    const once = await degisiklik(s.id);
    assert.equal((await yon('POST', `/stok/hareketler/${sarf.govde.hareketIdler[0]!}/geri-al`, {})).durum, 200);
    assert.equal(await degisiklik(s.id), once + 1);
    const b = await ayrinti(s.id);
    assert.deepEqual(b.satirlar, []);
    assert.equal(b.hareketler.length, 2);
  });

  test('sayım fişi komut başına tektir, fazla ve eksik ayrı fiştir; numara önek ve kimliktir, aranır', async () => {
    // Eşik içindeki fark eskisi gibi hemen yazılır; eşiği aşan farkın onaya gitmesi kor-sayim.test.ts'te (1279 a).
    await o().sahip.sorgu('UPDATE stok_depo SET sayim_esik_yuzde = 100');
    const k1 = await kart();
    const k2 = await kart();
    const k3 = await kart();
    await malKabul(k1, '5');
    await malKabul(k2, '5');
    await malKabul(k3, '5');
    const kabul = await konumId('KABUL');
    const satir = async (k: number) => ({ malzemeId: k, partiId: (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [k]))?.id ?? null, beklenenMiktar: '5' });
    const c = await yon('POST', '/stok/sayim', { konumId: kabul, satirlar: [{ ...(await satir(k1)), sayilanMiktar: '3' }, { ...(await satir(k2)), sayilanMiktar: '4' }, { ...(await satir(k3)), sayilanMiktar: '7' }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const eksik = (await fisler('tur=sayim_eksigi')).govde.satirlar;
    const fazla = (await fisler('tur=sayim_fazlasi')).govde.satirlar;
    assert.equal(eksik.length, 1);
    assert.equal(fazla.length, 1);
    assert.equal(eksik[0]!.satirSayisi, 2);
    assert.match(eksik[0]!.no, /^SE-\d{6}$/);
    const ara = await fisler(`metin=${encodeURIComponent(eksik[0]!.no)}`);
    assert.deepEqual(ara.govde.satirlar.map((f) => f.id), [eksik[0]!.id]);
    assert.deepEqual((await fisler('metin=yok-boyle')).govde.satirlar, []);
    await yon('POST', '/stok/sayim', { konumId: kabul, satirlar: [{ ...(await satir(k1)), beklenenMiktar: '3', sayilanMiktar: '2' }] });
    assert.equal((await fisler('tur=sayim_eksigi')).govde.satirlar.length, 2);
  });

  test('ambar fişi yalnız Logo ambarı tanımlı ve farklı depolar arası taşımada açılır', async () => {
    const k = await kart();
    await malKabul(k, '6');
    await o().sahip.sorgu("UPDATE stok_depo SET logo_ambar_no = 0 WHERE kod = 'ANA'");
    const d = await o().sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad, logo_ambar_no) VALUES ('MFD', 'Fiş deneme deposu', 3) RETURNING id");
    const ayni = await o().sahip.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) SELECT id, 'MF-AYNI', 'depo_zemini', 'Aynı depo' FROM stok_depo WHERE kod = 'ANA' RETURNING id");
    const baska = await o().sahip.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'MF-BASKA', 'depo_zemini', 'Başka depo') RETURNING id", [d!.id]);
    const kabul = await konumId('KABUL');
    const once = (await fisler('tur=ambar')).govde.satirlar.length;
    assert.equal((await yon('POST', '/stok/tasima', { malzemeId: k, kaynakKonumId: kabul, hedefKonumId: ayni!.id, miktar: '2' })).durum, 200);
    assert.equal((await fisler('tur=ambar')).govde.satirlar.length, once);
    const t = await yon('POST', '/stok/tasima', { malzemeId: k, kaynakKonumId: kabul, hedefKonumId: baska!.id, miktar: '3' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const l = (await fisler('tur=ambar')).govde.satirlar;
    assert.equal(l.length, once + 1);
    const a = await ayrinti(l[0]!.id);
    assert.deepEqual(a.satirlar.map((x) => [x.miktar, x.kaynakAmbarNo, x.hedefAmbarNo]), [['3', 0, 3]]);
  });

  test('mamul hurda sayımı üretimden giriş fişini değiştirir', async () => {
    const e = await emir();
    await o().vt.tx((db) => emirAcildiYansit(db, { uretimEmriId: e, kisiId: yoneticiId, stoktanRezerve: false }));
    const g = await emirFisi(e, 'uretim_girisi');
    const once = await degisiklik(g.id);
    await o().vt.tx((db) => hurdaSayimiYansit(db, { uretimEmriId: e, isEmriId: null, istasyonId: 0, kisiId: yoneticiId, hurdaNedeniId: 0, fark: '2' }));
    assert.equal(await degisiklik(g.id), once + 1);
  });

  test('Logo için: değişiklik akışı sıralıdır, fiş tarih ve saati tesis saatidir', async () => {
    const e = await emir();
    const k = await kart();
    await malKabul(k, '3');
    assert.equal((await yon('POST', '/stok/cikis', { malzemeId: k, konumId: await konumId('KABUL'), miktar: '2', cikisNedeni: 'uretime_sarf', uretimEmriId: e })).durum, 200);
    const tum = await o().vt.tx((db) => malzemeFisiDegisiklikleri(db, { zaman: null, id: 0, sinir: 1000 }));
    const sirali = [...tum].sort((a, b) => (a.degisiklikZamani === b.degisiklikZamani ? a.id - b.id : Date.parse(a.degisiklikZamani) - Date.parse(b.degisiklikZamani)));
    assert.deepEqual(tum.map((x) => x.id), sirali.map((x) => x.id));
    const son = tum.at(-1)!;
    assert.deepEqual(await o().vt.tx((db) => malzemeFisiDegisiklikleri(db, { zaman: son.degisiklikZamani, id: son.id, sinir: 10 })), []);
    const s = tum.find((x) => x.uretimEmriId === e && x.tur === 'sarf')!;
    const l = (await o().vt.tx((db) => logoIcinMalzemeFisleri(db, [s.id]))).get(s.id)!;
    assert.match(l.tarih, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(l.saat, /^\d{2}:\d{2}:\d{2}$/);
    assert.equal(l.no, (await emirFisi(e, 'sarf')).no);
    assert.deepEqual(l.satirlar.map((x) => x.miktar), ['2']);
  });

  test('gönder: otomatik türde 409; elle türde bekleyen fiş gönderilir, istek ve sürüm yazılır; yetkisiz 403, eski sürüm 409', async () => {
    const e = await emir();
    await o().vt.tx((db) => emirAcildiYansit(db, { uretimEmriId: e, kisiId: yoneticiId, stoktanRezerve: false }));
    const k = await kart();
    await malKabul(k, '3');
    assert.equal((await yon('POST', '/stok/cikis', { malzemeId: k, konumId: await konumId('KABUL'), miktar: '1', cikisNedeni: 'uretime_sarf', uretimEmriId: e })).durum, 200);
    const s = await emirFisi(e, 'sarf');
    assert.equal((await yon('POST', `/stok/malzeme-fisleri/${s.id}/gonder`, { surum: s.surum })).durum, 409);

    const sorulan: LogoDurumuSorusu[][] = [];
    const bilgi = (durum: LogoFisBilgisi['durum'], sekil: LogoFisBilgisi['gonderimSekli']): LogoFisBilgisi =>
      ({ durum, gonderimSekli: sekil, neden: null, kayitNo: null, sonDeneme: null, sonrakiDeneme: null, denemeSayisi: 0, ardisikHata: 0 });
    malzemeFisiLogoCozucusu(async (_db, l) => {
      sorulan.push([...l]);
      return new Map(l.map((x) => [x.id, x.gonderimIstegi === null ? bilgi('bekliyor', x.tur === 'sarf' ? 'elle' : 'kapali') : bilgi('gonderildi', 'elle')]));
    });
    const s2 = await emirFisi(e, 'sarf');
    assert.equal(s2.logo.durum, 'bekliyor');
    assert.equal(s2.gonderilebilir, true);
    assert.equal((await emirFisi(e, 'fire')).gonderilebilir, false);
    assert.ok(sorulan.some((l) => l.some((x) => x.id === s.id && x.satirVar)));

    assert.equal((await istek('kalite', 'POST', `/stok/malzeme-fisleri/${s.id}/gonder`, { surum: s2.surum })).durum, 403);
    const once = await degisiklik(s.id);
    const g = await yon<MalzemeFisiOzeti>('POST', `/stok/malzeme-fisleri/${s.id}/gonder`, { surum: s2.surum });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    malzemeFisiOzeti.parse(g.govde);
    assert.notEqual(g.govde.gonderimIstegi, null);
    assert.equal(g.govde.surum, s2.surum + 1);
    assert.equal(await degisiklik(s.id), once + 1);
    assert.equal((await o().vt.tek<{ k: number }>('SELECT gonderim_isteyen_kisi_id AS k FROM stok_malzeme_fisi WHERE id = $1', [s.id]))!.k, yoneticiId);
    // Gönderildi durumundaki fiş yeniden gönderilmez; eski sürüm de reddedilir.
    assert.equal((await yon('POST', `/stok/malzeme-fisleri/${s.id}/gonder`, { surum: g.govde.surum })).durum, 409);
    assert.equal((await yon('POST', `/stok/malzeme-fisleri/${s.id}/gonder`, { surum: s2.surum })).durum, 409);
    const yok = await yon('GET', '/stok/malzeme-fisleri?logoDurumu=gonderildi');
    assert.equal(yok.durum, 200);
    assert.ok((yok.govde as MalzemeFisleriCevabi).satirlar.some((f) => f.id === s.id));
    assert.equal((await yon('GET', '/stok/malzeme-fisleri/2147483000')).durum, 404);
  });

  // 515 a: mal kabul belgesi listede ayrı türdür; Logo'ya giden fiş açılmaz, yetki listeninkidir.
  test('mal kabul listede görünür: türle süzülür, MK- ile aranır, Logo ve emir süzgecinde çıkmaz, fiş açmaz', async () => {
    malzemeFisiLogoCozucusu(async () => new Map());
    const fisSayisi = async () => (await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_malzeme_fisi'))!.n;
    const once = await fisSayisi();
    const k = await kart();
    const c = await yon<MalKabulCevabi>('POST', '/stok/mal-kabul', { tur: 'diger', irsaliyeNo: 'IRS-DNM-1', satirlar: [{ malzemeId: k, miktar: '4' }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const mk = c.govde.belge;
    assert.equal(await fisSayisi(), once, 'mal kabul Logo fişi açmaz');

    const tur = await fisler('tur=mal_kabul');
    assert.equal(tur.durum, 200, JSON.stringify(tur.govde));
    malzemeFisleriCevabi.parse(tur.govde);
    assert.ok(tur.govde.satirlar.every((f) => f.tur === 'mal_kabul'));
    const satir = tur.govde.satirlar.find((f) => f.id === mk.id)!;
    assert.equal(satir.no, mk.no);
    assert.equal(satir.irsaliyeNo, 'IRS-DNM-1');
    assert.equal(satir.satirSayisi, 1);
    assert.equal(satir.logo.durum, 'gonderilmez');
    assert.equal(satir.gonderilebilir, false);
    assert.equal(satir.uretimEmriId, null);

    const tumu = await fisler('sayfaBoyu=200');
    const toplam = (await o().vt.tek<{ n: number }>('SELECT (SELECT count(*) FROM stok_malzeme_fisi) + (SELECT count(*) FROM stok_mal_kabul) AS n'))!.n;
    assert.equal(tumu.govde.toplam, Number(toplam));
    assert.ok(tumu.govde.satirlar.some((f) => f.tur === 'mal_kabul' && f.id === mk.id));
    assert.ok(tumu.govde.satirlar.some((f) => f.tur !== 'mal_kabul'), 'tümünde fişler de var');
    const zamanlar = tumu.govde.satirlar.map((f) => Date.parse(f.acilis));
    assert.deepEqual(zamanlar, [...zamanlar].sort((a, b) => b - a), 'açılışa göre en yeni önce');

    assert.deepEqual((await fisler(`metin=${encodeURIComponent(mk.no.toLowerCase())}`)).govde.satirlar.map((f) => [f.tur, f.id]), [['mal_kabul', mk.id]]);
    assert.deepEqual((await fisler(`tur=sayim_eksigi&metin=${mk.no}`)).govde.satirlar, []);
    assert.ok(!(await fisler('logoDurumu=gonderilmez')).govde.satirlar.some((f) => f.tur === 'mal_kabul'));
    assert.deepEqual((await fisler('tur=mal_kabul&logoDurumu=gonderilmez')).govde.satirlar, []);
    const e = await emir();
    await o().vt.tx((db) => emirAcildiYansit(db, { uretimEmriId: e, kisiId: yoneticiId, stoktanRezerve: false }));
    assert.ok((await fisler(`uretimEmriId=${e}`)).govde.satirlar.every((f) => f.tur !== 'mal_kabul'));
    assert.deepEqual((await fisler(`tur=mal_kabul&uretimEmriId=${e}`)).govde.satirlar, []);
  });

  test('mal kabul listesi: stok okuyan görür; stok yetkisi olmayan 403, oturumsuz 401', async () => {
    // Stok sayfası ve işlemi olmayan rol.
    const bos = await o().sahip.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('mf_stoksuz', 'Stoksuz') RETURNING id");
    const yr = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme yetkisiz', kullaniciAdi: 'yetkisiz', parola: PAROLA });
      await rolAta(db, yoneticiId, k, bos!.id);
      await rolAl(db, yoneticiId, k, yr!.id);
    });
    await giris('yetkisiz');
    const izinli = await istek<MalzemeFisleriCevabi>('kalite', 'GET', '/stok/malzeme-fisleri?tur=mal_kabul');
    assert.equal(izinli.durum, 200, JSON.stringify(izinli.govde));
    assert.ok(izinli.govde.satirlar.length > 0);
    assert.equal((await istek('yetkisiz', 'GET', '/stok/malzeme-fisleri?tur=mal_kabul')).durum, 403);
    assert.equal((await istek('oturumsuz', 'GET', '/stok/malzeme-fisleri?tur=mal_kabul')).durum, 401);
  });
});
