import type { GeometriDurumu, HamStokOnerisi } from '#paylasilan/sozlesme/geometri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

export const DURUM_ADI: Readonly<Record<GeometriDurumu, string>> = {
  yok: 'Sırada değil', bekliyor: 'Kuyrukta', calisiyor: 'Hesaplanıyor', bitti: 'Hesaplandı', hata: 'Hata',
};
export const DURUM_TONU: Readonly<Record<GeometriDurumu, RozetTonu>> = {
  yok: 'pasif', bekliyor: 'bilgi', calisiyor: 'bilgi', bitti: 'tamam', hata: 'hata',
};
export const DURUMLAR: readonly GeometriDurumu[] = ['bitti', 'bekliyor', 'calisiyor', 'hata', 'yok'];
// Hesap sürerken ekran kendini yeniler; bitince durur.
export const suruyorMu = (d: GeometriDurumu | undefined): boolean => d === 'bekliyor' || d === 'calisiyor' || d === 'yok';

const bicim = (basamak: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: 0 });
const mm = bicim(1);
const tam = bicim(0);
export const uzunluk = (x: number): string => mm.format(x);
export const kutuMetni = (a: number, b: number, c: number): string => `${uzunluk(a)} x ${uzunluk(b)} x ${uzunluk(c)} mm`;
export const buyukSayi = (x: number | null, birim: string): string => (x === null ? '-' : `${tam.format(x)} ${birim}`);

// Hammadde formlarının adı Malzemeler'deki gibi.
export const FORM_ADI: Readonly<Record<HamStokOnerisi['form'], string>> = {
  cubuk: 'Yuvarlak çubuk', altigen: 'Altıgen çubuk', lama: 'Lama / kare', levha: 'Levha / sac', blok: 'Blok',
};
// Kartın ölçüsü, formun alışılmış yazımıyla (çubukta çap, altıgende anahtar ağzı önde).
export function stokOlcuMetni(o: HamStokOnerisi): string {
  const d = (k: string): string => uzunluk(o.olcu[k] ?? 0);
  switch (o.form) {
    case 'cubuk': return `Ø ${d('d')} x ${d('l')} mm`;
    case 'altigen': return `SW ${d('s')} x ${d('l')} mm`;
    case 'lama': return `${d('a')} x ${d('b')} x ${d('l')} mm`;
    case 'levha': return `${d('t')} x ${d('w')} x ${d('l')} mm`;
    case 'blok': return `${d('a')} x ${d('b')} x ${d('h')} mm`;
  }
}

// Net ağırlık (1446 a): hacim x yoğunluk, yalnız ekranda öneri. Yoğunluk g/cm³ (1 g/cm³ = 1e-6 kg/mm³); hacim ya da yoğunluk yoksa null.
export const yogunlukOku = (metin: string): number | null => {
  const x = Number(metin.trim().replace(',', '.'));
  return metin.trim() === '' || !Number.isFinite(x) || x <= 0 ? null : x;
};
export const agirlikKg = (hacimMm3: number | null, yogunluk: number | null): number | null =>
  (hacimMm3 === null || yogunluk === null ? null : (hacimMm3 * yogunluk) / 1e6);
const kg = bicim(3);
export const agirlikMetni = (x: number): string => `${kg.format(x)} kg`;
export const yogunlukBicimi = (x: number): string => kg.format(x);
