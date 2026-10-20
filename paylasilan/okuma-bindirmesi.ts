// Prototipin kendi deposunda tuttuğu liste başka modülün kaydıysa (tezgâh, malzeme, cihaz, firma) tek kaynak sahibidir.
// Okumada sahibin `disari.ts`'inden gelen liste belgenin o yoluna bindirilir, belgede saklanan kopya geçmez; yazmada aynı
// yol saklanmadan önce çıkarılır, bayat kopya birikmez. Ekleme ve düzenleme prototipte değil sahibin sayfasındadır
// (çerçeve kabuğa `sahibe-git` yollar). Yol kodda sabittir; belge güvenilmeyen çerçeveden gelir.
export type BindirmeYolu = readonly [string, ...string[]];
export interface Bindirme { yol: BindirmeYolu; deger: unknown }

const YASAK = new Set(['__proto__', 'constructor', 'prototype', '']);

function yolDenetle(yol: readonly string[]): void {
  if (yol.length === 0 || yol.some((ad) => YASAK.has(ad))) throw new TypeError(`Geçersiz bindirme yolu: ${JSON.stringify(yol)}`);
}

const nesneMi = (deger: unknown): deger is Record<string, unknown> =>
  deger !== null && typeof deger === 'object' && !Array.isArray(deger);

function yaz(hedef: Record<string, unknown>, yol: readonly string[], deger: unknown): Record<string, unknown> {
  const [ad, ...kalan] = yol as [string, ...string[]];
  if (kalan.length === 0) return { ...hedef, [ad]: deger };
  const alt = hedef[ad];
  return { ...hedef, [ad]: yaz(nesneMi(alt) ? alt : {}, kalan, deger) };
}

function sil(hedef: Record<string, unknown>, yol: readonly string[]): Record<string, unknown> {
  const [ad, ...kalan] = yol as [string, ...string[]];
  if (!Object.hasOwn(hedef, ad)) return hedef;
  if (kalan.length === 0) {
    const { [ad]: _cikan, ...digerleri } = hedef;
    return digerleri;
  }
  const alt = hedef[ad];
  return nesneMi(alt) ? { ...hedef, [ad]: sil(alt, kalan) } : hedef;
}

export function okumaBindir<T extends Record<string, unknown>>(belge: T, bindirmeler: readonly Bindirme[]): T {
  for (const b of bindirmeler) yolDenetle(b.yol);
  return bindirmeler.reduce<Record<string, unknown>>((v, b) => yaz(v, b.yol, b.deger), belge) as T;
}

export function bindirilenleriAyikla<T extends Record<string, unknown>>(belge: T, yollar: readonly BindirmeYolu[]): T {
  for (const y of yollar) yolDenetle(y);
  return yollar.reduce<Record<string, unknown>>((v, y) => sil(v, y), belge) as T;
}
