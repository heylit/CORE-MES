import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  betaBirikimli, betaYuzdeligi, fiyatDegisimleri, gercekSure, harcamaAbc, netBirimFiyat, ortanca, satirKuru, tamAylar, tedarikSuresi, tsbTahmini,
  tuketimMalzemesi, yuzdelik, zamanindaBayes, type AnalizSatiri,
} from './analiz-kurallar.ts';

// 2151: satın alma analizinin saf hesapları. Veriler uydurmadır.
const satir = (o: Partial<AnalizSatiri>): AnalizSatiri => ({
  siparisTarihi: '2026-01-10', firmaId: 1, paraBirimi: 'TRY', kur: null, genelIskonto: '0', birimFiyat: '10', satirIskonto: null,
  terminGun: null, miktar: '1', birim: 'adet', katalogId: null, ad: 'Kalem', malzemeNo: null, teslimMiktari: null, sonTeslimGunu: null, ...o,
});
const K1 = '00000000-0000-4000-8000-000000000001';
const K2 = '00000000-0000-4000-8000-000000000002';

describe('satın alma analizi kuralları (2151)', () => {
  test('ortanca ve en yakın sıra %80', () => {
    assert.equal(ortanca([]), null);
    assert.equal(ortanca([1, 3, 9]), 3);
    assert.equal(ortanca([1, 3, 5, 9]), 4);
    assert.equal(yuzdelik([1, 2, 3, 4, 5], 0.8), 4);
    assert.equal(yuzdelik([], 0.8), null);
  });

  test('beta dağılımı: birikimli olasılık ve yüzdelik; Bayes zamanında teslim', () => {
    // Beta(1,1) düzgündür; Beta(2,1) birikimlisi x^2.
    assert.ok(Math.abs(betaBirikimli(1, 1, 0.3) - 0.3) < 1e-9);
    assert.ok(Math.abs(betaBirikimli(2, 1, 0.5) - 0.25) < 1e-9);
    assert.ok(Math.abs(betaYuzdeligi(2, 1, 0.25) - 0.5) < 1e-9);
    // 9/10 zamanında: sonsal Beta(10, 2), ortalama 10/12; %10 değeri ortalamanın altında.
    const b = zamanindaBayes(10, 9)!;
    assert.equal(b.ortalama, 83.3);
    assert.ok(b.alt90 < b.ortalama && b.alt90 > 60, String(b.alt90));
    // Az teslimde aynı oran daha temkinli alt sınır verir.
    assert.ok(zamanindaBayes(1, 1)!.alt90 < zamanindaBayes(20, 20)!.alt90);
    assert.equal(zamanindaBayes(0, 0), null);
  });

  test('kur, net birim fiyat ve tam teslim süresi: kur yoksa null, eksik teslimde süre yok', () => {
    assert.equal(satirKuru({ paraBirimi: 'TRY', kur: null }), 1);
    assert.equal(satirKuru({ paraBirimi: 'EUR', kur: null }), null);
    assert.equal(satirKuru({ paraBirimi: 'EUR', kur: '35.5' }), 35.5);
    assert.equal(netBirimFiyat({ birimFiyat: '100', satirIskonto: '10', genelIskonto: '5' }), 85.5);
    assert.equal(netBirimFiyat({ birimFiyat: null, satirIskonto: null, genelIskonto: '0' }), null);
    assert.equal(gercekSure(satir({ miktar: '10', teslimMiktari: '10', sonTeslimGunu: '2026-01-24' })), 14);
    assert.equal(gercekSure(satir({ miktar: '10', teslimMiktari: '6', sonTeslimGunu: '2026-01-24' })), null);
    assert.equal(gercekSure(satir({ miktar: '10' })), null);
  });

  test('tedarik süresi: eşik altında ortanca yok, örnek sayısı var', () => {
    const tam = (gun: number, termin: number) => satir({ miktar: '1', teslimMiktari: '1', sonTeslimGunu: `2026-01-${String(10 + gun).padStart(2, '0')}`, terminGun: termin });
    const az = tedarikSuresi([tam(5, 7), tam(9, 7), satir({})]);
    assert.deepEqual(az, { ornek: 2, ortancaGun: null, yuzde80Gun: null, teklifOrtancaGun: null });
    const l = [tam(4, 7), tam(6, 7), tam(8, 7), tam(10, 10), tam(15, 10)];
    assert.deepEqual(tedarikSuresi(l), { ornek: 5, ortancaGun: 8, yuzde80Gun: 10, teklifOrtancaGun: 7 });
  });

  test('harcama ABC: birikimli pay sınıfları, pencere dışı ve kursuz satır sayılmaz', () => {
    const l = [
      satir({ katalogId: K1, ad: 'Büyük', birimFiyat: '700' }),
      satir({ katalogId: K2, ad: 'Orta', birimFiyat: '150' }),
      satir({ ad: 'Serbest kalem', birimFiyat: '100' }),
      satir({ ad: 'serbest KALEM', birimFiyat: '0', miktar: '3' }),
      satir({ ad: 'Küçük', birimFiyat: '50' }),
      satir({ ad: 'Eski', birimFiyat: '999', siparisTarihi: '2025-01-01' }),
      satir({ ad: 'Döviz', paraBirimi: 'USD', kur: null, birimFiyat: '5' }),
    ];
    const h = harcamaAbc(l, '2026-01-01', '2026-12-31');
    assert.equal(h.toplamTl, 1000);
    assert.equal(h.kursuzSatir, 1);
    assert.deepEqual(h.kalemler.map((k) => [k.ad, k.pay, k.sinif]), [['Büyük', 70, 'A'], ['Orta', 15, 'A'], ['Serbest kalem', 10, 'B'], ['Küçük', 5, 'C']]);
    assert.deepEqual(h.siniflar, { A: 2, B: 1, C: 1 });
    assert.equal(harcamaAbc([], '2026-01-01', '2026-12-31').toplamTl, null);
  });

  test('fiyat değişimi: son iki sipariş, fiyat etkisi + kur etkisi = değişim; para birimi değişince kıyas yok', () => {
    const l = [
      satir({ katalogId: K1, ad: 'Çelik', paraBirimi: 'EUR', kur: '30', birimFiyat: '10', siparisTarihi: '2026-01-01' }),
      satir({ katalogId: K1, ad: 'Çelik', paraBirimi: 'EUR', kur: '30', birimFiyat: '9', siparisTarihi: '2026-02-01' }),
      satir({ katalogId: K1, ad: 'Çelik', paraBirimi: 'EUR', kur: '36', birimFiyat: '10', siparisTarihi: '2026-03-01' }),
      satir({ katalogId: K2, ad: 'Uç', paraBirimi: 'TRY', birimFiyat: '10', siparisTarihi: '2026-01-01' }),
      satir({ katalogId: K2, ad: 'Uç', paraBirimi: 'USD', kur: '40', birimFiyat: '1', siparisTarihi: '2026-02-01' }),
    ];
    const [d, ...kalan] = fiyatDegisimleri(l);
    assert.equal(kalan.length, 0);
    assert.deepEqual([d!.onceki.birimFiyat, d!.son.birimFiyat, d!.degisimTl, d!.fiyatEtkisiTl, d!.kurEtkisiTl, d!.degisimYuzde], [9, 10, 90, 36, 54, 33.3]);
  });

  test('TSB: aralıklı tüketim, hiç tüketim yoksa 0, seri yoksa null', () => {
    assert.equal(tsbTahmini([]), null);
    assert.equal(tsbTahmini([0, 0, 0]), 0);
    // Her ay 10: olasılık 1, büyüklük 10.
    assert.ok(Math.abs(tsbTahmini(Array.from({ length: 12 }, () => 10))! - 10) < 1e-9);
    const aralikli = tsbTahmini([0, 0, 30, 0, 0, 30, 0, 0, 30, 0, 0, 30])!;
    assert.ok(aralikli > 5 && aralikli < 15, String(aralikli));
  });

  test('tam aylar: bu ay hariç, yıl geçişi', () => {
    assert.deepEqual(tamAylar('2026-02', 3), ['2025-11', '2025-12', '2026-01']);
  });

  test('tüketim malzemesi: 12 aydan az geçmişte tahmin, XYZ ve güvenlik stoğu null; yeterli geçmişte hesaplanır', () => {
    const aylar = tamAylar('2026-11', 24);
    const yeni = tuketimMalzemesi({ malzemeNo: 1, ad: 'Yeni', aylar, miktarlar: new Map([['2026-10', 5]]), ilkHareketAyi: '2026-06', tedarikSureleri: [10, 12, 14] });
    assert.deepEqual([yeni.gecmisAy, yeni.tahminAylik, yeni.xyz, yeni.guvenlikStogu, yeni.tedarikSuresiGun], [5, null, null, null, 12]);
    assert.equal(yeni.seri.filter((x) => x === null).length, 19);
    const hic = tuketimMalzemesi({ malzemeNo: 2, ad: 'Hareketsiz', aylar, miktarlar: new Map(), ilkHareketAyi: null, tedarikSureleri: [] });
    assert.deepEqual([hic.gecmisAy, hic.tahminAylik], [0, null]);

    const duzenli = new Map(aylar.map((a, i) => [a, i % 2 === 0 ? 90 : 110]));
    const d = tuketimMalzemesi({ malzemeNo: 3, ad: 'Düzenli', aylar, miktarlar: duzenli, ilkHareketAyi: '2020-01', tedarikSureleri: [30, 30, 30] });
    assert.equal(d.gecmisAy, 24);
    assert.equal(d.xyz, 'X');
    assert.ok(Math.abs(d.tahminAylik! - 100) < 5, String(d.tahminAylik));
    // 1,645 x sapma (yaklaşık 10,2) x kök(30/30).
    assert.ok(d.guvenlikStogu! > 16 && d.guvenlikStogu! < 17.5, String(d.guvenlikStogu));
    // Tedarik süresi örneği eşik altında: güvenlik stoğu verilmez.
    assert.equal(tuketimMalzemesi({ malzemeNo: 3, ad: 'D', aylar, miktarlar: duzenli, ilkHareketAyi: '2020-01', tedarikSureleri: [30, 30] }).guvenlikStogu, null);
    const seyrek = new Map(aylar.filter((_, i) => i % 6 === 0).map((a) => [a, 60]));
    assert.equal(tuketimMalzemesi({ malzemeNo: 4, ad: 'Seyrek', aylar, miktarlar: seyrek, ilkHareketAyi: '2020-01', tedarikSureleri: [] }).xyz, 'Z');
  });
});
