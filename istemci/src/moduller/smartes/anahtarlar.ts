import type { SmartesEslemeTuru } from '#paylasilan/sozlesme/smartes.ts';

export const anahtarlar = {
  kok: ['smartes'] as const,
  durum: ['smartes', 'durum'] as const,
  eslemeler: (tur: SmartesEslemeTuru) => ['smartes', 'eslemeler', tur] as const,
  liste: (ad: string, sayfa: number) => ['smartes', 'liste', ad, sayfa] as const,
};
