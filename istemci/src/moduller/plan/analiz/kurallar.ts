import type { PlanAnaliziCevabi, PlanAnaliziHucresi } from '#paylasilan/sozlesme/plan-analiz.ts';

// Planlama analizi ekranının saf yardımcıları (2151).

const sayi = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
export const yuzdeMetni = (n: number | null) => (n === null ? 'Veri yok' : `%${sayi(n)}`);
export const saatMetni = (dk: number) => `${sayi(dk / 60)} saat`;
// Hafta sütununun kısa başlığı: pazartesinin gün ve ayı.
export const haftaEtiketi = (baslangic: string) => `${baslangic.slice(8, 10)}.${baslangic.slice(5, 7)}`;

// Doluluk eşikleri: %85 ve üstü dar, 100'ü aşan taşmış. Renk tek başına anlam taşımaz: hücrede yüzde yazar, başlıkta eşik açıklanır.
export const DAR_ESIK = 85;
export type Doluluk = 'bos' | 'rahat' | 'dar' | 'tasmis';
export function doluluk(h: PlanAnaliziHucresi): Doluluk {
  if (h.oran === null) return 'bos';
  if (h.oran > 100) return 'tasmis';
  return h.oran >= DAR_ESIK ? 'dar' : 'rahat';
}
export function hucreAciklamasi(h: PlanAnaliziHucresi, ileri: boolean): string {
  if (h.kapasiteDk === null) return 'Çalışma takvimi yok: kapasite bilinmiyor.';
  return `${ileri ? 'Planlı' : 'Gerçek'} ${saatMetni(h.yukDk)} / çalışma ${saatMetni(h.kapasiteDk)}`;
}

// Zamanında eğrisinin alt metni: yeterli ölçüm yoksa söyler, uyarı yalnız kontrol sınırı aşılınca (2151-3 b).
export function egilimMetni(z: PlanAnaliziCevabi['zamaninda']): string {
  if (z.ornek === 0) return 'Canlıya alma ölçümü henüz yok.';
  if (z.ornek < z.gereken) return `Yetersiz veri: ${String(z.ornek)} ölçüm var, uyarı için ${String(z.gereken)} gerekir. Eğri yalnız bilgi verir.`;
  if (z.uyari === 'dusus') return 'Belirgin düşüş: düzeltilmiş eğri ilk ölçümlerin kontrol sınırının altında. Gecikme nedenlerine bakın.';
  if (z.uyari === 'yukselis') return 'Belirgin iyileşme: düzeltilmiş eğri ilk ölçümlerin kontrol sınırının üstünde.';
  return 'Değişim olağan dalgalanma içinde.';
}

// Eğri etiketi: canlıya almanın günü ve ayı.
export const olcumEtiketi = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
