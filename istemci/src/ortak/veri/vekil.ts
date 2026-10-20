// Sunucu her cevabı JSON nesnesiyle verir. 5xx cevabı JSON nesnesi değilse sunucudan değil aradaki vekilden gelir
// (`npm run baslat` önizlemesi /api'yi sunucuya aktarır): sunucu kapalı ya da yeniden açılıyor demektir; ulaşılamamak sayılır.
export function vekilCevabiMi(durum: number, metin: string): boolean {
  if (durum < 500) return false;
  try {
    const veri: unknown = JSON.parse(metin);
    return veri === null || typeof veri !== 'object';
  } catch {
    return true;
  }
}
