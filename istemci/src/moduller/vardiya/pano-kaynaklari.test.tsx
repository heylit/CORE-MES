import { describe, expect, it } from 'vitest';
import type { VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { vardiyasizKalemi } from './pano-kaynaklari.tsx';

describe('vardiya pano kaynagi (kart 1585)', () => {
  it('vardiyasi secilmeyen kisileri sayar; hepsi seciliyse kalem yok', () => {
    const c = (idler: (number | null)[]) => ({ personel: idler.map((vardiyaId) => ({ vardiyaId })) }) as unknown as VardiyaPersoneliCevabi;
    expect(vardiyasizKalemi(c([null, 3, null]))[0]).toMatchObject({ baslik: '2 kişinin vardiyası seçilmemiş', yol: '/vardiya/personel' });
    expect(vardiyasizKalemi(c([1, 2]))).toEqual([]);
  });
});
