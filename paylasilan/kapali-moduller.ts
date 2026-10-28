// Kapalı modül (1067 teyit, 1071 a): kodu, tabloları ve yetki satırları durur; uygulama onu yüklemez. Sunucu uçlarını
// kaydetmez, istemci sayfasını, menüsünü, rehberini, hızlı işini ve ayar ekranını almaz, ekran testleri koşmaz.
// Modülün kendi birim testleri koşmaya devam eder: kod main'le birlikte güncel kalır. Açmak listeden satırı silmektir;
// açmadan önce modülün UYUM-BORCU.md dosyasındaki "kapalı modül" maddeleri kapanır.
export const KAPALI_MODULLER: readonly string[] = ['portal', 'mesaj'];

export const modulKapaliMi = (ad: string): boolean => KAPALI_MODULLER.includes(ad);

// Kapalı modülün sayfası kendi adıyla başlar (`/portal`, `/mesaj/...`).
export const kapaliModulYoluMu = (yol: string): boolean =>
  KAPALI_MODULLER.some((ad) => yol === `/${ad}` || yol.startsWith(`/${ad}/`));

// Toplayıcıların `moduller/<ad>/...` anahtarlı dosya listesinden kapalı modülleri çıkarır.
export function acikModulDosyalari<T>(dosyalar: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(dosyalar).filter(([yol]) => {
    const ad = /(?:^|\/)moduller\/([^/]+)\//.exec(yol)?.[1];
    return ad === undefined || !modulKapaliMi(ad);
  }));
}
