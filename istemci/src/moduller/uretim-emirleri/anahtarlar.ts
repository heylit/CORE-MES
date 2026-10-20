import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';

export const anahtarlar = {
  hepsi: ['uretim-emirleri'] as const,
  liste: (durum: EmirDurumu | '') => ['uretim-emirleri', 'liste', durum] as const,
  bitenler: (durum: EmirDurumu | '', ara: string, sayfa: number) => ['uretim-emirleri', 'bitenler', durum, ara, sayfa] as const,
  ayrinti: (id: number) => ['uretim-emirleri', 'ayrinti', id] as const,
  ozet: ['uretim-emirleri', 'ozet'] as const,
  akis: (id: number) => ['uretim-emirleri', 'akis', id] as const,
  refakat: (id: number) => ['uretim-emirleri', 'refakat', id] as const,
  adimli: (id: number) => ['uretim-emirleri', 'adimli', id] as const,
  fasonFirmalari: ['uretim-emirleri', 'fason-firmalari'] as const,
};
