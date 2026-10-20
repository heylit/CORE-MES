// Kroki (salonun PDF planı) hesapları: sayfa noktası ile salon metresi arasındaki dönüşüm, hizalama adımları, PDF'in
// çizgileri ve yerleştirirken bu çizgilere yapışma. Saf: pdf.js ve ekran yok; ekran ve PDF okuyucu bunları çağırır.
//
// Sayfa noktası pdf.js görünümündedir (ölçek 1, sol üst köken, punto, aşağı doğru artar). Salon noktası metredir
// (x sağa, z aşağı; planla aynı). Dönüşüm SVG'deki `translate(x z) rotate(donus) scale(olcek)` ile aynıdır.

export interface Hizalama {
  // metre / punto
  olcek: number;
  // derece; ekranda saat yönü artı (z aşağı)
  donus: number;
  x: number;
  z: number;
}

export interface Nokta {
  x: number;
  z: number;
}

export interface SayfaNoktasi {
  u: number;
  v: number;
}

const RAD = Math.PI / 180;
const yuvarla = (n: number, hane: number): number => Math.round(n * 10 ** hane) / 10 ** hane;
const aciIndir = (d: number): number => {
  const a = ((d % 360) + 360) % 360;
  return a >= 360 ? 0 : a;
};

export function uygula(h: Hizalama, p: SayfaNoktasi): Nokta {
  const c = Math.cos(h.donus * RAD);
  const s = Math.sin(h.donus * RAD);
  return { x: h.x + h.olcek * (c * p.u - s * p.v), z: h.z + h.olcek * (s * p.u + c * p.v) };
}

export function ters(h: Hizalama, n: Nokta): SayfaNoktasi {
  const c = Math.cos(h.donus * RAD);
  const s = Math.sin(h.donus * RAD);
  const dx = (n.x - h.x) / h.olcek;
  const dz = (n.z - h.z) / h.olcek;
  return { u: c * dx + s * dz, v: -s * dx + c * dz };
}

export const uzaklik = (a: Nokta, b: Nokta): number => Math.hypot(b.x - a.x, b.z - a.z);

// Hizalanmamış kroki salona sığdırılarak gösterilir (geçici; kaydedilmez). Ortalanır.
export function ilkHizalama(sayfa: { g: number; y: number }, salon: { g: number; d: number }): Hizalama {
  const olcek = Math.min(salon.g / sayfa.g, salon.d / sayfa.y);
  return { olcek, donus: 0, x: (salon.g - sayfa.g * olcek) / 2, z: (salon.d - sayfa.y * olcek) / 2 };
}

// Ölçek: krokide iki nokta (salonda şimdi a ve b'de görünen) arası gerçekte `gercek` metredir. a yerinde kalır.
export function olcekAyarla(h: Hizalama, a: Nokta, b: Nokta, gercek: number): Hizalama {
  const simdi = uzaklik(a, b);
  if (!(simdi > 0) || !(gercek > 0)) return h;
  const k = gercek / simdi;
  return { ...h, olcek: h.olcek * k, x: a.x + (h.x - a.x) * k, z: a.z + (h.z - a.z) * k };
}

// Pivot çevresinde döndürme (derece).
export function dondur(h: Hizalama, merkez: Nokta, derece: number): Hizalama {
  const c = Math.cos(derece * RAD);
  const s = Math.sin(derece * RAD);
  const dx = h.x - merkez.x;
  const dz = h.z - merkez.z;
  return { ...h, donus: aciIndir(h.donus + derece), x: merkez.x + c * dx - s * dz, z: merkez.z + s * dx + c * dz };
}

// Yön: a'dan b'ye giden duvar en yakın eksene (yatay ya da dikey) oturur; a çevresinde en küçük açıyla döner.
export function eksenOturt(h: Hizalama, a: Nokta, b: Nokta): Hizalama {
  if (!(uzaklik(a, b) > 0)) return h;
  const aci = Math.atan2(b.z - a.z, b.x - a.x) / RAD;
  // [-45, 45) aralığına indirgenmiş sapma.
  const sapma = ((((aci + 45) % 90) + 90) % 90) - 45;
  return dondur(h, a, -sapma);
}

// Konum: krokide şimdi `nokta`da görünen yer salonun `hedef` noktasına (varsayılan sol üst köşe) taşınır.
export function noktayaTasi(h: Hizalama, nokta: Nokta, hedef: Nokta = { x: 0, z: 0 }): Hizalama {
  return { ...h, x: h.x + hedef.x - nokta.x, z: h.z + hedef.z - nokta.z };
}

export const tasi = (h: Hizalama, dx: number, dz: number): Hizalama => ({ ...h, x: h.x + dx, z: h.z + dz });

// Sunucunun sakladığı duyarlık (ölçek 10 hane, dönüş 0,01 derece, konum milimetre).
export function hizalamaYuvarla(h: Hizalama): Hizalama {
  return { olcek: yuvarla(h.olcek, 10), donus: aciIndir(yuvarla(h.donus, 2)), x: yuvarla(h.x, 3), z: yuvarla(h.z, 3) };
}

// SVG'de krokiyi yerleştiren dönüşüm (sayfa punto -> salon metre).
export const svgDonusumu = (h: Hizalama): string => `translate(${h.x} ${h.z}) rotate(${h.donus}) scale(${h.olcek})`;

// Bölüm krokisinin hizalaması (bölüm metresine) fabrika metresine: bölümün fabrika yeriyle (sol üst köşe, dönüş)
// birleşir. İki benzerlik dönüşümünün bileşkesi yine hizalamadır; `yerelle` tersidir (fabrika krokisini bölüme getirir).
export function yerlestir(h: Hizalama, k: { x: number; z: number; donus: number }): Hizalama {
  const c = Math.cos(k.donus * RAD);
  const s = Math.sin(k.donus * RAD);
  return { olcek: h.olcek, donus: aciIndir(h.donus + k.donus), x: k.x + c * h.x - s * h.z, z: k.z + s * h.x + c * h.z };
}

export function yerelle(h: Hizalama, k: { x: number; z: number; donus: number }): Hizalama {
  const c = Math.cos(k.donus * RAD);
  const s = Math.sin(k.donus * RAD);
  const dx = h.x - k.x;
  const dz = h.z - k.z;
  return { olcek: h.olcek, donus: aciIndir(h.donus - k.donus), x: c * dx + s * dz, z: -s * dx + c * dz };
}

// ---------- PDF çizgileri ----------

// pdf.js işlem listesinden düz çizgi parçaları (sayfa noktası, punto). Kodlar dışarıdan verilir: modül pdf.js'e
// bağlanmaz, sürüm değişirse yalnız okuyucu değişir. Eğriler atlanır (uçları nokta olarak sayılmaz), kırpma yolları
// (çizilmeyen) alınmaz.
export interface PdfKodlari {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  endPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

export interface YolKodlari {
  moveTo: number;
  lineTo: number;
  curveTo: number;
  quadraticCurveTo: number;
  closePath: number;
}

type Matris = [number, number, number, number, number, number];

const carp = (A: Matris, B: Matris): Matris => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

const matrisMi = (m: unknown): m is Matris => Array.isArray(m) || (ArrayBuffer.isView(m) && (m as Float32Array).length === 6);

export function cizgileriCikar(
  islemler: ArrayLike<number>, argumanlar: readonly unknown[], k: PdfKodlari, y: YolKodlari, taban: readonly number[], azami = 200_000,
): Float32Array {
  const cikti: number[] = [];
  let ctm = [...taban] as Matris;
  const yigin: Matris[] = [];
  const ekle = (x1: number, y1: number, x2: number, y2: number) => {
    if (cikti.length >= azami * 4) return;
    const u1 = ctm[0] * x1 + ctm[2] * y1 + ctm[4];
    const v1 = ctm[1] * x1 + ctm[3] * y1 + ctm[5];
    const u2 = ctm[0] * x2 + ctm[2] * y2 + ctm[4];
    const v2 = ctm[1] * x2 + ctm[3] * y2 + ctm[5];
    if (u1 === u2 && v1 === v2) return;
    cikti.push(u1, v1, u2, v2);
  };
  for (let i = 0; i < islemler.length; i++) {
    const fn = islemler[i];
    const arg = argumanlar[i];
    if (fn === k.save) yigin.push(ctm);
    else if (fn === k.restore) ctm = yigin.pop() ?? ctm;
    else if (fn === k.transform && Array.isArray(arg) && arg.length === 6) ctm = carp(ctm, arg as Matris);
    else if (fn === k.paintFormXObjectBegin) {
      yigin.push(ctm);
      const m = Array.isArray(arg) ? arg[0] : null;
      if (matrisMi(m)) ctm = carp(ctm, [...(m as ArrayLike<number> & Iterable<number>)] as Matris);
    } else if (fn === k.paintFormXObjectEnd) ctm = yigin.pop() ?? ctm;
    else if (fn === k.constructPath && Array.isArray(arg)) {
      const [boya, veri] = arg as [number, unknown[] | null];
      const yol = Array.isArray(veri) ? veri[0] : null;
      if (boya === k.endPath || !yol || !ArrayBuffer.isView(yol)) continue;
      const d = yol as Float32Array;
      let cx = 0;
      let cy = 0;
      let bx = 0;
      let by = 0;
      for (let j = 0; j < d.length;) {
        const op = d[j++];
        if (op === y.moveTo) { cx = d[j++] ?? 0; cy = d[j++] ?? 0; bx = cx; by = cy; }
        else if (op === y.lineTo) { const nx = d[j++] ?? 0; const ny = d[j++] ?? 0; ekle(cx, cy, nx, ny); cx = nx; cy = ny; }
        else if (op === y.curveTo) { j += 4; cx = d[j++] ?? 0; cy = d[j++] ?? 0; }
        else if (op === y.quadraticCurveTo) { j += 2; cx = d[j++] ?? 0; cy = d[j++] ?? 0; }
        else if (op === y.closePath) { ekle(cx, cy, bx, by); cx = bx; cy = by; }
        else break;
      }
    }
  }
  return new Float32Array(cikti);
}

// ---------- yapışma ----------

export interface EksenCizgisi {
  // Dikey çizgide x sabit, [a, b] z aralığı; yatayda z sabit, [a, b] x aralığı.
  k: number;
  a: number;
  b: number;
}

export interface YapismaVerisi {
  noktalar: Map<string, Nokta[]>;
  dikey: EksenCizgisi[];
  yatay: EksenCizgisi[];
  // Çizim için (salon metresi): x1 z1 x2 z2 ...
  parcalar: Float32Array;
}

const KOVA = 1;
const kovaAnahtari = (x: number, z: number): string => `${Math.floor(x / KOVA)}:${Math.floor(z / KOVA)}`;

// Çizgiler salona çevrilir; çok kısa parça (tarama, yazı) yapışmaya girmez. Eksene 0,3 dereceden yakın çizgi
// eksen çizgisidir (duvar, kolon, makine sınırı genelde eksene paraleldir).
export function yapismaVerisiKur(parcalar: Float32Array, h: Hizalama, enKisa = 0.05): YapismaVerisi {
  const noktalar = new Map<string, Nokta[]>();
  const gorulen = new Set<string>();
  const dikey: EksenCizgisi[] = [];
  const yatay: EksenCizgisi[] = [];
  const cizim = new Float32Array(parcalar.length);
  const noktaEkle = (n: Nokta) => {
    const a = `${Math.round(n.x * 1000)}:${Math.round(n.z * 1000)}`;
    if (gorulen.has(a)) return;
    gorulen.add(a);
    const k = kovaAnahtari(n.x, n.z);
    const l = noktalar.get(k);
    if (l) l.push(n); else noktalar.set(k, [n]);
  };
  const egim = Math.tan(0.3 * RAD);
  for (let i = 0; i + 3 < parcalar.length; i += 4) {
    const p = uygula(h, { u: parcalar[i] ?? 0, v: parcalar[i + 1] ?? 0 });
    const q = uygula(h, { u: parcalar[i + 2] ?? 0, v: parcalar[i + 3] ?? 0 });
    cizim[i] = p.x; cizim[i + 1] = p.z; cizim[i + 2] = q.x; cizim[i + 3] = q.z;
    const L = uzaklik(p, q);
    if (L < enKisa) continue;
    noktaEkle(p);
    noktaEkle(q);
    if (Math.abs(q.z - p.z) <= L * egim) yatay.push({ k: (p.z + q.z) / 2, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) });
    else if (Math.abs(q.x - p.x) <= L * egim) dikey.push({ k: (p.x + q.x) / 2, a: Math.min(p.z, q.z), b: Math.max(p.z, q.z) });
  }
  dikey.sort((a, b) => a.k - b.k);
  yatay.sort((a, b) => a.k - b.k);
  return { noktalar, dikey, yatay, parcalar: cizim };
}

// Sıralı dizide k değeri [alt, ust] aralığında olanların ilk sırası.
function ilkSira(l: readonly EksenCizgisi[], alt: number): number {
  let lo = 0;
  let hi = l.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if ((l[m]?.k ?? 0) < alt) lo = m + 1; else hi = m;
  }
  return lo;
}

function* araliktakiler(l: readonly EksenCizgisi[], alt: number, ust: number): Generator<EksenCizgisi> {
  for (let i = ilkSira(l, alt); i < l.length; i++) {
    const c = l[i];
    if (!c || c.k > ust) return;
    yield c;
  }
}

export interface NoktaYapismasi {
  nokta: Nokta;
  // nokta: bir çizgi ucuna; eksen: dikey ve/veya yatay bir çizgiye; null: yapışmadı.
  tur: 'nokta' | 'eksen' | null;
  kilavuzX: number | null;
  kilavuzZ: number | null;
}

// Önce en yakın çizgi ucu (tolerans içinde); yoksa eksenlere ayrı ayrı (x dikey çizgiye, z yatay çizgiye).
export function noktayaYapis(v: YapismaVerisi, p: Nokta, tol: number): NoktaYapismasi {
  let en: Nokta | null = null;
  let enU = tol;
  const kx = Math.floor(p.x / KOVA);
  const kz = Math.floor(p.z / KOVA);
  const r = Math.ceil(tol / KOVA);
  for (let i = kx - r; i <= kx + r; i++) {
    for (let j = kz - r; j <= kz + r; j++) {
      for (const n of v.noktalar.get(`${i}:${j}`) ?? []) {
        const u = uzaklik(n, p);
        if (u <= enU) { enU = u; en = n; }
      }
    }
  }
  if (en) return { nokta: en, tur: 'nokta', kilavuzX: en.x, kilavuzZ: en.z };
  let x: number | null = null;
  let z: number | null = null;
  let dx = tol;
  let dz = tol;
  for (const c of araliktakiler(v.dikey, p.x - tol, p.x + tol)) {
    if (p.z < c.a - tol || p.z > c.b + tol) continue;
    const u = Math.abs(c.k - p.x);
    if (u <= dx) { dx = u; x = c.k; }
  }
  for (const c of araliktakiler(v.yatay, p.z - tol, p.z + tol)) {
    if (p.x < c.a - tol || p.x > c.b + tol) continue;
    const u = Math.abs(c.k - p.z);
    if (u <= dz) { dz = u; z = c.k; }
  }
  if (x === null && z === null) return { nokta: p, tur: null, kilavuzX: null, kilavuzZ: null };
  return { nokta: { x: x ?? p.x, z: z ?? p.z }, tur: 'eksen', kilavuzX: x, kilavuzZ: z };
}

export interface KutuYapismasi {
  dx: number;
  dz: number;
  kilavuzX: number | null;
  kilavuzZ: number | null;
}

// Eksene paralel kutunun (öğenin ayak izi) kenarları en yakın paralel çizgiye kayar; çizgi kutunun yanında olmalı
// (uzunlamasına 0,5 m pay). Her eksende en küçük kayma seçilir.
export function kutuyaYapis(v: YapismaVerisi, k: { x0: number; x1: number; z0: number; z1: number }, tol: number): KutuYapismasi {
  const PAY = 0.5;
  let dx = 0;
  let enX = tol;
  let kilavuzX: number | null = null;
  for (const kenar of [k.x0, k.x1]) {
    for (const c of araliktakiler(v.dikey, kenar - tol, kenar + tol)) {
      if (c.b < k.z0 - PAY || c.a > k.z1 + PAY) continue;
      const d = c.k - kenar;
      if (Math.abs(d) <= enX) { enX = Math.abs(d); dx = d; kilavuzX = c.k; }
    }
  }
  let dz = 0;
  let enZ = tol;
  let kilavuzZ: number | null = null;
  for (const kenar of [k.z0, k.z1]) {
    for (const c of araliktakiler(v.yatay, kenar - tol, kenar + tol)) {
      if (c.b < k.x0 - PAY || c.a > k.x1 + PAY) continue;
      const d = c.k - kenar;
      if (Math.abs(d) <= enZ) { enZ = Math.abs(d); dz = d; kilavuzZ = c.k; }
    }
  }
  return { dx, dz, kilavuzX, kilavuzZ };
}

// Ölçü metni: 12,35 m (Δx 12,00 · Δz 2,90).
const SAYI = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const metreMetni = (n: number): string => `${SAYI.format(n)} m`;
