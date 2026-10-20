import { z } from 'zod';

// numeric sütunu metin taşınır: number'a çevrilen değer 15-17 basamaktan sonrasını yitirir.
// Biçim PostgreSQL'in sonlu numeric çıktısıdır. NaN ve Infinity de geçerli numeric değeridir ama
// burada reddedilir: ölçü ve tutar olarak anlamları yoktur, sessizce geçmek yerine cevap düşer.
const ONDALIK = /^-?\d+(\.\d+)?$/;

export const ondalikMetinSemasi = z.string().regex(ONDALIK, 'Ondalık sayı bekleniyor (örnek: 12.50)');

export type OndalikMetin = z.output<typeof ondalikMetinSemasi>;
