import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AlternatifKuraliKaydetGovdesi, AlternatifTanimlariCevabi, GrupSinirlariCevabi, KabulSiniriKaydetGovdesi, KartAlternatifleriCevabi, KartZarfiCevabi, MuadilTuru,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { MALZEMELER_YENI } from '../veri.ts';

// 3437: ikame ve alternatif tanımları sunucudadır; zarfı sunucunun motoru hesaplar, ekran yalnız gösterir.
const ANAHTAR = [...MALZEMELER_YENI, 'alternatifler'] as const;
export const alternatifAnahtari = {
  tanimlar: [...ANAHTAR, 'tanimlar'] as const, zarf: (no: number) => [...ANAHTAR, 'zarf', no] as const, kart: (no: number) => [...ANAHTAR, 'kart', no] as const,
  grupSinirlari: [...ANAHTAR, 'grup-sinirlari'] as const,
};

export function useAlternatifTanimlari() {
  return useQuery({ queryKey: alternatifAnahtari.tanimlar, queryFn: () => api.get<AlternatifTanimlariCevabi>('/malzeme-alternatifleri') });
}

export function useKartZarfi(no: number | null) {
  return useQuery({
    queryKey: alternatifAnahtari.zarf(no ?? 0), enabled: no !== null,
    queryFn: () => api.get<KartZarfiCevabi>(`/malzeme-alternatifleri/zarf/${no ?? 0}`),
  });
}

// Her tanım değişikliği bütün zarfları etkiler: tanımlar ve zarflar birlikte tazelenir.
export function useAlternatifTazele() {
  const istemci = useQueryClient();
  return () => istemci.invalidateQueries({ queryKey: ANAHTAR });
}

export const kuralKaydet = (g: AlternatifKuraliKaydetGovdesi) => api.post('/malzeme-alternatifleri/kurallar/kaydet', g);

export function useKuralKaldir() {
  const tazele = useAlternatifTazele();
  return useMutation({
    mutationFn: (g: { id: number; surum: number }) => api.post(`/malzeme-alternatifleri/kurallar/${g.id}/kaldir`, { surum: g.surum }),
    onSettled: tazele,
  });
}

export type MuadilTablosu = 'kalite' | 'durum';
const MUADIL_YOLU: Record<MuadilTablosu, string> = { kalite: 'kalite-muadilleri', durum: 'durum-muadilleri' };
export interface MuadilYazimi { deger: string; muadil: string; tur: MuadilTuru; notu: string | null; surum?: number }

export const muadilKaydet = (t: MuadilTablosu, { deger, ...g }: MuadilYazimi) =>
  api.post(`/malzeme-alternatifleri/${MUADIL_YOLU[t]}/kaydet`, { [t]: deger, ...g });

export function useMuadilKaldir() {
  const tazele = useAlternatifTazele();
  return useMutation({
    mutationFn: ({ t, deger, muadil, surum }: { t: MuadilTablosu; deger: string; muadil: string; surum: number }) =>
      api.post(`/malzeme-alternatifleri/${MUADIL_YOLU[t]}/kaldir`, { [t]: deger, muadil, surum }),
    onSettled: tazele,
  });
}

// 3463: kartın Alternatifler bölümü (sınırlar ve eşdeğerler); her yazım bütün zarfları tazeler.
export function useKartAlternatifleri(no: number) {
  return useQuery({ queryKey: alternatifAnahtari.kart(no), queryFn: () => api.get<KartAlternatifleriCevabi>(`/malzeme-alternatifleri/kart/${no}`) });
}

// 3463-1b: grup şablonu (aile, sınıf, kalite kapsamındaki sınırlar).
export function useGrupSinirlari() {
  return useQuery({ queryKey: alternatifAnahtari.grupSinirlari, queryFn: () => api.get<GrupSinirlariCevabi>('/malzeme-alternatifleri/siniri') });
}

export function useSinirKaydet() {
  const tazele = useAlternatifTazele();
  return useMutation({ mutationFn: (g: KabulSiniriKaydetGovdesi) => api.post('/malzeme-alternatifleri/siniri/kaydet', g), onSettled: tazele });
}

export function useSinirKaldir() {
  const tazele = useAlternatifTazele();
  return useMutation({
    mutationFn: (g: { id: number; surum: number }) => api.post(`/malzeme-alternatifleri/siniri/${g.id}/kaldir`, { surum: g.surum }),
    onSettled: tazele,
  });
}

export function useEsdegerIslemi() {
  const tazele = useAlternatifTazele();
  return useMutation({
    mutationFn: (g: { islem: 'bagla'; kartNo: number; esdegerNo: number } | { islem: 'kaldir'; kartNo: number }) =>
      g.islem === 'bagla'
        ? api.post('/malzeme-alternatifleri/esdeger/bagla', { kartNo: g.kartNo, esdegerNo: g.esdegerNo })
        : api.post('/malzeme-alternatifleri/esdeger/kaldir', { kartNo: g.kartNo }),
    onSettled: tazele,
  });
}
