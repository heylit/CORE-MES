import type { BolumTuru } from '#paylasilan/sozlesme/akis.ts';

export const BOLUM_ADLARI: Record<BolumTuru, string> = {
  bekleme: 'Bekleme', hazirlik: 'Hazırlık', isleme: 'İşleme', duraklama: 'Duraklama', durus: 'Duruş', fason: 'Fasonda', sevk: 'Sevk bekleme',
};
export const BOLUM_SIRASI = Object.keys(BOLUM_ADLARI) as BolumTuru[];

// Dakikayı okunur süreye çevirir: 90 -> "1 sa 30 dk", 2900 -> "2 g 0 sa". Veri yoksa tire; sıfır uydurulmaz.
export function sureMetni(dk: number | null): string {
  if (dk === null) return '–';
  if (dk < 60) return `${dk.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} dk`;
  const toplamDk = Math.round(dk);
  const gun = Math.floor(toplamDk / 1440);
  const saat = Math.floor((toplamDk % 1440) / 60);
  const dakika = toplamDk % 60;
  return gun > 0 ? `${String(gun)} g ${String(saat)} sa` : `${String(saat)} sa ${String(dakika)} dk`;
}

export const zamanMetni = (z: string | null): string =>
  z === null ? '–' : new Date(z).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Şeridin zaman ekseni: bütün bölümlerin en erken başı ve en geç sonu; yüzdeye çevirir.
export function eksen(araliklar: readonly { baslangic: string; bitis: string }[]): { bas: number; bit: number; x: (z: string) => number } | null {
  if (araliklar.length === 0) return null;
  const bas = Math.min(...araliklar.map((a) => Date.parse(a.baslangic)));
  const bit = Math.max(...araliklar.map((a) => Date.parse(a.bitis)));
  const genislik = Math.max(1, bit - bas);
  return { bas, bit, x: (z: string) => ((Date.parse(z) - bas) / genislik) * 100 };
}
