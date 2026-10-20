import { z } from 'zod';

// Aynı alan iki yönde taşınır: cevapta kaydın güncel sürümü, komut gövdesinde istemcinin okuduğu (beklenen) sürüm.
// Sütun `integer` olduğu için sayı döner; ilk değer 1'dir. Üst sınır sütunun sınırıdır: aşan değer sorguya
// varırsa veritabanı aralık hatası verir ve komut 400 yerine 500 döner.
export const AZAMI_SURUM = 2147483647;
export const surumSemasi = z.number().int().min(1).max(AZAMI_SURUM);

// Düzenleme gövdesine yayılır: `z.object({ ...beklenenSurum, ad: ... })`. Kaydı ilk kez açan gövdeye konmaz.
export const beklenenSurum = { surum: surumSemasi };

export type Surum = z.output<typeof surumSemasi>;
