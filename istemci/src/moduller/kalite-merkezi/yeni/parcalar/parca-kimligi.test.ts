import { describe, expect, it } from 'vitest';
import { parcaDizini } from '../kurallar.ts';
import type { KmVerisi } from '../veri.ts';
import { parcaBelgeleri, parcaKimligi } from './parca.ts';

describe('parça kartı kimliği', () => {
  it('saklanan kimlik harf katlamasından etkilenmez: var olan kart ve ekleri aynı kimlikle bulunur', () => {
    expect(parcaKimligi('orn-mil-01')).toBe('p-ORN-M_L-01');
    expect(parcaKimligi('ORN-MIL-01')).toBe('p-ORN-MIL-01');
    expect(parcaKimligi(' orn kapak ')).toBe('p-ORN_KAPAK');
  });

  it('iki yazımın iki kartı varsa ikisinin ekleri de parçanın kendi belgeleridir', () => {
    const parca = [{ _id: 'p-ORN-M_L-01', parcaNo: 'orn-mil-01' }, { _id: 'p-ORN-MIL-01', parcaNo: 'ORN-MIL-01' }];
    const [p] = parcaDizini({ cizim: [], insp: [], ncr: [], lot: [], spc: [], capa: [], parca });
    const belge = [
      { _id: 'b1', ad: 'ORN-sertifika-1', bagli: { col: 'parca', id: 'p-ORN-M_L-01' } },
      { _id: 'b2', ad: 'ORN-sertifika-2', bagli: { col: 'parca', id: 'p-ORN-MIL-01' } },
      { _id: 'b3', ad: 'ORN-baska', bagli: { col: 'parca', id: 'p-ORN-BASKA' } },
    ];
    const { kendi } = parcaBelgeleri({ belge } as unknown as KmVerisi, p!);
    expect(kendi.map((b) => b._id)).toEqual(['b1', 'b2']);
  });
});
