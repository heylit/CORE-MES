import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../ortak/veri/api.ts';
import type { BesHareketi, BesTuru } from './kurallar.ts';

// BES uçları (kart 1939): okuma `GET /ik/bes` (`ik.oku`, kişinin İK kapsamına göre süzülür), yazma ayrı komutlar (`ik.ucret-yaz`).
// Zaman ve yazan sunucudan gelir; ekran yazmaz.
export interface BesCevabi { hareketler: BesHareketi[] }
export interface BesHareketGirdisi { personel: string; tur: BesTuru; tarih: string; oran: number | null; sirket: string | null; aciklama: string | null }
export interface BesYazCevabi { hareket: BesHareketi }

export const BES_ANAHTARI = ['ik', 'yeni', 'bes'] as const;
export type BesIstemcisi = Pick<typeof api, 'get' | 'post'>;

export const besOku = (istemci: BesIstemcisi): Promise<BesCevabi> => istemci.get<BesCevabi>('/ik/bes');
export const besHareketEkle = (istemci: BesIstemcisi, g: BesHareketGirdisi): Promise<BesYazCevabi> =>
  istemci.post<BesYazCevabi>('/ik/bes/hareket', g);
export const besHareketIptal = (istemci: BesIstemcisi, h: Pick<BesHareketi, 'id' | 'surum'>): Promise<BesYazCevabi> =>
  istemci.post<BesYazCevabi>(`/ik/bes/hareket/${String(h.id)}/iptal`, { surum: h.surum });

export function useBes() {
  return useQuery({ queryKey: BES_ANAHTARI, queryFn: () => besOku(api) });
}

export function useBesKomutu() {
  const qc = useQueryClient();
  const yenile = () => qc.invalidateQueries({ queryKey: BES_ANAHTARI });
  const ekle = useMutation({ mutationFn: (g: BesHareketGirdisi) => besHareketEkle(api, g), onSettled: yenile });
  const iptal = useMutation({ mutationFn: (h: Pick<BesHareketi, 'id' | 'surum'>) => besHareketIptal(api, h), onSettled: yenile });
  return { ekle: ekle.mutateAsync, iptal: iptal.mutateAsync, calisiyor: ekle.isPending || iptal.isPending };
}
