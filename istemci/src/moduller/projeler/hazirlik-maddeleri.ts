import { useQuery } from '@tanstack/react-query';
import type { HazirlikMaddeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../ortak/veri/api.ts';

// 3396 a: hazırlık maddesi listesi (sahibi Üretim Emirleri). Projeler alt kattadır, o modülün ekran dosyasını ithal edemez; aynı ucu
// aynı anahtarla okur, önbellek iki modülde ortaktır.
export const HAZIRLIK_MADDE_ANAHTARI = ['uretim-emirleri', 'hazirlik-maddeleri'] as const;
export function useHazirlikMaddeleri() {
  return useQuery({ queryKey: HAZIRLIK_MADDE_ANAHTARI, queryFn: () => api.get<HazirlikMaddeleriCevabi>('/hazirlik-maddeleri'), staleTime: 5 * 60_000 });
}
