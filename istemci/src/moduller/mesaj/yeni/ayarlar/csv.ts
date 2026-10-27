// Prototipin csvOf'u (838/4 a): noktalı virgül, BOM, yalnız gerekince tırnak, sayı olduğu gibi (ERP'ye geri yükleme bu biçimi bekler).
export type EskiCsvDegeri = string | number | null | undefined;

const alan = (v: EskiCsvDegeri): string => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function eskiCsv(basliklar: readonly string[], satirlar: readonly (readonly EskiCsvDegeri[])[]): string {
  return '﻿' + [basliklar, ...satirlar].map((r) => r.map(alan).join(';')).join('\r\n');
}

// Prototipte kişisi olmayan alan (atanmamış görev) uygulamanın eski adını taşırdı (pname).
export const KISISIZ = 'Mesai';
