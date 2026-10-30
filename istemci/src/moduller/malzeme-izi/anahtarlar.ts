export const anahtarlar = {
  arama: (metin: string, sayfa: number) => ['malzeme-izi', 'arama', metin, sayfa] as const,
  malzeme: (id: number) => ['malzeme-izi', 'malzeme', id] as const,
};
