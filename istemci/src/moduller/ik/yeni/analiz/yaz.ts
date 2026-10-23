import { useCallback } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';

// Yazmayı çalıştırır, başarıda bildirir. Eski sürüm iletisini veri katmanı verir; öteki hatayı burada söyleriz.
export function useYazma() {
  const { bildir } = useBildirim();
  return useCallback(async (is: () => Promise<unknown>, basari: string | null): Promise<boolean> => {
    try {
      await is();
      if (basari) bildir('tamam', basari);
      return true;
    } catch (hata) {
      if (!(hata instanceof ApiHatasi && eskiSurumMu(hata.govde))) bildir('hata', hataIletisi(hata, 'Kaydedilemedi.'));
      return false;
    }
  }, [bildir]);
}
