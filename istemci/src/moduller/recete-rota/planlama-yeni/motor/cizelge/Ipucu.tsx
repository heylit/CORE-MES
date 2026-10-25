import { useCallback, useRef, useState, type ReactNode } from 'react';
import { degisken } from '../ortak.tsx';

// Tek ipucu kutusu (b-kabuk ipucuGoster, v-yardim pmIpucuGoster): öğenin üstünde, yer yoksa altında; fareyle gecikmeli, odakla hemen açılır.
export function useIpucu() {
  const [ip, setIp] = useState<{ icerik: ReactNode; x: number; y: number; alt: boolean } | null>(null);
  const z = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kapat = useCallback(() => { if (z.current) clearTimeout(z.current); z.current = null; setIp(null); }, []);
  const ac = useCallback((el: Element, icerik: ReactNode, gecikme = 0) => {
    if (z.current) clearTimeout(z.current);
    const goster = () => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect(); const alt = r.top < 96;
      setIp({ icerik, x: r.left + r.width / 2, y: alt ? r.bottom : r.top, alt });
    };
    if (gecikme) z.current = setTimeout(goster, gecikme); else goster();
  }, []);
  const kutu = ip ? <div className="tc-pym-ipucu" role="tooltip" data-alt={ip.alt ? '' : undefined} ref={degisken({ '--x': `${ip.x}px`, '--y': `${ip.y}px` })}>{ip.icerik}</div> : null;
  return { ac, kapat, kutu };
}
