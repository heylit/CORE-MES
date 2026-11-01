import { tesisGunu } from '#paylasilan/zaman.ts';

// 1472 M1: malzeme ihtiyaç raporu (brüt ve net), saf; yazmaz. Açık emirlerin kalan ihtiyacı (brüt eksi verilmiş net sarf) zamana göre
// sıralanır; serbest stok en erken tüketime, açık satın alma siparişi gelişi ihtiyaç gününden önce ya da aynı gün olan tüketime düşer.
// Rotası olan yarı mamul ve mamul bileşen önce kendi stoğu ve gelişiyle netlenir; karşılanamayan miktar ağacıyla (rota ürün ağacı)
// hammaddeye açılır. Ara katmanlar ayrıca netlenmez: ağaç yaprağa kadar brüt açılır. Stok kaydı olmayan malzemede net bilinmez (null);
// açılımda böyle bir yarı mamulün stoğu yok sayılır, yani tamamı üretilecek gibi açılır.
// 1543 a (M3): emniyet stoğu stoğun kritik seviyesidir. Tüketimlerden sonra kalan stok ve kullanılmayan açık sipariş kritik seviyenin
// altındaysa fark net ihtiyaca eklenir. Emniyet payı ağaçla açılmaz ve yalnız ihtiyacı olan malzemenin satırında görünür.

// Satın alınan katalog türleri (plan-ihtiyaci-kurallar ile aynı küme); bunlar açılmaz.
const SATIN_ALINAN_TURLER: ReadonlySet<string> = new Set(['hammadde', 'ticari_mal']);
const ESIK = 1e-9;

export interface MrpGirdisi {
  // Açık emirler; baslama: emrin başladığı an (ms), başlamamışta null.
  emirler: readonly { id: number; no: string; baslama: number | null }[];
  // Üretim emri -> adım malzemeleri (brüt, ondalık metin); ürünü olmayan emirde null.
  ihtiyaclar: ReadonlyMap<number, readonly { malzemeNo: number; opNo: number; brut: string }[] | null>;
  // Emre verilmiş net sarf (malzeme başına, ondalık metin).
  sarflar: readonly { emirId: number; malzemeId: number; miktar: string }[];
  // `${uretimEmriId}:${opNo}` -> adımın canlı plandaki başlangıcı (ms).
  baslangiclar: ReadonlyMap<string, number>;
  kartlar: ReadonlyMap<number, { tur: string }>;
  // Stok kaydı olan kartın serbest miktarı; kaydı olmayan kart haritada yoktur (stoku bilinmiyor).
  serbest: ReadonlyMap<number, string>;
  // Kritik seviye (emniyet stoğu); tanımsız kart haritada yoktur.
  kritik: ReadonlyMap<number, string>;
  // Açık satın alma siparişlerinin kalan miktarı ve beklenen teslim günü (tarihsiz olabilir). null: okuyan satın almayı göremez (1545 a);
  // açık sipariş ve net bilinmez sayılır.
  gelisler: ReadonlyMap<number, readonly { tarih: string | null; miktar: string }[]> | null;
  // Açılan ürün -> 1 adedi için yaprak malzeme miktarları. Haritada olmayan ürün açılmaz (rotası yok ya da satın alınır).
  agaclar: ReadonlyMap<number, ReadonlyMap<number, number>>;
}

export interface MrpSatiri {
  malzemeNo: number;
  // Kalan brüt ihtiyaç (verilmiş sarf düşülmüş), dört haneye yuvarlanmış.
  brut: number;
  // Serbest stok; stok kaydı yoksa null.
  serbest: number | null;
  // Açık satın alma siparişlerinin kalan toplamı (geliş günü ne olursa olsun); satın alma görünmüyorsa null.
  acikSiparis: number | null;
  // Stok ve zamanında gelen siparişle karşılanamayan miktar; stok ya da satın alma bilinmiyorsa null.
  net: number | null;
  // Net ihtiyaca eklenen emniyet payı; kritik seviye tanımsızsa ya da stok bilinmiyorsa null.
  emniyetPayi: number | null;
  // İlk tüketimin tesis günü; tüketen adım planda değilse ve emir başlamamışsa null.
  ihtiyacTarihi: string | null;
  // Karşılanamayan ilk tüketimin tesis günü; eksik yoksa ya da günü bilinmiyorsa null.
  eksikTarihi: string | null;
  emirler: string[];
  // Bu satırın ihtiyacını doğuran açılmış ürünler (doğrudan emirden gelen ihtiyaçta boş).
  acilanlar: number[];
  // Ürün ağacıyla açıldı: net miktar alt malzemelere dağıtıldı.
  acildi: boolean;
}

interface Talep { malzemeNo: number; miktar: number; zaman: number | null; emirNo: string; acilan: number | null }
interface Netleme { satir: MrpSatiri; acik: Talep[] }

const sayi = (m: string): number => { const n = Number(m); return Number.isFinite(n) ? n : 0; };
const yuvarla = (n: number): number => Math.round(n * 10_000) / 10_000;
const zamanSirasi = (a: Talep, b: Talep): number =>
  (a.zaman ?? Infinity) - (b.zaman ?? Infinity) || a.emirNo.localeCompare(b.emirNo, 'tr');

function brutTalepler(g: MrpGirdisi): Talep[] {
  const l: Talep[] = [];
  for (const e of g.emirler) {
    const satirlar = g.ihtiyaclar.get(e.id);
    if (!satirlar) continue;
    const malzeme = new Map<number, { brut: number; zaman: number | null }>();
    for (const s of satirlar) {
      const m = malzeme.get(s.malzemeNo) ?? { brut: 0, zaman: null };
      m.brut += sayi(s.brut);
      const z = g.baslangiclar.get(`${e.id}:${s.opNo}`) ?? e.baslama;
      if (z !== null) m.zaman = Math.min(m.zaman ?? Infinity, z);
      malzeme.set(s.malzemeNo, m);
    }
    for (const [no, m] of malzeme) {
      const verilen = g.sarflar.filter((x) => x.emirId === e.id && x.malzemeId === no).reduce((t, x) => t + sayi(x.miktar), 0);
      const kalan = m.brut - verilen;
      if (kalan > ESIK) l.push({ malzemeNo: no, miktar: kalan, zaman: m.zaman, emirNo: e.no, acilan: null });
    }
  }
  return l;
}

// Tek malzemenin talepleri: stok önce, sonra geliş günü tüketim gününden sonra olmayan sipariş. Günü bilinmeyen tüketime her geliş düşer;
// tarihsiz geliş yalnız günü bilinmeyen tüketime düşer.
function netle(malzemeNo: number, talepler: readonly Talep[], g: MrpGirdisi, acildi: boolean): Netleme {
  const sirali = [...talepler].sort(zamanSirasi);
  const kayit = g.serbest.get(malzemeNo);
  let stok = kayit === undefined ? 0 : Math.max(0, sayi(kayit));
  const gelis = (g.gelisler?.get(malzemeNo) ?? []).map((x) => ({ tarih: x.tarih, kalan: Math.max(0, sayi(x.miktar)) }))
    .sort((a, b) => (a.tarih ?? '9999-12-31').localeCompare(b.tarih ?? '9999-12-31'));
  const acikSiparis = gelis.reduce((t, x) => t + x.kalan, 0);
  let eksik = 0;
  let eksikZaman: number | null | undefined;
  const acik: Talep[] = [];
  for (const t of sirali) {
    let kalan = t.miktar;
    const k = Math.min(stok, kalan);
    stok -= k;
    kalan -= k;
    const gun = t.zaman === null ? null : tesisGunu(t.zaman);
    for (const x of gelis) {
      if (kalan <= ESIK) break;
      if (gun !== null && (x.tarih === null || x.tarih > gun)) continue;
      const y = Math.min(x.kalan, kalan);
      x.kalan -= y;
      kalan -= y;
    }
    if (kalan <= ESIK) continue;
    eksik += kalan;
    if (eksikZaman === undefined) eksikZaman = t.zaman;
    acik.push({ ...t, miktar: kalan });
  }
  const kritik = g.kritik.get(malzemeNo);
  const emniyetPayi = kayit === undefined || kritik === undefined || g.gelisler === null
    ? null
    : Math.max(0, sayi(kritik) - stok - gelis.reduce((t, x) => t + x.kalan, 0));
  const ilk = sirali[0]?.zaman ?? null;
  const emirler: string[] = [];
  for (const t of sirali) if (!emirler.includes(t.emirNo)) emirler.push(t.emirNo);
  const acilanlar = [...new Set(sirali.flatMap((t) => (t.acilan === null ? [] : [t.acilan])))].sort((a, b) => a - b);
  return {
    satir: {
      malzemeNo,
      brut: yuvarla(sirali.reduce((t, x) => t + x.miktar, 0)),
      serbest: kayit === undefined ? null : yuvarla(sayi(kayit)),
      acikSiparis: g.gelisler === null ? null : yuvarla(acikSiparis),
      net: kayit === undefined || g.gelisler === null ? null : yuvarla(eksik + (emniyetPayi ?? 0)),
      emniyetPayi: emniyetPayi === null ? null : yuvarla(emniyetPayi),
      ihtiyacTarihi: ilk === null ? null : tesisGunu(ilk),
      eksikTarihi: eksikZaman === undefined || eksikZaman === null ? null : tesisGunu(eksikZaman),
      emirler, acilanlar, acildi,
    },
    acik,
  };
}

const grupla = (l: readonly Talep[]): Map<number, Talep[]> => {
  const m = new Map<number, Talep[]>();
  for (const t of l) m.set(t.malzemeNo, [...(m.get(t.malzemeNo) ?? []), t]);
  return m;
};

const acilirMi = (g: Pick<MrpGirdisi, 'kartlar'>, malzemeNo: number): boolean => {
  const tur = g.kartlar.get(malzemeNo)?.tur;
  return tur !== undefined && !SATIN_ALINAN_TURLER.has(tur);
};

// Açılacak ürünler ve karşılanamayan toplamları: çağıran ağacı bu miktarla okur (yuvarlama payı küçük kalır), agaclar'ı ondan kurar.
export function acilacakUrunler(g: Omit<MrpGirdisi, 'agaclar'>): Map<number, number> {
  const sonuc = new Map<number, number>();
  for (const [no, l] of grupla(brutTalepler({ ...g, agaclar: new Map() }))) {
    if (!acilirMi(g, no)) continue;
    const toplam = netle(no, l, { ...g, agaclar: new Map() }, true).acik.reduce((t, x) => t + x.miktar, 0);
    if (toplam > ESIK) sonuc.set(no, toplam);
  }
  return sonuc;
}

export function mrpSatirlari(g: MrpGirdisi): MrpSatiri[] {
  const satirlar: MrpSatiri[] = [];
  const yapraklar: Talep[] = [];
  for (const [no, l] of grupla(brutTalepler(g))) {
    const agac = acilirMi(g, no) ? g.agaclar.get(no) : undefined;
    if (agac === undefined) { yapraklar.push(...l); continue; }
    const n = netle(no, l, g, true);
    satirlar.push(n.satir);
    for (const t of n.acik) {
      for (const [alt, birim] of agac) {
        const miktar = t.miktar * birim;
        if (miktar > ESIK) yapraklar.push({ malzemeNo: alt, miktar, zaman: t.zaman, emirNo: t.emirNo, acilan: no });
      }
    }
  }
  for (const [no, l] of grupla(yapraklar)) satirlar.push(netle(no, l, g, false).satir);
  return satirlar.sort((a, b) =>
    (a.eksikTarihi ?? '9999-12-31').localeCompare(b.eksikTarihi ?? '9999-12-31')
    || (a.ihtiyacTarihi ?? '9999-12-31').localeCompare(b.ihtiyacTarihi ?? '9999-12-31')
    || a.malzemeNo - b.malzemeNo);
}
