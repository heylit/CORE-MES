export const anahtarlar = {
  profil: ['profil'] as const,
  saatCihazlari: ['profil', 'saat-cihazlari'] as const,
  // Geri Bildirim Merkezi: yazmadan sonra 'merkez' önekiyle hepsi yenilenir.
  merkez: ['profil', 'merkez'] as const,
  gelenler: (sorgu: string) => ['profil', 'merkez', 'liste', sorgu] as const,
  ayrinti: (id: number) => ['profil', 'merkez', 'ayrinti', id] as const,
  secenekler: ['profil', 'merkez', 'secenekler'] as const,
  ozet: ['profil', 'merkez', 'ozet'] as const,
};
