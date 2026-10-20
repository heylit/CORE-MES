import { describe, expect, it } from 'vitest';
import { emirSeciminiAl, emirSirasi } from '../../../../arkon/web/src/data/emir-secimi.ts';

// Ctrl K'den emir seçimi: operatör listesinde emrin işi seçilir; listede yoksa (başka istasyon) yok sayılır.
describe('Arkon emir seçimi', () => {
  const isler = [
    { pkg: { id: 'tmi-ie-10', tmi: { emirId: 5 } } },
    { pkg: { id: 'tmi-ue-7', tmi: null } },
    { pkg: null },
  ];

  it('rotalı emirde iş emri paketi, rotasız emirde emir paketi bulunur', () => {
    expect(emirSirasi(isler, 5)).toBe(0);
    expect(emirSirasi(isler, 7)).toBe(1);
  });

  it('listede olmayan emir -1 döner', () => {
    expect(emirSirasi(isler, 99)).toBe(-1);
    expect(emirSirasi([], 5)).toBe(-1);
  });

  it('istek bir kez alınır; geçersiz istek null', () => {
    const p: { __tmiEmirSec?: number } = { __tmiEmirSec: 5 };
    expect(emirSeciminiAl(p)).toBe(5);
    expect(emirSeciminiAl(p)).toBeNull();
    expect(emirSeciminiAl({ __tmiEmirSec: 0 })).toBeNull();
    expect(emirSeciminiAl({ __tmiEmirSec: 1.5 })).toBeNull();
  });
});
