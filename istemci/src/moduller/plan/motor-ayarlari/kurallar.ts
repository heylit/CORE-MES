import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';

// Plan motoru ayarlarının ekrandaki adları (kart 811; 771 a, 772 a, 776 b). Sıra seçim kutusundaki sıradır, ilki varsayılandır.
export const AYAR_SECENEKLERI: { [K in keyof MotorAyarlari]: { baslik: string; ipucu: string; secenekler: readonly { deger: MotorAyarlari[K]; baslik: string }[] } } = {
  amac: {
    baslik: 'Plan amacı',
    ipucu: 'Sıralı: önce zamanında teslim, sonra ayar ve düzen. TL: gecikme bedelinin toplamı en aza iner.',
    secenekler: [{ deger: 'sirali', baslik: 'Sıralı' }, { deger: 'tl', baslik: 'TL (gecikme bedeli)' }],
  },
  eksikStok: {
    baslik: 'Stoku bilinmeyen malzeme',
    ipucu: 'Dur: plan kurulur ama canlıya alınamaz. Varsay: stok var sayılır; yalnız geçiş döneminde.',
    secenekler: [{ deger: 'dur', baslik: 'Dur' }, { deger: 'varsay', baslik: 'Varsay' }],
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

export function degerAdi<K extends keyof MotorAyarlari>(anahtar: K, deger: MotorAyarlari[K]): string {
  return AYAR_SECENEKLERI[anahtar].secenekler.find((s) => s.deger === deger)?.baslik ?? deger;
}

// Sürüm satırı: kim ne zaman yazdı; hiç sürüm yoksa varsayılan.
export function surumMetni(s: MotorAyarlariCevabi['guncel']): string {
  if (s.surumId === null) return 'Varsayılan ayarlar; henüz değiştirilmedi.';
  const zaman = s.zaman === null ? '' : new Date(s.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
  return `Sürüm ${String(s.surumId)}: ${s.yazan ?? 'bilinmeyen kişi'}${zaman ? `, ${zaman}` : ''}.`;
}
