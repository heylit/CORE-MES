import type { CanliyaAlmaGecmisiCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CanliFarkiCevabi, TabanVeCanliCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
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

// --- canlı planla fark (eski farkSay; 499 a, 506 a): sunucunun çalışma ile canlı plan kıyasından (tezgâh ve sıra; saat kıyaslanmaz). Canlı plan
// yoksa (sürüm 0) var false; sayı yeri değişen, yeni ve canlıda olup çalışmada olmayan iş; çalışma ya da planı yoksa (null) canlı yok sayılır.
export interface CanliFark { var: boolean; say: number; farkli: boolean }
export function canliFarkOzeti(r: CanliFarkiCevabi): CanliFark {
  if (r === null || r.planSurumu <= 0) return { var: false, say: 0, farkli: true };
  return { var: true, say: r.tasinan + r.yeni + r.eksik, farkli: !r.ayni };
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

// --- Onay ve canlı (zz22 pa*): plan modülünün senaryolarından (221 c). Eski sayfanın planları karşılaştırması (paFark, paKontrol) canlı ve
// senaryo planının işlerini isterdi; sunucu senaryosu yerine göstergeleri, değişiklik listesini ve canlıya göre etkisini verir ---
export type SunucuSenaryosu = SenaryolarCevabi['senaryolar'][number];
export type Gostergeler = SenaryolarCevabi['canli'];
export const PA_ADIM = [['hazirla', 'Hazırla', 'edit'], ['incele', 'İncele', 'eye'], ['onaya', 'Onaya gönder', 'flag'], ['canli', 'Onayla, canlıya al', 'check']] as const;
export type PaAdimi = (typeof PA_ADIM)[number][0] | 'bitti';
export const PA_NOT: Record<(typeof PA_ADIM)[number][0], string> = {
  hazirla: 'Planı kurun ya da değiştirin.', incele: 'Farkı ve kontrolleri inceleyin.', onaya: 'Planlamacı onaya gönderir.', canli: 'Müdür onaylar; canlı ancak o zaman değişir.',
};
export const PA_DURUM: Record<SunucuSenaryosu['durum'] | 'calisma', [string, 'bilgi' | 'tamam' | 'uyari' | 'pasif']> = {
  calisma: ['Çalışma', 'bilgi'], onayda: ['Onay bekliyor', 'uyari'], acik: ['Deneme', 'bilgi'], canliya_alindi: ['Önceki canlı', 'pasif'], vazgecildi: ['Vazgeçildi', 'pasif'],
};

// Akışın şimdiki adımı (paAkis): plan yoksa hazırla, onay bekleyen varsa canlıya al, çalışma canlıdan farklıysa incele ya da onaya gönder.
export function paAdim(plan: boolean, onayda: number, farkli: boolean, seciliSenaryo: boolean): PaAdimi {
  if (!plan) return 'hazirla';
  if (onayda) return 'canli';
  if (farkli) return seciliSenaryo ? 'incele' : 'onaya';
  return 'bitti';
}

// İncelenecek planlar (paAdaylar): açık ve onaydaki senaryolar, yeniden eskiye; canlıya alınanlar Geçmiş planlardadır.
export const paAdaylar = (l: SunucuSenaryosu[]): SunucuSenaryosu[] => l.filter((s) => s.durum === 'acik' || s.durum === 'onayda');
export const paGecmisler = (l: SunucuSenaryosu[]): SunucuSenaryosu[] => l.filter((s) => s.durum === 'canliya_alindi');
export const paOnayda = (l: SunucuSenaryosu[]): SunucuSenaryosu[] => l.filter((s) => s.durum === 'onayda');
// Seçili plan (sPlanAtolye secId): seçilen aday yoksa en son onaya gönderilen, o da yoksa çalışma.
export function paSecim(l: SunucuSenaryosu[], sec: number | 'calisma' | null, calismaVar: boolean): number | 'calisma' | null {
  const a = paAdaylar(l);
  if (sec === 'calisma' && calismaVar) return 'calisma';
  if (typeof sec === 'number' && a.some((s) => s.id === sec)) return sec;
  const o = paOnayda(l);
  return o[0] ? o[0].id : calismaVar ? 'calisma' : null;
}

export const yerlesmeyen = (g: Gostergeler | null): number | null => (g ? Math.max(0, g.isEmriSayisi - g.yerlesen) : null);

// Kontrol (paKontrol): sunucu senaryosunun bildikleriyle. ok yeşil, uyari sarı; kırmızı maddeleri (başlamış ya da sabit iş oynadı, ek mesai
// bütçesi) sunucu canlıya almada kendisi denetler.
export type KontrolMaddesi = ['ok' | 'uyari' | 'red', string];
export function paKontrol(s: SunucuSenaryosu, canli: Gostergeler | null, canliSurum: number | null, planK: KontrolMaddesi[] = []): KontrolMaddesi[] {
  const K: KontrolMaddesi[] = [];
  if (s.canliDegisti) K.push(['uyari', `Canlı plan bu plan hazırlandıktan sonra değişti (sürüm ${s.tabanPlanSurumu} → ${canliSurum ?? '—'}); aradaki canlı değişiklikleri bu planda yok`]);
  const g = s.gostergeler;
  if (!g) K.push(['uyari', 'Plan göstergeleri hesaplanmadı']);
  else {
    const y = yerlesmeyen(g) ?? 0;
    K.push(y ? ['uyari', `${y} iş yerleşmedi`] : ['ok', 'Bütün işler yerleşti']);
    K.push(...planK);
    if (canli) {
      const d = g.geciken - canli.geciken;
      K.push(d > 0 ? ['uyari', `Geciken sipariş canlıya göre ${d} artıyor`] : ['ok', d < 0 ? `Geciken sipariş canlıya göre ${-d} azalıyor` : 'Geciken sipariş artmıyor']);
    } else K.push(['ok', 'İlk yayın: henüz canlı plan yok']);
  }
  for (const u of s.etki?.yeniUyarilar ?? []) K.push(['uyari', u]);
  for (const b of s.bekleyenler) K.push(['uyari', `Canlıya alınamaz, bekliyor: ${b}`]);
  if (!s.degisiklikler.length) K.push(['uyari', 'Canlı plandan farkı yok']);
  return K;
}

// Plan farkı (paFark): senaryonun ve canlının yerleşimleri (GET /plan?taslak=, GET /plan) iş emri kimliğiyle karşılaştırılır. Kaynağı değişen
// "tezgâh", saati çeyrek saatten çok kayan "saat", canlıda yerleşmemiş olan "yeni"dir. Bitişi değişen emirler en çok değişenden.
export interface EmirFarki { emirNo: string; once: string | null; sonra: string | null; d: number; teslim: string | null; T0: number | null; T1: number | null }
export interface PlanFarki { tasinan: number; tezgah: number; saat: number; yeni: number; tez: Record<string, number>; sip: EmirFarki[]; baslamis: number; sabit: number }
const SAAT = 3_600_000;
const ms = (z: string | null | undefined): number | null => { if (!z) return null; const t = Date.parse(z); return Number.isNaN(t) ? null : t; };
// Termin günün sonudur [VARSAYIM: eski sayfada due saat ekseninde; sunucu teslimi tarih verir].
export function gecikmeSaat(bitis: string | null, teslim: string | null): number | null {
  const b = ms(bitis), t = ms(teslim ? `${teslim}T23:59:59` : null);
  return b === null || t === null ? null : Math.max(0, (b - t) / SAAT);
}
export const kaynakAdi = (p: PlanCevabi, k: { tur: string; id: number }): string => {
  const x = p.kaynaklar.find((y) => y.tur === k.tur && y.id === k.id);
  return x ? x.kod ?? x.ad : `${k.tur === 'kisi' ? 'Kişi' : 'Makine'} ${k.id}`;
};
export function planFarki(a: PlanCevabi, b: PlanCevabi | null): PlanFarki {
  const f: PlanFarki = { tasinan: 0, tezgah: 0, saat: 0, yeni: 0, tez: {}, sip: [], baslamis: 0, sabit: 0 };
  const bo = new Map((b?.yerlesimler ?? []).map((y) => [y.isEmriId, y]));
  for (const r of a.yerlesimler) {
    const e = bo.get(r.isEmriId); const m = kaynakAdi(a, r.kaynak);
    if (!e) { f.yeni++; f.tez[m] = (f.tez[m] ?? 0) + 1; continue; }
    const yerDegisti = e.kaynak.tur !== r.kaynak.tur || e.kaynak.id !== r.kaynak.id;
    const kayma = Math.abs((ms(e.baslangic) ?? 0) - (ms(r.baslangic) ?? 0)) / SAAT > 0.25;
    if (yerDegisti) f.tezgah++; else if (kayma) f.saat++; else continue;
    f.tasinan++; f.tez[m] = (f.tez[m] ?? 0) + 1;
    if (e.durum === 'basladi' || e.durum === 'bitti') f.baslamis++;
    if (e.kilitli || e.dondurulmus) f.sabit++;
  }
  const ea = new Map(a.emirler.map((x) => [x.emirNo, x])); const eb = new Map((b?.emirler ?? []).map((x) => [x.emirNo, x]));
  for (const j of new Set([...ea.keys(), ...eb.keys()])) {
    const x = ea.get(j), y = eb.get(j); const ca = ms(x?.bitis), cb = ms(y?.bitis);
    if (ca === null && cb === null) continue;
    if (ca !== null && cb !== null && Math.abs(ca - cb) / SAAT < 0.25) continue;
    const teslim = x?.teslim ?? y?.teslim ?? null;
    f.sip.push({ emirNo: j, once: y?.bitis ?? null, sonra: x?.bitis ?? null, d: ((ca ?? 1e13) - (cb ?? 1e13)) / SAAT, teslim,
      T0: y ? gecikmeSaat(y.bitis, teslim) : null, T1: x ? gecikmeSaat(x.bitis, teslim) : null });
  }
  f.sip.sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  return f;
}
// Planın gecikmesi (saat, emir başına toplam) ve son bitişi; ağırlıksız [eski ozet.wT öncelik ağırlıklıydı].
export function planGecikme(p: PlanCevabi): number {
  return p.emirler.reduce((t, e) => t + (gecikmeSaat(e.bitis, e.teslim) ?? 0), 0);
}
// Sunucunun öncelik ağırlıklı gecikmesi (507/1, eski wT); alan gelmeyen cevapta ağırlıksız toplam. Ayar saati (eski suH) gelmezse null.
export const agirlikliGecikme = (p: PlanCevabi): { saat: number; agirlikli: boolean } => {
  const v = p.gostergeler.agirlikliGecikmeSaat;
  return typeof v === 'number' ? { saat: v, agirlikli: true } : { saat: planGecikme(p), agirlikli: false };
};
export const ayarSaat = (p: PlanCevabi | null): number | null => (typeof p?.gostergeler.ayarSaat === 'number' ? p.gostergeler.ayarSaat : null);
export function sonBitis(p: PlanCevabi): string | null {
  let en: string | null = null;
  for (const e of p.emirler) if (e.bitis && (!en || e.bitis > en)) en = e.bitis;
  return en;
}
// Kontrolün plana bakan kırmızı maddeleri (paKontrol): canlıda başlamış ya da sabit (kilitli, dondurulmuş) iş senaryoda yerinden oynadıysa.
export function paPlanKontrol(f: PlanFarki | null, canliVar: boolean): KontrolMaddesi[] {
  if (!f || !canliVar) return [];
  return [
    f.baslamis ? ['red', `${f.baslamis} başlamış iş yerinden oynadı`] : ['ok', 'Başlamış işler yerinde'],
    f.sabit ? ['red', `${f.sabit} sabit iş yerinden oynadı`] : ['ok', 'Sabit işler yerinde'],
  ];
}
export const paRedVar = (K: KontrolMaddesi[]): boolean => K.some((k) => k[0] === 'red');

// --- ek mesai (eski paEkSaat, haftaMesai, MESAI_BUTCE; 507 2 a) ---
// Çalışmanınki sayfanın kaydından eskisi gibi hesaplanır: vardiya süresi (gece yarısını geçer, mola düşülmez), hafta planın başlangıcından
// 7 günlük dilim, bütçe çalışmanın mesaiHafta'sı (yoksa 8). Senaryonunki sunucunun ekMesai'sinden. Bütçe 0 her yerde sınırsızdır (525 3 a).
export const MESAI_HAFTA = 8;
export interface EkMesaiOzeti { saat: number; butce: number; asildi: boolean }
const saatDakika = (x: unknown): number => { const [h, m] = String(x).split(':').map(Number); return (h || 0) + (m || 0) / 60; };
export function vardiyaSaati(D: PlanVerisi, id: string): number {
  const v = (D.vardiyalar ?? []).find((x) => String(x.id) === id);
  if (!v) return 0;
  const h = saatDakika(v.bit) - saatDakika(v.bas);
  return h <= 0 ? h + 24 : h;
}
export function calismaEkMesai(c: PlanlamaCalismasi): EkMesaiOzeti {
  const b = Number(c.param.mesaiHafta ?? MESAI_HAFTA); const butce = Number.isFinite(b) ? b : 0;
  const hafta: Record<number, number> = {}; let saat = 0;
  for (const e of c.ekMesai) {
    const gun = Number(e.gun); if (!Number.isFinite(gun)) continue;
    const h = vardiyaSaati(c.D, String(e.vardiya)); saat += h;
    const k = Math.floor(gun / 7); hafta[k] = (hafta[k] ?? 0) + h;
  }
  return { saat, butce, asildi: butce > 0 && Object.values(hafta).some((h) => h > butce + 1e-9) };
}
export const sunucuEkMesai = (p: PlanCevabi | null): EkMesaiOzeti | null => {
  const x = p?.ekMesai;
  return x ? { saat: x.toplamSaat, butce: x.haftaSiniriSaat, asildi: x.haftaSiniriSaat > 0 && x.asildi } : null;
};
export const ekMesaiKontrol = (e: EkMesaiOzeti | null): KontrolMaddesi[] => (!e ? []
  : [e.asildi ? ['red', `Haftalık ek mesai bütçesi (${e.butce} sa) aşılıyor`] : ['ok', 'Ek mesai bütçe içinde']]);
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// "26.10 Pzt" (eski fmtDT(...).slice(0, 9)), sunucunun tarihinden.
export function tarihGunYaz(t: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); if (!m) return t;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${m[3]}.${m[2]} ${GUNLER[(d.getUTCDay() + 6) % 7] ?? ''}`;
}
// Eski paVeriFark'ın ek mesai satırları: senaryoda eklenen ve canlıdan kaldırılan ek vardiyalar.
export function ekMesaiFarki(a: PlanCevabi, b: PlanCevabi | null): ['clock' | 'minus', string][] {
  const k = (x: { makineId: number; gun: string; vardiyaId: number }) => `${x.makineId}|${x.gun}|${x.vardiyaId}`;
  const A = a.ekMesai?.satirlar ?? [], B = b?.ekMesai?.satirlar ?? [];
  const sa = new Set(A.map(k)), sb = new Set(B.map(k));
  const yaz = (p: PlanCevabi, x: { makineId: number; gun: string; vardiyaId: number }) => `${kaynakAdi(p, { tur: 'makine', id: x.makineId })}, ${tarihGunYaz(x.gun)}, vardiya ${x.vardiyaId}`;
  return [
    ...A.filter((x) => !sb.has(k(x))).map((x): ['clock', string] => ['clock', `Ek mesai: ${yaz(a, x)}`]),
    ...(b ? B.filter((x) => !sa.has(k(x))).map((x): ['minus', string] => ['minus', `Kaldırılan ek mesai: ${yaz(b, x)}`]) : []),
  ];
}

// Çalışma planının kontrolü: eski veriyle çözülmüş plan gönderilmez (kırmızı); yerleşmeyen iş ve canlıdan farksızlık uyarıdır.
export function paCalismaKontrol(guncel: boolean, yerlesmeyen: number, farkli: boolean): KontrolMaddesi[] {
  const K: KontrolMaddesi[] = [
    guncel ? ['ok', 'Plan güncel veriyle çözülmüş'] : ['red', 'Veri plandan sonra değişti; önce planı yeniden çözün'],
    yerlesmeyen ? ['uyari', `${yerlesmeyen} iş yerleşmedi`] : ['ok', 'Bütün işler yerleşti'],
  ];
  if (!farkli) K.push(['uyari', 'Canlı plandan farkı yok']);
  return K;
}

// Sunucu zamanı (ISO) ve saat farkı.
export function zamanYaz(z: string | null | undefined): string {
  if (!z) return '—';
  const d = new Date(z);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function saatFarki(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isNaN(x) || Number.isNaN(y) ? null : (y - x) / 3_600_000;
}
// İki değerin farkı (fark): küçük fark yazılmaz; iyi ya da kötü yönü küçükİyi'ye göre.
export function farkKur(a: number | null | undefined, b: number | null | undefined, basamak = 1, kucukIyi = true): { metin: string; iyi: boolean } | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < (basamak ? 0.05 : 0.5)) return null;
  return { metin: `${a > b ? '+' : '−'}${Math.abs(a - b).toLocaleString('tr-TR', { maximumFractionDigits: basamak, minimumFractionDigits: basamak })}`, iyi: (a < b) === kucukIyi };
}

// Bitişi planlar arasında değişen emirler (paKarsilastir): canlıdaki bitiş ve her senaryodaki bitiş (etkide yoksa canlıdakiyle aynıdır); en çok
// değişen 15. Bitişi olmayan (yerleşmeyen) emir en başa gelir.
export function paEmirFarki(l: SunucuSenaryosu[]): { emirNo: string; canli: string | null; senaryo: (string | null)[] }[] {
  const canli = new Map<string, string | null>();
  for (const s of l) for (const e of s.etki?.tarihiDegisenEmirler ?? []) canli.set(e.emirNo, e.canli);
  return [...canli.entries()].map(([emirNo, c]) => {
    const senaryo = l.map((s) => { const e = s.etki?.tarihiDegisenEmirler.find((x) => x.emirNo === emirNo); return e ? e.senaryo : c; });
    const t = [c, ...senaryo].map((v) => (v ? Date.parse(v) : Number.NaN));
    const g = t.filter((v) => !Number.isNaN(v));
    return { emirNo, canli: c, senaryo, yay: g.length < t.length ? 1e9 : (Math.max(...g) - Math.min(...g)) / 3_600_000 };
  }).filter((x) => x.yay > 0.5).sort((a, b) => b.yay - a.yay).slice(0, 15).map(({ emirNo, canli: c, senaryo }) => ({ emirNo, canli: c, senaryo }));
}

// --- Plan ve gerçekleşen (zz35-plan-gercek.betik): taban plan, son canlı plan ve atölyede olan ---
// Taban plan siparişin ilk canlıya alınan planıdır; hiç değişmez (karar 394). Nedenler yalnız kayıtlardan çıkar (karar 395).
export const PG_ASIM = 0.1;
export const PG_NEDEN = [['fason', 'Fason gecikmesi', 'truck'], ['ayar', 'Uzun ayar', 'wrench'], ['malzeme', 'Malzeme gecikmesi', 'box'],
  ['yavas', 'Yavaş üretim', 'clock'], ['gec', 'Geç başlama', 'play'], ['ariza', 'Arıza', 'alert']] as const;
export type PgNedeni = (typeof PG_NEDEN)[number][0];
export interface PgAdim { m: string; S: number; C: number; job: string }
export interface TabanIs { surum: number | null; ops: Record<string, { m: string; S: number; C: number }>; C: number }
interface Gercek { m: string | null; S: number; C: number | null; t: number | null; n: number | null }
// fmtDT: "26.10 Pzt 14:00"; tarihGun ilk dokuz harfi.
export const tt = (D: PlanVerisi, t: number | null | undefined): string => (gecerli(t) ? `${ga(D, t)} ${gs(D, t).split(' ')[0] ?? ''} ${zs(D, t)}` : '—');
export const tarihGun = (D: PlanVerisi, t: number): string => tt(D, t).slice(0, 9);
export const pgSa = (x: number | null): string => (x == null ? '—' : `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}${Math.abs(x).toFixed(1).replace('.', ',')} sa`);
export const saatYaz = (x: number | null): string => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(1).replace('.', ',')} sa`);
export const sapmaEsik = (c: PlanlamaCalismasi): number => (c.param.sapmaEsik != null && Number.isFinite(Number(c.param.sapmaEsik)) ? Number(c.param.sapmaEsik) : 0.5);
const sayiMi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Taban ve son canlı plan sunucudan (505 a, GET taban-ve-canli), sayfanın adım kimliğiyle (k): taban adımın ilk canlıya alınan yeridir (33 a),
// sayfa yazmaz. Sunucu zamanı tesis saatiyle planın saat eksenine çevrilir; tezgâh makine kimliğidir (sayfanın tezgâh kimliği gibi).
// Çalışmada karşılığı olmayan iş (k null) sayfada gösterilmez. planSurumu her canlıya almada bir artar; taban sonrası değişiklik sayısı farktır.
export interface PgKaynak { taban: Record<string, TabanIs>; canli: Record<string, PgAdim>; planSurumu: number; tabanSurum: number | null }
export function pgKaynakKur(r: TabanVeCanliCevabi, c: PlanlamaCalismasi, p: OkunanPlan): PgKaynak {
  const saat = (iso: string) => saatOku(c.D, tesisSaati(Date.parse(iso)));
  const kaynak = (k: { tur: string; id: number }) => (k.tur === 'makine' ? String(k.id) : `${k.tur}:${k.id}`);
  const taban: Record<string, TabanIs> = {}; const canli: Record<string, PgAdim> = {}; let tabanSurum: number | null = null;
  for (const x of r.isler) {
    if (x.k === null) continue;
    const job = p.ops[x.k]?.job ?? (x.k.includes('.') ? x.k.slice(0, x.k.lastIndexOf('.')) : x.k);
    if (x.taban) {
      const S = saat(x.taban.baslangic), C = saat(x.taban.bitis);
      if (S !== null && C !== null) {
        const t = (taban[job] ??= { surum: x.taban.planSurumu, ops: {}, C });
        t.ops[x.k] = { m: kaynak(x.taban.kaynak), S, C };
        t.C = Math.max(t.C, C); t.surum = Math.min(t.surum ?? x.taban.planSurumu, x.taban.planSurumu);
        tabanSurum = Math.min(tabanSurum ?? x.taban.planSurumu, x.taban.planSurumu);
      }
    }
    if (x.canli) {
      const S = saat(x.canli.baslangic), C = saat(x.canli.bitis);
      if (S !== null && C !== null) canli[x.k] = { m: kaynak(x.canli.kaynak), S, C, job };
    }
  }
  return { taban, canli, planSurumu: r.planSurumu, tabanSurum };
}

function gercekler(c: PlanlamaCalismasi): Record<string, Gercek> {
  const g = c.gercek; const y: Record<string, Gercek> = {};
  if (!nesne(g)) return y;
  for (const [id, x] of Object.entries(g)) if (nesne(x) && sayiMi(x.S)) {
    y[id] = { m: typeof x.m === 'string' ? x.m : null, S: x.S, C: sayiMi(x.C) ? x.C : null, t: sayiMi(x.t) ? x.t : null, n: sayiMi(x.n) ? x.n : null };
  }
  return y;
}
export function pgBitis(ops: Record<string, { C: number; job?: string }> | null, j: string): number | null {
  if (!ops) return null; let c: number | null = null;
  for (const r of Object.values(ops)) if (r.job === j && Number.isFinite(r.C)) c = c == null ? r.C : Math.max(c, r.C);
  return c;
}
export interface GercekBitis { t: number | null; tahmin: boolean; basladi: boolean }
export function pgGercekBitis(c: PlanlamaCalismasi, p: OkunanPlan, j: string): GercekBitis | null {
  const ops = Object.values(p.ops).filter((r) => r.job === j); if (!ops.length) return null;
  const g = gercekler(c); const bitti = ops.every((r) => g[r.id]?.C != null);
  // Sayım planı oynatmaz; sürmekte olan adım sonrakinin başlangıcını aşıyorsa aşan kısım bitişe eklenir.
  const sira = ops.slice().sort((a, b) => a.id.localeCompare(b.id, 'tr', { numeric: true })); let tas = 0;
  sira.forEach((r, i) => { const n = sira[i + 1]; if (g[r.id] && g[r.id]?.C == null && n && Number.isFinite(r.C) && Number.isFinite(n.S)) tas = Math.max(tas, r.C - n.S); });
  const pb = pgBitis(p.ops, j);
  return { t: bitti ? Math.max(...ops.map((r) => g[r.id]?.C ?? -Infinity)) : pb == null ? null : pb + Math.max(0, tas), tahmin: !bitti, basladi: ops.some((r) => g[r.id]) };
}
// Adımın tezgâhtaki standart ayarı ve birim süresi (saat; engine.betik derleme: cevrim/60 · sapma / (1 − pay) / verim).
function standart(c: PlanlamaCalismasi, cx: Derleme, id: string, m: string): { su: number; cyc: number } | null {
  const o = cx.byId[id]; const j = cx.jobs[o?.job ?? '']; if (!o || !j) return null;
  const sp = c.D.siparisler.find((x) => x.id === j.id); const u = c.D.urunler.find((x) => x.id === sp?.urun);
  const k = id.slice(j.id.length + 1); const a = u?.rota?.find((x) => String(x.k) === k);
  const tz2 = a?.tezgahlar ?? []; const t = tz2.find((x) => x.id === m) ?? tz2[0]; if (!t) return null;
  const mm = c.D.tezgahlar.find((x) => x.id === t.id) as { verim?: unknown; arizaGun?: unknown; onarimSaat?: unknown } | undefined;
  const verim = Number(mm?.verim) || 1; const x = cx.g.sapma[id] ?? 1;
  const ag = Number(mm?.arizaGun) || 0;
  const pay = c.param.tampon ? Math.min(0.35, (ag > 0 ? (Number(mm?.onarimSaat) || 0) / (ag * 24) : 0) + (Number(c.param.acilPay) || 0)) : 0;
  return { su: (Number(t.ayar) || 0) / 60, cyc: ((Number(t.cevrim) || 0) / 60) * x / (1 - pay) / verim };
}
// pgNedenler: siparişin canlı plana göre kayma nedenleri, saat.
export function pgNedenler(c: PlanlamaCalismasi, p: OkunanPlan, K: PgKaynak, cx: Derleme, hazir: Record<string, number>, j: string): Record<PgNedeni, number> {
  const N: Record<PgNedeni, number> = { ayar: 0, yavas: 0, ariza: 0, malzeme: 0, fason: 0, gec: 0 };
  const g = gercekler(c); const cp = K.canli; const dn = c.down as unknown as { m?: unknown; from?: unknown; to?: unknown }[];
  for (const r of Object.values(p.ops).filter((x) => x.job === j)) {
    const a = g[r.id]; const q = cp[r.id];
    if (r.fas || r.m.startsWith('@')) { if (q && r.C - q.C > 0.01) N.fason += r.C - q.C; continue; }
    if (!a) continue;
    const m = a.m ?? r.m; const M = cx.M[m]; const k = standart(c, cx, r.id, m); if (!M || !k) continue;
    const Su = r.Su ?? a.S;
    const ayar = acikSaat(M.sw, a.S, Su); if (k.su > 0 && ayar > k.su * (1 + PG_ASIM)) N.ayar += ayar - k.su;
    let ar = 0;
    for (const d of dn) if (d.m === m && sayiMi(d.from) && sayiMi(d.to)) { const b0 = Math.max(d.from, a.S), b1 = Math.min(d.to, r.C); if (b1 > b0) ar += b1 - b0; }
    N.ariza += ar;
    const bit = a.C ?? a.t; const adet = a.C != null ? cx.jobs[j]?.adet ?? 0 : a.n ?? 0;
    if (bit != null && adet > 0 && k.cyc > 0) {
      const tk = acikSaat(M.rw, a.S, bit); const is = tk > 1e-6 ? acikSaat(M.rw, Su, bit) : Math.max(0, bit - a.S - k.su - ar); const std = adet * k.cyc;
      if (is > std * (1 + PG_ASIM)) N.yavas += is - std;
    }
  }
  const T = K.taban[j]; const mr = hazir[j];
  if (mr != null && Number.isFinite(mr) && T) { const ilk = Math.min(...Object.values(T.ops).map((x) => x.S)); if (mr > ilk) N.malzeme = mr - ilk; }
  const gb = pgGercekBitis(c, p, j); const cb = pgBitis(K.canli, j);
  const sapma = gb?.t != null && cb != null ? gb.t - cb : 0;
  const ac = N.ayar + N.yavas + N.ariza + N.malzeme + N.fason;
  if (sapma > 0.01 && gb?.basladi) N.gec = Math.max(0, sapma - ac);
  return N;
}
export interface PgSatiri { j: string; ad: string; adet: number | null; tb: number; cb: number | null; gb: GercekBitis; due: number | null; fark: number | null; plan: number | null; N: Record<PgNedeni, number> }
export function pgSatirlar(c: PlanlamaCalismasi, p: OkunanPlan, K: PgKaynak, cx: Derleme, hazir: Record<string, number>): PgSatiri[] {
  const T = K.taban; const cp = K.canli;
  return Object.keys(T).map((j) => {
    const s = c.D.siparisler.find((x) => x.id === j); const u = c.D.urunler.find((x) => x.id === s?.urun);
    const gb = pgGercekBitis(c, p, j) ?? { t: null, tahmin: true, basladi: false };
    const tb = T[j]?.C ?? 0; const cb = pgBitis(cp, j); const due = cx.jobs[j]?.due ?? null;
    return { j, ad: u?.ad ?? s?.urun ?? '', adet: s?.adet ?? null, tb, cb, gb, due, fark: gb.t != null ? gb.t - tb : null, plan: cb != null ? cb - tb : null, N: pgNedenler(c, p, K, cx, hazir, j) };
  }).sort((a, b) => Math.abs(b.fark ?? 0) - Math.abs(a.fark ?? 0));
}
// Plan değişikliği: taban sonrası canlıya almalar ve kişi başına sayı sunucunun geçmişinden (510 a); geçmiş okunamazsa sayı sürüm farkından, adsız.
export interface PgGostergeleri { biten: number; uyan: number; sevk: number; zaman: number; ort: number | null; degisiklik: number; kimler: [string, number][] }
export function pgGostergeleri(c: PlanlamaCalismasi, p: OkunanPlan, K: PgKaynak, L: PgSatiri[], gecmis: CanliyaAlmaGecmisiCevabi | null = null): PgGostergeleri {
  const g = gercekler(c); const T = K.taban; const esik = sapmaEsik(c);
  const biten = Object.keys(g).filter((id) => { const r = p.ops[id]; return g[id]?.C != null && r && T[r.job]?.ops[id]; });
  const uyan = biten.filter((id) => { const r = p.ops[id]; const t0 = r ? T[r.job]?.ops[id] : undefined; return t0 && (g[id]?.C ?? Infinity) - t0.C <= esik; });
  const sevk = L.filter((x) => !x.gb.tahmin && x.gb.t != null); const zam = sevk.filter((x) => x.due == null || (x.gb.t ?? Infinity) <= x.due);
  const kay = L.filter((x) => x.fark != null); const ort = kay.length ? kay.reduce((a, x) => a + (x.fark ?? 0), 0) / kay.length : null;
  return { biten: biten.length, uyan: uyan.length, sevk: sevk.length, zaman: zam.length, ort,
    ...(gecmis ? { degisiklik: gecmis.toplam, kimler: gecmis.kisiler.map((x): [string, number] => [x.kisi ?? '—', x.sayi]) }
      : { degisiklik: K.tabanSurum === null ? 0 : Math.max(0, K.planSurumu - K.tabanSurum), kimler: [] }) };
}
// pgNedenOzet: tabandan sapan siparişlerde neden başına toplam saat ve sipariş sayısı.
export function pgNedenOzeti(c: PlanlamaCalismasi, L: PgSatiri[]): { k: PgNedeni; ad: string; simge: string; s: number; n: number }[] {
  const esik = sapmaEsik(c); const t: Partial<Record<PgNedeni, { s: number; n: number }>> = {};
  for (const x of L.filter((y) => y.fark != null && y.fark > esik)) for (const [k] of PG_NEDEN) if (x.N[k] > 0.05) { const z = (t[k] ??= { s: 0, n: 0 }); z.s += x.N[k]; z.n++; }
  return PG_NEDEN.flatMap(([k, ad, simge]) => { const z = t[k]; return z ? [{ k, ad, simge, s: z.s, n: z.n }] : []; });
}
// pgSerit: en çok işi olan üç tezgâhta beş günlük taban, canlı ve gerçekleşen çizgileri.
export interface PgSeritIsi { id: string; t0: { m: string; S: number; C: number }; q: PgAdim | null; g: { S: number; C: number; k: 'zaman' | 'gec' | 'calisiyor' } | null; fk: number | null }
export function pgSerit(c: PlanlamaCalismasi, p: OkunanPlan, K: PgKaynak, now: number): { a: number; b: number; satirlar: { m: string; isler: PgSeritIsi[] }[] } {
  const a = Math.floor(now / 24) * 24, b = a + 5 * 24; const cp = K.canli; const g = gercekler(c); const esik = sapmaEsik(c);
  const tb: Record<string, { m: string; S: number; C: number }> = {}; for (const x of Object.values(K.taban)) Object.assign(tb, x.ops);
  const say: Record<string, number> = {};
  for (const [id, x] of Object.entries(tb)) if (x.C > a && x.S < b && !x.m.startsWith('@')) say[x.m] = (say[x.m] ?? 0) + 1 + (g[id] ? 5 : 0);
  const mler = Object.entries(say).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
  return { a, b, satirlar: mler.map((m) => ({ m, isler: Object.keys(tb).filter((id) => tb[id]?.m === m && (tb[id]?.C ?? 0) > a && (tb[id]?.S ?? 0) < b).map((id) => {
    const t0 = tb[id] as { m: string; S: number; C: number }; const r = p.ops[id]; const x = g[id];
    const fk = r && Number.isFinite(r.C) ? r.C - t0.C : null;
    const k = x ? (x.C != null ? (fk != null && fk > esik ? 'gec' : 'zaman') : 'calisiyor') : null;
    return { id, t0, q: cp[id] ?? null, g: x && r && k ? { S: x.S, C: x.C ?? r.C, k } : null, fk };
  }) })) };
}
