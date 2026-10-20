import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Firma, FirmaAyrintiCevabi, FirmaCevabi, FirmaEkleGovdesi, FirmaListesiCevabi, FirmaSecimCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kurGetir, kurlar } from '../finans/disari.ts';
import { firmaAdlari, firmaAra, firmaOzeti, firmaOzetleri, firmaVarMi, musteriSiniflari } from './disari.ts';

// Örnek firmalar uydurmadır; gerçek ad, vergi numarası ya da adres yoktur.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
const kodu = (c: Cevap): unknown => (c.govde as { kod?: unknown } | undefined)?.kod;
const alani = (c: Cevap): unknown => (c.govde as { alan?: unknown } | undefined)?.alan;

// FNS-48: firma uçlarında ve disari.ts'te olabilecek alanların tamamı; bakiye, risk ya da tutar yok.
const FIRMA_ALANLARI = ['ad', 'adres', 'aktif', 'boylam', 'ePosta', 'enlem', 'fason', 'guncelleme', 'id', 'il', 'ilce', 'kod', 'logoCariKodu', 'logoGonderimDurumu', 'logoKayitNo', 'musteriSinifi', 'olusturma', 'paraBirimi', 'postaKodu', 'surum', 'telefon', 'tur', 'ulkeKodu', 'vadeGunu', 'vergiDairesi', 'vergiNo'];
const RAKAM_ADI = /bakiye|tutar|risk|borc|alacak|toplam|limit/i;
const LISTE_EKI = ['adresSayisi', 'koordinatli'];

describe('müşteri ve tedarikçi firma kartı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazanId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik?: string | null): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (kim !== null) basliklar['cookie'] = cerez.get(kim) ?? '';
    if (kimlik !== null && kimlik !== undefined) basliklar[ISTEK_KIMLIGI_BASLIGI] = kimlik;
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  // Ekleme tekrar korumalıdır: her çağrı yeni istek kimliği taşır.
  const ekle = (kim: string, govde: unknown, kimlik: string | null = randomUUID()) => istek<FirmaCevabi>(kim, 'POST', '/musteri-tedarikci/firmalar/ekle', govde, kimlik);
  const getir = (kim: string, id: number) => istek<FirmaCevabi>(kim, 'GET', `/musteri-tedarikci/firmalar/${id}`);

  let sayac = 0;
  const yeniFirma = (ek: Partial<FirmaEkleGovdesi> = {}): FirmaEkleGovdesi => ({ ad: `Deneme Firma ${(sayac += 1)}`, tur: 'musteri', ...ek });
  async function firmaKur(ek: Partial<FirmaEkleGovdesi> = {}): Promise<Firma> {
    const c = await ekle('yazan', yeniFirma(ek));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.firma;
  }
  const firmaSayisi = async (): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_firma'))?.n ?? -1;
  const kisitAdi = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };

  async function girisliKisi(kullaniciAdi: string, rolKodu: string, islemler: string[]): Promise<number> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    const id = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
      return kisi;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('mtfirma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Rol x işlem satırları teslimle girmez: test kendi geçici rollerini kurar.
    await girisliKisi('rolsuz', 'gecici_rolsuz', ['sayfa.finans']);
    await girisliKisi('okuyan', 'gecici_firma_oku', ['sayfa.finans', 'musteri-tedarikci.oku']);
    yazanId = await girisliKisi('yazan', 'gecici_firma_yaz', ['sayfa.finans', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: oturumsuz istek 401, firma işlemi olmayan 403 alır; musteri-tedarikci.oku okur', async () => {
    const f = await firmaKur();
    assert.equal((await istek(null, 'GET', '/musteri-tedarikci/firmalar')).durum, 401);
    assert.equal((await istek('rolsuz', 'GET', '/musteri-tedarikci/firmalar')).durum, 403);
    assert.equal((await istek('rolsuz', 'GET', `/musteri-tedarikci/firmalar/${f.id}`)).durum, 403);
    assert.equal((await istek('rolsuz', 'GET', '/musteri-tedarikci/firmalar/secim')).durum, 403);
    assert.equal((await istek('okuyan', 'GET', '/musteri-tedarikci/firmalar')).durum, 200);
    assert.equal((await getir('okuyan', f.id)).durum, 200);
    assert.equal((await istek('okuyan', 'GET', '/musteri-tedarikci/firmalar/secim')).durum, 200);
  });

  test('yetki: her firma yazma ucu musteri-tedarikci.yaz ister; okuyan 403 alır ve kayıt değişmez, yazan yazar', async () => {
    const f = await firmaKur();
    const once = await firmaSayisi();
    assert.equal((await ekle('okuyan', yeniFirma())).durum, 403);
    assert.equal((await ekle('rolsuz', yeniFirma())).durum, 403);
    assert.equal(await firmaSayisi(), once);
    for (const [yol, govde] of [
      [`/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...yeniFirma({ ad: 'Değişmemeli' }), surum: f.surum }],
      [`/finans/firmalar/${f.id}/pasif`, { surum: f.surum }],
      [`/finans/firmalar/${f.id}/aktif`, { surum: f.surum }],
    ] as const) {
      assert.equal((await istek('okuyan', 'POST', yol, govde)).durum, 403, yol);
    }
    const sonra = (await getir('yazan', f.id)).govde.firma;
    assert.equal(sonra.ad, f.ad);
    assert.equal(sonra.surum, f.surum);
    assert.equal(sonra.aktif, true);
    const g = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...yeniFirma({ ad: 'Yeni Ad Deneme' }), surum: f.surum });
    assert.equal(g.durum, 200);
    assert.equal(g.govde.firma.ad, 'Yeni Ad Deneme');
  });

  test('FNS-43: firma adı boş olamaz; uçta 400, veritabanında kısıt; dolu ad kabul edilir', async () => {
    const bos = await ekle('yazan', yeniFirma({ ad: '   ' }));
    assert.equal(bos.durum, 400);
    assert.equal(alani(bos), 'ad');
    assert.equal(await kisitAdi("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES (' ', 'musteri', $1)", [yazanId]), 'musteri_tedarikci_firma_ad_bos');
    assert.equal((await ekle('yazan', yeniFirma({ ad: 'Dolu Ad Deneme' }))).durum, 200);
  });

  test('FNS-44: kod büyük/küçük harf duyarsız tekildir; boş kod sınırsız tekrarlanır', async () => {
    assert.equal((await ekle('yazan', yeniFirma({ kod: 'DNM-KOD-1' }))).durum, 200);
    const ayni = await ekle('yazan', yeniFirma({ kod: 'dnm-kod-1' }));
    assert.equal(ayni.durum, 409);
    assert.equal(kodu(ayni), 'CAKISMA');
    assert.equal(alani(ayni), 'kod');
    assert.equal((await ekle('yazan', yeniFirma({ kod: null }))).durum, 200);
    assert.equal((await ekle('yazan', yeniFirma({ kod: '' }))).durum, 200);
  });

  test('FNS-44: vergi numarası, Logo cari kodu ve Logo kayıt numarası doluysa tekildir', async () => {
    assert.equal((await ekle('yazan', yeniFirma({ vergiNo: '1000000001' }))).durum, 200);
    const vergi = await ekle('yazan', yeniFirma({ vergiNo: '1000000001' }));
    assert.equal(vergi.durum, 409);
    assert.equal(alani(vergi), 'vergiNo');
    assert.equal((await ekle('yazan', yeniFirma({ logoCariKodu: 'L-CARI-1' }))).durum, 200);
    const logo = await ekle('yazan', yeniFirma({ logoCariKodu: 'l-cari-1' }));
    assert.equal(logo.durum, 409);
    assert.equal(alani(logo), 'logoCariKodu');
    const a = await firmaKur();
    const b = await firmaKur();
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_kayit_no = 9001 WHERE id = $1', [a.id]);
    assert.equal(await kisitAdi('UPDATE musteri_tedarikci_firma SET logo_kayit_no = 9001 WHERE id = $1', [b.id]), 'musteri_tedarikci_firma_logo_kayit_no_tekil');
    assert.equal(await kisitAdi('UPDATE musteri_tedarikci_firma SET logo_kayit_no = 9002 WHERE id = $1', [b.id]), null);
  });

  test('D-9: vergi numarası biçimi yalnız TR firmasında denetlenir; yabancı firmada serbest, 30 karakter sınırlı', async () => {
    const kisa = await ekle('yazan', yeniFirma({ vergiNo: '12345' }));
    assert.equal(kisa.durum, 400);
    assert.equal(alani(kisa), 'vergiNo');
    assert.equal((await ekle('yazan', yeniFirma({ vergiNo: '20000000002' }))).durum, 200);
    assert.equal((await ekle('yazan', yeniFirma({ ulkeKodu: 'DE', vergiNo: 'DE 12345 ABC' }))).durum, 200);
    assert.equal((await ekle('yazan', yeniFirma({ ulkeKodu: 'DE', vergiNo: 'X'.repeat(31) }))).durum, 400);
    assert.equal(await kisitAdi("INSERT INTO musteri_tedarikci_firma (ad, tur, ulke_kodu, vergi_no, olusturan_id) VALUES ('Kisit Deneme', 'musteri', 'TR', 'ABC', $1)", [yazanId]),
      'musteri_tedarikci_firma_vergi_no_bicim');
  });

  test('FNS-45: Logo\'ya gönderilmiş firmanın kodu ve Logo cari kodu değişmez; öteki alanları değişir', async () => {
    const f = await firmaKur({ kod: 'DNM-LOGO-1', logoCariKodu: 'LC-LOGO-1' });
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_kayit_no = 7001 WHERE id = $1', [f.id]);
    const guncel = (await getir('yazan', f.id)).govde.firma;
    const kodDegis = await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...guncel, kod: 'DNM-LOGO-2', surum: guncel.surum });
    assert.equal(kodDegis.durum, 422);
    const cariDegis = await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...guncel, logoCariKodu: 'LC-LOGO-2', surum: guncel.surum });
    assert.equal(cariDegis.durum, 422);
    assert.equal((await getir('yazan', f.id)).govde.firma.kod, 'DNM-LOGO-1');
    const adDegis = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...guncel, ad: 'Logo Firma Yeni Ad', surum: guncel.surum });
    assert.equal(adDegis.durum, 200);
    assert.equal(adDegis.govde.firma.ad, 'Logo Firma Yeni Ad');
    assert.equal(await kisitAdi("UPDATE musteri_tedarikci_firma SET kod = 'BASKA' WHERE id = $1", [f.id]), 'musteri_tedarikci_firma_logo_kilidi');
  });

  test('FNS-47: firma silinmez; silme ucu yoktur ve veritabanı silmeyi reddeder', async () => {
    const f = await firmaKur();
    assert.equal((await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/sil`, { surum: f.surum })).durum, 404);
    assert.equal(await kisitAdi('DELETE FROM musteri_tedarikci_firma WHERE id = $1', [f.id]), 'musteri_tedarikci_firma_silinmez');
    assert.equal((await getir('yazan', f.id)).durum, 200);
  });

  test('FNS-53: pasife alma ve aktif yapma yalnız ters durumdan geçer; aynı duruma geçiş 422', async () => {
    const f = await firmaKur();
    assert.equal((await istek('yazan', 'POST', `/finans/firmalar/${f.id}/aktif`, { surum: f.surum })).durum, 422);
    const p = await istek<FirmaCevabi>('yazan', 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: f.surum });
    assert.equal(p.durum, 200);
    assert.equal(p.govde.firma.aktif, false);
    assert.equal((await istek('yazan', 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: p.govde.firma.surum })).durum, 422);
    const a = await istek<FirmaCevabi>('yazan', 'POST', `/finans/firmalar/${f.id}/aktif`, { surum: p.govde.firma.surum });
    assert.equal(a.durum, 200);
    assert.equal(a.govde.firma.aktif, true);
  });

  test('FNS-39: eski sürümle güncelleme ve durum değişikliği 409 alır, kayıt değişmez; güncel sürüm geçer', async () => {
    const f = await firmaKur();
    const ilk = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...yeniFirma({ ad: 'Birinci Yazan' }), surum: f.surum });
    assert.equal(ilk.durum, 200);
    const ikinci = await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...yeniFirma({ ad: 'İkinci Yazan' }), surum: f.surum });
    assert.equal(ikinci.durum, 409);
    assert.equal((ikinci.govde as { ayrinti?: { neden?: string } }).ayrinti?.neden, 'eski-surum');
    assert.equal((await istek('yazan', 'POST', `/finans/firmalar/${f.id}/pasif`, { surum: f.surum })).durum, 409);
    const son = (await getir('yazan', f.id)).govde.firma;
    assert.equal(son.ad, 'Birinci Yazan');
    assert.equal(son.aktif, true);
  });

  test('FNS-38: açan ve zaman sunucudan yazılır; gövdedeki açan, zaman, Logo numarası ve durumu yok sayılır', async () => {
    const c = await ekle('yazan', { ...yeniFirma(), olusturma: '2000-01-01T00:00:00Z', olusturanId: yoneticiId, logoKayitNo: 5, logoGonderimDurumu: 'gonderildi', id: 1, aktif: false });
    assert.equal(c.durum, 200);
    const satir = await vt().tek<{ olusturan_id: number; yeni: boolean; logo_kayit_no: number | null; logo_gonderim_durumu: string | null; aktif: boolean }>(
      "SELECT olusturan_id, olusturma > now() - interval '1 minute' AS yeni, logo_kayit_no, logo_gonderim_durumu, aktif FROM musteri_tedarikci_firma WHERE id = $1", [c.govde.firma.id]);
    assert.deepEqual(satir, { olusturan_id: yazanId, yeni: true, logo_kayit_no: null, logo_gonderim_durumu: null, aktif: true });
    assert.equal(await kisitAdi('UPDATE musteri_tedarikci_firma SET olusturan_id = $2 WHERE id = $1', [c.govde.firma.id, yoneticiId]), 'musteri_tedarikci_firma_acilis_degismez');
  });

  test('FNS-40: aynı istek kimliğiyle yinelenen ekleme ikinci firma açmaz; kimliksiz ekleme 400', async () => {
    const kimlik = randomUUID();
    const govde = yeniFirma();
    const once = await firmaSayisi();
    const a = await ekle('yazan', govde, kimlik);
    const b = await ekle('yazan', govde, kimlik);
    assert.equal(a.durum, 200);
    assert.equal(b.durum, 200);
    assert.equal(b.govde.firma.id, a.govde.firma.id);
    assert.equal(await firmaSayisi(), once + 1);
    assert.equal((await ekle('yazan', yeniFirma(), null)).durum, 400);
  });

  test('FNS-48: firma uçları ve disari.ts finans rakamı döndürmez (alanlar sabit listede)', async () => {
    const f = await firmaKur();
    const tek = (await getir('okuyan', f.id)).govde.firma as unknown as Record<string, unknown>;
    assert.deepEqual(Object.keys(tek).sort(), FIRMA_ALANLARI);
    const liste = (await istek<FirmaListesiCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar')).govde;
    const secim = (await istek<FirmaSecimCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar/secim')).govde;
    const ozet = await vt().tx((db) => firmaOzeti(db, f.id));
    for (const anahtarlar of [Object.keys(liste.satirlar[0] ?? {}), Object.keys(secim.firmalar[0] ?? {}), Object.keys(ozet ?? {})]) {
      assert.ok(anahtarlar.length > 0);
      assert.ok(anahtarlar.every((k) => (FIRMA_ALANLARI.includes(k) || LISTE_EKI.includes(k)) && !RAKAM_ADI.test(k)), anahtarlar.join(','));
    }
  });

  test('FNS-49: disari.ts yetkisiz çağrılır; arama en çok 50 döndürür, pasifi yalnız istenince getirir', async () => {
    for (let i = 0; i < 55; i += 1) await firmaKur({ ad: `Sinir Deneme ${i}` });
    const pasif = await firmaKur({ ad: 'Sinir Deneme Pasif' });
    await istek('yazan', 'POST', `/finans/firmalar/${pasif.id}/pasif`, { surum: pasif.surum });
    const sonuc = await vt().tx((db) => firmaAra(db, { metin: 'Sinir Deneme', sinir: 500 }));
    assert.equal(sonuc.length, 50);
    assert.ok(!sonuc.some((s) => s.id === pasif.id));
    const pasifDahil = await vt().tx((db) => firmaAra(db, { metin: 'Sinir Deneme Pasif', sinir: 5, yalnizAktif: false }));
    assert.deepEqual(pasifDahil.map((s) => s.id), [pasif.id]);
    const secim = (await istek<FirmaSecimCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar/secim?ara=Sinir%20Deneme')).govde;
    assert.equal(secim.firmalar.length, 50);
  });

  test('disari.ts: firmaAdlari yineleneni tek, olmayanı yok sayar, pasifi adıyla döndürür; boş dizide sorgu atmaz', async () => {
    const a = await firmaKur({ ad: 'Adlar Deneme A' });
    const b = await firmaKur({ ad: 'Adlar Deneme B' });
    await istek('yazan', 'POST', `/finans/firmalar/${b.id}/pasif`, { surum: b.surum });
    const adlar = await vt().tx((db) => firmaAdlari(db, [a.id, a.id, b.id, 999999]));
    assert.deepEqual([...adlar.entries()].sort(), [[a.id, 'Adlar Deneme A'], [b.id, 'Adlar Deneme B']]);
    let sorgu = 0;
    const sayanDb = { sorgu: async () => { sorgu += 1; return []; }, tek: async () => { sorgu += 1; return null; } };
    assert.equal((await firmaAdlari(sayanDb, [])).size, 0);
    assert.equal(sorgu, 0);
    assert.deepEqual(await vt().tx((db) => firmaVarMi(db, b.id)), { var: true, aktif: false });
    assert.deepEqual(await vt().tx((db) => firmaVarMi(db, 999999)), { var: false, aktif: false });
    assert.equal(await vt().tx((db) => firmaOzeti(db, 999999)), null);
  });

  test('disari.ts: firmaOzetleri tek sorguda pasifi de iletişim, adres ve sürümle döndürür; yineleneni tek, olmayanı yok sayar', async () => {
    const a = await firmaKur({ ad: 'Ozetler Deneme A', telefon: '0212 000 00 00', ePosta: 'deneme@ornek.test', il: 'Deneme', fason: true,
      adres: 'Deneme Sokak 1', ilce: 'Merkez', postaKodu: '00000' });
    const b = await firmaKur({ ad: 'Ozetler Deneme B' });
    await istek('yazan', 'POST', `/finans/firmalar/${b.id}/pasif`, { surum: b.surum });
    let sorgu = 0;
    const ozetler = await vt().tx((db) => firmaOzetleri({ sorgu: (...x: Parameters<typeof db.sorgu>) => { sorgu += 1; return db.sorgu(...x); }, tek: db.tek.bind(db) },
      [a.id, a.id, b.id, 999999]));
    assert.equal(sorgu, 1);
    assert.deepEqual([...ozetler.keys()].sort((x, y) => x - y), [a.id, b.id]);
    const oa = ozetler.get(a.id);
    assert.deepEqual([oa?.telefon, oa?.ePosta, oa?.il, oa?.fason, oa?.aktif, oa?.surum], ['0212 000 00 00', 'deneme@ornek.test', 'Deneme', true, true, a.surum]);
    assert.deepEqual([oa?.adres, oa?.ilce, oa?.postaKodu], ['Deneme Sokak 1', 'Merkez', '00000']);
    assert.deepEqual([ozetler.get(b.id)?.adres, ozetler.get(b.id)?.ilce, ozetler.get(b.id)?.postaKodu], [null, null, null]);
    assert.deepEqual([ozetler.get(b.id)?.aktif, ozetler.get(b.id)?.surum], [false, b.surum + 1]);
    assert.deepEqual(ozetler.get(a.id), await vt().tx((db) => firmaOzeti(db, a.id)));
    assert.ok(Object.keys(oa ?? {}).every((k) => FIRMA_ALANLARI.includes(k) && !RAKAM_ADI.test(k)));
    sorgu = 0;
    const sayanDb = { sorgu: async () => { sorgu += 1; return []; }, tek: async () => { sorgu += 1; return null; } };
    assert.equal((await firmaOzetleri(sayanDb, [])).size, 0);
    assert.equal(sorgu, 0);
  });

  test('disari.ts: firmaAra fason süzgeci yalnız fason işaretlileri, varsayılan olarak yalnız aktifleri döndürür; süzgeçsiz arama değişmez', async () => {
    const f = await firmaKur({ ad: 'Fasonsuz Deneme A', fason: true });
    const n = await firmaKur({ ad: 'Fasonsuz Deneme B' });
    const p = await firmaKur({ ad: 'Fasonsuz Deneme C', fason: true });
    await istek('yazan', 'POST', `/finans/firmalar/${p.id}/pasif`, { surum: p.surum });
    const ara = (s: { fason?: boolean; yalnizAktif?: boolean }) => vt().tx(async (db) => (await firmaAra(db, { metin: 'Fasonsuz Deneme', sinir: 10, ...s })).map((x) => x.id));
    assert.deepEqual(await ara({ fason: true }), [f.id]);
    assert.deepEqual(await ara({ fason: true, yalnizAktif: false }), [f.id, p.id]);
    assert.deepEqual(await ara({ fason: false }), [n.id]);
    assert.deepEqual(await ara({}), [f.id, n.id]);
  });

  test('disari.ts: kurGetir o güne kadarki son kuru tarihiyle döndürür, sonrakini almaz; kur yoksa null; TRY 1', async () => {
    await vt().tx(async (db) => {
      for (const [pb, tarih, kur] of [['USD', '2026-09-01', '33.5'], ['USD', '2026-09-03', '33.75'], ['EUR', '2026-09-02', '36.1']] as const)
        await db.sorgu('INSERT INTO finans_kur (para_birimi, tarih, kur, olusturan_id) VALUES ($1, $2, $3, $4)', [pb, tarih, kur, yoneticiId]);
    });
    const al = (pb: string, tarih: string) => vt().tx((db) => kurGetir(db, pb, tarih));
    assert.deepEqual(await al('USD', '2026-09-03'), { kur: '33.750000', tarih: '2026-09-03' });
    assert.deepEqual(await al('USD', '2026-09-02'), { kur: '33.500000', tarih: '2026-09-01' });
    assert.equal(await al('USD', '2026-08-31'), null);
    assert.equal(await al('GBP', '2026-09-03'), null);
    assert.deepEqual(await al('TRY', '2026-09-03'), { kur: '1', tarih: '2026-09-03' });
    const hepsi = await vt().tx((db) => kurlar(db, '2026-09-02'));
    assert.deepEqual([...hepsi.entries()].sort(), [
      ['EUR', { kur: '36.100000', tarih: '2026-09-02' }], ['TRY', { kur: '1', tarih: '2026-09-02' }], ['USD', { kur: '33.500000', tarih: '2026-09-01' }]]);
    assert.deepEqual([...(await vt().tx((db) => kurlar(db, '2026-08-01'))).keys()], ['TRY']);
  });

  test('liste: tür süzgeci "ikisi"ni kapsar, aktif süzgeci çalışır, arama metnindeki % özel anlam taşımaz', async () => {
    const m = await firmaKur({ ad: 'Suzgec Musteri', tur: 'musteri' });
    const i = await firmaKur({ ad: 'Suzgec Ikisi', tur: 'ikisi' });
    const t = await firmaKur({ ad: 'Suzgec Tedarikci', tur: 'tedarikci' });
    const idler = async (q: string) => (await istek<FirmaListesiCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar?ara=Suzgec&sayfaBoyu=200${q}`)).govde.satirlar.map((s) => s.id).sort();
    assert.deepEqual(await idler('&tur=musteri'), [m.id, i.id].sort());
    assert.deepEqual(await idler('&tur=tedarikci'), [i.id, t.id].sort());
    assert.deepEqual(await idler('&tur=ikisi'), [i.id]);
    await istek('yazan', 'POST', `/finans/firmalar/${t.id}/pasif`, { surum: t.surum });
    assert.deepEqual(await idler('&aktif=false'), [t.id]);
    assert.equal((await istek<FirmaListesiCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar?ara=%25')).govde.toplam, 0);
  });

  test('saldırı: büyük alan, bozuk kimlik, eksi sürüm ve bilinmeyen tür reddedilir; hiçbiri satır açmaz', async () => {
    const once = await firmaSayisi();
    assert.equal((await ekle('yazan', yeniFirma({ ad: 'A'.repeat(5000) }))).durum, 400);
    assert.equal((await ekle('yazan', { ...yeniFirma(), tur: 'banka' })).durum, 400);
    assert.equal((await istek('yazan', 'GET', '/musteri-tedarikci/firmalar/abc')).durum, 400);
    assert.equal((await istek('yazan', 'POST', '/finans/firmalar/1/pasif', { surum: -1 })).durum, 400);
    assert.equal((await istek('yazan', 'GET', '/musteri-tedarikci/firmalar?sirala=bakiye')).durum, 400);
    assert.equal(await firmaSayisi(), once);
  });

  // ---- Adresler (S5): her adres kendi koordinatıyla; adres yazması kartın sürümünü artırır ----
  const adresYolu = (id: number, ek = '') => `/musteri-tedarikci/firmalar/${id}/adresler${ek}`;
  const adresEkle = (kim: string, id: number, govde: unknown, kimlik: string | null = randomUUID()) =>
    istek<FirmaAyrintiCevabi>(kim, 'POST', adresYolu(id, '/ekle'), govde, kimlik);
  const teslim = (ek: Record<string, unknown> = {}) => ({ tur: 'teslim', ad: 'Depo Kapisi', adres: 'Deneme Sok. 2', enlem: 40.1, boylam: 29.2, ...ek });

  test('adres: yazan ekler, günceller, kaldırır; her yazma kartın sürümünü artırır ve ayrıntıda görünür', async () => {
    const f = await firmaKur({ enlem: 41, boylam: 29 });
    const e = await adresEkle('yazan', f.id, { ...teslim(), surum: f.surum });
    assert.equal(e.durum, 200, JSON.stringify(e.govde));
    assert.equal(e.govde.firma.surum, f.surum + 1);
    const [a] = e.govde.adresler;
    assert.ok(a);
    assert.deepEqual({ tur: a.tur, ad: a.ad, enlem: a.enlem, boylam: a.boylam }, { tur: 'teslim', ad: 'Depo Kapisi', enlem: 40.1, boylam: 29.2 });
    const g = await istek<FirmaAyrintiCevabi>('yazan', 'POST', adresYolu(f.id, `/${a.id}/guncelle`), { ...teslim({ tur: 'fatura', ad: 'Fatura', enlem: null, boylam: null }), surum: e.govde.firma.surum });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.deepEqual(g.govde.adresler.map((x) => [x.tur, x.ad, x.enlem]), [['fatura', 'Fatura', null]]);
    const ayrinti = (await istek<FirmaAyrintiCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar/${f.id}`)).govde;
    assert.equal(ayrinti.adresler.length, 1);
    const satir = (await istek<FirmaListesiCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar?ara=${encodeURIComponent(f.ad)}`)).govde.satirlar.find((s) => s.id === f.id);
    assert.deepEqual([satir?.adresSayisi, satir?.koordinatli], [1, true]);
    const k = await istek<FirmaAyrintiCevabi>('yazan', 'POST', adresYolu(f.id, `/${a.id}/kaldir`), { surum: g.govde.firma.surum });
    assert.equal(k.durum, 200);
    assert.deepEqual(k.govde.adresler, []);
    assert.equal(k.govde.firma.surum, f.surum + 3);
  });

  test('adres yetki: okuyan ve oturumsuz yazamaz, adres açılmaz; okuyan ayrıntıyı okur', async () => {
    const f = await firmaKur();
    assert.equal((await adresEkle('okuyan', f.id, { ...teslim(), surum: f.surum })).durum, 403);
    assert.equal((await adresEkle(null as unknown as string, f.id, { ...teslim(), surum: f.surum })).durum, 401);
    assert.equal((await istek('rolsuz', 'GET', `/musteri-tedarikci/firmalar/${f.id}`)).durum, 403);
    const ayrinti = await istek<FirmaAyrintiCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar/${f.id}`);
    assert.equal(ayrinti.durum, 200);
    assert.deepEqual(ayrinti.govde.adresler, []);
    assert.equal(ayrinti.govde.firma.surum, f.surum);
  });

  test('adres sürüm: eski sürümle ekleme, güncelleme ve kaldırma 409 alır, adres değişmez; güncel sürüm geçer', async () => {
    const f = await firmaKur();
    const e = (await adresEkle('yazan', f.id, { ...teslim(), surum: f.surum })).govde;
    const a = e.adresler[0]!;
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ ad: 'Ikinci' }), surum: f.surum })).durum, 409);
    assert.equal((await istek('yazan', 'POST', adresYolu(f.id, `/${a.id}/guncelle`), { ...teslim({ ad: 'Degisti' }), surum: f.surum })).durum, 409);
    assert.equal((await istek('yazan', 'POST', adresYolu(f.id, `/${a.id}/kaldir`), { surum: f.surum })).durum, 409);
    const simdi = (await istek<FirmaAyrintiCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar/${f.id}`)).govde;
    assert.deepEqual(simdi.adresler.map((x) => x.ad), ['Depo Kapisi']);
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ ad: 'Ikinci' }), surum: e.firma.surum })).durum, 200);
  });

  test('MT-7 adres: yarım koordinat uçta 422/400, veritabanında kısıt; ikisi boş ya da ikisi dolu kabul', async () => {
    const f = await firmaKur();
    const yarim = await adresEkle('yazan', f.id, { ...teslim({ boylam: null }), surum: f.surum });
    assert.equal(kodu(yarim), 'DOGRULAMA');
    assert.equal(alani(yarim), 'boylam');
    assert.equal(await kisitAdi("INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, enlem, olusturan_id) VALUES ($1, 'sube', 'Yarim', 40, $2)", [f.id, yazanId]),
      'musteri_tedarikci_adres_koordinat_butun');
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ enlem: null, boylam: null }), surum: f.surum })).durum, 200);
    const kart = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...yeniFirma({ ad: f.ad, enlem: 40 }), surum: f.surum + 1 });
    assert.equal(kodu(kart), 'DOGRULAMA');
    assert.equal(alani(kart), 'boylam');
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ ad: 'Dis', enlem: 91 }), surum: f.surum + 1 })).durum, 400);
  });

  test('MT-9 adres: aynı firmada aynı ad (büyük/küçük harf duyarsız) reddedilir; başka firmada aynı ad serbest', async () => {
    const f = await firmaKur();
    const g = await firmaKur();
    const e = (await adresEkle('yazan', f.id, { ...teslim(), surum: f.surum })).govde;
    const ayni = await adresEkle('yazan', f.id, { ...teslim({ ad: 'DEPO KAPISI' }), surum: e.firma.surum });
    assert.equal(kodu(ayni), 'CAKISMA');
    assert.equal(alani(ayni), 'ad');
    assert.equal((await adresEkle('yazan', g.id, { ...teslim(), surum: g.surum })).durum, 200);
  });

  test('MT-10 adres: 50 adresi olan firmaya ekleme reddedilir; 49 adreslik firmaya eklenir', async () => {
    const f = await firmaKur();
    await vt().sorgu(
      "INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, olusturan_id) SELECT $1, 'sube', 'Sube ' || g, $2 FROM generate_series(1, 49) g", [f.id, yazanId]);
    const e = await adresEkle('yazan', f.id, { ...teslim(), surum: f.surum });
    assert.equal(e.durum, 200);
    assert.equal(e.govde.adresler.length, 50);
    const fazla = await adresEkle('yazan', f.id, { ...teslim({ ad: 'Fazla' }), surum: e.govde.firma.surum });
    assert.equal(kodu(fazla), 'GECERSIZ');
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_adres WHERE firma_id = $1', [f.id]))?.n, 50);
  });

  test('adres saldırı: başka firmanın adresi güncellenmez ve kaldırılmaz (404); bilinmeyen tür ve 101 karakter ad 400', async () => {
    const f = await firmaKur();
    const g = await firmaKur();
    const a = (await adresEkle('yazan', f.id, { ...teslim(), surum: f.surum })).govde.adresler[0]!;
    assert.equal((await istek('yazan', 'POST', adresYolu(g.id, `/${a.id}/guncelle`), { ...teslim({ ad: 'Ele Gecir' }), surum: g.surum })).durum, 404);
    assert.equal((await istek('yazan', 'POST', adresYolu(g.id, `/${a.id}/kaldir`), { surum: g.surum })).durum, 404);
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ tur: 'merkez' }), surum: f.surum + 1 })).durum, 400);
    assert.equal((await adresEkle('yazan', f.id, { ...teslim({ ad: 'A'.repeat(101) }), surum: f.surum + 1 })).durum, 400);
    assert.equal((await vt().tek<{ ad: string }>('SELECT ad FROM musteri_tedarikci_adres WHERE id = $1', [a.id]))?.ad, 'Depo Kapisi');
  });

  test('MT-12 koordinat: düzeltmede gönderilmeyen koordinat korunur (finans çerçevesi göndermez); null açıkça siler', async () => {
    const f = await firmaKur({ enlem: 41.01, boylam: 29.04 });
    const { enlem: _e, boylam: _b, ...koordinatsiz } = f as unknown as Record<string, unknown>;
    const korunan = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...koordinatsiz, telefon: '0212 000 00 01' });
    assert.equal(korunan.durum, 200, JSON.stringify(korunan.govde));
    assert.deepEqual([korunan.govde.firma.enlem, korunan.govde.firma.boylam, korunan.govde.firma.telefon], [41.01, 29.04, '0212 000 00 01']);
    const silinen = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...koordinatsiz, enlem: null, boylam: null, surum: korunan.govde.firma.surum });
    assert.deepEqual([silinen.govde.firma.enlem, silinen.govde.firma.boylam], [null, null]);
    const yarim = await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...koordinatsiz, enlem: 40, surum: silinen.govde.firma.surum });
    assert.equal(kodu(yarim), 'DOGRULAMA');
  });

  test('MT-13 (265 a) müşteri sınıfı A, B, C ya da boş; başka değer uçta 400, veritabanında kısıt; düzeltmede gönderilmezse korunur, null siler; disari boşu null verir', async () => {
    const a = await firmaKur({ musteriSinifi: 'A' });
    const b = await firmaKur({ musteriSinifi: 'B' });
    const bos = await firmaKur();
    assert.deepEqual([a.musteriSinifi, b.musteriSinifi, bos.musteriSinifi], ['A', 'B', null]);
    const once = await firmaSayisi();
    assert.equal(kodu(await ekle('yazan', { ...yeniFirma(), musteriSinifi: 'D' })), 'DOGRULAMA');
    assert.equal(await firmaSayisi(), once);
    assert.equal(await kisitAdi("UPDATE musteri_tedarikci_firma SET musteri_sinifi = 'D' WHERE id = $1", [a.id]), 'musteri_tedarikci_firma_musteri_sinifi');

    const { musteriSinifi: _s, ...sinifsiz } = a as unknown as Record<string, unknown>;
    const yol = `/musteri-tedarikci/firmalar/${a.id}/guncelle`;
    const korunan = await istek<FirmaCevabi>('yazan', 'POST', yol, { ...sinifsiz, telefon: '0212 000 00 02' });
    assert.equal(korunan.durum, 200, JSON.stringify(korunan.govde));
    assert.deepEqual([korunan.govde.firma.musteriSinifi, korunan.govde.firma.telefon], ['A', '0212 000 00 02']);
    const degisen = await istek<FirmaCevabi>('yazan', 'POST', yol, { ...sinifsiz, musteriSinifi: 'C', surum: korunan.govde.firma.surum });
    assert.equal(degisen.govde.firma.musteriSinifi, 'C');
    assert.equal((await istek('okuyan', 'POST', yol, { ...sinifsiz, musteriSinifi: 'A', surum: degisen.govde.firma.surum })).durum, 403);
    assert.equal((await getir('okuyan', a.id)).govde.firma.musteriSinifi, 'C');

    const siniflar = await vt().tx((db) => musteriSiniflari(db, [a.id, b.id, b.id, bos.id, 999999]));
    assert.deepEqual([...siniflar.entries()].sort(([x], [y]) => x - y), [[a.id, 'C'], [b.id, 'B'], [bos.id, null]]);
    const silinen = await istek<FirmaCevabi>('yazan', 'POST', yol, { ...sinifsiz, musteriSinifi: null, surum: degisen.govde.firma.surum });
    assert.equal(silinen.govde.firma.musteriSinifi, null);
    let sorgu = 0;
    const sayanDb = { sorgu: async () => { sorgu += 1; return []; }, tek: async () => { sorgu += 1; return null; } };
    assert.equal((await musteriSiniflari(sayanDb, [])).size, 0);
    assert.equal(sorgu, 0);
  });
});
