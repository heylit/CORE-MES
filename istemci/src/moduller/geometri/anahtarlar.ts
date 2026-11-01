export const anahtarlar = {
  modeller: (sayfa: number, ara: string, durum: string) => ['geometri', 'modeller', sayfa, ara, durum] as const,
  analiz: (revizyonId: number) => ['geometri', 'analiz', revizyonId] as const,
  ham: (revizyonId: number, payMm: number, kalite: string) => ['geometri', 'ham', revizyonId, payMm, kalite] as const,
  dosya: (revizyonId: number) => ['geometri', 'dosya', revizyonId] as const,
};
