import {
  durusToplamlari, enCokPlansiz, isDegisiminiDurusSay, nedenToplamlari, type NedenToplami,
} from '../../../../../../arkon/web/src/data/durus-nedeni.ts';
import { birlesimSuresi, type Aralik, type DurusGerceklesmesi } from './vardiya.ts';

// OEE çekirdeği (ortak-ayarlar.ts oeeCalc): bir istasyonun [from, to) aralığı. Planlı süre = vardiya süresi − molalar − planlı duruşlar
// (takvim + planlı nedenli duruşlar); planlı kayıp yalnız vardiya içinde sayılır. Vardiya penceresi yoksa planlı süre ve OEE yoktur.

export interface DurumOlayi { at: number; state: string; reason?: string | null; orderNo?: string | null }

// 684: istasyonda aynı anda birden çok iş açık olabilir. İstasyonun hâli işlerin son hâllerinden çıkar: biri çalışıyorsa istasyon
// çalışıyordur (sonra ayar, duruş, duraklatma); hiçbiri bunlardan değilse son olayın hâli. İş nosuz eski olaylar tek iş sayılır,
// tek işte sonuç eski kuralla (son olay kazanır) aynıdır.
const ONCELIK = ['running', 'setup', 'stopped', 'paused'];
function istasyonHali(isler: ReadonlyMap<string, { state: string; reason?: string | null }>, son: { state: string; reason?: string | null }) {
  for (const s of ONCELIK) for (const h of isler.values()) if (h.state === s) return h;
  return son;
}
export interface SayimKaydi { kind: string; delta: number; planMs?: number | null; cycleMs?: number | null; reason?: string | null }
export interface OeePenceresi extends Aralik { breaks?: Aralik[] }
export interface ZamanParcasi { f: number; t: number; s: string; n: string | null | undefined }

export interface OeeGirdisi {
  ev: readonly DurumOlayi[] | null | undefined;
  cn: readonly SayimKaydi[] | null | undefined;
  from: number;
  to: number;
  windows?: readonly OeePenceresi[] | null;
}
// Ayarlardan gelen iki bilgi: neden planlı mı, istasyonun aralıktaki takvim duruşları.
export interface OeeOrtami {
  planliMi: (kod: string | null | undefined) => boolean;
  durusPencereleri: (from: number, to: number) => readonly DurusGerceklesmesi[];
}

export interface OeeSonucu {
  segs: ZamanParcasi[]; shiftMs: number; planned: number; breakMs: number; downMs: number; run: number; stopMs: number; stopPMs: number;
  setupMs: number; pauseMs: number; good: number; scrap: number; ideal: number; A: number | null; P: number | null; Q: number | null;
  oee: number | null; stops: number; byR: Record<string, NedenToplami>; scrapBy: Record<string, number>; topReason: string | null;
  best: number | null; avg: number | null; has: boolean;
}

export function oeeHesapla(g: OeeGirdisi, o: OeeOrtami): OeeSonucu {
  const { from, to } = g;
  const ev = [...(g.ev ?? [])].sort((a, b) => a.at - b.at);
  const isler = new Map<string, DurumOlayi>();
  let durum = 'none';
  let not: string | null | undefined = null;
  const isle = (e: DurumOlayi) => { isler.set(e.orderNo ?? '', e); const h = istasyonHali(isler, e); durum = h.state; not = h.reason; };
  for (const e of ev) if (e.at <= from) isle(e);
  const ham: ZamanParcasi[] = [];
  let t = from;
  const ekle = (x: number, s: string, n: string | null | undefined) => {
    if (x <= t) return;
    const son = ham[ham.length - 1];
    if (son && son.s === s && son.n === n) son.t = x;
    else ham.push({ f: t, t: x, s, n });
    t = x;
  };
  for (const e of ev) {
    if (e.at <= from || e.at > to) continue;
    ekle(e.at, durum, not);
    isle(e);
  }
  ekle(to, durum, not);
  const segs = isDegisiminiDurusSay(ham);
  const wins: readonly OeePenceresi[] = g.windows ?? [{ s: from, e: to, breaks: [] }];
  const shiftMs = wins.reduce((a, w) => a + Math.max(0, Math.min(to, w.e) - Math.max(from, w.s)), 0);
  const brks = wins.flatMap((w) => w.breaks ?? []);
  const dws = o.durusPencereleri(from, to);
  const pstops = segs.filter((x) => x.s === 'stopped' && o.planliMi(x.n)).map((x) => ({ s: x.f, e: x.t }));
  const vardiyada = (l: readonly Aralik[]) => l.flatMap((x) => wins.map((w) => ({ s: Math.max(x.s, w.s), e: Math.min(x.e, w.e) })).filter((y) => y.e > y.s));
  const plannedOff = birlesimSuresi(vardiyada([...brks, ...dws, ...pstops]), from, to);
  const breakMs = birlesimSuresi(vardiyada(brks), from, to);
  const downMs = birlesimSuresi(vardiyada([...dws, ...pstops]), from, to);
  const planned = shiftMs > 0 ? Math.max(1, shiftMs - plannedOff) : 0;
  const sure = (k: string) => segs.filter((x) => x.s === k).reduce((a, x) => a + x.t - x.f, 0);
  const run = sure('running');
  const setupMs = sure('setup');
  const pauseMs = sure('paused');
  const stopU = segs.filter((x) => x.s === 'stopped' && !o.planliMi(x.n));
  const stopP = segs.filter((x) => x.s === 'stopped' && o.planliMi(x.n));
  const stopMs = stopU.reduce((a, x) => a + x.t - x.f, 0);
  const stopPMs = stopP.reduce((a, x) => a + x.t - x.f, 0);
  const cn = g.cn ?? [];
  const good = cn.filter((c) => c.kind === 'good').reduce((a, c) => a + c.delta, 0);
  const scrap = cn.filter((c) => c.kind === 'scrap').reduce((a, c) => a + c.delta, 0);
  const ideal = cn.filter((c) => c.delta > 0).reduce((a, c) => a + (c.planMs || 0) * c.delta, 0);
  const cyc = cn.filter((c) => c.delta > 0 && (c.cycleMs ?? 0) > 0).map((c) => c.cycleMs as number);
  const A = planned > 0 ? Math.min(1, run / planned) : null;
  const P = run > 0 && ideal > 0 ? Math.min(1, ideal / run) : null;
  const Q = good + scrap > 0 ? good / (good + scrap) : null;
  const scrapBy: Record<string, number> = {};
  for (const c of cn) if (c.kind === 'scrap') { const k = c.reason || '—'; scrapBy[k] = (scrapBy[k] ?? 0) + c.delta; }
  return {
    segs, shiftMs, planned, breakMs, downMs, run, stopMs, stopPMs, setupMs, pauseMs, good, scrap, ideal, A, P, Q,
    oee: A !== null && P !== null && Q !== null ? A * Math.min(1, P) * Q : null,
    stops: stopU.length, byR: nedenToplamlari(segs), scrapBy, topReason: enCokPlansiz(durusToplamlari(segs), (k) => o.planliMi(k)),
    best: cyc.length ? Math.min(...cyc) : null, avg: cyc.length ? cyc.reduce((a, b) => a + b, 0) / cyc.length : null,
    has: ev.some((e) => e.at > from) || cn.length > 0,
  };
}
