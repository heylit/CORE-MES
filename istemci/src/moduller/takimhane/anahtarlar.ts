export const anahtarlar = {
  ozet: ['takimhane', 'ozet'] as const,
  takimlar: ['takimhane', 'takimlar'] as const,
  acikTeslimler: ['takimhane', 'acik-teslimler'] as const,
  emirListesi: (emirNo: string) => ['takimhane', 'emir', emirNo] as const,
};
