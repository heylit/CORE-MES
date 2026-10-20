import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { KATEGORILER } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { durusNedeniGetir, durusNedenleriniListele, hurdaNedeniGetir, hurdaNedenleriniListele } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const OLMAYAN_ID = 2147483647;

interface Durus {
  id: number; kod: string; ad: string; simge: string | null; kategori: string;
  cagriEkibi: string | null; cagriGecikmeDk: number | null; aktif: boolean; sira: number; surum: number;
}
interface Hurda { id: number; kod: string; ad: string; aktif: boolean; sira: number; surum: number }
interface Rol { id: number; ad: string; yonetici: boolean | null }

describe('durus-nedenleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let yetkisiz = '';
  let roller: Rol[] = [];
  let hazirDurus: Durus[] = [];
  let hazirHurda: Hurda[] = [];
  let sayac = 0;

  // Her test kendi kaydını kendi koduyla açar; hiçbiri ötekinin bıraktığına ya da hazır listeye yaslanmaz.
  const yeniKod = (): string => `T-${String(++sayac)}`;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, payload: payload as object | undefined });

  const durusYaz = (govde: Record<string, unknown>, cerez = yonetici) => istek(cerez, 'POST', '/durus-nedenleri', govde);
  const hurdaYaz = (govde: Record<string, unknown>, cerez = yonetici) => istek(cerez, 'POST', '/hurda-nedenleri', govde);
  const durusListesi = async (sorgu = ''): Promise<{ nedenler: Durus[]; onerilenKod: string }> =>
    (await istek(yonetici, 'GET', `/durus-nedenleri${sorgu}`)).json();
  const hurdaListesi = async (sorgu = ''): Promise<{ nedenler: Hurda[]; onerilenKod: string }> =>
    (await istek(yonetici, 'GET', `/hurda-nedenleri${sorgu}`)).json();

  async function durusAc(alanlar: Record<string, unknown> = {}): Promise<Durus> {
    const cevap = await durusYaz({ kod: yeniKod(), ad: 'Deneme duruş', kategori: 'planli', ...alanlar });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json();
  }

  async function hurdaAc(): Promise<Hurda> {
    const cevap = await hurdaYaz({ kod: yeniKod(), ad: 'Deneme hurda' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json();
  }

  const durusGuncelle = (neden: Durus, alanlar: Record<string, unknown>, cerez = yonetici) =>
    istek(cerez, 'POST', `/durus-nedenleri/${neden.id}/guncelle`, {
      kod: neden.kod, ad: neden.ad, kategori: neden.kategori, cagriEkibi: neden.cagriEkibi, cagriGecikmeDk: neden.cagriGecikmeDk, aktif: neden.aktif, surum: neden.surum, ...alanlar,
    });
  const hurdaGuncelle = (neden: Hurda, alanlar: Record<string, unknown>, cerez = yonetici) =>
    istek(cerez, 'POST', `/hurda-nedenleri/${neden.id}/guncelle`, { kod: neden.kod, ad: neden.ad, aktif: neden.aktif, surum: neden.surum, ...alanlar });

  // Tek işlem taşıyan yerleşik rol yok ve rol açan dış fonksiyon yok: geçici rol doğrudan yazılır.
  async function tekIslemliKisi(kullaniciAdi: string, islem: string): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi.replaceAll('-', '_')}`]);
    await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await kisiEkle(kullaniciAdi, rol?.id ?? 0);
    return girisCerezi(kullaniciAdi);
  }

  // Kişi yönetici rolüyle doğar; istenen rol uygulamanın kendi atama ve alma işleviyle verilir.
  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<void> {
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('durus_nedenleri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    roller = ((await istek(yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
    const bayraksiz = roller.find((r) => r.yonetici === false);
    if (!bayraksiz) throw new Error('Bütün işlemleri vermeyen rol yok; yetkisiz kişi kurulamadı.');
    await kisiEkle('yetkisiz', bayraksiz.id);
    yetkisiz = await girisCerezi('yetkisiz');
    // Hiçbir test yazmadan önceki liste: yalnız göçün getirdiği kayıtlar.
    hazirDurus = (await durusListesi()).nedenler;
    hazirHurda = (await hurdaListesi()).nedenler;
  });

  after(async () => { await ortam?.kaldir(); });

  test('DN-S1: göçle gelen hazır nedenler listede döner; duruşlar iki kategoriden ve çağrısız, hurdalar ayrı listeden gelir', async () => {
    assert.equal(hazirHurda.length > 0, true);
    for (const kategori of KATEGORILER) assert.equal(hazirDurus.some((n) => n.kategori === kategori), true, kategori);
    assert.deepEqual(hazirDurus.filter((n) => n.cagriEkibi !== null || n.cagriGecikmeDk !== null), []);

    await durusAc();
    await hurdaAc();
    const durus = (await durusListesi()).nedenler;
    const hurda = (await hurdaListesi()).nedenler;
    for (const neden of hazirDurus) {
      assert.deepEqual(durus.find((n) => n.id === neden.id), neden);
      assert.deepEqual(await vt().tx((db) => durusNedeniGetir(db, neden.id)), neden);
    }
    for (const neden of hazirHurda) {
      assert.deepEqual(hurda.find((n) => n.id === neden.id), neden);
      assert.deepEqual(await vt().tx((db) => hurdaNedeniGetir(db, neden.id)), neden);
    }
  });

  test('DN-01: duruş nedeni kod, ad, simge, kategori, çağrı ekibi, gecikme ve etkinlik taşır; yeni neden sona eklenir', async () => {
    const onceki = (await durusListesi()).nedenler;
    assert.equal(onceki.length > 0, true);
    const kod = yeniKod();
    const cevap = await durusYaz({ kod: kod.toLowerCase(), ad: ' Deneme nedeni ', simge: 'alert', kategori: 'plansiz', cagriEkibi: 'kalite', cagriGecikmeDk: 20 });
    assert.equal(cevap.statusCode, 200);
    const neden = cevap.json() as Durus;
    assert.deepEqual(
      { ...neden, id: undefined, sira: undefined },
      { id: undefined, kod, ad: 'Deneme nedeni', simge: 'alert', kategori: 'plansiz', cagriEkibi: 'kalite', cagriGecikmeDk: 20, aktif: true, sira: undefined, surum: 1 },
    );
    assert.equal(onceki.every((n) => n.sira < neden.sira), true);
    assert.equal((await durusListesi()).nedenler.at(-1)?.id, neden.id);
  });

  test('DN-01: kategori yalnız plansız ya da planlıdır', async () => {
    const kod = yeniKod();
    const cevap = await durusYaz({ kod, ad: 'Kategori', kategori: 'belirsiz' });
    assert.equal(cevap.statusCode, 400);
    await assert.rejects(
      vt().sorgu("INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ($1, 'Kategori', 'belirsiz', 99)", [kod]),
      /durus_nedeni_kategori/,
    );
    assert.equal((await durusYaz({ kod, ad: 'Kategori', kategori: 'planli' })).statusCode, 200);
    assert.equal((await durusYaz({ kod: yeniKod(), ad: 'Kategori', kategori: 'plansiz' })).statusCode, 200);
  });

  test('DN-03: duruş nedeninin kodu ve adı boş olamaz, kod benzersizdir', async () => {
    const kod = yeniKod();
    assert.equal((await durusYaz({ kod, ad: '   ', kategori: 'plansiz' })).statusCode, 400);
    assert.equal((await durusYaz({ kod: '  ', ad: 'Adı var', kategori: 'plansiz' })).statusCode, 400);
    assert.equal((await durusYaz({ kod: `${kod}-COK-UZUN-KOD`, ad: 'Uzun', kategori: 'plansiz' })).statusCode, 400);
    assert.equal((await durusYaz({ kod: 'a b', ad: 'Boşluklu', kategori: 'plansiz' })).statusCode, 400);
    assert.equal((await durusYaz({ kod, ad: 'İlk', kategori: 'plansiz' })).statusCode, 200);
    const yinelenen = await durusYaz({ kod: kod.toLowerCase(), ad: 'İlk yine', kategori: 'plansiz' });
    assert.equal(yinelenen.statusCode, 409);
    assert.equal(yinelenen.json().kod, 'CAKISMA');
    const ekle = (k: string, ad: string) => vt().sorgu("INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ($1, $2, 'planli', 99)", [k, ad]);
    await assert.rejects(ekle(yeniKod().toLowerCase(), 'Küçük'), /durus_nedeni_kod_bicimi/);
    await assert.rejects(ekle(kod, 'Aynı'), /durus_nedeni_kod_benzersiz/);
    await assert.rejects(ekle(yeniKod(), ' '), /durus_nedeni_ad_dolu/);
  });

  test('DN-04: hurda nedeninde de kod zorunlu ve benzersizdir', async () => {
    const kod = yeniKod();
    assert.equal((await hurdaYaz({ ad: 'Kodsuz' })).statusCode, 400);
    assert.equal((await hurdaYaz({ kod: '', ad: 'Boş kod' })).statusCode, 400);
    assert.equal((await hurdaYaz({ kod, ad: ' ' })).statusCode, 400);
    assert.equal((await hurdaYaz({ kod: kod.toLowerCase(), ad: 'İlk' })).statusCode, 200);
    const yinelenen = await hurdaYaz({ kod, ad: 'İlk yine' });
    assert.equal(yinelenen.statusCode, 409);
    assert.equal(yinelenen.json().kod, 'CAKISMA');
    await assert.rejects(vt().sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ($1, 'Aynı', 99)", [kod]), /hurda_nedeni_kod_benzersiz/);
  });

  test('DN-05: neden silinmez, pasife alınır; pasif neden id ile okunmayı sürdürür; silme ucu yoktur', async () => {
    const olusan = await durusAc();
    assert.equal(olusan.aktif, true);
    const cevap = await durusGuncelle(olusan, { aktif: false });
    assert.equal(cevap.statusCode, 200);
    assert.equal(cevap.json().aktif, false);
    const getir = await vt().tx((db) => durusNedeniGetir(db, olusan.id));
    assert.equal(getir?.aktif, false);
    assert.equal(getir?.ad, olusan.ad);
    assert.equal((await app.inject({ method: 'DELETE', url: `/api/durus-nedenleri/${olusan.id}`, headers: { cookie: yonetici } })).statusCode, 404);
    assert.equal((await durusGuncelle({ ...olusan, id: OLMAYAN_ID, kod: yeniKod() }, {})).statusCode, 404);
    assert.equal(await vt().tx((db) => durusNedeniGetir(db, OLMAYAN_ID)), null);

    const hurda = await hurdaAc();
    assert.equal((await hurdaGuncelle(hurda, { aktif: false })).statusCode, 200);
    assert.equal((await vt().tx((db) => hurdaNedeniGetir(db, hurda.id)))?.aktif, false);
    assert.equal((await hurdaGuncelle({ ...hurda, id: OLMAYAN_ID, kod: yeniKod() }, {})).statusCode, 404);
    assert.equal(await vt().tx((db) => hurdaNedeniGetir(db, OLMAYAN_ID)), null);
  });

  test('DN-06: pasif neden seçim listesinde (yalnizAktif) görünmez, yönetim listesinde görünür', async () => {
    const aktif = await durusAc();
    const pasif = await durusAc();
    assert.equal((await durusGuncelle(pasif, { aktif: false })).statusCode, 200);
    const idler = (nedenler: readonly { id: number }[]) => nedenler.map((n) => n.id);

    const hepsi = await durusListesi();
    assert.equal(hepsi.nedenler.find((n) => n.id === pasif.id)?.aktif, false);
    const aktifler = await durusListesi('?yalnizAktif=true');
    assert.equal(idler(aktifler.nedenler).includes(aktif.id), true);
    assert.equal(idler(aktifler.nedenler).includes(pasif.id), false);
    assert.equal(aktifler.nedenler.every((n) => n.aktif), true);
    const disariAktif = await vt().tx((db) => durusNedenleriniListele(db, { yalnizAktif: true }));
    assert.equal(idler(disariAktif).includes(aktif.id), true);
    assert.equal(idler(disariAktif).includes(pasif.id), false);
    assert.equal(idler(await vt().tx((db) => durusNedenleriniListele(db, { yalnizAktif: false }))).includes(pasif.id), true);

    const aktifHurda = await hurdaAc();
    const pasifHurda = await hurdaAc();
    assert.equal((await hurdaGuncelle(pasifHurda, { aktif: false })).statusCode, 200);
    assert.equal(idler((await hurdaListesi()).nedenler).includes(pasifHurda.id), true);
    const aktifHurdalar = idler((await hurdaListesi('?yalnizAktif=true')).nedenler);
    assert.equal(aktifHurdalar.includes(aktifHurda.id), true);
    assert.equal(aktifHurdalar.includes(pasifHurda.id), false);
    const disariHurda = idler(await vt().tx((db) => hurdaNedenleriniListele(db, { yalnizAktif: true })));
    assert.equal(disariHurda.includes(aktifHurda.id), true);
    assert.equal(disariHurda.includes(pasifHurda.id), false);
    assert.equal(idler(await vt().tx((db) => hurdaNedenleriniListele(db, { yalnizAktif: false }))).includes(pasifHurda.id), true);
  });

  test('DN-07: çağrı ekibi ve gecikme yalnız plansız nedende tanımlanır; ikisi birlikte dolu ya da boştur', async () => {
    const planli = await durusYaz({ kod: yeniKod(), ad: 'Planlı çağrılı', kategori: 'planli', cagriEkibi: 'bakim', cagriGecikmeDk: 3 });
    assert.equal(planli.statusCode, 200);
    assert.equal(planli.json().cagriEkibi, null);
    assert.equal(planli.json().cagriGecikmeDk, null);
    const kod = yeniKod();
    assert.equal((await durusYaz({ kod, ad: 'Yarım', kategori: 'plansiz', cagriEkibi: 'bakim' })).statusCode, 400);
    assert.equal((await durusYaz({ kod, ad: 'Yarım', kategori: 'plansiz', cagriGecikmeDk: 1 })).statusCode, 400);
    assert.equal((await durusYaz({ kod, ad: 'Eksi', kategori: 'plansiz', cagriEkibi: 'bakim', cagriGecikmeDk: -1 })).statusCode, 400);
    assert.equal((await durusYaz({ kod, ad: 'Ekip', kategori: 'plansiz', cagriEkibi: 'yok', cagriGecikmeDk: 1 })).statusCode, 400);
    const plansiz = await durusYaz({ kod, ad: 'Çağrılı', kategori: 'plansiz', cagriEkibi: 'bakim', cagriGecikmeDk: 1 });
    assert.equal(plansiz.statusCode, 200);
    assert.equal(plansiz.json().cagriEkibi, 'bakim');
    assert.equal(plansiz.json().cagriGecikmeDk, 1);
    const ekle = (kategori: string, ekip: string, gecikme: number | null) => vt().sorgu(
      "INSERT INTO durus_nedeni (kod, ad, kategori, cagri_ekibi, cagri_gecikme_dk, sira) VALUES ($1, 'a', $2, $3, $4, 99)",
      [yeniKod(), kategori, ekip, gecikme],
    );
    await assert.rejects(ekle('planli', 'amir', 1), /durus_nedeni_planlida_cagri_yok/);
    await assert.rejects(ekle('plansiz', 'amir', null), /durus_nedeni_cagri_birlikte/);
    await assert.rejects(ekle('plansiz', 'amir', -5), /durus_nedeni_gecikme/);
  });

  test('DN-08: neden planlıya çevrilince çağrı ekibi ve gecikmesi silinir', async () => {
    const neden = await durusAc({ kategori: 'plansiz', cagriEkibi: 'amir', cagriGecikmeDk: 15 });
    assert.equal(neden.cagriEkibi, 'amir');
    assert.equal(neden.cagriGecikmeDk, 15);
    const cevap = await durusGuncelle(neden, { kategori: 'planli' });
    assert.equal(cevap.statusCode, 200);
    assert.equal(cevap.json().kategori, 'planli');
    assert.equal(cevap.json().cagriEkibi, null);
    assert.equal(cevap.json().cagriGecikmeDk, null);
    const satir = await vt().tek<{ cagri_ekibi: string | null; cagri_gecikme_dk: number | null }>('SELECT cagri_ekibi, cagri_gecikme_dk FROM durus_nedeni WHERE id = $1', [neden.id]);
    assert.deepEqual(satir, { cagri_ekibi: null, cagri_gecikme_dk: null });
  });

  test('DN-S2: kod değişir, id sabit kalır; başkasının koduna değiştirmek reddedilir', async () => {
    const neden = await durusAc();
    const baskasi = await durusAc();
    const yeni = yeniKod();
    const cevap = await durusGuncelle(neden, { kod: yeni });
    assert.equal(cevap.json().id, neden.id);
    assert.equal(cevap.json().kod, yeni);
    assert.equal((await vt().tx((db) => durusNedeniGetir(db, neden.id)))?.kod, yeni);
    assert.equal((await durusGuncelle(neden, { kod: baskasi.kod })).statusCode, 409);
    assert.equal((await vt().tx((db) => durusNedeniGetir(db, neden.id)))?.kod, yeni);

    const hurda = await hurdaAc();
    const baskaHurda = await hurdaAc();
    const yeniHurda = yeniKod();
    assert.equal((await hurdaGuncelle(hurda, { kod: yeniHurda })).json().id, hurda.id);
    assert.equal((await vt().tx((db) => hurdaNedeniGetir(db, hurda.id)))?.kod, yeniHurda);
    assert.equal((await hurdaGuncelle(hurda, { kod: baskaHurda.kod })).statusCode, 409);
  });

  test('DN-S3: oturumsuz okuma 401; yazma yetkisi olmayan reddedilir, yönetici yazar', async () => {
    const durus = await durusAc();
    const hurda = await hurdaAc();
    assert.equal((await durusListesi()).nedenler.some((n) => n.id === durus.id), true);
    assert.equal((await hurdaListesi()).nedenler.some((n) => n.id === hurda.id), true);
    assert.equal((await app.inject({ method: 'GET', url: '/api/durus-nedenleri' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/api/hurda-nedenleri' })).statusCode, 401);

    const govde = { kod: yeniKod(), ad: 'Yetki', kategori: 'planli' };
    const hurdaGovdesi = { kod: yeniKod(), ad: 'Yetki' };
    assert.equal((await durusYaz(govde, yetkisiz)).statusCode, 403);
    assert.equal((await durusGuncelle(durus, { aktif: false }, yetkisiz)).statusCode, 403);
    assert.equal((await hurdaYaz(hurdaGovdesi, yetkisiz)).statusCode, 403);
    assert.equal((await hurdaGuncelle(hurda, { aktif: false }, yetkisiz)).statusCode, 403);
    assert.equal((await durusListesi()).nedenler.some((n) => n.kod === govde.kod), false);
    assert.equal((await hurdaListesi()).nedenler.some((n) => n.kod === hurdaGovdesi.kod), false);
    assert.equal((await vt().tx((db) => durusNedeniGetir(db, durus.id)))?.aktif, true);
    assert.equal((await vt().tx((db) => hurdaNedeniGetir(db, hurda.id)))?.aktif, true);

    assert.equal((await durusYaz(govde)).statusCode, 200);
    assert.equal((await hurdaYaz(hurdaGovdesi)).statusCode, 200);
    assert.equal((await durusGuncelle(durus, { aktif: false })).statusCode, 200);
    assert.equal((await hurdaGuncelle(hurda, { aktif: false })).statusCode, 200);
  });

  test('DN-S4: nedenleri yalnız kendi sayfası ya da terminal okur; ikisi de olmayan rol 403 alır', async () => {
    const durus = await durusAc();
    const hurda = await hurdaAc();
    const okur = async (cerez: string) => [
      (await istek(cerez, 'GET', '/durus-nedenleri')).statusCode,
      (await istek(cerez, 'GET', '/hurda-nedenleri?yalnizAktif=true')).statusCode,
    ];
    const sayfa = await tekIslemliKisi('dn-sayfa', 'sayfa.durus-nedenleri');
    const terminal = await tekIslemliKisi('dn-terminal', 'sayfa.terminal');
    const arkon = await tekIslemliKisi('dn-arkon', 'sayfa.arkon');
    assert.deepEqual(await okur(sayfa), [200, 200]);
    assert.deepEqual(await okur(terminal), [200, 200]);
    assert.deepEqual(await okur(arkon), [403, 403]);
    const liste = (await istek(terminal, 'GET', '/durus-nedenleri')).json<{ nedenler: Durus[] }>();
    assert.equal(liste.nedenler.some((n) => n.id === durus.id), true);
    // Okuma yetkisi yazma vermez.
    assert.equal((await durusGuncelle(durus, {}, sayfa)).statusCode, 403);
    assert.equal((await hurdaGuncelle(hurda, {}, terminal)).statusCode, 403);
  });

  test('DN-S5: disari.ts okuması uç yetkisinden geçmez; HTTP ile okuyamayan Arkon da nedenleri sunucuda alır', async () => {
    const durus = await durusAc({ kategori: 'plansiz' });
    const hurda = await hurdaAc();
    const arkon = await tekIslemliKisi('dn-arkon-disari', 'sayfa.arkon');
    assert.equal((await istek(arkon, 'GET', '/durus-nedenleri')).statusCode, 403);
    // Arkon'un çağrısıyla aynı: kullanıcısız, pasifler dahil (arkon/servis.ts).
    const durusSecim = await vt().tx((db) => durusNedenleriniListele(db, { yalnizAktif: false }));
    const hurdaSecim = await vt().tx((db) => hurdaNedenleriniListele(db, { yalnizAktif: false }));
    assert.equal(durusSecim.some((n) => n.id === durus.id && n.kod === durus.kod), true);
    assert.equal(hurdaSecim.some((n) => n.id === hurda.id && n.kod === hurda.kod), true);
    assert.equal((await vt().tx((db) => durusNedeniGetir(db, durus.id)))?.kod, durus.kod);
    assert.equal((await vt().tx((db) => hurdaNedeniGetir(db, hurda.id)))?.kod, hurda.kod);
  });

  // Yazma yalnız müdür ve planlamada (kullanıcı kararları 139 a ve 160 a); öteki roller reddedilir.
  test('DN-S3: yazma işlemi yalnız müdür ve planlama rolündedir; öteki her rol reddedilir', async () => {
    const durus = await durusAc();
    const hurda = await hurdaAc();
    // Rol listesini yönetici okudu: bayrak her rolde görünür, null gelen rol ölçüm dışında kalmaz.
    assert.equal(roller.every((r) => r.yonetici !== null), true);
    const yazanlar = ['Müdür', 'Planlama ve Proje'];
    const yazamayanlar = roller.filter((r) => r.yonetici === false && !yazanlar.includes(r.ad));
    assert.equal(yazamayanlar.length > 0 && yazamayanlar.length < roller.length, true);

    const dene = async (cerez: string, d: Durus = durus, h: Hurda = hurda) => [
      (await durusYaz({ kod: yeniKod(), ad: 'Rol denemesi', kategori: 'planli' }, cerez)).statusCode,
      (await durusGuncelle(d, {}, cerez)).statusCode,
      (await hurdaYaz({ kod: yeniKod(), ad: 'Rol denemesi' }, cerez)).statusCode,
      (await hurdaGuncelle(h, {}, cerez)).statusCode,
    ];
    for (const rol of yazamayanlar) {
      const kullaniciAdi = `rol-${String(rol.id)}`;
      await kisiEkle(kullaniciAdi, rol.id);
      assert.deepEqual(await dene(await girisCerezi(kullaniciAdi)), [403, 403, 403, 403], rol.ad);
    }
    assert.deepEqual(await dene(yonetici), [200, 200, 200, 200]);
    for (const rol of roller.filter((r) => yazanlar.includes(r.ad))) {
      const kullaniciAdi = `rol-${String(rol.id)}`;
      await kisiEkle(kullaniciAdi, rol.id);
      assert.deepEqual(await dene(await girisCerezi(kullaniciAdi), await durusAc(), await hurdaAc()), [200, 200, 200, 200], rol.ad);
    }
    assert.equal(roller.filter((r) => yazanlar.includes(r.ad)).length, yazanlar.length);
  });

  test('DN-09: önerilen kod en büyük sayının bir fazlasıdır; pasife alınan nedenin kodu yeniden önerilmez', async () => {
    const sayisi = (kod: string): number => Number(kod.split('-')[1]);
    const olcumler = [
      { onek: 'D', listele: durusListesi, ac: (kod: string) => durusAc({ kod }), pasifeAl: (n: { id: number }) => durusGuncelle(n as Durus, { aktif: false }) },
      { onek: 'H', listele: hurdaListesi, ac: async (kod: string) => (await hurdaYaz({ kod, ad: 'Deneme hurda' })).json() as Hurda, pasifeAl: (n: { id: number }) => hurdaGuncelle(n as Hurda, { aktif: false }) },
    ];
    for (const { onek, listele, ac, pasifeAl } of olcumler) {
      const ilk = (await listele()).onerilenKod;
      assert.equal(ilk.startsWith(`${onek}-`) && Number.isInteger(sayisi(ilk)), true, ilk);

      // Araya boşluk bırakan kod: öneri boşluğu doldurmaz, en büyüğün ardından gelir.
      const ileride = await ac(`${onek}-${String(sayisi(ilk) + 5)}`);
      assert.equal(sayisi((await listele()).onerilenKod), sayisi(ileride.kod) + 1, onek);

      assert.equal((await pasifeAl(ileride)).statusCode, 200);
      const secimListesi = await listele('?yalnizAktif=true');
      assert.equal(secimListesi.nedenler.some((n) => n.id === ileride.id), false);
      assert.equal(sayisi(secimListesi.onerilenKod), sayisi(ileride.kod) + 1, `${onek} seçim listesi`);
      assert.equal(sayisi((await listele()).onerilenKod), sayisi(ileride.kod) + 1, `${onek} yönetim listesi`);
    }
  });

  test('DN-11: hurda nedeni yalnız kod, ad, etkinlik ve sıra taşır', async () => {
    const yaz = await hurdaYaz({ kod: yeniKod(), ad: 'Fazlalık', kategori: 'planli', cagriEkibi: 'amir', simge: 'alert' });
    assert.equal(yaz.statusCode, 200);
    assert.deepEqual(Object.keys(yaz.json()).sort(), ['ad', 'aktif', 'id', 'kod', 'sira', 'surum']);
    const listedeki = (await hurdaListesi()).nedenler.find((n) => n.id === (yaz.json() as Hurda).id);
    assert.deepEqual(Object.keys(listedeki ?? {}).sort(), ['ad', 'aktif', 'id', 'kod', 'sira', 'surum']);
    assert.equal((await vt().sorgu<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'hurda_nedeni' AND table_schema = current_schema()")).some((s) => ['kategori', 'cagri_ekibi', 'simge'].includes(s.column_name)), false);
  });

  test('DN-S6: düzenleme okunan sürümü ister; eski sürümle yazan 409 alır ve kayıt değişmez, sürümsüz gövde 400', async () => {
    const neden = await durusAc();
    assert.equal(neden.surum, 1);
    const ilk = await durusGuncelle(neden, { ad: 'Birinci düzeltme' });
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal((ilk.json() as Durus).surum, 2);
    const eski = await durusGuncelle(neden, { ad: 'Eski sürümle düzeltme' });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal((await vt().tx((db) => durusNedeniGetir(db, neden.id)))?.ad, 'Birinci düzeltme');
    assert.equal((await durusGuncelle(neden, { surum: undefined })).statusCode, 400);
    assert.equal((await durusGuncelle({ ...neden, id: OLMAYAN_ID, kod: yeniKod() }, {})).statusCode, 404);

    const hurda = await hurdaAc();
    assert.equal(hurda.surum, 1);
    const hIlk = await hurdaGuncelle(hurda, { ad: 'Birinci düzeltme' });
    assert.equal(hIlk.statusCode, 200, hIlk.body);
    assert.equal((hIlk.json() as Hurda).surum, 2);
    assert.equal((await hurdaGuncelle(hurda, { ad: 'Eski sürümle düzeltme' })).statusCode, 409);
    assert.equal((await vt().tx((db) => hurdaNedeniGetir(db, hurda.id)))?.ad, 'Birinci düzeltme');
    assert.equal((await hurdaGuncelle(hurda, { surum: undefined })).statusCode, 400);
  });

  test('yazma denetim kaydına düşer; parametre biçimsizse 400', async () => {
    assert.equal((await istek(yonetici, 'POST', '/durus-nedenleri/abc/guncelle', { kod: yeniKod(), ad: 'a', kategori: 'planli', aktif: true })).statusCode, 400);
    const say = async (): Promise<number> =>
      (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM denetim_kaydi WHERE yol = '/durus-nedenleri'"))?.n ?? 0;
    const once = await say();
    await durusAc();
    assert.equal(await say() > once, true);
  });
});
