import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KARO_TURLERI, PIKTOGRAM_ADLARI } from '#paylasilan/etiket-piktogramlari.ts';
import { noktaDikdortgenleri, simgeNoktalari } from './piktogram.ts';

const koyuOrani = (n: boolean[][]): number => n.flat().filter(Boolean).length / n.flat().length;

test('EM-25: piktogram istenen nokta boyunda kare bit eşlemdir; siyah karo çoğunlukla koyu, karosuz piktogram değil', () => {
  for (const ad of PIKTOGRAM_ADLARI) {
    for (const karo of KARO_TURLERI) {
      const n = simgeNoktalari(ad, karo, 72);
      assert.equal(n.length, 72);
      assert.ok(n.every((s) => s.length === 72));
      const oran = koyuOrani(n);
      assert.ok(oran > 0.05 && oran < 0.97, `${karo}:${ad} ${oran.toFixed(2)}`);
    }
    assert.ok(koyuOrani(simgeNoktalari(ad, 'siyah', 72)) > koyuOrani(simgeNoktalari(ad, 'yok', 72)), ad);
  }
  // Siyah karonun köşesi koyu, beyaz karonun ortası piktogram dışında açık; oyuk biçim (konum iğnesinin deliği) açık kalır.
  assert.equal(simgeNoktalari('lot', 'siyah', 48)[0]?.[0], true);
  assert.equal(simgeNoktalari('lot', 'beyaz', 48)[4]?.[4], false);
  assert.equal(simgeNoktalari('konum', 'yok', 48)[18]?.[24], false);
  assert.equal(simgeNoktalari('konum', 'yok', 48)[30]?.[24], true);
});

test('EM-25: nokta kutuları bit eşlemi eksiksiz ve taşmadan kaplar', () => {
  for (const ad of ['konum', 'bekliyor', 'rework'] as const) {
    const n = simgeNoktalari(ad, 'cizgili', 61);
    const geri = n.map((s) => s.map(() => false));
    for (const d of noktaDikdortgenleri(n, 0, 0)) {
      for (let y = d.y; y < d.y + d.yukseklik; y++) for (let x = d.x; x < d.x + d.genislik; x++) {
        assert.equal(geri[y]?.[x], false, 'üst üste binme');
        const satir = geri[y];
        if (satir) satir[x] = true;
      }
    }
    assert.deepEqual(geri, n);
  }
  const k = noktaDikdortgenleri(simgeNoktalari('lot', 'siyah', 152), 10, 20);
  assert.ok(k.every((d) => d.x >= 10 && d.y >= 20 && d.x + d.genislik <= 162 && d.y + d.yukseklik <= 172));
  assert.ok(k.length < 152 * 6, `kutu sayısı ${k.length}`);
});
