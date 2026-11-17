import { useQuery } from '@tanstack/react-query';
import type { HazirlikMaddeleriCevabi, HazirlikMaddeTanimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3396 a: hazırlık maddesi listesi sunucudadır (ad, kısa ad, sıra, açık/kapalı, özel madde). Liste gelmeden ya da okunamazsa ekran kod
// adlarıyla çizer; kapalı madde yalnız liste gelince gizlenir (gizlemek görünümdür, hâli sunucu verir).
export function useHazirlikMaddeleri() {
  return useQuery({ queryKey: anahtarlar.hazirlikMaddeleri, queryFn: () => api.get<HazirlikMaddeleriCevabi>('/hazirlik-maddeleri'), staleTime: 5 * 60_000 });
}

export interface MaddeGorunumu { ad: (kod: string, varsayilan: string) => string; kisa: (kod: string, varsayilan: string) => string; acik: (kod: string) => boolean; sira: (kod: string) => number }
export function maddeGorunumu(liste: readonly HazirlikMaddeTanimi[] | undefined): MaddeGorunumu {
  const harita = new Map((liste ?? []).map((m, i) => [m.kod, { ...m, i }]));
  return {
    ad: (kod, varsayilan) => harita.get(kod)?.ad ?? varsayilan,
    kisa: (kod, varsayilan) => harita.get(kod)?.kisa ?? varsayilan,
    acik: (kod) => harita.get(kod)?.acik ?? true,
    sira: (kod) => harita.get(kod)?.i ?? Number.MAX_SAFE_INTEGER,
  };
}
