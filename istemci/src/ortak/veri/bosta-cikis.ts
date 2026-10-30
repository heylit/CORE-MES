import { useEffect, useRef } from 'react';

// 1356 a (kart #1358): istasyonda 15 dk dokunulmayan ekranda oturum kapanır; sıradaki kişi öncekinin oturumunu devralmasın. Sunucu da
// aynı süreyi tutar ama terminal sürekli sorduğu için ekran açıkken onun sayacı dolmaz; boşta olmayı yalnız ekran bilir.
export const ISTASYON_BOSTA_MS = 15 * 60 * 1000;

// Kişinin ekrana dokunduğunu gösteren olaylar. Fare kıpırtısı sayılmaz: tezgâhın yanındaki titreşim ya da kayan fare oturumu açık tutmasın.
export const ETKINLIK_OLAYLARI = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function useBostaCikis(etkin: boolean, cikis: () => void, sureMs: number = ISTASYON_BOSTA_MS): void {
  // Çıkış işlevi her çizimde yeniden kurulabilir; sayaç onun yüzünden baştan başlamasın.
  const cikisRef = useRef(cikis);
  cikisRef.current = cikis;
  useEffect(() => {
    if (!etkin) return undefined;
    let zaman = window.setTimeout(() => { cikisRef.current(); }, sureMs);
    const tazele = () => {
      window.clearTimeout(zaman);
      zaman = window.setTimeout(() => { cikisRef.current(); }, sureMs);
    };
    for (const olay of ETKINLIK_OLAYLARI) window.addEventListener(olay, tazele, { capture: true, passive: true });
    return () => {
      window.clearTimeout(zaman);
      for (const olay of ETKINLIK_OLAYLARI) window.removeEventListener(olay, tazele, { capture: true });
    };
  }, [etkin, sureMs]);
}
