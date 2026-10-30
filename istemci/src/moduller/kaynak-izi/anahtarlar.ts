export const anahtarlar = {
  arama: (metin: string) => ['kaynak-izi', 'arama', metin] as const,
  kaynak: (tur: string, id: number) => ['kaynak-izi', tur, id] as const,
};
