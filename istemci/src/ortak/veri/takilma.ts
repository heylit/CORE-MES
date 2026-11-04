// Takılma koruması (kart 2092, karar 2081-29): kare hızı art arda düşük kalırsa bir kez haber verir ve durur. Sekme
// gizliyken ölçmez (tarayıcı kareyi zaten durdurur); açılışın ilk saniyeleri sayılmaz, yükleme anı her cihazda takılır.
export const DUSUK_KARE_HIZI = 30;
export const OLCU_PENCERESI_MS = 1000;
export const ART_ARDA_PENCERE = 3;
export const ISINMA_MS = 5000;

export function kareHizi(kareSayisi: number, sureMs: number): number {
  return sureMs <= 0 ? 0 : (kareSayisi * 1000) / sureMs;
}

interface Zamanlayici {
  kare: (geri: (an: number) => void) => number;
  iptal: (no: number) => void;
  simdi: () => number;
  gizli: () => boolean;
}

const TARAYICI: Zamanlayici = {
  kare: (g) => requestAnimationFrame(g),
  iptal: (n) => { cancelAnimationFrame(n); },
  simdi: () => performance.now(),
  gizli: () => document.visibilityState === 'hidden',
};

export function takilmaIzle(tetik: () => void, z: Zamanlayici = TARAYICI): () => void {
  if (typeof requestAnimationFrame !== 'function' && z === TARAYICI) return () => undefined;
  const bas = z.simdi();
  let pencereBasi = bas + ISINMA_MS;
  let kareler = 0;
  let kotu = 0;
  let son = bas;
  let no = 0;
  let bitti = false;
  const adim = (an: number) => {
    if (bitti) return;
    // Uzun ara (sekme arka plandaydı, cihaz uyudu) ölçüyü bozar: pencere baştan başlar.
    if (z.gizli() || an - son > OLCU_PENCERESI_MS) { pencereBasi = an; kareler = 0; kotu = 0; }
    son = an;
    if (an >= pencereBasi) {
      kareler += 1;
      const gecen = an - pencereBasi;
      if (gecen >= OLCU_PENCERESI_MS) {
        kotu = kareHizi(kareler, gecen) < DUSUK_KARE_HIZI ? kotu + 1 : 0;
        pencereBasi = an;
        kareler = 0;
        if (kotu >= ART_ARDA_PENCERE) { bitti = true; tetik(); return; }
      }
    }
    no = z.kare(adim);
  };
  no = z.kare(adim);
  return () => { bitti = true; z.iptal(no); };
}
