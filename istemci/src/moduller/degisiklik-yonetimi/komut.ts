import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut, useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { anahtarlar } from './anahtarlar.ts';

// Her yazma komutu aynı biçimdedir: gönder, modülün bütün verisini tazele, hatada iletiyi forma bırak.
// Sürüm çakışması ve "acan kendi talebine CCB veremez" gibi kurallar sunucudadır; ileti olduğu gibi gösterilir.
// Çift tık tek istek gönderir. Sunucuda tekrar korumalı uç (`talepler/ac`) `korumali` ile istek kimliği taşır.
export function useKomut<C>(yol: string, tamam: (cevap: C) => void, hataMetni = 'İşlem yapılamadı', korumali = false) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const ortak = {
    onMutate: () => { hataYaz(null); },
    onSuccess: async (cevap: C) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      tamam(cevap);
    },
    onError: (e: Error) => { hataYaz(hataIletisi(e, hataMetni)); },
  };
  const korunan = useKorumaliKomut<unknown, C>({ ...ortak, gonder: (govde, deneme) => api.post<C>(yol, govde, deneme) });
  const duz = useTekGonderim<unknown, C>({ ...ortak, mutationFn: (govde) => api.post<C>(yol, govde) });
  const komut = korumali ? korunan : duz;
  return { gonder: (govde: unknown) => { komut.mutate(govde); }, yukleniyor: komut.isPending, hata };
}
