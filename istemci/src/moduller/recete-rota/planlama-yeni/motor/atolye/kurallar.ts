import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';
import { acikSaat, saatOku, tabanMs, UFUK_GUN, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';

// Planlama atölyesinin saf hesapları (cerceve/planlama/parca/zz36-tezgah-panosu.betik). Motor burada koşmaz (357 b): kayıttaki çözülmüş plan
// okunur; eski panonun motorla hesapladığı çözüm yolları, öne alma ve bölme burada yoktur.

// --- ölçek ve zaman (OLCEK, t2d, zs, gs, ga, tz, sure) ---
export const OLCEKLER = [[24, 'Gün'], [72, '3 gün'], [168, 'Hafta'], [720, 'Ay'], [8760, 'Yıl']] as const;
export type AtolyeOlcegi = (typeof OLCEKLER)[number][0];
// Telefonda Gün, ötekinde 3 gün açılır.
export const ilkOlcek = (genislik: number): AtolyeOlcegi => (genislik < 768 ? 24 : 72);
export const DONUK_SECENEKLERI = [0, 2, 4, 8, 16, 24] as const;
export const ETIKET_GENIS = (genislik: number): number => (genislik < 768 ? 72 : 115);

const GUNK = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const iki = (x: number) => String(x).padStart(2, '0');
const tarih = (D: PlanVerisi, t: number): Date | null => { const b = tabanMs(D); return b === null ? null : new Date(b + t * 3_600_000); };
const gecerli = (t: number | null | undefined): t is number => t != null && Number.isFinite(t);
export function zs(D: PlanVerisi, t: number | null | undefined): string { const d = gecerli(t) ? tarih(D, t) : null; return d ? `${iki(d.getUTCHours())}:${iki(d.getUTCMinutes())}` : '—'; }
export function gs(D: PlanVerisi, t: number | null | undefined): string { const d = gecerli(t) ? tarih(D, t) : null; return d ? `${GUNK[d.getUTCDay()] ?? ''} ${d.getUTCDate()}` : '—'; }
export function ga(D: PlanVerisi, t: number | null | undefined): string { const d = gecerli(t) ? tarih(D, t) : null; return d ? `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)}` : '—'; }
export const tz = (D: PlanVerisi, t: number | null | undefined): string => (gecerli(t) ? `${gs(D, t)} ${zs(D, t)}` : '—');
// Süre: 48 saatten uzunu gün, kısası saat.
export function sure(h: number | null | undefined): string {
  if (!gecerli(h)) return '—';
  const a = Math.abs(h);
  return a >= 48 ? `${(a / 24).toFixed(1).replace('.', ',')} g` : `${Math.round(a)} sa`;
}
export const isaretliSure = (d: number): string => (Math.abs(d) < 0.25 ? '±0' : `${d > 0 ? '+' : '−'}${sure(d)}`);

// --- sipariş (sipBilgi, siparisler) ---
export type SiparisDurumu = 'gec' | 'risk' | 'iyi';
// 8 saatten az payı kalan sipariş riskli.
export const RISK_PAYI = 8;
export interface SiparisBilgisi {
  id: string; ad: string; adet: number; oncelik: number; ops: PlanIslemi[];
  // bas: malzemenin ve serbest bırakmanın izin verdiği en erken an; ur: ilk işlemin başlangıcı.
  bas: number; ur: number | null; C: number | null; due: number | null; T: number | null; pay: number | null; durum: SiparisDurumu;
}
export function sipBilgi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, hazir: Record<string, number>, jid: string): SiparisBilgisi | null {
  const j = cx.jobs[jid]; if (!j) return null;
  const ops = j.ops.map((o) => p.ops[o.id]).filter((r): r is PlanIslemi => !!r && Number.isFinite(r.S));
  const ur = ops.length ? Math.min(...ops.map((r) => r.S)) : null;
  let bas = cx.now; if (j.rel != null) bas = Math.max(bas, j.rel);
  const mr = hazir[jid]; if (mr != null && Number.isFinite(mr)) bas = Math.max(bas, mr);
  const J = p.J[jid]; const C = J?.C ?? null; const due = j.due;
  const pay = due != null && C != null ? due - C : null;
  const T = J?.T ?? null;
  const durum: SiparisDurumu = (T ?? 0) > 0.01 || C == null ? 'gec' : pay != null && pay < RISK_PAYI ? 'risk' : 'iyi';
  const s = c.D.siparisler.find((x) => x.id === jid);
  const ad = c.D.urunler.find((u) => u.id === s?.urun)?.ad ?? s?.urun ?? '';
  return { id: jid, ad, adet: j.adet, oncelik: j.oncelik, ops, bas, ur, C, due, T, pay, durum };
}
// En riskli üstte: gecikme büyükten, sonra pay küçükten.
// Elle sıra (eski tpSira) varsa liste o sıradadır; sırada olmayan sipariş eskisi gibi başa gelir (indexOf -1).
export function siparisler(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, hazir: Record<string, number>): SiparisBilgisi[] {
  const L = Object.keys(cx.jobs).map((id) => sipBilgi(c, p, cx, hazir, id)).filter((x): x is SiparisBilgisi => x !== null);
  const sira = elleSira(c);
  if (sira.length) return L.sort((a, b) => sira.indexOf(a.id) - sira.indexOf(b.id));
  return L.sort((a, b) => (b.T ?? 0) - (a.T ?? 0) || (a.pay ?? 1e9) - (b.pay ?? 1e9));
}
export function elleSira(c: PlanlamaCalismasi): string[] {
  const s = c.tpSira; if (!Array.isArray(s)) return [];
  const kayitli = new Set(c.D.siparisler.map((x) => x.id));
  return s.filter((j): j is string => typeof j === 'string' && kayitli.has(j));
}
export const SIPARIS_GRUPLARI = [['gec', 'Geciken', 'alert'], ['risk', `Riskli · ${RISK_PAYI} sa’ten az pay`, 'clock'], ['iyi', 'Zamanında', 'check']] as const;
// Malzeme tahmini üretim başlangıcından sonra.
export const malzemeGec = (s: SiparisBilgisi): boolean => s.ur != null && s.bas > s.ur + 0.25;
// Sipariş numarasının parça eki (/2) ayrı yazılır.
export function parcaAyir(id: string): [string, string | null] { const m = /^(.*)(\/\d+)$/.exec(id); return m ? [m[1] ?? id, m[2] ?? null] : [id, null]; }
export const ONCELIK_KISA: Record<number, string> = { 1: 'acil', 2: 'normal', 3: 'düşük' };

// --- bekleme nedeni (NEDEN) ---
const NEDEN: Record<string, string> = {
  tezgah: 'tezgâh dolu', personel: 'operatör yok', yetkin: 'yetkin operatör yok', ayarci: 'ayarcı yok', aparat: 'aparat dolu', malzeme: 'malzeme bekliyor',
  program: 'NC program bekliyor', serbest: 'serbest bırakma tarihi', rota: 'önceki adımı bekliyor', kilit: 'kilitli saat', ariza: 'arıza', simdi: 'hemen başlıyor', plan: 'plan',
  uyari: 'uyarı', 'fason-cikis': 'fasoncu çıkış günü', 'fason-kap': 'fasoncu dolu', oneri: 'öneri saati',
};
export function nedenKisa(r: PlanIslemi): string {
  const w = r.why; if (!w || !NEDEN[w.t]) return '—';
  return (NEDEN[w.t] ?? '') + (w.t === 'tezgah' && w.r ? ` (${w.r} bitişini bekliyor)` : '');
}

// --- sipariş akışı (akis): rota sırasıyla işlemler, hazır olduğu an, bekleme ve nedeni, bitişi belirleyen zincir ---
export interface AkisAdimi { id: string; k: string; ad: string; r: PlanIslemi; hazir: number; onc: string | null; bek: number; neden: string | null; kritik: boolean }
export interface Akis { L: AkisAdimi[]; bas0: number; malzeme: boolean }
export function akis(p: OkunanPlan, cx: Derleme, hazir: Record<string, number>, jid: string): Akis | null {
  const j = cx.jobs[jid]; if (!j) return null;
  let bas0 = cx.now; if (j.rel != null) bas0 = Math.max(bas0, j.rel);
  const mr = hazir[jid]; if (mr != null && Number.isFinite(mr)) bas0 = Math.max(bas0, mr);
  const L: AkisAdimi[] = [];
  for (const o of j.ops) {
    const r = p.ops[o.id]; if (!r || !Number.isFinite(r.C)) continue;
    let h = o.pr.length ? -Infinity : bas0; let kim: string | null = null;
    for (const [pid, ty] of o.pr) {
      const q = p.ops[pid]; if (!q) continue;
      const t = (ty === 'o' && !q.fas ? q.lot1 ?? q.C : q.C) + (q.fas || r.fas ? 0 : cx.tasima);
      if (t > h) { h = t; kim = pid; }
    }
    const hz = Number.isFinite(h) ? h : bas0;
    const w = r.why;
    const neden = w && !['simdi', 'rota', 'plan'].includes(w.t)
      ? (NEDEN[w.t] ?? w.t) + (w.r && w.t !== 'tezgah' ? ` (${w.r})` : w.t === 'tezgah' && w.r ? ` (${w.r} bitişini bekliyor)` : '') : null;
    L.push({ id: o.id, k: o.id.slice(jid.length + 1), ad: o.ad, r, hazir: hz, onc: kim, bek: Math.max(0, r.S - hz), neden, kritik: false });
  }
  L.sort((a, b) => a.r.S - b.r.S || a.k.localeCompare(b.k));
  const by = new Map(L.map((x) => [x.id, x]));
  let son = L.reduce<AkisAdimi | null>((a, b) => (!a || b.r.C > a.r.C ? b : a), null);
  while (son && !son.kritik) { son.kritik = true; son = son.onc ? by.get(son.onc) ?? null : null; }
  return { L, bas0, malzeme: j.malzeme.length > 0 };
}
// Bitişi belirleyen zincirdeki son bekleme nedeni (Bugün listesinin "asıl bekleme"si).
export function asilBekleme(a: Akis | null): string | null {
  const w = a?.L.filter((x) => x.kritik && x.neden).pop();
  return w?.neden ? w.neden.replace(/ \(.*\)$/, '') : null;
}

// Öznitelik seçicisi için kaçış (CSS.escape her ortamda yok).
export const secKacis = (s: string): string => s.replace(/["\\]/g, '\\$&');

// --- süzgeç (suzUyar, tezGrup, suzKoy) ---
export interface Suzgec { g: string | null; m: string | null; j: string | null }
export const suzSayisi = (f: Suzgec | null): number => (f ? [f.g, f.m, f.j].filter(Boolean).length : 0);
export function tezGrup(D: PlanVerisi, m: string): string { return D.tezgahlar.find((x) => x.id === m)?.grup ?? 'fason'; }
export function suzUyar(D: PlanVerisi, f: Suzgec | null, r: PlanIslemi): boolean {
  if (!f) return true;
  return (!f.g || tezGrup(D, r.m) === f.g) && (!f.m || r.m === f.m) && (!f.j || r.job === f.j || r.job.startsWith(`${f.j}/`));
}
// Aynısına yeniden dokunmak kaldırır; istasyon değişince ona uymayan tezgâh düşer; hepsi boşsa süzgeç kalkar.
export function suzKoy(D: PlanVerisi, f: Suzgec | null, k: keyof Suzgec, v: string | null): Suzgec | null {
  const y: Suzgec = { g: null, m: null, j: null, ...f }; y[k] = y[k] === v ? null : v;
  if (k === 'g' && y.m && y.g && tezGrup(D, y.m) !== y.g) y.m = null;
  return y.g || y.m || y.j ? y : null;
}
export const grupAd = (g: string): string => (g ? g[0]?.toLocaleUpperCase('tr-TR') + g.slice(1) : g);

// --- pano satırları ve ufuk (satirlar, ufuk) ---
export interface PanoSatiri { m: string; ad: string; grup: string; son: boolean; fason: boolean }
export function satirlar(D: PlanVerisi, p: OkunanPlan): PanoSatiri[] {
  const R: PanoSatiri[] = D.tezgahlar.map((m) => ({ m: m.id, ad: m.ad ?? '', grup: m.grup ?? '', son: false, fason: false }));
  const fas = new Set(Object.values(p.ops).filter((r) => r.fas).map((r) => r.m));
  for (const f of D.fasoncular ?? []) if (fas.has(`@${f.id}`)) R.push({ m: `@${f.id}`, ad: f.ad ?? '', grup: 'fason', son: false, fason: true });
  R.forEach((r, i) => { r.son = R[i + 1]?.grup !== r.grup; });
  return R;
}
export const UFUK_SAAT = UFUK_GUN * 24;
// Son bitişten bir gün sonrası; motorun ufku en çok 63 gündür. Ay ve yıl ölçeği en az ölçek kadar uzanır.
export function ufuk(p: OkunanPlan, olcek: AtolyeOlcegi): number {
  let mx = 0; for (const r of Object.values(p.ops)) if (Number.isFinite(r.C)) mx = Math.max(mx, r.C);
  const h = Math.min(UFUK_SAAT, Math.ceil((mx + 24) / 24) * 24 + 24);
  return olcek > 168 ? Math.max(h, olcek) : h;
}
// Saat başına piksel: görünen genişlik ölçeğe sığar; hafta ve altında saat en az 4 piksel.
export const saatPiksel = (genislik: number, olcek: AtolyeOlcegi): number => Math.max(olcek > 168 ? 0.01 : 4, genislik / olcek);

// --- doluluk ve darboğaz (görünen sürede işlenen saat / açık saat; en dolu tezgâh %85 üstündeyse darboğaz) ---
export const DARBOGAZ = 0.85;
export function doluluklar(D: PlanVerisi, p: OkunanPlan, cx: Derleme, u0: number, u1: number): Record<string, number> {
  const yuk: Record<string, number> = {};
  for (const r of Object.values(p.ops)) if (Number.isFinite(r.C) && r.S < u1 && r.C > u0) yuk[r.m] = (yuk[r.m] ?? 0) + Math.min(r.C, u1) - Math.max(r.S, u0);
  const o: Record<string, number> = {};
  for (const t of D.tezgahlar) { const M = cx.M[t.id]; o[t.id] = M ? Math.min(1, (yuk[t.id] ?? 0) / Math.max(1, acikSaat(M.rw, u0, u1))) : 0; }
  return o;
}
export function darbogaz(o: Record<string, number>): string | null {
  let dar: string | null = null, en = DARBOGAZ;
  for (const [m, x] of Object.entries(o)) if (x >= en) { en = x; dar = m; }
  return dar;
}

// --- zaman ekseni başlıkları ---
export interface GunBasligi { x: number; w: number; ad: string; tatil: boolean; haftaBasi: boolean; kisa: boolean; baslik: string | null }
export interface SaatIsareti { x: number; ad: string }
const tatilMi = (cx: Derleme, d: number): boolean => !(cx.gunler[d]?.length);
export function zamanBasliklari(D: PlanVerisi, cx: Derleme, H: number, k: number, olcek: AtolyeOlcegi): { gunler: GunBasligi[]; saatler: SaatIsareti[] } {
  const gunler: GunBasligi[] = [], saatler: SaatIsareti[] = [];
  if (olcek <= 168) {
    const adim = olcek <= 24 ? 2 : olcek <= 72 ? 6 : 12;
    for (let d = 0; d * 24 < H; d++) {
      const x = d * 24 * k, tat = tatilMi(cx, d);
      gunler.push({ x, w: 24 * k, ad: `${gs(D, d * 24)}${tat ? ' · kapalı' : ''}`, tatil: tat, haftaBasi: false, kisa: false, baslik: null });
      for (let h = adim; h < 24; h += adim) saatler.push({ x: x + h * k, ad: iki(h) });
    }
  } else if (olcek <= 720) {
    for (let d = 0; d * 24 < H; d++) {
      const t = tarih(D, d * 24);
      gunler.push({ x: d * 24 * k, w: 24 * k, ad: String(t?.getUTCDate() ?? ''), tatil: tatilMi(cx, d), haftaBasi: t?.getUTCDay() === 1, kisa: true, baslik: tz(D, d * 24).slice(0, -6) });
    }
  } else {
    const b = tabanMs(D);
    if (b !== null) {
      const t0 = new Date(b); let y = t0.getUTCFullYear(), m = t0.getUTCMonth();
      for (;;) {
        const x0 = (Date.UTC(y, m, 1) - b) / 3_600_000; if (x0 >= H) break;
        const x1 = Math.min(H, (Date.UTC(y, m + 1, 1) - b) / 3_600_000), a = Math.max(0, x0);
        gunler.push({ x: a * k, w: (x1 - a) * k, ad: `${AYK[m] ?? ''}${m === 0 ? ` ${y}` : ''}`, tatil: false, haftaBasi: false, kisa: true, baslik: null });
        if (++m > 11) { m = 0; y++; }
      }
    }
  }
  return { gunler, saatler };
}
// Kapalı saatler: tezgâhın açık pencerelerinin arası.
export function kapaliAraliklar(cx: Derleme, m: string, H: number): [number, number][] {
  const M = cx.M[m]; if (!M) return [];
  const o: [number, number][] = []; let t = 0;
  for (const [a, b] of M.rw) { if (a >= H) break; if (a > t) o.push([t, a]); t = b; }
  if (t < H) o.push([t, H]);
  return o;
}
// Yıl ölçeği: haftalık doluluk hücresi (çubuklar okunmaz kadar küçük).
export interface HaftaHucresi { w0: number; oran: number }
export function haftaHucreleri(cx: Derleme, m: string, ops: PlanIslemi[], H: number): HaftaHucresi[] {
  const M = cx.M[m]; const o: HaftaHucresi[] = [];
  for (let w0 = 0; w0 < Math.min(H, UFUK_SAAT); w0 += 168) {
    const w1 = w0 + 168, ac = M ? acikSaat(M.rw, w0, w1) : 168;
    let is = 0; for (const r of ops) is += Math.max(0, Math.min(r.C, w1) - Math.max(r.S, w0));
    if (is < 0.05) continue;
    o.push({ w0, oran: Math.min(1, is / Math.max(1, ac)) });
  }
  return o;
}

// --- çubuk (cizCubuk) ---
export interface Gerceklesen { S: number; plan: number | null; n: number | null }
export function gercekOku(c: PlanlamaCalismasi, id: string): Gerceklesen | null {
  const g = c.gercek; const x = g && typeof g === 'object' ? (g as Record<string, unknown>)[id] : null;
  if (!x || typeof x !== 'object') return null;
  const y = x as Record<string, unknown>; if (typeof y.S !== 'number') return null;
  return { S: y.S, plan: typeof y.plan === 'number' ? y.plan : null, n: typeof y.n === 'number' ? y.n : null };
}
// Çalışan işin ilerlemesi: sayım varsa işlenen adet, yoksa geçen sürenin oranı (391 a).
export function ilerleme(r: PlanIslemi, g: Gerceklesen | null, adet: number, now: number): number | null {
  const calisiyor = !r.fas && (g || (r.S < now - 1e-6 && r.C > now));
  if (!calisiyor) return null;
  if (g) return g.n != null && adet ? g.n / adet : 0;
  return (now - r.S) / Math.max(1e-6, r.C - r.S);
}
export const sabitMi = (r: PlanIslemi, now: number, donuk: number): boolean => r.act || r.S < now + donuk - 1e-6;
// Çubuğun yazısı genişliğe göre: sipariş, adım, adım adı; dar çubukta sipariş numarasının sonu.
export function cubukYazisi(r: PlanIslemi, k: string, ad: string, w: number): { b: string; ek: string; alt: string } | null {
  if (w > 46) return { b: r.job, ek: w > 80 ? ` · ${k}` : '', alt: w > 110 ? ad : '' };
  if (w > 22) return { b: r.job.replace(/^\D+-?/, '').slice(-3), ek: '', alt: '' };
  return null;
}

// --- bugün, sabah brifingi, tezgâh günlüğü ---
export function yukOranlari(D: PlanVerisi, p: OkunanPlan, cx: Derleme, u0: number, u1: number): { m: string; ad: string; oran: number }[] {
  const o = doluluklar(D, p, cx, u0, u1);
  return D.tezgahlar.map((t) => ({ m: t.id, ad: t.ad ?? '', oran: o[t.id] ?? 0 })).sort((a, b) => b.oran - a.oran);
}
export interface Durus { m: string; from: number; to: number }
export function duruslar(c: PlanlamaCalismasi): Durus[] {
  const o: Durus[] = [];
  for (const d of c.down) if (typeof d.m === 'string' && typeof d.from === 'number' && typeof d.to === 'number') o.push({ m: d.m, from: d.from, to: d.to });
  return o;
}
export interface GunlukSatiri { d: number; a: number; ac: number; is: number; n: number; o: number; ariza: [number, number][]; ekMesai: string[]; gercek: { job: string; sapma: number }[] }
export function gunluk(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, m: string): GunlukSatiri[] {
  const M = cx.M[m]; const ops = Object.values(p.ops).filter((r) => r.m === m && Number.isFinite(r.C));
  return Array.from({ length: 7 }, (_, d) => {
    const a = d * 24, b = a + 24, ac = M ? acikSaat(M.rw, a, b) : 0;
    const is = ops.reduce((t, r) => t + Math.max(0, Math.min(r.C, b) - Math.max(r.S, a)), 0), n = ops.filter((r) => r.S < b && r.C > a).length;
    const gercek = ops.flatMap((r) => { const g = gercekOku(c, r.id); return g && g.S >= a && g.S < b ? [{ job: r.job, sapma: g.S - (g.plan ?? g.S) }] : []; });
    const ariza = duruslar(c).filter((x) => x.m === m && x.from < b && x.to > a).map((x): [number, number] => [Math.max(a, x.from), Math.min(b, x.to)]);
    const ekMesai = c.ekMesai.filter((e) => e.m === m && e.gun === d).map((e) => String(e.vardiya));
    return { d, a, ac, is, n, o: ac ? Math.min(1, is / ac) : 0, ariza, ekMesai, gercek };
  });
}
// Termin konuşması: müşteriye gidecek metin hazırlanır, gönderilmez. Öne alma motor ister; tarih şimdiki plandır.
export function terminMetni(c: PlanlamaCalismasi, s: SiparisBilgisi): string {
  const D = c.D; const d = D.siparisler.find((x) => x.id === s.id);
  const mus = Array.isArray(D.musteriler) ? (D.musteriler as unknown[]).find((x) => x && typeof x === 'object' && (x as Record<string, unknown>).id === d?.musteri) as Record<string, unknown> | undefined : undefined;
  const tam = (t: number | null) => { const x = gecerli(t) ? tarih(D, t) : null; return x ? `${ga(D, t)}.${x.getUTCFullYear()} ${zs(D, t)}` : '—'; };
  const C = s.C;
  const gec = C != null && s.due != null && C > s.due ? `; bu yaklaşık ${sure(C - s.due)} gecikme demek` : '';
  return `Sayın ${typeof mus?.ad === 'string' ? mus.ad : 'müşterimiz'},

${s.id} numaralı siparişiniz (${s.ad}, ${s.adet} adet) için termin ${tam(s.due)}. Güncel atölye planımıza göre en erken teslim ${tam(C)} olabiliyor${gec}.
Uygun görürseniz termini ${ga(D, C)} olarak güncelleyelim; isterseniz hazır olan adetleri önceden kısmi teslim edebiliriz.

Bilgilerinize sunarız.`;
}

// --- gün özeti (tpGun): gün başı durumu ve geçmiş günler çalışma kaydındadır (eski sayfa yazardı) ---
export interface GunDurumu { late: number; wT: number }
export interface GecmisGun { gun: string; sabah: GunDurumu; son: GunDurumu; kararlar: { t: number; ad: string }[]; onaylar: { t: number; ad: string }[] }
export interface GunKaydi { basi: { gun: string; e: GunDurumu & { J: Record<string, { C: number | null; T: number | null }> }; surum: number } | null; gecmis: GecmisGun[] }
const nesne = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const gunDurumu = (v: unknown): GunDurumu | null => (nesne(v) && typeof v.late === 'number' && typeof v.wT === 'number' ? { late: v.late, wT: v.wT } : null);
export function gunKaydi(c: PlanlamaCalismasi): GunKaydi {
  const g = c.tpGun; if (!nesne(g)) return { basi: null, gecmis: [] };
  let basi: GunKaydi['basi'] = null;
  if (nesne(g.basi) && typeof g.basi.gun === 'string') {
    const e = g.basi.e; const d = gunDurumu(e);
    const J: Record<string, { C: number | null; T: number | null }> = {};
    if (d && nesne(e) && nesne(e.J)) for (const [j, x] of Object.entries(e.J)) if (nesne(x)) J[j] = { C: typeof x.C === 'number' ? x.C : null, T: typeof x.T === 'number' ? x.T : null };
    if (d) basi = { gun: g.basi.gun, e: { ...d, J }, surum: typeof g.basi.surum === 'number' ? g.basi.surum : 0 };
  }
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter(nesne).map((x) => ({ t: Number(x.t) || 0, ad: String(x.ad ?? '') })) : []);
  const gecmis: GecmisGun[] = [];
  if (nesne(g.gecmis)) for (const [gun, x] of Object.entries(g.gecmis)) {
    const sabah = nesne(x) ? gunDurumu(x.sabah) : null, son = nesne(x) ? gunDurumu(x.son) : null;
    if (nesne(x) && sabah && son) gecmis.push({ gun, sabah, son, kararlar: liste(x.kararlar), onaylar: liste(x.onaylar) });
  }
  return { basi, gecmis: gecmis.sort((a, b) => b.gun.localeCompare(a.gun)) };
}
// Eski gunBasla ve gunKaydet: gün başı yoksa ya da başka günse şimdiki plan gün başı olur; bugünün satırı (sabah, son, kararlar, onaylar) güncellenir;
// en çok 90 gün tutulur. Değişmediyse null (gereksiz yazma yok).
export const IZ_KARAR = /^(Plan elle değişti|Deneme ana plana alındı)$/;
export const IZ_ONAY = /onay|canlı/i;
export function gunYeni(c: PlanlamaCalismasi, p: OkunanPlan, k: string): Record<string, unknown> | null {
  const g = nesne(c.tpGun) ? c.tpGun : {};
  const gecmis: Record<string, unknown> = nesne(g.gecmis) ? { ...g.gecmis } : {};
  const J: Record<string, { C: number | null; T: number | null }> = {};
  for (const [j, x] of Object.entries(p.J)) J[j] = { C: x.C, T: x.T };
  const eski = nesne(g.basi) && g.basi.gun === k ? g.basi : null;
  const basi = eski ?? { gun: k, e: { wT: p.ozet.wT, late: p.ozet.late, J }, surum: c.canliSurum };
  const sabah = gunDurumu(nesne(basi) ? basi.e : null) ?? { late: p.ozet.late, wT: p.ozet.wT };
  const bugun = c.iz.filter((x) => gunAnahtari(x.t) === k);
  gecmis[k] = {
    sabah: { late: sabah.late, wT: sabah.wT }, son: { late: p.ozet.late, wT: p.ozet.wT }, surum: c.canliSurum,
    kararlar: bugun.filter((x) => IZ_KARAR.test(x.ne)).map((x) => ({ t: x.t, ad: x.ayrinti })),
    onaylar: bugun.filter((x) => IZ_ONAY.test(x.ne)).map((x) => ({ t: x.t, ad: x.ne + (x.ayrinti ? ` · ${x.ayrinti}` : '') })),
  };
  const ks = Object.keys(gecmis).sort(); while (ks.length > 90) { const d = ks.shift(); if (d) delete gecmis[d]; }
  const yeni = { gecmis, basi };
  return sirali(yeni) === sirali(c.tpGun) ? null : yeni;
}
// Anahtar sırasından bağımsız karşılaştırma: sunucu belgeyi anahtarları yeniden sıralayarak döndürebilir.
const sirali = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (nesne(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export function gunAnahtari(t: number): string { const d = new Date(t); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; }
// İki planın sipariş bitişi farkı (etki): çeyrek saatten büyük fark, mutlak büyüklüğe göre.
export interface BitisFarki { j: string; d: number; gec: '' | 'gecikmeye düşer' | 'zamanına girer' }
export function bitisFarklari(once: Record<string, { C: number | null; T: number | null }>, sonra: OkunanPlan['J']): BitisFarki[] {
  const L: BitisFarki[] = [];
  for (const [j, y] of Object.entries(sonra)) {
    const x = once[j] ?? once[j.replace(/\/\d+$/, '')]; if (!x || x.C == null || y.C == null) continue;
    const d = y.C - x.C; if (Math.abs(d) < 0.25) continue;
    const a = (x.T ?? 0) > 0.01, b = (y.T ?? 0) > 0.01;
    L.push({ j, d, gec: !a && b ? 'gecikmeye düşer' : a && !b ? 'zamanına girer' : '' });
  }
  return L.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
}

// --- canlı planla fark (eski farkSay): canlı senaryonun planına göre tezgâhı ya da 15 dk'dan fazla saati değişen adım sayısı, artı arıza sayısı farkı ---
export interface CanliFark { var: boolean; say: number; farkli: boolean }
export function canliFark(c: PlanlamaCalismasi, p: OkunanPlan): CanliFark {
  const s = c.senaryolar.find((x) => x.id === c.canli);
  const cp = s && nesne(s.plan) ? s.plan : null;
  if (!s || !cp || !nesne(cp.ops)) return { var: false, say: 0, farkli: true };
  const cops = cp.ops;
  let n = Math.abs(c.down.length - (Array.isArray(s.down) ? s.down.length : 0));
  for (const [id, b] of Object.entries(p.ops)) {
    const a = cops[id];
    if (!nesne(a) || a.m !== b.m || typeof a.S !== 'number' || Math.abs(a.S - b.S) > 0.25) n++;
  }
  const z = nesne(c.plan) ? (c.plan as Record<string, unknown>).zaman : undefined;
  return { var: true, say: n, farkli: cp.zaman !== z };
}

// --- malzeme ayrıntısı (eski cx.mat.res det): malzemeHazir'ın aynı dağıtımı, malzeme başına hazır olma, eksik miktar ve kaynak (stok ya da satın alma) ---
export interface MalzemeKaynagi { stok: boolean; miktar: number; gelis: string | null; tedarikci: string | null }
export interface MalzemeSatiri { kod: string; ihtiyac: number; t: number | null; eksik: number; kaynak: MalzemeKaynagi[] }
export function malzemeDetay(cx: Derleme): Record<string, MalzemeSatiri[]> {
  const D = cx.g.D;
  const mats = new Map((D.malzemeler ?? []).map((m) => [m.kod, m]));
  const ted = new Map((Array.isArray(D.tedarikciler) ? D.tedarikciler : []).filter(nesne).map((t) => [String(t.id), t]));
  const sup: Record<string, { t: number; kalan: number; k: MalzemeKaynagi }[]> = {};
  for (const m of D.malzemeler ?? []) sup[m.kod] = [{ t: -1e9, kalan: Number(m.stok) || 0, k: { stok: true, miktar: 0, gelis: null, tedarikci: null } }];
  for (const p of Array.isArray(D.satinalma) ? D.satinalma : []) {
    if (!nesne(p)) continue;
    const kod = String(p.kod), soz = saatOku(D, p.gelis), td = ted.get(String(p.tedarikci));
    const gec = (Number(td?.ortGecikmeGun) || 0) * 24 + (cx.g.saGecik[kod] ?? 0), mu = (Number(mats.get(kod)?.muayeneGun) || 0) * 24;
    (sup[kod] ??= []).push({ t: soz === null ? 1e9 : Math.max(soz + gec, soz) + mu, kalan: Number(p.miktar) || 0,
      k: { stok: false, miktar: 0, gelis: typeof p.gelis === 'string' ? p.gelis : null, tedarikci: td && typeof td.ad === 'string' ? td.ad : null } });
  }
  for (const l of Object.values(sup)) l.sort((a, b) => a.t - b.t);
  const sira = Object.values(cx.jobs).sort((a, b) => (a.oncelik - b.oncelik) || ((a.due ?? 1e9) - (b.due ?? 1e9)));
  const out: Record<string, MalzemeSatiri[]> = {};
  for (const j of sira) {
    out[j.id] = j.malzeme.map((r) => {
      const ihtiyac = (Number(r.miktar) || 0) * j.adet; let kalan = ihtiyac, t = -1e9; const kaynak: MalzemeKaynagi[] = [];
      for (const x of sup[r.kod] ?? []) {
        if (kalan <= 1e-9) break; if (x.kalan <= 1e-9) continue;
        const q = Math.min(x.kalan, kalan); x.kalan -= q; kalan -= q; t = Math.max(t, x.t); kaynak.push({ ...x.k, miktar: q });
      }
      return { kod: r.kod, ihtiyac, t: kalan > 1e-9 ? null : Math.max(t, cx.now), eksik: kalan > 1e-9 ? kalan : 0, kaynak };
    });
  }
  return out;
}
