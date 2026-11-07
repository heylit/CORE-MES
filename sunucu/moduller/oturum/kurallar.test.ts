import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BEKLEME_AZAMI_SN, KUYRUK_BIRIKME_ESIGI, NABIZ_ESITLEME_AZAMI_SN, SESSIZ_ESIK_SN, TARAYICI_AZAMI, beklemeSn, denemeKilitAnahtari, esitlemeSuresi,
  hesapKilitlenirMi, kalanBeklemeSn, kilitKalanDk, nabizDurumu, tarayiciMetni,
  SURESIZ_KILIT_DK, SURESIZ_KILIT_ILETISI, hesapKilidiIletisi, hesapKilidiSuresiDk, kilitBuyurMu,
} from './kurallar.ts';

test('bekleme her hatalı denemede ikiye katlanır: 1, 2, 4, 8... sn; üst sınır 60 sn', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(beklemeSn), [0, 1, 2, 4, 8, 16, 32]);
  assert.equal(BEKLEME_AZAMI_SN, 60);
  assert.equal(beklemeSn(7), 60);
  assert.equal(beklemeSn(8), 60);
  assert.equal(beklemeSn(5000), 60);
});

test('kalan bekleme son hatalı denemeden beri geçen süreyle azalır; hatalı deneme yoksa bekleme yoktur', () => {
  assert.equal(kalanBeklemeSn(0, null), 0);
  assert.equal(kalanBeklemeSn(1, 0), 1);
  assert.equal(kalanBeklemeSn(1, 1), 0);
  assert.equal(kalanBeklemeSn(4, 3), 5);
  assert.equal(kalanBeklemeSn(4, 8), 0);
  assert.equal(kalanBeklemeSn(4, 500), 0);
  // Eşzamanlı transaction'ın kaydı "gelecekte" görünebilir; bekleme tam süreyi aşmaz.
  assert.equal(kalanBeklemeSn(2, -3), 2);
});

test('kilit anahtarı cihaza özeldir; 64 bit işaretli tam sayıdır', () => {
  const anahtar = denemeKilitAnahtari('10.0.0.1');
  assert.equal(denemeKilitAnahtari('10.0.0.1'), anahtar);
  assert.notEqual(denemeKilitAnahtari('10.0.0.2'), anahtar);
  // 32 bite sığan anahtar çakışma aramasını dakikalara indirir.
  const sayilar = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4'].map((ip) => BigInt(denemeKilitAnahtari(ip)));
  for (const sayi of sayilar) assert.equal(sayi >= -(2n ** 63n) && sayi < 2n ** 63n, true);
  assert.equal(sayilar.some((sayi) => sayi >= 2n ** 32n || sayi < -(2n ** 32n)), true);
});

test('hesap 10. hatalı denemede kilitlenir, 9\'da kilitlenmez; kalan süre dakikaya yukarı yuvarlanır, en az 1 dk', () => {
  assert.equal(hesapKilitlenirMi(9), false);
  assert.equal(hesapKilitlenirMi(10), true);
  assert.equal(hesapKilitlenirMi(11), true);
  assert.equal(kilitKalanDk(900), 15);
  assert.equal(kilitKalanDk(841), 15);
  assert.equal(kilitKalanDk(840), 14);
  assert.equal(kilitKalanDk(60), 1);
  assert.equal(kilitKalanDk(1), 1);
  assert.equal(kilitKalanDk(0), 1);
});

test('tarayıcı metni (386 a): baştaki ve sondaki boşluk atılır, 300 karakterde kesilir', () => {
  assert.equal(tarayiciMetni('  Deneme/1.0 (Windows)  '), 'Deneme/1.0 (Windows)');
  assert.equal(TARAYICI_AZAMI, 300);
  assert.equal(tarayiciMetni(`D/1 ${'x'.repeat(500)}`)?.length, 300);
});

test('tarayıcı metni (386 a): başlık yoksa ya da boşsa bilinmiyor (null) sayılır, boş metin saklanmaz', () => {
  assert.equal(tarayiciMetni(null), null);
  assert.equal(tarayiciMetni(''), null);
  assert.equal(tarayiciMetni('   '), null);
});

test('cihaz nabzı (1621 a): üç nabız (15 dk) kaçıran cihaz sessizdir; sessizlik kuyruktan önce gelir', () => {
  assert.equal(SESSIZ_ESIK_SN, 15 * 60);
  assert.equal(nabizDurumu(SESSIZ_ESIK_SN - 1, 0), 'iyi');
  assert.equal(nabizDurumu(SESSIZ_ESIK_SN, 0), 'sessiz');
  assert.equal(nabizDurumu(SESSIZ_ESIK_SN, KUYRUK_BIRIKME_ESIGI + 5), 'sessiz');
});

test('cihaz nabzı: kuyruk eşiğe varınca birikmiş sayılır; kuyruğu bilinmeyen cihaz (null) iyi sayılır, sıfır uydurulmaz', () => {
  assert.equal(nabizDurumu(0, KUYRUK_BIRIKME_ESIGI - 1), 'iyi');
  assert.equal(nabizDurumu(0, KUYRUK_BIRIKME_ESIGI), 'kuyruk');
  assert.equal(nabizDurumu(0, null), 'iyi');
});

test('cihaz nabzı: saklama süresinden (30 gün) eski eşitleme bilinmez sayılır', () => {
  assert.equal(esitlemeSuresi(null), null);
  assert.equal(esitlemeSuresi(0), 0);
  assert.equal(esitlemeSuresi(NABIZ_ESITLEME_AZAMI_SN), NABIZ_ESITLEME_AZAMI_SN);
  assert.equal(esitlemeSuresi(NABIZ_ESITLEME_AZAMI_SN + 1), null);
});

test('2226-2 a: büyüyen kilit basamakları 15, 60, süresiz; büyümeyen ad hep 15; süresiz kilitte ileti yöneticiye yönlendirir', () => {
  assert.deepEqual([0, 1, 2, 5].map((n) => hesapKilidiSuresiDk(true, n)), [15, 60, SURESIZ_KILIT_DK, SURESIZ_KILIT_DK]);
  assert.deepEqual([0, 1, 2].map((n) => hesapKilidiSuresiDk(false, n)), [15, 15, 15]);
  assert.equal(kilitBuyurMu('ahmet', false), true);
  assert.equal(kilitBuyurMu('yonetici', true), false);
  assert.equal(kilitBuyurMu('#kart-10.0.0.1', false), false);
  assert.equal(hesapKilidiIletisi(SURESIZ_KILIT_DK * 60), SURESIZ_KILIT_ILETISI);
  assert.match(hesapKilidiIletisi(3600), /60 dk/);
});
