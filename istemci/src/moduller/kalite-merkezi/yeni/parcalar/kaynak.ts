import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { KmParcaKaynagi, KmParcaKaynaklariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { api } from '../../../../ortak/veri/api.ts';

const DILIM = 200;
export const parcaKaynagiAnahtari = (ek: string) => ['kalite-merkezi', 'parca-kaynaklari', ek] as const;

// Modül düzeyinde: aynı işlev, sonuçlar değişmedikçe aynı haritayı döndürür (useQueries combine).
const birlestir = (r: UseQueryResult<KmParcaKaynaklariCevabi>[]): ReadonlyMap<number, KmParcaKaynagi> =>
  new Map(r.flatMap((q) => q.data?.parcalar ?? []).map((p) => [p.malzemeNo, p]));

// 592 B2 a: kartı Malzemeler'e bağlı parçanın numarası ve adı oradan okunur. Uç kimlikleri ikişer yüzlük dilimle alır.
export function useParcaKaynaklari(malzemeNolar: readonly (number | undefined)[]): ReadonlyMap<number, KmParcaKaynagi> {
  const tekil = [...new Set(malzemeNolar.filter((n): n is number => typeof n === 'number'))].sort((a, b) => a - b);
  const dilimler: number[][] = [];
  for (let i = 0; i < tekil.length; i += DILIM) dilimler.push(tekil.slice(i, i + DILIM));
  return useQueries({
    queries: dilimler.map((d) => ({
      queryKey: parcaKaynagiAnahtari(d.join(',')),
      queryFn: () => api.get<KmParcaKaynaklariCevabi>(`/kalite-merkezi/parca-kaynaklari?idler=${d.join(',')}`),
      staleTime: 60_000,
    })),
    combine: birlestir,
  });
}
