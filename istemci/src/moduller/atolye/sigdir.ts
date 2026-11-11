import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

// Harita ekrana sığar: sahnenin yüksekliği, kaydırma kabının görünen alt kenarına kadar olan boşluktur (telefonda alt
// çubuk kabın dışındadır). Yükseklik --atolye-sahne-boy değişkeniyle verilir; ölçü yoksa CSS'teki varsayılan geçerlidir.
// En az yükseklik CSS'tedir (--kadran-enaz); burada yalnız ölçülen boşluk yazılır.

function kaydirmaKabi(oge: HTMLElement): HTMLElement | null {
  for (let e = oge.parentElement; e; e = e.parentElement) {
    const y = getComputedStyle(e).overflowY;
    if (y === 'auto' || y === 'scroll') return e;
  }
  return null;
}

export function sahneBoyu(sahneUstu: number, kabUstu: number, kabKaydirma: number, kabBoyu: number, altPay: number): number {
  const icerikUstu = sahneUstu - kabUstu + kabKaydirma;
  return Math.max(0, Math.round(kabBoyu - icerikUstu - altPay));
}

export function useEkranaSigdir(kok: RefObject<HTMLElement | null>, sahne: RefObject<HTMLElement | null>, etkin: boolean): void {
  useLayoutEffect(() => {
    const k = kok.current;
    const s = sahne.current;
    if (!k || !s) return undefined;
    if (!etkin) { k.style.removeProperty('--atolye-sahne-boy'); k.removeAttribute('data-sigdi'); return undefined; }
    const olc = () => {
      const kap = kaydirmaKabi(s);
      const altPay = parseFloat(getComputedStyle(k).getPropertyValue('--b-4')) || 0;
      const boy = kap
        ? sahneBoyu(s.getBoundingClientRect().top, kap.getBoundingClientRect().top, kap.scrollTop, kap.clientHeight, altPay)
        : sahneBoyu(s.getBoundingClientRect().top, 0, window.scrollY, window.innerHeight, altPay);
      if (boy <= 0) return;
      k.style.setProperty('--atolye-sahne-boy', `${boy}px`);
      k.setAttribute('data-sigdi', '');
    };
    olc();
    window.addEventListener('resize', olc);
    // Üstteki şerit büyüyüp küçülünce (uyarı, özet ayrıntısı) yeniden ölçülür; gözlemci yoksa (eski tarayıcı) yalnız pencere boyu.
    const g = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(olc);
    if (g && k.firstElementChild) g.observe(k.firstElementChild);
    return () => { window.removeEventListener('resize', olc); g?.disconnect(); };
  }, [kok, sahne, etkin]);
}
