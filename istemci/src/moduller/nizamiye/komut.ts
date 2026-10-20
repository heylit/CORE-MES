import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

// Nizamiye komutu: bitince modülün bütün okumaları tazelenir (kapı, raf, geçmiş aynı kaydı gösterir), hata bildirimle görünür.
// Tekrar korumalı uç (kayıt açan) istek kimliğiyle gider: cevabı yitirilen istek yeniden gönderilince ikinci kayıt açılmaz.
export function useKomut<G, C>(hataMetni: string, secenek: { tekrarKorumali?: boolean } = {}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde: G }) =>
      (secenek.tekrarKorumali === true ? tekrarKorumaliGonder((deneme) => api.post<C>(yol, govde, deneme)) : api.post<C>(yol, govde)),
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }),
    onError: (hata) => bildir('hata', hataIletisi(hata, hataMetni)),
  });
}
