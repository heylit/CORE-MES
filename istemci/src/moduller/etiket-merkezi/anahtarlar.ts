export const anahtarlar = {
  sablonlar: ['etiket-merkezi', 'sablonlar'] as const,
  yazicilar: ['etiket-merkezi', 'yazicilar'] as const,
  baskilar: ['etiket-merkezi', 'baskilar'] as const,
  secim: ['etiket-merkezi', 'secim'] as const,
  cikti: (anahtar: string, sorgu: string) => ['etiket-merkezi', 'cikti', anahtar, sorgu] as const,
};
