import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { OGRENME_SINIRI, ogrenilenSureler, ogrenmeSatirlari, type SureOrnegi } from './ogrenme-kurallar.ts';

// 1714 (1684 b): öğrenme sınırları. Veriler uydurmadır.
const GUN = 86_400_000;
const SIMDI = Date.UTC(2026, 10, 1);
const o = (oran: number, gunOnce = 1, urun = '7', adim = '1'): SureOrnegi => ({ urun, adim, opNo: Number(adim) * 10, oran, bitis: SIMDI - gunOnce * GUN });

describe('süre öğrenmesi kuralları (1714)', () => {
  test('üç örnekten azı öğrenilmez; üç örnekte ortalama ve örneklem varyansı', () => {
    assert.equal(ogrenilenSureler([o(1.1), o(1.3)], SIMDI).size, 0);
    const r = ogrenilenSureler([o(1.1), o(1.3), o(1.2)], SIMDI).get('7 1');
    assert.deepEqual(r, { n: 3, f: 1.2, v: 0.01 });
  });

  test('aşırı sapan oran, pencere dışı ve gelecekteki örnek dışarıda kalır', () => {
    const l = [o(1), o(1), o(1), o(0.29), o(3.01), o(5), o(1, OGRENME_SINIRI.pencereGun + 1), o(1, -1)];
    assert.equal(ogrenilenSureler(l, SIMDI).get('7 1')?.n, 3);
  });

  test('ürün ve adım başına en yeni yirmi örnek', () => {
    const l = [...Array.from({ length: 25 }, (_, i) => o(i < 20 ? 1 : 2, i + 1)), o(1.5, 1, '7', '2'), o(1.5, 1, '7', '2'), o(1.5, 1, '7', '2')];
    const m = ogrenilenSureler(l, SIMDI);
    assert.deepEqual(m.get('7 1'), { n: 20, f: 1, v: 0 });
    assert.deepEqual(m.get('7 2'), { n: 3, f: 1.5, v: 0 });
  });

  test('belirsizlik tavanı: göreli sapma 0,5\'i geçmez', () => {
    const r = ogrenilenSureler([o(0.4), o(2.9), o(0.4), o(2.9)], SIMDI).get('7 1')!;
    assert.ok(Math.sqrt(r.v) / Math.max(0.3, r.f) <= OGRENME_SINIRI.belirsizlikTavani + 1e-9, JSON.stringify(r));
  });

  test('gölge görünüm: bire en uzak oran önce, en çok verilen satır, opNo örnekten', () => {
    const l = [o(1.1), o(1.1), o(1.1), o(0.5, 1, '7', '2'), o(0.5, 2, '7', '2'), o(0.5, 3, '7', '2'), o(1.4, 1, '8', '3'), o(1.6, 2, '8', '3'), o(1.5, 3, '8', '3')];
    const r = ogrenmeSatirlari(l, ogrenilenSureler(l, SIMDI), 2);
    assert.deepEqual(r, [
      { urun: '7', adim: '2', opNo: 20, ornek: 3, oran: 0.5, dagilim: 0 },
      { urun: '8', adim: '3', opNo: 30, ornek: 3, oran: 1.5, dagilim: 0.1 },
    ]);
  });
});
