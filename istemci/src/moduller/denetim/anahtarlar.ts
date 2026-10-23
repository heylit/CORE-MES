export const anahtarlar = {
  kok: ['denetim'] as const,
  liste: (sorgu: object) => ['denetim', 'liste', sorgu] as const,
  suzgecler: ['denetim', 'suzgecler'] as const,
  icerik: (id: number) => ['denetim', 'icerik', id] as const,
  degisiklikler: (sorgu: object) => ['denetim', 'degisiklikler', sorgu] as const,
  degisiklikSuzgecleri: ['denetim', 'degisiklik-suzgecleri'] as const,
  degisiklikIcerigi: (id: number) => ['denetim', 'degisiklik-icerigi', id] as const,
};
