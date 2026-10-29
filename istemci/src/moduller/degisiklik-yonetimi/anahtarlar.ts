import type { GorevKapsami } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { EmirlerSorgusu, TaleplerSorgusu } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';

// Bütün komutlar `kok`u tazeler: talep, emir ve görev listesi birbirinin durumunu gösterir.
export const anahtarlar = {
  kok: ['degisiklik-yonetimi'] as const,
  gorevlerim: (kapsam: GorevKapsami) => ['degisiklik-yonetimi', 'gorevlerim', kapsam] as const,
  talepler: (sorgu: Partial<TaleplerSorgusu>) => ['degisiklik-yonetimi', 'talepler', sorgu] as const,
  talep: (id: number) => ['degisiklik-yonetimi', 'talep', id] as const,
  emirler: (sorgu: Partial<EmirlerSorgusu>) => ['degisiklik-yonetimi', 'emirler', sorgu] as const,
  emir: (id: number) => ['degisiklik-yonetimi', 'emir', id] as const,
  parcaAdaylari: (ara: string) => ['degisiklik-yonetimi', 'parca-adaylari', ara] as const,
};
