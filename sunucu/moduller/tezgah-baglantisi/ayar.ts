import { kurumIciMi } from '#cekirdek/kurum-ici.ts';

// Tezgahların ortak MTConnect servisinin adresi yalnız ortam değişkenindedir (kart 3373, ADR 0033); depoya, karta, teste, günlüğe ve
// hata metnine girmez.
export const TEZGAH_DEGISKENI = 'TMIV2_TEZGAH_MTCONNECT_ADRESI';

type Ortamlar = Record<string, string | undefined>;

const ILETI = `Ortam değişkeni geçersiz: ${TEZGAH_DEGISKENI}`;

// Adres yoksa bağlantı kapalıdır (null): istek atılmaz, sunucu açılır. Geçersiz adres açılışı durdurur; ileti değeri söylemez.
export function tezgahAdresiOku(env: Ortamlar): string | null {
  const ham = env[TEZGAH_DEGISKENI]?.trim() ?? '';
  if (ham === '') return null;
  let url: URL;
  try {
    url = new URL(ham);
  } catch {
    throw new Error(`${ILETI} (http:// ya da https:// ile başlayan servis adresi olmalı)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${ILETI} (http:// ya da https:// ile başlayan servis adresi olmalı)`);
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') throw new Error(`${ILETI} (kullanıcı, parola, sorgu ve # taşımaz)`);
  if (!kurumIciMi(url.hostname)) throw new Error(`${ILETI} (yalnız kurum içi adres: özel IP ya da tek parçalı sunucu adı)`);
  // Yol soneki istemcide sabittir (/probe, /current); adres servis köküdür.
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
