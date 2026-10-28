// Depo sevk (944, 957 a, 966 b): sevkiyatın tetiklediği gidişler son çıkış, gelişler kabul bekler. Kabul mal kabulden yapılır
// (`/stok/mal-kabul?sevkKalemi=<kalem>`); çıkış bu listeden. Sevkiyatın Tüm işler ekranı aynı ucu kendi çağırır: stok sevkiyatı ithal ettiği için ters ithal döngü olurdu.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DepoCikisCevabi, DepoSevkCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { korumaliPost } from './ortak.tsx';

export const useDepoSevk = (etkin = true) =>
  useQuery({ queryKey: anahtarlar.liste('depo-sevk', {}), enabled: etkin, queryFn: () => api.get<DepoSevkCevabi>('/stok/depo-sevk'), select: (c) => c.satirlar });

export const kabulYolu = (kalemId: number): string => `/stok/mal-kabul?sevkKalemi=${kalemId}`;

// Çıkış stoğu ve sevkiyat kalemini birlikte değiştirir: ikisinin ekranları yenilenir.
export function useDepoCikisi() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (kalemId: number) => korumaliPost<DepoCikisCevabi>(`/stok/depo-sevk/${kalemId}/cikis`, {}),
    onSuccess: () => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      void istemci.invalidateQueries({ queryKey: ['sevkiyat', 'tum-isler'] });
    },
  });
}
