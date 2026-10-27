export const anahtarlar = {
  kok: ['markalama'] as const,
  tanimlar: ['markalama', 'tanimlar'] as const,
  onizleme: (tanimId: number, emirId: number | null) => ['markalama', 'onizleme', tanimId, emirId] as const,
  emirler: (tanimId: number) => ['markalama', 'emirler', tanimId] as const,
  birimler: (suzgec: string) => ['markalama', 'birimler', suzgec] as const,
  birim: (id: number) => ['markalama', 'birim', id] as const,
  emirOzeti: (emirId: number) => ['markalama', 'emir-ozeti', emirId] as const,
  modeller: (malzemeId: number) => ['markalama', 'modeller', malzemeId] as const,
  modelDosyasi: (belgeId: number, revizyonId: number) => ['markalama', 'model-dosyasi', belgeId, revizyonId] as const,
  malzemeAra: (metin: string) => ['markalama', 'malzeme-ara', metin] as const,
  hurdaNedenleri: ['markalama', 'hurda-nedenleri'] as const,
};
