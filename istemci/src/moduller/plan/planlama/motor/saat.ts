import { useEffect, useState } from 'react';

// Ekranın gerçek saati (2506 a). Planlama ekranı vardiya boyunca açık kalır; an dakikada bir ilerler ki "şimdi" donmasın. Plana yazan
// komut anı kendisi o anda alır (bu değer en çok bir dakika geridir).
export const SAAT_ADIMI_MS = 60_000;
export function useAn(): number {
  const [an, setAn] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => { setAn(Date.now()); }, SAAT_ADIMI_MS);
    return () => { clearInterval(z); };
  }, []);
  return an;
}
