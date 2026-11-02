import type { QueryClient } from '@tanstack/react-query';
import type { AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { anahtarlar } from './anahtarlar.ts';

// Ekranın listede gördüğü değer: değiştirme komutu bunu `beklenen` olarak gönderir. Liste yoksa (ayar görülmeden yazılıyorsa)
// gönderilmez; sunucu o zaman denetlemez.
export function gorulenDeger(istemci: QueryClient, anahtar: string): boolean | number | string | null | undefined {
  const ayar = istemci.getQueryData<AyarlarCevabi>(anahtarlar.liste)?.ayarlar.find((a) => a.anahtar === anahtar);
  return ayar?.deger;
}
