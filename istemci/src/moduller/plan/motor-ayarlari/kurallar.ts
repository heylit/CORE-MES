import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';

// Plan motoru ayarlarının ekrandaki adları (kart 811; 771 a, 772 a, 776 b). Sıra seçim kutusundaki sıradır, ilki varsayılandır.
export const AYAR_SECENEKLERI: { [K in keyof MotorAyarlari]: { baslik: string; ipucu: string; secenekler: readonly { deger: MotorAyarlari[K]; baslik: string }[] } } = {
  amac: {
    baslik: 'Plan amacı',
    ipucu: 'Sıralı: önce zamanında teslim, sonra değişiklik, ayar ve boşta kalma, en son maliyet. TL seçeneği para verisi dolunca açılır.',
    secenekler: [{ deger: 'sirali', baslik: 'Sıralı' }, { deger: 'tl', baslik: 'TL (gecikme bedeli)' }],
  },
  eksikStok: {
    baslik: 'Stoku bilinmeyen malzeme',
    ipucu: 'Varsay: stok var sayılır. Dur: plan kurulur ama stoku bilinmeyen malzeme varken canlıya alınamaz.',
    secenekler: [{ deger: 'varsay', baslik: 'Varsay' }, { deger: 'dur', baslik: 'Dur' }],
  },
  kural: {
    baslik: 'Sıralama kuralı',
    ipucu: 'Atölyede senaryo başına ayrıca seçilebilir.',
    secenekler: [
      { deger: 'atcs', baslik: 'ATCS (öncelik, termin ve süre birlikte)' }, { deger: 'oncelik', baslik: 'Öncelik, sonra teslim' },
      { deger: 'edd', baslik: 'En erken teslim (EDD)' }, { deger: 'cr', baslik: 'Kritik oran (CR)' },
      { deger: 'spt', baslik: 'En kısa iş (SPT)' }, { deger: 'fifo', baslik: 'İlk gelen önce (FIFO)' },
    ],
  },
};

// 771 a, 832 a: TL amacı ayarda kapalıdır; seçim listesinde yalnız şu an kayıtlıysa görünür (sunucu da yazmayı reddeder).
export const KAPALI_SECENEKLER: { [K in keyof MotorAyarlari]?: readonly MotorAyarlari[K][] } = { amac: ['tl'] };
export function secilebilir<K extends keyof MotorAyarlari>(anahtar: K, simdiki: MotorAyarlari[K]) {
  const kapali = (KAPALI_SECENEKLER[anahtar] ?? []) as readonly string[];
  return AYAR_SECENEKLERI[anahtar].secenekler.filter((s) => !kapali.includes(s.deger) || s.deger === simdiki);
}

export function degerAdi<K extends keyof MotorAyarlari>(anahtar: K, deger: MotorAyarlari[K]): string {
  return AYAR_SECENEKLERI[anahtar].secenekler.find((s) => s.deger === deger)?.baslik ?? deger;
}

// Sürüm satırı: kim ne zaman yazdı; hiç sürüm yoksa varsayılan.
export function surumMetni(s: MotorAyarlariCevabi['guncel']): string {
  if (s.surumId === null) return 'Varsayılan ayarlar; henüz değiştirilmedi.';
  const zaman = s.zaman === null ? '' : new Date(s.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
  return `Sürüm ${String(s.surumId)}: ${s.yazan ?? 'bilinmeyen kişi'}${zaman ? `, ${zaman}` : ''}.`;
}
