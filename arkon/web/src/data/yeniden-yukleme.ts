/* Sunucu "iletiler kaçırıldı" deyince ($reload) sayfa yeniden yüklenir; operatör o an bir pencerede ya da yazı alanındaysa girdiği
   kaybolmasın diye yükleme pencere kapanana kadar ertelenir. Kaçırılan iletiler beklenirken veri eskidir: ertelemenin üst sınırı vardır. */
export const YUKLEME_YOKLAMA_MS = 2000;
export const YUKLEME_AZAMI_ERTELEME_MS = 10 * 60_000;

export function yuklemeErtelenmeli(belge: Pick<Document, 'querySelector' | 'activeElement'>): boolean {
  if (belge.querySelector('[role="dialog"], dialog[open]') !== null) return true;
  const odak = belge.activeElement;
  if (odak === null) return false;
  const ad = odak.tagName;
  return ad === 'TEXTAREA' || ad === 'SELECT' || (ad === 'INPUT' && (odak as HTMLInputElement).value !== '') || (odak as HTMLElement).isContentEditable === true;
}

// Ertelenmesi gerekmiyorsa hemen yükler; gerekiyorsa aralıkla bakar, pencere kapanınca ya da üst sınırda yükler. Tekrar çağrı bekleyeni yeniler, ikinci zamanlayıcı kurmaz.
export function yenidenYukleyici(
  yukle: () => void, ertelenmeli: () => boolean, zaman: { simdi: () => number; sonra: (is: () => void, ms: number) => unknown } = { simdi: Date.now, sonra: (is, ms) => setTimeout(is, ms) },
): () => void {
  let baslangic: number | null = null;
  const dene = (): void => {
    if (baslangic === null) return;
    if (!ertelenmeli() || zaman.simdi() - baslangic >= YUKLEME_AZAMI_ERTELEME_MS) { baslangic = null; yukle(); return; }
    zaman.sonra(dene, YUKLEME_YOKLAMA_MS);
  };
  return () => {
    if (baslangic !== null) return;
    baslangic = zaman.simdi();
    dene();
  };
}
