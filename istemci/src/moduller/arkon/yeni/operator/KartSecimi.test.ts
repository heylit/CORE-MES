import { describe, expect, it } from 'vitest';
import { adayDizisi } from './KartSecimi.tsx';

const is = (opNo: number | null, state = 'queued', due = '') => ({ pkg: (opNo === null ? { id: 'p' } : { id: 'p', tmi: { opNo } }) as never, state: state as never, due });

describe('kart seçimi sırası', () => {
  it('aynı emrin işlerinde en küçük operasyon üstte; operasyonu bilinmeyen sonda (Atölye N2)', () => {
    expect(adayDizisi([0, 1, 2], [is(30), is(null), is(10)], 'cok-is')).toEqual([2, 0, 1]);
  });
  it('montaj girdisinde önce çalışan iş, sonra en erken termin; termini olmayan sonda', () => {
    expect(adayDizisi([0, 1, 2, 3], [is(10, 'queued', ''), is(10, 'queued', '2026-12-01'), is(10, 'running', '2026-12-20'), is(10, 'queued', '2026-11-20')], 'montaj-girdisi'))
      .toEqual([2, 3, 1, 0]);
  });
});
