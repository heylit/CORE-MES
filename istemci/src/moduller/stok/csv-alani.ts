import { formulKoru } from '../../ortak/veri/csv.ts';

// Stok listelerinin CSV hücresi: hep tırnaklı; formül gibi başlayan metin ' ile başlar (Excel onu komut olarak çalıştırmasın),
// eksi miktar gibi düz sayı metni olduğu gibi kalır.
export const stokCsvAlani = (v: string | number | null): string =>
  `"${(typeof v === 'string' ? formulKoru(v, { sayiSerbest: true }) : String(v ?? '')).replace(/"/g, '""')}"`;
