import { describe, expect, it } from 'vitest';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import { bilesenSatirlari, dusukMakineSatirlari, isMerkeziSatirlari, oeeOlculeri } from './pano-kaynaklari.tsx';

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

describe('oee grafikleri (kart 1773)', () => {
  it('hesaplanamayan satir cizilmez; bilesenler sabit sirada; en dusuk makineler artan sirayla', () => {
    const c = {
      tesis: { kullanilabilirlik: 0.8, performans: null, kalite: 0.99, oee: 0.5 },
      isMerkezleri: [{ ad: 'Freze', oee: 0.7 }, { ad: 'Torna', oee: null }],
      makineler: [{ kod: 'M2', ad: 'B', oee: 0.6 }, { kod: 'M1', ad: 'A', oee: 0.3 }, { kod: 'M3', ad: 'C', oee: null }],
    } as unknown as OeeCevabi;
    expect(isMerkeziSatirlari(c)).toEqual([{ etiket: 'Freze', deger: 70, yol: '/oee' }]);
    expect(bilesenSatirlari(c).map((s) => s.etiket)).toEqual(['Kullanılabilirlik', 'Kalite', 'OEE']);
    expect(dusukMakineSatirlari(c).map((s) => [s.etiket, s.deger])).toEqual([['M1 A', 30], ['M2 B', 60]]);
  });
});
