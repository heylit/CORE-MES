export const anahtarlar = {
  modeller: (sayfa: number, ara: string, durum: string) => ['geometri', 'modeller', sayfa, ara, durum] as const,
  analiz: (revizyonId: number) => ['geometri', 'analiz', revizyonId] as const,
  yogunluk: (anahtarlar: readonly string[]) => ['geometri', 'yogunluk', ...anahtarlar] as const,
  ham: (revizyonId: number, payMm: number, kalite: string, kesmeMm = -1) => ['geometri', 'ham', revizyonId, payMm, kalite, kesmeMm] as const,
  sure: (revizyonId: number, iso: string) => ['geometri', 'sure', revizyonId, iso] as const,
  guncel: (revizyonId: number) => ['geometri', 'guncel', revizyonId] as const,
  dosya: (revizyonId: number) => ['geometri', 'dosya', revizyonId] as const,
  ozellik: (revizyonId: number) => ['geometri', 'ozellik', revizyonId] as const,
  montaj: (revizyonId: number) => ['geometri', 'montaj', revizyonId] as const,
  yuzey: (revizyonId: number) => ['geometri', 'yuzey', revizyonId] as const,
  kalibrasyon: () => ['geometri', 'kalibrasyon'] as const,
};
