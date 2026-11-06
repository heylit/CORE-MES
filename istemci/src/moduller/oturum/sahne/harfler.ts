// CORE harflerinin dış hatları: sahne (tekillik.ts) bunlardan katı harf, altın kenar ve parçacık hedefi kurar; WebGL olmayan
// tarayıcıda giriş ekranı aynı hatları SVG olarak çizer. three gerektirmez: giriş ekranı bu dosyayı kütüphanesiz ithal eder.
// Koordinat: y yukarı, kelimenin ortası 0; O harfinin merkezi (O_X, 0), yıldız halkası O_R yarıçapındadır.

export type Nokta = readonly [number, number];
export interface Harf { readonly ad: 'C' | 'O' | 'R' | 'E'; readonly dis: readonly Nokta[]; readonly delikler: readonly (readonly Nokta[])[] }

// Çizim kâğıt koordinatında (y aşağı, sol üst 0) yapıldı; burada ortalanıp y çevrilir.
const X = (x: number): number => x - 182;
const Y = (y: number): number => 60 - y;
const der = (d: number): number => (d * Math.PI) / 180;
const kagit = (x: number, y: number): Nokta => [X(x), Y(y)];

function halkaDilimi(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): Nokta[] {
  const n = 48, dis: Nokta[] = [];
  for (let i = 0; i <= n; i++) { const a = der(a0 + ((a1 - a0) * i) / n); dis.push([X(cx) + ro * Math.cos(a), Y(cy) + ro * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = der(a0 + ((a1 - a0) * i) / n); dis.push([X(cx) + ri * Math.cos(a), Y(cy) + ri * Math.sin(a)]); }
  return dis;
}

function daire(cx: number, cy: number, r: number, ters: boolean): Nokta[] {
  const n = 96, d: Nokta[] = [];
  for (let i = 0; i < n; i++) { const a = ((ters ? -i : i) / n) * Math.PI * 2; d.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return d;
}

function rHarfi(): Harf {
  const dis: Nokta[] = [kagit(225, 110), kagit(225, 10), kagit(257, 10)];
  for (let i = 1; i <= 30; i++) { const a = der(90 - (154 * i) / 30); dis.push(kagit(257 + 30 * Math.cos(a), 40 - 30 * Math.sin(a))); }
  dis.push(kagit(288.8, 93.8), kagit(273.2, 106.2), kagit(245, 71), kagit(245, 110));
  const delik: Nokta[] = [kagit(245, 30), kagit(257, 30)];
  for (let i = 1; i <= 24; i++) { const a = der(90 - (180 * i) / 24); delik.push(kagit(257 + 10 * Math.cos(a), 40 - 10 * Math.sin(a))); }
  delik.push(kagit(245, 50));
  return { ad: 'R', dis, delikler: [delik] };
}

export const O_X = X(165);
export const O_R = 40;

export const HARFLER: readonly Harf[] = [
  { ad: 'C', dis: halkaDilimi(60, 60, 50, 30, 45, 315), delikler: [] },
  { ad: 'O', dis: daire(O_X, 0, 50, false), delikler: [daire(O_X, 0, 30, true)] },
  rHarfi(),
  {
    ad: 'E',
    dis: [[301, 10], [355, 10], [355, 30], [321, 30], [321, 50], [347, 50], [347, 70], [321, 70], [321, 90], [355, 90], [355, 110], [301, 110]]
      .map(([x, y]) => kagit(x ?? 0, y ?? 0)),
    delikler: [],
  },
];

// Çift-tek kuralıyla nokta çokgen içinde mi (delik içi dışarıdır).
function icinde(cokgen: readonly Nokta[], x: number, y: number): boolean {
  let ic = false;
  for (let i = 0, j = cokgen.length - 1; i < cokgen.length; j = i++) {
    const [xi, yi] = cokgen[i] as Nokta, [xj, yj] = cokgen[j] as Nokta;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
  }
  return ic;
}

// Noktanın içinde olduğu harfin sırası; hiçbirinde değilse -1.
export function icindekiHarf(x: number, y: number): number {
  return HARFLER.findIndex((h) => icinde(h.dis, x, y) && !h.delikler.some((d) => icinde(d, x, y)));
}

const yol = (n: readonly Nokta[]): string => `M${n.map(([x, y]) => `${x.toFixed(1)} ${(-y).toFixed(1)}`).join('L')}Z`;
// SVG yolu (y aşağı); delikler aynı yolda, fill-rule evenodd ile boş kalır.
export const svgYolu = (h: Harf): string => [h.dis, ...h.delikler].map(yol).join('');
export const SVG_KUTUSU = '-182 -58 364 116';
