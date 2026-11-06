import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import { birlestir, darbogaz, ewmaEgilimi, haftaPenceresi, hucre, istasyonHucreleri, ortakSure, pencereSuresi, type Hafta } from './analiz-kurallar.ts';

const SA = 3_600_000;
const DK = 60_000;

// 2151: planlama analizinin saf hesapları. Veriler uydurmadır.
describe('plan analizi kuralları (2151)', () => {
  test('hafta penceresi: 8 geçmiş + 8 ileri, tesis saatiyle pazartesi; bu hafta ileri ve şimdiden başlar', () => {
    // Çarşamba 2026-11-04 10:00 tesis saati.
    const simdi = tesisGunBasi('2026-11-04') + 10 * SA;
    const h = haftaPenceresi(simdi);
    assert.equal(h.length, 16);
    assert.deepEqual([h[0]!.baslangic, h[0]!.bitis, h[0]!.ileri], ['2026-09-07', '2026-09-13', false]);
    assert.deepEqual([h[7]!.baslangic, h[7]!.ileri, h[7]!.bit], ['2026-10-26', false, tesisGunBasi('2026-11-02')]);
    assert.deepEqual([h[8]!.baslangic, h[8]!.ileri, h[8]!.bas], ['2026-11-02', true, simdi]);
    assert.equal(h[15]!.bitis, '2026-12-27');
    // Pazartesi gece yarısından hemen sonra: o hafta başlar (UTC'de hâlâ pazar).
    assert.equal(haftaPenceresi(tesisGunBasi('2026-11-09') + DK)[8]!.baslangic, '2026-11-09');
  });

  test('aralık süreleri: pencereye düşen kısım, iki listenin ortak kısmı, üst üste binen kullanımın birleşmesi', () => {
    assert.equal(pencereSuresi([[0, 10], [20, 30]], 5, 25), 10);
    assert.equal(ortakSure([[0, 100]], [[10, 20], [50, 60]], 15, 55), 10);
    assert.deepEqual(birlestir([[5, 10], [0, 6], [20, 30], [30, 31], [40, 40]]), [[0, 10], [20, 31]]);
  });

  test('hücre: kapasite yoksa oran null (sıfır uydurulmaz), sıfır kapasitede null, dakikaya yuvarlar', () => {
    assert.deepEqual(hucre(null, 5 * DK), { kapasiteDk: null, yukDk: 5, oran: null });
    assert.deepEqual(hucre(0, 0), { kapasiteDk: 0, yukDk: 0, oran: null });
    assert.deepEqual(hucre(30 * DK, 10 * DK), { kapasiteDk: 30, yukDk: 10, oran: 33.3 });
  });

  test('istasyon hücreleri: geçmişte birleşmiş gerçek kullanım (vardiya dışı dahil), ileride planın çalışma aralığına düşen kısmı; takvimsiz makine sayılmaz', () => {
    const haftalar: Hafta[] = [
      { baslangic: 'g', bitis: 'g', ileri: false, bas: 0, bit: 10 * SA },
      { baslangic: 'i', bitis: 'i', ileri: true, bas: 10 * SA, bit: 20 * SA },
    ];
    const r = istasyonHucreleri([
      // 8 saat çalışma her pencerede; geçmişte 10 saat dolu (2 saati vardiya dışı), ileride 6 saatlik planın 4 saati çalışma aralığında.
      { istasyonId: 1, takvim: [[0, 8 * SA], [10 * SA, 18 * SA]], kullanim: [[0, 6 * SA], [5 * SA, 10 * SA]], plan: [[14 * SA, 20 * SA]] },
      { istasyonId: 1, takvim: null, kullanim: [[0, 10 * SA]], plan: [[10 * SA, 20 * SA]] },
      { istasyonId: 2, takvim: null, kullanim: [], plan: [] },
    ], haftalar);
    assert.deepEqual(r.get(1), { makine: 2, takvimsiz: 1, hucreler: [
      { kapasiteDk: 480, yukDk: 600, oran: 125 },
      { kapasiteDk: 480, yukDk: 240, oran: 50 },
    ] });
    assert.deepEqual(r.get(2), { makine: 1, takvimsiz: 1, hucreler: [hucre(null, 0), hucre(null, 0)] });
  });

  test('darboğaz: ileri ilk dört haftanın toplam yük / toplam kapasitesi en yüksek istasyon; oranı olmayan istasyon yoksa null', () => {
    const haftalar = haftaPenceresi(tesisGunBasi('2026-11-04'));
    const sat = (istasyonId: number, ileri: [number, number][]) => ({
      istasyonId, ad: `İ${String(istasyonId)}`, makine: 1, takvimsizMakine: 0,
      hucreler: [...Array.from({ length: 8 }, () => hucre(100 * DK, 100 * DK)), ...ileri.map(([k, y]) => hucre(k * DK, y * DK)), ...Array.from({ length: 8 - ileri.length }, () => hucre(100 * DK, 0))],
    });
    // Dört ileri hafta: 1: 90/400 = %22.5; 2: 120/400 = %30; geçmişin %100'ü sayılmaz.
    assert.deepEqual(darbogaz([sat(1, [[100, 90], [100, 0]]), sat(2, [[100, 60], [100, 60]])], haftalar), { istasyonId: 2, ad: 'İ2', oran: 30 });
    const bos = { istasyonId: 3, ad: 'İ3', makine: 1, takvimsizMakine: 1, hucreler: Array.from({ length: 16 }, () => hucre(null, 0)) };
    assert.equal(darbogaz([bos], haftalar), null);
  });

  test('EWMA: az ölçümde eğri var uyarı yok; temel düzeyden 3 sigma düşüş uyarı verir; yüzdesiz ölçüm atlanır', () => {
    const t = (i: number) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString();
    const az = ewmaEgilimi([{ zaman: t(1), yuzde: 80 }, { zaman: t(0), yuzde: 60 }, { zaman: t(2), yuzde: null }]);
    assert.deepEqual([az.ornek, az.gereken, az.uyari], [2, 20, null]);
    // Sıralı: ilk nokta kendisiyle başlar.
    assert.deepEqual(az.noktalar.map((n) => n.ewma), [60, 66]);

    const taban = Array.from({ length: 20 }, (_, i) => ({ zaman: t(i), yuzde: i % 2 === 0 ? 88 : 92 }));
    assert.equal(ewmaEgilimi(taban).uyari, null);
    const dusen = ewmaEgilimi([...taban, ...Array.from({ length: 5 }, (_, i) => ({ zaman: t(20 + i), yuzde: 70 }))]);
    assert.equal(dusen.uyari, 'dusus');
    assert.equal(ewmaEgilimi([...taban, ...Array.from({ length: 5 }, (_, i) => ({ zaman: t(20 + i), yuzde: 100 }))]).uyari, 'yukselis');
    // Değişkenliği olmayan temel düzeyde sınır kurulamaz.
    const sabit = Array.from({ length: 22 }, (_, i) => ({ zaman: t(i), yuzde: i < 20 ? 90 : 50 }));
    assert.equal(ewmaEgilimi(sabit).uyari, null);
    assert.deepEqual(ewmaEgilimi([]), { noktalar: [], ornek: 0, gereken: 20, uyari: null });
  });
});
