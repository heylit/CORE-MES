// HttpOnly ve SameSite her çerezde sabittir. Secure istek HTTPS ile geldiyse ve canlıda her zaman konur: HTTPS kapalı
// geliştirme kurulumunda çerez düz HTTP'de de taşınmalıdır; açıkken tarayıcı çerezi aynı makinedeki şifresiz kapıya (4100) göndermez.
const AD = /^[a-z0-9_]+$/;
const DEGER = /^[A-Za-z0-9_-]*$/;

export function cerezOku(baslik: string | undefined, ad: string): string | null {
  if (!baslik) return null;
  for (const parca of baslik.split(';')) {
    const esit = parca.indexOf('=');
    if (esit < 0) continue;
    if (parca.slice(0, esit).trim() === ad) return parca.slice(esit + 1).trim();
  }
  return null;
}

export function cerezBasligi(ad: string, deger: string, azamiSn: number, guvenli = false): string {
  if (!AD.test(ad)) throw new Error(`Geçersiz çerez adı: ${ad}`);
  if (!DEGER.test(deger)) throw new Error(`Çerez değeri yalnız harf, rakam, '-' ve '_' içerebilir: ${ad}`);
  return `${ad}=${deger}; Path=/; Max-Age=${Math.max(0, Math.floor(azamiSn))}; HttpOnly; SameSite=Strict${guvenli ? '; Secure' : ''}`;
}
