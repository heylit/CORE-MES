import { useEffect, useState } from 'react';

// Telefon genişliği (kabuk.css ve pencere.css'in 767 sınırı ile aynı). Ortam ölçemiyorsa (test) geniş ekran sayılır.
export const TELEFON_SORGUSU = '(max-width: 767px)';

export function useTelefon(): boolean {
  const [telefon, telefonYaz] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(TELEFON_SORGUSU).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const sorgu = window.matchMedia(TELEFON_SORGUSU);
    const degisti = () => { telefonYaz(sorgu.matches); };
    degisti();
    // Eski tarayıcılarda ve basit test benzetimlerinde olay dinleyicisi yoktur; ilk ölçüm yeter.
    const dinler = typeof (sorgu as Partial<MediaQueryList>).addEventListener === 'function';
    if (dinler) sorgu.addEventListener('change', degisti);
    return () => { if (dinler) sorgu.removeEventListener('change', degisti); };
  }, []);
  return telefon;
}
