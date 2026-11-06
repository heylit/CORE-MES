export const anahtarlar = {
  kok: ['bildirim'] as const,
  sayac: ['bildirim', 'sayac'] as const,
  liste: (durum: string, sayfa: number) => ['bildirim', 'liste', durum, sayfa] as const,
  tercihler: ['bildirim', 'tercihler'] as const,
  ortada: ['bildirim', 'ortada'] as const,
  yayinlar: (sayfa: number) => ['bildirim', 'yayinlar', sayfa] as const,
  alicilar: (id: number) => ['bildirim', 'yayinlar', 'alicilar', id] as const,
  hedefler: ['bildirim', 'yayinlar', 'hedefler'] as const,
};
