import type { ProjeListesiSorgusu } from '#paylasilan/sozlesme/projeler.ts';

export const anahtarlar = {
  kok: ['projeler'] as const,
  liste: (sorgu: ProjeListesiSorgusu) => ['projeler', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['projeler', 'ayrinti', id] as const,
  emirler: (projeId: number) => ['projeler', 'emirler', projeId] as const,
  kalemler: (projeId: number) => ['projeler', 'kalemler', projeId] as const,
  firmalar: (ara: string) => ['projeler', 'firmalar', ara] as const,
  siparisler: (ara: string) => ['projeler', 'siparisler', ara] as const,
  yonetim: (id: number) => ['projeler', 'yonetim', id] as const,
  logo: (id: number) => ['projeler', 'logo', id] as const,
  statuler: ['projeler', 'statuler'] as const,
  sorumlular: ['projeler', 'sorumlular'] as const,
  roller: ['projeler', 'roller'] as const,
  gorevlerim: ['projeler', 'gorevlerim'] as const,
  gorevAyrinti: (id: number) => ['projeler', 'gorev', id] as const,
  sablonlar: ['projeler', 'sablonlar'] as const,
  hazirlik: (projeId: number) => ['projeler', 'hazirlik', projeId] as const,
  kademeler: (gorevId: number) => ['projeler', 'kademeler', gorevId] as const,
  sablonSecenekleri: ['projeler', 'sablon-secenekleri'] as const,
};
