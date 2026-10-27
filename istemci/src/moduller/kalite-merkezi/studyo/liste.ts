import { useQuery } from '@tanstack/react-query';
import type { KmStudyoOzeti, KmStudyoOzetleriCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { api } from '../../../ortak/veri/api.ts';

// Resim ve modeller listesi (799, 801 a): Parçalar'daki malzeme kartlı her parça ile resmi ya da planı olan her parça bir satırdır.
// Eksik: resim yok, resmi olup balonu yok, numune planı yok. 3B model her parçada gerekmez; sayısı görünür, eksik sayılmaz.
export type ResimEksigi = 'resim' | 'balon' | 'numune';
export interface ResimListeSatiri extends KmStudyoOzeti { eksik: ResimEksigi[] }

export const EKSIK_METNI: Record<ResimEksigi, string> = { resim: 'Resim yok', balon: 'Balon yok', numune: 'Numune planı yok' };

export function resimListesi(malzemeNolar: readonly (number | undefined)[], ozetler: readonly KmStudyoOzeti[]): ResimListeSatiri[] {
  const m = new Map<number, KmStudyoOzeti>(ozetler.map((o) => [o.malzemeNo, o]));
  for (const no of malzemeNolar) {
    if (typeof no === 'number' && !m.has(no)) m.set(no, { malzemeNo: no, resim: 0, model: 0, balon: 0, numunePlani: 0 });
  }
  return [...m.values()].sort((a, b) => a.malzemeNo - b.malzemeNo).map((o) => {
    const eksik: ResimEksigi[] = [];
    if (o.resim === 0) eksik.push('resim');
    else if (o.balon === 0) eksik.push('balon');
    if (o.numunePlani === 0) eksik.push('numune');
    return { ...o, eksik };
  });
}

export const studyoOzetiAnahtari = ['kalite-merkezi', 'studyo', 'ozetler'] as const;

// Stüdyonun yazmaları bu anahtarı tazelemez: liste her açılışta yeniden okunur.
export function useStudyoOzetleri() {
  return useQuery({
    queryKey: studyoOzetiAnahtari,
    queryFn: () => api.get<KmStudyoOzetleriCevabi>('/kalite-merkezi/studyo/parcalar'),
    refetchOnMount: 'always',
  });
}
