import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KartAlternatifleriCevabi, SetOnizlemeCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { setSayilariniTazele } from './alternatif/servis.ts';
import { kartinAlternatifKartlari } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 3572 a (dilim 1): kartta alternatif setleri, tek tek eklenen kartlar ve Önerilmesin; K4 önceliği ve K5 uyan sayısı
// (gerçek PostgreSQL, gerçek giriş, ORN- örnek veri).
describe('Malzemeler alternatif seti ve seçili kartlar (3572-1)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let okuyucu = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown) {
    const c = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return c.json() as { alan?: string; ayrinti?: { neden?: string } };
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedefRol);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }

  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>, durum = 'aktif', tur = 'hammadde'): Promise<number> => {
    sira += 1;
    const kimlik = `als-${String(sira)}`;
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, onaylama)
       VALUES ($1, $2, 'ORN-ALS-', $3, $4, $5, $6, $6, CASE WHEN $4 = 'aktif' THEN now() END) RETURNING no`,
      [kimlik, tur, sira, durum, JSON.stringify({ id: kimlik, com: { ad: `ORN ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  const cubuk = (grade: string, d: number, ek: Record<string, unknown> = {}) => ({ grade, form: 'cubuk', dims: { d, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' }, ...ek });
  const bolum = (no: number) => tamam<KartAlternatifleriCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/kart/${String(no)}`);
  const setGovdesi = (anaNo: number, ek: Record<string, unknown> = {}) => ({
    anaNo, ad: 'ORN Kalın çubuk', tur: 'tam', kullanimYerleri: ['talep', 'satin_alma', 'uretim'], notu: null, genisOnay: false,
    nitelikler: [
      { nitelik: 'form', degerler: ['cubuk'], alt: null, ust: null },
      { nitelik: 'd', degerler: null, alt: 40, ust: 46 },
      { nitelik: 'kalite', degerler: ['6082', '6061'], alt: null, ust: null },
    ],
    ...ek,
  });
  const defter = (tablo: string, anahtar: Record<string, unknown>) => vt().sorgu<{ islem: string; alanlar: Record<string, { eski: unknown; yeni: unknown }> }>(
    'SELECT islem, alanlar FROM denetim_degisiklik WHERE tablo = $1 AND anahtar @> $2::jsonb ORDER BY id', [tablo, JSON.stringify(anahtar)]);

  before(async () => {
    ortam = await testVeritabaniKur('malzemealternatifseti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const ilk = await girisYap('als-yonetici', 'yonetici');
    yonetici = ilk.cerez;
    yoneticiId = ilk.id;
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('als_okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'als_okuyucu'");
    okuyucu = (await girisYap('als-okuyucu', 'als_okuyucu', ilk.id)).cerez;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-ALS-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ALS-1: set kaydı; okuyan yazamaz, hammadde dışında set yok, alanlar doğrulanır, uyan kartlar sayılır, sürümle değişir ve kalkar', async () => {
    const ana = await kartAc(cubuk('6082', 40));
    const uyan1 = await kartAc(cubuk('6082', 42));
    const uyan2 = await kartAc(cubuk('6061', 46, { stds: ['EN 755-2'] }));
    await kartAc(cubuk('6082', 50));
    await kartAc(cubuk('6060', 42));
    await kartAc(cubuk('6082', 44), 'taslak');
    const sarf = await kartAc({}, 'aktif', 'sarf');
    const yol = '/malzeme-alternatifleri/setler/kaydet';
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', yol, setGovdesi(ana));
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, setGovdesi(sarf))).alan, 'anaNo');
    const bozuk = setGovdesi(ana, { nitelikler: [{ nitelik: 'd', degerler: null, alt: 46, ust: 40 }] });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, bozuk)).alan, 'nitelikler.d');
    const iki = setGovdesi(ana, { nitelikler: [{ nitelik: 'd', degerler: null, alt: 40, ust: null }, { nitelik: 'd', degerler: null, alt: null, ust: 50 }] });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, iki)).alan, 'nitelikler');
    // Canlı sayım kaydetmeden aynı kuralı uygular.
    const on = await tamam<SetOnizlemeCevabi>(okuyucu, 'GET',
      `/malzeme-alternatifleri/kart/${String(ana)}/set-onizleme?nitelikler=${encodeURIComponent(JSON.stringify(setGovdesi(ana).nitelikler))}`);
    assert.deepEqual([on.uyanSayisi, on.sartli], [2, false]);
    const k = await tamam<{ id: number; tur: string; uyanSayisi: number }>(yonetici, 'POST', yol, setGovdesi(ana));
    assert.deepEqual([k.tur, k.uyanSayisi], ['tam', 2]);
    let b = await bolum(ana);
    assert.deepEqual(b.setler.map((t) => [t.id, t.uyanSayisi, t.uyanlar.map((u) => u.no).sort((x, y) => x - y)]), [[k.id, 2, [uyan1, uyan2].sort((x, y) => x - y)]]);
    assert.equal(b.setler[0]!.uyanlar.find((u) => u.no === uyan1)?.neden, 'd 42 · kalite 6082');
    assert.equal(b.setler[0]!.uyanlar[0]!.yeni, true);
    // Standart: kartın standartlarından biri listede olmalı.
    const std = setGovdesi(ana, { nitelikler: [...setGovdesi(ana).nitelikler, { nitelik: 'standart', degerler: ['EN 755-2'], alt: null, ust: null }], surum: 1, id: k.id });
    assert.equal((await tamam<{ uyanSayisi: number }>(yonetici, 'POST', yol, std)).uyanSayisi, 1);
    const eski = await ret(409, 'CAKISMA', yonetici, 'POST', yol, { ...std, surum: 1 });
    assert.equal(eski.ayrinti?.neden, 'eski-surum');
    b = await bolum(ana);
    assert.deepEqual([b.setler[0]!.surum, b.setler[0]!.nitelikler.map((n) => n.nitelik)], [2, ['form', 'kalite', 'standart', 'd']]);
    await ret(409, 'CAKISMA', yonetici, 'POST', `/malzeme-alternatifleri/setler/${String(k.id)}/kaldir`, { surum: 1 });
    await tamam(yonetici, 'POST', `/malzeme-alternatifleri/setler/${String(k.id)}/kaldir`, { surum: 2 });
    assert.deepEqual((await bolum(ana)).setler, []);
    // Geçmiş: ekleme, değişiklik ve kaldırma ana karta göre bulunur.
    assert.deepEqual((await defter('malzeme_alternatif_seti', { ana_no: ana })).map((d) => d.islem), ['ekle', 'guncelle', 'sil']);
    assert.ok((await defter('malzeme_alternatif_seti_niteligi', { ana_no: ana, set_id: k.id })).some((d) => d.islem === 'ekle' && 'degerler' in d.alanlar));
  });

  test('ALS-2 (K5, Z4): sonradan açılan kart kendiliğinden girer ve sayı izi Geçmiş\'e düşer; eşik üstü işaret ister; şartlı değer seti şartlı yapar', async () => {
    const ana = await kartAc(cubuk('6082', 60));
    const yol = '/malzeme-alternatifleri/setler/kaydet';
    const dar = setGovdesi(ana, { nitelikler: [{ nitelik: 'd', degerler: null, alt: 61, ust: 61 }] });
    const k = await tamam<{ id: number; uyanSayisi: number }>(yonetici, 'POST', yol, dar);
    assert.equal(k.uyanSayisi, 0, '0 kartlı set kaydedilir');
    const yeni = await kartAc(cubuk('6061', 61));
    await vt().tx((db) => setSayilariniTazele(db));
    assert.deepEqual((await bolum(ana)).setler[0]!.uyanlar.map((u) => u.no), [yeni]);
    const iz = (await defter('malzeme_alternatif_seti', { ana_no: ana, id: k.id })).at(-1)!;
    assert.deepEqual([iz.islem, iz.alanlar['uyan_sayi']], ['guncelle', { eski: 0, yeni: 1 }]);
    // Geniş set: 50'den çok kart işaretsiz reddedilir.
    for (let i = 0; i < 51; i += 1) await kartAc({ grade: 'ORN-GENIS', form: 'kare', dims: { a: 20, l: 3000 } });
    const genis = setGovdesi(ana, { nitelikler: [{ nitelik: 'kalite', degerler: ['ORN-GENIS'], alt: null, ust: null }] });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, genis)).alan, 'genisOnay');
    assert.equal((await tamam<{ uyanSayisi: number }>(yonetici, 'POST', yol, { ...genis, genisOnay: true })).uyanSayisi, 51);
    // Z4: kartın şartlı muadili işaretliyse set şartlı kaydedilir.
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kalite-muadilleri/kaydet', { kalite: '6082', muadil: 'ORN-6005', tur: 'sartli', notu: null });
    const sartli = setGovdesi(ana, { nitelikler: [{ nitelik: 'kalite', degerler: ['ORN-6005'], alt: null, ust: null }] });
    assert.equal((await tamam<{ tur: string }>(yonetici, 'POST', yol, sartli)).tur, 'sartli');
  });

  test('ALS-3 (K4): Önerilmesin her şeyden ağır, tekil satır setin türünü ve yerini ezer, set kuraldan geleni ezer; sıra ve geri alma', async () => {
    const ana = await kartAc(cubuk('6082', 80));
    const kuraldan = await kartAc(cubuk('6082', 80, { opts: { durum: 'T6', yuzey: 'Ham' } }));
    const setli = await kartAc(cubuk('6061', 84));
    const tekil = await kartAc(cubuk('6061', 85));
    const disari = await kartAc({ grade: '7075', form: 'lama', dims: { a: 80, b: 10, l: 3000 } });
    const pasif = await kartAc(cubuk('6082', 81), 'pasif');
    const esdeger = await kartAc(cubuk('6082', 80));
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/esdeger/bagla', { kartNo: ana, esdegerNo: esdeger });
    const s = await tamam<{ id: number }>(yonetici, 'POST', '/malzeme-alternatifleri/setler/kaydet', setGovdesi(ana, {
      tur: 'ust', kullanimYerleri: ['talep', 'uretim'], nitelikler: [{ nitelik: 'd', degerler: null, alt: 84, ust: 86 }],
    }));
    const secYol = '/malzeme-alternatifleri/secili/kaydet';
    const sec = (no: number, ek = {}) => ({ anaNo: ana, alternatifNo: no, tur: 'tam', kullanimYerleri: ['talep'], notu: null, ...ek });
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', secYol, sec(disari));
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', secYol, sec(ana))).alan, 'alternatifNo');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', secYol, sec(esdeger))).alan, 'alternatifNo');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', secYol, sec(pasif))).alan, 'alternatifNo');
    // K1: sınır dışı (başka form) kart tanım yetkisiyle eklenir.
    await tamam(yonetici, 'POST', secYol, sec(disari, { tur: 'sartli', kullanimYerleri: ['talep', 'satin_alma'], notu: 'ORN yalnız fikstür' }));
    await tamam(yonetici, 'POST', secYol, sec(tekil, { tur: 'tam', kullanimYerleri: ['satin_alma'] }));
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', secYol, sec(tekil))).alan, 'alternatifNo');
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/secili/onerilmesin', { anaNo: ana, alternatifNo: kuraldan, neden: 'ORN yüzey sertliği tutmadı' });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', '/malzeme-alternatifleri/secili/onerilmesin', { anaNo: ana, alternatifNo: esdeger, neden: 'x' })).alan, 'alternatifNo');

    const oku = (kullanimYeri: 'talep' | 'satin_alma' | 'uretim') => vt().tx((db) => kartinAlternatifKartlari(db, ana, { kullanimYeri }));
    const ozet = async (y: 'talep' | 'satin_alma' | 'uretim') => (await oku(y)).map((k) => [k.no, k.tur, k.sonuc, k.muadilTuru]);
    // Talep: eşdeğer; set (sıra 0) setli kartı üst türüyle getirir, tekil kart talepte geçerli değil ve sette de gelmez; elle kart şartlı.
    assert.deepEqual(await ozet('talep'), [[esdeger, 'esdeger', 'ayni', null], [setli, 'set', 'icinde', 'ust'], [disari, 'secili', 'sartli', 'sartli']]);
    // Satın alma: set geçerli değil; tekil kart kendi türüyle; önerilmeyen kuraldan gelen hiç yok.
    assert.deepEqual(await ozet('satin_alma'), [[esdeger, 'esdeger', 'ayni', null], [disari, 'secili', 'sartli', 'sartli'], [tekil, 'secili', 'icinde', 'tam']]);
    assert.ok(!(await oku('uretim')).some((k) => k.no === kuraldan || k.no === tekil));

    let b = await bolum(ana);
    assert.deepEqual(b.secili.map((x) => [x.alternatifNo, x.onerilmez, x.setler, x.kuraldan]), [
      [disari, false, [], false], [tekil, false, [s.id], true], [kuraldan, true, [], true],
    ]);
    assert.deepEqual(b.setler[0]!.uyanlar.map((u) => [u.no, u.durum]), [[setli, 'gecer'], [tekil, 'tekil']]);
    // Sıra: gelen liste bütün öğeleri taşımalı; tekil kart sete göre öne alınınca talepte önce gelir.
    await ret(409, 'CAKISMA', yonetici, 'POST', '/malzeme-alternatifleri/sira', { anaNo: ana, ogeler: [{ tur: 'set', no: s.id }] });
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/sira', { anaNo: ana, ogeler: [{ tur: 'kart', no: disari }, { tur: 'kart', no: tekil }, { tur: 'set', no: s.id }] });
    assert.deepEqual((await oku('talep')).map((k) => k.no), [esdeger, disari, setli]);
    // Geri al: önerilmeyen kart yine kuraldan gelir; listeden kaldırılan tekil kart setten gelir.
    b = await bolum(ana);
    const surumu = (no: number) => b.secili.find((x) => x.alternatifNo === no)!.surum;
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/secili/kaldir', { anaNo: ana, alternatifNo: kuraldan, surum: surumu(kuraldan) });
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/secili/kaldir', { anaNo: ana, alternatifNo: tekil, surum: surumu(tekil) });
    await ret(404, 'BULUNAMADI', yonetici, 'POST', '/malzeme-alternatifleri/secili/kaldir', { anaNo: ana, alternatifNo: tekil, surum: 1 });
    const son = await oku('uretim');
    assert.deepEqual(son.map((k) => [k.no, k.tur]), [[esdeger, 'esdeger'], [setli, 'set'], [tekil, 'set'], [kuraldan, 'alternatif']]);
    assert.ok((await defter('malzeme_secili_alternatif', { ana_no: ana })).some((d) => d.islem === 'sil' && 'onerilmez' in d.alanlar));
  });

  test('ALS-4: tablo kısıtları; önerilmeyen satırda tür yok ve neden var, kart kendisinin alternatifi olamaz', async () => {
    const ana = await kartAc(cubuk('6082', 90));
    const alt = await kartAc(cubuk('6082', 91));
    const ekle = (onerilmez: boolean, tur: string | null, notu: string | null, a = alt) => ortam!.sahip.sorgu(
      `INSERT INTO malzeme_secili_alternatif (ana_no, alternatif_no, onerilmez, tur, sira, kullanim_yerleri, notu, guncelleyen_kisi_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [ana, a, onerilmez, tur, tur === null ? null : 0, tur === null ? null : ['talep'], notu, yoneticiId]);
    await assert.rejects(ekle(true, 'tam', 'x'), /malzeme_secili_alternatif_bicim/);
    await assert.rejects(ekle(true, null, null), /malzeme_secili_alternatif_bicim/);
    await assert.rejects(ekle(false, 'tam', null, ana), /malzeme_secili_alternatif_kendisi/);
    await ekle(true, null, 'ORN neden');
    const set = (await ortam!.sahip.tek<{ id: number }>(`INSERT INTO malzeme_alternatif_seti (ana_no, ad, tur, sira, kullanim_yerleri, guncelleyen_kisi_id)
      VALUES ($1, 'ORN', 'tam', 0, ARRAY['talep'], $2) RETURNING id`, [ana, yoneticiId]))!.id;
    await assert.rejects(ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, ana_no, nitelik, degerler) VALUES ($1, $2, 'd', ARRAY['x'])`, [set, ana]), /malzeme_alternatif_seti_niteligi_bicim/);
    await assert.rejects(ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, ana_no, nitelik, alt, ust) VALUES ($1, $2, 'd', 5, 4)`, [set, ana]), /malzeme_alternatif_seti_niteligi_sira/);
    await assert.rejects(ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti (ana_no, ad, tur, sira, kullanim_yerleri, guncelleyen_kisi_id)
      VALUES ($1, 'ORN', 'tam', 0, ARRAY['depo'], $2)`, [ana, yoneticiId]), /malzeme_alternatif_seti_yerler/);
  });
  test('ALS-3593: Birebir ve Pay ana kartı izler, işlem birebir; eski biçim geçer, bozuk kip reddedilir; kopya aynı form ve ailede', async () => {
    const ana = await kartAc(cubuk('6082', 120));
    const uyan = await kartAc(cubuk('6082', 122));
    await kartAc(cubuk('6082', 123, { opts: { durum: 'T6', yuzey: 'Ham', islem: ['Eloksal'] } }));
    await kartAc(cubuk('6061', 121));
    const birebir = (nitelik: string) => ({ nitelik, kip: 'birebir', degerler: null, alt: null, ust: null, payAlt: null, payUst: null });
    const govde = setGovdesi(ana, { ad: 'ORN AK-1', nitelikler: [
      birebir('kalite'), birebir('islem'), { nitelik: 'd', kip: 'pay', degerler: null, alt: null, ust: null, payAlt: 0, payUst: 5 },
    ] });
    const k = await tamam<{ id: number; uyanSayisi: number }>(yonetici, 'POST', '/malzeme-alternatifleri/setler/kaydet', govde);
    assert.equal(k.uyanSayisi, 1);
    let b = await bolum(ana);
    assert.deepEqual(b.setler[0]!.uyanlar.map((u) => u.no), [uyan]);
    assert.deepEqual(b.setler[0]!.nitelikler.map((n) => [n.nitelik, n.kip, n.payAlt, n.payUst]), [['kalite', 'birebir', null, null], ['islem', 'birebir', null, null], ['d', 'pay', 0, 5]]);
    // Ana kartın çapı değişince Pay yeni çapa göre çözülür (124-129): eloksallı 123 de, 122 de dışarıda kalır.
    await ortam!.sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{dims,d}', '124') WHERE no = $1`, [ana]);
    b = await bolum(ana);
    assert.equal(b.setler[0]!.uyanSayisi, 0);
    // Göç yalnız genişletir: kipsiz eski satır geçer; birebir satırda değer, payda eksik uç reddedilir.
    await ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, ana_no, nitelik, degerler) VALUES ($1, $2, 'yuzey', ARRAY['Ham'])`, [k.id, ana]);
    await assert.rejects(ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, ana_no, nitelik, kip, degerler) VALUES ($1, $2, 'durum', 'birebir', ARRAY['T6'])`, [k.id, ana]),
      /malzeme_alternatif_seti_niteligi_bicim/);
    await assert.rejects(ortam!.sahip.sorgu(`INSERT INTO malzeme_alternatif_seti_niteligi (set_id, ana_no, nitelik, kip, pay_alt) VALUES ($1, $2, 'l', 'pay', 1)`, [k.id, ana]),
      /malzeme_alternatif_seti_niteligi_bicim/);
    const bozuk = setGovdesi(ana, { nitelikler: [{ nitelik: 'kalite', kip: 'birebir', degerler: ['6082'], alt: null, ust: null }] });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', '/malzeme-alternatifleri/setler/kaydet', bozuk)).alan, 'nitelikler.kalite');
    // Kopya: aynı form ve ailedeki karta açılır, Pay hedefin çapını izler; başka formdaki kart reddedilir, okuyan kopyalayamaz.
    const hedef = await kartAc(cubuk('6082', 140));
    const hedefUyan = await kartAc(cubuk('6082', 143));
    const lama = await kartAc({ grade: '6082', form: 'lama', dims: { a: 20, b: 60, l: 3000 }, opts: { durum: 'T6' } });
    const yol = `/malzeme-alternatifleri/setler/${String(k.id)}/kopyala`;
    const surum = (await bolum(ana)).setler[0]!.surum;
    const h = (no: number, s = 1) => ({ no, surum: s });
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', yol, { surum, hedefler: [h(hedef)], genisOnay: false });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { surum, hedefler: [h(hedef), h(lama)], genisOnay: false })).alan, 'hedefler');
    // Kaynak ya da hedef kart okunduktan sonra değiştiyse hiçbir şey yazılmaz (S8).
    await ret(409, 'CAKISMA', yonetici, 'POST', yol, { surum: surum + 1, hedefler: [h(hedef)], genisOnay: false });
    await ret(409, 'CAKISMA', yonetici, 'POST', yol, { surum, hedefler: [h(hedefUyan), h(hedef, 9)], genisOnay: false });
    assert.deepEqual((await bolum(hedef)).setler, []);
    assert.deepEqual((await bolum(hedefUyan)).setler, []);
    const c = await tamam<{ kopyalar: { hedefNo: number; uyanSayisi: number }[] }>(yonetici, 'POST', yol, { surum, hedefler: [h(hedef)], genisOnay: false });
    assert.deepEqual(c.kopyalar.map((x) => [x.hedefNo, x.uyanSayisi]), [[hedef, 1]]);
    const hb = await bolum(hedef);
    assert.deepEqual([hb.setler[0]!.ad, hb.setler[0]!.uyanlar.map((u) => u.no)], ['ORN AK-1', [hedefUyan]]);
    // Risk K1: Aralık mutlak mm taşır; hedefin çapı aralık dışındaysa kopya reddedilir. K2: tür hedefin kabul sınırına göre yeniden belirlenir.
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/siniri/kaydet',
      { kapsamTuru: 'kart', kapsam: String(uyan), nitelik: 'kalite', degerler: [{ deger: 'ORN-6007', tur: 'sartli' }], alt: null, ust: null });
    const ak2 = await tamam<{ id: number; tur: string }>(yonetici, 'POST', '/malzeme-alternatifleri/setler/kaydet', setGovdesi(ana, { ad: 'ORN AK-2', nitelikler: [
      { nitelik: 'kalite', degerler: ['ORN-6007'], alt: null, ust: null }, { nitelik: 'd', kip: 'aralik', degerler: null, alt: 120, ust: 126 },
    ] }));
    assert.equal(ak2.tur, 'tam');
    const s2 = (await bolum(ana)).setler.find((x) => x.id === ak2.id)!.surum;
    const y2 = `/malzeme-alternatifleri/setler/${String(ak2.id)}/kopyala`;
    const disinda = await ret(400, 'DOGRULAMA', yonetici, 'POST', y2, { surum: s2, hedefler: [h(uyan), h(hedefUyan)], genisOnay: false }) as { mesaj?: string };
    assert.match(disinda.mesaj ?? '', /Ø 143 aralığın \(120–126\) dışında/);
    assert.deepEqual((await bolum(uyan)).setler, []);
    await tamam(yonetici, 'POST', y2, { surum: s2, hedefler: [h(uyan)], genisOnay: false });
    assert.equal((await bolum(uyan)).setler.find((x) => x.ad === 'ORN AK-2')!.tur, 'sartli');
  });
});
