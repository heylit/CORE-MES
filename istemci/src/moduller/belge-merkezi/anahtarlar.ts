import type { BagModulu, BelgeListesiSorgusu } from '#paylasilan/sozlesme/belge-merkezi.ts';

export const anahtarlar = {
  kok: ['belge-merkezi'] as const,
  liste: (sorgu: BelgeListesiSorgusu) => ['belge-merkezi', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['belge-merkezi', 'ayrinti', id] as const,
  dosya: (id: number, revizyonId: number) => ['belge-merkezi', 'dosya', id, revizyonId] as const,
  malzemeSecimi: (ara: string) => ['belge-merkezi', 'malzeme-secimi', ara] as const,
  malzemeBelgeleri: (no: number) => ['belge-merkezi', 'malzeme', no] as const,
  kucukResimler: (hedefModul: BagModulu, idler: readonly number[]) => ['belge-merkezi', 'kucuk-resimler', hedefModul, idler.join(',')] as const,
};
