import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emirIlerlemesi, type IlerlemeAdimi } from './kurallar.ts';

const adim = (sira: number, d: Partial<IlerlemeAdimi> = {}): IlerlemeAdimi => ({
  id: sira, sira, opNo: sira * 10, ad: `OP ${String(sira * 10)}`, dal: null, durum: 'bekliyor', saglamAdet: null, canliSaglam: null,
  ayarSuresiDk: null, birimSureDk: null, onculler: null, adetCarpani: null, ...d,
});

test('adımsız emirde ilerleme yoktur (null, sıfır uydurulmaz)', () => {
  assert.equal(emirIlerlemesi(10, []), null);
});

test('adım yüzdesi: biten 100, çalışan canlı sağlam / hedef (aşağı yuvarlanır), bekleyen 0', () => {
  const il = emirIlerlemesi(40, [
    adim(1, { durum: 'tamam', saglamAdet: 40 }),
    adim(2, { durum: 'calisiyor', canliSaglam: 13 }),
    adim(3),
  ], 'adet')!;
  assert.deepEqual(il.adimlar.map((a) => [a.opNo, a.hedef, a.yapilan, a.yuzde]), [[10, 40, 40, 100], [20, 40, 13, 32], [30, 40, 0, 0]]);
  assert.equal(il.rota, 44);
});

test('biten adımın kaybı sonrakinin hedefini düşürür: 39 sağlamla çıkan OP 10 sonrası OP 20 hedefi 39 (adimAdetleri kuralı)', () => {
  const il = emirIlerlemesi(40, [adim(1, { durum: 'tamam', saglamAdet: 39 }), adim(2, { durum: 'calisiyor', canliSaglam: 39 })], 'adet')!;
  assert.deepEqual(il.adimlar.map((a) => [a.hedef, a.yuzde]), [[40, 100], [39, 100]]);
  assert.equal(il.rota, 99, 'çalışan adım bitmeden rota 100 olmaz');
});

test('son parçası hurda olan biten adım da 100 sayılır; hepsi bitince rota 100', () => {
  const il = emirIlerlemesi(5, [adim(1, { durum: 'tamam', saglamAdet: 0 }), adim(2, { durum: 'tamam', saglamAdet: 0 })])!;
  assert.deepEqual(il.adimlar.map((a) => a.yuzde), [100, 100]);
  assert.equal(il.rota, 100);
});

test('sure esası: uzun adım daha çok sayar; adet esası eşit sayar; adim esası biten adım oranı', () => {
  const adimlar = [
    adim(1, { durum: 'tamam', saglamAdet: 10, ayarSuresiDk: '0', birimSureDk: '1' }), // 10 dk
    adim(2, { ayarSuresiDk: '30', birimSureDk: '6' }), // 90 dk
  ];
  assert.equal(emirIlerlemesi(10, adimlar, 'sure')!.rota, 10);
  assert.equal(emirIlerlemesi(10, adimlar, 'adet')!.rota, 50);
  assert.equal(emirIlerlemesi(10, adimlar, 'adim')!.rota, 50);
  assert.equal(emirIlerlemesi(10, adimlar)!.esas, 'adet', '1945 b: varsayılan esas adım yüzdelerinin ortalaması');
});

test('sure esası: planlı süresi olmayan adım bilinenlerin ortalama ağırlığını alır; hiçbiri yoksa eşit ağırlık', () => {
  const karisik = emirIlerlemesi(10, [
    adim(1, { durum: 'tamam', saglamAdet: 10, birimSureDk: '2' }), // 20 dk
    adim(2, { birimSureDk: '6' }), // 60 dk
    adim(3), // süresiz: ortalama 40 dk
  ], 'sure')!;
  assert.equal(karisik.rota, 16); // 20 / 120
  const suresiz = emirIlerlemesi(10, [adim(1, { durum: 'tamam', saglamAdet: 10 }), adim(2)], 'sure')!;
  assert.equal(suresiz.rota, 50);
});

test('dal adımı çarpanla büyür: 1 mamul için 2 alt parça, 10 adetlik emirde hedef 20', () => {
  const il = emirIlerlemesi(10, [
    adim(1, { dal: 'K1', adetCarpani: 2, durum: 'calisiyor', canliSaglam: 5, onculler: [] }),
    adim(2, { onculler: [{ id: 1 }] }),
  ], 'adet')!;
  assert.deepEqual(il.adimlar.map((a) => [a.dal, a.hedef, a.yuzde]), [['K1', 20, 25], [null, 10, 0]]);
});

test('sayaç hedefi aşsa da yüzde 100 ile sınırlıdır ve çalışan adım bitmeden rota 99 kalır', () => {
  const il = emirIlerlemesi(10, [adim(1, { durum: 'calisiyor', canliSaglam: 12 })], 'adet')!;
  assert.equal(il.adimlar[0]!.yuzde, 100);
  assert.equal(il.rota, 99);
});
