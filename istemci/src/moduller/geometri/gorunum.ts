import type { GeometriDurumu, GeometriOzellik, HamStokOnerisi } from '#paylasilan/sozlesme/geometri.ts';
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

// Özellik kartı (2044-2): satır metinleri. Ölçü yoksa parça yazılmaz (sıfır uydurulmaz).
const aci = (x: number): string => `${uzunluk(x)}°`;
// Girişin yüzü eksen yönünden (prototip 2044-2): eksen girişten içeri doğrudur; Z bileşeni baskınsa eksi Z üst, artı Z alt yüzdür,
// X ya da Y baskınsa yan yüz.
export function girisYuzu(e: readonly number[] | null): string | null {
  if (e === null || e.length !== 3) return null;
  const m = e.map(Math.abs);
  const i = m.indexOf(Math.max(...m));
  if (i === 2) return (e[2] ?? 0) < 0 ? 'Üst yüz (Z)' : 'Alt yüz (Z)';
  return `Yan yüz (${i === 0 ? 'X' : 'Y'})`;
}
export function delikMetni(d: GeometriOzellik): { ust: string; alt: string } {
  const parca = [d.capMm === null ? null : `Ø${uzunluk(d.capMm)}`, d.gecis === null ? null : d.gecis ? 'geçiş' : 'kör'].filter((x) => x !== null).join(' ');
  const ust = d.derinlikMm === null ? parca : `${parca} · ${uzunluk(d.derinlikMm)} mm`;
  const alt = [girisYuzu(d.eksen), d.dip === 'matkap' ? `matkap ucu${d.aciDerece === null ? '' : ` ${aci(d.aciDerece)}`}` : d.dip === 'duz' ? 'düz dip' : null]
    .filter((x) => x !== null).join(' · ');
  return { ust, alt };
}
export function bagliMetni(o: GeometriOzellik): string {
  if (o.tur === 'havsa') return `Havşa${o.capMm === null ? '' : ` Ø${uzunluk(o.capMm)}`}${o.aciDerece === null ? '' : ` x ${aci(o.aciDerece)}`}`;
  return `Kademe${o.capMm === null ? '' : ` Ø${uzunluk(o.capMm)}`}${o.derinlikMm === null ? '' : ` x ${uzunluk(o.derinlikMm)} mm`}`;
}
// Pah ölçüsü büyük komşu yüzdeki bacak boyu x açı: bacak = yüz genişliği x cos(açı). Mil ucunda (çapı olan pah) aynı yazım.
export function pahMetni(o: GeometriOzellik): { ust: string; alt: string } {
  const bacak = o.genislikMm !== null && o.aciDerece !== null ? o.genislikMm * Math.cos((o.aciDerece * Math.PI) / 180) : null;
  const ust = `Pah${bacak === null ? '' : ` ${uzunluk(bacak)}`}${o.aciDerece === null ? '' : ` x ${aci(o.aciDerece)}`}`;
  const alt = [o.capMm === null ? null : `Ø${uzunluk(o.capMm)} mil ucu`, o.boyMm === null ? null : `Boy ${uzunluk(o.boyMm)} mm`,
    o.genislikMm === null ? null : `yüz genişliği ${uzunluk(o.genislikMm)} mm`].filter((x) => x !== null).join(' · ');
  return { ust, alt };
}
export function radyusMetni(o: GeometriOzellik): { ust: string; alt: string } {
  const ust = `R${o.yaricapMm === null ? '' : uzunluk(o.yaricapMm)}${o.ic === null ? '' : o.ic ? ' iç köşe' : ' dış kenar'}`;
  return { ust, alt: o.boyMm === null ? '' : `Boy ${uzunluk(o.boyMm)} mm` };
}
