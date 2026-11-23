// 3593: alternatif kartının tek satır özeti ("6082 ya da 6061 · T6 · işlem yok · Ø 40–45 (−0/+5) · boy birebir 3000"). Malzeme kartı,
// talep şeridi, satın alma merkezi ve teklif formu aynı metni bu kuraldan üretir. Saf; sözleşme şemasına bağlı değil.
export type OzetKipi = 'birebir' | 'pay' | 'aralik' | null;
export interface OzetNiteligi {
  nitelik: string; kip: OzetKipi; degerler: readonly string[] | null; alt: number | null; ust: number | null; payAlt: number | null; payUst: number | null;
}
export interface OzetAnaKarti {
  form: string | null; kalite: string | null; durum: string | null; yuzey: string | null;
  standartlar: readonly string[]; islemler: readonly string[]; olcu: Readonly<Record<string, number>>;
}

const LISTE_SIRASI = ['form', 'kalite', 'durum', 'islem', 'yuzey', 'standart'] as const;
const LISTE_ADI: Readonly<Record<(typeof LISTE_SIRASI)[number], string>> = { form: 'form', kalite: 'kalite', durum: 'durum', islem: 'işlem', yuzey: 'yüzey', standart: 'std' };
const OLCU_SIRASI = ['d', 's', 'a', 'b', 't', 'D', 'h', 'l'] as const;
const OLCU_ETIKETI: Readonly<Record<string, string>> = { d: 'Ø', l: 'boy' };
const sayi = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 3 });

export const olcuEtiketi = (k: string): string => OLCU_ETIKETI[k] ?? k;

function anaListesi(a: OzetAnaKarti, n: (typeof LISTE_SIRASI)[number]): readonly string[] {
  if (n === 'standart') return a.standartlar;
  if (n === 'islem') return a.islemler;
  const v = a[n];
  return v === null ? [] : [v];
}

function listeParcasi(x: OzetNiteligi, ana: OzetAnaKarti | null, formAdi: (f: string) => string): string {
  const n = x.nitelik as (typeof LISTE_SIRASI)[number];
  const degerler = x.kip === 'birebir' ? (ana === null ? null : anaListesi(ana, n)) : x.degerler ?? [];
  const ad = (d: string) => (n === 'form' ? formAdi(d) : d);
  if (n === 'islem') {
    if (degerler === null) return 'işlem birebir';
    if (degerler.length === 0) return 'işlem yok';
    return `işlem ${degerler.map(ad).join(' + ')}`;
  }
  if (degerler === null) return `${LISTE_ADI[n]} birebir`;
  if (degerler.length === 0) return `${LISTE_ADI[n]} yok`;
  const on = n === 'yuzey' || n === 'standart' ? `${LISTE_ADI[n]} ` : '';
  return `${on}${degerler.map(ad).join(' ya da ')}`;
}

function olcuParcasi(x: OzetNiteligi, ana: OzetAnaKarti | null): string {
  const e = olcuEtiketi(x.nitelik);
  const a = ana?.olcu[x.nitelik];
  if (x.kip === 'birebir') return a === undefined ? `${e} birebir` : `${e} birebir ${sayi(a)}`;
  if (x.kip === 'pay') {
    const p = `(−${sayi(x.payAlt ?? 0)}/+${sayi(x.payUst ?? 0)})`;
    return a === undefined ? `${e} ${p}` : `${e} ${sayi(a - (x.payAlt ?? 0))}–${sayi(a + (x.payUst ?? 0))} ${p}`;
  }
  if (x.alt !== null && x.ust !== null) return `${e} ${sayi(x.alt)}–${sayi(x.ust)}`;
  if (x.alt !== null) return `${e} en az ${sayi(x.alt)}`;
  return `${e} en çok ${sayi(x.ust ?? 0)}`;
}

// Serbest nitelik yazılmaz; işlem istisnadır (eski kartlarda işlem satırı yoktur ve "serbest" görünmeli).
export function alternatifOzeti(n: readonly OzetNiteligi[], ana: OzetAnaKarti | null, formAdi: (f: string) => string = (f) => f): string[] {
  const bul = (k: string) => n.find((x) => x.nitelik === k);
  const parca: string[] = [];
  for (const k of LISTE_SIRASI) {
    const x = bul(k);
    if (x) parca.push(listeParcasi(x, ana, formAdi));
    else if (k === 'islem') parca.push('işlem serbest');
  }
  for (const k of OLCU_SIRASI) {
    const x = bul(k);
    if (x) parca.push(olcuParcasi(x, ana));
  }
  return parca;
}
