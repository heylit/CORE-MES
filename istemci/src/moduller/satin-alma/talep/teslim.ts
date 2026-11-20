// 3485 a: talep formunda "Teslimleri topla" ve kalemde "Teslimi böl" (saf). Tarih "YYYY-AA-GG" metnidir; hafta pazartesi başlar.

export type TopluDuzen = 'gunluk' | 'haftalik' | 'aylik' | 'herN' | 'tek';
export const TOPLU_DUZENLER: readonly [TopluDuzen, string][] = [
  ['gunluk', 'Günlük'], ['haftalik', 'Haftalık'], ['aylik', 'Aylık'], ['herN', 'Her N günde'], ['tek', 'Tek teslim'],
];
const GUN_MS = 86_400_000;
const ESIK = 1e-9;

// grup null: kalem toplanmaz (kartsız, bağlı, satış ya da fason kalemi, termini ya da miktarı okunamayan). Aynı grup: aynı malzeme, birim,
// emir ve kabul sınırı; yalnız bunlar birleşir ki kalemin bağı ve sınırı kaybolmasın.
export interface TopluKalem { anahtar: string; grup: string | null; termin: string; miktar: number | null }
export interface Birlesme { kalan: string; birlesenler: string[]; miktar: number; termin: string }

const gunNo = (t: string): number => Math.floor(Date.parse(`${t}T00:00:00Z`) / GUN_MS);
const haftaBasi = (t: string): number => { const g = gunNo(t); return g - ((new Date(g * GUN_MS).getUTCDay() + 6) % 7); };

export function donemAnahtari(duzen: TopluDuzen, n: number, ilk: string, termin: string): string {
  if (duzen === 'gunluk') return termin;
  if (duzen === 'haftalik') return String(haftaBasi(termin));
  if (duzen === 'aylik') return termin.slice(0, 7);
  if (duzen === 'tek') return '';
  return String(Math.floor((gunNo(termin) - gunNo(ilk)) / Math.max(1, Math.floor(n))));
}

const dortHane = (x: number): number => Math.round(x * 10_000) / 10_000;

// Toplama yalnız birleştirir: aynı gruptaki kalemler dönem başına tek kaleme iner. Kalan kalem dönemin en erken terminlisidir, termini o
// tarihtir (malzeme ihtiyaçtan önce gelsin); miktar toplamdır. Birleşecek kalem yoksa liste boştur.
export function toplamaPlani(l: readonly TopluKalem[], duzen: TopluDuzen, n: number): Birlesme[] {
  const gruplar = new Map<string, TopluKalem[]>();
  for (const k of l) {
    if (k.grup === null || k.termin === '' || k.miktar === null || !(k.miktar > ESIK)) continue;
    const g = gruplar.get(k.grup);
    if (g) g.push(k); else gruplar.set(k.grup, [k]);
  }
  const sonuc: Birlesme[] = [];
  for (const g of gruplar.values()) {
    const sirali = [...g].sort((a, b) => a.termin.localeCompare(b.termin));
    const ilk = sirali[0]!.termin;
    const donemler = new Map<string, TopluKalem[]>();
    for (const k of sirali) {
      const d = donemAnahtari(duzen, n, ilk, k.termin);
      const x = donemler.get(d);
      if (x) x.push(k); else donemler.set(d, [k]);
    }
    for (const x of donemler.values()) {
      if (x.length < 2) continue;
      sonuc.push({ kalan: x[0]!.anahtar, birlesenler: x.slice(1).map((k) => k.anahtar), miktar: dortHane(x.reduce((t, k) => t + (k.miktar ?? 0), 0)), termin: x[0]!.termin });
    }
  }
  return sonuc;
}

// Toplanabilen ve bölünebilen kalem: malzeme talebinde kartlı (ya da düzenlenen kartlı) kalem; bağlı, satış ve fason kalemi ile kabul
// sınırı hatalı kalem dışarıda. Grup anahtarı malzeme, birim, emir ve kabul sınırıdır. Düzenlenen kalem toplanmaz (biri formdan düşer,
// gönderimde silme olur); bölünebilir (mevcutDahil), çünkü bölmede kalem yerinde kalır.
export interface GrupKalemi {
  kart: { no: number; birim: string | null } | null; birim: string; malzemeNo: number | null; mevcut: { bagli: boolean } | null;
  satisSatiriId: number | null; isEmriId: number | null; kabulHatali: boolean; emirId: string; kabul: unknown;
}
export function teslimGrubu(tur: string, k: GrupKalemi, mevcutDahil = false): string | null {
  if (tur !== 'malzeme' || (k.mevcut !== null && !mevcutDahil) || k.mevcut?.bagli === true || k.satisSatiriId !== null || k.isEmriId !== null || k.kabulHatali) return null;
  const no = k.kart?.no ?? (k.mevcut !== null ? k.malzemeNo : null);
  return no === null ? null : `${String(no)}|${k.kart?.birim ?? k.birim}|${k.emirId}|${JSON.stringify(k.kabul)}`;
}

// Bölünen kalem: ilk satır kalemin kendisidir (düzenlenen kalemin kimliği yalnız onda kalır); diğerleri yeni anahtarlı, mevcut bağı
// olmayan kopyadır. Yayılımla kurulur ki sonradan eklenen kalem alanları da taşınsın.
export function bolunmusKalemler<K extends { anahtar: string; mevcut: unknown; kart: unknown; termin: string; miktar: string; adet: string }>(
  k: K, satirlar: readonly { termin: string; miktar: string }[], yeniAnahtar: () => string, kopyaKarti: (k: K) => K['kart'],
): K[] {
  return satirlar.map((s, i) => (i === 0
    ? { ...k, termin: s.termin, miktar: s.miktar, adet: '' }
    : { ...k, anahtar: yeniAnahtar(), mevcut: null, kart: kopyaKarti(k), termin: s.termin, miktar: s.miktar, adet: '' }));
}

// Teslimi böl: en az iki satır, her satırın termini ve sıfırdan büyük miktarı var, toplam kalemin miktarına eşit.
export interface BolmeSatiri { termin: string; miktar: number | null }
export function bolmeHatasi(toplam: number, l: readonly BolmeSatiri[], birim: string): string | null {
  if (l.length < 2) return 'En az iki teslim girin.';
  if (l.some((x) => x.termin === '')) return 'Her teslimin tarihini girin.';
  if (l.some((x) => x.miktar === null || !(x.miktar > ESIK))) return 'Her teslimin miktarı sıfırdan büyük olmalı.';
  const fark = dortHane(toplam - l.reduce((t, x) => t + (x.miktar ?? 0), 0));
  if (fark === 0) return null;
  const sayi = Math.abs(fark).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
  return `Toplam kalem miktarını tutmuyor: ${sayi} ${birim} ${fark > 0 ? 'eksik' : 'fazla'}. Miktarları düzeltin.`.replace(/\s+/g, ' ');
}

// Bölme penceresinin ilk hâli: kalemin termini ve miktarı, ikinci satır bir hafta sonra boş miktarla.
export function bolmeBaslangici(termin: string, miktar: string): { termin: string; miktar: string }[] {
  const sonra = termin === '' ? '' : new Date((gunNo(termin) + 7) * GUN_MS).toISOString().slice(0, 10);
  return [{ termin, miktar }, { termin: sonra, miktar: '' }];
}
