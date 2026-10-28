import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Her yazma komutu aynı biçimdedir: gönder, modülün bütün verisini tazele, hatada iletiyi forma bırak.
// Sürüm çakışması ve "acan kendi talebine CCB veremez" gibi kurallar sunucudadır; ileti olduğu gibi gösterilir.
export function useKomut<C>(yol: string, tamam: (cevap: C) => void, hataMetni = 'İşlem yapılamadı') {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const komut = useMutation({
    mutationFn: (govde: unknown) => api.post<C>(yol, govde),
    onMutate: () => { hataYaz(null); },
    onSuccess: async (cevap) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      tamam(cevap);
    },
    onError: (e) => { hataYaz(hataIletisi(e, hataMetni)); },
  });
  return { gonder: (govde: unknown) => { komut.mutate(govde); }, yukleniyor: komut.isPending, hata };
}
