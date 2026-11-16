import type { GeometriKalibrasyonCevabi, GeometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { ISO_ADI } from './gorunum.ts';

// Süre kalibrasyonu (3321-3) ekran kuralları: aşama satırları, eğri noktaları ve log ölçek. Hesap sunucudadır; burada yalnız gösterim.
type Asama = GeometriKalibrasyonCevabi['asama'];
export type KalibrasyonParcasi = GeometriKalibrasyonCevabi['parcalar'][number];
export type GrupTuru = GeometriKalibrasyonCevabi['gruplar'][number]['tur'];

export const ASAMA_ADI: Readonly<Record<Asama, string>> = { kalibresiz: 'Kalibresiz', tek: 'Tek çarpan', grup: 'Grup ve tezgâh çarpanı', regresyon: 'Kalem kalem uyum' };
const ASAMA_SIRASI: readonly Asama[] = ['kalibresiz', 'tek', 'grup', 'regresyon'];
export const GRUP_TURU_ADI: Readonly<Record<GrupTuru, string>> = { malzeme: 'Malzeme', tezgah: 'Tezgâh', islem: 'İşlem' };

export interface AsamaSatiri { asama: Asama; kosul: string; durum: 'gecti' | 'simdi' | 'bekliyor'; eksik: number }

// Kalibrasyon durumu tablosu: geçilen aşama "geçti", bulunulan "şimdi", sonrakiler eksik parça sayısıyla.
export function asamaSatirlari(asama: Asama, n: number, esikler: GeometriKalibrasyonCevabi['esikler']): AsamaSatiri[] {
  const esik: Readonly<Record<Asama, number>> = { kalibresiz: 0, tek: esikler.tek, grup: esikler.grup, regresyon: esikler.regresyon };
  const simdi = ASAMA_SIRASI.indexOf(asama);
  return ASAMA_SIRASI.map((a, i) => ({
    asama: a,
    kosul: a === 'kalibresiz' ? `${String(esikler.tek)} parçadan az` : a === 'tek' ? `${String(esikler.tek)} parça ve üstü` : `${String(esik[a])} parça`,
    durum: i < simdi ? 'gecti' : i === simdi ? 'simdi' : 'bekliyor',
    eksik: Math.max(0, esik[a] - n),
  }));
}

export const grupAdi = (tur: GrupTuru, anahtar: string): string =>
  tur === 'malzeme' && Object.hasOwn(ISO_ADI, anahtar) ? `${anahtar} · ${ISO_ADI[anahtar as keyof typeof ISO_ADI]}` : anahtar;

export interface EgriSecimi { malzeme: string | null; tezgah: string | null; islem: string | null }
export type EgriKipi = 'once' | 'sonra';
export interface EgriNoktasi { parca: KalibrasyonParcasi; x: number; y: number }

// Seçili gruptaki parçalar. Düzeltme öncesi x kalibresiz tahmin; sonrası parçanın düzeltilmiş süresi (yoksa kalibresiz).
export function egriNoktalari(parcalar: readonly KalibrasyonParcasi[], s: EgriSecimi, kip: EgriKipi): EgriNoktasi[] {
  return parcalar
    .filter((p) => (s.malzeme === null || p.gruplar.malzeme === s.malzeme) && (s.tezgah === null || p.gruplar.tezgah === s.tezgah)
      && (s.islem === null || p.gruplar.islem === s.islem))
    .map((p) => ({ parca: p, x: kip === 'sonra' ? (p.kalibreDk ?? p.tahminDk) : p.tahminDk, y: p.olcumDk }));
}

// Log eksen: 1-3-10 basamakları; alt en küçük değerin altındaki, üst en büyüğün üstündeki ilk basamak.
const basamaklar = (k: number): number[] => [1, 3].map((b) => Number((b * 10 ** k).toPrecision(6)));
export function logEksen(degerler: readonly number[]): { alt: number; ust: number; isaretler: number[] } {
  const pozitif = degerler.filter((d) => d > 0);
  const enAz = pozitif.length === 0 ? 1 : Math.min(...pozitif);
  const enCok = pozitif.length === 0 ? 10 : Math.max(...pozitif);
  const tum: number[] = [];
  for (let k = Math.floor(Math.log10(enAz)) - 1; k <= Math.ceil(Math.log10(enCok)) + 1; k += 1) tum.push(...basamaklar(k));
  const alt = [...tum].reverse().find((v) => v <= enAz) ?? tum[0]!;
  let ust = tum.find((v) => v >= enCok) ?? tum.at(-1)!;
  if (ust <= alt) ust = tum[tum.indexOf(alt) + 1]!;
  return { alt, ust, isaretler: tum.filter((v) => v >= alt && v <= ust) };
}
export const logYer = (v: number, alt: number, ust: number): number => (Math.log(v) - Math.log(alt)) / (Math.log(ust) - Math.log(alt));

// Süre kartının kalibre aralık cümlesi.
export function kalibreMetni(k: NonNullable<GeometriSureCevabi['kalibrasyon']>): string {
  const n = String(k.n);
  return k.genis
    ? `Kalibre aralık: ölçülmüş ${n} parçanın hepsi bu aralıkta kaldı (parça az, aralık geniş).`
    : `Kalibre aralık: ölçülmüş ${n} parçanın %80'i bu aralıkta kaldı.`;
}
