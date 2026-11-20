import { useCallback, useEffect, useRef } from 'react';

// Planla gibi düğmelerin sonucu iş bitince söylenir: komut yazıldığında plan henüz yeniden dizilmemiştir. İleti saklanır, meşgul
// durumu bitince bir kez bildirilir.
export function useBitinceBildir(mesgul: boolean, bildir: (tur: 'bilgi', ileti: string) => void): (ileti: string) => void {
  const ileti = useRef<string | null>(null);
  useEffect(() => {
    if (mesgul || ileti.current === null) return;
    bildir('bilgi', ileti.current); ileti.current = null;
  }, [mesgul, bildir]);
  return useCallback((x: string) => { ileti.current = x; }, []);
}
