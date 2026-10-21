import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  AcilDurumCevabi, BenimZiyaretcim, Kart, KartlarCevabi, KapiCevabi, PdksAktarCevabi, PdksCihazAnahtarCevabi, PdksCihazHareketiCevabi, Ziyaret,
  ZiyaretcilerimCevabi,
} from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yemegeKalanZiyaretci } from './disari.ts';
import { pdksHamTemizle, pdksKapilariniSifirla } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('nizamiye (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let gorevli = '';
  let gorevliId = 0;
  let kartci = '';
  let yetkisiz = '';
  let pdksci = '';
  let evSahibiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const oku = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string, url: string, payload: unknown, istekKimligi: string | null = randomUUID()) =>
    app.inject({
      method: 'POST', url: `/api${url}`, payload: payload as object,
      headers: { cookie: cerez, ...(istekKimligi === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi }) },
    });

  // Nizamiye işlemleri rollere Çekirdek göçüyle verilecek; burada yalnız uçların işlem denetimi sınanır.
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol!.id, islem]);
    const id = await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, kisi, rol!.id);
      for (const r of k.roller) if (r.id !== rol!.id) await rolAl(db, yoneticiId, kisi, r.id);
      return kisi;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  async function kartAc(tur = 'ziyaretci'): Promise<Kart> {
    const cevap = await yaz(kartci, '/nizamiye/kartlar', { kartNo: `Z-${String(++sayac)}`, tur });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json();
  }

  const habersizGovde = (kartId: number, ek: Record<string, unknown> = {}) => ({
    ad: 'Misafir Bir', firmaAdi: 'Firma A', neden: 'toplanti', evSahibiKisiId: evSahibiId, kartId, kimlikGoruldu: true, ...ek,
  });

  async function habersiz(ek: Record<string, unknown> = {}): Promise<Ziyaret> {
    const kart = await kartAc();
    const cevap = await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, ek));
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json();
  }

  // Ön kayıt ekranı ayrı dilimde gelir; beklenen ziyaret burada doğrudan açılır. Zaman şimdi: kapı listesi yerel gün
  // sonuna kadar süzer, ileri bir saat 23:00'ten sonra yarına düşer.
  async function beklenen(neden = 'toplanti'): Promise<number> {
    const satir = await vt().tek<{ id: number }>(
      `INSERT INTO nizamiye_ziyaret (ziyaret_no, ad, neden, ev_sahibi_kisi_id, beklenen_zaman, durum, olusturan_kisi_id)
       VALUES ($1, 'Misafir İki', $2, $3, now(), 'beklenen', $3) RETURNING id`,
      [`T-${String(++sayac)}`, neden, evSahibiId],
    );
    return satir!.id;
  }

  const kapi = async (): Promise<KapiCevabi> => (await oku(gorevli, '/nizamiye/kapi')).json();
  const kartlar = async (): Promise<Kart[]> => ((await oku(gorevli, '/nizamiye/kartlar')).json() as KartlarCevabi).kartlar;

  before(async () => {
    ortam = await testVeritabaniKur('nizamiye');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await islemliKisi('gorevli', ['sayfa.nizamiye', 'nizamiye.oku', 'nizamiye.yaz']);
    gorevli = g.cerez;
    gorevliId = g.id;
    kartci = (await islemliKisi('kartci', ['sayfa.nizamiye', 'nizamiye.oku', 'nizamiye.kart-yonet'])).cerez;
    pdksci = (await islemliKisi('pdksci', ['nizamiye.pdks-aktar'])).cerez;
    const y = await islemliKisi('yetkisiz', ['sayfa.mesaj']);
    yetkisiz = y.cerez;
    evSahibiId = y.id;
  });

  after(async () => { await ortam?.kaldir(); });

  test('NZ-K1 kartı kart yöneticisi ekler; görevli ekleyemez; aynı numara ikinci kez açılmaz', async () => {
    const kart = await kartAc();
    assert.equal(kart.durum, 'bos');
    assert.equal((await yaz(gorevli, '/nizamiye/kartlar', { kartNo: 'Z-900', tur: 'ziyaretci' })).statusCode, 403);
    const ikinci = await yaz(kartci, '/nizamiye/kartlar', { kartNo: kart.kartNo, tur: 'ziyaretci' });
    assert.equal(ikinci.statusCode, 409, ikinci.body);
  });

  test('NZ-01 habersiz ziyaretçi içeri alınır; kart kullanımda görünür, numara ve görevli sunucudan', async () => {
    const z = await habersiz({ kimlikTuru: 'tc_kimlik', kimlikSon4: '4821' });
    assert.equal(z.durum, 'iceride');
    assert.match(z.ziyaretNo, /^ZY-\d{6}$/);
    assert.equal(z.girenAd, 'Deneme gorevli');
    assert.equal(z.evSahibiAd, 'Deneme yetkisiz');
    assert.equal(z.kimlikSon4, '4821');
    assert.equal((await kapi()).iceride.some((s) => s.id === z.id), true);
    const kart = (await kartlar()).find((k) => k.id === z.kartId);
    assert.equal(kart?.durum, 'kullanimda');
    assert.equal(kart?.ziyaret?.id, z.id);
    assert.equal((await kapi()).bosKartlar.some((k) => k.id === z.kartId), false);
  });

  test('NZ-01 yetkisi olmayan içeri alamaz, kapı listesini okuyamaz', async () => {
    const kart = await kartAc();
    assert.equal((await yaz(yetkisiz, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id))).statusCode, 403);
    assert.equal((await oku(yetkisiz, '/nizamiye/kapi')).statusCode, 403);
    assert.equal((await oku(kartci, '/nizamiye/kapi')).statusCode, 200);
  });

  test('NZ-02 kimlik görülmeden ve atölye nedeninde kask işareti olmadan girilmez', async () => {
    const kart = await kartAc();
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, { kimlikGoruldu: false }))).statusCode, 422);
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, { neden: 'servis' }))).statusCode, 422);
    const kask = await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, { neden: 'servis', atolye: true }));
    assert.equal(kask.statusCode, 200, kask.body);
  });

  test('NZ-02 kimlik hanesi türsüz yazılmaz; tam numara kabul edilmez', async () => {
    const kart = await kartAc();
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, { kimlikSon4: '1234' }))).statusCode, 422);
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id, { kimlikTuru: 'tc_kimlik', kimlikSon4: '12345678901' }))).statusCode, 400);
  });

  test('NZ-03 içerideki ziyaretçideki ya da kayıp kart verilmez', async () => {
    const z = await habersiz();
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(z.kartId!))).statusCode, 422);
    const kart = await kartAc();
    const bildir = await yaz(gorevli, `/nizamiye/kartlar/${kart.id}/bildir`, { surum: kart.surum, durum: 'kayip' });
    assert.equal(bildir.statusCode, 200, bildir.body);
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id))).statusCode, 422);
  });

  test('NZ-01 habersiz giriş tekrar korumalıdır: aynı istek kimliği ikinci ziyaret açmaz, başlıksız istek reddedilir', async () => {
    const kart = await kartAc();
    const kimlik = randomUUID();
    const ilk = await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id), kimlik);
    const ikinci = await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id), kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.json().id, ilk.json().id);
    assert.equal((await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', habersizGovde(kart.id), null)).statusCode, 400);
  });

  test('NZ-01 beklenen ziyaret kapı listesinde görünür ve girişle içeri alınır; eski sürüm reddedilir', async () => {
    const id = await beklenen();
    const z = (await kapi()).beklenen.find((s) => s.id === id);
    assert.ok(z);
    const kart = await kartAc();
    const giris = { surum: z.surum, kartId: kart.id, kimlikGoruldu: true };
    const cevap = await yaz(gorevli, `/nizamiye/ziyaretler/${id}/giris`, giris);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(cevap.json().durum, 'iceride');
    assert.equal((await yaz(gorevli, `/nizamiye/ziyaretler/${id}/giris`, giris)).statusCode, 409);
  });

  test('NZ-04/05 çıkış: dizüstüyle girende eşya kontrolü zorunlu; teslim edilmeyen kart kayıp olur', async () => {
    const z = await habersiz({ dizustu: true });
    assert.equal((await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/cikis`, { surum: z.surum, kartTeslim: true })).statusCode, 422);
    const cevap = await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/cikis`, { surum: z.surum, kartTeslim: false, ekipmanKontrol: true });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const cikan: Ziyaret = cevap.json();
    assert.equal(cikan.durum, 'cikti');
    assert.equal(cikan.cikaranAd, 'Deneme gorevli');
    assert.equal((await kartlar()).find((k) => k.id === z.kartId)?.durum, 'kayip');
    assert.equal((await kapi()).iceride.some((s) => s.id === z.id), false);
  });

  test('NZ-07 çıkış geri alınır: ziyaretçi içeride, kayıp sayılan kart yine onda', async () => {
    const z = await habersiz();
    const cikan: Ziyaret = (await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/cikis`, { surum: z.surum, kartTeslim: false })).json();
    const geri = await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/geri-al`, { surum: cikan.surum });
    assert.equal(geri.statusCode, 200, geri.body);
    assert.equal(geri.json().durum, 'iceride');
    assert.equal((await kartlar()).find((k) => k.id === z.kartId)?.durum, 'kullanimda');
  });

  test('NZ-07 habersiz girişin geri alınması kaydı iptal eder; ön kayıtlı giriş beklenene döner, kart rafa döner', async () => {
    const z = await habersiz();
    const geri = await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/geri-al`, { surum: z.surum });
    assert.equal(geri.json().durum, 'iptal');
    assert.equal((await kapi()).bosKartlar.some((k) => k.id === z.kartId), true);

    const id = await beklenen();
    const kart = await kartAc();
    const girdi: Ziyaret = (await yaz(gorevli, `/nizamiye/ziyaretler/${id}/giris`, { surum: 1, kartId: kart.id, kimlikGoruldu: true })).json();
    const donen: Ziyaret = (await yaz(gorevli, `/nizamiye/ziyaretler/${id}/geri-al`, { surum: girdi.surum })).json();
    assert.equal(donen.durum, 'beklenen');
    assert.equal(donen.kartId, null);
  });

  test('NZ-07 süresi geçen giriş geri alınmaz', async () => {
    const z = await habersiz();
    await vt().sorgu("UPDATE nizamiye_ziyaret SET giris = now() - interval '11 minutes' WHERE id = $1", [z.id]);
    assert.equal((await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/geri-al`, { surum: z.surum })).statusCode, 422);
  });

  test('NZ-06 yalnız beklenen iptal edilir', async () => {
    const id = await beklenen();
    const iptal = await yaz(gorevli, `/nizamiye/ziyaretler/${id}/iptal`, { surum: 1 });
    assert.equal(iptal.statusCode, 200, iptal.body);
    assert.equal(iptal.json().durum, 'iptal');
    const z = await habersiz();
    assert.equal((await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/iptal`, { surum: z.surum })).statusCode, 422);
  });

  test('NZ-10 görevli kartı hasarlı bildirir; rafa yalnız kart yöneticisi alır', async () => {
    const kart = await kartAc();
    const hasarli: Kart = (await yaz(gorevli, `/nizamiye/kartlar/${kart.id}/bildir`, { surum: kart.surum, durum: 'hasarli', not: 'Kırık' })).json();
    assert.equal(hasarli.durum, 'hasarli');
    assert.equal(hasarli.durumNotu, 'Kırık');
    assert.equal((await yaz(gorevli, `/nizamiye/kartlar/${kart.id}/rafa-al`, { surum: hasarli.surum })).statusCode, 403);
    const rafta = await yaz(kartci, `/nizamiye/kartlar/${kart.id}/rafa-al`, { surum: hasarli.surum });
    assert.equal(rafta.statusCode, 200, rafta.body);
    assert.equal(rafta.json().durum, 'bos');
    assert.equal((await yaz(kartci, `/nizamiye/kartlar/${kart.id}/rafa-al`, { surum: rafta.json().surum })).statusCode, 422);
  });

  test('geçmiş günün kayıtlarını verir; arama düz metindir', async () => {
    const z = await habersiz({ ad: 'Aranan Kişi' });
    const gun: { ziyaretler: Ziyaret[] } = (await oku(gorevli, '/nizamiye/gecmis')).json();
    assert.equal(gun.ziyaretler.some((s) => s.id === z.id), true);
    const bulunan: { ziyaretler: Ziyaret[] } = (await oku(gorevli, `/nizamiye/gecmis?ara=${encodeURIComponent('Aranan')}`)).json();
    assert.deepEqual(bulunan.ziyaretler.map((s) => s.id), [z.id]);
    const desen: { ziyaretler: Ziyaret[] } = (await oku(gorevli, `/nizamiye/gecmis?ara=${encodeURIComponent('%')}`)).json();
    assert.deepEqual(desen.ziyaretler, []);
    const dun: { ziyaretler: Ziyaret[] } = (await oku(gorevli, '/nizamiye/gecmis?gun=2020-01-01')).json();
    assert.deepEqual(dun.ziyaretler, []);
  });

  test('acil durum listesi içeridekileri ve yazdıranı verir', async () => {
    const z = await habersiz();
    const liste = (await oku(gorevli, '/nizamiye/acil-durum')).json() as { yazdiran: string; ziyaretler: Ziyaret[] };
    assert.equal(liste.yazdiran, 'Deneme gorevli');
    assert.equal(liste.ziyaretler.some((s) => s.id === z.id), true);
    assert.equal((await oku(yetkisiz, '/nizamiye/acil-durum')).statusCode, 403);
  });

  test('ev sahibi seçimi ve önceki ziyaret önerisi yalnız yazan görevliye', async () => {
    await habersiz({ ad: 'Önceki Gelen', telefon: '0500 000 00 00' });
    const ev = (await oku(gorevli, '/nizamiye/ev-sahipleri')).json() as { kisiler: { id: number; ziyaretSayisi: number }[] };
    assert.equal(ev.kisiler[0]?.id, evSahibiId);
    const oneri = (await oku(gorevli, `/nizamiye/oneriler?ara=${encodeURIComponent('Önceki')}`)).json() as { oneriler: { telefon: string | null }[] };
    assert.equal(oneri.oneriler[0]?.telefon, '0500 000 00 00');
    assert.equal((await oku(kartci, '/nizamiye/ev-sahipleri')).statusCode, 403);
  });

  test('menü sayacı okuyana içerideki ve sorunlu kart sayısını, okumayana hiçbir şey vermez', async () => {
    const sayac = (await oku(gorevli, '/nizamiye/menu-sayaclari')).json() as Record<string, number>;
    const { iceride } = await kapi();
    assert.equal(sayac.kapi, iceride.length);
    assert.equal(typeof sayac.kartlar, 'number');
    assert.deepEqual((await oku(yetkisiz, '/nizamiye/menu-sayaclari')).json(), {});
  });

  test('görevli kimliği sunucudan: gövdedeki kişi alanı yok sayılır', async () => {
    const kart = await kartAc();
    const z: Ziyaret = (await yaz(gorevli, '/nizamiye/ziyaretler/habersiz', { ...habersizGovde(kart.id), girenKisiId: yoneticiId })).json();
    const satir = await vt().tek<{ giren: number }>('SELECT giren_kisi_id AS giren FROM nizamiye_ziyaret WHERE id = $1', [z.id]);
    assert.equal(satir?.giren, gorevliId);
  });

  const birSaatSonra = () => new Date(Date.now() + 3_600_000).toISOString();
  // PDKS satırları koşu anından geriye sayılır: günün sabit saatleri (00:01 gibi) gece yarısından hemen sonra henüz gelmemiş olur.
  // İki PDKS testi aynı anı kullanır: kart okuyucu testi dosyadan gelmiş hareketi yeniden gönderir.
  const pdksAn = Math.floor(Date.now() / 60_000) * 60_000;
  const pdksZamani = (saatOnce: number): string => {
    const [tarih, saat] = tesisSaati(pdksAn - saatOnce * 3_600_000).split(' ') as [string, string];
    const [y, a, g] = tarih.split('-') as [string, string, string];
    return `${g}.${a}.${y};${saat}`;
  };
  // Varsayılan şimdi: kapı listesinde görünmesi gereken ön kayıt günün sonuna taşmaz (beklenen() ile aynı neden).
  const onKayit = (cerez: string, ek: Record<string, unknown> = {}, istekKimligi?: string | null) =>
    yaz(cerez, '/ziyaretcilerim/on-kayit', { ad: 'Misafir Üç', firmaAdi: 'Firma B', neden: 'toplanti', beklenenZaman: new Date().toISOString(), ...ek }, istekKimligi);
  const benimkiler = async (cerez: string): Promise<BenimZiyaretcim[]> =>
    ((await oku(cerez, '/ziyaretcilerim')).json() as ZiyaretcilerimCevabi).ziyaretler;

  test('NZ-08 her çalışan kendi ziyaretçisini ön kayda alır; ev sahibi oturumdan, kapı listesinde beklenen olarak görünür', async () => {
    const cevap = await onKayit(yetkisiz, { evSahibiKisiId: yoneticiId, telefon: '0 500 000 00 00' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const z: BenimZiyaretcim = cevap.json();
    assert.equal(z.durum, 'beklenen');
    assert.match(z.ziyaretNo, /^ZY-/);
    assert.equal('telefon' in z || 'kimlikSon4' in z, false);
    const satir = await vt().tek<{ ev: number; acan: number }>(
      'SELECT ev_sahibi_kisi_id AS ev, olusturan_kisi_id AS acan FROM nizamiye_ziyaret WHERE id = $1', [z.id]);
    assert.deepEqual(satir, { ev: evSahibiId, acan: evSahibiId });
    assert.ok((await benimkiler(yetkisiz)).some((b) => b.id === z.id));
    const kapidaki = (await kapi()).beklenen.find((b) => b.id === z.id);
    assert.equal(kapidaki?.evSahibiKisiId, evSahibiId);
    assert.equal((await oku(yetkisiz, '/nizamiye/kapi')).statusCode, 403);
  });

  test('NZ-08 çalışan başkasının ziyaretçisini görmez ve iptal edemez; kendininkini yalnız gelmeden iptal eder', async () => {
    const baska = await islemliKisi('calisan2', ['sayfa.mesaj']);
    const z: BenimZiyaretcim = (await onKayit(yetkisiz)).json();
    assert.equal((await benimkiler(baska.cerez)).some((b) => b.id === z.id), false);
    assert.equal((await yaz(baska.cerez, `/ziyaretcilerim/${String(z.id)}/iptal`, { surum: z.surum })).statusCode, 404);
    const iptal = await yaz(yetkisiz, `/ziyaretcilerim/${String(z.id)}/iptal`, { surum: z.surum });
    assert.equal(iptal.statusCode, 200, iptal.body);
    assert.equal((iptal.json() as BenimZiyaretcim).durum, 'iptal');

    const gelen: BenimZiyaretcim = (await onKayit(yetkisiz)).json();
    const kart = await kartAc();
    const giris = await yaz(gorevli, `/nizamiye/ziyaretler/${String(gelen.id)}/giris`, { surum: gelen.surum, kartId: kart.id, kimlikGoruldu: true });
    assert.equal(giris.statusCode, 200, giris.body);
    const icerdeki = (await benimkiler(yetkisiz)).find((b) => b.id === gelen.id);
    assert.equal(icerdeki?.durum, 'iceride');
    assert.equal(icerdeki?.kartNo, kart.kartNo);
    assert.equal((await yaz(yetkisiz, `/ziyaretcilerim/${String(gelen.id)}/iptal`, { surum: icerdeki!.surum })).statusCode, 422);
  });

  test('NZ-09 ön kayıt bir saatten eski ya da 90 günden ileri açılmaz; oturumsuz istek reddedilir; tekrar korumalı', async () => {
    const eski = new Date(Date.now() - 2 * 3_600_000).toISOString();
    assert.equal((await onKayit(yetkisiz, { beklenenZaman: eski })).statusCode, 422);
    const uzak = new Date(Date.now() + 91 * 86_400_000).toISOString();
    assert.equal((await onKayit(yetkisiz, { beklenenZaman: uzak })).statusCode, 422);
    assert.equal((await app.inject({ method: 'GET', url: '/api/ziyaretcilerim' })).statusCode, 401);
    // Aynı istek aynı gövdeyle yinelenir: ikinci kayıt açılmaz.
    const kimlik = randomUUID();
    const zaman = { beklenenZaman: birSaatSonra() };
    const ilk = await onKayit(yetkisiz, zaman, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(((await onKayit(yetkisiz, zaman, kimlik)).json() as BenimZiyaretcim).id, (ilk.json() as BenimZiyaretcim).id);
    assert.equal((await onKayit(yetkisiz, zaman, null)).statusCode, 400);
  });

  test('yemeğe kalan ziyaretçi sayısı: o gün beklenen ya da giren, yemek işaretli; iptal sayılmaz, çıkan düşmez', async () => {
    const ekle = (zaman: string, ogle: boolean, iptal = false) => vt().sorgu(
      `INSERT INTO nizamiye_ziyaret (ziyaret_no, ad, neden, ev_sahibi_kisi_id, beklenen_zaman, ogle_yemegi, durum, olusturan_kisi_id, iptal_zaman, iptal_eden_kisi_id)
       VALUES ($1, 'Misafir Uc', 'toplanti', $2, $3, $4, $5, $2, CASE WHEN $6 THEN now() END, CASE WHEN $6 THEN $2::int END)`,
      [`T-${String(++sayac)}`, evSahibiId, zaman, ogle, iptal ? 'iptal' : 'beklenen', iptal],
    );
    await ekle('2031-05-20T10:00:00+03:00', true);
    await ekle('2031-05-20T14:00:00+03:00', true);
    await ekle('2031-05-20T11:00:00+03:00', false);
    await ekle('2031-05-20T09:00:00+03:00', true, true);
    await ekle('2031-05-21T10:00:00+03:00', true);
    assert.equal(await yemegeKalanZiyaretci(vt(), '2031-05-20'), 2);
    assert.equal(await yemegeKalanZiyaretci(vt(), '2031-05-22'), 0);

    const gun = (await vt().tek<{ gun: string }>('SELECT now()::date::text AS gun'))!.gun;
    const once = await yemegeKalanZiyaretci(vt(), gun);
    const z = await habersiz({ ogleYemegi: true });
    assert.equal(await yemegeKalanZiyaretci(vt(), gun), once + 1);
    assert.equal((await yaz(gorevli, `/nizamiye/ziyaretler/${z.id}/cikis`, { surum: z.surum, kartTeslim: true })).statusCode, 200);
    assert.equal(await yemegeKalanZiyaretci(vt(), gun), once + 1);
  });

  test('PDKS dosyasını yalnız aktarma yetkilisi aktarır (259 a, kapı görevlisi değil): içeride olan personel acil durum listesinde; aynı dosya ikinci kez hareket yazmaz', async () => {
    await vt().sorgu("UPDATE kisi SET sicil_no = 'T-P1' WHERE id = $1", [evSahibiId]);
    await vt().sorgu("UPDATE kisi SET sicil_no = 'T-P2' WHERE id = $1", [gorevliId]);
    const y = tesisSaati(pdksAn).slice(0, 4);
    const metin = ['Sicil;Tarih;Saat;Yon', `T-P1;${pdksZamani(3)};G`, `T-P2;${pdksZamani(3)};G`, `T-P2;${pdksZamani(2)}:30;C`, `T-YOK;${pdksZamani(3)};G`,
      `T-P1;31.02.${y};08:00;G`, ''].join('\r\n');
    const govde = { dosyaAdi: 'pdks-gunluk.csv', metin };
    const ilk = await yaz(pdksci, '/nizamiye/pdks/aktar', govde);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const sonuc: PdksAktarCevabi = ilk.json();
    assert.deepEqual({ ...sonuc, hatalar: sonuc.hatalar.map((h) => h.satirNo) },
      { satirSayisi: 5, yeniHareket: 3, zatenVardi: 0, eslesmeyenSicil: ['T-YOK'], hatalar: [6] });

    const liste: AcilDurumCevabi = (await oku(gorevli, '/nizamiye/acil-durum')).json();
    assert.deepEqual(liste.personel.map((p) => p.sicilNo), ['T-P1']);
    assert.notEqual(liste.pdksSonAktarim, null);

    const ikinci: PdksAktarCevabi = (await yaz(pdksci, '/nizamiye/pdks/aktar', govde)).json();
    assert.deepEqual([ikinci.yeniHareket, ikinci.zatenVardi], [0, 3]);
    assert.equal((await yaz(pdksci, '/nizamiye/pdks/aktar', { dosyaAdi: 'bos.csv', metin: 'Sicil\nbozuk satir' })).statusCode, 422);
    assert.equal((await yaz(pdksci, '/nizamiye/pdks/aktar', govde, null)).statusCode, 400);
    assert.equal((await yaz(gorevli, '/nizamiye/pdks/aktar', govde)).statusCode, 403);
  });
  test('PDKS kart okuyucu (289 b): kapalıyken, ağ dışından, kayıtsız adresten, yanlış anahtarla ve etkin olmayan cihazdan reddedilir; kabul edilen gönderim ham gövdesiyle yazılır, dosyadan gelmiş hareket ikinci kez yazılmaz', async () => {
    process.env['TMIV2_PDKS_CIHAZ_AGI'] = '10.0.7.0/24';
    pdksKapilariniSifirla();
    assert.equal((await oku(gorevli, '/nizamiye/pdks/cihazlar')).statusCode, 403);
    assert.equal((await yaz(pdksci, '/nizamiye/pdks/cihazlar', { ad: 'Dış', ip: '8.8.8.8' })).statusCode, 422);
    const acilis = await yaz(pdksci, '/nizamiye/pdks/cihazlar', { ad: 'Ana kapı okuyucu', ip: '10.0.7.21' });
    assert.equal(acilis.statusCode, 200, acilis.body);
    const { cihaz, anahtar }: PdksCihazAnahtarCevabi = acilis.json();
    assert.match(anahtar, /^[0-9a-f]{64}$/);
    assert.equal((await yaz(pdksci, '/nizamiye/pdks/cihazlar', { ad: 'İkinci', ip: '10.0.7.21' })).statusCode, 409);
    const ozet = await vt().tek<{ ozet: string }>('SELECT anahtar_ozeti AS ozet FROM nizamiye_pdks_cihaz WHERE id = $1', [cihaz.id]);
    assert.equal(ozet!.ozet.includes(anahtar), false);

    const gonder = (ham: string, ip = '10.0.7.21', a = anahtar) =>
      app.inject({ method: 'POST', url: '/api/nizamiye/pdks/cihaz-hareketi', remoteAddress: ip, payload: { anahtar: a, ham } });
    const ham = [`T-P1;${pdksZamani(1)};G`, `T-YOK;${pdksZamani(1)};G`, 'bozuk', `T-P2;${pdksZamani(3)};G`].join('\n');
    assert.equal((await gonder(ham)).statusCode, 404);
    await ortam!.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('nizamiye.pdks-cihaz-girisi', 'true', $1)", [yoneticiId]);
    // Ağ dışındaki cihaz kayıtlı ve anahtarı doğru olsa da reddedilir.
    const disarida: PdksCihazAnahtarCevabi = (await yaz(pdksci, '/nizamiye/pdks/cihazlar', { ad: 'Depo okuyucu', ip: '10.0.8.5' })).json();
    assert.equal((await gonder(ham, '10.0.8.5', disarida.anahtar)).statusCode, 403);
    assert.equal((await gonder(ham, '10.0.7.99')).statusCode, 403);
    assert.equal((await gonder(ham, '10.0.7.21', 'f'.repeat(64))).statusCode, 403);

    const ilk = await gonder(ham, '::ffff:10.0.7.21');
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual(ilk.json(), { satirSayisi: 4, yeniHareket: 1, zatenVardi: 1, eslesmeyen: 1, hatali: 1 } satisfies PdksCihazHareketiCevabi);
    const kayit = await vt().tek<{ ip: string; govde: string }>(
      'SELECT host(g.ip) AS ip, h.govde FROM nizamiye_pdks_gonderim g JOIN nizamiye_pdks_gonderim_ham h ON h.gonderim_id = g.id WHERE g.cihaz_id = $1', [cihaz.id]);
    assert.deepEqual(kayit, { ip: '10.0.7.21', govde: ham });
    const denetim = await vt().tek<{ govde: Record<string, unknown> }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/nizamiye/pdks/cihaz-hareketi' ORDER BY id DESC LIMIT 1");
    assert.equal(JSON.stringify(denetim?.govde ?? {}).includes('T-P1') || JSON.stringify(denetim?.govde ?? {}).includes(anahtar), false);
    const ikinci: PdksCihazHareketiCevabi = (await gonder(ham)).json();
    assert.deepEqual([ikinci.yeniHareket, ikinci.zatenVardi], [0, 2]);
    assert.ok((await oku(pdksci, '/nizamiye/pdks/cihazlar')).json().cihazlar.some((c: { id: number; sonGonderim: string | null }) => c.id === cihaz.id && c.sonGonderim !== null));

    // Art arda beş kimlik hatasından sonra doğru anahtar da bir süre bekler.
    for (let i = 0; i < 5; i++) assert.equal((await gonder(ham, '10.0.7.21', 'e'.repeat(64))).statusCode, 403);
    assert.equal((await gonder(ham)).statusCode, 429);
    pdksKapilariniSifirla();

    const kapali = await yaz(pdksci, `/nizamiye/pdks/cihazlar/${String(cihaz.id)}/durum`, { surum: cihaz.surum, aktif: false });
    assert.equal(kapali.statusCode, 200, kapali.body);
    assert.equal((await gonder(ham)).statusCode, 403);
    assert.equal((await yaz(pdksci, `/nizamiye/pdks/cihazlar/${String(cihaz.id)}/anahtar`, { surum: cihaz.surum })).statusCode, 409);
    const etkin = await yaz(pdksci, `/nizamiye/pdks/cihazlar/${String(cihaz.id)}/durum`, { surum: kapali.json().surum, aktif: true });
    const yeni: PdksCihazAnahtarCevabi = (await yaz(pdksci, `/nizamiye/pdks/cihazlar/${String(cihaz.id)}/anahtar`, { surum: etkin.json().surum })).json();
    assert.notEqual(yeni.anahtar, anahtar);
    assert.equal((await gonder(ham)).statusCode, 403);
    assert.equal((await gonder(ham, '10.0.7.21', yeni.anahtar)).statusCode, 200);
  });

  test('PDKS kart okuyucunun ham gövdesi saklama süresi dolunca silinir, gönderim kalır; 30 günden yeni ham gövde silinemez', async () => {
    const c = await vt().tek<{ id: number }>('SELECT id FROM nizamiye_pdks_cihaz ORDER BY id LIMIT 1');
    const eski = await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO nizamiye_pdks_gonderim (cihaz_id, ip, zaman, satir_sayisi, eslesmeyen, hatali) VALUES ($1, '10.0.7.21', now() - interval '400 days', 0, 0, 0) RETURNING id", [c!.id]);
    await ortam!.sahip.sorgu("INSERT INTO nizamiye_pdks_gonderim_ham (gonderim_id, govde) VALUES ($1, 'eski')", [eski!.id]);
    const once = (await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM nizamiye_pdks_gonderim_ham'))!.sayi;
    await vt().tx((db) => pdksHamTemizle(db));
    assert.equal((await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM nizamiye_pdks_gonderim_ham'))!.sayi, once - 1);
    assert.notEqual(await vt().tek('SELECT 1 FROM nizamiye_pdks_gonderim WHERE id = $1', [eski!.id]), null);
    await assert.rejects(vt().sorgu('DELETE FROM nizamiye_pdks_gonderim_ham'), /30 günden eski/);
    await assert.rejects(vt().sorgu('UPDATE nizamiye_pdks_gonderim SET hatali = 1'), /yalnız ekleme/);
  });
});
