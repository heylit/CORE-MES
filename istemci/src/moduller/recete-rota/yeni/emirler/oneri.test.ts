import { describe, expect, it } from 'vitest';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { oneriAdaylari, oneriDegerleri, teslimBagsizMi } from './oneri.ts';

const secenek = (satirlar: { id: number; adet: string; acik?: string; termin: string | null }[]): AcilisSecenekleri => ({
  projeZorunlu: true, rotasizAcik: true,
  projeler: [{ id: 7, kod: 'ORN-P-0007', ad: 'ORN proje', satirlar: satirlar.map((s, i) => ({ id: s.id, siparisNo: 'ORN-S-0042', satirNo: i + 1, adet: s.adet, termin: s.termin, ...(s.acik === undefined ? {} : { acikEmirAdedi: s.acik }) })) }],
});

describe('emir önerisi (3657)', () => {
  it('miktar kalan adettir, termin satırın terminidir', () => {
    const [a] = oneriAdaylari(secenek([{ id: 1, adet: '500', acik: '180', termin: '2026-12-18' }]));
    expect(oneriDegerleri(a!)).toEqual({ miktar: '320', teslim: '2026-12-18' });
  });
  it('açık emir yoksa ya da alan gelmezse satırın tamamı', () => {
    expect(oneriDegerleri(oneriAdaylari(secenek([{ id: 1, adet: '500', termin: '2026-12-18' }]))[0]!).miktar).toBe('500');
  });
  it('satır tamamen açılmışsa miktar önerilmez', () => {
    expect(oneriDegerleri(oneriAdaylari(secenek([{ id: 1, adet: '500', acik: '500', termin: null }]))[0]!)).toEqual({ miktar: null, teslim: null });
  });
  it('aday yoksa boş liste', () => {
    expect(oneriAdaylari(undefined)).toEqual([]);
  });
  it('teslim terminden farklıysa bağsız açılır', () => {
    const a = oneriAdaylari(secenek([{ id: 1, adet: '5', termin: '2026-12-18' }]))[0]!;
    expect(teslimBagsizMi('2026-12-30', a)).toBe(true);
    expect(teslimBagsizMi('2026-12-18', a)).toBe(false);
    expect(teslimBagsizMi('2026-12-30', null)).toBe(false);
  });
});
