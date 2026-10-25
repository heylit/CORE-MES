import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi, PlanVerisi } from '../../tipler.ts';
import { haritaGruplari, siparisRengi, type Aralik } from '../harita/kurallar.ts';
import { acikSaat, AY_AD, saatYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';

// Çizelge hesapları (zq-olcek olYuzey, s-gun sGunYuzey ve gyErken, w-v20 v20KilitSerit, zp-klavye kbTez, c-masa tezgahAd).

// Tezgâh satırlarının sırası (o-tahta tbYerlesim kart): düz nesne, sayı biçimli kimlikler önce küçükten büyüğe, ötekiler grup sırasıyla.
export function tezgahSirasi(D: PlanVerisi, p: OkunanPlan, cx: Derleme): string[] {
  const kart: Record<string, true> = {};
  for (const g of haritaGruplari(D, p, cx)) for (const m of g.l) kart[m.id] = true;
  return Object.keys(kart);
}
export const tezEtiketi = (m: string): string => (m.startsWith('@') ? `fason ${m.slice(1)}` : m);
export function tezgahAdi(D: PlanVerisi, m: string): string {
  if (m.startsWith('@')) { const f = (D.fasoncular ?? []).find((x) => x.id === m.slice(1)); return `Fason: ${f?.ad ?? m.slice(1)}`; }
  return `${m} · ${D.tezgahlar.find((x) => x.id === m)?.ad ?? ''}`;
}
export const gunAdi = (D: PlanVerisi, t: number): string => saatYaz(D, t).slice(0, 9);
export const isiSeviyesi = (o: number | null): number => (o == null ? 0 : o < 0.05 ? 0 : o < 0.35 ? 1 : o < 0.65 ? 2 : o < 0.9 ? 3 : 4);
const renk = (D: PlanVerisi, j: string) => `var(--tc-pym-is-${siparisRengi(D, j)})`;
const yerlesen = (p: OkunanPlan) => Object.values(p.ops).filter((r) => Number.isFinite(r.C) && Number.isFinite(r.S));
const kilitli = (c: PlanlamaCalismasi, id: string): { gun: number | null } | null => {
  const l = c.locks[id]; if (!l || typeof l !== 'object') return null;
  const g = (l as Record<string, unknown>).gun; return { gun: typeof g === 'number' ? g : null };
};

// --- hafta, ay, yıl: tezgâh satırlarında işler gün ızgarasında; yılda hafta başına doluluk ısısı ---
export interface OlcekBasligi { t: number; x: number; w: number; ad: string; bugun: boolean; baslik: string }
export interface OlcekIsi { x: number; w: number; d: 1 | 2 | 3; o: number; baslik: string }
export interface OlcekIsi2 { id: string; x: number; w: number; renk: string; etiket: string | null; baslik: string; sabit: boolean }
export interface OlcekSatiri { m: string; etiket: string; isi: OlcekIsi[]; isler: OlcekIsi2[] }
export interface OlcekCizelgesi { basliklar: OlcekBasligi[]; satirlar: OlcekSatiri[]; simdi: number | null; ufuk: number | null }

export function olcekCizelgesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, olcek: Exclude<DonemOlcegi, 'gun'>, r: Aralik, now: number): OlcekCizelgesi {
  const D = c.D; const { a, b } = r; const L = b - a; const gun = L / 24;
  const yil = olcek === 'yil'; const kova = yil ? 7 : 1; const nk = Math.ceil(gun / kova); const kw = (kova * 24) / L;
  const ops = yerlesen(p); const son = Math.max(now, ...ops.map((x) => x.C));
  const basliklar = Array.from({ length: nk }, (_, i): OlcekBasligi => {
    const t = a + i * kova * 24; const g = gunAdi(D, t);
    const ad = yil ? (Number(g.slice(0, 2)) <= 7 ? AY_AD[Number(g.slice(3, 5)) - 1] ?? '' : '') : olcek === 'ay' ? g.slice(0, 2) : g;
    return { t, x: (t - a) / L, w: kw, ad, bugun: t <= now && now < t + kova * 24, baslik: `${g}${yil ? ' haftası' : ''}: saatlik aç` };
  });
  const satirlar = tezgahSirasi(D, p, cx).map((m): OlcekSatiri => {
    const M = cx.M[m]; const l = ops.filter((x) => x.m === m && x.C > a && x.S < b);
    const isi: OlcekIsi[] = [];
    if (yil || olcek === 'ay') {
      for (let i = 0; i < nk; i++) {
        const x = a + i * kova * 24, y = x + kova * 24; if (x > son) break;
        const acik = M ? M.rw.reduce((s, [u, v]) => s + Math.max(0, Math.min(v, y) - Math.max(u, x)), 0) : 0;
        const dolu = l.reduce((s, q) => s + (q.C > x && q.S < y ? (M ? acikSaat(M.rw, Math.max(x, q.S), Math.min(y, q.C)) : Math.min(y, q.C) - Math.max(x, q.S)) : 0), 0);
        const o = acik ? dolu / acik : null;
        if (o != null && dolu > 0.05) isi.push({ x: (x - a) / L, w: kw, d: o > 0.97 ? 3 : o > 0.75 ? 2 : 1, o: Math.min(1, o), baslik: `${tezEtiketi(m)} · ${gunAdi(D, x)}${yil ? ' haftası' : ''}: %${Math.round(o * 100)} dolu` });
      }
    }
    const isler = yil ? [] : l.sort((x, y) => x.S - y.S).map((q): OlcekIsi2 => {
      const s = Math.max(a, q.S), e = Math.min(b, q.C); const w = (e - s) / L;
      return { id: q.id, x: (s - a) / L, w, renk: renk(D, q.job), etiket: olcek === 'hafta' && w > 0.035 ? q.job : null, baslik: `${q.id} · ${saatYaz(D, q.S)} → ${saatYaz(D, q.C)}`, sabit: !!kilitli(c, q.id) };
    });
    return { m, etiket: tezEtiketi(m), isi, isler };
  });
  return { basliklar, satirlar, simdi: now > a && now < b ? (now - a) / L : null, ufuk: son > a && son < b ? (son - a) / L : null };
}

// --- saatlik gün ---
// İşin en erken başlayabileceği an ve nedeni (gyErken): serbest bırakma, önceki adım, fasondan dönüş. Malzeme yeni derlemede yok.
export interface ErkenBaslama { t: number; ad: string }
export function erkenBaslama(p: OkunanPlan, cx: Derleme, id: string): ErkenBaslama | null {
  const o = cx.byId[id]; if (!o) return null;
  let t = cx.now, ad = 'Hemen başlayabilir';
  const j = cx.jobs[o.job]; if (j?.rel != null && j.rel > t) { t = j.rel; ad = 'Sipariş serbest bırakılır'; }
  for (const [pid, ty] of o.pr) {
    const q = p.ops[pid]; if (!q || !Number.isFinite(q.C)) continue;
    const x = (ty === 'o' && !q.fas ? q.lot1 ?? q.C : q.C) + (q.fas ? 0 : cx.tasima);
    if (x > t) { t = x; ad = q.fas ? `Fasondan döner (${q.m.slice(1)})` : `Önceki adım ${ty === 'o' ? 'ilk partiyi verir' : 'biter'} (${pid.split('.').pop() ?? pid})`; }
  }
  return { t, ad };
}

export interface GunAraligi { x: number; w: number }
export interface GunBlogu {
  id: string; job: string; ad: string; x: number; w: number; renk: string; baslik: string;
  sol: boolean; sag: boolean; secili: boolean; soluk: boolean; gec: boolean; sabit: boolean; dondu: boolean;
}
export interface GunSatiri {
  m: string; etiket: string; ad: string; oran: number | null; isi: number; uygun: boolean | null;
  kapali: GunAraligi[]; ariza: GunAraligi[]; bloklar: GunBlogu[]; erken: (GunAraligi & { ad: string; t: number; cizgi: number | null }) | null;
}
export interface GunCizelgesi {
  a: number; gunler: { g: number; ad: string; dondu: boolean }[]; satirlar: GunSatiri[]; simdi: number | null;
  cit: number | null; citBant: GunAraligi | null; erken: ErkenBaslama | null;
  kilit: { donukBu: number; donukTum: number; elle: number; cit: number | null };
}
const DONDURMA_SAATI: Record<string, number> = { elle: 72, dengeli: 24, otomatik: 0 };

export function gunCizelgesi(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, g: number, secId: string | null, secJob: string | null): GunCizelgesi {
  const D = c.D; const now = cx.now; const d0 = Math.floor(now / 24) * 24; const a = d0 + g * 24, b = a + 24;
  const x = (t: number) => (t - a) / 24; const w = (s: number, e: number) => (e - s) / 24;
  const sec = secId ? p.ops[secId] ?? null : null; const secO = sec ? cx.byId[sec.id] : undefined;
  const uygun = new Set(secO ? secO.c : []); const yanan = !!sec;
  const erken = sec ? erkenBaslama(p, cx, sec.id) : null; const sJ = sec ? sec.job : secJob;
  const durus = c.down.flatMap((d) => (typeof d.m === 'string' && typeof d.from === 'number' && typeof d.to === 'number' ? [{ m: d.m, from: d.from, to: d.to }] : []));
  const ops = yerlesen(p);
  const satirlar = tezgahSirasi(D, p, cx).map((m): GunSatiri => {
    const M = cx.M[m];
    const kapali: GunAraligi[] = [];
    if (M) {
      let t = a;
      for (const [u, v] of M.rw) { if (v <= a) continue; if (u >= b) break; if (u > t) kapali.push({ x: x(t), w: w(t, Math.min(u, b)) }); t = Math.max(t, v); }
      if (t < b) kapali.push({ x: x(t), w: w(t, b) });
    }
    const ariza = durus.filter((d) => d.m === m && d.to > a && d.from < b).map((d) => ({ x: x(Math.max(a, d.from)), w: w(Math.max(a, d.from), Math.min(b, d.to)) }));
    let dolu = 0;
    const bloklar = ops.filter((r) => r.m === m && r.C > a && r.S < b).sort((u, v) => u.S - v.S).map((r: PlanIslemi): GunBlogu => {
      const s = Math.max(a, r.S), e = Math.min(b, r.C); dolu += M ? acikSaat(M.rw, s, e) : e - s;
      const o = cx.byId[r.id]; const kl = kilitli(c, r.id);
      return {
        id: r.id, job: r.job, ad: o?.ad ?? '', x: x(s), w: w(s, e), renk: renk(D, r.job),
        baslik: `${r.id} · ${o?.ad ?? ''} · ${saatYaz(D, r.S)} → ${saatYaz(D, r.C)}${kl ? (kl.gun != null ? ' · dondurulmuş gün' : ' · sabit') : ''}`,
        sol: r.S < a, sag: r.C > b, secili: sec?.id === r.id, soluk: !!sJ && r.job !== sJ, gec: (p.J[r.job]?.T ?? 0) > 0.05, sabit: !!kl, dondu: kl?.gun != null,
      };
    });
    const acik = M ? M.rw.reduce((s, [u, v]) => s + Math.max(0, Math.min(v, b) - Math.max(u, a)), 0) : 24;
    const oran = acik ? dolu / acik : null; const uy = yanan ? uygun.has(m) : null;
    const er = uy && erken && erken.t > a ? { x: 0, w: w(a, Math.min(b, erken.t)), ad: erken.ad, t: erken.t, cizgi: erken.t < b ? x(erken.t) : null } : null;
    return { m, etiket: m.startsWith('@') ? m.slice(1) : m, ad: tezgahAdi(D, m), oran, isi: isiSeviyesi(oran), uygun: uy, kapali, ariza, bloklar, erken: er };
  });
  const L = Object.values(c.locks).map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>).gun : undefined));
  const gNo = Math.floor(now / 24) + g;
  const donukGunler = new Set(L.filter((v): v is number => typeof v === 'number'));
  const citU = DONDURMA_SAATI[String((c.w as Record<string, unknown>).denge ?? 'dengeli')] ?? 24; const cit = now + citU;
  return {
    a, gunler: Array.from({ length: 7 }, (_, i) => ({ g: i, ad: gunAdi(D, d0 + i * 24), dondu: donukGunler.has(Math.floor(now / 24) + i) })),
    satirlar, simdi: now > a && now < b ? x(now) : null,
    cit: citU && cit > a && cit < b ? x(cit) : null, citBant: citU && now < b && cit > a ? { x: x(Math.max(a, now)), w: w(Math.max(a, now), Math.min(b, cit)) } : null,
    erken, kilit: { donukBu: L.filter((v) => v === gNo).length, donukTum: L.filter((v) => typeof v === 'number').length, elle: L.filter((v) => typeof v !== 'number').length, cit: citU ? cit : null },
  };
}
