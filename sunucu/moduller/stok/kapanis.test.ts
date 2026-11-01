import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { RefakatPartisiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kapanisIzlenebilirlikDurumu, kapanisStokDurumu } from './disari.ts';
import { kapanisIzlenebilirligi, kapanisStoguIslendi } from './kurallar.ts';

// Onaylı kapanışın stok maddeleri (1074 a): izlenebilirlik (refakat kartında lot ve sertifika no) ve stoğa işlendi.
test('izlenebilirlik kuralı: her kartta lot ve sertifika no dolu tamam; lot bekleyen ya da sertifikasız kart eksik; kartsız emir ihtiyaca göre', () => {
  const tam = { lotNo: 'L-1', sertifikaNo: 'S-1' };
  assert.deepEqual(kapanisIzlenebilirligi([tam, tam], true), { durum: 'tamam', ayrinti: '2 refakat kartında lot ve sertifika no dolu' });
  assert.deepEqual(kapanisIzlenebilirligi([tam, { lotNo: 'L-2', sertifikaNo: null }, { lotNo: null, sertifikaNo: null }], true),
    { durum: 'eksik', ayrinti: 'lot bekleyen kart: 1, sertifika no yok: 1 (toplam 3 kart)' });
  assert.deepEqual(kapanisIzlenebilirligi([], true), { durum: 'eksik', ayrinti: 'Refakat kartı yok' });
  assert.deepEqual(kapanisIzlenebilirligi([], false), { durum: 'gerekmez', ayrinti: 'Stoklu malzeme yok' });
  // Stoklu ihtiyacı olmayan emirde açılmış kart yine denetlenir.
  assert.equal(kapanisIzlenebilirligi([{ lotNo: 'L-1', sertifikaNo: null }], false).durum, 'eksik');
});

test('stoğa işlendi kuralı: sağlam adet girdi, istasyonda eksi ve kalan artı yoksa tamam; kalan sarf aranmaz (K-1 a); sağlamsız emirde gerekmez', () => {
  const t = { istasyonEksileri: [], istasyonArtilari: [] };
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 8, girilen: 8000n, ...t }), { durum: 'tamam', ayrinti: '8 / 8 stoğa girdi' });
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 8, girilen: 5000n, ...t }), { durum: 'eksik', ayrinti: '5 / 8 stoğa girdi' });
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 0, girilen: 0n, ...t }), { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' });
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: null, girilen: 0n, ...t }), { durum: 'eksik', ayrinti: '0 / 10 stoğa girdi' });
  // 1214 O-5: teslim edilmeden sayılan parçanın istasyonda bıraktığı eksi, girişi tam olan emri de eksik yapar; parçanın yeri birlikte söylenir.
  const eksi = { malzeme: 'HM-1', konum: 'IST-2', miktar: -20000n, statulu: true, karsiliklar: [{ konum: 'IST-1', miktar: 20000n }] };
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 8, girilen: 8000n, istasyonEksileri: [eksi], istasyonArtilari: [] }),
    { durum: 'eksik', ayrinti: '8 / 8 stoğa girdi; istasyonda eksi: IST-2 HM-1 -20 (statülü; aynı statüde IST-1: 20)' });
  assert.equal(kapanisStoguIslendi({ adet: 10, saglamAdet: 0, girilen: 0n, istasyonEksileri: [eksi], istasyonArtilari: [] }).durum, 'gerekmez', '1079 a');
  // K-2 a (1386): istasyonda emre ait kalan artı bakiye, girişi tam olan ve sağlamsız emri de eksik yapar; yer ve miktar yazılır.
  const arti = { malzeme: 'HM-1', konum: 'IST-1', miktar: 2500n, statulu: false };
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 8, girilen: 8000n, istasyonEksileri: [], istasyonArtilari: [arti] }),
    { durum: 'eksik', ayrinti: '8 / 8 stoğa girdi; istasyonda kalan: IST-1 HM-1 2.5 (depoya taşıyın ya da fire çıkışı yapın)' });
  assert.deepEqual(kapanisStoguIslendi({ adet: 10, saglamAdet: 0, girilen: 0n, istasyonEksileri: [], istasyonArtilari: [{ ...arti, statulu: true }] }),
    { durum: 'eksik', ayrinti: 'Sağlam parça yok; istasyonda kalan: IST-1 HM-1 2.5 (statülü) (depoya taşıyın ya da fire çıkışı yapın)' });
});

const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'] };

describe('stok: kapanış maddeleri (gerçek PostgreSQL)', () => {
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
  async function giris(ad: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
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
    await giris(ad);
  }
  async function kart(tur: 'hammadde' | 'mamul' | 'hizmet'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['KPN-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, 'KPN-DNM-', $3, 'aktif', $4, $5, $5, $6) RETURNING no`,
      [`kpn-dnm-${sira}`, tur, sira, JSON.stringify({ id: `kpn-dnm-${sira}`, com: { ad: `Kapanış deneme ${sira}` } }), kisiler.get('yonetici'),
        tur === 'hizmet' ? 'alinan' : null],
    ))!.no;
  }
  // Mal kabulle lot açar; lot numarası döner.
  async function lotAl(malzemeId: number, miktar: string, sertifikaNo: string | null): Promise<string> {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', {
      tur: 'diger', satirlar: [{ malzemeId, miktar, parti: { tedarikciPartiNo: null, dokumNo: null, sertifikaNo } }],
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [malzemeId]))!.lot_no;
  }
  const kartAc = async (emir: number, lot: string) => {
    const c = await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu: `LOT:${lot}` });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.refakat;
  };
  // Emrin bitişi Üretim Emirleri'nin işidir; burada yalnız durum alanları yazılır (stok hesabı bunları okur). İstasyon, stokta
  // tamamlamanın sarf kapsamı denetimi için.
  let istasyonId = 0;
  const bitir = (emir: number, saglam: number) => o().sahip.sorgu(
    "UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = $2, istasyon_id = $3 WHERE id = $1", [emir, saglam, istasyonId]);

  let mm = 0;
  let hm = 0;
  let emirAc: (adet: number, bilesenler: { malzemeNo: number; miktar: string; fireYuzde?: string }[], firePayiYuzde?: string) => Promise<number>;

  before(async () => {
    ortam = await testVeritabaniKur('stok_kapanis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await giris('yonetici');
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'planlama_proje']) await kisiEkle(rol);
    [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const im = (await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('KPN-IM', 'Deneme merkezi') RETURNING id"))!.id;
    istasyonId = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('KPN-IS', 'Deneme istasyon', $1, true) RETURNING id", [im]))!.id;
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KPN-1', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.KPN', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    emirAc = async (adet, bilesenler, firePayiYuzde) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: mm, adet, teslim: '2026-11-30', kaynakRotaRevizyonId: revizyon, isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
        ...(firePayiYuzde === undefined ? {} : { firePayiYuzde }),
      }],
    }))).uretimEmriId;
  });
  after(async () => { await ortam?.kaldir(); });

  const iz = (emir: number) => kapanisIzlenebilirlikDurumu(o().vt, emir);
  const stok = (emir: number) => kapanisStokDurumu(o().vt, emir);

  test('tanınmayan emirde null', async () => {
    assert.equal(await iz(987654), null);
    assert.equal(await stok(987654), null);
  });

  test('izlenebilirlik: sertifikalı lotun kartı tamam; sertifikasız lot eksik; iptal kart sayılmaz; kartsız emir eksik; stoklu malzemesiz emir gerekmez', async () => {
    const sertifikali = await lotAl(hm, '30', 'SRT-1');
    const sertifikasiz = await lotAl(hm, '30', null);
    const hizmet = await kart('hizmet');
    const [e1, e2, e3, e4] = [await emirAc(5, [{ malzemeNo: hm, miktar: '1' }]), await emirAc(5, [{ malzemeNo: hm, miktar: '1' }]),
      await emirAc(5, [{ malzemeNo: hm, miktar: '1' }]), await emirAc(5, [{ malzemeNo: hizmet, miktar: '1' }])];
    await kartAc(e1, sertifikali);
    await kartAc(e2, sertifikali);
    const k = await kartAc(e2, sertifikasiz);
    assert.deepEqual(await iz(e1), { durum: 'tamam', ayrinti: '1 refakat kartında lot ve sertifika no dolu' });
    assert.deepEqual(await iz(e2), { durum: 'eksik', ayrinti: 'sertifika no yok: 1 (toplam 2 kart)' });
    assert.deepEqual(await iz(e3), { durum: 'eksik', ayrinti: 'Refakat kartı yok' });
    assert.deepEqual(await iz(e4), { durum: 'gerekmez', ayrinti: 'Stoklu malzeme yok' });

    const iptal = await istek('depo', 'POST', `/stok/refakat-partileri/${k.id}/iptal-et`, { surum: k.surum });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.equal((await iz(e2))?.durum, 'tamam');
  });

  test('stoğa işlendi: bitmemiş emir eksik; stokta tamamlanınca tamam ve tamamlama sarf yazmaz (K-1 a); sağlamsız emir gerekmez', async () => {
    await lotAl(hm, '20', 'SRT-2');
    const [e1, e2] = [await emirAc(10, [{ malzemeNo: hm, miktar: '1' }]), await emirAc(4, [{ malzemeNo: hm, miktar: '1' }])];
    assert.deepEqual(await stok(e1), { durum: 'eksik', ayrinti: '0 / 10 stoğa girdi' });
    const once = await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [hm]);

    await bitir(e1, 8);
    assert.deepEqual(await stok(e1), { durum: 'eksik', ayrinti: '0 / 8 stoğa girdi' });
    const c = await istek<{ hareketIdler: number[] }>('yonetici', 'POST', `/stok/uretim-emirleri/${e1}/tamamla`, {});
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.hareketIdler.length, 1, 'yalnız çıktı girer');
    assert.deepEqual(await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [hm]), once, 'fire payı ve plan sarfı düşülmez');
    await bitir(e2, 0);
    assert.deepEqual(await stok(e1), { durum: 'tamam', ayrinti: '8 / 8 stoğa girdi' });
    assert.deepEqual(await stok(e2), { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' });
  });

  test('S-1: fire payı tüketim değildir; adım ve bileşen firesi olan emir stokta tamamlanınca hammadde düşmez, yalnız sağlam adet girer; stok yazma yetkisi olmayan reddedilir', async () => {
    await lotAl(hm, '20', 'SRT-FIRE');
    const e = await emirAc(10, [{ malzemeNo: hm, miktar: '1', fireYuzde: '10' }], '20');
    const hmOnce = await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [hm]);
    const mmOnce = Number((await o().vt.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [mm]))!.m);
    await bitir(e, 10);
    const plan = await istek<{ bilesenler: { malzemeId: number; brut: string; kalan: string; eksik: string }[] }>('yonetici', 'GET', `/stok/uretim-emirleri/${e}/tamamlama`);
    assert.equal(plan.durum, 200, JSON.stringify(plan.govde));
    const b = plan.govde.bilesenler.find((x) => x.malzemeId === hm)!;
    assert.equal(Number(b.brut), 13.75, 'brüt plan bilgisidir: 10 / (1 - 0,20) x 1 x 1,10');
    assert.deepEqual([Number(b.kalan), Number(b.eksik)], [0, 0], 'fire payı kalan ya da eksik sayılmaz');

    const red = await istek('planlama_proje', 'POST', `/stok/uretim-emirleri/${e}/tamamla`, {});
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal(Number((await o().vt.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [mm]))!.m), mmOnce, 'reddedilen tamamlama ürün girmez');

    const c = await istek<{ hareketIdler: number[] }>('yonetici', 'POST', `/stok/uretim-emirleri/${e}/tamamla`, {});
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.hareketIdler.length, 1, 'yalnız çıktı girer');
    assert.deepEqual(await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [hm]), hmOnce, 'hammadde ne net ne fire payı kadar düşer');
    assert.equal(Number((await o().vt.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [mm]))!.m), mmOnce + 10);
  });

  test('K-2 a: istasyonda emre ait artı bakiye kapanışı durdurur; depoya taşınınca madde kapanır; başka emrin bakiyesi sayılmaz', async () => {
    await lotAl(hm, '10', 'SRT-3');
    const kaynak = (await o().vt.tek<{ konum_id: number }>(
      'SELECT konum_id FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0 ORDER BY konum_id LIMIT 1', [hm]))!.konum_id;
    const [e1, e2] = [await emirAc(2, [{ malzemeNo: hm, miktar: '1' }]), await emirAc(2, [{ malzemeNo: hm, miktar: '1' }])];
    const g = await istek<{ teslim: { id: number; surum: number; hedef: { konumId: number; kod: string } } }>('depo', 'POST', '/stok/teslimler/gonder', {
      malzemeId: hm, miktar: '3', statuId: null, kaynak: { konumId: kaynak }, hedef: { istasyonId }, uretimEmriId: e1, not: null, kaynakKimligi: randomUUID(), kartOnayi: true,
    });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const al = await istek('yonetici', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '3' });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    await bitir(e1, 0);
    await bitir(e2, 0);
    const k = await stok(e1);
    assert.equal(k?.durum, 'eksik', JSON.stringify(k));
    const yer = (await o().vt.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE id = $1', [g.govde.teslim.hedef.konumId]))!.kod;
    assert.match(k?.ayrinti ?? '', new RegExp(`^Sağlam parça yok; istasyonda kalan: ${yer} \\S+ 3 \\(depoya`));
    assert.deepEqual(await stok(e2), { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' });

    const parti = (await o().vt.tek<{ parti_id: string }>('SELECT parti_id FROM stok_bakiye WHERE konum_id = $1 AND malzeme_id = $2 AND miktar > 0',
      [g.govde.teslim.hedef.konumId, hm]))!.parti_id;
    const t = await istek('yonetici', 'POST', '/stok/tasima', { malzemeId: hm, kaynakKonumId: g.govde.teslim.hedef.konumId, hedefKonumId: kaynak, partiId: Number(parti), miktar: '3' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    assert.deepEqual(await stok(e1), { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' });
  });
});
