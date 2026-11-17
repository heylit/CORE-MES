import type { GeometriKalibrasyonCevabi, GeometriSureCevabi, GeometriSureKatsayisi } from '#paylasilan/sozlesme/geometri.ts';
import { ISO_ADI } from './gorunum.ts';

// Süre kalibrasyonu (3321-3) ekran kuralları: aşama satırları, eğri noktaları ve log ölçek. Hesap sunucudadır; burada yalnız gösterim.
type Asama = GeometriKalibrasyonCevabi['asama'];
export type KalibrasyonParcasi = GeometriKalibrasyonCevabi['parcalar'][number];
export type GrupTuru = GeometriKalibrasyonCevabi['gruplar'][number]['tur'];

export const ASAMA_ADI: Readonly<Record<Asama, string>> = { kalibresiz: 'Başlangıç (kaynaklı)', tek: 'Tek çarpan', grup: 'Grup ve tezgâh çarpanı', regresyon: 'Kalem kalem uyum' };
const ASAMA_SIRASI: readonly Asama[] = ['kalibresiz', 'tek', 'grup', 'regresyon'];
export const GRUP_TURU_ADI: Readonly<Record<GrupTuru, string>> = { malzeme: 'Malzeme', tezgah: 'Tezgâh', islem: 'İşlem', geometri: 'Geometri' };

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
  tur === 'malzeme' && Object.hasOwn(ISO_ADI, anahtar) ? `${anahtar} · ${ISO_ADI[anahtar as keyof typeof ISO_ADI]}`
    : tur === 'geometri' && Object.hasOwn(GEOMETRI_TIPI_ADI, anahtar) ? GEOMETRI_TIPI_ADI[anahtar as GeometriTipi] : anahtar;

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

// ---- Başlangıç katsayıları (3363) ----
type GeometriTipi = NonNullable<GeometriSureCevabi['onsel']>['tip'];
type Ra = NonNullable<GeometriSureCevabi['onsel']>['tasarim']['ra'];
type Tolerans = NonNullable<GeometriSureCevabi['onsel']>['tasarim']['tolerans'];
export const GEOMETRI_TIPI_ADI: Readonly<Record<GeometriTipi, string>> = { donel: 'Dönel', prizmatik: 'Prizmatik', plaka: 'Plaka' };
export const RA_SECENEKLERI: readonly Ra[] = ['6.3', '3.2', '1.6', '0.8', '0.4'];
export const raMetni = (ra: string): string => ra.replace('.', ',');
export const TOLERANS_ADI: Readonly<Record<Tolerans, string>> = { genel: 'Genel ±0,1', hassas: 'Hassas ±0,05', 'cok-hassas': 'Çok hassas ±0,02', ultra: 'Ultra ±0,01' };
export const TOLERANS_SECENEKLERI: readonly Tolerans[] = ['genel', 'hassas', 'cok-hassas', 'ultra'];
const BANT_ADI: Readonly<Record<string, string>> = {
  'delik.kisa': 'L/D ≤ 3', 'delik.orta': 'L/D 3–5', 'delik.derin': 'L/D > 5', 'delik.karma': 'L/D karma',
  'cidar.ince': 'İnce cidar < 3 mm', 'cidar.orta': 'Cidar 3–6 mm', 'kesme.pay': 'Kesme payı',
  'tutma.0': '< 0,2 kg', 'tutma.1': '< 5 kg', 'tutma.2': '< 15 kg', 'tutma.3': '< 25 kg', 'tutma.4': '25 kg ve üstü',
};
// Katsayının kısa adı (sınıf adları Malzemeler tablosundan; bilinmezse anahtar).
export function katsayiAdi(anahtar: string, sinifAdlari: ReadonlyMap<string, string> = new Map()): string {
  const [tur, ad = '', ...kalan] = anahtar.split('.');
  if (tur === 'malzeme') { const s = kalan.join('.'); return `${sinifAdlari.get(s) ?? s} ${ad === 'kaba' ? 'kaba' : 'finiş'}`; }
  if (tur === 'yuzey') return `Ra ${raMetni(anahtar.slice(6))}`;
  if (tur === 'tolerans') return TOLERANS_ADI[ad as Tolerans] ?? ad;
  if (tur === 'geometri') return GEOMETRI_TIPI_ADI[ad as GeometriTipi] ?? ad;
  return BANT_ADI[anahtar] ?? anahtar;
}

// Katsayılar sekmesinin satırları: malzeme sınıfının kaba ve finişi tek satır; tasarım ve geometri türleri tür başına tek satır;
// kesme payı tek. Satırın elle değişen değeri varsa satır "elle" sayılır; kaynak satırdaki en zayıf kaynaktır (tahmin > kaynaklı).
export interface KatsayiSatiri {
  kimlik: string; baslik: string; iso: string | null; katsayilar: GeometriSureKatsayisi[];
  kaynak: 'kaynakli' | 'tahmin' | 'elle'; dayanak: string; not: string | null;
}
export const KATSAYI_BOLUMLERI = [
  { kimlik: 'malzeme', baslik: 'Malzeme', turler: ['malzeme'] },
  { kimlik: 'tasarim', baslik: 'Tasarım', turler: ['yuzey', 'tolerans', 'delik'] },
  { kimlik: 'geometri', baslik: 'Geometri ve kesme dışı', turler: ['geometri', 'cidar', 'kesme', 'tutma'] },
] as const;
const TUR_BASLIGI: Readonly<Record<string, string>> = {
  yuzey: 'Yüzey (finiş)', tolerans: 'Tolerans (finiş, delik)', delik: 'Delik derinliği', geometri: 'Geometri tipi',
  cidar: 'İnce cidar (2 × hacim / alan)', kesme: 'Kesme payı (çevrim içinde)', tutma: 'Bağlama başına tutma (dk)',
};
export function katsayiSatirlari(l: readonly GeometriSureKatsayisi[], turler: readonly string[], sinifAdlari: ReadonlyMap<string, string>): KatsayiSatiri[] {
  const gruplar = new Map<string, GeometriSureKatsayisi[]>();
  for (const k of l) {
    if (!turler.includes(k.tur)) continue;
    const kimlik = k.tur === 'malzeme' ? `malzeme:${k.anahtar.split('.').slice(2).join('.')}` : k.tur;
    gruplar.set(kimlik, [...(gruplar.get(kimlik) ?? []), k]);
  }
  return [...gruplar.entries()].map(([kimlik, ks]) => {
    const elle = ks.find((k) => k.elle !== null)?.elle ?? null;
    const sinif = kimlik.startsWith('malzeme:') ? kimlik.slice(8) : null;
    return {
      kimlik, iso: ks[0]?.iso ?? null, katsayilar: ks,
      baslik: sinif === null ? TUR_BASLIGI[kimlik] ?? kimlik : sinifAdlari.get(sinif) ?? sinif,
      kaynak: elle !== null ? 'elle' : ks.some((k) => k.kaynak === 'tahmin') ? 'tahmin' : 'kaynakli',
      dayanak: [...new Set(ks.map((k) => k.dayanak))].join('; '), not: elle?.not ?? null,
    };
  });
}

// Ölçümün başlangıç katsayısından ayrıldığı grup: grup çarpanı 1'den %25'ten fazla uzaksa güncelleme önerilir (yeni = eski x çarpan).
// Malzeme satırı sınıfının ISO grubuna (kalibrasyonun malzeme grubu, aynı ISO'daki bütün sınıflar), geometri tipi kendi grubuna bakar.
export const OLCUM_FARKI_ESIGI = 1.25;
export interface OlcumFarki { grup: string; carpan: number; n: number; yeni: { anahtar: string; deger: number }[] }
export function olcumFarki(satir: KatsayiSatiri, gruplar: GeometriKalibrasyonCevabi['gruplar']): OlcumFarki | null {
  const uzak = (c: number): boolean => Math.abs(Math.log(c)) > Math.log(OLCUM_FARKI_ESIGI);
  const yuvarla = (x: number): number => Math.round(x * 100) / 100;
  if (satir.iso !== null) {
    const g = gruplar.find((x) => x.tur === 'malzeme' && x.anahtar === satir.iso);
    if (g === undefined || !uzak(g.carpan)) return null;
    return { grup: grupAdi('malzeme', g.anahtar), carpan: g.carpan, n: g.n, yeni: satir.katsayilar.map((k) => ({ anahtar: k.anahtar, deger: yuvarla(k.deger * g.carpan) })) };
  }
  if (satir.kimlik !== 'geometri') return null;
  const yeni = satir.katsayilar.flatMap((k) => {
    const g = gruplar.find((x) => x.tur === 'geometri' && `geometri.${x.anahtar}` === k.anahtar);
    return g !== undefined && uzak(g.carpan) ? [{ anahtar: k.anahtar, deger: yuvarla(k.deger * g.carpan), g }] : [];
  });
  const ilk = yeni[0];
  if (ilk === undefined) return null;
  return { grup: grupAdi('geometri', ilk.g.anahtar), carpan: ilk.g.carpan, n: ilk.g.n, yeni: yeni.map(({ anahtar, deger }) => ({ anahtar, deger })) };
}
