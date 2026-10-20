export const anahtarlar = {
  kok: ['bildirim'] as const,
  sayac: ['bildirim', 'sayac'] as const,
  liste: (durum: string, sayfa: number) => ['bildirim', 'liste', durum, sayfa] as const,
  tercihler: ['bildirim', 'tercihler'] as const,
};
