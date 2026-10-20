import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import type { KatalogAyarlariCevabi, KatalogSablonlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Oturum { id: number; cerez: string }

// Kart #228: şablonu yalnız onay yetkilisi ya da kaydeden kaldırır (üstüne yazma aynı kuralla); okuma uçları sayfa yetkisi ister.
// Roller gerçek giriş ve rol göçünden gelir: satın alma ve depo yazar, kalite onaycı, operatör yalnız sayfa, muhasebe sayfasız.
describe('Malzemeler şablon sahipliği ve okuma yetkisi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const istek = (o: Oturum, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: o.cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const sablonYolu = (kimlik: string, eylem: 'kaydet' | 'kaldir'): string => `/malzeme-katalogu-sablonlari/${kimlik}/${eylem}`;
  // Ekran gibi: şablonu listeden okunan sürümle yazar (listede yoksa sürümsüz).
  const kaydet = async (o: Oturum, kimlik: string, ad = 'Deneme şablon'): Promise<LightMyRequestResponse> => {
    const surum = ((await istek(o, 'GET', '/malzeme-katalogu-sablonlari')).json() as KatalogSablonlariCevabi).surumler[kimlik] ?? null;
    return istek(o, 'POST', sablonYolu(kimlik, 'kaydet'), { sablon: { id: kimlik, ad }, surum });
  };
  const kaldir = (o: Oturum, kimlik: string): Promise<LightMyRequestResponse> => istek(o, 'POST', sablonYolu(kimlik, 'kaldir'));
  const yeniKimlik = (): string => `sab-${++sayac}`;
  const durumu = (c: LightMyRequestResponse): { durum: number; kod?: string } =>
    ({ durum: c.statusCode, ...(c.statusCode === 200 ? {} : { kod: c.json().kod as string }) });
  const listede = async (o: Oturum, kimlik: string): Promise<boolean> =>
    ((await istek(o, 'GET', '/malzeme-katalogu-sablonlari')).json() as KatalogSablonlariCevabi).sablonlar.some((x) => x['id'] === kimlik);
  const adi = async (o: Oturum, kimlik: string): Promise<unknown> =>
    ((await istek(o, 'GET', '/malzeme-katalogu-sablonlari')).json() as KatalogSablonlariCevabi).sablonlar.find((x) => x['id'] === kimlik)?.['ad'];

  before(async () => {
    ortam = await testVeritabaniKur('malzemesablon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = (await girisYap('s-yonetici', 'yonetici')).id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kaydeden kendi şablonunu kaldırır; başka yazar kaldıramaz (403) ve şablon yerinde kalır', async () => {
    const sahip = await girisYap('s-sahip-1', 'satin_alma');
    const baska = await girisYap('s-baska-1', 'depo');
    const kimlik = yeniKimlik();
    assert.equal((await kaydet(sahip, kimlik)).statusCode, 200);
    assert.deepEqual(durumu(await kaldir(baska, kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal(await listede(baska, kimlik), true);
    assert.equal((await kaldir(sahip, kimlik)).statusCode, 200);
    assert.equal(await listede(baska, kimlik), false);
  });

  test('onay yetkilisi herkesin şablonunu kaldırır; operatör ve sayfasız rol kaldıramaz', async () => {
    const sahip = await girisYap('s-sahip-2', 'planlama_proje');
    const onayci = await girisYap('s-onayci-2', 'kalite');
    const kimlik = yeniKimlik();
    await kaydet(sahip, kimlik);
    assert.deepEqual(durumu(await kaldir(await girisYap('s-operator-2', 'operator'), kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.deepEqual(durumu(await kaldir(await girisYap('s-muhasebe-2', 'muhasebe_finans'), kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal(await listede(onayci, kimlik), true);
    assert.equal((await kaldir(onayci, kimlik)).statusCode, 200);
    assert.equal(await listede(onayci, kimlik), false);
  });

  // Borç: ekran kaldırma düğmesini herkese gösteriyordu. Liste her kişiye kaldırabileceklerini söyler; söylediği, ucun sonucuyla aynıdır.
  test('liste kaldırabilir şablonları kişiye göre verir ve kaldırma ucuyla aynı sonucu söyler', async () => {
    const sahip = await girisYap('s-sahip-liste', 'satin_alma');
    const baska = await girisYap('s-baska-liste', 'depo');
    const onayci = await girisYap('s-onayci-liste', 'kalite');
    const kimlik = yeniKimlik();
    assert.equal((await kaydet(sahip, kimlik)).statusCode, 200);
    const kaldirabilirMi = async (o: Oturum): Promise<boolean> =>
      ((await istek(o, 'GET', '/malzeme-katalogu-sablonlari')).json() as KatalogSablonlariCevabi).kaldirabilir.includes(kimlik);
    assert.deepEqual([await kaldirabilirMi(sahip), await kaldirabilirMi(baska), await kaldirabilirMi(onayci)], [true, false, true]);
    assert.equal((await kaldir(baska, kimlik)).statusCode, 403);
    assert.equal((await kaldir(sahip, kimlik)).statusCode, 200);
    assert.equal(await kaldirabilirMi(onayci), false);
  });

  test('sahipsiz eski şablonu yalnız onay yetkilisi kaldırır', async () => {
    const yazar = await girisYap('s-yazar-3', 'cam');
    const onayci = await girisYap('s-onayci-3', 'mudur');
    const kimlik = yeniKimlik();
    // Kaydeden bilgisi olmayan satır: sahiplik sütunu eklenmeden önceki kayıtlar böyledir.
    await vt().sorgu(
      'INSERT INTO malzeme_katalog_sablonu (kimlik, sablon, aktif, guncelleyen_kisi_id) VALUES ($1, $2, true, $3)',
      [kimlik, { id: kimlik, ad: 'Eski' }, yazar.id],
    );
    assert.equal(await listede(yazar, kimlik), true);
    assert.deepEqual(durumu(await kaldir(yazar, kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal((await kaldir(onayci, kimlik)).statusCode, 200);
    assert.equal(await listede(onayci, kimlik), false);
  });

  test('sahipsiz eski şablonun üstüne yazmayı yalnız onay yetkilisi yapar; sahiplik boş kalır', async () => {
    const yazar = await girisYap('s-yazar-3b', 'cam');
    const onayci = await girisYap('s-onayci-3b', 'mudur');
    const kimlik = yeniKimlik();
    await vt().sorgu(
      'INSERT INTO malzeme_katalog_sablonu (kimlik, sablon, aktif, guncelleyen_kisi_id) VALUES ($1, $2, true, $3)',
      [kimlik, { id: kimlik, ad: 'Eski' }, yazar.id],
    );
    assert.deepEqual(durumu(await kaydet(yazar, kimlik, 'Ele geçirilen')), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal(await adi(yazar, kimlik), 'Eski');
    assert.equal((await kaydet(onayci, kimlik, 'Düzeltilen')).statusCode, 200);
    assert.equal(await adi(yazar, kimlik), 'Düzeltilen');
    const satir = await vt().tek<{ kaydeden_kisi_id: number | null }>('SELECT kaydeden_kisi_id FROM malzeme_katalog_sablonu WHERE kimlik = $1', [kimlik]);
    assert.equal(satir?.kaydeden_kisi_id, null);
  });

  test('başkasının şablonunun üstüne aynı kimlikle kaydetmek 403 (kaldırmayı dolanmaz); sahip ve onay yetkilisi yazar, kaydeden değişmez', async () => {
    const sahip = await girisYap('s-sahip-4', 'satin_alma');
    const baska = await girisYap('s-baska-4', 'depo');
    const onayci = await girisYap('s-onayci-4', 'kalite');
    const kimlik = yeniKimlik();
    await kaydet(sahip, kimlik, 'Birinci');
    assert.deepEqual(durumu(await kaydet(baska, kimlik, 'Ele geçirilen')), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal(await adi(baska, kimlik), 'Birinci');
    assert.equal((await kaydet(sahip, kimlik, 'İkinci')).statusCode, 200);
    assert.equal((await kaydet(onayci, kimlik, 'Üçüncü')).statusCode, 200);
    assert.equal(await adi(baska, kimlik), 'Üçüncü');
    // Onay yetkilisinin üstüne yazması sahipliği almaz: başka yazar yine kaldıramaz, sahip kaldırır.
    assert.deepEqual(durumu(await kaldir(baska, kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal((await kaldir(sahip, kimlik)).statusCode, 200);
  });

  test('kaldırılmış şablonun kimliğini başkası yeniden kaydedemez; sahibi kaydeder', async () => {
    const sahip = await girisYap('s-sahip-5', 'satin_alma');
    const baska = await girisYap('s-baska-5', 'depo');
    const kimlik = yeniKimlik();
    await kaydet(sahip, kimlik);
    await kaldir(sahip, kimlik);
    assert.deepEqual(durumu(await kaydet(baska, kimlik)), { durum: 403, kod: 'YETKI_YOK' });
    assert.equal(await listede(baska, kimlik), false);
    assert.equal((await kaydet(sahip, kimlik)).statusCode, 200);
    assert.equal(await listede(baska, kimlik), true);
  });

  // Kullanıcı onayı (16.10.2026): aynı şablonu ya da ayarı iki kişi açıp kaydederse sonra gelen reddedilir, ekran yeniden yüklemeyi söyler.
  test('Sürüm: aynı sürümü okuyan iki kişiden ikincisinin şablon kaydı 409 olur ve öncekini ezmez; doğru sürüm geçer, sürüm artar', async () => {
    const sahip = await girisYap('s-surum-1', 'kalite');
    const onayci = await girisYap('s-surum-1b', 'mudur');
    const kimlik = yeniKimlik();
    assert.equal((await kaydet(sahip, kimlik, 'Birinci')).statusCode, 200);
    const okunan = ((await istek(sahip, 'GET', '/malzeme-katalogu-sablonlari')).json() as KatalogSablonlariCevabi).surumler[kimlik];
    assert.equal(okunan, 1);
    const ilk = await istek(onayci, 'POST', sablonYolu(kimlik, 'kaydet'), { sablon: { id: kimlik, ad: 'Müdürün' }, surum: okunan });
    assert.deepEqual(ilk.json(), { id: kimlik, surum: 2 });
    const ikinci = await istek(sahip, 'POST', sablonYolu(kimlik, 'kaydet'), { sablon: { id: kimlik, ad: 'Sahibin' }, surum: okunan });
    assert.deepEqual({ durum: ikinci.statusCode, kod: ikinci.json().kod, mesaj: ikinci.json().mesaj }, { durum: 409, kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI });
    assert.equal(await adi(sahip, kimlik), 'Müdürün');
    // Sürümsüz istek kayıtlı şablonun üstüne yazamaz (eski sekme sessizce ezmez).
    assert.equal((await istek(sahip, 'POST', sablonYolu(kimlik, 'kaydet'), { sablon: { id: kimlik, ad: 'Sürümsüz' } })).statusCode, 409);
    assert.deepEqual((await istek(sahip, 'POST', sablonYolu(kimlik, 'kaydet'), { sablon: { id: kimlik, ad: 'Yenilenen' }, surum: 2 })).json(), { id: kimlik, surum: 3 });
    assert.equal(await adi(sahip, kimlik), 'Yenilenen');
  });

  test('Sürüm: aynı ayarı okuyan iki kişiden ikincisinin kaydı 409 olur ve öncekini ezmez; ilk kayıt sürümsüz, sonrakiler okunan sürümle', async () => {
    const birinci = await girisYap('s-surum-2', 'yonetici');
    const ikinciKisi = await girisYap('s-surum-2b', 'yonetici');
    const yol = '/malzeme-katalogu-ayarlari/operasyonlar/kaydet';
    const okunan = async (): Promise<number | null> =>
      ((await istek(birinci, 'GET', '/malzeme-katalogu-ayarlari')).json() as KatalogAyarlariCevabi).surumler.operasyonlar;
    assert.equal(await okunan(), null);
    assert.deepEqual((await istek(birinci, 'POST', yol, { deger: { ad: 'ilk' }, surum: null })).json(), { id: 'operasyonlar', surum: 1 });
    // İki sekme 1'i okudu; önce gelen yazar, sonra gelen reddedilir.
    assert.equal((await istek(ikinciKisi, 'POST', yol, { deger: { ad: 'ikinci kişi' }, surum: 1 })).statusCode, 200);
    const gec = await istek(birinci, 'POST', yol, { deger: { ad: 'birinci kişi' }, surum: 1 });
    assert.deepEqual({ durum: gec.statusCode, kod: gec.json().kod, mesaj: gec.json().mesaj }, { durum: 409, kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI });
    // Kayıtlı ayarın üstüne sürümsüz yazılamaz.
    assert.equal((await istek(birinci, 'POST', yol, { deger: { ad: 'sürümsüz' }, surum: null })).statusCode, 409);
    const ayar = (await istek(birinci, 'GET', '/malzeme-katalogu-ayarlari')).json() as KatalogAyarlariCevabi;
    assert.deepEqual({ deger: ayar.operasyonlar, surum: ayar.surumler.operasyonlar }, { deger: { ad: 'ikinci kişi' }, surum: 2 });
  });

  test('olmayan şablonu kaldırmak 404', async () => {
    const onayci = await girisYap('s-onayci-6', 'kalite');
    assert.deepEqual(durumu(await kaldir(onayci, 'yok-sablon')), { durum: 404, kod: 'BULUNAMADI' });
  });

  test('okuma uçları: sayfası olan roller 200 okur, sayfasız rol 403, oturumsuz 401', async () => {
    const uclar = ['/malzeme-katalogu-kartlari', '/malzeme-katalogu-sablonlari', '/malzeme-katalogu-ayarlari', '/malzeme-logo-durumu', '/malzeme-birimleri'];
    const okuyanlar = [await girisYap('s-okur-kalite', 'kalite'), await girisYap('s-okur-depo', 'depo'), await girisYap('s-okur-yonetici', 'yonetici')];
    const sayfasiz = [await girisYap('s-okur-muhasebe', 'muhasebe_finans'), await girisYap('s-okur-ik', 'insan_kaynaklari')];
    for (const yol of uclar) {
      for (const o of okuyanlar) assert.equal((await istek(o, 'GET', yol)).statusCode, 200, `${yol} sayfalı`);
      for (const o of sayfasiz) assert.deepEqual(durumu(await istek(o, 'GET', yol)), { durum: 403, kod: 'YETKI_YOK' }, `${yol} sayfasız`);
      const anonim = await app.inject({ method: 'GET', url: `/api${yol}` });
      assert.deepEqual({ durum: anonim.statusCode, kod: anonim.json().kod }, { durum: 401, kod: 'OTURUM_YOK' }, yol);
    }
  });
});
