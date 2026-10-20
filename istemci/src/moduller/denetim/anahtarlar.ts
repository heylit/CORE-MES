export const anahtarlar = {
  kok: ['denetim'] as const,
  liste: (sorgu: object) => ['denetim', 'liste', sorgu] as const,
  suzgecler: ['denetim', 'suzgecler'] as const,
  icerik: (id: number) => ['denetim', 'icerik', id] as const,
};
