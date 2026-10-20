export const anahtarlar = {
  hepsi: ['rotalar'] as const,
  liste: ['rotalar', 'liste'] as const,
  secenekler: ['rotalar', 'secenekler'] as const,
  sablonlar: ['rotalar', 'sablonlar'] as const,
  urun: (id: number) => ['rotalar', 'urun', id] as const,
  revizyon: (id: number, miktar: string) => ['rotalar', 'revizyon', id, miktar] as const,
  fark: (id: number) => ['rotalar', 'fark', id] as const,
  agac: (id: number, miktar: string) => ['rotalar', 'agac', id, miktar] as const,
  talimatlar: (urunId: number, opNo: number) => ['rotalar', 'talimat', urunId, opNo] as const,
  malzemeArama: (tur: string, metin: string) => ['rotalar', 'malzeme-arama', tur, metin] as const,
};
