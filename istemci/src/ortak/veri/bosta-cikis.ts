import { useEffect, useRef } from 'react';

// 2226-3 (kullanıcı 07.11; 1356 a'nın 15 dk'sının yerine): istasyondaki oturumu kişinin vardiya sonu sunucuda kapatır; ekran yalnız
// sekiz saat hiç dokunulmazsa çıkar (vardiyası tanımsız kişinin yedeği). Terminal sürekli sorduğu için sunucunun boşta sayacı ekran
// açıkken dolmaz; dokunulmamayı yalnız ekran bilir.
export const ISTASYON_BOSTA_MS = 8 * 60 * 60 * 1000;

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
