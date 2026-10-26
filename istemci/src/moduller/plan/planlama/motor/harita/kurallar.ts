import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';
import { acikSaat, AY_AD, ayristir, saatYaz, sayiYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';

// Tezgâh haritası (y-atolye.betik, o-tahta tbYerlesim, x-resim rsDoluluk, zs-olcek-ortak, zm-ozet, zo-kontrol, z-komuta): saf hesaplar.
// Dünya ölçüleri eski sayfanınkidir; çizim Harita.tsx'te.
export const KW = 168, KH = 116, SUT = 236, SAT = 140, UST = 58;

const sayi = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null);

// --- tezgâh grupları (tbYerlesim): gruplar rotadaki ortalama sıralarıyla, fasoncular plandakilerle ---
export interface HaritaTezgahi { id: string; ad: string; fason: boolean }
export interface HaritaGrubu { g: string; l: HaritaTezgahi[] }
export function haritaGruplari(D: PlanVerisi, p: OkunanPlan, cx: Derleme): HaritaGrubu[] {
  const ust: Record<string, string> = {};
  for (const s of D.siparisler) if (typeof s.ust === 'string' && s.ust) ust[s.id] = s.ust;
  const der = (id: string) => { let d = 0, x = id; while (ust[x] && d < 20) { x = ust[x] ?? x; d++; } return d; };
  const kok = (id: string) => { let x = id, d = 0; while (ust[x] && d < 20) { x = ust[x] ?? x; d++; } return x; };
  const enDer: Record<string, number> = {};
  for (const id of Object.keys(cx.jobs)) { const k = kok(id); enDer[k] = Math.max(enDer[k] ?? 0, der(id)); }
  const sira: Record<string, number> = {}, say: Record<string, number> = {};
  for (const j of Object.values(cx.jobs)) {
    const H = enDer[kok(j.id)] ?? 0, d = der(j.id);
    j.ops.forEach((o, i) => {
      const r = p.ops[o.id]; const m = r ? r.m : o.c[0]; if (!m) return;
      const g = m.startsWith('@') ? 'fason' : cx.M[m]?.grup; if (g === undefined) return;
      sira[g] = (sira[g] ?? 0) + (H - d + i / Math.max(1, j.ops.length - 1)) / (H + 1); say[g] = (say[g] ?? 0) + 1;
    });
  }
  // Düz nesne: eşit sıradaki gruplar eski sayfadaki gibi anahtar sırasıyla kalır (sayı biçimli grup adları önce, küçükten büyüğe).
  const gruplar: Record<string, HaritaTezgahi[]> = {};
  for (const m of D.tezgahlar) (gruplar[String(m.grup)] ??= []).push({ id: m.id, ad: m.ad ?? '', fason: false });
  const ops = Object.values(p.ops);
  const fas = (D.fasoncular ?? []).filter((f) => ops.some((r) => r.m === `@${f.id}`));
  if (fas.length) gruplar.fason = fas.map((f) => ({ id: `@${f.id}`, ad: f.ad ?? '', fason: true }));
  const ort = (g: string) => (say[g] ? (sira[g] ?? 0) / (say[g] ?? 1) : 0.5);
  // Tahtada grup dörderli bloklara bölünür; harita kartları satır satır okur (önce her bloğun ilk tezgâhı).
  return Object.keys(gruplar).sort((a, b) => ort(a) - ort(b)).map((g) => {
    const l = gruplar[g] ?? [];
    return { g, l: l.map((x, i) => ({ x, k: i % 4, b: Math.floor(i / 4) })).sort((a, b) => a.k - b.k || a.b - b.b).map((z) => z.x) };
  });
}

// --- yerleşim (atYerlesim): gruplar sütunlardır; sütundaki tezgâh sayısı (en çok 4) ve satır sayısı alanın oranına göre aranır ---
export interface Istasyon { m: string; ad: string; grup: string; gi: number; fason: boolean; x: number; y: number }
export interface Bolge { g: string; x: number; y: number; w: number; h: number; n: number; ms: string[] }
export interface Yerlesim { ist: Record<string, Istasyon>; bolge: Bolge[] }
export function yerlesim(gruplar: HaritaGrubu[], W: number, H: number): Yerlesim {
  const gl = gruplar.filter((x) => x.l.length);
  let en: { k: number; per: number; satirlar: (HaritaGrubu & { n: number })[][]; fy: number } | null = null;
  for (let per = 4; per >= 1; per--) {
    const sut = gl.map((x) => ({ ...x, n: Math.ceil(x.l.length / per) }));
    for (let r = 1; r <= sut.length; r++) {
      const satirlar: (HaritaGrubu & { n: number })[][] = []; let cur: (HaritaGrubu & { n: number })[] = [], top = 0;
      const hedef = sut.reduce((t, x) => t + x.n, 0) / r;
      for (const x of sut) { if (cur.length && top + x.n / 2 > hedef + 0.01 && satirlar.length < r - 1) { satirlar.push(cur); cur = []; top = 0; } cur.push(x); top += x.n; }
      satirlar.push(cur);
      const w = Math.max(...satirlar.map((l) => l.reduce((t, x) => t + x.n * SUT + 24, 0)));
      const h = satirlar.reduce((t, l) => t + Math.max(...l.map((x) => Math.min(per, x.l.length))) * SAT + UST + 50, 0);
      const k = Math.min(W / w, H / h);
      if (!en || k > en.k * 1.04) en = { k, per, satirlar, fy: Math.max(1, Math.min(1.4, (H / h) / (W / w))) };
    }
  }
  const ist: Record<string, Istasyon> = {}, bolge: Bolge[] = [];
  if (!en) return { ist, bolge };
  const S = SAT * en.fy; const per = en.per; let y = 0;
  for (const l of en.satirlar) {
    let x = 0; const sh = Math.max(...l.map((g) => Math.min(per, g.l.length))) * S;
    for (const g of l) {
      const n = Math.min(per, g.l.length); const oy = y + UST + (sh - n * S) / 2;
      g.l.forEach((k, i) => { const bi = Math.floor(i / per), ki = i % per; ist[k.id] = { m: k.id, ad: k.ad, grup: g.g, gi: bolge.length, fason: k.fason, x: x + bi * SUT + SUT / 2, y: oy + ki * S + S / 2 }; });
      bolge.push({ g: g.g, x: x + 12, y: y + 6, w: g.n * SUT, h: sh + UST - 4, n: g.l.length, ms: g.l.map((k) => k.id) }); x += g.n * SUT + 24;
    }
    y += sh + UST + 50;
  }
  return { ist, bolge };
}

// --- dönem ve dilim (zq-olcek olAralik, zs-olcek-ortak): harita dönemi yedi dilimde gösterir (haftada dilim bir gün) ---
const OLCEK_GUN: Record<DonemOlcegi, number> = { gun: 1, hafta: 7, ay: 30, yil: 364 };
export interface Aralik { a: number; b: number }
export function aralik(now: number, olcek: DonemOlcegi, kayma: number): Aralik {
  const g = OLCEK_GUN[olcek]; const a = Math.floor(now / 24) * 24 + kayma * g * 24; return { a, b: a + g * 24 };
}
// Zaman şeridinin sonu (atPenB): dönemin sonu, en az şimdiden altı saat sonrası.
export const pencereSonu = (now: number, r: Aralik): number => Math.max(now + 6, r.b);
// Zaman imleci şimdi ile şeridin sonu arasındadır (rsT).
export const zamanSinirla = (t: number | null, now: number, son: number): number => Math.min(son, Math.max(now, t ?? now));
export const dilimBoyu = (r: Aralik): number => (r.b - r.a) / 7;
export const dilimNo = (r: Aralik, t: number): number => Math.max(0, Math.min(6, Math.floor((t - r.a) / dilimBoyu(r))));
export function dilimAdi(D: PlanVerisi, olcek: DonemOlcegi, r: Aralik, i: number, uzun = false): string {
  const L = dilimBoyu(r); const x = r.a + i * L; const g = saatYaz(D, x);
  if (olcek === 'gun') return uzun ? `${g.slice(0, 9)} ${g.slice(10, 15)}–${saatYaz(D, x + L).slice(10, 15)}` : g.slice(10, 12);
  if (olcek === 'hafta') return uzun ? g.slice(0, 9) : g.slice(6, 8);
  if (olcek === 'ay') return uzun ? `${g.slice(0, 5)}–${saatYaz(D, x + L - 1).slice(0, 5)}` : g.slice(0, 5);
  return uzun ? `${g.slice(0, 5)}–${saatYaz(D, x + L - 1).slice(0, 5)}` : AY_AD[Number(g.slice(3, 5)) - 1] ?? '';
}
// Zaman şeridinin etiketleri (atPenEtiket): konum şeridin yüzdesi.
export function seritEtiketleri(D: PlanVerisi, olcek: DonemOlcegi, now: number, son: number): [number, string][] {
  const W = son - now; const d0 = Math.floor(now / 24) * 24; const t: [number, string][] = []; const ad = (x: number) => saatYaz(D, x);
  if (olcek === 'gun') { for (let x = Math.ceil(now / 3) * 3; x < son; x += 3) t.push([x, ad(x).slice(10, 15)]); }
  else if (olcek === 'hafta') { for (let x = d0; x < son; x += 24) t.push([x, ad(x).slice(6, 9)]); }
  else if (olcek === 'ay') { for (let x = d0; x < son; x += 5 * 24) t.push([x, ad(x).slice(0, 5)]); }
  else { for (let x = d0; x < son; x += 24) { const g = ad(x); if (x === d0 || g.slice(0, 2) === '01') t.push([x, AY_AD[Number(g.slice(3, 5)) - 1] ?? '']); } }
  return t.map(([x, e]) => [Math.max(0, x - now) / W, e]);
}

// Dilim başına doluluk (rsDoluluk): açık saatte işin payı; tezgâh o dilimde kapalıysa null.
export function doluluk(D: PlanVerisi, p: OkunanPlan, cx: Derleme, r: Aralik): Record<string, (number | null)[]> {
  const L = dilimBoyu(r); const o: Record<string, (number | null)[]> = {};
  const ops = Object.values(p.ops);
  for (const t of D.tezgahlar) {
    const M = cx.M[t.id]; if (!M) continue; const l: (number | null)[] = [];
    for (let g = 0; g < 7; g++) {
      const a = r.a + g * L, b = a + L; const acik = M.rw.reduce((s, [x, y]) => s + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0);
      let dolu = 0; for (const q of ops) if (q.m === t.id && Number.isFinite(q.C) && q.C > a && q.S < b) dolu += acikSaat(M.rw, Math.max(a, q.S), Math.min(b, q.C));
      l.push(acik > 0.5 ? dolu / acik : null);
    }
    o[t.id] = l;
  }
  return o;
}

// --- sahne (atSahneKur): plan, yerleşim ve dönem değişince bir kez kurulur ---
export interface Kenar { a: string; b: string; n: number; j: Set<string> }
export interface Sahne extends Yerlesim {
  Q: Record<string, PlanIslemi[]>; byJ: Record<string, PlanIslemi[]>; kenar: Record<string, Kenar>;
  dol: Record<string, (number | null)[]>; J: OkunanPlan['J']; now: number; son: number;
}
export function sahneKur(D: PlanVerisi, p: OkunanPlan, cx: Derleme, y: Yerlesim, r: Aralik, now: number): Sahne {
  const son = pencereSonu(now, r); const { ist } = y;
  const Q: Sahne['Q'] = {}, byJ: Sahne['byJ'] = {};
  for (const q of Object.values(p.ops)) {
    if (!Number.isFinite(q.S) || !ist[q.m]) continue;
    if (Number.isFinite(q.C)) (Q[q.m] ??= []).push(q);
    (byJ[q.job] ??= []).push(q);
  }
  for (const m in Q) Q[m]?.sort((a, b) => a.S - b.S);
  for (const j in byJ) byJ[j]?.sort((a, b) => a.S - b.S);
  const kenar: Sahne['kenar'] = {};
  for (const j in byJ) {
    const l = byJ[j] ?? [];
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1], b = l[i]; if (!a || !b || a.m === b.m || b.S > son || a.C < now - 24) continue;
      const k = `${a.m}>${b.m}`; const e = (kenar[k] ??= { a: a.m, b: b.m, n: 0, j: new Set() }); e.n++; e.j.add(j);
    }
  }
  return { ...y, Q, byJ, kenar, dol: doluluk(D, p, cx, r), J: p.J, now, son };
}

// --- zamana bağlı hâl (atDurum) ---
export type TezgahHali = 'calisiyor' | 'bos' | 'ariza';
export interface TezgahDurumu { cal: PlanIslemi | null; ariza: boolean; sira: PlanIslemi[]; bekleyen: number; dur: TezgahHali }
export function durusOku(c: PlanlamaCalismasi): { m: string; from: number; to: number }[] {
  const o: { m: string; from: number; to: number }[] = [];
  for (const d of c.down) { const a = sayi(d.from), b = sayi(d.to); if (typeof d.m === 'string' && a !== null && b !== null) o.push({ m: d.m, from: a, to: b }); }
  return o;
}
export function tezgahDurumu(s: Sahne, durus: { m: string; from: number; to: number }[], m: string, t: number): TezgahDurumu {
  const l = s.Q[m] ?? []; const cal = l.find((r) => r.S <= t && r.C > t) ?? null; const ariza = durus.some((d) => d.m === m && d.from <= t && d.to > t);
  const bek = l.filter((r) => r.S > t);
  return { cal, ariza, sira: bek.slice(0, 5), bekleyen: bek.length, dur: ariza ? 'ariza' : cal ? 'calisiyor' : 'bos' };
}
export const DURUM_ETIKETI: Record<TezgahHali, string> = { calisiyor: 'ÇALIŞIYOR', bos: 'BOŞTA', ariza: 'ARIZA' };

// --- akış yayı: kaynağın sağ kenarından hedefin sol kenarına; geri dönen yay aşağıdan kıvrılır ---
export interface Nokta { x: number; y: number }
export function yay(a: Nokta, b: Nokta): [Nokta, Nokta, Nokta, Nokta] {
  const p0 = { x: a.x + KW / 2, y: a.y + 8 }, p3 = { x: b.x - KW / 2, y: b.y + 8 };
  const dx = Math.max(50, Math.abs(p3.x - p0.x) * 0.45); const geri = p3.x < p0.x + 20;
  return geri ? [p0, { x: p0.x + 70, y: p0.y + 110 }, { x: p3.x - 70, y: p3.y + 110 }, p3] : [p0, { x: p0.x + dx, y: p0.y }, { x: p3.x - dx, y: p3.y }, p3];
}
export function kubik(c: readonly Nokta[], u: number): Nokta {
  const v = 1 - u; const [a, b, d, e] = c as [Nokta, Nokta, Nokta, Nokta];
  return { x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * d.x + u * u * u * e.x, y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * d.y + u * u * u * e.y };
}
// Yoldaki parçalar: iki adım arasında bekleyen parça yayda akar (u: yolun ne kadarı alındı).
export interface YoldakiParca { j: string; a: string; b: string; u: number }
export function yoldakiParcalar(s: Sahne, t: number): YoldakiParca[] {
  const o: YoldakiParca[] = [];
  for (const j in s.byJ) {
    const l = s.byJ[j] ?? [];
    for (let i = 0; i + 1 < l.length; i++) {
      const r = l[i], n = l[i + 1]; if (!r || !n || n.m === r.m || !(r.C <= t && t < n.S)) continue;
      o.push({ j, a: r.m, b: n.m, u: Math.min(1, (t - r.C) / Math.max(0.25, Math.min(8, n.S - r.C))) });
    }
  }
  return o;
}

// Kılavuz için örnek tezgâh (atOrnek): çalışan ve sırası en dolu olan.
export function ornekTezgah(s: Sahne, durus: Parameters<typeof tezgahDurumu>[1], t: number): string | null {
  let en: { m: string; p: number } | null = null;
  for (const m in s.ist) { if (m.startsWith('@')) continue; const st = tezgahDurumu(s, durus, m, t); const p = (st.cal ? 10 : 0) + st.sira.length; if (!en || p > en.p) en = { m, p }; }
  return en?.m ?? null;
}
// Kılavuzun numaralı işaretleri: [hedef, işaret] dünya noktaları; işaretler kutunun dışında.
export function kilavuzNoktalari(a: Nokta): [[number, number], [number, number]][] {
  const x0 = a.x - KW / 2, y0 = a.y - KH / 2;
  return [[[x0 + KW - 30, y0 + 2], [x0 + KW - 30, y0 - 22]], [[x0 + 8, y0 + 36], [x0 - 22, y0 + 36]], [[x0 + KW - 12, y0 + 46], [x0 + KW + 22, y0 + 46]],
    [[x0 + 8, y0 + 70], [x0 - 22, y0 + 70]], [[x0 + 38, y0 + 103], [x0 - 22, y0 + 103]], [[x0 + KW + 40, a.y + 8], [x0 + KW + 40, a.y + 38]]];
}
export const KILAVUZ: [string, string][] = [
  ['Durum', 'Üstteki renkli şerit ve etiket: yeşil çalışıyor, gri boşta, kırmızı arıza.'],
  ['Şu anki iş', 'Tezgâhta işlenen sipariş adımı, yüzde kaçı bittiği ve bitiş saati.'],
  ['İlerleme', 'Çubuk, işin sipariş renginde ne kadar ilerlediğini gösterir.'],
  ['7 gün', 'Her çubuk bir gün: yeşil rahat, sarı yoğun, kırmızı tam dolu. Altı çizili gün, zaman imlecinin olduğu gün.'],
  ['Sıra', 'Sıradaki işler sipariş renginde. Bir çipi tutup başka tezgâha sürükleyin; bırakmadan etkisini görürsünüz.'],
  ['Akış', 'Yay, parçanın bu tezgâhtan sonraki tezgâha yolu; kalın yay çok iş demek. Üzerindeki noktalar yoldaki parçalar.'],
];

// --- kamera ---
export interface Kamera { x: number; y: number; k: number }
// Sığdırma (zm-ozet atSigdir): bütün bölgeler; Harita'da üstteki çubuk ve alttaki oynatıcının kapladığı yer düşülür.
export function sigdir(bolge: Bolge[], W: number, H: number, ust = 0, alt = 0): Kamera | null {
  if (!bolge.length || !W || !H) return null;
  const x0 = Math.min(...bolge.map((b) => b.x)) - 10, x1 = Math.max(...bolge.map((b) => b.x + b.w)) + 10;
  const y0 = Math.min(...bolge.map((b) => b.y)) - 6, y1 = Math.max(...bolge.map((b) => b.y + b.h)) + 6;
  const k = Math.max(0.15, Math.min(1.5, Math.min((W - 24) / (x1 - x0), (H - ust - alt - 24) / (y1 - y0))));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (ust - alt) / 2 / k, k };
}
// Yakınlık sınırı (zo-kontrol atZumSinir): en uzak bütün atölyenin biraz dışı, en yakın bir tezgâhın okunduğu ölçü.
export const yakinlikSiniri = (f: number): [number, number] => [Math.max(0.12, f * 0.7), Math.max(1.6, f * 1.3)];
export const ekrana = (kam: Kamera, W: number, H: number, wx: number, wy: number): [number, number] => [(wx - kam.x) * kam.k + W / 2, (wy - kam.y) * kam.k + H / 2];
export const dunyaya = (kam: Kamera, W: number, H: number, sx: number, sy: number): [number, number] => [(sx - W / 2) / kam.k + kam.x, (sy - H / 2) / kam.k + kam.y];
// Noktayı yerinde tutarak yakınlaşır (atZumla).
export function yakinlas(kam: Kamera, W: number, H: number, oran: number, sinir: [number, number], sx = W / 2, sy = H / 2): Kamera {
  const [wx, wy] = dunyaya(kam, W, H, sx, sy); const k = Math.max(sinir[0], Math.min(sinir[1], kam.k * oran));
  const n = { ...kam, k }; const [nx, ny] = dunyaya(n, W, H, sx, sy); return { x: kam.x + wx - nx, y: kam.y + wy - ny, k };
}

// --- zaman şeridindeki sipariş bitişleri (atIz): üst üste binenler üç sıraya dağılır; şeridin ötesinde bitenler sayıdır ---
export const gecMetin = (h: number | null): string => (h == null || !Number.isFinite(h) ? 'belirsiz süre' : h >= 24 ? `${sayiYaz(h / 24, 1)} gün` : `${sayiYaz(Math.max(h, 0.1), 1)} saat`);
export interface BitisIzi { id: string; x: number; ln: number; gec: boolean; C: number; T: number | null; due: number | null }
export function bitisIzleri(D: PlanVerisi, s: Sahne, cx: Derleme): { ic: BitisIzi[]; ote: string[] } {
  const now = s.now; const W = s.son - now;
  const l = D.siparisler.filter((x) => !x.havuz && s.J[x.id] && Number.isFinite(s.J[x.id]?.C ?? Number.NaN))
    .map((x) => ({ id: x.id, C: s.J[x.id]?.C ?? 0, T: s.J[x.id]?.T ?? null, due: cx.jobs[x.id]?.due ?? null })).sort((a, b) => a.C - b.C);
  const sira = [-1e9, -1e9, -1e9]; const ic: BitisIzi[] = [];
  for (const o of l.filter((z) => z.C <= now + W)) {
    const p = Math.max(0, (o.C - now) / W * 100); let ln = sira.findIndex((v) => p - v > 1.4); if (ln < 0) ln = sira.indexOf(Math.min(...sira)); sira[ln] = p;
    ic.push({ ...o, x: p / 100, ln, gec: (o.T ?? 0) > 0.05 });
  }
  return { ic, ote: l.filter((z) => z.C > now + W).map((z) => z.id) };
}

// --- kart rozetleri (z-komuta): seçili siparişin tezgâhta beklediği süre; gecikme kaynağı görünümünde tezgâhın beklettiği süre ---
export function bekleme(p: OkunanPlan, cx: Derleme, j: string): Record<string, number> {
  const a = ayristir(p, cx, j); const m: Record<string, number> = {};
  if (a && a !== 'eksik') for (const [k, ad, v] of a.kaynak) if (k === 'tezgah') m[ad] = (m[ad] ?? 0) + v;
  return m;
}
export interface GecikmeEtkisi { m: Record<string, { v: number; j: Set<string> }>; en: number }
export function gecikmeEtkisi(D: PlanVerisi, p: OkunanPlan, cx: Derleme): GecikmeEtkisi {
  const m: GecikmeEtkisi['m'] = {};
  for (const x of D.siparisler) {
    const J = p.J[x.id]; if (x.havuz || !J || !((J.T ?? 0) > 0.05)) continue; const a = ayristir(p, cx, x.id); if (!a || a === 'eksik') continue;
    for (const [k, ad, v] of a.kaynak) if (k === 'tezgah') { const e = (m[ad] ??= { v: 0, j: new Set() }); e.v += v; e.j.add(x.id); }
  }
  return { m, en: Math.max(0, ...Object.values(m).map((e) => e.v)) };
}
// Sipariş rengi: siparişin listedeki sırası, on renkli seri (atIsRenk).
export const siparisRengi = (D: PlanVerisi, j: string): number => { const i = D.siparisler.findIndex((s) => s.id === j); return ((i % 10) + 10) % 10; };
