import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SablonCevabi, SablonDurumGovdesi, SablonKaydetGovdesi, SablonlarCevabi, SablonYazGovdesi } from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { RR_ANAHTARI, RrHatasi } from '../veri.ts';

// Rota şablonları (3273 a): sahibi rota modülü. Okuma rota okuyan herkesin, yazma rota.sablon-yaz eylemidir; ekran yalnız gizler.
export const SABLON_ANAHTARI = [...RR_ANAHTARI, 'rota-sablonlari'] as const;

export function useRotaSablonlari(etkin = true) {
  return useQuery({
    queryKey: SABLON_ANAHTARI,
    enabled: etkin,
    staleTime: 30_000,
    queryFn: async () => {
      try { return (await api.get<SablonlarCevabi>('/rota/sablonlar')).sablonlar; } catch (h) { throw new RrHatasi(h); }
    },
  });
}

export type RotaSablonKomutu =
  | { ad: 'ekle'; govde: SablonYazGovdesi }
  | { ad: 'kaydet'; id: number; govde: SablonKaydetGovdesi }
  | { ad: 'durum'; id: number; govde: SablonDurumGovdesi }
  | { ad: 'varsayilan-yap'; id: number; govde: { surum: number } }
  | { ad: 'sil'; id: number; govde: { surum: number } };

export function useRotaSablonKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: async (k: RotaSablonKomutu): Promise<SablonCevabi | SablonlarCevabi> => {
      const yol = k.ad === 'ekle' ? '/rota/sablonlar/ekle' : `/rota/sablonlar/${String(k.id)}/${k.ad}`;
      try { return await api.post<SablonCevabi | SablonlarCevabi>(yol, k.govde, k.ad === 'ekle' ? { istekKimligi: yeniIstekKimligi() } : {}); } catch (h) { throw new RrHatasi(h); }
    },
    onSettled: () => { void istemci.invalidateQueries({ queryKey: SABLON_ANAHTARI }); },
  });
}
