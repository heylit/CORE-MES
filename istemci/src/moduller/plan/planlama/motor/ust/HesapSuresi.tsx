import { useEffect, useState } from 'react';

// Plan hesabı büyük veride yarım dakikayı geçebiliyor (sınır bir dakika); döner simge tek başına "takıldı" gibi okunuyor.
// İlk birkaç saniye yalnız ad durur (kısa hesapta yazı titremesin), sonra geçen süre ve üst sınır yazılır.
export const SURE_GOSTERME_SN = 3;
export const SURE_NOTU = 'büyük planda bir dakikaya kadar sürebilir';

export function useGecenSaniye(suruyor: boolean): number {
  const [sn, setSn] = useState(0);
  useEffect(() => {
    setSn(0);
    if (!suruyor) return undefined;
    const bas = Date.now();
    const z = setInterval(() => { setSn(Math.floor((Date.now() - bas) / 1000)); }, 1000);
    return () => { clearInterval(z); };
  }, [suruyor]);
  return suruyor ? sn : 0;
}

// Ekran okuyucu her saniye okumasın: canlı bölgede yalnız sabit yazı durur, saniye görsel ve aria-hidden.
export function hesapSuresiEki(sn: number): string | null {
  return sn < SURE_GOSTERME_SN ? null : ` · ${String(sn)} sn · ${SURE_NOTU}`;
}

// Şeritte düğmenin yanında durur; yalnız hesap sürerken ve ilk saniyelerden sonra çizilir.
export function HesapSuresi({ suruyor, className }: { suruyor: boolean; className?: string }) {
  const sn = useGecenSaniye(suruyor);
  if (!suruyor || sn < SURE_GOSTERME_SN) return null;
  return <small className={className}><span aria-hidden="true">{`${String(sn)} sn · `}</span><span role="status">{SURE_NOTU}</span></small>;
}
