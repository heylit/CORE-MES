import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PgAdim } from '../../motor/atolye/kurallar.ts';
import type { Bolge, Kamera } from '../../motor/harita/kurallar.ts';
import { ayristir, type Derleme, type OkunanPlan, type PlanIslemi, type SureKategorisi } from '../../motor/kurallar.ts';

// Tahta kartları (zc-tahta TK_TUR, ze-rota): Başka menüsünün okumaları haritanın üstüne bırakılan kartlardır; dünya koordinatında durur,
// haritayla kayar, tutulup taşınır, küçültülür, kapatılır. Kartın tahtadaki boyu sabit bir yakınlığa göredir (KREF): her kartın belli bir yeri olur.
export type KartTuru = 'plan' | 'siparis' | 'kuyruk' | 'senaryo' | 'kisit' | 'hesap' | 'etki' | 'rota';
export interface KartTanimi { tur: KartTuru; ad: string; simge: SimgeAdi; w: number; boy: number }
export const KART_TURLERI: KartTanimi[] = [
  { tur: 'plan', ad: 'Plan', simge: 'target', w: 360, boy: 520 },
  { tur: 'siparis', ad: 'Siparişler', simge: 'list', w: 560, boy: 480 },
  { tur: 'kuyruk', ad: 'Kuyruklar', simge: 'sort', w: 620, boy: 480 },
  { tur: 'senaryo', ad: 'Senaryolar', simge: 'layers', w: 520, boy: 480 },
  { tur: 'kisit', ad: 'Kısıt ve veri', simge: 'gear', w: 540, boy: 520 },
  { tur: 'hesap', ad: 'Hesaplar', simge: 'chart', w: 520, boy: 480 },
  { tur: 'etki', ad: 'Ne neyi etkiliyor', simge: 'scan', w: 640, boy: 480 },
  { tur: 'rota', ad: 'Reçete ve Rota', simge: 'tool', w: 500, boy: 680 },
];
export const kartTanimi = (t: KartTuru): KartTanimi => KART_TURLERI.find((x) => x.tur === t) ?? (KART_TURLERI[0] as KartTanimi);
const TURLER = new Set<string>(KART_TURLERI.map((x) => x.tur));

// Yeri henüz verilmemiş kart (x: null) bir sonraki karede kart şeridinde ilk boş yere oturur.
export interface KartKaydi { tur: KartTuru; x: number | null; y: number | null; kucuk: boolean }
export const KART_ANAHTARI = 'tmi:planlama:kartlar';
export function kartlarOku(s: string | null): KartKaydi[] {
  try {
    const x: unknown = JSON.parse(s ?? 'null');
    const l = x && typeof x === 'object' && Array.isArray((x as { l?: unknown }).l) ? (x as { l: unknown[] }).l : [];
    const out: KartKaydi[] = [];
    for (const k of l) {
      if (!k || typeof k !== 'object') continue; const r = k as Record<string, unknown>;
      if (typeof r.tur !== 'string' || !TURLER.has(r.tur) || out.some((o) => o.tur === r.tur)) continue;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      out.push({ tur: r.tur as KartTuru, x: n(r.x), y: n(r.y), kucuk: r.kucuk === true });
    }
    return out;
  } catch { return []; }
}
export const kartlarYaz = (l: KartKaydi[]): string => JSON.stringify({ l });

// Açık kart öne gelir ve büyür; yeni kart sona eklenir (en üstte çizilir).
export function kartAc(l: KartKaydi[], tur: KartTuru): KartKaydi[] {
  const v = l.find((k) => k.tur === tur);
  return v ? [...l.filter((k) => k !== v), { ...v, kucuk: false }] : [...l, { tur, x: null, y: null, kucuk: false }];
}
export const kartKapat = (l: KartKaydi[], tur: KartTuru): KartKaydi[] => l.filter((k) => k.tur !== tur);
export const kartDegistir = (l: KartKaydi[], tur: KartTuru): KartKaydi[] => (l.some((k) => k.tur === tur) ? kartKapat(l, tur) : kartAc(l, tur));
export const kartKucult = (l: KartKaydi[], tur: KartTuru): KartKaydi[] => l.map((k) => (k.tur === tur ? { ...k, kucuk: !k.kucuk } : k));

// --- yer (ze-rota tkBosYer, tkSeritBasi, tkToparla, tkSigdirHepsi, tkGoster) ---
export const KREF = 0.5;
const ARA = 24; const ADIM = 30; const KUCUK_BOY = 48;
export interface Kutu { x: number; y: number; w: number; h: number }
// Kartın ekrandaki genişliği (KREF yakınlığında piksel) ve tam boyu.
export type KartOlcusu = (tur: KartTuru) => number;
export function dunyaKutusu(k: KartKaydi, w: number): Kutu {
  return { x: k.x ?? 0, y: k.y ?? 0, w: w / KREF, h: (k.kucuk ? KUCUK_BOY : kartTanimi(k.tur).boy) / KREF };
}
export const atolyeKutulari = (bolge: Bolge[]): Kutu[] => bolge.map((b) => ({ x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 }));
const cakisir = (a: Kutu, b: Kutu, g: number) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
// (x, y)'ye en yakın boş yer: atölye bölgeleri ve öteki kartlar doludur.
export function bosYer(k0: Kutu, engel: Kutu[]): [number, number] {
  const g = ARA / KREF; const bos = (x: number, y: number) => !engel.some((e) => cakisir({ ...k0, x, y }, e, g));
  if (bos(k0.x, k0.y)) return [k0.x, k0.y];
  for (let r = 1; r < 140; r++) {
    let en: [number, number] | null = null; let ed = Infinity;
    for (let i = -r; i <= r; i++) {
      for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]] as [number, number][]) {
        const x = k0.x + dx * ADIM, y = k0.y + dy * ADIM; if (!bos(x, y)) continue;
        const d = dx * dx + dy * dy; if (d < ed) { ed = d; en = [x, y]; }
      }
    }
    if (en) return en;
  }
  return [k0.x, k0.y];
}
// Atölyenin sağındaki kart şeridinin başı.
export function seritBasi(bolge: Bolge[]): [number, number] {
  const b = atolyeKutulari(bolge); if (!b.length) return [0, 0];
  return [Math.max(...b.map((e) => e.x + e.w)) + ARA / KREF, Math.min(...b.map((e) => e.y))];
}
// Yeri olmayan kart şeritte sütun sütun ilk boş yere oturur (sütun boyu atölyenin boyu kadar); bırakılan kart başka kartın ya da atölyenin üstündeyse
// en yakın boş yere kayar.
export function yerlestir(l: KartKaydi[], olcu: KartOlcusu, bolge: Bolge[]): KartKaydi[] {
  const [sx, sy] = seritBasi(bolge); const at = atolyeKutulari(bolge); const yuk = at.length ? Math.max(...at.map((e) => e.y + e.h)) - sy : 0;
  const g = ARA / KREF; const out = [...l];
  out.forEach((k, i) => {
    if (k.x !== null && k.y !== null) return;
    const b = dunyaKutusu({ ...k, x: sx, y: sy }, olcu(k.tur));
    const engel = [...at, ...out.filter((o, j) => j !== i && o.x !== null).map((o) => dunyaKutusu(o, olcu(o.tur)))];
    const bos = (x: number, y: number) => !engel.some((e) => cakisir({ ...b, x, y }, e, g));
    let yer: [number, number] | null = null;
    for (let x = sx; !yer && x < sx + 200 * ADIM * 2; x += ADIM * 2) {
      for (let y = sy; y <= sy + Math.max(0, yuk - b.h); y += ADIM * 2) if (bos(x, y)) { yer = [x, y]; break; }
    }
    const [x, y] = yer ?? bosYer(b, engel); out[i] = { ...k, x, y };
  });
  return out;
}
// Kartları bölgelere diz (tkToparla): şeritte sütun sütun, sütun boyu atölyenin boyu kadar.
export function diz(l: KartKaydi[], olcu: KartOlcusu, bolge: Bolge[]): KartKaydi[] {
  if (!l.length) return l;
  const [x0, y0] = seritBasi(bolge); const at = atolyeKutulari(bolge); const yuk = at.length ? Math.max(...at.map((e) => e.y + e.h)) - y0 : 0; const g = ARA / KREF;
  let x = x0, y = y0, kol = 0;
  return l.map((k) => {
    const b = dunyaKutusu(k, olcu(k.tur));
    if (y > y0 && y + b.h > y0 + Math.max(yuk, b.h)) { x += kol + g; y = y0; kol = 0; }
    const r = { ...k, x, y }; y += b.h + g; kol = Math.max(kol, b.w); return r;
  });
}
// Atölye ve kartların hepsi ekrana sığar (tkSigdirHepsi); üstte çubuk, altta oynatıcı payı.
export function hepsiniSigdir(kutular: Kutu[], W: number, H: number, ust: number, alt: number): Kamera | null {
  if (!kutular.length || !W || !H) return null;
  const x0 = Math.min(...kutular.map((b) => b.x)), x1 = Math.max(...kutular.map((b) => b.x + b.w));
  const y0 = Math.min(...kutular.map((b) => b.y)), y1 = Math.max(...kutular.map((b) => b.y + b.h));
  const k = Math.max(0.15, Math.min(1.5, (W - 24) / Math.max(1, x1 - x0), (H - ust - alt - 16) / Math.max(1, y1 - y0)));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (ust - alt) / 2 / k, k };
}
// Kart ekranda okunur görünmüyorsa kamera kayar (tkGoster): önce atölyeyle birlikte, kart okunur kalıyorsa; olmazsa kart sağa yaslanır.
export function gosterKamerasi(b: Kutu, at: Kutu[], kam: Kamera, W: number, H: number, ust: number, alt: number): Kamera | null {
  const u = ust + 48, a = alt + 8;
  const [sx, sy] = [(b.x - kam.x) * kam.k + W / 2, (b.y - kam.y) * kam.k + H / 2];
  if (kam.k / KREF >= 0.7 && sx >= 16 && sx + b.w * kam.k <= W - 8 && sy >= u - 8 && sy < H - a - 200) return null;
  const hep = [b, ...at];
  const x0 = Math.min(...hep.map((e) => e.x)), x1 = Math.max(...hep.map((e) => e.x + e.w)), y0 = Math.min(...hep.map((e) => e.y));
  const y1 = Math.max(...at.map((e) => e.y + e.h), b.y + Math.min(b.h, 600 / KREF));
  const kb = Math.min(1.4 * KREF, (W - 40) / Math.max(1, x1 - x0), (H - u - a) / Math.max(1, y1 - y0));
  if (kb / KREF >= 0.62) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (u - a) / 2 / kb, k: kb };
  return { x: b.x + b.w - (W / 2 - 16) / KREF, y: b.y + (H / 2 - u) / KREF, k: KREF };
}
// Kartın ölçeği yakınlıkla büyüyüp küçülür; okunurluk için en çok 1,4.
export const kartOrani = (k: number): number => Math.min(1.4, k / KREF);

// --- Plan kartı (z-komuta kmPlan) ---
export interface PlanKarti { late: number; n: number; wT: number; en: { m: string; n: number; v: number } | null }
export function planKarti(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): PlanKarti {
  const m: Record<string, { v: number; j: Set<string> }> = {};
  for (const s of c.D.siparisler) {
    const J = p.J[s.id]; if (s.havuz || !J || !((J.T ?? 0) > 0.05)) continue; const a = ayristir(p, cx, s.id); if (!a || a === 'eksik') continue;
    for (const [k, ad, v] of a.kaynak) if (k === 'tezgah') { const e = (m[ad] ??= { v: 0, j: new Set() }); e.v += v; e.j.add(s.id); }
  }
  const en = Object.entries(m).sort((a, b) => b[1].v - a[1].v)[0];
  return { late: p.ozet.late, n: p.ozet.n, wT: p.ozet.wT, en: en ? { m: en[0], n: en[1].j.size, v: en[1].v } : null };
}

// --- Siparişler kartı (za-merkez mzSiparis) ---
export type SiparisSuzgeci = 'hepsi' | 'gec' | 'degisen';
export type SiparisSirasi = 'gecikme' | 'termin' | 'bitis' | 'oncelik';
export interface SiparisSatiri {
  id: string; urun: string; oncelik: number; due: number | null; C: number | null; T: number | null; gec: boolean; fark: number | null;
  belirleyen: { tur: 'kaynak'; k: SureKategorisi; ad: string; v: number } | { tur: 'kategori'; k: SureKategorisi } | null;
}
// Bitişi değişen: siparişin bütün işleri canlıdaysa canlıdaki bitişine göre, çeyrek saatten çok.
export function bitisFarki(p: OkunanPlan, canli: Record<string, PgAdim> | null): Record<string, number> {
  const out: Record<string, number> = {}; if (!canli) return out;
  const ref: Record<string, number | null> = {};
  for (const r of Object.values(p.ops)) { const x = canli[r.id]; const o = ref[r.job]; if (o === null) continue; ref[r.job] = x && Number.isFinite(x.C) ? Math.max(o ?? -Infinity, x.C) : null; }
  for (const [j, C] of Object.entries(ref)) { const n = p.J[j]?.C; if (C != null && n != null && Number.isFinite(n) && Math.abs(n - C) > 0.25) out[j] = n - C; }
  return out;
}
export function siparisSatirlari(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, suz: SiparisSuzgeci, sira: SiparisSirasi, fark: Record<string, number>): SiparisSatiri[] {
  let l = c.D.siparisler.filter((x) => !x.havuz && p.J[x.id]);
  if (suz === 'gec') l = l.filter((x) => (p.J[x.id]?.T ?? 0) > 0.05); else if (suz === 'degisen') l = l.filter((x) => fark[x.id] != null);
  const satir = l.map((x): SiparisSatiri => {
    const J = p.J[x.id]; const a = ayristir(p, cx, x.id); let belirleyen: SiparisSatiri['belirleyen'] = null;
    if (a && a !== 'eksik') {
      const k = [...a.kaynak].sort((u, v) => v[2] - u[2])[0];
      if (k && k[2] >= 0.5) belirleyen = { tur: 'kaynak', k: k[0], ad: k[1], v: k[2] };
      else { const s = (Object.keys(a.seg) as SureKategorisi[]).sort((u, v) => (a.seg[v] ?? 0) - (a.seg[u] ?? 0))[0]; if (s) belirleyen = { tur: 'kategori', k: s }; }
    }
    const urun = c.D.urunler.find((u) => u.id === x.urun)?.ad ?? x.urun ?? '';
    return { id: x.id, urun, oncelik: Number(x.oncelik) || 2, due: cx.jobs[x.id]?.due ?? null, C: J?.C ?? null, T: J?.T ?? null, gec: (J?.T ?? 0) > 0.05, fark: fark[x.id] ?? null, belirleyen };
  });
  const due = (s: SiparisSatiri) => s.due ?? Infinity;
  const sirala: Record<SiparisSirasi, (a: SiparisSatiri, b: SiparisSatiri) => number> = {
    termin: (a, b) => due(a) - due(b),
    oncelik: (a, b) => a.oncelik - b.oncelik || due(a) - due(b),
    bitis: (a, b) => (a.C ?? 1e9) - (b.C ?? 1e9),
    gecikme: (a, b) => (b.T ?? 0) - (a.T ?? 0) || due(a) - due(b),
  };
  return satir.sort(sirala[sira]);
}

// --- Kuyruklar kartı (za-merkez mzGruplar, mzGrupSec, mzKuyrukListe) ---
export const KUYRUK_GOSTERIM = 14;
export function kuyrukGruplari(c: PlanlamaCalismasi): string[] { const g: string[] = []; for (const m of c.D.tezgahlar) if (m.grup && !g.includes(m.grup)) g.push(m.grup); return g; }
// Seçili adımın ya da tezgâhın grubu, yoksa seçilen grup; o da yoksa sırası değişebilsin diye en az iki tezgâhlı en yüklü grup.
export function kuyrukGrubu(c: PlanlamaCalismasi, p: OkunanPlan, secim: { adim: string | null; tezgah: string | null }, secilen: string | null): string | null {
  const gl = kuyrukGruplari(c); const tg = (m: string | undefined) => c.D.tezgahlar.find((x) => x.id === m)?.grup;
  const g = tg(secim.adim ? p.ops[secim.adim]?.m : undefined) ?? tg(secim.tezgah ?? undefined) ?? secilen;
  if (g && gl.includes(g)) return g;
  const n = (x: string) => c.D.tezgahlar.filter((m) => m.grup === x).length; const yuk: Record<string, number> = {};
  for (const r of Object.values(p.ops)) { const x = tg(r.m); if (x && Number.isFinite(r.S)) yuk[x] = (yuk[x] ?? 0) + (r.C - r.S); }
  return [...gl].sort((a, b) => Number(n(b) > 1) - Number(n(a) > 1) || (yuk[b] ?? 0) - (yuk[a] ?? 0))[0] ?? null;
}
export const kuyrukListesi = (p: OkunanPlan, m: string, now: number): PlanIslemi[] =>
  Object.values(p.ops).filter((r) => r.m === m && Number.isFinite(r.S) && r.C > now).sort((a, b) => a.S - b.S);

// --- Ne neyi etkiliyor kartı (za-merkez mzAg): bekleme türü → kaynak → geç sipariş; bağın kalınlığı beklenen saat ---
export const TUR_AD: Partial<Record<SureKategorisi, string>> = { tezgah: 'Tezgâh dolu', personel: 'Operatör', ayarci: 'Ayarcı', aparat: 'Aparat', fasonBek: 'Fason sırası', ariza: 'Arıza, bakım' };
export interface AgDugumu { n: string; x: number; y: number; ad: string; v: number; k?: SureKategorisi }
export interface AgBagi { a: string; b: string; k: SureKategorisi; v: number; d: string; kalinlik: number; j?: string }
export interface EtkiAgi { W: number; H: number; x: [number, number, number]; tur: AgDugumu[]; kaynak: AgDugumu[]; is: AgDugumu[]; bag: AgBagi[] }
export function etkiAgi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme): EtkiAgi | null {
  const A: Record<string, [SureKategorisi, string, number][]> = {};
  const gec = c.D.siparisler.filter((x) => !x.havuz && (p.J[x.id]?.T ?? 0) > 0.05)
    .map((x) => { const a = ayristir(p, cx, x.id); if (a && a !== 'eksik') A[x.id] = a.kaynak; return x.id; })
    .filter((j) => A[j]).sort((a, b) => (p.J[b]?.T ?? 0) - (p.J[a]?.T ?? 0)).slice(0, 10);
  if (!gec.length) return null;
  const kay: Record<string, { ad: string; k: SureKategorisi; v: number }> = {}; const tur: Partial<Record<SureKategorisi, number>> = {};
  const bag: { k: SureKategorisi; ad: string; j: string; v: number }[] = [];
  for (const j of gec) for (const [k, ad, v] of A[j] ?? []) { if (v < 0.25) continue; const e = (kay[ad] ??= { ad, k, v: 0 }); e.v += v; tur[k] = (tur[k] ?? 0) + v; bag.push({ k, ad, j, v }); }
  const kl = Object.values(kay).sort((a, b) => b.v - a.v).slice(0, 9); if (!kl.length) return null;
  const ks = new Set(kl.map((x) => x.ad));
  const tl = (Object.keys(tur) as SureKategorisi[]).filter((k) => kl.some((x) => x.k === k)).sort((a, b) => (tur[b] ?? 0) - (tur[a] ?? 0));
  const W = 760, H = Math.max(220, 34 * Math.max(gec.length, kl.length) + 30); const x: [number, number, number] = [130, 420, 600];
  const yer = (n: number, i: number) => 24 + (i + 0.5) * ((H - 30) / n); const en = Math.max(...kl.map((e) => e.v), 1); const ka = (v: number) => Math.max(1.5, 14 * v / en);
  const yol = (xa: number, ya: number, xb: number, yb: number) => `M${xa},${ya} C${(xa + xb) / 2},${ya} ${(xa + xb) / 2},${yb} ${xb},${yb}`;
  const tD = tl.map((k, i): AgDugumu => ({ n: `t:${k}`, x: x[0], y: yer(tl.length, i), ad: TUR_AD[k] ?? k, v: tur[k] ?? 0, k }));
  const kD = kl.map((e, i): AgDugumu => ({ n: `k:${e.ad}`, x: x[1], y: yer(kl.length, i), ad: e.ad, v: e.v, k: e.k }));
  const jD = gec.map((j, i): AgDugumu => ({ n: `j:${j}`, x: x[2], y: yer(gec.length, i), ad: j, v: p.J[j]?.T ?? 0 }));
  const yT = new Map(tD.map((d) => [d.n, d.y])), yK = new Map(kD.map((d) => [d.n, d.y])), yJ = new Map(jD.map((d) => [d.n, d.y]));
  const b1 = tl.flatMap((k) => kl.filter((e) => e.k === k).map((e): AgBagi => ({ a: `t:${k}`, b: `k:${e.ad}`, k, v: e.v, kalinlik: ka(e.v), d: yol(x[0], yT.get(`t:${k}`) ?? 0, x[1], yK.get(`k:${e.ad}`) ?? 0) })));
  const b2 = bag.filter((b) => ks.has(b.ad)).map((b): AgBagi => ({ a: `k:${b.ad}`, b: `j:${b.j}`, k: b.k, v: b.v, j: b.j, kalinlik: ka(b.v), d: yol(x[1], yK.get(`k:${b.ad}`) ?? 0, x[2], yJ.get(`j:${b.j}`) ?? 0) }));
  return { W, H, x, tur: tD, kaynak: kD, is: jD, bag: [...b1, ...b2] };
}
// Düğümün üstüne gelince yalnız ona bağlı yollar parlar; tür düğümünde türün kaynaklarından çıkan yollar da.
export function agYakinlari(ag: EtkiAgi, n: string | null): { bag: Set<AgBagi>; dugum: Set<string> } {
  const bag = new Set<AgBagi>(); const dugum = new Set<string>(n ? [n] : []); if (!n) return { bag, dugum };
  for (const b of ag.bag) if (b.a === n || b.b === n) { bag.add(b); dugum.add(b.a); dugum.add(b.b); }
  if (n.startsWith('t:')) for (const b of ag.bag) if (dugum.has(b.a)) bag.add(b);
  return { bag, dugum };
}
