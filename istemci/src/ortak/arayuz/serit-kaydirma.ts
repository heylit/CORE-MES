import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

// Yatay şerit kaydırma (ikinci menünün ok davranışı): gizli madde olan kenarda solma ve ok; fare okta beklerse şerit sürekli
// kayar, oka tıklamak bir sayfa atlatır, dikey tekerlek yana çevrilir. Dokunmada yalnız tıkla atlama vardır.
const KAYMA_HIZI = 0.6;
const SAYFA_ORANI = 0.75;
const SATIR_PIKSELI = 40;

export type Yon = 1 | -1;

const sinir = (el: HTMLElement) => Math.max(0, el.scrollWidth - el.clientWidth);
const kaydir = (el: HTMLElement, hedef: number) => { el.scrollLeft = Math.min(sinir(el), Math.max(0, hedef)); };

export interface SeritKaydirma {
  kenar: { sol: boolean; sag: boolean };
  okOlaylari: (yon: Yon) => {
    onPointerEnter: (o: PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onClick: () => void;
  };
}

export function useSeritKaydirma(kutu: RefObject<HTMLElement | null>): SeritKaydirma {
  const [kenar, kenarYaz] = useState({ sol: false, sag: false });
  const kayma = useRef<number | null>(null);

  const dur = () => {
    if (kayma.current !== null) cancelAnimationFrame(kayma.current);
    kayma.current = null;
  };

  const kenardaKay = (yon: Yon) => {
    dur();
    let onceki: number | null = null;
    const adim = (zaman: number) => {
      const el = kutu.current;
      const gecen = onceki === null ? 0 : zaman - onceki;
      onceki = zaman;
      if (!el) { kayma.current = null; return; }
      kaydir(el, el.scrollLeft + yon * KAYMA_HIZI * gecen);
      // Uçta durur: ok o anda gizlenir ve fare çıkışı gelmeyebilir.
      const uc = yon > 0 ? el.scrollLeft >= sinir(el) - 1 : el.scrollLeft <= 1;
      kayma.current = uc ? null : requestAnimationFrame(adim);
    };
    kayma.current = requestAnimationFrame(adim);
  };

  const sayfaAtla = (yon: Yon) => {
    const el = kutu.current;
    if (!el) return;
    dur();
    const kalan = yon > 0 ? sinir(el) - el.scrollLeft : el.scrollLeft;
    // Gizli kalan kısım bir ekrandan kısaysa uca gidilir; yoksa okun altında birkaç piksel kalır, ikinci tık gerekir.
    kaydir(el, el.scrollLeft + yon * (kalan < el.clientWidth ? kalan : el.clientWidth * SAYFA_ORANI));
  };

  useEffect(() => dur, []);

  // React tekerlek olayı pasif olduğundan dinleyici elle eklenir; uca gelince sayfa kayar.
  useEffect(() => {
    const el = kutu.current;
    if (!el) return undefined;
    const teker = (o: WheelEvent) => {
      if (o.ctrlKey || Math.abs(o.deltaX) >= Math.abs(o.deltaY)) return;
      const carpan = o.deltaMode === 1 ? SATIR_PIKSELI : o.deltaMode === 2 ? el.clientWidth : 1;
      const once = el.scrollLeft;
      kaydir(el, once + o.deltaY * carpan);
      if (el.scrollLeft !== once) o.preventDefault();
    };
    el.addEventListener('wheel', teker, { passive: false });
    return () => { el.removeEventListener('wheel', teker); };
  }, [kutu]);

  useEffect(() => {
    const el = kutu.current;
    if (!el) return undefined;
    const olc = () => {
      const sol = el.scrollLeft > 1;
      const sag = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      kenarYaz((o) => (o.sol === sol && o.sag === sag ? o : { sol, sag }));
    };
    olc();
    void document.fonts?.ready.then(olc);
    el.addEventListener('scroll', olc, { passive: true });
    window.addEventListener('resize', olc);
    const gozcu = typeof ResizeObserver === 'function' ? new ResizeObserver(olc) : null;
    gozcu?.observe(el);
    return () => {
      el.removeEventListener('scroll', olc);
      window.removeEventListener('resize', olc);
      gozcu?.disconnect();
    };
  }, [kutu]);

  return {
    kenar,
    okOlaylari: (yon) => ({
      // Dokunmada giriş olayı tıklamayla birlikte gelir; orada sayfa atlatmak yeter.
      onPointerEnter: (o) => { if (o.pointerType === 'mouse') kenardaKay(yon); },
      onPointerLeave: dur,
      onClick: () => sayfaAtla(yon),
    }),
  };
}
