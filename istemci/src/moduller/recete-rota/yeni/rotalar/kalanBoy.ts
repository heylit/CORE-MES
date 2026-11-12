import { useLayoutEffect, type RefObject } from 'react';

// Gövde (şema ya da tablo ve iki çekmece) kaydırma kabının kalan yüksekliğini alır: sayfa ayrıca kaymaz, tek kaydırma çalışma
// alanında kalır. Sabit vh boyu üst çubuk ve revizyon çubuğu kadar taşıyor, altta da boşluk bırakıyordu (3095).
// Kalan boy en az boydan azsa (kısa ekran) CSS en az boyu alır (max()); o zaman sayfa yine kayar, çalışma alanı ezilmez.

export function kaydiranKap(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
}

// Kabın akıştaki içeriğinin boyu (scrollHeight içerik kısayken görünen boyu verir; büyümeyi ölçemez). Sabit ve mutlak konumlu
// çocuklar (çekmece, bindirme) akışta yer tutmaz.
export function icerikBoyu(kap: HTMLElement): number {
  const ust = kap.getBoundingClientRect().top - kap.scrollTop + kap.clientTop;
  let alt = 0;
  for (const c of Array.from(kap.children)) {
    const s = getComputedStyle(c);
    if (s.position === 'fixed' || s.position === 'absolute' || s.display === 'none') continue;
    alt = Math.max(alt, c.getBoundingClientRect().bottom + (parseFloat(s.marginBottom) || 0) - ust);
  }
  return alt + (parseFloat(getComputedStyle(kap).paddingBottom) || 0);
}

// Kabın içeriği tam sığsın diye gövdeye kalan boy: kabın görünen boyu eksi gövde dışındaki içerik.
export function kalanBoyHesapla(kapGorunen: number, kapIcerik: number, govdeBoyu: number): number {
  return Math.floor(kapGorunen - (kapIcerik - govdeBoyu));
}

export function useKalanBoy(govde: RefObject<HTMLElement | null>, etkin: boolean, anahtar: unknown): void {
  useLayoutEffect(() => {
    const g = govde.current;
    if (!g) return undefined;
    if (!etkin) { g.style.removeProperty('--tc-rr1-govde-boy'); return undefined; }
    const kap = kaydiranKap(g);
    if (!kap) return undefined;
    const hesapla = () => {
      const boy = kalanBoyHesapla(kap.clientHeight, icerikBoyu(kap), g.offsetHeight);
      const yeni = `${String(boy)}px`;
      if (g.style.getPropertyValue('--tc-rr1-govde-boy') !== yeni) g.style.setProperty('--tc-rr1-govde-boy', yeni);
    };
    hesapla();
    // Üst çubuk satır kırınca, revizyon çubuğu açılınca ya da pencere değişince yeniden ölçülür; aynı değer yazılmaz, döngü olmaz.
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(hesapla) : null;
    ro?.observe(kap);
    for (const c of Array.from(kap.children)) ro?.observe(c);
    window.addEventListener('resize', hesapla);
    return () => { ro?.disconnect(); window.removeEventListener('resize', hesapla); };
  }, [govde, etkin, anahtar]);
}
