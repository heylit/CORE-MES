import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  iscilikMaliyeti, kisiPayiToplami, kisiPaylari, makineMaliyeti, maliyetsiz, olcuHesapla, ortalamayaGirenler, penceredekiDakika, topla, vardiyaIleAyir,
} from './kurallar.ts';
import type { HamOlcu } from './kurallar.ts';

const DK = 60_000;
const ham = (h: Partial<HamOlcu> = {}): HamOlcu => ({
  planliDk: 450, takvimDk: 1440, calismaDk: 420, standartDk: 360, saglam: 98, hurda: 2, red: 0, suresizSaglam: 0,
  vardiyaDisi: { calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0, red: 0 },
  kisiPayi: 1, makineMaliyeti: 4500, iscilikMaliyeti: 2250, ...h,
});

describe('oee kuralları', () => {
  test('OE-01: pencere dışındaki takvim süresi sayılmaz; pencere içindeki tam sayılır', () => {
    const araliklar = [{ bas: 0, bit: 60 * DK }, { bas: 120 * DK, bit: 180 * DK }];
    assert.equal(penceredekiDakika(araliklar, 0, 180 * DK), 120);
    assert.equal(penceredekiDakika(araliklar, 30 * DK, 150 * DK), 60);
    assert.equal(penceredekiDakika(araliklar, 200 * DK, 300 * DK), 0);
  });

  test('OE-02: OEE = sağlam standart / planlı; A x P x Q OEE\'ye eşittir', () => {
    const o = olcuHesapla(ham());
    assert.equal(o.oee, 0.8);
    assert.equal(o.kullanilabilirlik, 0.9333);
    assert.equal(o.kalite, 0.98);
    assert.ok(Math.abs(o.kullanilabilirlik! * o.performans! * o.kalite! - o.oee!) < 0.001);
  });

  test('OE-02: planlı süresi bilinmeyen ya da sıfır makinede oranlar null; üretimsiz ama planlı makinenin OEE\'si gerçek sıfırdır', () => {
    const bilinmeyen = olcuHesapla(ham({ planliDk: null }));
    assert.equal(bilinmeyen.oee, null);
    assert.equal(bilinmeyen.kullanilabilirlik, null);
    assert.equal(bilinmeyen.performans, null);
    assert.equal(olcuHesapla(ham({ planliDk: 0 })).oee, null);
    const bos = olcuHesapla(ham({ calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0 }));
    assert.equal(bos.oee, 0);
    assert.equal(bos.kalite, null);
    assert.equal(bos.performans, null);
  });

  test('OE-10: standart süre çalışmadan büyükse ya da çalışma yokken sayım varsa veri eksik: performans, OEE ve TEEP hesaplanmaz', () => {
    // Kayıttaki E3 (bugüne kadar performans 56,76 çıkıyordu) ve E4 (çalışma 0 iken OEE %1,3).
    const e3 = olcuHesapla(ham({ planliDk: 21210, takvimDk: 49337.6, calismaDk: 7.4, standartDk: 420, saglam: 90, hurda: 0 }));
    assert.deepEqual([e3.veriEksik, e3.kullanilabilirlik, e3.performans, e3.oee, e3.teep, e3.kalite], [true, 0.0003, null, null, null, 1]);
    const e4 = olcuHesapla(ham({ planliDk: 2250, calismaDk: 0, standartDk: 30, saglam: 20, hurda: 0 }));
    assert.deepEqual([e4.veriEksik, e4.kullanilabilirlik, e4.performans, e4.oee], [true, 0, null, null]);
    // Karşı örnekler: çalışma standarda eşit ya da büyükse hesaplanır; üretimsiz makine eksik değildir (OEE gerçek sıfır).
    assert.deepEqual([olcuHesapla(ham({ calismaDk: 360 })).veriEksik, olcuHesapla(ham({ calismaDk: 360 })).performans], [false, 1.0204]);
    const bos = olcuHesapla(ham({ calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0 }));
    assert.deepEqual([bos.veriEksik, bos.oee], [false, 0]);
  });

  test('OE-10: çalışma planlı süreden uzunsa planlı süre eksiktir: kullanılabilirlik %100\'ü aşmaz, veri eksik; eşitse %100', () => {
    // Yazılım değerlendirmesi: planlı 480, çalışma 900 -> kullanılabilirlik %187 çıkıyordu.
    const fazla = olcuHesapla(ham({ planliDk: 480, calismaDk: 900, standartDk: 600 }));
    assert.deepEqual([fazla.veriEksik, fazla.kullanilabilirlik, fazla.performans, fazla.oee, fazla.teep], [true, null, null, null, null]);
    assert.equal(olcuHesapla(topla(ortalamayaGirenler([ham({ planliDk: 480, calismaDk: 900 }), ham()]))).planliDk, 450, 'üst düzeye girmez');
    const esit = olcuHesapla(ham({ planliDk: 480, calismaDk: 480, standartDk: 400 }));
    assert.deepEqual([esit.veriEksik, esit.kullanilabilirlik], [false, 1]);
  });

  test('OE-10: verisi eksik makine üst düzey toplama girmez; hepsi eksikse üst düzey bilinmez', () => {
    const iyi = ham({ planliDk: 450, calismaDk: 420, standartDk: 360 });
    const eksik = ham({ planliDk: 450, calismaDk: 7.4, standartDk: 420 });
    const t = olcuHesapla(topla(ortalamayaGirenler([iyi, eksik])));
    assert.deepEqual([t.veriEksik, t.oee, t.planliDk], [false, 0.8, 450]);
    assert.equal(olcuHesapla(topla(ortalamayaGirenler([eksik]))).oee, null);
  });

  test('OE-03: TEEP takvim süresine oranlanır, OEE\'den küçük ya da eşittir', () => {
    const o = olcuHesapla(ham());
    assert.equal(o.teep, 0.25);
    assert.equal(olcuHesapla(ham({ takvimDk: 0 })).teep, null);
  });

  test('OE-04: üst düzey oranların ortalaması değil, ham değerlerin toplamıdır; bilinmeyen planlı süre üste taşınır', () => {
    const t = olcuHesapla(topla([ham({ planliDk: 450, standartDk: 450 }), ham({ planliDk: 150, calismaDk: 150, standartDk: 0 })]));
    assert.equal(t.oee, 0.75);
    assert.equal(olcuHesapla(topla([ham(), ham({ planliDk: null })])).oee, null);
    assert.equal(olcuHesapla(topla([])).oee, null);
  });

  test('OE-05: 1 kişi 3 makineye eşit atanmışsa her makinede payı 1/3; iki makinede %50 ise yarım', () => {
    const p = kisiPaylari([
      { kisiId: 1, makineId: 10, yuzde: 30 }, { kisiId: 1, makineId: 11, yuzde: 30 }, { kisiId: 1, makineId: 12, yuzde: 30 },
      { kisiId: 2, makineId: 13, yuzde: 100 },
    ]);
    assert.ok(Math.abs(p.get(10)![0]!.pay - 1 / 3) < 1e-9);
    assert.equal(p.get(13)![0]!.pay, 1);
    assert.equal(kisiPaylari([{ kisiId: 3, makineId: 14, yuzde: 0 }]).has(14), false);
  });

  test('OE-06: makine maliyeti planlı saat x saat maliyeti; biri bilinmiyorsa null', () => {
    assert.equal(makineMaliyeti(450, 600), 4500);
    assert.equal(makineMaliyeti(null, 600), null);
    assert.equal(makineMaliyeti(450, null), null);
  });

  test('OE-07: işçilik payla bölünür (1:3\'te üçte bir); ataması ya da maliyeti eksikse null', () => {
    const ucte = { pay: 1 / 3, mesaiDk: 450, saatMaliyeti: 300 };
    assert.equal(Math.round(iscilikMaliyeti([ucte])!), 750);
    assert.equal(iscilikMaliyeti([{ pay: 1, mesaiDk: 450, saatMaliyeti: 300 }]), 2250);
    assert.equal(iscilikMaliyeti([]), null);
    assert.equal(iscilikMaliyeti([ucte, { pay: 1, mesaiDk: null, saatMaliyeti: 300 }]), null);
    assert.equal(iscilikMaliyeti([{ pay: 1, mesaiDk: 450, saatMaliyeti: null }]), null);
    assert.equal(kisiPayiToplami([ucte, ucte, ucte]), 1);
    assert.equal(kisiPayiToplami([]), null);
  });

  test('OE-08: birim maliyet (makine + işçilik) / sağlam; sağlam yoksa ya da tutar eksikse null', () => {
    assert.equal(olcuHesapla(ham()).birimMaliyet, 68.88);
    assert.equal(olcuHesapla(ham({ saglam: 0 })).birimMaliyet, null);
    assert.equal(olcuHesapla(ham({ iscilikMaliyeti: null })).birimMaliyet, null);
  });

  test('OE-09: maliyet görme yetkisi yoksa tutarlar boşalır, oranlar kalır', () => {
    const o = maliyetsiz(olcuHesapla(ham()));
    assert.equal(o.birimMaliyet, null);
    assert.equal(o.makineMaliyeti, null);
    assert.equal(o.iscilikMaliyeti, null);
    assert.equal(o.oee, 0.8);
  });

  test('OE-15: kalite reddi hurda gibi kalite kaybıdır; performans toplam adede göre düşer, OEE sağlamın standart süresidir', () => {
    // Vardiya 450 dk, çalışma 360 dk, birim 3 dk: 100 sağlam, 5 hurda, 10 red.
    const o = olcuHesapla(ham({ calismaDk: 360, standartDk: 300, saglam: 100, hurda: 5, red: 10 }));
    assert.equal(o.red, 10);
    assert.equal(o.kalite, 0.8696);
    assert.equal(o.oee, 0.6667);
    assert.equal(o.kullanilabilirlik, 0.8);
    assert.equal(o.performans, 0.9583);
    const t = topla([ham({ red: 3 }), ham({ red: 4 })]);
    assert.equal(t.red, 7);
  });

  test('OE-16: çalışma ve sayım takvimle kesişir; vardiya dışı, mola ve planlı duruştaki ayrı döner; uçtaki sayım içeridedir', () => {
    // Takvim 08-12 ve 13-17 (dakika ekseni); mola 12-13.
    const plan = [{ bas: 480 * DK, bit: 720 * DK }, { bas: 780 * DK, bit: 1020 * DK }];
    const kullanimlar = [{ bas: 420 * DK, bit: 540 * DK }, { bas: 700 * DK, bit: 800 * DK }, { bas: 1200 * DK, bit: 1320 * DK }];
    const sayim = (dk: number, saglam: number, ek: Partial<{ hurda: number; red: number; suresizSaglam: number }> = {}) =>
      ({ an: dk * DK, saglam, hurda: 0, red: 0, standartSaniye: saglam * 180, suresizSaglam: 0, ...ek });
    const { ici, disi } = vardiyaIleAyir(plan, kullanimlar, [
      sayim(450, 5), sayim(500, 10, { hurda: 1 }), sayim(720, 4), sayim(750, 2, { red: 2 }), sayim(1020, 3, { suresizSaglam: 1 }), sayim(1250, 20),
    ]);
    assert.deepEqual(ici, { calismaDk: 60 + 20 + 20, standartDk: 3 * (10 + 4 + 3), saglam: 17, hurda: 1, red: 0, suresizSaglam: 1 });
    assert.deepEqual(disi, { calismaDk: 60 + 60 + 120, standartDk: 3 * (5 + 2 + 20), saglam: 27, hurda: 0, red: 2 });
    const bilinmeyen = vardiyaIleAyir(null, kullanimlar, [sayim(450, 5), sayim(1250, 20)]);
    assert.deepEqual(bilinmeyen.disi, { calismaDk: 0, standartDk: 0, saglam: 0, hurda: 0, red: 0 });
    assert.equal(bilinmeyen.ici.calismaDk, 340);
    assert.equal(bilinmeyen.ici.saglam, 25);
    const o = olcuHesapla(ham({ ...ici, planliDk: 480, vardiyaDisi: disi }));
    assert.equal(o.veriEksik, false, 'vardiya dışı çalışma makineyi veri eksik yapmaz');
    assert.deepEqual(o.vardiyaDisi, { calismaDk: 240, standartDk: 81, saglam: 27, hurda: 0, red: 2 });
    const t = topla([ham({ vardiyaDisi: disi }), ham({ vardiyaDisi: disi })]);
    assert.equal(t.vardiyaDisi.saglam, 54);
    assert.equal(t.vardiyaDisi.calismaDk, 480);
  });
});
