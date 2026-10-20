import { describe, expect, it } from 'vitest';
import { isSatiri, malzemeSatiri, modelDosyasi, saatMetni } from '../../../../arkon/web/src/data/buyuk-ekran.ts';

describe('Arkon terminal büyük ekranı', () => {
  it('3B model: birincil model dosyası önce, yoksa ilk model; model yoksa null', () => {
    const d = [{ name: 'resim.pdf' }, { name: 'parca.STEP' }, { name: 'ikinci.stl' }];
    expect(modelDosyasi(d, 'ikinci.stl')?.name).toBe('ikinci.stl');
    expect(modelDosyasi(d, 'resim.pdf')?.name).toBe('parca.STEP');
    expect(modelDosyasi([{ name: 'resim.pdf' }], 'resim.pdf')).toBeNull();
    expect(modelDosyasi(undefined)).toBeNull();
  });

  it('saat SS:DD; iş satırı malzeme ve operasyondan, boşsa yok', () => {
    expect(saatMetni(new Date(2026, 9, 12, 7, 5, 59).getTime())).toBe('07:05');
    expect(isSatiri('Mil', 'Op 20 · CNC')).toBe('Mil · Op 20 · CNC');
    expect(isSatiri(' ', null)).toBeNull();
    expect(isSatiri(null, 'Op 10')).toBe('Op 10');
  });

  it('malzeme satırı: parça no ve revizyon; adla aynı kod ve boş alan yazılmaz', () => {
    expect(malzemeSatiri({ partNo: 'P-1', rev: ' B ' }, 'Flanş')).toBe('P-1 · Rev B');
    expect(malzemeSatiri({ partNo: 'Flanş', rev: 'A' }, 'Flanş')).toBe('Rev A');
    expect(malzemeSatiri({ partNo: 'P-1', rev: '' }, 'Flanş')).toBe('P-1');
    expect(malzemeSatiri({ rev: '' }, 'Flanş')).toBeNull();
    expect(malzemeSatiri(null, 'Flanş')).toBeNull();
  });

  it('malzeme satırı TMI paketinde: malzemeNo sayı kimliktir, yazılmaz ve ekranı düşürmez; metin olmayan alan boş sayılır', () => {
    expect(malzemeSatiri({ malzemeNo: 1, partNo: 'MM-ADM-00001', rev: 'A' } as { partNo: unknown; rev: unknown }, 'Flanş')).toBe('MM-ADM-00001 · Rev A');
    expect(malzemeSatiri({ partNo: 42, rev: 3 }, 'Flanş')).toBeNull();
    expect(isSatiri(7, 'Op 10')).toBe('Op 10');
  });
});
