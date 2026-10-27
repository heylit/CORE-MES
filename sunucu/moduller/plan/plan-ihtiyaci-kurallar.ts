import { tesisGunu } from '#paylasilan/zaman.ts';

// Plan malzeme ihtiyacı (898 a, Dal 2), saf. Canlıya alınan planın açık emirlerinden satın alınacak malzeme eksiği: emrin kalan sarfı
// (brüt ihtiyaç eksi verilmiş net sarf) malzemeyi tüketen adımların canlı başlangıcına göre sıralanır, serbest stok en erken tüketime
// düşer; karşılanamayan miktar malzeme başına toplanır. Açık sipariş ve açık talep satın almanın kendi tablosudur, orada düşülür.

// Satın alınan katalog türleri (eksik-stok-kurallar HAM_TURLER ile aynı küme): yarı mamul ve mamul üretilir, ihtiyacı satın almaya gitmez.
const SATIN_ALINAN_TURLER: ReadonlySet<string> = new Set(['hammadde', 'ticari_mal']);
const ESIK = 1e-9;
export const EN_COK_EMIR = 200;

export interface IhtiyacGirdisi {
  // Canlıya alınmış ve açık emirler.
  emirler: readonly { id: number; no: string }[];
  // Üretim emri -> adım malzemeleri (brüt, ondalık metin); ürünü olmayan emirde null.
  ihtiyaclar: ReadonlyMap<number, readonly { malzemeNo: number; opNo: number; brut: string }[] | null>;
  // Emre verilmiş net sarf (malzeme başına, ondalık metin).
  sarflar: readonly { emirId: number; malzemeId: number; miktar: string }[];
  // `${uretimEmriId}:${opNo}` -> adımın canlı plandaki başlangıcı (ms). Canlıda yeri olmayan adım yoktur.
  baslangiclar: ReadonlyMap<string, number>;
  kartlar: ReadonlyMap<number, { tur: string }>;
  // Stok kaydı olan kartın serbest miktarı; kaydı olmayan kart haritada yoktur (stoku bilinmiyor, sıfır sayılır).
  serbest: ReadonlyMap<number, string>;
}

export interface PlanIhtiyaci {
  malzemeNo: number;
  // Stokla karşılanamayan miktar, kartın stok biriminde, dört haneye yuvarlanmış.
  miktar: number;
  // Stoğun karşılamadığı ilk tüketimin tesis günü.
  gerekenTarih: string;
  // Eksiği olan emirler, tüketim sırasıyla; en çok EN_COK_EMIR (satın almanın tablosu sınırı).
  emirler: string[];
  stokBilinmiyor: boolean;
}

interface Tuketim { emirNo: string; miktar: number; zaman: number }

const sayi = (m: string): number => { const n = Number(m); return Number.isFinite(n) ? n : 0; };
const yuvarla = (n: number): number => Math.round(n * 10_000) / 10_000;

export function planIhtiyaclari(g: IhtiyacGirdisi): PlanIhtiyaci[] {
  const tuketimler = new Map<number, Tuketim[]>();
  for (const e of g.emirler) {
    const satirlar = g.ihtiyaclar.get(e.id);
    if (!satirlar) continue;
    const malzeme = new Map<number, { brut: number; zaman: number }>();
    for (const s of satirlar) {
      if (!SATIN_ALINAN_TURLER.has(g.kartlar.get(s.malzemeNo)?.tur ?? '')) continue;
      const m = malzeme.get(s.malzemeNo) ?? { brut: 0, zaman: Infinity };
      m.brut += sayi(s.brut);
      m.zaman = Math.min(m.zaman, g.baslangiclar.get(`${e.id}:${s.opNo}`) ?? Infinity);
      malzeme.set(s.malzemeNo, m);
    }
    for (const [no, m] of malzeme) {
      // Tüketen adımlarından hiçbiri canlı planda değilse ihtiyaç plandan gelmez.
      if (!Number.isFinite(m.zaman)) continue;
      const verilen = g.sarflar.filter((x) => x.emirId === e.id && x.malzemeId === no).reduce((t, x) => t + sayi(x.miktar), 0);
      const kalan = m.brut - verilen;
      if (kalan <= ESIK) continue;
      const l = tuketimler.get(no) ?? [];
      l.push({ emirNo: e.no, miktar: kalan, zaman: m.zaman });
      tuketimler.set(no, l);
    }
  }
  const sonuc: PlanIhtiyaci[] = [];
  for (const [no, l] of tuketimler) {
    l.sort((a, b) => a.zaman - b.zaman || a.emirNo.localeCompare(b.emirNo, 'tr'));
    const kayit = g.serbest.get(no);
    let stok = kayit === undefined ? 0 : Math.max(0, sayi(kayit));
    let eksik = 0;
    let ilk: number | null = null;
    const emirler: string[] = [];
    for (const t of l) {
      const karsilanan = Math.min(stok, t.miktar);
      stok -= karsilanan;
      const kalan = t.miktar - karsilanan;
      if (kalan <= ESIK) continue;
      eksik += kalan;
      ilk ??= t.zaman;
      if (emirler.length < EN_COK_EMIR && !emirler.includes(t.emirNo)) emirler.push(t.emirNo);
    }
    if (ilk === null || yuvarla(eksik) <= 0) continue;
    sonuc.push({ malzemeNo: no, miktar: yuvarla(eksik), gerekenTarih: tesisGunu(ilk), emirler, stokBilinmiyor: kayit === undefined });
  }
  return sonuc.sort((a, b) => a.gerekenTarih.localeCompare(b.gerekenTarih) || a.malzemeNo - b.malzemeNo);
}
