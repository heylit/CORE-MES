// Senaryo yolları ve yazma gövdeleri yer tutucu taşıyabilir; her istekte sanal kişinin bağlamıyla doldurulur.
//   {uuid}            her doldurmada yeni kimlik
//   {simdi}           şimdiki zaman (ms)
//   {simdi-<sn>}      şu kadar saniye önce (ms); örnek {simdi-604800} bir hafta önce
//   {kaynak}          sanal kişiye özgü kaynak adı (terminal ileti kanalı gibi)
//   {istasyon.<alan>} kişiye düşen istasyonun alanı (id, kod, emirId, emirNo)
// Bilinmeyen yer tutucu sessizce bırakılmaz: koşu başlamadan durur.

export type Istasyon = Readonly<Record<string, string | number>>;

export interface SablonBaglami {
  simdiMs: number;
  kaynak: string;
  istasyon: Istasyon | null;
  uuid: () => string;
}

const YER_TUTUCU = /\{([A-Za-z]+(?:\.[A-Za-z]+)?(?:-\d+)?)\}/g;
const TEK_YER_TUTUCU = /^\{([A-Za-z]+(?:\.[A-Za-z]+)?(?:-\d+)?)\}$/;

function deger(ad: string, b: SablonBaglami): string | number {
  if (ad === 'uuid') return b.uuid();
  if (ad === 'simdi') return b.simdiMs;
  const once = /^simdi-(\d+)$/.exec(ad);
  if (once !== null) return b.simdiMs - Number(once[1]) * 1000;
  if (ad === 'kaynak') return b.kaynak;
  if (ad.startsWith('istasyon.')) {
    if (b.istasyon === null) throw new Error(`{${ad}} istasyon ister: senaryoda "istasyonlar" yok ya da boş.`);
    const alan = b.istasyon[ad.slice('istasyon.'.length)];
    if (alan === undefined) throw new Error(`İstasyonda ${ad.slice('istasyon.'.length)} alanı yok.`);
    return alan;
  }
  throw new Error(`Bilinmeyen yer tutucu: {${ad}}`);
}

// Yolda değer adres kodlamasıyla girer: istasyon kodu ya da emir no sorgu dizgesini bozmasın.
export function yolDoldur(yol: string, b: SablonBaglami): string {
  return yol.replace(YER_TUTUCU, (_, ad: string) => encodeURIComponent(String(deger(ad, b))));
}

// Gövdede yalnız tek yer tutucudan oluşan metin değerin kendi türünü alır ({simdi} sayı olur); karışık metin metin kalır.
export function govdeDoldur(govde: unknown, b: SablonBaglami): unknown {
  if (typeof govde === 'string') {
    const tek = TEK_YER_TUTUCU.exec(govde);
    if (tek?.[1] !== undefined) return deger(tek[1], b);
    return govde.replace(YER_TUTUCU, (_, ad: string) => String(deger(ad, b)));
  }
  if (Array.isArray(govde)) return govde.map((x) => govdeDoldur(x, b));
  if (govde !== null && typeof govde === 'object') {
    return Object.fromEntries(Object.entries(govde).map(([k, v]) => [k, govdeDoldur(v, b)]));
  }
  return govde;
}

// Senaryo okunurken denetim: bilinmeyen ad koşu ortasında değil başta yakalanır.
export function yerTutuculari(metin: string): string[] {
  return [...metin.matchAll(YER_TUTUCU)].map((m) => m[1] ?? '');
}

export function yerTutucuGecerliMi(ad: string): boolean {
  return ad === 'uuid' || ad === 'simdi' || /^simdi-\d+$/.test(ad) || ad === 'kaynak' || /^istasyon\.[A-Za-z]+$/.test(ad);
}
