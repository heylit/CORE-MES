import { rgba, type HaritaRenkleri, type Rgb } from '../../motor/harita/renk.ts';
import type { OkunanPlan } from '../../motor/kurallar.ts';
import type { PlanVerisi } from '../../tipler.ts';
import {
  izdus, komsular, siparisTonu, tezgahAni, yay, yoldakiler, type AgDugumu, type AgSahnesi, type Izdusum, type Kamera, type Konum, type Nokta,
} from './kurallar.ts';

// Akış ağının tuval çizimi (bugünkü sayfa agCiz, agKutu, agAtolyeCiz): uzaktan yakına sıralanır; renkler tasarım değişkenlerinden okunmuştur.
export interface CizimDurumu {
  W: number; H: number; k: Kamera; R: HaritaRenkleri; s: AgSahnesi; D: PlanVerisi; p: OkunanPlan | null;
  tur: number; sec: string | null; ust: string | null; t: number; yazi: string;
}

// Kutunun yüz gölgesi tema renginden bağımsız saydam siyah ve beyazdır (bugünkü sayfa agKutu).
const KOYU: Rgb = [0, 0, 0], ACIK: Rgb = [255, 255, 255];

function dugumRengi(n: AgDugumu, R: HaritaRenkleri): Rgb {
  switch (n.tur) {
    case 'veri': return R.grafik2;
    case 'kisit': return R.muted;
    case 'cozucu': return R.grafik;
    case 'plan': return R.hazard;
    case 'is': return R.is[n.renk ?? 0] ?? R.grafik;
    case 'siparis:gec': return R.stop;
    case 'siparis:zaman': case 'karar:alindi': return R.run;
    case 'karar:butce': case 'karar:haric': return R.hold;
    default: return R.cizgi;
  }
}
const isRengi = (o: CizimDurumu, job: string): Rgb => {
  if (!o.p) return o.R.grafik;
  const t = siparisTonu(o.D, o.p, job); return t === 'gec' ? o.R.stop : o.R.is[t] ?? o.R.grafik;
};
function cokgen(g: CanvasRenderingContext2D, l: readonly (readonly [number, number, ...number[]])[]): void {
  g.beginPath(); l.forEach((q, j) => { if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath();
}

export function ciz(g: CanvasRenderingContext2D, o: CizimDurumu): Map<string, Konum> {
  return o.s.kip === 'atolye' ? atolyeCiz(g, o) : agCiz(g, o);
}

function agCiz(g: CanvasRenderingContext2D, o: CizimDurumu): Map<string, Konum> {
  const { W, H, k, R, s } = o; const yer = new Map<string, Konum>();
  const tur = s.kip === 'karar' ? o.tur : -1; const h = o.sec ?? o.ust; const komsu = komsular(s.E, h);
  const sonuk = (n: AgDugumu) => (tur >= 0 && n.katman !== tur) || (!!h && n.id !== h && !komsu.has(n.id));
  const iz = (p: Nokta) => izdus(k, p, W, H);
  for (const n of s.N) yer.set(n.id, { q: iz(n.p), ...(n.u ? { q0: iz([n.u[0], n.p[1], n.p[2]]), q1: iz([n.u[1], n.p[1], n.p[2]]) } : {}), r: 0 });
  // Zemin: karar kipinde katman çerçeveleri, zaman ağında taban düzlemi.
  g.lineWidth = 1; g.strokeStyle = rgba(R.cizgi, 0.5);
  if (s.kip === 'karar') {
    for (const x of [-1.1, -0.6, -0.1, 0.4, 1.1]) { cokgen(g, ([[x, -1, -1], [x, -1, 1], [x, 1, 1], [x, 1, -1]] as Nokta[]).map(iz)); g.stroke(); }
  } else { cokgen(g, ([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] as Nokta[]).map(iz)); g.stroke(); }
  // Kenarlar uzaktan yakına.
  const es = s.E.flatMap((e) => { const a = yer.get(e.a), b = yer.get(e.b), na = s.ix[e.a], nb = s.ix[e.b]; return a && b && na && nb ? [{ e, a, b, na, nb }] : []; })
    .sort((x, y) => x.a.q[2] + x.b.q[2] - (y.a.q[2] + y.b.q[2]));
  for (const { e, a, b, na, nb } of es) {
    const vurgu = !!h && (e.a === h || e.b === h); const dim = !vurgu && (!!h || (tur >= 0 && na.katman !== tur && nb.katman !== tur));
    const qa = a.q1 ?? a.q, qb = b.q0 ?? b.q;
    const al = dim ? 0.08 : vurgu ? 0.95 : 0.22 + 0.4 * e.g;
    g.strokeStyle = rgba(e.tur === 'alindi' ? R.run : e.tur === 'tam' || e.tur === 'oneri' ? R.grafik : R.muted, al);
    g.lineWidth = (e.tur === 'tam' || e.tur === 'alindi' ? 2 : 1) * (vurgu ? 1.5 : 1);
    g.setLineDash(e.tur === 'yaklasik' || e.tur === 'hakem' || e.tur === 'sinir' ? [4, 4] : []);
    g.beginPath(); g.moveTo(qa[0], qa[1]); g.lineTo(qb[0], qb[1]); g.stroke();
  }
  g.setLineDash([]);
  // Düğümler uzaktan yakına; zemin halkası örtüşmeyi ayırır.
  const ns = [...s.N].sort((a, b) => (yer.get(a.id)?.q[2] ?? 0) - (yer.get(b.id)?.q[2] ?? 0));
  const taban = Math.min(W, H) * 0.42 * k.uz;
  for (const n of ns) {
    const y = yer.get(n.id); if (!y) continue;
    const r = Math.max(3, n.boy * (s.kip === 'karar' ? 6 : 3.2) * (y.q[3] / taban) * k.uz); y.r = r;
    const al = sonuk(n) ? 0.18 : 1; const c = dugumRengi(n, R);
    if (y.q0 && y.q1) {
      g.lineCap = 'round'; g.beginPath(); g.moveTo(y.q0[0], y.q0[1]); g.lineTo(y.q1[0], y.q1[1]);
      g.strokeStyle = rgba(R.panel, al); g.lineWidth = r * 1.6 + 4; g.stroke();
      g.strokeStyle = rgba(c, al); g.lineWidth = r * 1.6; g.stroke(); g.lineCap = 'butt';
    } else {
      g.fillStyle = rgba(R.panel, al); g.beginPath(); g.arc(y.q[0], y.q[1], r + 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = rgba(c, al); g.beginPath(); g.arc(y.q[0], y.q[1], r, 0, Math.PI * 2); g.fill();
      if (n.tur === 'karar:alinmadi' || n.tur === 'karar:yok') { g.fillStyle = rgba(R.panel, al); g.beginPath(); g.arc(y.q[0], y.q[1], r * 0.45, 0, Math.PI * 2); g.fill(); }
    }
    if (n.id === o.sec || n.id === o.ust) { g.strokeStyle = rgba(R.ink); g.lineWidth = 2; g.beginPath(); g.arc(y.q[0], y.q[1], r + 5, 0, Math.PI * 2); g.stroke(); }
  }
  // Yalnız çözücülerin, planın, turdaki katmanın ve seçimin komşularının adı yazılır; gerisi ipucundadır.
  g.font = `600 12px ${o.yazi}`; g.textBaseline = 'middle';
  for (const n of ns) {
    const y = yer.get(n.id); if (!y) continue;
    const yaz = s.kip === 'karar' && (n.tur === 'cozucu' || n.tur === 'plan' || (tur >= 0 && n.katman === tur) || n.id === o.sec || (!!o.sec && komsu.has(n.id)));
    if (!yaz || (sonuk(n) && n.id !== o.sec)) continue;
    const t = n.ad.length > 28 ? `${n.ad.slice(0, 27)}…` : n.ad; const w = g.measureText(t).width;
    g.fillStyle = rgba(R.panel, 0.85); g.fillRect(y.q[0] + y.r + 4, y.q[1] - 8, w + 6, 16);
    g.fillStyle = rgba(R.ink); g.fillText(t, y.q[0] + y.r + 7, y.q[1]);
  }
  return yer;
}

function kutu(g: CanvasRenderingContext2D, o: CizimDurumu, mer: Nokta, boy: Nokta, renk: Rgb, al: number): void {
  const [x, y, z] = mer, [a, b, c] = boy;
  const k = ([[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]] as Nokta[])
    .map(([dx, dy, dz]) => izdus(o.k, [x + dx, y + dy, z + dz], o.W, o.H));
  const yuz: [number, number, number, number, number][] = [[0, 1, 2, 3, 0.18], [4, 5, 6, 7, 0.1], [0, 1, 5, 4, 0.32], [3, 2, 6, 7, -0.12], [0, 3, 7, 4, 0.24], [1, 2, 6, 5, 0.04]];
  const kose = (i: number): Izdusum => k[i] ?? [0, 0, 0, 0];
  yuz.map((f) => ({ f, d: (kose(f[0])[2] + kose(f[1])[2] + kose(f[2])[2] + kose(f[3])[2]) / 4 })).sort((p, q) => p.d - q.d).forEach(({ f }) => {
    cokgen(g, [kose(f[0]), kose(f[1]), kose(f[2]), kose(f[3])]);
    g.fillStyle = rgba(renk, al); g.fill();
    g.fillStyle = rgba(f[4] > 0 ? KOYU : ACIK, al * Math.abs(f[4])); g.fill();
    g.strokeStyle = rgba(o.R.panel, al); g.lineWidth = 1; g.stroke();
  });
}

function atolyeCiz(g: CanvasRenderingContext2D, o: CizimDurumu): Map<string, Konum> {
  const { W, H, k, R, s, t } = o; const at = s.at; const yer = new Map<string, Konum>(); if (!at) return yer;
  const sec = o.sec ?? o.ust; const iz = (p: Nokta) => izdus(k, p, W, H);
  // Zemin ızgarası.
  g.strokeStyle = rgba(R.cizgi, 0.45); g.lineWidth = 1;
  for (let i = -6; i <= 6; i++) { const a = iz([i / 5, -0.37, -1.15]), b = iz([i / 5, -0.37, 1.15]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  for (let i = -5; i <= 5; i++) { const a = iz([-1.25, -0.37, i / 4.5]), b = iz([1.25, -0.37, i / 4.5]); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // Akış yayları: kalınlık o yoldan geçen geçiş sayısı.
  for (const e of s.E) {
    const a = s.ix[e.a], b = s.ix[e.b]; if (!a || !b) continue;
    const vurgu = !!sec && (e.a === sec || e.b === sec); const c = rgba(vurgu ? R.grafik : R.muted, sec ? (vurgu ? 0.9 : 0.08) : 0.3); const n = (e.n ?? 1) / at.maxN;
    g.strokeStyle = c; g.lineWidth = 1 + 4 * n; g.beginPath();
    for (let i = 0; i <= 16; i++) { const q = iz(yay(a, b, i / 16)); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    g.stroke();
    const uc = iz(yay(a, b, 1)); g.fillStyle = c; g.beginPath(); g.arc(uc[0], uc[1], 2 + 2 * n, 0, Math.PI * 2); g.fill();
  }
  // Tezgâhlar ve kuyrukları, uzaktan yakına. Kuyruk tezgâhın üstünde aşağıdan yukarı: en alttaki ilk çalışacak olandır.
  for (const n of s.N) yer.set(n.id, { q: iz(n.p), r: 0 });
  const ns = [...s.N].sort((a, b) => (yer.get(a.id)?.q[2] ?? 0) - (yer.get(b.id)?.q[2] ?? 0));
  g.font = `600 12px ${o.yazi}`;
  for (const n of ns) {
    const y = yer.get(n.id); if (!y) continue;
    const a = tezgahAni(at, n.m ?? '', t);
    const dim = !!sec && sec !== n.id && !s.E.some((e) => (e.a === sec && e.b === n.id) || (e.b === sec && e.a === n.id));
    const al = dim ? 0.25 : 1;
    kutu(g, o, n.p, [0.075, 0.06, 0.07], n.tur === 'fason' ? R.is[3] ?? R.cizgi : R.cizgi, al);
    kutu(g, o, [n.p[0], n.p[1] + 0.065, n.p[2]], [0.06, 0.006, 0.055], a.simdi ? (a.ayarda ? R.hazard : R.run) : R.cizgi, al);
    a.sira.forEach((r, i) => kutu(g, o, [n.p[0], n.p[1] + 0.11 + i * 0.05, n.p[2]], [0.045, 0.02, 0.045], isRengi(o, r.job), al));
    if (a.fazla) {
      const q = iz([n.p[0], n.p[1] + 0.11 + 7 * 0.05, n.p[2]]); g.font = `600 11px ${o.yazi}`; g.textAlign = 'start'; g.textBaseline = 'middle';
      g.fillStyle = rgba(R.muted, al); g.fillText(`+${a.fazla}`, q[0] - 8, q[1]); g.font = `600 12px ${o.yazi}`;
    }
    y.r = Math.max(10, y.q[3] * 0.08);
    const q = iz([n.p[0], n.p[1] - 0.07, n.p[2] + 0.13]); const yazi = n.tur === 'fason' ? n.ad.slice(0, 16) : n.ad;
    g.textAlign = 'center'; g.textBaseline = 'top'; const w = g.measureText(yazi).width;
    g.fillStyle = rgba(R.panel, dim ? 0.2 : 0.85); g.fillRect(q[0] - w / 2 - 3, q[1] - 1, w + 6, 16);
    g.fillStyle = rgba(R.ink, dim ? 0.3 : 1); g.fillText(yazi, q[0], q[1]); g.textAlign = 'start';
    if (n.id === o.sec) { g.strokeStyle = rgba(R.ink); g.lineWidth = 2; g.beginPath(); g.arc(y.q[0], y.q[1], y.r + 6, 0, Math.PI * 2); g.stroke(); }
  }
  // Yoldaki partiler: önceki adım bitti, sonraki başlamadı; nokta yay üzerinde bekleme oranı kadar ilerler.
  for (const { e, x, u } of yoldakiler(s.E, t)) {
    const a = s.ix[e.a], b = s.ix[e.b]; if (!a || !b) continue;
    const q = iz(yay(a, b, u));
    g.fillStyle = rgba(R.panel); g.beginPath(); g.arc(q[0], q[1], 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgba(isRengi(o, x.job)); g.beginPath(); g.arc(q[0], q[1], 4.5, 0, Math.PI * 2); g.fill();
  }
  return yer;
}
