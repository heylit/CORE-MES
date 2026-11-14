// 2319 (2311 S7): canlı plan "bayat" işareti. Yalnız işarettir: plan değişmez, yeniden planlama planlamacının işidir. Saf.
// Olay son canlıya almadan sonra olmuşsa sayılır; canlıya alma işareti kendiliğinden sıfırlar. Canlı plan yoksa bayatlık yoktur.
// Hangi olay sayılır (VARSAYIM, 2319): emir bitti, emrin canlıda o andan sonra biten satırı varken (plan hâlâ ona yer ayırıyor, erken bitti);
// fason dönüşü, emir canlıdaysa; makine duruşu, makine arıza ya da bakıma son canlıya almadan sonra geçmiş ve canlıda bitmemiş işi varsa.
// rota-degisti (2327-1 a): emrin adımı eklendi ya da değişti ve emir canlıdaysa; olayı uretim-emirleri yayınlar (2319d).
// adim-bitti (B-2499-12): emir bitmeden bir adımı bitti ve canlıda o adımın o andan sonra biten satırı var (adım erken bitti).
// emir-iptal (2732): emir iptal edildi ya da arşive alındı ve emir canlıdaysa; plan iptal emrin yerini ayırmaz, tezgâhta boşluk kalır.
// satin-alma-termini (3256-1): açık siparişin gelişi (günü, kalanı) ya da elle tedarik termini değişti ve o malzemeyi kullanan adım canlıda
// henüz bitmedi; plan malzemenin geliş gününe göre bekletir (VARSAYIM: stok yetse de işaretlenir, stok okunmaz).

export const BAYAT_NEDENLERI = ['emir-bitti', 'fason-donusu', 'durus', 'rota-degisti', 'adim-bitti', 'emir-iptal', 'satin-alma-termini'] as const;
export type BayatNedeni = (typeof BAYAT_NEDENLERI)[number];
export const BAYAT_OLAY_EN_COK = 20;

export interface BayatOlayi {
  neden: BayatNedeni;
  zaman: string;
  uretimEmriId: number | null;
  emirNo: string | null;
  makineId: number | null;
  makineKod: string | null;
}
export interface PlanBayatligi {
  bayat: boolean;
  sonCanliyaAlma: string | null;
  sayilar: Record<BayatNedeni, number>;
  // Yeniden eskiye, en çok BAYAT_OLAY_EN_COK.
  olaylar: BayatOlayi[];
}

export function bayatOzeti(sonCanliyaAlma: string | null, olaylar: readonly BayatOlayi[]): PlanBayatligi {
  const sayilar = Object.fromEntries(BAYAT_NEDENLERI.map((n) => [n, 0])) as Record<BayatNedeni, number>;
  const gecerli = sonCanliyaAlma === null ? [] : olaylar.filter((o) => Date.parse(o.zaman) > Date.parse(sonCanliyaAlma));
  for (const o of gecerli) sayilar[o.neden] += 1;
  const sirali = [...gecerli].sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman));
  return { bayat: gecerli.length > 0, sonCanliyaAlma, sayilar, olaylar: sirali.slice(0, BAYAT_OLAY_EN_COK) };
}

export interface MakineDurumuOzeti { makineId: number; durum: string; degisme: string }
// Son canlıya almadan sonra arıza ya da bakıma geçmiş ve canlıda bitmemiş işi olan makineler.
export function bayatDuruslar(durumlar: readonly MakineDurumuOzeti[], sonCanliyaAlma: string, canliMakineler: ReadonlySet<number>): MakineDurumuOzeti[] {
  return durumlar.filter((d) => d.durum !== 'calisir' && Date.parse(d.degisme) > Date.parse(sonCanliyaAlma) && canliMakineler.has(d.makineId));
}

// 3256-1: gelişi değişen malzemeyi canlıda bitmemiş adımında kullanan emirler (sıralı, tekil).
export function terminEtkiledigiEmirler(
  bitmemisAdimlar: readonly { uretimEmriId: number; opNo: number }[],
  ihtiyaclar: ReadonlyMap<number, readonly { malzemeNo: number; opNo: number }[] | null>,
  malzemeNolar: readonly number[],
): number[] {
  const aranan = new Set(malzemeNolar);
  const acik = new Set(bitmemisAdimlar.map((a) => `${String(a.uretimEmriId)}:${String(a.opNo)}`));
  const sonuc = new Set<number>();
  for (const [emirId, l] of ihtiyaclar) {
    if ((l ?? []).some((m) => aranan.has(m.malzemeNo) && acik.has(`${String(emirId)}:${String(m.opNo)}`))) sonuc.add(emirId);
  }
  return [...sonuc].sort((a, b) => a - b);
}
