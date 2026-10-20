import type { BelgeListesiSorgusu } from '#paylasilan/sozlesme/cizimler.ts';

export const anahtarlar = {
  kok: ['cizimler'] as const,
  liste: (sorgu: BelgeListesiSorgusu) => ['cizimler', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['cizimler', 'ayrinti', id] as const,
  dosya: (id: number, revizyonId: number) => ['cizimler', 'dosya', id, revizyonId] as const,
  malzemeSecimi: (ara: string) => ['cizimler', 'malzeme-secimi', ara] as const,
};
