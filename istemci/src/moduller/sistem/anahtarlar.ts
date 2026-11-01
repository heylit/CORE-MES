import type { SaatlikAralik } from '#paylasilan/sozlesme/saglik.ts';

export const anahtarlar = {
  saglik: ['saglik'] as const,
  sistemAyrinti: ['sistem', 'ayrinti'] as const,
  metrikler: ['sistem', 'metrikler'] as const,
  saatlik: (aralik: SaatlikAralik | 'saat') => ['sistem', 'saatlik', aralik] as const,
};
