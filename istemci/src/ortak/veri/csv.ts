// Liste ekranlarının dışa aktarması: noktalı virgül, BOM ve ondalık virgül (Excel Türkçe açar).
// Ekranda görünen satırlar aktarılır; sunucuya ayrı istek gitmez.
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';

export type CsvDegeri = string | number | null;

// Excel, tırnak içinde de olsa = + - @ sekme ya da satır başıyla başlayan hücreyi formül sayar; dışarıdan gelen ad
// (portal, tedarikçi) açanın bilgisayarında komut çalıştırabilir. Böyle metin ' ile başlar, gerçek sayı olduğu gibi kalır.
// Kendi biçimiyle yazan dışa aktarmalar da metin hücresini buradan geçirir. `sayiSerbest`: metin olarak tutulan düz sayı
// ('-0,02') formül değildir, kesme işaretsiz kalır.
const FORMUL_BASI = /^[=+\-@\t\r]/;
const DUZ_SAYI = /^[+-]?\d+(?:[.,]\d+)?$/;
export const formulKoru = (metin: string, secenek?: { sayiSerbest?: boolean }): string =>
  FORMUL_BASI.test(metin) && !(secenek?.sayiSerbest === true && DUZ_SAYI.test(metin)) ? `'${metin}` : metin;
export const csvHucresi = (v: CsvDegeri): string => {
  const metin = typeof v === 'number' ? String(v).replace('.', ',') : formulKoru(v ?? '');
  return `"${metin.replace(/"/g, '""')}"`;
};

export function csvMetni(basliklar: readonly string[], satirlar: readonly (readonly CsvDegeri[])[]): string {
  return '﻿' + [basliklar.map(csvHucresi).join(';'), ...satirlar.map((s) => s.map(csvHucresi).join(';'))].join('\r\n');
}

// Sunucunun ondalık metni ('2.5000') sayı olarak yazılır; boş kalır.
export const ondalik = (m: string | null): number | null => (m === null ? null : Number(m));

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
