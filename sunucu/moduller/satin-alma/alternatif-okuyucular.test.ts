import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { logoyaGidecekSiparisler, siparisSatirlari } from './disari.ts';
import * as s from './sorgular.ts';

// 3437-3b-3a: alternatifle verilen sipariş satırının okuyucuları (devir OKUYUCULAR.md). Stok, fiyat, Logo, kart kopyası ve analiz alınan
// (alternatif) kartı okur; yolda istenen (ana) kartta kalır. Sipariş kilidi bu dilimde kapalı olduğu için satır SQL ile kurulur. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('3437-3b-3a: alternatif kartla sipariş satırının okuyucuları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yonetici = 0, sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function post(yol: string, govde: unknown): Promise<{ durum: number; govde: { mesaj?: string } }> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object });
    return { durum: c.statusCode, govde: (c.body ? c.json() : {}) as { mesaj?: string } };
  }
  async function kart(durum: 'aktif' | 'onayda' = 'aktif'): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'HM-AOK-', $2, $3, $4, $5, $5, false) RETURNING no`,
      [`aok-${sira}`, sira, durum, JSON.stringify({ id: `aok-${sira}`, com: { ad: `Deneme çubuk ${sira}`, birim: 'adet' } }), yonetici]))!.no;
  }
  // Siparişi verilmiş talepte tek satır; alternatif doluysa satır alternatif kartla verilmiştir.
  async function siparisSatiri(ana: number, alternatif: number | null): Promise<{ satirId: number; siparisId: number; talepId: string }> {
    sira += 1;
    const [t, kl, tk, kt] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const v = o().sahip;
    await v.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')", [t, 95000 + sira, yonetici]);
    await v.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kt, ana]);
    await v.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim) VALUES ($1, $2, 1, 'Deneme kalem', $3, 10, 'adet')", [t, kl, kt]);
    await v.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikci')", [t, tk]);
    await v.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, 12)', [t, tk, kl]);
    await v.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    const p = (await v.tek<{ id: number }>("INSERT INTO satin_alma_siparis (talep_id, teklif_id, siparis_tarihi, beklenen_teslim) VALUES ($1, $2, current_date, current_date + 7) RETURNING id", [t, tk]))!.id;
    const satirId = (await v.tek<{ id: number }>(
      "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim, alternatif_malzeme_no) VALUES ($1, $2, $3, 10, 'adet', $4) RETURNING id",
      [t, tk, kl, alternatif]))!.id;
    return { satirId, siparisId: p, talepId: t };
  }
  const kabul = (malzemeId: number, siparisSatirId: number) => post('/stok/mal-kabul', { tur: 'satin_alma', irsaliyeNo: `AOK-IRS-${String(++sira)}`, satirlar: [{ malzemeId, miktar: '10', siparisSatirId, parti: { tedarikciPartiNo: `AOK-TP-${String(sira)}` } }] });

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_alternatif_okuyucular');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-AOK-', 100) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('sipariş satırı, Logo kalemi, kart kopyası ve analiz alternatif kartı okur; alternatifsiz satır bugünkü gibi ana kartı', async () => {
    const [ana, alt] = [await kart(), await kart()];
    const a = await siparisSatiri(ana, alt);
    const d = await siparisSatiri(ana, null);
    const [sa, sd] = await o().vt.tx((db) => siparisSatirlari(db, [a.satirId, d.satirId]));
    assert.deepEqual([sa?.malzemeNo, sa?.revizyonMalzemeNo, sd?.malzemeNo, sd?.revizyonMalzemeNo], [alt, alt, ana, ana]);
    const logo = await s.logoSiparisKalemleriOku(o().vt, [a.siparisId, d.siparisId]);
    assert.deepEqual(logo.map((x) => [x.satirId, x.malzemeNo]), [[a.satirId, alt], [d.satirId, ana]]);
    assert.deepEqual((await s.kopyasizSiparisSatirlari(o().vt, a.talepId)).map((x) => x.malzemeNo), [alt]);
    assert.deepEqual((await s.revizyonsuzSiparisSatirlari(o().vt, a.talepId)).map((x) => x.malzemeNo), [alt]);
    const analiz = (await s.analizSiparisSatirlari(o().vt, '2000-01-01', 'Europe/Istanbul')).filter((x) => x.id === a.satirId || x.id === d.satirId);
    assert.deepEqual(analiz.map((x) => x.malzemeNo).sort(), [alt, ana].sort());
  });

  // B6: Logo'ya giden satırın stok kodu alternatif kartındır; logo modülü kartı Logo'da bilinmeyen satırda siparişi bekletir (logo siparis.test LGS-26).
  test('Logo kuyruğu: alternatifli satır alternatif kartın stok koduyla gider', async () => {
    const [ana, alt] = [await kart(), await kart()];
    const a = await siparisSatiri(ana, alt);
    const f = await post('/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Tedarikci AOK', tur: 'tedarikci', logoCariKodu: 'C-AOK-01' });
    assert.equal(f.durum, 200, JSON.stringify(f.govde));
    const firmaId = (f.govde as { firma?: { id: number } }).firma!.id;
    await o().sahip.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1) ON CONFLICT DO NOTHING', [firmaId]);
    await o().sahip.sorgu('UPDATE satin_alma_teklif SET firma_id = $2 WHERE talep_id = $1', [a.talepId, firmaId]);
    await o().sahip.sorgu("UPDATE satin_alma_siparis SET logo_gonderim_durumu = 'bekliyor' WHERE id = $1", [a.siparisId]);
    const kuyruk = await o().vt.tx((db) => logoyaGidecekSiparisler(db, 50));
    const kodlar = await o().vt.tx((db) => malzemeOzetleri(db, [ana, alt]));
    const sip = kuyruk.find((x) => x.id === a.siparisId)!;
    assert.deepEqual(sip.satirlar.map((x) => x.stokKodu), [kodlar.get(alt)!.kod]);
    assert.notEqual(kodlar.get(alt)!.kod, kodlar.get(ana)!.kod);
  });

  // 3b-3b: sipariş emrin bileşenini alternatif karta geçirdiği için yolda da alternatif karttadır; ana kart için geliş yoktur.
  test('yolda alternatif kartta: alternatifle verilen sipariş alternatif kartın gelişidir, ana kartın değildir', async () => {
    const [ana, alt] = [await kart(), await kart()];
    const a = await siparisSatiri(ana, alt);
    const gelis = await s.malzemeGelisleriOku(o().vt, [ana, alt]);
    assert.deepEqual(gelis.map((x) => [x.malzemeNo, x.miktar]), [[alt, '10.0000']]);
    assert.deepEqual((await s.talepGelisleriOku(o().vt, a.talepId)).map((x) => x.malzemeNo), [alt]);
    assert.deepEqual((await s.terminKalemleriOku(o().vt)).filter((x) => x.talepId === a.talepId).map((x) => x.malzemeNo), [alt]);
  });

  test('mal kabul: ana kartla reddedilir (K2), onaydaki alternatif kartla reddedilir (B1 a), aktif alternatif kartla kabul; fiyat alternatif kartta', async () => {
    const ana = await kart();
    const alt = await kart('onayda');
    const a = await siparisSatiri(ana, alt);
    const r1 = await kabul(ana, a.satirId);
    assert.deepEqual([r1.durum, r1.govde.mesaj], [400, 'Sipariş satırı başka bir malzeme kartına ait; bu kartın sipariş satırını seçin.']);
    const r2 = await kabul(alt, a.satirId);
    assert.deepEqual([r2.durum, /kart kullanılabilir değil/.test(r2.govde.mesaj ?? '')], [422, true]);
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif' WHERE no = $1", [alt]);
    const r3 = await kabul(alt, a.satirId);
    assert.equal(r3.durum, 200, JSON.stringify(r3.govde));
    // Kabulden sonra satır kapanır, alternatif kartın yoldası düşer.
    assert.deepEqual(await s.malzemeGelisleriOku(o().vt, [ana, alt]), []);
    assert.deepEqual((await s.sonAlisFiyatlariOku(o().vt, [ana, alt])).map((x) => [x.malzemeNo, x.birimFiyat]), [[alt, '12.0000']]);
    assert.deepEqual((await s.ortalamaAlisFiyatlariOku(o().vt, [ana, alt])).map((x) => [x.malzemeNo, x.teslimSayisi]).sort(), [[ana, 0], [alt, 1]].sort());
    const teslimli = await s.teslimliMalzemeNolari(o().vt);
    assert.deepEqual([teslimli.includes(alt), teslimli.includes(ana)], [true, false]);
  });

  // Test T1: projenin yoldaki malı ve projenin sipariş birim fiyatı (proje ve emir maliyeti, para yolu) alternatif kartta.
  test('proje: yol satırı ve sipariş birim fiyatı alternatif kartta, ana kartta değil', async () => {
    const proje = (await o().sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.AOK1', 'Deneme proje', $1) RETURNING id", [yonetici]))!.id;
    const ana = await kart();
    const alt = await kart();
    const a = await siparisSatiri(ana, alt);
    await o().sahip.sorgu('UPDATE satin_alma_talep SET proje_id = $2 WHERE id = $1', [a.talepId, proje]);
    assert.deepEqual((await s.siparisYolSatirlari(o().vt, { projeIdler: [proje] })).map((x) => [x.satirId, x.malzemeNo]), [[a.satirId, alt]]);
    const r = await kabul(alt, a.satirId);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const f = await s.siparisBirimFiyatlariOku(o().vt, [], [proje], [ana, alt]);
    assert.deepEqual(f.map((x) => [x.hedef, x.hedefId, x.malzemeNo, x.tryBirimFiyati, x.teslimMiktari]), [['proje', proje, alt, '12.0000', '10.0000']]);
  });

  test('ters: alternatifsiz satırda mal kabul ana kartla, fiyat ana kartta (bugünkü davranış)', async () => {
    const ana = await kart();
    const d = await siparisSatiri(ana, null);
    const r = await kabul(ana, d.satirId);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual((await s.sonAlisFiyatlariOku(o().vt, [ana])).map((x) => x.malzemeNo), [ana]);
  });
});
