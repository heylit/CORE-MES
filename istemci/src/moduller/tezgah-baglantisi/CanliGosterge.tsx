import { useEffect, useState } from 'react';
import { Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { yasMetni } from './gosterim.ts';

const gorunuyor = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

// Saniyede bir yaşlanan saat; sekme görünmüyorken durur.
function useSimdi(): number {
  const [simdi, simdiYaz] = useState(() => Date.now());
  useEffect(() => {
    let sayac: ReturnType<typeof setInterval> | null = null;
    const baslat = () => {
      if (sayac !== null) return;
      simdiYaz(Date.now());
      sayac = setInterval(() => simdiYaz(Date.now()), 1000);
    };
    const durdur = () => {
      if (sayac !== null) clearInterval(sayac);
      sayac = null;
    };
    const degisti = () => (gorunuyor() ? baslat() : durdur());
    if (gorunuyor()) baslat();
    document.addEventListener('visibilitychange', degisti);
    return () => { durdur(); document.removeEventListener('visibilitychange', degisti); };
  }, []);
  return simdi;
}

// Başlıkta son okumanın yaşı; iki turdan eskiyse "eski okuma".
export function CanliGosterge({ okundu, aralikSaniye }: { okundu: string | null; aralikSaniye: number }) {
  const simdi = useSimdi();
  const eski = okundu !== null && simdi - new Date(okundu).getTime() > 2 * aralikSaniye * 1000;
  return (
    <span className="tc-tzb-canli" role="status" data-eski={eski || undefined}>
      <Simge ad="clock" boyut="k" />
      <span>Son okuma {yasMetni(okundu, simdi)}</span>
      {eski && <Rozet ton="uyari">Eski okuma</Rozet>}
    </span>
  );
}
