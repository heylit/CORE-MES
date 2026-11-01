import { describe, expect, it } from 'vitest';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import { oeeOlculeri } from './pano-kaynaklari.tsx';

describe('oee pano kaynagi (kart 1585)', () => {
  it('tesis OEE yuzde; hesaplanamayan null ve dagilima girmez', () => {
    const c = { tesis: { oee: 0.6123 }, isMerkezleri: [{ ad: 'Freze', oee: 0.7 }, { ad: 'Torna', oee: null }] } as unknown as OeeCevabi;
    const [tesis, merkez] = oeeOlculeri(c);
    expect(tesis?.deger).toBe(61.2);
    expect(merkez?.dagilim).toEqual([{ etiket: 'Freze', deger: 70 }]);
    const bos = { tesis: { oee: null }, isMerkezleri: [] } as unknown as OeeCevabi;
    expect(oeeOlculeri(bos)).toEqual([expect.objectContaining({ deger: null })]);
  });
});
