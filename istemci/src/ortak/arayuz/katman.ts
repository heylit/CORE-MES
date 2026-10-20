import { useEffect, useRef, type RefObject } from 'react';

const ODAKLANIR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Açık katman odağı içinde tutar, Esc ile kapanır, kapanınca odağı açan öğeye geri verir.
// Odak kapanmadan önce katmanın dışında başka bir öğeye geçmişse geri çekilmez.
export function useKatman<T extends HTMLElement>(acik: boolean, kapat: () => void): RefObject<T> {
  const kutu = useRef<T>(null);
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;

  useEffect(() => {
    if (!acik) return;
    const el = kutu.current;
    if (!el) return;
    const onceki = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ogeler = () => [...el.querySelectorAll<HTMLElement>(ODAKLANIR)];
    (el.querySelector<HTMLElement>('[data-ilk-odak]') ?? ogeler()[0] ?? el).focus();

    const tus = (o: KeyboardEvent) => {
      if (o.key === 'Escape') {
        o.stopPropagation();
        kapatRef.current();
        return;
      }
      // İçteki katman (pencere içindeki menü) Tab'ı kendi işlediyse dıştaki odağı ayrıca taşımaz.
      if (o.key !== 'Tab' || o.defaultPrevented) return;
      const liste = ogeler();
      const ilk = liste[0];
      const son = liste[liste.length - 1];
      if (!ilk || !son) { o.preventDefault(); return; }
      const simdi = document.activeElement;
      if (o.shiftKey && (simdi === ilk || !el.contains(simdi))) { o.preventDefault(); son.focus(); }
      else if (!o.shiftKey && (simdi === son || !el.contains(simdi))) { o.preventDefault(); ilk.focus(); }
    };
    el.addEventListener('keydown', tus);
    return () => {
      el.removeEventListener('keydown', tus);
      const simdi = document.activeElement;
      if (simdi === null || simdi === document.body || el.contains(simdi)) onceki?.focus();
    };
  }, [acik]);

  return kutu;
}
