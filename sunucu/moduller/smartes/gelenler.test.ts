import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  AmbarHareketleriCevabi, FireHareketleriCevabi, GelenlerCevabi, HamKayitCevabi, KaliteOlcumleriCevabi,
} from '#paylasilan/sozlesme/smartes.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { KALITE_AMBAR_AYARI } from './kurallar.ts';
import { gelenler } from './servis.ts';
import type { SmartesIstemcisi } from './istemci.ts';

const PAROLA = 'dogru-parola-1';
const an = (z: string | null): number | null => (z === null ? null : Date.parse(z));
// Ortam değişkeni testte yoktur; "adres var" durumu için istemcinin varlığı yeter, çağrılmaz.
const ISTEMCI = {} as SmartesIstemcisi;

describe('SmartES’ten gelen bilgiler (kart 3174, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yetkisiz = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const ayar = async (anahtar: string, deger: boolean) => {
    const c = await istek('POST', `/ayarlar/${anahtar}/degistir`, { deger });
    assert.equal(c.statusCode, 200, c.body);
  };
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  const al = async <T>(yol: string): Promise<T> => {
    const r = await istek('GET', yol);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const kalem = (c: GelenlerCevabi, anahtar: string) => {
    const k = c.kalemler.find((x) => x.anahtar === anahtar);
    assert.ok(k, `kalem yok: ${anahtar}`);
    return k;
  };

  before(async () => {
    ortam = await testVeritabaniKur('smgel');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Gelen', kullaniciAdi: 'sg-yonetici', parola: PAROLA }));
    yonetici = await giris('sg-yonetici');
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yetkisiz', kullaniciAdi: 'sg-yetkisiz', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('sg_bos', 'sg_bos')");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'sg_bos') WHERE kisi_id = $1", [id]);
    yetkisiz = await giris('sg-yetkisiz');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    for (const t of [
      'smartes_red', 'smartes_ambar_hareketi', 'smartes_kalite_kontrol', 'smartes_durus', 'smartes_okuma', 'smartes_akis_izi',
      'smartes_liste_kaydi', 'smartes_liste_okuma',
    ]) await vt().sorgu(`DELETE FROM ${t}`);
    await ayar('smartes.baglanti', true);
    await ayar(KALITE_AMBAR_AYARI, false);
  });

  test('SME-32: fire, ambar ve kalite listeleri en yeni üstte gelir; miktar sayı, eksik alan null', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_red (smartes_id, is_emri_no, istasyon_kodu, makine_kodu, adet, neden_kodu, neden, zaman, ham, ilk_okuma, son_okuma) VALUES
         (1, 'ORN-IE-1', 'ORN-IST', 'ORN-MK', 3, 'Çapak', NULL, '2026-11-10T08:00:00Z', '{}', now(), now()),
         (2, NULL, NULL, NULL, NULL, 'Çapak', 'Çapak (açıklama)', '2026-11-11T08:00:00Z', '{}', now(), now()),
         (3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', now(), now())`);
    const fire = await al<FireHareketleriCevabi>('/smartes/fire?sayfa=1');
    assert.equal(fire.toplam, 3);
    assert.deepEqual(fire.satirlar.map((s) => s.smartesId), [2, 1, 3]);
    assert.deepEqual(fire.satirlar.map((s) => s.neden), ['Çapak (açıklama)', 'Çapak', null]);
    const { zaman, ...gerisi } = fire.satirlar[1] ?? { zaman: null };
    assert.deepEqual(gerisi, { smartesId: 1, isEmriNo: 'ORN-IE-1', stokNo: null, istasyonKodu: 'ORN-IST', makineKodu: 'ORN-MK', adet: 3, neden: 'Çapak' });
    assert.equal(an(zaman), Date.parse('2026-11-10T08:00:00Z'));
    assert.equal(fire.satirlar[2]?.adet, null);

    await vt().sorgu(
      `INSERT INTO smartes_ambar_hareketi (smartes_id, stok_no, ambar_kodu, hareket_turu, miktar, zaman, ham, ilk_okuma, son_okuma) VALUES
         (7, 'ORN-STK', 'ORN-AMB', 'Giriş', 12.5, '2026-11-10T08:00:00Z', '{}', now(), now()),
         (8, NULL, NULL, NULL, NULL, '2026-11-12T08:00:00Z', '{}', now(), now())`);
    const ambar = await al<AmbarHareketleriCevabi>('/smartes/ambar?sayfa=1');
    assert.deepEqual(ambar.satirlar.map((s) => [s.smartesId, s.miktar]), [[8, null], [7, 12.5]]);

    await vt().sorgu(
      `INSERT INTO smartes_kalite_kontrol (smartes_id, olcum_adi, olcum_degeri, sonuc, zaman, ham, ilk_okuma, son_okuma) VALUES
         (5, 'Çap', '12,01', 'Uygun', '2026-11-10T08:00:00Z', '{}', now(), now())`);
    const kalite = await al<KaliteOlcumleriCevabi>('/smartes/kalite?sayfa=1');
    assert.deepEqual(kalite.satirlar.map((s) => [s.olcumAdi, s.olcumDegeri, s.sonuc, s.makineKodu]), [['Çap', '12,01', 'Uygun', null]]);
  });

  test('SME-32: "Tüm alanlar" saklanan ham kaydı ad sırasıyla verir; boş değer null; olmayan kayıt 404, bilinmeyen tür 400', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_durus (smartes_id, ham, ilk_okuma, son_okuma) VALUES (4, $1::jsonb, now(), now())`,
      [JSON.stringify({ ZETA: 'son', ALFA: 'ilk', BOS: '', SAYI: 7 })]);
    const ham = await al<HamKayitCevabi>('/smartes/ham/durus/4');
    assert.deepEqual(ham.alanlar, [{ ad: 'ALFA', deger: 'ilk' }, { ad: 'BOS', deger: null }, { ad: 'SAYI', deger: '7' }, { ad: 'ZETA', deger: 'son' }]);
    assert.equal((await istek('GET', '/smartes/ham/durus/999')).statusCode, 404);
    assert.equal((await istek('GET', '/smartes/ham/giden/4')).statusCode, 400);
    assert.equal((await istek('GET', '/smartes/ham/durus/4', undefined, yetkisiz)).statusCode, 403);
  });

  test('SME-32: özet: kayıt sayısı ve son okuma izden gelir; kapalı anahtar "kapalı", okunmayan bilgi "okunmuyor" ve bağlantısız', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_okuma (kaynak, son_bitis, son_deneme, son_sonuc, son_hata) VALUES
         ('durus', '2026-11-12T07:00:00Z', '2026-11-12T08:00:00Z', 'tamam', NULL),
         ('alarm', '2026-11-12T06:00:00Z', '2026-11-12T09:00:00Z', 'hata', 'Sunucu yanıt vermedi')`);
    await vt().sorgu(`INSERT INTO smartes_durus (smartes_id, ham, ilk_okuma, son_okuma) VALUES (1, '{}', now(), now()), (2, '{}', now(), now())`);
    await vt().sorgu(
      `INSERT INTO smartes_liste_okuma (tur, son_deneme, son_sonuc, ilk_basarili, son_basarili, okunan) VALUES
         ('fire', '2026-11-12T10:00:00Z', 'tamam', '2026-11-12T10:00:00Z', '2026-11-12T10:00:00Z', 2),
         ('istasyon', '2026-11-12T10:00:00Z', 'tamam', '2026-11-11T10:00:00Z', '2026-11-12T10:00:00Z', 1)`);
    await vt().sorgu(
      `INSERT INTO smartes_liste_kaydi (tur, anahtar, smartes_id, ad, var, ham, ilk_gorulme, son_gorulme) VALUES
         ('fire', 'id:1', 1, 'Çapak', true, '{}', now(), now()), ('fire', 'id:2', 2, 'Ölçü dışı', false, '{}', now(), now()),
         ('istasyon', 'kod:ORN-A', NULL, 'Örnek istasyon', true, '{}', now(), now())`);

    const c = await al<GelenlerCevabi>('/smartes/gelenler');
    // Uç ortam istemcisini kullanır; testte adres yoktur, bu yüzden her okuma "kapalı" görünür.
    assert.equal(kalem(c, 'durus').durum, 'kapali');
    assert.deepEqual([kalem(c, 'durus').sayi, an(kalem(c, 'durus').sonOkuma)], [2, Date.parse('2026-11-12T08:00:00Z')]);
    // Son deneme hatalıysa en son tamamlanan pencerenin sonu gösterilir.
    assert.equal(an(kalem(c, 'alarm').sonOkuma), Date.parse('2026-11-12T06:00:00Z'));
    assert.deepEqual([kalem(c, 'uretim').sayi, kalem(c, 'uretim').sonOkuma], [0, null]);
    // Listeden çıkan satır sayılmaz; iki listeden biri hiç okunmadıysa son okuma yoktur.
    assert.deepEqual([kalem(c, 'adlar').sayi, kalem(c, 'adlar').sonOkuma], [1, null]);
    assert.deepEqual([kalem(c, 'tanimlar').sayi, kalem(c, 'tanimlar').sonOkuma], [1, null]);
    for (const a of ['makine', 'ilerleme']) {
      assert.deepEqual([kalem(c, a).durum, kalem(c, a).sayi, kalem(c, a).yol], ['okunmuyor', null, null]);
    }

    const acik = await vt().tx((db) => gelenler(db, ISTEMCI));
    assert.deepEqual(['uretim', 'durus', 'alarm', 'adlar', 'tanimlar', 'oee', 'cevrim'].map((a) => kalem(acik, a).durum), Array(7).fill('okunuyor'));
    assert.deepEqual(['fire', 'ambar', 'kalite'].map((a) => kalem(acik, a).durum), ['kapali', 'kapali', 'kapali']);
    await ayar(KALITE_AMBAR_AYARI, true);
    const ikisiAcik = await vt().tx((db) => gelenler(db, ISTEMCI));
    assert.deepEqual(['fire', 'ambar', 'kalite'].map((a) => kalem(ikisiAcik, a).durum), ['okunuyor', 'okunuyor', 'okunuyor']);
    await ayar('smartes.baglanti', false);
    const kapali = await vt().tx((db) => gelenler(db, ISTEMCI));
    assert.deepEqual(['durus', 'fire'].map((a) => kalem(kapali, a).durum), ['kapali', 'kapali']);

    assert.equal((await istek('GET', '/smartes/gelenler', undefined, yetkisiz)).statusCode, 403);
    assert.equal((await istek('GET', '/smartes/fire?sayfa=1', undefined, yetkisiz)).statusCode, 403);
  });
});
