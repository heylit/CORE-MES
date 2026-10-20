import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

// Her yazma komutu aynı biçimdedir: gönder, bütün modül verisini tazele, hatada iletiyi forma bırak.
// `istekKimligi` yalnız sunucuda tekrar korumalı uçla verilir: her gönderim (yeniden deneme, çift tıklama, hatadan sonra
// yeniden kaydet) aynı kimlikle gider, sunucu komutu en çok bir kez uygular.
export function useKomut<C>(yol: string, tamam: (cevap: C) => void, hataMetni = 'İşlem yapılamadı', istekKimligi?: string) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: (govde?: unknown) => (istekKimligi === undefined
      ? api.post<C>(yol, govde)
      : tekrarKorumaliGonder((deneme) => api.post<C>(yol, govde, deneme), { istekKimligi })),
    onMutate: () => { hataYaz(null); },
    onSuccess: async (cevap) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      tamam(cevap);
    },
    onError: (e) => { hataYaz(hataIletisi(e, hataMetni)); },
  });
  return { gonder: (govde?: unknown) => { komut.mutate(govde); }, yukleniyor: komut.isPending, hata };
}
