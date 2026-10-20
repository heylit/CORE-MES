import { crc32 } from 'node:zlib';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { AYAR_TANIMLARI, ayarAnahtariMi, varsayilanDeger } from '#paylasilan/ayarlar.ts';
import { KAPATILABILIR_YOLLAR, yolKapaliMi } from '#paylasilan/sayfalar.ts';
import type { Ayar, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { sistemAyariOku } from './disari.ts';
import { ayarDegistir } from './servis.ts';
import { ayarDegeriniOku, ayarDegeriniYaz } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
const DORT_GOZ = 'malzemeler.dort-goz';
const VARSAYILAN = AYAR_TANIMLARI[DORT_GOZ].varsayilan;
const DEGISTIR_YOLU = '/ayarlar/:anahtar/degistir';

interface Rol { id: number; ad: string; yonetici: boolean | null }
interface Satir { anahtar: string; deger: unknown; kisi: number; guncelleme: Date }
interface Kayit { kisi_id: number | null; parametre: unknown; govde: unknown }

describe('ayarlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let ikinciYonetici = '';
  let ikinciYoneticiId = 0;
  // Bütün işlemleri vermeyen her rol için o rolü tek başına taşıyan bir kişi.
  let bayraksizlar: { rol: Rol; cerez: string }[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez }, payload: payload as object | undefined });

  const listele = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/ayarlar');
  const degistir = (deger: unknown, cerez: string | null = yonetici, anahtar: string = DORT_GOZ) =>
    istek(cerez, 'POST', `/ayarlar/${anahtar}/degistir`, deger === undefined ? {} : { deger });

  async function listedeki(anahtar: string = DORT_GOZ): Promise<Ayar | undefined> {
    const cevap = await listele();
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as AyarlarCevabi).ayarlar.find((a) => a.anahtar === anahtar);
  }

  const disaridanOku = (): Promise<boolean> => vt().tx((db) => sistemAyariOku(db, DORT_GOZ));
  const satirlar = (): Promise<Satir[]> =>
    vt().sorgu<Satir>('SELECT anahtar, deger, guncelleyen_kisi_id AS kisi, guncelleme FROM ayar ORDER BY anahtar');
  // Uç katmanının komut kaydı gövdede yalnız yeni değeri taşır; değişiklik kaydı eski değeri de taşır.
  const degisiklikKayitlari = (): Promise<Kayit[]> =>
    vt().sorgu<Kayit>("SELECT kisi_id, parametre, govde FROM denetim_kaydi WHERE yol = $1 AND govde ? 'eski' ORDER BY id", [DEGISTIR_YOLU]);
  const islemleri = async (cerez: string): Promise<string[]> =>
    ((await istek(cerez, 'GET', '/oturum')).json() as { kullanici: { islemler: string[] } }).kullanici.islemler;

  // Kişi yönetici rolüyle doğar; istenen rol uygulamanın kendi atama ve alma işleviyle verilir.
  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<void> {
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    ikinciYoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme İkinci Yönetici', kullaniciAdi: 'yonetici2', parola: PAROLA }));
    ikinciYonetici = await girisCerezi('yonetici2');
    const roller = ((await istek(yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
    for (const rol of roller.filter((r) => r.yonetici !== true)) {
      const kullaniciAdi = `rol-${String(rol.id)}`;
      await kisiEkle(kullaniciAdi, rol.id);
      bayraksizlar.push({ rol, cerez: await girisCerezi(kullaniciAdi) });
    }
  });

  after(async () => { await ortam?.kaldir(); });

  // Her test hiç yazılmamış ayarla başlar.
  beforeEach(async () => { await vt().sorgu('DELETE FROM ayar'); });

  test('yönetici ayarları okur ve değiştirir; bayraksız hiçbir rol okuyamaz, değiştiremez; oturumsuz istek 401 alır', async () => {
    assert.equal(bayraksizlar.length > 0, true, 'bütün işlemleri vermeyen rol yok');
    for (const { rol, cerez } of bayraksizlar) {
      assert.equal((await listele(cerez)).statusCode, 403, `${rol.ad}: okuma`);
      assert.equal((await degistir(!VARSAYILAN, cerez)).statusCode, 403, `${rol.ad}: yazma`);
    }
    assert.equal((await listele(null)).statusCode, 401);
    assert.equal((await degistir(!VARSAYILAN, null)).statusCode, 401);
    // Reddedilen yazmalar değeri değiştirmedi; kabul edilen değiştirir.
    assert.deepEqual(await satirlar(), []);
    assert.equal((await listele()).statusCode, 200);
    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
    assert.equal(await disaridanOku(), !VARSAYILAN);
  });

  test('sayfa ve yazma işlemi yalnız yöneticinin oturumunda vardır; hiçbir role verilmemiştir', async () => {
    const yoneticininki = await islemleri(yonetici);
    assert.equal(yoneticininki.includes('sayfa.ayarlar'), true);
    assert.equal(yoneticininki.includes('ayarlar.yaz'), true);
    for (const { rol, cerez } of bayraksizlar) {
      const liste = await islemleri(cerez);
      assert.equal(liste.includes('sayfa.ayarlar'), false, rol.ad);
      assert.equal(liste.includes('ayarlar.yaz'), false, rol.ad);
    }
  });

  test('hiç yazılmamış ayar tanımın varsayılanını döner; okumak satır oluşturmaz', async () => {
    const ayar = await listedeki();
    assert.deepEqual(ayar, {
      anahtar: DORT_GOZ, baslik: AYAR_TANIMLARI[DORT_GOZ].baslik, aciklama: AYAR_TANIMLARI[DORT_GOZ].aciklama,
      tur: 'boolean', deger: VARSAYILAN,
    });
    assert.equal(await disaridanOku(), VARSAYILAN);
    assert.deepEqual(await satirlar(), []);
    // Kullanıcı kararı: dört göz kuralı kimse dokunmadıkça açıktır.
    assert.equal(await disaridanOku(), true);
  });

  test('yazılan değer listeden ve dışa açık okumadan geri okunur; ilk yazma satırı açar, sonraki aynı satırı günceller', async () => {
    const ilk = await degistir(!VARSAYILAN);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal((ilk.json() as Ayar).deger, !VARSAYILAN);
    assert.equal((await listedeki())?.deger, !VARSAYILAN);
    assert.equal(await disaridanOku(), !VARSAYILAN);
    assert.deepEqual((await satirlar()).map(({ anahtar, deger, kisi }) => ({ anahtar, deger, kisi })),
      [{ anahtar: DORT_GOZ, deger: !VARSAYILAN, kisi: yoneticiId }]);

    // Varsayılana geri dönüş de saklanır: satır varken varsayılan değil saklanan geçerlidir.
    assert.equal((await degistir(VARSAYILAN)).statusCode, 200);
    assert.equal((await listedeki())?.deger, VARSAYILAN);
    assert.equal(await disaridanOku(), VARSAYILAN);
    assert.deepEqual((await satirlar()).map(({ anahtar, deger }) => ({ anahtar, deger })), [{ anahtar: DORT_GOZ, deger: VARSAYILAN }]);
  });

  test('tanımsız anahtar yazılamaz (404) ve listede yoktur; veritabanında kalmış tanımsız satır da listeye girmez', async () => {
    const cevap = await degistir(true, yonetici, 'malzemeler.boyle-ayar-yok');
    assert.equal(cevap.statusCode, 404, cevap.body);
    assert.equal((await degistir(true, yonetici, 'toString')).statusCode, 404);
    assert.deepEqual(await satirlar(), []);

    await vt().sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('eski.kaldirilan', 'true', $1)", [yoneticiId]);
    const liste = await listele();
    assert.equal(liste.statusCode, 200, liste.body);
    const anahtarlar = (liste.json() as AyarlarCevabi).ayarlar.map((a) => a.anahtar);
    assert.equal(anahtarlar.includes(DORT_GOZ), true);
    assert.equal(anahtarlar.includes('eski.kaldirilan'), false);
  });

  test('tanımın türüne uymayan değer 400 ile reddedilir ve değeri değiştirmez', async () => {
    for (const deger of ['false', 0, null, undefined, { acik: false }]) {
      const cevap = await degistir(deger);
      assert.equal(cevap.statusCode, 400, `${JSON.stringify(deger)}: ${cevap.body}`);
      assert.equal((cevap.json() as { alan?: string }).alan, 'deger');
    }
    assert.equal(await disaridanOku(), VARSAYILAN);
    assert.deepEqual(await satirlar(), []);
    // Karşı örnek: aynı yoldan doğru türdeki değer kabul edilir.
    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
  });

  test('her değişiklik denetim kaydına kim, hangi ayar, eski ve yeni değerle düşer', async () => {
    const onceki = (await degisiklikKayitlari()).length;
    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
    assert.equal((await degistir(VARSAYILAN)).statusCode, 200);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki), [
      { kisi_id: yoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: VARSAYILAN, yeni: !VARSAYILAN } },
      { kisi_id: yoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: !VARSAYILAN, yeni: VARSAYILAN } },
    ]);
  });

  test('değişiklik kaydı uç kaydı gibi modülü ve yetkiyi taşır', async () => {
    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
    assert.equal((await degistir(VARSAYILAN)).statusCode, 200);
    const kayitlar = await vt().sorgu<{ modul: string | null; yetki: string | null }>(
      "SELECT modul, yetki FROM denetim_kaydi WHERE yol = $1 AND govde ? 'eski' ORDER BY id", [DEGISTIR_YOLU]);
    assert.ok(kayitlar.length >= 2);
    for (const k of kayitlar) assert.deepEqual(k, { modul: 'ayarlar', yetki: 'ayarlar.yaz' });
  });

  test('değiştiren kişi komutu veren kişidir: satır ve değişiklik kaydı her seferinde o kişiyi taşır', async () => {
    assert.notEqual(ikinciYoneticiId, yoneticiId);
    const onceki = (await degisiklikKayitlari()).length;
    assert.equal((await degistir(!VARSAYILAN, ikinciYonetici)).statusCode, 200);
    assert.deepEqual((await satirlar()).map((s) => s.kisi), [ikinciYoneticiId]);
    assert.equal((await degistir(VARSAYILAN, yonetici)).statusCode, 200);
    assert.deepEqual((await satirlar()).map((s) => s.kisi), [yoneticiId]);
    assert.equal((await degistir(!VARSAYILAN, ikinciYonetici)).statusCode, 200);
    assert.deepEqual((await satirlar()).map((s) => s.kisi), [ikinciYoneticiId]);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki).map((k) => k.kisi_id), [ikinciYoneticiId, yoneticiId, ikinciYoneticiId]);
  });

  test('aynı değeri yazmak değişiklik değildir: kabul edilir, değişiklik kaydı düşmez, satır yazılmaz ve güncellenmez', async () => {
    const onceki = (await degisiklikKayitlari()).length;
    // Satır yokken varsayılanı yazmak satır açmaz.
    assert.equal((await degistir(VARSAYILAN)).statusCode, 200);
    assert.deepEqual(await satirlar(), []);
    assert.equal((await degisiklikKayitlari()).length, onceki);

    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
    const yazilan = await satirlar();
    assert.equal((await degisiklikKayitlari()).length, onceki + 1);
    const yinelenen = await degistir(!VARSAYILAN);
    assert.equal(yinelenen.statusCode, 200);
    assert.equal((yinelenen.json() as Ayar).deger, !VARSAYILAN);
    assert.deepEqual(await satirlar(), yazilan);
    assert.equal((await degisiklikKayitlari()).length, onceki + 1);
  });

  test('saklanan değer tanımın türüne uymuyorsa okuma varsayılana dönmez: dış okuma hata verir, liste o ayarı değersiz ve işaretli verir', async () => {
    await vt().sorgu(`INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, '"kapali"', $2)`, [DORT_GOZ, yoneticiId]);
    // Kullanıcının düzeltebileceği bir hata değildir: uygulama hatası olarak değil, beklenmeyen hata olarak çıkar.
    await assert.rejects(disaridanOku(), (hata: unknown) => hata instanceof Error && !(hata instanceof UygulamaHatasi));
    // KD-015: tek bozuk satır listeyi düşürmez; o ayar null ve işaretli, ötekiler değeriyle gelir.
    const liste = await listele();
    assert.equal(liste.statusCode, 200, liste.body);
    const ayarlar = (liste.json() as AyarlarCevabi).ayarlar;
    assert.equal(ayarlar.length, Object.keys(AYAR_TANIMLARI).length);
    assert.deepEqual(ayarlar.find((a) => a.anahtar === DORT_GOZ), {
      anahtar: DORT_GOZ, baslik: AYAR_TANIMLARI[DORT_GOZ].baslik, aciklama: AYAR_TANIMLARI[DORT_GOZ].aciklama,
      gecersiz: true, tur: 'boolean', deger: null,
    });
    for (const ayar of ayarlar.filter((a) => a.anahtar !== DORT_GOZ)) {
      assert.equal(ayar.gecersiz, undefined, ayar.anahtar);
      // Ötekilerin satırı yoktur: her biri kendi varsayılanıyla gelir; varsayılanı boş olan sayı ayarı null gelir.
      assert.equal(ayarAnahtariMi(ayar.anahtar), true, ayar.anahtar);
      if (ayarAnahtariMi(ayar.anahtar)) assert.equal(ayar.deger, varsayilanDeger(ayar.anahtar), ayar.anahtar);
    }
    // Karşı örnek: aynı satır doğru türde olunca okunur ve işaret kalkar.
    await vt().sorgu(`UPDATE ayar SET deger = 'false' WHERE anahtar = $1`, [DORT_GOZ]);
    assert.equal(await disaridanOku(), false);
    assert.deepEqual(await listedeki(), {
      anahtar: DORT_GOZ, baslik: AYAR_TANIMLARI[DORT_GOZ].baslik, aciklama: AYAR_TANIMLARI[DORT_GOZ].aciklama, tur: 'boolean', deger: false,
    });
  });

  test('türe uymayan saklanan değer ekrandan onarılır: liste onu işaretli verir, değiştirme kabul edilir, kayıt ham eski değeri taşır', async () => {
    await vt().sorgu(`INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, '"kapali"', $2)`, [DORT_GOZ, yoneticiId]);
    const onceki = (await degisiklikKayitlari()).length;
    assert.equal((await listedeki())?.gecersiz, true);
    // Geçersiz yeni değer bozuk satırda da reddedilir; onarım yalnız türe uyan değerle olur.
    assert.equal((await degistir('acik')).statusCode, 400);
    assert.equal((await listedeki())?.gecersiz, true);

    const cevap = await degistir(false);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal((await listedeki())?.gecersiz, undefined);
    assert.equal((await listedeki())?.deger, false);
    assert.equal(await disaridanOku(), false);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki), [
      { kisi_id: yoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: 'kapali', yeni: false } },
    ]);
  });

  // İlk komut transaction'ını açık tutar; ikinci komut başlar ve kilit beklediği görülünce ilki biter.
  async function ustUste(ilk: boolean, ikinci: boolean): Promise<Ayar> {
    let ikinciKomut: Promise<Ayar> | undefined;
    await vt().tx(async (db) => {
      await ayarDegistir(db, yoneticiId, DORT_GOZ, ilk);
      ikinciKomut = vt().tx((db2) => ayarDegistir(db2, ikinciYoneticiId, DORT_GOZ, ikinci));
      ikinciKomut.catch(() => undefined);
      for (let tur = 0; ; tur += 1) {
        const bekleyen = await vt().tek<{ sayi: number }>(
          "SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
        if ((bekleyen?.sayi ?? 0) > 0) break;
        if (tur > 400) throw new Error('ikinci komut kilit beklemedi');
        await new Promise((bitti) => setTimeout(bitti, 10));
      }
    });
    if (!ikinciKomut) throw new Error('ikinci komut başlamadı');
    return ikinciKomut;
  }

  test('KD-016: aynı ayarı aynı anda değiştiren ikinci komut birinciyi bekler; kaydı birincinin yazdığını eski değer olarak taşır', async () => {
    // Satır varken: ikisi de aynı değeri yazar; ikincisi değişiklik değildir, ikinci kayıt düşmez.
    assert.equal((await degistir(!VARSAYILAN)).statusCode, 200);
    let onceki = (await degisiklikKayitlari()).length;
    assert.equal((await ustUste(VARSAYILAN, VARSAYILAN)).deger, VARSAYILAN);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki), [
      { kisi_id: yoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: !VARSAYILAN, yeni: VARSAYILAN } },
    ]);
    assert.deepEqual((await satirlar()).map(({ deger, kisi }) => ({ deger, kisi })), [{ deger: VARSAYILAN, kisi: yoneticiId }]);

    // Satır yokken: ikisi de satırı açmaya çalışır; ikincisi açılanı eski değer olarak görür ve üstüne yazar.
    await vt().sorgu('DELETE FROM ayar');
    onceki = (await degisiklikKayitlari()).length;
    assert.equal((await ustUste(!VARSAYILAN, VARSAYILAN)).deger, VARSAYILAN);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki), [
      { kisi_id: yoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: VARSAYILAN, yeni: !VARSAYILAN } },
      { kisi_id: ikinciYoneticiId, parametre: { anahtar: DORT_GOZ }, govde: { eski: !VARSAYILAN, yeni: VARSAYILAN } },
    ]);
    assert.deepEqual((await satirlar()).map(({ deger, kisi }) => ({ deger, kisi })), [{ deger: VARSAYILAN, kisi: ikinciYoneticiId }]);
    assert.equal(await disaridanOku(), VARSAYILAN);

    // Satır yokken ikisi de aynı değeri yazar: tek satır, tek kayıt.
    await vt().sorgu('DELETE FROM ayar');
    onceki = (await degisiklikKayitlari()).length;
    assert.equal((await ustUste(!VARSAYILAN, !VARSAYILAN)).deger, !VARSAYILAN);
    assert.deepEqual((await degisiklikKayitlari()).slice(onceki).map((k) => k.kisi_id), [yoneticiId]);
    assert.deepEqual((await satirlar()).map(({ deger, kisi }) => ({ deger, kisi })), [{ deger: !VARSAYILAN, kisi: yoneticiId }]);
  });

  test('geri alınan komut iz bırakmaz: değer, satır ve değişiklik kaydı birlikte geri alınır', async () => {
    const onceki = (await degisiklikKayitlari()).length;
    const yarida = new Error('komut yarıda kaldı');
    await assert.rejects(vt().tx(async (db) => {
      const ayar = await ayarDegistir(db, yoneticiId, DORT_GOZ, !VARSAYILAN);
      // Değişiklik transaction içinde görünüyordu; geri alınan hayali bir yazı değil.
      assert.equal(ayar.deger, !VARSAYILAN);
      assert.equal(await sistemAyariOku(db, DORT_GOZ), !VARSAYILAN);
      throw yarida;
    }), yarida);
    assert.equal(await disaridanOku(), VARSAYILAN);
    assert.deepEqual(await satirlar(), []);
    assert.equal((await degisiklikKayitlari()).length, onceki);
  });

  test('80 karakteri aşan anahtar aranmadan 400 ile reddedilir; sınırdaki tanımsız anahtar 404 alır', async () => {
    const uzun = await degistir(true, yonetici, 'a'.repeat(81));
    assert.equal(uzun.statusCode, 400, uzun.body);
    assert.equal((uzun.json() as { alan?: string }).alan, 'anahtar');
    assert.equal((await degistir(true, yonetici, 'a'.repeat(80))).statusCode, 404);
  });

  test('tablo: değersiz satır, biçimsiz anahtar ve var olmayan kişi reddedilir; değiştireni olan kişi silinemez', async () => {
    const ekle = (anahtar: string, deger: string | null, kisi: number) =>
      vt().sorgu('INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2::jsonb, $3)', [anahtar, deger, kisi]);
    await assert.rejects(ekle('deneme.ayar', null, yoneticiId), /"deger"/);
    await assert.rejects(ekle('Deneme Ayar', 'true', yoneticiId), /ayar_anahtar_bicimi/);
    await assert.rejects(ekle('deneme.ayar', 'true', 2147483647), /ayar_guncelleyen_kisi_id_fkey/);
    // Girişi olmayan personel: başka hiçbir tabloda izi yoktur, silinmesini yalnız ayar satırı engeller.
    const personel = (await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Personel') RETURNING id"))?.id ?? 0;
    await ekle('deneme.ayar', 'true', personel);
    await assert.rejects(ekle('deneme.ayar', 'false', yoneticiId), /ayar_pkey/);
    await assert.rejects(vt().sorgu('DELETE FROM kisi WHERE id = $1', [personel]), /ayar_guncelleyen_kisi_id_fkey/);
    assert.deepEqual((await satirlar()).map((s) => s.kisi), [personel]);
    // Karşı örnek: ayar satırı gidince aynı kişi silinir.
    await vt().sorgu('DELETE FROM ayar');
    await vt().sorgu('DELETE FROM kisi WHERE id = $1', [personel]);
  });

  // Boş sayı ayarı (null) satırıyla saklanır: satırın yokluğu "hiç yazılmamış" demektir ve varsayılana düşer,
  // boş değer düşmemelidir (varsayılanı dolu bir sayı ayarında ikisi ayrı şeylerdir).
  test('boş değer satırıyla yazılır ve satırıyla okunur; satırsız ayardan ayrılır', async () => {
    const anahtar = 'deneme.bos-sayi';
    assert.equal(await ayarDegeriniOku(vt(), anahtar), null);
    try {
      await ayarDegeriniYaz(vt(), anahtar, 20, yoneticiId);
      await ayarDegeriniYaz(vt(), anahtar, null, yoneticiId);
      assert.deepEqual(await ayarDegeriniOku(vt(), anahtar), { deger: null });
    } finally {
      await vt().sorgu('DELETE FROM ayar WHERE anahtar = $1', [anahtar]);
    }
  });

  describe('kapalı sayfalar', () => {
    const oku = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/kapali-sayfalar');
    const yaz = (yol: unknown, kapali: unknown, cerez: string | null = yonetici) =>
      istek(cerez, 'POST', '/kapali-sayfalar/degistir', { yol, kapali });
    const kayitlar = (): Promise<{ govde: unknown }[]> =>
      vt().sorgu("SELECT govde FROM denetim_kaydi WHERE yol = '/kapali-sayfalar/degistir' AND govde ? 'eski' ORDER BY id");

    test('ana sayfa ve Sistem Ayarları kapatılamaz; kapalı yolun altı da kapalıdır', () => {
      assert.equal(KAPATILABILIR_YOLLAR.includes('/'), false);
      assert.equal(KAPATILABILIR_YOLLAR.some((y) => y === '/ayarlar' || y.startsWith('/ayarlar/')), false);
      assert.equal(KAPATILABILIR_YOLLAR.includes('/finans'), true);
      assert.equal(yolKapaliMi('/finans/cari', ['/finans']), true);
      assert.equal(yolKapaliMi('/finans', ['/finans']), true);
      assert.equal(yolKapaliMi('/finansal', ['/finans']), false);
    });

    test('her oturum okur, yalnız ayar yazan değiştirir; liste kod sırasıyla tutulur; değişiklik eski ve yeniyle kaydedilir', async () => {
      assert.deepEqual((await oku()).json(), { kapali: [] });
      assert.equal((await oku(null)).statusCode, 401);
      for (const { rol, cerez } of bayraksizlar) assert.equal((await yaz('/finans', true, cerez)).statusCode, 403, rol.ad);
      assert.deepEqual(await satirlar(), []);
      const ikisi = KAPATILABILIR_YOLLAR.slice(0, 2);
      assert.equal((await yaz(ikisi[1], true)).statusCode, 200);
      const cevap = await yaz(ikisi[0], true);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.deepEqual(cevap.json(), { kapali: ikisi });
      for (const { rol, cerez } of bayraksizlar) assert.deepEqual((await oku(cerez)).json(), { kapali: ikisi }, rol.ad);
      assert.equal(await listedeki('kabuk.kapali-sayfalar'), undefined);
      // Aynı durumu yeniden yazmak değişiklik değildir.
      assert.equal((await yaz(ikisi[0], true)).statusCode, 200);
      assert.equal((await yaz(ikisi[0], false)).statusCode, 200);
      assert.equal((await yaz(ikisi[1], false)).statusCode, 200);
      assert.deepEqual(await satirlar(), []);
      assert.deepEqual((await kayitlar()).map((k) => k.govde), [
        { eski: [], yeni: [ikisi[1]] }, { eski: [ikisi[1]], yeni: ikisi }, { eski: ikisi, yeni: [ikisi[1]] }, { eski: [ikisi[1]], yeni: [] },
      ]);
    });

    test('bir sayfayı açmak öteki kapalı sayfalara dokunmaz (eski liste gösteren ekran hepsini geri açamaz)', async () => {
      const [a, b, c] = KAPATILABILIR_YOLLAR;
      for (const yol of [a, b, c]) assert.equal((await yaz(yol, true)).statusCode, 200, yol);
      const cevap = await yaz(b, false);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.deepEqual(cevap.json(), { kapali: [a, c] });
      // Eski biçim (liste) reddedilir: tüm listeyi ezen yazma yolu kalmaz.
      assert.equal((await istek(yonetici, 'POST', '/kapali-sayfalar/degistir', { kapali: [] })).statusCode, 400);
      assert.deepEqual((await oku()).json(), { kapali: [a, c] });
      for (const yol of [a, c]) assert.equal((await yaz(yol, false)).statusCode, 200, yol);
    });

    test('korunan ve bilinmeyen yol 400; saklı bilinmeyen yol okunurken düşer', async () => {
      for (const yol of ['/', '/ayarlar', '/olmayan-sayfa']) {
        const cevap = await yaz(yol, true);
        assert.equal(cevap.statusCode, 400, yol);
      }
      assert.deepEqual(await satirlar(), []);
      await vt().tx((db) => ayarDegeriniYaz(db, 'kabuk.kapali-sayfalar', ['/eski-sayfa', '/finans'], yoneticiId));
      assert.deepEqual((await oku()).json(), { kapali: ['/finans'] });
    });
  });

  describe('kurum logosu', () => {
    // Tarayıcının yeniden çizdiği biçimde 1x1 PNG: IHDR, IDAT, IEND.
    const PNG_BAYT = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
    const PNG = `data:image/png;base64,${PNG_BAYT}`;
    const logoOku = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/kurum-logosu');
    const logoYaz = (logo: unknown, cerez: string | null = yonetici) => istek(cerez, 'POST', '/kurum-logosu/degistir', { logo });

    test('her oturum okur, yalnız ayar yazan değiştirir; oturumsuz 401; satır listeye ve genel uca girmez', async () => {
      assert.deepEqual((await logoOku()).json(), { logo: null });
      assert.equal((await logoOku(null)).statusCode, 401);
      assert.equal((await logoYaz(PNG, null)).statusCode, 401);
      for (const { rol, cerez } of bayraksizlar) assert.equal((await logoYaz(PNG, cerez)).statusCode, 403, rol.ad);
      assert.deepEqual(await satirlar(), []);
      const yazilan = await logoYaz(PNG);
      assert.equal(yazilan.statusCode, 200, yazilan.body);
      assert.deepEqual(yazilan.json(), { logo: PNG });
      for (const { rol, cerez } of bayraksizlar) assert.deepEqual((await logoOku(cerez)).json(), { logo: PNG }, rol.ad);
      assert.equal((await listedeki('kabuk.logo')), undefined);
      assert.equal((await degistir(PNG, yonetici, 'kabuk.logo')).statusCode, 404);
    });

    test('kaldırmak satırı siler; biçimsiz ve büyük resim 400; bozuk saklanan değer resim olarak verilmez', async () => {
      assert.equal((await logoYaz(PNG)).statusCode, 200);
      assert.equal((await logoYaz(null)).statusCode, 200);
      assert.deepEqual(await satirlar(), []);
      assert.deepEqual((await logoOku()).json(), { logo: null });
      for (const kotu of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', `data:image/png;base64,${'A'.repeat(200_000)}`, 5]) {
        assert.equal((await logoYaz(kotu)).statusCode, 400, String(kotu).slice(0, 30));
      }
      assert.deepEqual(await satirlar(), []);
      await vt().tx((db) => ayarDegeriniYaz(db, 'kabuk.logo', 'data:text/html,<p>', yoneticiId));
      assert.deepEqual((await logoOku()).json(), { logo: null });
    });

    test('giriş logosu oturumsuz okunur ve yalnız yüklenen görseldir; logo ucu oturumlu kalır; yokken 204', async () => {
      const girisOku = () => istek(null, 'GET', '/giris-logosu');
      assert.equal((await girisOku()).statusCode, 204);
      assert.equal((await logoYaz(PNG)).statusCode, 200);
      assert.equal((await logoOku(null)).statusCode, 401);
      const okunan = await girisOku();
      assert.equal(okunan.statusCode, 200, okunan.body);
      assert.equal(okunan.headers['content-type'], 'image/png');
      assert.deepEqual(okunan.rawPayload, Buffer.from(PNG_BAYT, 'base64'));
      assert.equal(okunan.headers['cache-control'], 'private, no-store');
      assert.equal(okunan.headers['x-content-type-options'], 'nosniff');
      assert.equal(okunan.headers['content-security-policy'], "default-src 'none'; sandbox");
      assert.match(String(okunan.headers['content-disposition']), /filename="giris-logosu\.png"/);
      assert.equal((await logoYaz(null)).statusCode, 200);
      assert.equal((await girisOku()).statusCode, 204);
      // Tür baytlarla doğrulanır: resim adıyla gelen başka içerik ve türü tutmayan resim reddedilir, kopya yazılmaz.
      const ham = Buffer.from(PNG_BAYT, 'base64');
      const parca = (tur: string, veri: Buffer) => {
        const uzunluk = Buffer.alloc(4); uzunluk.writeUInt32BE(veri.length);
        const govde = Buffer.concat([Buffer.from(tur, 'latin1'), veri]);
        const saglama = Buffer.alloc(4); saglama.writeUInt32BE(crc32(govde));
        return Buffer.concat([uzunluk, govde, saglama]);
      };
      const ihdrSonu = 8 + 25;
      const metinli = Buffer.concat([ham.subarray(0, ihdrSonu), parca('tEXt', Buffer.from('Yorum\0<script>alert(1)</script>')), ham.subarray(ihdrSonu)]);
      const buyuk = Buffer.from(ham); buyuk.writeUInt32BE(4000, 16);
      const veri = (b: Buffer, tur = 'png') => `data:image/${tur};base64,${b.toString('base64')}`;
      const kotuler = [
        veri(Buffer.from('<script>alert(1)</script>')),
        veri(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'jpeg'),
        veri(Buffer.concat([ham, Buffer.from('<?php gizli ?>')])),
        veri(metinli),
        veri(buyuk),
        veri(ham.subarray(0, ham.length - 4)),
      ];
      for (const kotu of kotuler) assert.equal((await logoYaz(kotu)).statusCode, 400, kotu.slice(0, 60));
      assert.equal((await girisOku()).statusCode, 204);
      // Kopya yalnız yüklemede yazılır: logo kaydına doğrudan yazılan değer giriş ekranına çıkmaz.
      await vt().tx((db) => ayarDegeriniYaz(db, 'kabuk.logo', PNG, yoneticiId));
      assert.equal((await girisOku()).statusCode, 204);
    });
  });

  describe('karşılama', () => {
    const oku = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/karsilama');
    const METIN = 'kabuk.karsilama-metni';

    test('her oturum varsayılanla okur; oturumsuz 401; yalnız ayar yazan değiştirir ve değişiklik okunana yansır', async () => {
      const varsayilan = {
        acik: true, metin: 'Hoş geldin, iyi mesailer', geceMetni: 'İyi akşamlar, iyi mesailer', gunduzBaslangic: 6, geceBaslangic: 18,
      };
      assert.deepEqual({
        acik: varsayilanDeger('kabuk.karsilama'),
        metin: varsayilanDeger(METIN),
        geceMetni: varsayilanDeger('kabuk.karsilama-gece-metni'),
        gunduzBaslangic: varsayilanDeger('kabuk.gunduz-baslangic'),
        geceBaslangic: varsayilanDeger('kabuk.gece-baslangic'),
      }, varsayilan);
      assert.equal((await oku(null)).statusCode, 401);
      for (const { rol, cerez } of bayraksizlar) {
        const cevap = await oku(cerez);
        assert.equal(cevap.statusCode, 200, `${rol.ad}: ${cevap.body}`);
        assert.deepEqual(cevap.json(), varsayilan, rol.ad);
        assert.equal((await degistir('Başka', cerez, METIN)).statusCode, 403, rol.ad);
      }
      assert.deepEqual(await satirlar(), []);
      assert.equal((await degistir('  Kolay gelsin ', yonetici, METIN)).statusCode, 200);
      assert.equal((await degistir(false, yonetici, 'kabuk.karsilama')).statusCode, 200);
      for (const { rol, cerez } of bayraksizlar) assert.deepEqual((await oku(cerez)).json(), { ...varsayilan, acik: false, metin: 'Kolay gelsin' }, rol.ad);
      assert.equal((await listedeki(METIN))?.deger, 'Kolay gelsin');
    });

    test('gündüz ve gece saati yalnız ayar yazanca 0-23 tam sayı olarak değişir; boşaltılan saat varsayılana döner', async () => {
      for (const { rol, cerez } of bayraksizlar) {
        assert.equal((await degistir(20, cerez, 'kabuk.gece-baslangic')).statusCode, 403, rol.ad);
      }
      for (const kotu of [24, -1, 6.5, '7', true]) {
        const cevap = await degistir(kotu, yonetici, 'kabuk.gunduz-baslangic');
        assert.equal(cevap.statusCode, 400, `${JSON.stringify(kotu)}: ${cevap.body}`);
      }
      assert.deepEqual(await satirlar(), []);
      assert.equal((await degistir(7, yonetici, 'kabuk.gunduz-baslangic')).statusCode, 200);
      assert.equal((await degistir(20, yonetici, 'kabuk.gece-baslangic')).statusCode, 200);
      assert.equal((await degistir('Gece de kolay gelsin', yonetici, 'kabuk.karsilama-gece-metni')).statusCode, 200);
      const okunan = (await oku(bayraksizlar[0]?.cerez ?? yonetici)).json() as Record<string, unknown>;
      assert.deepEqual([okunan.gunduzBaslangic, okunan.geceBaslangic, okunan.geceMetni], [7, 20, 'Gece de kolay gelsin']);
      assert.equal((await degistir(null, yonetici, 'kabuk.gunduz-baslangic')).statusCode, 200);
      assert.equal(((await oku()).json() as Record<string, unknown>).gunduzBaslangic, 6);
    });

    test('boş, sınırı aşan ve metin olmayan karşılama metni 400 ile reddedilir ve değeri değiştirmez', async () => {
      for (const kotu of ['', '   ', 'a'.repeat(121), 5, null, true]) {
        const cevap = await degistir(kotu, yonetici, METIN);
        assert.equal(cevap.statusCode, 400, `${JSON.stringify(kotu).slice(0, 20)}: ${cevap.body}`);
      }
      assert.deepEqual(await satirlar(), []);
      assert.equal((await degistir('a'.repeat(120), yonetici, METIN)).statusCode, 200);
    });
  });

  describe('kurum adı', () => {
    const oku = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/kurum');
    const ANAHTAR = 'kabuk.kurum-adi';

    test('her oturum varsayılan adı okur; oturumsuz 401; yalnız ayar yazan değiştirir; boş ve uzun ad reddedilir', async () => {
      assert.equal(varsayilanDeger(ANAHTAR), 'TMI');
      assert.equal((await oku(null)).statusCode, 401);
      for (const { rol, cerez } of bayraksizlar) {
        const cevap = await oku(cerez);
        assert.equal(cevap.statusCode, 200, `${rol.ad}: ${cevap.body}`);
        assert.deepEqual(cevap.json(), { ad: 'TMI' }, rol.ad);
        assert.equal((await degistir('Başka', cerez, ANAHTAR)).statusCode, 403, rol.ad);
      }
      for (const kotu of ['', '  ', 'a'.repeat(81), 5, null]) assert.equal((await degistir(kotu, yonetici, ANAHTAR)).statusCode, 400, String(kotu));
      assert.deepEqual(await satirlar(), []);
      assert.equal((await degistir(' Deneme Atölyesi ', yonetici, ANAHTAR)).statusCode, 200);
      for (const { rol, cerez } of bayraksizlar) assert.deepEqual((await oku(cerez)).json(), { ad: 'Deneme Atölyesi' }, rol.ad);
    });
  });

  describe('hareket dili ve açılış', () => {
    const oku = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/gorunum');

    test('her oturum varsayılanı okur; oturumsuz 401; yalnız ayar yazan değiştirir; listede olmayan değer reddedilir', async () => {
      assert.equal((await oku(null)).statusCode, 401);
      for (const { rol, cerez } of bayraksizlar) {
        const cevap = await oku(cerez);
        assert.equal(cevap.statusCode, 200, `${rol.ad}: ${cevap.body}`);
        assert.deepEqual(cevap.json(), { hareket: 'orta', acilis: 'yok', acilisSuresi: 2, gecisHizi: 'normal' }, rol.ad);
        assert.equal((await degistir('ultra', cerez, 'kabuk.hareket')).statusCode, 403, rol.ad);
      }
      for (const kotu of ['', 'hizli', 'Ultra', 5, null, true]) {
        assert.equal((await degistir(kotu, yonetici, 'kabuk.hareket')).statusCode, 400, String(kotu));
        assert.equal((await degistir(kotu, yonetici, 'kabuk.acilis')).statusCode, 400, String(kotu));
      }
      assert.deepEqual(await satirlar(), []);
      const yazilan = await degistir('ultra', yonetici, 'kabuk.hareket');
      assert.equal(yazilan.statusCode, 200);
      assert.equal((yazilan.json() as { tur: string }).tur, 'secim');
      assert.equal((await degistir('rastgele', yonetici, 'kabuk.acilis')).statusCode, 200);
      for (const kotu of [0.4, 5.1, 1.25, 'iki']) assert.equal((await degistir(kotu, yonetici, 'kabuk.acilis-suresi')).statusCode, 400, String(kotu));
      for (const kotu of ['', 'ultra', 'Hizli']) assert.equal((await degistir(kotu, yonetici, 'kabuk.gecis-hizi')).statusCode, 400, kotu);
      assert.equal((await degistir(3.5, yonetici, 'kabuk.acilis-suresi')).statusCode, 200);
      assert.equal((await degistir('yavas', yonetici, 'kabuk.gecis-hizi')).statusCode, 200);
      for (const { rol, cerez } of bayraksizlar) {
        assert.deepEqual((await oku(cerez)).json(), { hareket: 'ultra', acilis: 'rastgele', acilisSuresi: 3.5, gecisHizi: 'yavas' }, rol.ad);
      }
    });
  });
});
