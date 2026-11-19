import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { kapiliTur, kapilariSifirla } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteSmartes } from './sahte-smartes.ts';
import { baglantiTesti, simdiOku, yonetimOzeti } from './yonetim.ts';

const PAROLA = 'dogru-parola-1';
const DK = 60_000;

// 3445: SmartES yönetimi. Sıklık kapısı sayan bir turla ölçülür (tur = SmartES isteği); uçlar gerçek girişle, bağlantı testi sahte servisle.
describe('SmartES yönetimi: sıklık kapısı, akış günlüğü ve sayfa uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let okuyucu = '';
  let gormeyen = '';
  let simdi = Date.parse('2026-11-19T08:00:00Z');

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const ayar = async (anahtar: string, deger: boolean | string): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const saat = () => new Date(simdi);
  const istemci = () => smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000 });
  const oku = (yol: string, cerez = yonetici) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const komut = (yol: string, cerez = yonetici) => app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez } });
  const gunluk = () => o().sahip.sorgu<{ akis: string; yon: string; sonuc: string; sayi: number | null; ileti: string | null }>(
    'SELECT akis, yon, sonuc, sayi, ileti FROM smartes_akis_gunlugu ORDER BY id');
  // Dakika tikini taklit eder; tur her koştuğunda bir SmartES isteği sayılır.
  const tikler = async (ad: string, dakika: number, cevap: () => { tur: string } & Record<string, unknown> = () => ({ tur: 'okundu', okunan: 3 })): Promise<number> => {
    let istek = 0;
    for (let i = 0; i < dakika; i++) {
      await kapiliTur(o().vt, ad, async () => { istek++; return cevap(); }, saat);
      simdi += DK;
    }
    return istek;
  };

  before(async () => {
    ortam = await testVeritabaniKur('smyonetim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sy-yonetici', parola: PAROLA }));
    const rol = async (kullaniciAdi: string, kod: string, islem: string | null): Promise<void> => {
      const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kod}`, kullaniciAdi, parola: PAROLA }));
      await o().vt.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [kod]);
      if (islem !== null) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [kod, islem]);
      await o().vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, kod]);
    };
    await rol('sy-okuyucu', 'sy_okuyucu', 'sayfa.smartes');
    await rol('sy-gormeyen', 'sy_gormeyen', null);
    yonetici = await giris('sy-yonetici');
    okuyucu = await giris('sy-okuyucu');
    gormeyen = await giris('sy-gormeyen');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    kapilariSifirla();
    simdi += 24 * 3600_000;
    await o().sahip.sorgu('DELETE FROM smartes_akis_gunlugu');
    await ayar('smartes.baglanti', true);
    await ayar('smartes.durus-sikligi', '15dk');
  });
  afterEach(async () => { await sahte.kapat(); });

  test('duruşlar 15 dakikada bir: yarım saatlik dakika tiki iki istek yapar; sıklık değişince yeni değer geçerli olur', async () => {
    assert.equal(await tikler('smartes-okuma-durus', 30), 2);
    await ayar('smartes.durus-sikligi', '5dk');
    assert.equal(await tikler('smartes-okuma-durus', 30), 6);
    const g = await gunluk();
    assert.equal(g.length, 8);
    assert.ok(g.every((x) => x.akis === 'durus' && x.yon === 'okuma' && x.sonuc === 'tamam' && x.sayi === 3));
  });

  test('"Yalnız elle": tik istek atmaz; "Şimdi oku" art arda basılsa da tek tur; kalite akışı üç işi birlikte okutur', async () => {
    await ayar('smartes.durus-sikligi', 'elle');
    assert.equal(await tikler('smartes-okuma-durus', 10), 0);
    for (let i = 0; i < 3; i++) await o().vt.tx((db) => simdiOku(db, 'durus', istemci()));
    assert.equal(await tikler('smartes-okuma-durus', 5), 1);
    await ayar('smartes.kalite-ambar-okumasi', true);
    await ayar('smartes.kalite-ambar-sikligi', 'elle');
    await o().vt.tx((db) => simdiOku(db, 'kalite-ambar', istemci()));
    const kaynaklar = ['smartes-okuma-red', 'smartes-okuma-ambar', 'smartes-okuma-kalite'];
    let toplam = 0;
    for (const ad of kaynaklar) toplam += await tikler(ad, 2);
    assert.equal(toplam, kaynaklar.length);
  });

  test('kapalı akış zaman yazmaz ve günlüğe girmez; makine durumu her dakika okunsa da başarılı satır 15 dakikada bir yazılır', async () => {
    assert.equal(await tikler('smartes-okuma-alarm', 3, () => ({ tur: 'kapali' })), 3, 'engelde tur her tik koşar ama istek atmaz (tur kendisi döner)');
    assert.equal((await gunluk()).length, 0);
    await ayar('smartes.makine-sikligi', '1dk');
    assert.equal(await tikler('smartes-makine-okumasi', 30), 30);
    const g = await gunluk();
    assert.deepEqual(g.map((x) => [x.akis, x.sonuc]), [['makine', 'tamam'], ['makine', 'tamam']]);
    await tikler('smartes-makine-okumasi', 1, () => ({ tur: 'hata', ileti: `Servis hatası\n${'y'.repeat(500)}` }));
    const son = (await gunluk()).at(-1)!;
    assert.equal(son.sonuc, 'hata');
    assert.ok((son.ileti ?? '').length <= 300 && !(son.ileti ?? '').includes('\n'));
  });

  test('sayfa uçları: görmek sayfa işlemiyle, komut ayarlar.yaz ile; kapalı bağlantıda 409; bağlantı testi günlüğe yazılır, adres cevapta yok', async () => {
    const c = await oku('/smartes/yonetim');
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<EntegrasyonYonetimiCevabi>();
    assert.equal(g.baglanti.tanimli, false, 'testte TMIV2_SMARTES_ADRESI yok');
    assert.deepEqual(g.akislar.find((a) => a.anahtar === 'durus')?.siklik, '15dk');
    assert.equal((await oku('/smartes/yonetim', okuyucu)).statusCode, 200);
    assert.equal((await oku('/smartes/yonetim', gormeyen)).statusCode, 403);
    assert.equal((await oku('/smartes/yonetim/gunluk', gormeyen)).statusCode, 403);
    assert.equal((await komut('/smartes/yonetim/akislar/durus/simdi-oku', okuyucu)).statusCode, 403);
    assert.equal((await oku('/smartes/yonetim/baglanti-testi', okuyucu)).statusCode, 403);
    assert.equal((await komut('/smartes/yonetim/akislar/durus/simdi-oku')).statusCode, 409, 'adres tanımlı değil');
    assert.notEqual((await komut('/smartes/yonetim/akislar/is-emri-gonderimi/simdi-oku')).statusCode, 200, 'gönderim okunmaz');
    await ayar('smartes.baglanti', false);
    assert.equal((await oku('/smartes/yonetim/baglanti-testi')).statusCode, 409);
    await ayar('smartes.baglanti', true);

    sahte.wsdlMetotlari = ['WorkOrderList', 'StopList'];
    assert.equal((await baglantiTesti(o().vt, istemci(), saat)).sonuc, 'tamam');
    sahte.wsdlMetotlari = null;
    assert.equal((await baglantiTesti(o().vt, istemci(), saat)).sonuc, 'hata');
    assert.deepEqual((await gunluk()).map((x) => [x.akis, x.yon, x.sonuc]), [['baglanti', 'baglanti', 'tamam'], ['baglanti', 'baglanti', 'hata']]);
    assert.deepEqual(sahte.cagrilar, [], 'bağlantı testi hiçbir metodu çağırmaz');
    const ozet = await o().vt.tx((db) => yonetimOzeti(db, saat(), istemci()));
    assert.equal(ozet.baglanti.tanimli, true);
    assert.equal(ozet.baglanti.sonTest?.sonuc, 'hata');
    assert.ok(!JSON.stringify(ozet).includes(sahte.adres));
  });
});
