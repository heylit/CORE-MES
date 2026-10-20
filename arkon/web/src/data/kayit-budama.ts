// Tabletin yerel üretim kaydı kopyası (log_*) çevrimdışı gösterim içindir; asıl kayıt sunucudadır ve gönderilmemiş satır ayrı kuyruktadır.
// Sunucusuz yerel modda kaydın tek kopyası tablettir, orada budanmaz (karar 69 a).
export const YEREL_KAYIT_GUNU = 7;
export const BUDANAN_DEPOLAR = ['log_events', 'log_counts', 'log_meas', 'log_calls', 'log_audit'] as const;

export const yerelKayitBudanir = (sunucu: { on: boolean }): boolean => sunucu.on;

export function budanacakAnahtarlar<K>(satirlar: readonly [K, unknown][], simdi: number): K[] {
  const sinir = simdi - YEREL_KAYIT_GUNU * 864e5;
  return satirlar.filter(([, v]) => {
    const at = (v as { at?: unknown } | null)?.at;
    return typeof at === 'number' && Number.isFinite(at) && at < sinir;
  }).map(([k]) => k);
}
