import type { ProjeListesiSorgusu } from '#paylasilan/sozlesme/projeler.ts';

export const anahtarlar = {
  kok: ['projeler'] as const,
  liste: (sorgu: ProjeListesiSorgusu) => ['projeler', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['projeler', 'ayrinti', id] as const,
  emirler: (projeId: number) => ['projeler', 'emirler', projeId] as const,
  firmalar: (ara: string) => ['projeler', 'firmalar', ara] as const,
  siparisler: (ara: string) => ['projeler', 'siparisler', ara] as const,
};
