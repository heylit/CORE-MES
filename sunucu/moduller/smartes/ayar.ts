import { isIP } from 'node:net';

// SmartES adresi yalnız ortam değişkenindedir (kart #778); depoya, karta, teste, günlüğe ve hata metnine girmez.
export const SMARTES_DEGISKENLERI = ['TMIV2_SMARTES_ADRESI', 'TMIV2_SMARTES_AD_ALANI'] as const;

// ASMX varsayılan ad alanı; SmartES kurulumunda değiştirilmişse TMIV2_SMARTES_AD_ALANI ile verilir.
export const VARSAYILAN_AD_ALANI = 'http://tempuri.org/';

export interface SmartesAyari {
  // Servisin tam adresi (.asmx dahil); SOAP isteği bu adrese gider.
  adres: string;
  // SOAP gövdesindeki metot öğesinin ad alanı ve SOAPAction öneki; sonu '/' ile biter.
  adAlani: string;
}

type Ortamlar = Record<string, string | undefined>;

// Kurum içi adres: özel ya da yerel IPv4, IPv6 yerel ya da tek parçalı ad (alan adı yok). İnternete çıkan adres açılışta reddedilir.
// logo/ayar.ts kurumIciMi ile aynı kural; ortak parçaya taşınması çekirdekten istendi (CEKIRDEK-ISTEKLERI madde 1).
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

const ADRES_ILETISI = 'Ortam değişkeni geçersiz: TMIV2_SMARTES_ADRESI (http:// ya da https:// ile başlayan servis adresi olmalı)';

// Adres yoksa bağlantı kapalıdır (null): istek atılmaz, sunucu açılır. Adres geçersizse açılışta durulur; ileti değişkenin adını söyler, değerini söylemez.
export function smartesAyariOku(env: Ortamlar): SmartesAyari | null {
  const adres = env['TMIV2_SMARTES_ADRESI']?.trim() ?? '';
  const adAlaniHam = env['TMIV2_SMARTES_AD_ALANI']?.trim() ?? '';
  if (adres === '') {
    if (adAlaniHam !== '') throw new Error('Ortam değişkeni eksik: TMIV2_SMARTES_ADRESI (ad alanı verilmiş, adres verilmemiş)');
    return null;
  }
  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    throw new Error(ADRES_ILETISI);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(ADRES_ILETISI);
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_SMARTES_ADRESI (kullanıcı, parola, sorgu ve # taşımaz)');
  }
  if (!kurumIciMi(url.hostname)) {
    throw new Error('Ortam değişkeni geçersiz: TMIV2_SMARTES_ADRESI (yalnız kurum içi adres: özel IP ya da tek parçalı sunucu adı)');
  }
  let adAlani = VARSAYILAN_AD_ALANI;
  if (adAlaniHam !== '') {
    try {
      new URL(adAlaniHam);
    } catch {
      throw new Error('Ortam değişkeni geçersiz: TMIV2_SMARTES_AD_ALANI (http:// ile başlayan ad alanı olmalı)');
    }
    adAlani = adAlaniHam.endsWith('/') ? adAlaniHam : `${adAlaniHam}/`;
  }
  return { adres: `${url.origin}${url.pathname}`, adAlani };
}
