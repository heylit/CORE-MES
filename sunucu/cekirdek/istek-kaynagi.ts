// Çerezli yazma isteğinin bu sistemin kendi sayfasından geldiğini denetler (kart 2226, CSRF). SameSite=Strict tek başına
// yetmez: adresle girilen kurulumda aynı makinenin başka kapısındaki uygulama "aynı site" sayılır ve çerezi taşır.
// Tarayıcı Sec-Fetch-Site gönderiyorsa ona bakılır; göndermeyen eski tarayıcıda Origin kökeni isteğin adresiyle karşılaştırılır.
// İkisi de yoksa istek tarayıcıdan değildir (PDKS cihazı, saat, araç) ve çerez taşıma saldırısı söz konusu olamaz: geçer.

export const KAYNAK_REDDI = 'İstek bu sistemin sayfasından gelmedi; işlem reddedildi.';
export const GOVDE_TURU_REDDI = 'İstek gövdesi JSON olmalı.';

const IZINLI_FETCH_SITE: ReadonlySet<string> = new Set(['same-origin', 'none']);

export interface KaynakBasliklari {
  secFetchSite: string | undefined;
  origin: string | undefined;
  // İsteğin geldiği adres (vekil arkasında vekilin bildirdiği), "host[:port]".
  host: string;
}

function kokenHostu(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function kaynakReddedilirMi(b: KaynakBasliklari): boolean {
  const site = b.secFetchSite?.trim().toLowerCase();
  if (site !== undefined && site !== '') return !IZINLI_FETCH_SITE.has(site);
  if (b.origin === undefined) return false;
  const host = kokenHostu(b.origin.trim());
  return host === null || host.toLowerCase() !== b.host.trim().toLowerCase();
}

// Gövdeli yazma yalnız JSON taşır: text/plain ve form gövdesi tarayıcının ön denetimsiz (preflight) gönderebildiği türlerdir.
export function govdeTuruReddedilirMi(icerikTuru: string | undefined, govdeVar: boolean): boolean {
  if (!govdeVar) return false;
  const tur = (icerikTuru ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return tur !== 'application/json';
}
