import { useEffect, useRef, useState } from 'react';
import { etkiAcik } from '../../veri/etki.ts';

// Hareket kapalıysa (Sistem Ayarları'nda "kapalı" ya da işletim sisteminde azaltılmış hareket) sayı ilk anda tam yazılır.
// Kurum "grafik hareketi"ni kapattıysa da öyle. Ölçülemeyen ortamda (test, eski tarayıcı) hareket yok sayılır: değer hiç
// eksik görünmez.
export function hareketAcik(): boolean {
  try {
    if (document.documentElement.getAttribute('data-hareket') === 'kapali' || !etkiAcik('grafik-hareket')) return false;
    if (typeof window.matchMedia !== 'function' || typeof requestAnimationFrame !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const SAYAC_SURESI_MS = 600;
const yavasla = (t: number) => 1 - (1 - t) ** 3;

// Sayı sayacı: değer ilk gelişte sıfırdan, sonra eski değerden yenisine sayar. Ara değerler yalnız görünümdür;
// bitişte tam değer yazılır. null "veri yok"tur, sayılmaz.
export function useSayac(hedef: number | null, sure = SAYAC_SURESI_MS): number | null {
  const [gorunen, gorunenYaz] = useState<number | null>(() => (hedef === null || !hareketAcik() ? hedef : 0));
  const onceki = useRef<number>(0);
  useEffect(() => {
    if (hedef === null || !hareketAcik()) { gorunenYaz(hedef); if (hedef !== null) onceki.current = hedef; return; }
    const bas = onceki.current;
    let baslangic: number | null = null;
    let kare = 0;
    const adim = (an: number) => {
      baslangic ??= an;
      const t = Math.min(1, (an - baslangic) / sure);
      gorunenYaz(t >= 1 ? hedef : bas + (hedef - bas) * yavasla(t));
      if (t < 1) kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    onceki.current = hedef;
    return () => { cancelAnimationFrame(kare); };
  }, [hedef, sure]);
  return gorunen;
}
