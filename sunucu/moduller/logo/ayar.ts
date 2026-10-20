import { isIP } from 'node:net';

// Köprü adresi ve anahtarı yalnız ortam değişkenindedir (kart #210); depoya, karta, günlüğe ve hata metnine girmez.
export const LOGO_DEGISKENLERI = ['TMIV2_LOGO_KOPRU_ADRESI', 'TMIV2_LOGO_KOPRU_ANAHTARI'] as const;

export interface LogoAyari {
  // Sonunda '/' olmayan kök adres; uç yolları buna eklenir.
  adres: string;
  anahtar: string;
}

type Ortamlar = Record<string, string | undefined>;

// Kurum içi adres (ADR 0011): özel ya da yerel IPv4, IPv6 yerel ya da tek parçalı ad (alan adı yok).
// İnternete çıkan adres açılışta reddedilir; dış servis çağrısı yasağı sürer.
export function kurumIciMi(host: string): boolean {
  const ad = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (ad === 'localhost') return true;
  const surum = isIP(ad);
  if (surum === 4) {
    const [a = -1, b = -1] = ad.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (surum === 6) return ad === '::1' || /^f[cd][0-9a-f]{2}:/.test(ad) || /^fe[89ab][0-9a-f]:/.test(ad);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(ad);
}

// İki değişken de yoksa bağlantı kapalıdır (null): kuyruk birikir, istek atılmaz, sunucu açılır.
// Biri eksik ya da adres geçersizse açılışta durulur; ileti değişkenin adını söyler, değerini söylemez.
export function logoAyariOku(env: Ortamlar): LogoAyari | null {
  const adres = env['TMIV2_LOGO_KOPRU_ADRESI']?.trim() ?? '';
  const anahtar = env['TMIV2_LOGO_KOPRU_ANAHTARI']?.trim() ?? '';
  if (adres === '' && anahtar === '') return null;
  if (adres === '') throw new Error('Ortam değişkeni eksik: TMIV2_LOGO_KOPRU_ADRESI (anahtar verilmiş; ikisi birlikte verilir ya da hiçbiri)');
  if (anahtar === '') throw new Error('Ortam değişkeni eksik: TMIV2_LOGO_KOPRU_ANAHTARI (adres verilmiş; ikisi birlikte verilir ya da hiçbiri)');
  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_LOGO_KOPRU_ADRESI (http:// ya da https:// ile başlayan adres olmalı)');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_LOGO_KOPRU_ADRESI (http:// ya da https:// ile başlayan adres olmalı)');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_LOGO_KOPRU_ADRESI (kullanıcı, parola, sorgu ve # taşımaz; anahtar ayrı değişkendedir)');
  }
  if (!kurumIciMi(url.hostname)) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_LOGO_KOPRU_ADRESI (yalnız kurum içi adres: özel IP ya da tek parçalı sunucu adı; ADR 0011)');
  }
  return { adres: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, anahtar };
}
