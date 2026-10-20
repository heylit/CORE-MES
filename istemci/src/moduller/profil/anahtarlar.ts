export const anahtarlar = {
  profil: ['profil'] as const,
  saatCihazlari: ['profil', 'saat-cihazlari'] as const,
  gelenler: (sayfa: number, konu: string, tur: string) => ['profil', 'gelenler', sayfa, konu, tur] as const,
};
