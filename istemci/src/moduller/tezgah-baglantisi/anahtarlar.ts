export const anahtarlar = {
  kok: ['tezgah-baglantisi'] as const,
  durum: ['tezgah-baglantisi', 'durum'] as const,
  tezgah: (cihazAdi: string) => ['tezgah-baglantisi', 'tezgah', cihazAdi] as const,
};
