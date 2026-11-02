import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
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

// Sunucunun adını verdiği alanın iletisi (tek alan ya da doğrulama ayrıntısı): alan kırmızı olur, bildirim yine çıkar.
export function alanHatasi(hata: unknown, alan: string): string | undefined {
  if (!(hata instanceof ApiHatasi)) return undefined;
  if (hata.govde.alan === alan) return hata.govde.mesaj;
  const ayrinti: unknown = hata.govde.ayrinti;
  if (!Array.isArray(ayrinti)) return undefined;
  for (const a of ayrinti as unknown[]) {
    if (typeof a === 'object' && a !== null && (a as { alan?: unknown }).alan === alan) {
      const mesaj = (a as { mesaj?: unknown }).mesaj;
      return typeof mesaj === 'string' ? mesaj : undefined;
    }
  }
  return undefined;
}
