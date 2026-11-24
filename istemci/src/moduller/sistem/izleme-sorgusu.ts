import { useQuery } from '@tanstack/react-query';
import type { DisBaglantilarCevabi, EkranHatalariCevabi, EkranHatasiDonemi, SuAnCevabi, VeritabaniCevabi, YukCevabi, YukDonemi } from '#paylasilan/sozlesme/saglik.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// Şu an sekmesi açıkken ve sayfa görünürken 5 sn'de bir tazelenir; Özet ve Dış bağlantılar yalnız açılışta okur.
export const SU_AN_TAZELEME_MS = 5_000;
const useAyrintiGorur = (): boolean => useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;

const anahtar = {
  suAn: ['sistem', 'su-an'] as const,
  yuk: (donem: YukDonemi) => ['sistem', 'yuk', donem] as const,
  dis: ['sistem', 'dis-baglantilar'] as const,
};

export function useSuAn(canli: boolean) {
  const gorur = useAyrintiGorur();
  return useQuery({
    queryKey: anahtar.suAn,
    queryFn: () => api.get<SuAnCevabi>('/saglik/su-an'),
    enabled: gorur,
    retry: false,
    staleTime: canli ? 0 : 30_000,
    refetchInterval: canli ? () => (document.visibilityState === 'visible' ? SU_AN_TAZELEME_MS : false) : false,
  });
}

export function useYuk(donem: YukDonemi) {
  const gorur = useAyrintiGorur();
  return useQuery({ queryKey: anahtar.yuk(donem), queryFn: () => api.get<YukCevabi>(`/saglik/yuk?donem=${donem}`), enabled: gorur, retry: false, staleTime: 30_000 });
}

export function useDisBaglantilar() {
  const gorur = useAyrintiGorur();
  return useQuery({ queryKey: anahtar.dis, queryFn: () => api.get<DisBaglantilarCevabi>('/saglik/dis-baglantilar'), enabled: gorur, retry: false, staleTime: 30_000 });
}

export function useEkranHatalari(donem: EkranHatasiDonemi) {
  const gorur = useAyrintiGorur();
  return useQuery({
    queryKey: ['sistem', 'ekran-hatalari', donem] as const,
    queryFn: () => api.get<EkranHatalariCevabi>(`/saglik/ekran-hatalari?donem=${donem}`),
    enabled: gorur, retry: false, staleTime: 30_000,
  });
}

export function useVeritabani() {
  const gorur = useAyrintiGorur();
  return useQuery({ queryKey: ['sistem', 'veritabani'] as const, queryFn: () => api.get<VeritabaniCevabi>('/saglik/veritabani'), enabled: gorur, retry: false, staleTime: 30_000 });
}
