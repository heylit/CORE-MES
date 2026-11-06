import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KARO_TURLERI, KUTU, PIKTOGRAM_ADLARI, PIKTOGRAMLAR, simgeCizimi, simgeCoz } from './etiket-piktogramlari.ts';

const noktalar = (s: ReturnType<typeof simgeCizimi>[number]): (readonly [number, number])[] => {
  switch (s.t) {
    case 'dikdortgen': case 'tarama': return [[s.x, s.y], [s.x + s.g, s.y + s.h]];
    case 'daire': return [[s.x - s.r, s.y - s.r], [s.x + s.r, s.y + s.r]];
    case 'cokgen': return [...s.n];
    case 'cizgi': return s.n.flatMap(([x, y]) => [[x - s.k / 2, y - s.k / 2], [x + s.k / 2, y + s.k / 2]] as const);
  }
};

test('her piktogram tanımlı ve 48 birimlik kutunun içinde', () => {
  assert.deepEqual(Object.keys(PIKTOGRAMLAR).sort(), [...PIKTOGRAM_ADLARI].sort());
  for (const ad of PIKTOGRAM_ADLARI) {
    assert.ok(PIKTOGRAMLAR[ad].length > 0, ad);
    for (const karo of KARO_TURLERI) {
      for (const [x, y] of simgeCizimi(ad, karo).flatMap(noktalar)) assert.ok(x >= -0.01 && y >= -0.01 && x <= KUTU + 0.01 && y <= KUTU + 0.01, `${karo}:${ad} ${x},${y}`);
    }
  }
});

test('karo: siyah karoda piktogram terslenir, yok karoda olduğu gibi kalır', () => {
  const yalin = simgeCizimi('lot', 'yok');
  const siyah = simgeCizimi('lot', 'siyah');
  assert.deepEqual(siyah[0], { t: 'dikdortgen', x: 0, y: 0, g: KUTU, h: KUTU });
  assert.deepEqual(siyah.slice(1).map((s) => s.oyuk === true), yalin.map((s) => s.oyuk !== true));
  assert.equal(simgeCizimi('bekliyor', 'cizgili')[0]?.t, 'tarama');
});

test('alan değeri <karo>:<piktogram>; tanınmayan değer basılmaz', () => {
  assert.deepEqual(simgeCoz('siyah:lot'), { ad: 'lot', karo: 'siyah' });
  assert.deepEqual(simgeCoz('cizgili:bekliyor'), { ad: 'bekliyor', karo: 'cizgili' });
  for (const d of ['', 'lot', 'siyah', 'mor:lot', 'siyah:yok', 'siyah:lot:fazla']) assert.equal(simgeCoz(d), null, d);
});
