import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdimDurumuCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { isEmriKomutu } from './adim-durumu.ts';
import type { Komut } from './adim-tablosu.ts';
import { anahtarlar } from './anahtarlar.ts';

// Yan pencere ve matris hücresi aynı komutları aynı yoldan gönderir.
// Geri alınabilen komut (3249 b: tik, Boşlukla onay) bildirimde "Geri al" taşır; geri alma da aynı yoldan, yeni kimlikle gider.
export function useAdimKomutu(emirId: number, isEmriId: number | null, bitti: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const komut = useMutation({
    mutationFn: ({ yol, govde, isEmriId: hedef, istekKimligi }: Komut & { istekKimligi: string }) =>
      api.post<AdimDurumuCevabi>(isEmriKomutu(emirId, hedef ?? isEmriId ?? 0, yol), govde, { istekKimligi }),
    onSuccess: (c, k) => {
      istemci.setQueryData(anahtarlar.adimDurumu(emirId), c);
      const geri = k.geri;
      bildir('tamam', k.mesaj ?? 'Kaydedildi.', geri ? { eylem: { etiket: 'Geri al', yap: () => yap({ ...geri, mesaj: 'Geri alındı.' }) } } : undefined);
      k.sonra?.();
      bitti();
    },
    onError: async (x) => { bildir('hata', hataIletisi(x, 'Kaydedilemedi.')); await istemci.invalidateQueries({ queryKey: anahtarlar.adimDurumu(emirId) }); },
  });
  // Kimlik tıklamada üretilir: sunucu aynı tıklamanın yeniden gönderimini ikinci kez uygulamaz (tekrarKorumali uçlar).
  const yap = (k: Komut) => komut.mutate({ ...k, istekKimligi: yeniIstekKimligi() });
  return { mesgul: komut.isPending, yap };
}
