// Uygulamanın adı ayar değildir (karar 1943): kurulumdan kuruluma değişmez; firma adı ayrı ayardır (kabuk.kurum-adi).
export const UYGULAMA_ADI = 'CORE';

// Firma adı girilmişse "<Firma adı> CORE", girilmemişse yalnız uygulama adı.
export function birlesikAd(kurumAdi: string | null | undefined): string {
  const ad = kurumAdi?.trim() ?? '';
  return ad === '' ? UYGULAMA_ADI : `${ad} ${UYGULAMA_ADI}`;
}
