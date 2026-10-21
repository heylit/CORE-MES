// Yardımcı adresi ve anahtarı yalnız ortam değişkenindedir (kart #210); depoya, karta, günlüğe ve hata metnine girmez.
export const LOGO_DEGISKENLERI = ['TMIV2_LOGO_KOPRU_ADRESI', 'TMIV2_LOGO_KOPRU_ANAHTARI'] as const;

export interface LogoAyari {
  // Sonunda '/' olmayan kök adres; uç yolları buna eklenir.
  adres: string;
  anahtar: string;
}

type Ortamlar = Record<string, string | undefined>;

// Logo yardımcısı TMI sunucusuyla aynı bilgisayarda çalışır ve yalnız geri döngü adresini dinler (ADR 0017):
// adres yalnız 127.0.0.1, localhost ya da [::1] olabilir; başka her adres açılışta reddedilir.
export function yerelMi(host: string): boolean {
  const ad = host.replace(/^\[|\]$/g, '').toLowerCase();
  return ad === '127.0.0.1' || ad === 'localhost' || ad === '::1';
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
  if (!yerelMi(url.hostname)) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_LOGO_KOPRU_ADRESI (yalnız aynı bilgisayar: 127.0.0.1, localhost ya da [::1]; ADR 0017)');
  }
  return { adres: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, anahtar };
}
