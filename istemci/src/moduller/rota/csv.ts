// S4 b: dışa aktarma yalnız CSV ve yalnız liste ekranlarında. Biçim stok hareketleriyle aynı: noktalı virgül, BOM, ondalık virgül
// (Excel Türkçe açar). Ekranda görünen satırlar aktarılır; sunucuya ayrı istek gitmez.
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

export type CsvDegeri = string | number | null;

const alan = (v: CsvDegeri) => `"${(typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')).replace(/"/g, '""')}"`;

export function csvMetni(basliklar: readonly string[], satirlar: readonly (readonly CsvDegeri[])[]): string {
  return '﻿' + [basliklar.map(alan).join(';'), ...satirlar.map((s) => s.map(alan).join(';'))].join('\r\n');
}

// Ondalık metin ('2.5000') sayı olarak yazılır; boş kalır.
export const ondalik = (m: string | null): number | null => (m === null ? null : Number(m));

export function csvIndir(ad: string, basliklar: readonly string[], satirlar: readonly (readonly CsvDegeri[])[]): void {
  const blob = new Blob([csvMetni(basliklar, satirlar)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ad}-${tesisGunu(Date.now())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
