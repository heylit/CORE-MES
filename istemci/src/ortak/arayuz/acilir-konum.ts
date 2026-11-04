import { useLayoutEffect, useRef, type RefObject } from 'react';
import './acilir-konum.css';

export type AcilirYonu = 'asagi' | 'yukari';

// Açılır liste, kaydırılan ya da taşanı kesen bir kabın (tablo, kart) içinde konumlanınca kabın kenarında kesilir
// (kart 2094). Liste body'ye taşınır ve görüntüye göre sabit konumlanır; çapanın altında yer yetmiyor ve üstte daha çok
// yer varsa yukarı açılır. Yön açılışta bir kez seçilir: arama listeyi kısaltınca liste yer değiştirmez.
export function acilirYonu(altBosluk: number, ustBosluk: number, katmanBoyu: number): AcilirYonu {
  return altBosluk >= katmanBoyu || altBosluk >= ustBosluk ? 'asagi' : 'yukari';
}

const pikselDegiskeni = (el: Element, ad: string): number => Number.parseFloat(getComputedStyle(el).getPropertyValue(ad)) || 0;

// Çapa açan düğmedir; katman `createPortal(..., document.body)` ile çizilen listedir ve `tc-acilir-katman` sınıfını taşır.
export function useAcilirKonum<C extends HTMLElement, K extends HTMLElement>(acik: boolean): { capa: RefObject<C>; katman: RefObject<K> } {
  const capa = useRef<C>(null);
  const katman = useRef<K>(null);

  useLayoutEffect(() => {
    if (!acik) return undefined;
    let yon: AcilirYonu | null = null;
    const yerlestir = () => {
      const c = capa.current;
      const k = katman.current;
      if (!c || !k) return;
      const r = c.getBoundingClientRect();
      const pay = pikselDegiskeni(k, '--b-2');
      const ekranBoyu = window.innerHeight;
      const ekranEni = document.documentElement.clientWidth;
      const alt = ekranBoyu - r.bottom - pay * 2;
      const ust = r.top - pay * 2;
      yon ??= acilirYonu(alt, ust, k.offsetHeight);
      k.dataset.yon = yon;
      k.style.setProperty('--tc-acilir-x', `${String(Math.max(pay, Math.min(r.left, ekranEni - k.offsetWidth - pay)))}px`);
      k.style.setProperty('--tc-acilir-ust', `${String(r.bottom)}px`);
      k.style.setProperty('--tc-acilir-alt', `${String(ekranBoyu - r.top)}px`);
      k.style.setProperty('--tc-acilir-sigar', `${String(Math.max(yon === 'asagi' ? alt : ust, 0))}px`);
    };
    yerlestir();
    window.addEventListener('resize', yerlestir);
    window.addEventListener('scroll', yerlestir, true);
    return () => {
      window.removeEventListener('resize', yerlestir);
      window.removeEventListener('scroll', yerlestir, true);
    };
  }, [acik]);

  return { capa, katman };
}
