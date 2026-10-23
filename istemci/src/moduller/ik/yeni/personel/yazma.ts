import { useCallback } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';

// Komutlar hata fırlatır (eski sürüm iletisini komut kendisi verir); ekran yalnız sonucu bildirir, işlem yarıda kalırsa false döner.
export function useYazma() {
  const { bildir } = useBildirim();
  return useCallback(async (is: Promise<unknown>, tamam: string | null, hata = 'Kaydedilemedi.'): Promise<boolean> => {
    try {
      await is;
    } catch {
      bildir('hata', hata);
      return false;
    }
    if (tamam) bildir('tamam', tamam);
    return true;
  }, [bildir]);
}
