import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import type { Komut } from '../akislar.ts';
import { useFinansKomutu } from '../veri.ts';

// Ayarlar komutlarının ortak gönderimi: başarıda ve hatada bildirim; sonuç döner (çağıran formu kapatır ya da sıfırlar).
export function useAyarGonder() {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const gonder = async (komutlar: readonly Komut[], istekKimligi?: string): Promise<boolean> => {
    try {
      await komut.mutateAsync({ komutlar, istekKimligi: istekKimligi ?? yeniIstekKimligi() });
      bildir('tamam', komutlar.at(-1)!.basari);
      return true;
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Kaydedilemedi.'));
      return false;
    }
  };
  return { gonder, mesgul: komut.isPending };
}
