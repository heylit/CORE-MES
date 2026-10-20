import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

export interface Komut {
  yol: string;
  govde?: unknown;
  // Yeni kayıt açan komut tekrar korumalıdır: yeniden gönderim aynı kimlikle gider, ikinci kayıt açılmaz.
  tekrar?: boolean;
}

// Her yazma takvimin tamamını döner: ekran cevabı doğrudan yazar, öbür vardiya sorguları yenilenir.
export function useVardiyaYaz() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: ({ yol, govde, tekrar }: Komut) => (tekrar
      ? tekrarKorumaliGonder((d) => api.post<TakvimCevabi>(yol, govde, { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }))
      : api.post<TakvimCevabi>(yol, govde)),
    onSuccess: async (t) => {
      istemci.setQueryData(anahtarlar.takvim, t);
      await istemci.invalidateQueries({ queryKey: ['vardiya'], predicate: (q) => q.queryKey[1] !== 'takvim' });
    },
    onError: async (e) => {
      if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) {
        await istemci.invalidateQueries({ queryKey: anahtarlar.takvim });
        bildir('bilgi', 'Vardiya başka biri tarafından değiştirildi; güncel hali yüklendi.');
        return;
      }
      bildir('hata', hataIletisi(e, 'Kaydedilemedi.'));
    },
  });
}
