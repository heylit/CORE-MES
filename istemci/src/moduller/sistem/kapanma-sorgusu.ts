import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { GunlukCevabi, KapanmaAyrintisi, KapanmalarCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { gunlukIstegi, type GunlukSuzgeci } from './kapanma-yorumu.ts';

const anahtar = {
  kapanmalar: ['sistem', 'kapanmalar'] as const,
  kapanma: (id: number) => ['sistem', 'kapanma', id] as const,
  gunluk: (s: Partial<GunlukSuzgeci>) => ['sistem', 'gunluk', s] as const,
};

// Kapanmalar ve günlük de sağlık ayrıntısıyla aynı işlemi (saglik.ayrinti-oku) ister; işlemi olmayanda sorgu hiç atılmaz.
const useAyrintiGorur = (): boolean => useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;

export function useKapanmalar() {
  const gorur = useAyrintiGorur();
  return useQuery({ queryKey: anahtar.kapanmalar, queryFn: () => api.get<KapanmalarCevabi>('/saglik/kapanmalar'), enabled: gorur, retry: false });
}

export function useKapanma(id: number | null) {
  const gorur = useAyrintiGorur();
  return useQuery({
    queryKey: anahtar.kapanma(id ?? 0), queryFn: () => api.get<KapanmaAyrintisi>(`/saglik/kapanmalar/${String(id)}`), enabled: gorur && id !== null, retry: false,
  });
}

// "Daha eski 500 satır": imleç sunucudan gelir; süzgeç değişince sorgu baştan başlar.
export function useGunluk(suzgec: Partial<GunlukSuzgeci>) {
  const gorur = useAyrintiGorur();
  return useInfiniteQuery({
    queryKey: anahtar.gunluk(suzgec),
    queryFn: ({ pageParam }) => api.get<GunlukCevabi>(`/saglik/gunluk?${gunlukIstegi(suzgec, pageParam).toString()}`),
    initialPageParam: null as string | null,
    getNextPageParam: (son) => son.sonraki,
    enabled: gorur,
    retry: false,
  });
}
