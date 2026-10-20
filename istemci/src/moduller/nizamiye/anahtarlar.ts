export const anahtarlar = {
  hepsi: ['nizamiye'] as const,
  kapi: ['nizamiye', 'kapi'] as const,
  kartlar: ['nizamiye', 'kartlar'] as const,
  gecmis: (gun: string, ara: string) => ['nizamiye', 'gecmis', gun, ara] as const,
  acil: ['nizamiye', 'acil'] as const,
  evSahipleri: ['nizamiye', 'ev-sahipleri'] as const,
  oneriler: (ara: string) => ['nizamiye', 'oneriler', ara] as const,
  ziyaretcilerim: ['nizamiye', 'ziyaretcilerim'] as const,
  pdksCihazlar: ['nizamiye', 'pdks-cihazlar'] as const,
};
