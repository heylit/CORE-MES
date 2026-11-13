import type { SmartesEslemeTuru, SmartesGelenAdTuru } from '#paylasilan/sozlesme/smartes.ts';

export const anahtarlar = {
  kok: ['smartes'] as const,
  durum: ['smartes', 'durum'] as const,
  eslemeler: (tur: SmartesEslemeTuru) => ['smartes', 'eslemeler', tur] as const,
  makineler: ['smartes', 'makineler'] as const,
  makineBulgulari: ['smartes', 'makine-bulgulari'] as const,
  makine: (kod: string) => ['smartes', 'makineler', kod] as const,
  gelenAdlar: (tur: SmartesGelenAdTuru) => ['smartes', 'gelen-adlar', tur] as const,
  gelenler: ['smartes', 'gelenler'] as const,
  hesaplar: ['smartes', 'hesaplar'] as const,
  ham: (tur: string, id: number) => ['smartes', 'ham', tur, id] as const,
  onay: (gorunum: 'bekliyor' | 'karar') => ['smartes', 'adet-onaylari', gorunum] as const,
  liste: (ad: string, sayfa: number) => ['smartes', 'liste', ad, sayfa] as const,
};
