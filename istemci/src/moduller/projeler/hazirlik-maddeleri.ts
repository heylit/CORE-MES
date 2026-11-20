import { useQuery } from '@tanstack/react-query';
import type { HazirlikMaddeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../ortak/veri/api.ts';

// 3396 a: hazırlık maddesi listesi (sahibi Üretim Emirleri). Projeler alt kattadır, o modülün ekran dosyasını ithal edemez; aynı ucu
// aynı anahtarla okur, önbellek iki modülde ortaktır.
export const HAZIRLIK_MADDE_ANAHTARI = ['uretim-emirleri', 'hazirlik-maddeleri'] as const;
export function useHazirlikMaddeleri() {
  return useQuery({ queryKey: HAZIRLIK_MADDE_ANAHTARI, queryFn: () => api.get<HazirlikMaddeleriCevabi>('/hazirlik-maddeleri'), staleTime: 5 * 60_000 });
}

// Şablon satırının kaç kez açıldığı tek dille söylenir: madde yoksa proje başına, iş emri düzeyindeki madde operasyon başına,
// öteki madde emir başına. Madde listesi okunamadıysa emir başına sayılır.
export type Siklik = 'proje' | 'emir' | 'operasyon';
export const SIKLIK_METNI: Record<Siklik, string> = { proje: 'Proje başına', emir: 'Emir başına', operasyon: 'Operasyon başına' };
export function siklik(madde: string | null, maddeler: readonly { kod: string; isEmriDuzeyi: boolean }[] | undefined): Siklik {
  if (madde === null || madde === '') return 'proje';
  return maddeler?.find((m) => m.kod === madde)?.isEmriDuzeyi === true ? 'operasyon' : 'emir';
}
