import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import Fastify from 'fastify';
import { istekKisisiniIsaretle } from './red-kaydi.ts';
import {
  VARSAYILAN_IZLEME_AYARI, EKRAN_BILINMIYOR, ekranAdiTemizle, ekranIstegiSay, ekranYukunuAl, istekBasladi, istekBitti, izlemeAyariniKur, izlemeyiSifirla, surenIstekler, takilmaAnlariniAl,
  takilmaIzleyiciBaslat, tekrarSerileriniAl,
} from './istek-izleme.ts';
import { istekBoyutlari, istekOlcumunuKur, sorguSayildi } from './istek-olcumu.ts';

const biten = (yontem: string, adres: string, kisiId: number | null, durum: number, hata: string | null = null) =>
  ({ yontem, adres, kisiId, durum, sureMs: 5, hata });

afterEach(() => { izlemeyiSifirla(); });

describe('süren istekler', () => {
  test('başlayan istek listede kişi, uç ve süreyle görünür; bitince düşer', () => {
    const k = istekBasladi('GET', '/ornek', () => 7, 1000);
    assert.deepEqual(surenIstekler(3500), [{ yontem: 'GET', adres: '/ornek', kisiId: 7, sureMs: 2500 }]);
    istekBitti(k, biten('GET', '/ornek', 7, 200), 3500);
    assert.deepEqual(surenIstekler(3500), []);
  });

  test('en uzun süren üstte; on dakikadan eski kayıt listeden düşer', () => {
    istekBasladi('GET', '/yeni', () => null, 900_000);
    istekBasladi('GET', '/eski', () => null, 0);
    istekBasladi('GET', '/orta', () => null, 800_000);
    assert.deepEqual(surenIstekler(1_000_000).map((i) => i.adres), ['/orta', '/yeni']);
  });
});

describe('tekrar eden denemeler', () => {
  const dene = (n: number, durum: number, kisi: number | null = 1, yontem = 'POST', t0 = 0): void => {
    for (let i = 0; i < n; i += 1) istekBitti(istekBasladi(yontem, '/ornek/kaydet', () => kisi, t0), biten(yontem, '/ornek/kaydet', kisi, durum, durum >= 400 ? 'Çakışma' : null), t0 + i * 1000);
  };

  test('iki dakikada üç hatalı POST tek seri olur; iki kez olmaz', () => {
    dene(2, 500);
    assert.deepEqual(tekrarSerileriniAl(), []);
    dene(1, 500, 1, 'POST', 2000);
    const seri = tekrarSerileriniAl();
    assert.equal(seri.length, 1);
    assert.deepEqual({ sayi: seri[0]?.sayi, hatali: seri[0]?.hatali, sonDurum: seri[0]?.sonDurum, sonHata: seri[0]?.sonHata }, { sayi: 3, hatali: 3, sonDurum: 500, sonHata: 'Çakışma' });
  });

  test('seri büyüdükçe aynı kayıt güncellenir, yeni satır açılmaz; 409 ayrı sayılır', () => {
    dene(5, 409);
    const seri = tekrarSerileriniAl();
    assert.equal(seri.length, 1);
    assert.deepEqual({ sayi: seri[0]?.sayi, cakisma: seri[0]?.cakisma }, { sayi: 5, cakisma: 5 });
    assert.deepEqual(tekrarSerileriniAl(), []);
  });

  test('pencere dışında kalan deneme sayılmaz', () => {
    istekBitti(istekBasladi('POST', '/ornek/kaydet', () => 1, 0), biten('POST', '/ornek/kaydet', 1, 500), 0);
    istekBitti(istekBasladi('POST', '/ornek/kaydet', () => 1, 0), biten('POST', '/ornek/kaydet', 1, 500), 60_000);
    istekBitti(istekBasladi('POST', '/ornek/kaydet', () => 1, 0), biten('POST', '/ornek/kaydet', 1, 500), 200_000);
    assert.deepEqual(tekrarSerileriniAl(), []);
  });

  test('okuma, kişisiz istek ve farklı kişi tekrar sayılmaz; eşik ayardan değişir', () => {
    dene(4, 500, 1, 'GET');
    dene(4, 500, null);
    for (let k = 1; k <= 4; k += 1) dene(1, 500, k);
    assert.deepEqual(tekrarSerileriniAl(), []);
    izlemeAyariniKur({ tekrarEsik: 2 });
    dene(2, 500, 9);
    assert.equal(tekrarSerileriniAl().length, 1);
    izlemeyiSifirla();
    assert.equal(VARSAYILAN_IZLEME_AYARI.tekrarEsik, 3);
  });
});

describe('takılma anı', () => {
  test('ana hattı bloklayan uç çalışırken eşiği aşan takılma o uçla kaydedilir', async () => {
    const durdur = takilmaIzleyiciBaslat(0);
    const bitir = istekBasladi('GET', '/bloklayan', () => 3);
    await new Promise((coz) => setTimeout(coz, 80));
    const bitis = Date.now() + 300;
    while (Date.now() < bitis) { /* ana hattı bilerek bloklar */ }
    await new Promise((coz) => setTimeout(coz, 120));
    durdur();
    const liste = takilmaAnlariniAl();
    assert.ok(liste.length >= 1);
    const ilk = liste[0];
    assert.ok((ilk?.takilmaMs ?? 0) >= 200);
    assert.ok(ilk?.suren.some((i) => i.adres === '/bloklayan' && i.kisiId === 3));
    istekBitti(bitir, biten('GET', '/bloklayan', 3, 200));
    assert.deepEqual(takilmaAnlariniAl(), []);
  });

  test('açılış ısınma süresindeki gecikme takılma sayılmaz; süre geçince sayılır', async () => {
    const isinirken = takilmaIzleyiciBaslat(60_000);
    await new Promise((coz) => setTimeout(coz, 80));
    const bitis = Date.now() + 300;
    while (Date.now() < bitis) { /* açılış yükünü taklit eder */ }
    await new Promise((coz) => setTimeout(coz, 120));
    isinirken();
    assert.deepEqual(takilmaAnlariniAl(), []);
    const isinmis = takilmaIzleyiciBaslat(100);
    await new Promise((coz) => setTimeout(coz, 200));
    const bitis2 = Date.now() + 300;
    while (Date.now() < bitis2) { /* ısınma bitti: bu takılmadır */ }
    await new Promise((coz) => setTimeout(coz, 120));
    isinmis();
    assert.ok(takilmaAnlariniAl().length >= 1);
  });

  test('eşik altında bekleme takılma sayılmaz', async () => {
    // Yüklü makinede gerçek gecikme 200 ms'yi aşabilir; eşik yüksek tutulur ki test yalnız eşik kuralını ölçsün.
    izlemeAyariniKur({ takilmaEsikMs: 60_000 });
    const durdur = takilmaIzleyiciBaslat(0);
    await new Promise((coz) => setTimeout(coz, 200));
    durdur();
    assert.deepEqual(takilmaAnlariniAl(), []);
    izlemeyiSifirla();
  });
});

describe('istek ölçümüne bağlanma (Fastify, veritabansız)', () => {
  test('iki hatalı POST seri açmaz, üçüncüsü açar; cevap boyutu uç boyut sayacına girer; sorgu dizgesi adrese girmez', async () => {
    const app = Fastify();
    istekOlcumunuKur(app);
    app.addHook('onRequest', (istek, _y, bitti) => { istekKisisiniIsaretle(istek, 42); bitti(); });
    app.post('/deneme', () => { throw new Error('Deneme hatası'); });
    app.get('/boyut', () => { sorguSayildi(); sorguSayildi(); return 'abcde'; });
    app.post('/cakisma', (_i, y) => y.code(409).send({ kod: 'CAKISMA' }));
    for (let i = 0; i < 2; i += 1) await app.inject({ method: 'POST', url: '/deneme?ara=gizli' });
    await new Promise((coz) => setTimeout(coz, 20));
    assert.deepEqual(tekrarSerileriniAl(), []);
    await app.inject({ method: 'POST', url: '/deneme?ara=gizli' });
    await app.inject({ method: 'GET', url: '/boyut' });
    await new Promise((coz) => setTimeout(coz, 20));
    const seri = tekrarSerileriniAl();
    assert.equal(seri.length, 1);
    assert.deepEqual({ k: seri[0]?.kisiId, adres: seri[0]?.adres, hata: seri[0]?.sonHata, durum: seri[0]?.sonDurum }, { k: 42, adres: '/deneme', hata: 'Deneme hatası', durum: 500 });
    const boyut = istekBoyutlari().find((s) => s.yol === '/boyut');
    assert.deepEqual({ bayt: boyut?.toplamBayt, sayi: boyut?.sayi }, { bayt: 5, sayi: 1 });
    assert.deepEqual({ istek: boyut?.istek, sorgu: boyut?.toplamSorgu, cakisma: boyut?.cakisma }, { istek: 1, sorgu: 2, cakisma: 0 });
    await app.inject({ method: 'POST', url: '/cakisma' });
    assert.equal(istekBoyutlari().find((b) => b.yol === '/cakisma')?.cakisma, 1);
    await app.close();
  });
});

describe('ekran başına yenileme yükü', () => {
  test('başlık değeri tek yol parçasına indirilir; geçersiz değer bilinmiyor olur', () => {
    assert.equal(ekranAdiTemizle('/kokpit'), 'kokpit');
    assert.equal(ekranAdiTemizle('/uretim-emirleri/17?ara=gizli'), 'uretim-emirleri');
    assert.equal(ekranAdiTemizle('Kokpit'), EKRAN_BILINMIYOR);
    assert.equal(ekranAdiTemizle('<script>'), EKRAN_BILINMIYOR);
    assert.equal(ekranAdiTemizle(undefined), EKRAN_BILINMIYOR);
    assert.equal(ekranAdiTemizle('a'.repeat(41)), EKRAN_BILINMIYOR);
  });

  test('son bir dakikadaki istek ve farklı kişi sayısı; eski sayım düşer', () => {
    ekranIstegiSay('kokpit', 1, 1000);
    ekranIstegiSay('kokpit', 1, 2000);
    ekranIstegiSay('kokpit', 2, 3000);
    ekranIstegiSay('kokpit', null, 4000);
    assert.deepEqual(ekranYukunuAl(30_000), [{ ekran: 'kokpit', istekDk: 4, kisiSayisi: 2 }]);
    ekranIstegiSay('stok', 5, 70_000);
    assert.deepEqual(ekranYukunuAl(75_000), [{ ekran: 'stok', istekDk: 1, kisiSayisi: 1 }]);
  });
});
