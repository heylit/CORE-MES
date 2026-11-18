import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { FirmaKodlariCevabi, FirmaKodu } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { firmaKoduSecimi, numaraAl } from './disari.ts';
import { ayarDegistir } from './servis.ts';

// 3399 a: firma kodu listesi, seçim kuralı, firma başına numara sayacı ve eski tek kodun taşınması. Kodlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const bosMu = () => Promise.resolve(false);

describe('ayarlar: firma kodları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yaz = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez }, payload });
  const ekle = (kod: string, varsayilan = false) => yaz('/firma-kodlari/ekle', { kod, ad: `Deneme ${kod}`, varsayilan });
  const liste = async (): Promise<FirmaKodu[]> => {
    const c = await app.inject({ method: 'GET', url: '/api/firma-kodlari', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as FirmaKodlariCevabi).firmaKodlari;
  };
  const bul = async (kod: string): Promise<FirmaKodu> => {
    const f = (await liste()).find((k) => k.kod === kod);
    assert.ok(f, kod);
    return f;
  };
  const duzenle = (f: FirmaKodu, yama: Partial<Pick<FirmaKodu, 'ad' | 'varsayilan' | 'aktif'>>) =>
    yaz(`/firma-kodlari/${String(f.id)}/duzenle`, { ad: f.ad, varsayilan: f.varsayilan, aktif: f.aktif, surum: f.surum, ...yama });

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_firma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'fk-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'fk-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM ayar');
    await vt().sorgu('DELETE FROM ayar_numara_sayaci');
  });

  test('liste boşken seçim boştur; ilk kod kendiliğinden varsayılan olur; biçim ve tekrar 400', async () => {
    assert.deepEqual(await liste(), []);
    assert.equal(await vt().tx((db) => firmaKoduSecimi(db, null, 'firmaKodu')), null);
    const c = await ekle('ORNA');
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((c.json() as FirmaKodu).varsayilan, true);
    for (const kod of ['A', 'ABCDEF', 'MM', 'HM', 'A-B', 'ÇA']) assert.equal((await ekle(kod)).statusCode, 400, kod);
    assert.equal((await ekle('orna')).statusCode, 409, 'küçük harf büyütülür; tekrar kod çakışmadır');
    assert.deepEqual((await liste()).map((k) => k.kod), ['ORNA']);
  });

  test('varsayılan tektir; kaldırılamaz ve pasif yapılamaz; kodun kendisi değişmez', async () => {
    assert.equal((await ekle('ORNB', true)).statusCode, 200);
    assert.deepEqual((await liste()).filter((k) => k.varsayilan).map((k) => k.kod), ['ORNB']);
    const b = await bul('ORNB');
    assert.equal((await duzenle(b, { aktif: false })).statusCode, 400);
    assert.equal((await duzenle(b, { varsayilan: false })).statusCode, 400);
    const a = await bul('ORNA');
    assert.equal((await duzenle(a, { varsayilan: true })).statusCode, 200);
    assert.deepEqual((await liste()).filter((k) => k.varsayilan).map((k) => k.kod), ['ORNA']);
    const b2 = await bul('ORNB');
    const p = await duzenle(b2, { aktif: false, ad: 'Deneme pasif' });
    assert.equal(p.statusCode, 200, p.body);
    assert.equal((await duzenle(b2, { aktif: true })).statusCode, 409, 'eski sürüm');
    const kodlu = await yaz(`/firma-kodlari/${String(b2.id)}/duzenle`, { kod: 'XYZ', ad: 'X', varsayilan: false, aktif: false, surum: b2.surum + 1 });
    assert.notEqual(kodlu.statusCode, 500, kodlu.body);
    assert.equal((await bul('ORNB')).kod, 'ORNB');
    assert.equal((await yaz('/firma-kodlari/99999/duzenle', { ad: 'X', varsayilan: false, aktif: true, surum: 1 })).statusCode, 404);
  });

  test('seçim: boş seçim varsayılandır; pasif kod yeni kayda seçilemez, kendi kaydında kalır; bilinmeyen kod 400', async () => {
    assert.equal(await vt().tx((db) => firmaKoduSecimi(db, null, 'firmaKodu')), 'ORNA');
    assert.equal(await vt().tx((db) => firmaKoduSecimi(db, 'orna', 'firmaKodu')), 'ORNA');
    await assert.rejects(vt().tx((db) => firmaKoduSecimi(db, 'ORNB', 'firmaKodu')), /aktif değil/);
    assert.equal(await vt().tx((db) => firmaKoduSecimi(db, 'ORNB', 'firmaKodu', 'ORNB')), 'ORNB');
    await assert.rejects(vt().tx((db) => firmaKoduSecimi(db, 'YOK', 'firmaKodu')), /aktif değil/);
  });

  test('{FIRMA}lı kalıpta her firma kendi sırasını yürütür; boş alan varsayılan koddur; {FIRMA}sız kalıp ortak sayaçtır', async () => {
    await vt().tx((db) => ayarDegistir(db, kisiId, 'siparisler.teklif-no', '{FIRMA}-TK-{SAYAC:3}'));
    const al = (FIRMA: string | null) => vt().tx((db) => numaraAl(db, 'siparisler.teklif-no', { alanlar: { FIRMA }, varMi: bosMu }));
    assert.equal(await al('ORNA'), 'ORNA-TK-001');
    assert.equal(await al('ORNA'), 'ORNA-TK-002');
    assert.equal(await al('ORNB'), 'ORNB-TK-001');
    assert.equal(await al(null), 'ORNA-TK-003', 'boş alan varsayılan kodu alır');
    const sip = (FIRMA: string) => vt().tx((db) => numaraAl(db, 'siparisler.siparis-no', { alanlar: { FIRMA }, varMi: bosMu }));
    const ilk = await sip('ORNA');
    const ikinci = await sip('ORNB');
    assert.equal(Number(ikinci.slice(-3)), Number(ilk.slice(-3)) + 1, '{FIRMA}sız kalıpta sayaç ortaktır');
  });

  test('teklif ve sipariş kalıbı en uzun kodla 16 karakteri geçerse kaydedilmez', async () => {
    await assert.rejects(vt().tx((db) => ayarDegistir(db, kisiId, 'siparisler.teklif-no', '{FIRMA}-TK-{YYYY}-{SAYAC:3}')), /16/);
    await assert.rejects(vt().tx((db) => ayarDegistir(db, kisiId, 'siparisler.siparis-no', '{FIRMA}-SS-{YYYY}-{SAYAC:3}')), /16/);
    assert.equal((await vt().tx((db) => ayarDegistir(db, kisiId, 'siparisler.teklif-no', '{FIRMA}-{YY}-{SAYAC:4}'))).deger, '{FIRMA}-{YY}-{SAYAC:4}');
  });

  test('okuma kayıt yazanlara açık, girişsiz 401', async () => {
    const c = await app.inject({ method: 'GET', url: '/api/firma-kodlari' });
    assert.equal(c.statusCode, 401);
    const y = await app.inject({ method: 'POST', url: '/api/firma-kodlari/ekle', payload: { kod: 'ORNC', ad: 'X', varsayilan: false } });
    assert.equal(y.statusCode, 401);
  });
});

// Eski tek kod (malzeme ayarı genel.firmaKodu) dolu kurulumda listeye ilk ve varsayılan satır olarak taşınır; sayaç ondan sürer.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TASIMA_GOCU = '_ayarlar_firma_kodlari.sql';

async function tasi(onek: string, firmaKodu: string | null, kurumAdi: string | null) {
  const ortam = await testSemasiAc(onek);
  const klasor = await mkdtemp(join(tmpdir(), `tmiv2-${onek}-`));
  try {
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(TASIMA_GOCU));
    assert.ok(goc, 'taşıma göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: onek, parola: PAROLA }));
    const genel = firmaKodu === null ? { onayAkisi: false } : { firmaKodu };
    await sahip.sorgu("INSERT INTO malzeme_katalog_ayari (anahtar, deger, guncelleyen_kisi_id) VALUES ('genel', $1, $2)", [genel, kisi]);
    if (kurumAdi !== null) {
      await sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('kabuk.kurum-adi', $1::jsonb, $2)", [JSON.stringify(kurumAdi), kisi]);
    }
    await sahip.sorgu("INSERT INTO ayar_numara_sayaci (anahtar, donem, son_sira) VALUES ('uretim-emirleri.emir-no', '2026-11', 41)");
    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const kodlar = await sahip.sorgu<{ kod: string; ad: string; varsayilan: boolean; aktif: boolean }>('SELECT kod, ad, varsayilan, aktif FROM ayar_firma_kodu');
    const sayac = await sahip.sorgu<{ firma_kodu: string; son_sira: number }>('SELECT firma_kodu, son_sira FROM ayar_numara_sayaci ORDER BY firma_kodu');
    const eski = await sahip.tek<{ d: Record<string, unknown> }>("SELECT deger AS d FROM malzeme_katalog_ayari WHERE anahtar = 'genel'");
    assert.deepEqual(eski?.d, genel, 'malzeme ayarı değişmez');
    return { kodlar, sayac };
  } finally {
    await rm(klasor, { recursive: true, force: true });
    await ortam.kaldir();
  }
}

describe('firma kodu taşıma göçü (gerçek PostgreSQL)', () => {
  test('eski kod varsayılan satır olur, adı firma adıdır; sayaç kod için aynen sürer, ortak satır kalır', async () => {
    const r = await tasi('fkgoc1', 'ORNA', 'Ornek Atolye');
    assert.deepEqual(r.kodlar, [{ kod: 'ORNA', ad: 'Ornek Atolye', varsayilan: true, aktif: true }]);
    assert.deepEqual(r.sayac, [{ firma_kodu: '', son_sira: 41 }, { firma_kodu: 'ORNA', son_sira: 41 }]);
  });

  test('firma adı yoksa ad koddur; eski kod yoksa ya da bozuksa liste boş kalır', async () => {
    assert.deepEqual((await tasi('fkgoc2', 'ORNA', null)).kodlar, [{ kod: 'ORNA', ad: 'ORNA', varsayilan: true, aktif: true }]);
    const uzun = `${'a'.repeat(79)} b`;
    assert.deepEqual((await tasi('fkgoc5', 'ORNA', uzun)).kodlar.map((k) => k.ad), ['a'.repeat(79)], '80. karakterde kesilen ad sonda boşluk bırakmaz');
    const bos = await tasi('fkgoc3', null, 'Ornek Atolye');
    assert.deepEqual(bos.kodlar, []);
    assert.deepEqual(bos.sayac, [{ firma_kodu: '', son_sira: 41 }]);
    assert.deepEqual((await tasi('fkgoc4', 'MM', null)).kodlar, []);
  });
});
