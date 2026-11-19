import type { ToplantiKapsami } from '#paylasilan/sozlesme/toplantilar.ts';

export const anahtarlar = {
  kok: ['toplantilar'] as const,
  liste: (kapsam: ToplantiKapsami) => ['toplantilar', 'liste', kapsam] as const,
  ayrinti: (id: number) => ['toplantilar', 'ayrinti', id] as const,
};
