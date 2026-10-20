import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fasonKirilimlari, fasonSureOrnekleri, fasonSuresiTahmini, fasonTerminFarki, fasonTerminUyumu } from './kurallar.ts';
import type { FasonGecmisiSatiri, FasonSureOrnegi } from './kurallar.ts';

const GUN = 86_400_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');
const an = (gun: number): string => new Date(T0 + gun * GUN).toISOString();
const ornek = (adet: number, sureGun: number, ek: Partial<FasonSureOrnegi> = {}): FasonSureOrnegi => ({ malzemeNo: 1, operasyonTipiId: 2, firmaId: 3, adet, sureGun, ...ek });
const sorgu = (adet: number) => ({ malzemeNo: 1, operasyonTipiId: 2, firmaId: 3, adet });
const gecmis = (ek: Partial<FasonGecmisiSatiri>): FasonGecmisiSatiri => ({ malzemeNo: 1, operasyonTipiId: 2, firmaId: 3, adet: 10, ilkGidis: an(0), sonDonus: an(4), terminGun: null, ...ek });

test('fason tahmini: veri yoksa null; başka malzeme, operasyon ya da firmanın örneği eşleşmez', () => {
  assert.equal(fasonSuresiTahmini([], sorgu(10)), null);
  const baska = [ornek(10, 5, { malzemeNo: 9 }), ornek(10, 5, { malzemeNo: null }), ornek(10, 5, { operasyonTipiId: 9 }), ornek(10, 5, { firmaId: 9 })];
  assert.equal(fasonSuresiTahmini(baska, sorgu(10)), null);
});

test('fason tahmini: tek örnek aynı adette ve farklı adette (yalnız alt ya da yalnız üst yan) süresini ölçeksiz verir', () => {
  assert.equal(fasonSuresiTahmini([ornek(10, 4)], sorgu(10)), 4);
  assert.equal(fasonSuresiTahmini([ornek(10, 4)], sorgu(5)), 4, 'yalnız üst yan');
  assert.equal(fasonSuresiTahmini([ornek(10, 4)], sorgu(30)), 4, 'yalnız alt yan');
});

test('fason tahmini: aynı adet varsa yalnız onların ortalaması, başka adetler girmez', () => {
  assert.equal(fasonSuresiTahmini([ornek(10, 4), ornek(10, 6), ornek(50, 40), ornek(2, 1)], sorgu(10)), 5);
});

test('fason tahmini: ara adet alt ve üst en yakın adet arasında doğrusal; uzak adetler girmez, yan adetlerde örnekler ortalanır', () => {
  assert.equal(fasonSuresiTahmini([ornek(10, 4), ornek(30, 8)], sorgu(20)), 6);
  assert.equal(fasonSuresiTahmini([ornek(10, 4), ornek(30, 8), ornek(1, 100), ornek(1000, 100)], sorgu(20)), 6);
  assert.equal(fasonSuresiTahmini([ornek(10, 2), ornek(10, 6), ornek(30, 8)], sorgu(20)), 6, 'alt yan: (2+6)/2 = 4, üst 8');
  assert.equal(fasonSuresiTahmini([ornek(10, 4), ornek(30, 8)], sorgu(15)), 5);
});

test('fason tahmini: tek yanda en yakın adet seçilir ve o adetteki örnekler ortalanır', () => {
  assert.equal(fasonSuresiTahmini([ornek(10, 2), ornek(20, 6), ornek(20, 8)], sorgu(50)), 7);
  assert.equal(fasonSuresiTahmini([ornek(40, 3), ornek(100, 9)], sorgu(5)), 3);
});

test('fason tahmini: adet sıfır ya da eksiyse null', () => {
  assert.equal(fasonSuresiTahmini([ornek(10, 4)], sorgu(0)), null);
  assert.equal(fasonSuresiTahmini([ornek(10, 4)], sorgu(-1)), null);
});

test('fason örnekleri: süre ilk gidişten son dönüşe gün; süresi sıfır ya da eksi ve adedi sıfır olan kayıt örnek değildir', () => {
  const o = fasonSureOrnekleri([
    gecmis({ ilkGidis: an(0), sonDonus: an(2.5) }), gecmis({ sonDonus: an(0) }), gecmis({ sonDonus: an(-1) }), gecmis({ adet: 0 }), gecmis({ sonDonus: 'bozuk' }),
  ]);
  assert.deepEqual(o, [{ malzemeNo: 1, operasyonTipiId: 2, firmaId: 3, adet: 10, sureGun: 2.5 }]);
});

test('fason kırılımı: malzeme, operasyon, firma ve adet başına ortalama; en uzun süre başta', () => {
  const k = fasonKirilimlari([ornek(10, 2), ornek(10, 4), ornek(20, 9), ornek(10, 1, { firmaId: 8 }), ornek(10, 1, { malzemeNo: null })]);
  assert.deepEqual(k.map((x) => [x.malzemeNo, x.firmaId, x.adet, x.ornekSayisi, x.ortalamaSureGun]), [[1, 3, 20, 1, 9], [1, 3, 10, 2, 3], [1, 8, 10, 1, 1], [null, 3, 10, 1, 1]]);
});

test('termin farkı: gerçek teslim - (ilk gidiş + termin günü); artı geç, eksi erken', () => {
  assert.equal(fasonTerminFarki(an(0), 5, an(7)), 2);
  assert.equal(fasonTerminFarki(an(0), 5, an(4.5)), -0.5);
  assert.equal(fasonTerminFarki(an(0), 5, an(5)), 0);
});

test('termin uyumu: termin günü olmayan dışarıda; firma başına ortalama fark ve geç kalan sayısı; en geç başta; veri yoksa boş', () => {
  assert.deepEqual(fasonTerminUyumu([]), []);
  assert.deepEqual(fasonTerminUyumu([gecmis({ terminGun: null })]), []);
  const u = fasonTerminUyumu([
    gecmis({ terminGun: 5, sonDonus: an(7) }), gecmis({ terminGun: 5, sonDonus: an(3) }), gecmis({ terminGun: null, sonDonus: an(90) }),
    gecmis({ firmaId: 4, terminGun: 2, sonDonus: an(6) }),
  ]);
  assert.deepEqual(u, [{ firmaId: 4, ornekSayisi: 1, gecKalanSayisi: 1, ortalamaFarkGun: 4 }, { firmaId: 3, ornekSayisi: 2, gecKalanSayisi: 1, ortalamaFarkGun: 0 }]);
});
