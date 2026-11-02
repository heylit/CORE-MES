import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// Kartlı akışın kaydırma davranışı (1843; Kurulum ve Takım Ömrü ortak): odaktaki satır ortaya, odaktaki kart görünür yere gelir;
// dokunmatik kaydırma bitince ortadaki satır odak olur. Kodla yapılan kaydırma kişinin kaydırması sayılmaz (yoksa odak geri sıçrar).
export function useAkisKaydirma(kap: RefObject<HTMLElement | null>, aktif: () => number, satiraGit: (i: number) => void): void {
  const kodla = useRef(0);

  useLayoutEffect(() => {
    const k = kap.current, el = k?.querySelector<HTMLElement>('[data-aktif="1"]');
    if (!k || !el) return;
    const yumusak = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    kodla.current = performance.now();
    k.scrollTo?.({ top: el.offsetTop - k.clientHeight / 2 + el.offsetHeight / 2, behavior: yumusak ? 'smooth' : 'auto' });
    const sira = el.querySelector<HTMLElement>('[data-kartlar]'), kart = sira?.querySelector<HTMLElement>('[data-odak="1"]');
    if (sira && kart) sira.scrollTo?.({ left: kart.offsetLeft - sira.clientWidth / 2 + kart.offsetWidth / 2, behavior: yumusak ? 'smooth' : 'auto' });
  });

  useEffect(() => {
    const k = kap.current;
    if (!k) return undefined;
    let bekle = 0;
    const kaydi = (): void => {
      clearTimeout(bekle);
      bekle = window.setTimeout(() => {
        if (performance.now() - kodla.current < 700) return;
        const orta = k.scrollTop + k.clientHeight / 2;
        let en = aktif(), fark = Infinity;
        k.querySelectorAll<HTMLElement>('[data-satir]').forEach((el) => {
          const f = Math.abs(el.offsetTop + el.offsetHeight / 2 - orta);
          if (f < fark) { fark = f; en = Number(el.dataset['satir']); }
        });
        if (en !== aktif()) satiraGit(en);
      }, 140);
    };
    k.addEventListener('scroll', kaydi, { passive: true });
    return () => { clearTimeout(bekle); k.removeEventListener('scroll', kaydi); };
  }, [kap, aktif, satiraGit]);
}
