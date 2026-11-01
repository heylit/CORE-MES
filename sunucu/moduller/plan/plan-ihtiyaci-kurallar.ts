import { tesisGunu } from '#paylasilan/zaman.ts';

// Plan malzeme ihtiyacı (898 a, Dal 2), saf. Canlıya alınan planın açık emirlerinden satın alınacak malzeme eksiği: emrin kalan sarfı
// (brüt ihtiyaç eksi verilmiş net sarf) malzemeyi tüketen adımların canlı başlangıcına göre sıralanır, serbest stok en erken tüketime
// düşer; karşılanamayan miktar malzeme başına toplanır. Açık sipariş ve açık talep satın almanın kendi tablosudur, orada düşülür.
// 1542 a (1472 M2): rotası olan yarı mamul ve mamul bileşen önce kendi serbest stoğuyla aynı sırada netlenir; karşılanamayan miktar
// ürün ağacıyla (agaclar) yaprağa açılır ve açılan satın alınan malzeme aynı tüketim anıyla ihtiyaca eklenir (MRP raporuyla aynı kural).

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
  // Açılan ürün -> 1 adedi için yaprak malzeme miktarları; haritada olmayan ürün açılmaz.
  agaclar: ReadonlyMap<number, ReadonlyMap<number, number>>;
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

// Emir başına kalan tüketimler (brüt eksi verilmiş sarf); satın alınan malzeme ve ürün ayrı toplanır.
function tuketimleriTopla(g: Omit<IhtiyacGirdisi, 'agaclar'>): { tuketimler: Map<number, Tuketim[]>; urunler: Map<number, Tuketim[]> } {
  const tuketimler = new Map<number, Tuketim[]>();
  const urunler = new Map<number, Tuketim[]>();
  for (const e of g.emirler) {
    const satirlar = g.ihtiyaclar.get(e.id);
    if (!satirlar) continue;
    const malzeme = new Map<number, { brut: number; zaman: number }>();
    for (const s of satirlar) {
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
      const hedef = SATIN_ALINAN_TURLER.has(g.kartlar.get(no)?.tur ?? '') ? tuketimler : urunler;
      hedef.set(no, [...(hedef.get(no) ?? []), { emirNo: e.no, miktar: kalan, zaman: m.zaman }]);
    }
  }
  return { tuketimler, urunler };
}

// Serbest stok en erken tüketime düşer; karşılanamayan tüketimler sırasıyla döner.
function stoklaNetle(l: readonly Tuketim[], serbest: string | undefined): Tuketim[] {
  let stok = serbest === undefined ? 0 : Math.max(0, sayi(serbest));
  const acik: Tuketim[] = [];
  for (const t of [...l].sort((a, b) => a.zaman - b.zaman || a.emirNo.localeCompare(b.emirNo, 'tr'))) {
    const karsilanan = Math.min(stok, t.miktar);
    stok -= karsilanan;
    if (t.miktar - karsilanan > ESIK) acik.push({ ...t, miktar: t.miktar - karsilanan });
  }
  return acik;
}

// Açılacak ürünler ve stokla karşılanamayan toplamları: çağıran ağacı bu miktarla okur ve agaclar'ı ondan kurar.
export function acilacakUrunler(g: Omit<IhtiyacGirdisi, 'agaclar'>): Map<number, number> {
  const sonuc = new Map<number, number>();
  for (const [no, l] of tuketimleriTopla(g).urunler) {
    const toplam = stoklaNetle(l, g.serbest.get(no)).reduce((t, x) => t + x.miktar, 0);
    if (toplam > ESIK) sonuc.set(no, toplam);
  }
  return sonuc;
}

export function planIhtiyaclari(g: IhtiyacGirdisi): PlanIhtiyaci[] {
  const { tuketimler, urunler } = tuketimleriTopla(g);
  for (const [no, l] of urunler) {
    const agac = g.agaclar.get(no);
    if (agac === undefined) continue;
    for (const t of stoklaNetle(l, g.serbest.get(no))) {
      for (const [alt, birim] of agac) {
        if (!SATIN_ALINAN_TURLER.has(g.kartlar.get(alt)?.tur ?? '') || !(t.miktar * birim > ESIK)) continue;
        tuketimler.set(alt, [...(tuketimler.get(alt) ?? []), { ...t, miktar: t.miktar * birim }]);
      }
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
