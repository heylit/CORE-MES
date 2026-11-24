export const anahtarlar = {
  ozet: ['takimhane', 'ozet'] as const,
  takimlar: ['takimhane', 'takimlar'] as const,
  acikTeslimler: ['takimhane', 'acik-teslimler'] as const,
  aparat: ['takimhane', 'aparat'] as const,
  emirAparat: (emirId: string) => ['takimhane', 'emir-aparat', emirId] as const,
  emirListesi: (emirNo: string) => ['takimhane', 'emir', emirNo] as const,
};
