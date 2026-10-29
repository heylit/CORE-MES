import { describe, expect, it } from 'vitest';
import { stokCsvAlani } from './csv-alani.ts';

describe('stok CSV hücresi', () => {
  it('formül gibi başlayan metin \' ile başlar; sayı, eksi miktar ve boş değer değişmez', () => {
    expect(stokCsvAlani('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(stokCsvAlani('@a')).toBe(`"'@a"`);
    expect(stokCsvAlani('-5,000')).toBe('"-5,000"');
    expect(stokCsvAlani(12)).toBe('"12"');
    expect(stokCsvAlani(null)).toBe('""');
  });
});
