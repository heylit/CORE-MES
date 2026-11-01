import { describe, expect, it } from 'vitest';
import { kayitIlgili, logIletisiniDagit } from '../../../../arkon/web/src/data/log-tepki.ts';

// Kart 1747: sayım ve durum kaydının iletisi istasyonları taşır; terminal yalnız kendi istasyonunun kaydında yeniden okur.
describe('Arkon $log iletisi istasyona göre süzülür', () => {
  const tetiklenen = (m: { type: string; kind?: unknown; machines?: unknown }, istasyon: string | null): number => {
    let n = 0;
    logIletisiniDagit(m, [(k, r) => { if (kayitIlgili(k, r, ['events', 'counts'], istasyon)) n += 1; }]);
    return n;
  };

  it('başka istasyonun kaydı terminali tetiklemez; kendi istasyonu tetikler', () => {
    expect(tetiklenen({ type: '$log', kind: 'counts', machines: ['T-02'] }, 'T-01')).toBe(0);
    expect(tetiklenen({ type: '$log', kind: 'counts', machines: ['T-01', 'T-02'] }, 'T-01')).toBe(1);
  });

  it('istasyon listesi yoksa ya da bozuksa herkes yeniden okur; istasyonsuz ekran (pano) her kayıtta okur', () => {
    expect(tetiklenen({ type: '$log', kind: 'counts' }, 'T-01')).toBe(1);
    expect(tetiklenen({ type: '$log', kind: 'counts', machines: [] }, 'T-01')).toBe(1);
    expect(tetiklenen({ type: '$log', kind: 'counts', machines: [3] }, 'T-01')).toBe(1);
    expect(tetiklenen({ type: '$log', kind: 'events', machines: ['T-02'] }, null)).toBe(1);
    expect(tetiklenen({ type: '$log', kind: 'audit', machines: ['T-01'] }, 'T-01')).toBe(0);
  });

  it('bir abonenin hatası ötekileri durdurmaz', () => {
    const cagrilan: string[] = [];
    logIletisiniDagit({ kind: 'counts', machines: ['T-01'] }, [() => { throw new Error('x'); }, (k) => { cagrilan.push(k); }]);
    expect(cagrilan).toEqual(['counts']);
  });
});
