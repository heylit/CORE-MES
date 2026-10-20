// Dışa aktarma yalnız CSV; biçim öteki listelerle aynı: noktalı virgül, BOM, ondalık virgül (Excel Türkçe açar).
// Ekranda görünen satırlar aktarılır; sunucuya ayrı istek gitmez.
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

export type CsvDegeri = string | number | null;

const alan = (v: CsvDegeri) => `"${(typeof v === 'number' ? String(v).replace('.', ',') : (v ?? '')).replace(/"/g, '""')}"`;

export function csvMetni(basliklar: readonly string[], satirlar: readonly (readonly CsvDegeri[])[]): string {
  return '﻿' + [basliklar.map(alan).join(';'), ...satirlar.map((s) => s.map(alan).join(';'))].join('\r\n');
}

export function csvIndir(ad: string, basliklar: readonly string[], satirlar: readonly (readonly CsvDegeri[])[]): void {
  const blob = new Blob([csvMetni(basliklar, satirlar)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ad}-${tesisGunu(Date.now())}.csv`;
  a.click();
  // Bırakma işlevi çağrı anında alınır: adres nesnesi sonradan değişse de (test ortamı) aynı nesne bırakır.
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => birak(a.href), 1000);
}
