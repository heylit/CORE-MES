import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { refakatKartlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { RefakatPartisiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirIptalEt, uretimEmriAc } from '../uretim-emirleri/disari.ts';

// Refakat kartları sayfası (kart #708): en yeni kart önce, emrin ürünü, adedi, termini ve adım sayısıyla; iptal yalnız "tümü"nde.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: refakat kartları listesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [ad]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    kisiler.set(ad, await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kart(tur: 'hammadde' | 'mamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['RKL-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RKL-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rkl-dnm-${sira}`, tur, sira, JSON.stringify({ id: `rkl-dnm-${sira}`, com: { ad: `Kart listesi deneme ${sira}` } }), kisiler.get('yonetici')],
    ))!.no;
  }
  const liste = async (sorgu = '') => {
    const c = await istek('depo', 'GET', `/stok/refakat-kartlari${sorgu}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return refakatKartlariCevabi.parse(c.govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_refakat_kartlari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: stok okuması olmayan 403, oturumsuz 401; kart yokken liste boş', async () => {
    assert.equal((await istek('operator', 'GET', '/stok/refakat-kartlari')).durum, 403);
    assert.equal((await istek('oturumsuz', 'GET', '/stok/refakat-kartlari')).durum, 401);
    assert.equal((await istek('depo', 'GET', '/stok/refakat-kartlari?durum=kapali')).durum, 400);
    assert.deepEqual(await liste(), { kartlar: [], sinirda: false });
  });

  test('en yeni kart önce; emrin ürünü, adedi, termini ve adım sayısı yanında; iptal kart yalnız tümünde', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RKL-1', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.RKL', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const adim = (s: number) => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: s === 1 ? [{ malzemeNo: hm, miktar: '1' }] : [],
    });
    const emirAc = async (adet: number, adimSayisi: number) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: mm, adet, teslim: '2026-11-30', kaynakRotaRevizyonId: revizyon, isEmirleri: Array.from({ length: adimSayisi }, (_, i) => adim(i + 1)),
    }))).uretimEmriId;
    const [e1, e2] = [await emirAc(10, 2), await emirAc(5, 3)];
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '20' }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const lot = (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!.lot_no;
    const ac = async (emir: number) => (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu: `LOT:${lot}` })).govde.refakat;
    const k1 = await ac(e1);
    const k2 = await ac(e2);
    // Aynı işlemde açılan kartların zamanı eşit olabilir; sıra kimlikle bozulmaz.
    const acik = await liste();
    assert.deepEqual(acik.kartlar.map((k) => k.refakat.id), [k2.id, k1.id]);
    const [s2, s1] = acik.kartlar;
    assert.deepEqual([s2!.adet, s2!.adimSayisi, s2!.teslim, s1!.adet, s1!.adimSayisi], [5, 3, '2026-11-30', 10, 2]);
    assert.equal(s1!.urun?.ad, 'Kart listesi deneme 1');
    assert.equal(s1!.refakat.lotNo, lot);

    const iptal = await istek('depo', 'POST', `/stok/refakat-partileri/${k1.id}/iptal-et`, { surum: k1.surum });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.deepEqual((await liste()).kartlar.map((k) => k.refakat.id), [k2.id]);
    assert.deepEqual((await liste('?durum=tumu')).kartlar.map((k) => [k.refakat.id, k.refakat.durum]), [[k2.id, 'acik'], [k1.id, 'iptal']]);
  });
  test('iptal emrin kartı listede "iptal" emirle gelir, yazdırılamaz, iptal edilebilir; okunamayan emir yalnız kendi satırını boşaltır', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RKL-2', 'Deneme tipi 2', 'TAL') RETURNING id"))!.id;
    const projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.RKL2', 'Deneme proje 2', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZY', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const yonetici = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('yonetici')!)))!;
    const adim = {
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '1' }],
    };
    const emirAc = async (adet: number) => (await o().vt.tx(async (db) => uretimEmriAc(db, yonetici, {
      projeId, malzemeNo: mm, adet, teslim: '2026-12-01', kaynakRotaRevizyonId: revizyon, isEmirleri: [adim],
    }))).uretimEmriId;
    const [iptalEmri, kapaliEmri, saglamEmri] = [await emirAc(4), await emirAc(3), await emirAc(2)];
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '20' }] })).durum, 200);
    const lot = (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!.lot_no;
    const ac = async (emir: number) => (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu: `LOT:${lot}` })).govde.refakat;
    const [kIptal, kKapali, kSaglam] = [await ac(iptalEmri), await ac(kapaliEmri), await ac(saglamEmri)];
    assert.equal((await istek('depo', 'POST', `/stok/refakat-partileri/${kKapali.id}/iptal-et`, { surum: kKapali.surum })).durum, 200);

    // Emir iptal olunca teslimsiz ve sayımsız açık kart kapanır.
    await o().vt.tx((db) => emirIptalEt(db, yonetici, iptalEmri));
    await o().vt.tx((db) => emirIptalEt(db, yonetici, kapaliEmri));
    const tumu = await liste('?durum=tumu');
    const bul = (id: number) => tumu.kartlar.find((k) => k.refakat.id === id)!;
    assert.deepEqual([bul(kIptal.id).emir, bul(kIptal.id).refakat.durum], ['iptal', 'iptal']);
    assert.deepEqual([bul(kKapali.id).emir, bul(kKapali.id).refakat.durum], ['iptal', 'iptal']);
    assert.deepEqual([bul(kSaglam.id).emir, bul(kSaglam.id).refakat.durum], ['tamam', 'acik']);

    // Emri hiç okunamayan kart (kimlik başka modülden gelir, FK yok).
    const yetim = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES (2147000000, 1, $1, NULL, $2) RETURNING id',
      [hm, kisiler.get('yonetici')]))!.id;
    const acik = await liste('?durum=tumu');
    const satir = (id: number) => acik.kartlar.find((k) => k.refakat.id === id)!;
    assert.equal(satir(kSaglam.id).emir, 'tamam');
    assert.equal(satir(kIptal.id).emir, 'iptal');
    assert.deepEqual([satir(kIptal.id).adet, satir(kIptal.id).adimSayisi, satir(kIptal.id).urun?.ad], [4, 1, 'Kart listesi deneme 3']);
    assert.deepEqual([satir(yetim).emir, satir(yetim).urun, satir(yetim).adet, satir(yetim).teslim, satir(yetim).adimSayisi], ['okunamadi', null, null, null, null]);

    // Basım ucu 409 kalır; kapanan kart bir daha iptal edilemez.
    assert.equal((await istek('depo', 'GET', `/stok/refakat-partileri/${kIptal.id}/kart`)).durum, 409);
    assert.equal((await istek('depo', 'POST', `/stok/refakat-partileri/${kIptal.id}/iptal-et`, { surum: (await o().sahip.tek<{ surum: number }>('SELECT surum FROM stok_refakat_partisi WHERE id = $1', [kIptal.id]))!.surum })).durum, 409);
  });
  test('3716-2: emir iptal edilince teslimsiz ve sayımsız açık kartlar kapanır; yoldaki teslimli, sayımlı, kapalı ve başka emrin kartı değişmez', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RKL-3', 'Deneme tipi 3', 'TAL') RETURNING id"))!.id;
    const projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.RKL3', 'Deneme proje 3', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZX', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const yonetici = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('yonetici')!)))!;
    const adim = {
      sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '1' }],
    };
    const emirAc = async (adet: number) => (await o().vt.tx(async (db) => uretimEmriAc(db, yonetici, {
      projeId, malzemeNo: mm, adet, teslim: '2026-12-01', kaynakRotaRevizyonId: revizyon, isEmirleri: [adim],
    }))).uretimEmriId;
    const [iptalEmri, saglamEmri, yoldaEmri, geriEmri] = [await emirAc(4), await emirAc(2), await emirAc(3), await emirAc(3)];
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '20' }] })).durum, 200);
    const lot = (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!.lot_no;
    const ac = async (emir: number) => (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu: `LOT:${lot}` })).govde.refakat;
    const [kIptal, kSaglam, kYolda, kGeri] = [await ac(iptalEmri), await ac(saglamEmri), await ac(yoldaEmri), await ac(geriEmri)];
    // Teslim ölçütü kartın lotundan emre depodan çıkan net miktardır: yoldaki teslim kartı açık tutar, geri dönen teslim (net 0) tutmaz.
    const parti = (await o().sahip.tek<{ parti_id: number }>('SELECT parti_id FROM stok_refakat_partisi WHERE id = $1', [kYolda.id]))!.parti_id;
    const konum = async (kod: string) => (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [kod]))!.id;
    const [depoKonumu, uretimKonumu] = [await konum('KABUL'), await konum('URETIM')];
    const hareket = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_hareketi WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!.id;
    let teslimSirasi = 0;
    const teslim = async (emir: number, kaynak: number, hedef: number, durum: 'yolda' | 'teslim') => {
      teslimSirasi += 1;
      const kapali = durum === 'teslim';
      await o().sahip.sorgu(
        `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, parti_id, kaynak_konum_id, hedef_konum_id, uretim_emri_id, gonderen_kisi_id, durum, alinan, hareket_id, kapatan_kisi_id, kapanis)
         VALUES ($1, $2, $3, 2, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [`TS-RKL-${String(teslimSirasi)}`, `rkl-teslim-${String(teslimSirasi)}`, hm, parti, kaynak, hedef, emir, kisiler.get('yonetici'), durum,
          kapali ? 2 : null, kapali ? hareket : null, kapali ? kisiler.get('yonetici') : null, kapali ? new Date().toISOString() : null]);
    };
    await teslim(yoldaEmri, depoKonumu, uretimKonumu, 'yolda');
    await teslim(geriEmri, depoKonumu, uretimKonumu, 'teslim');
    await teslim(geriEmri, uretimKonumu, depoKonumu, 'teslim');
    // Aynı emrin lotsuz istisna kartı da açıktır; birleşmiş kart sayılmaz.
    const kapali = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id, durum, iptal_eden_kisi_id, iptal_zamani) VALUES ($1, 9, $2, NULL, $3, 'iptal', $3, now() - interval '1 day') RETURNING id",
      [iptalEmri, hm, kisiler.get('yonetici')]))!.id;
    const once = await o().sahip.tek<{ z: string; s: number }>('SELECT iptal_zamani::text AS z, surum AS s FROM stok_refakat_partisi WHERE id = $1', [kapali]);
    // Üretim sayımı olan kart (kartla sayılmış üretim partisi) emir iptalinde açık kalır.
    const sayimli = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_refakat_partisi (uretim_emri_id, sira, malzeme_id, parti_id, acan_kisi_id) VALUES ($1, 10, $2, NULL, $3) RETURNING id",
      [iptalEmri, mm, kisiler.get('yonetici')]))!.id;
    await o().sahip.sorgu(
      "INSERT INTO stok_parti (malzeme_id, lot_no, uretim_emri_id, refakat_partisi_id, acan_kisi_id) VALUES ($1, $2, $3, $4, $5)", [mm, `RKL-URT-${String(sayimli)}`, iptalEmri, sayimli, kisiler.get('yonetici')]);
    for (const e of [iptalEmri, yoldaEmri, geriEmri]) await o().vt.tx((db) => emirIptalEt(db, yonetici, e));
    const durum = async (id: number) => (await o().sahip.tek<{ durum: string }>('SELECT durum FROM stok_refakat_partisi WHERE id = $1', [id]))!.durum;
    assert.deepEqual([await durum(kIptal.id), await durum(kSaglam.id), await durum(sayimli)], ['iptal', 'acik', 'acik']);
    assert.equal(await durum(kYolda.id), 'acik', 'yoldaki teslimi olan kart açık kalır');
    assert.equal(await durum(kGeri.id), 'iptal', 'teslimi geri dönmüş (net 0) kart kapanır');
    assert.deepEqual(await o().sahip.tek('SELECT iptal_zamani::text AS z, surum AS s FROM stok_refakat_partisi WHERE id = $1', [kapali]), once, 'kapalı karta dokunulmaz');
  });
});
