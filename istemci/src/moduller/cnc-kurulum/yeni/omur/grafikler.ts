import { fmtN, lifeModel, vbShape } from './cekirdek.ts';
import type { HesapliSonuc } from './analiz.ts';
import { saydam, type OmurPaleti } from './renk.ts';

// Analizin üç grafiği (prototipin lifeCharts'ı): aşınma ilerlemesi, 2000 takımlık ömür dağılımı, kesme hızına göre ömür. Çizim
// çekirdeğin drawChart'ıdır; burası yalnız seçenekleri kurar. Renkler tasarım değişkenindendir (T10).

export interface GrafikCizgisi { x?: number; y?: number; color: string; label?: string; dy?: number }
export interface GrafikSecenegi {
  title: string;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  xlabel: string;
  yfmt?: (v: number) => string;
  series: { pts: [number, number][]; color: string; fill?: string }[];
  bars?: { x0: number; x1: number; y: number; color: string }[];
  hlines?: GrafikCizgisi[];
  vlines?: GrafikCizgisi[];
}

export function asinmaGrafigi(r: HesapliSonuc, p: OmurPaleti): GrafikSecenegi {
  const M0 = r.M, vb = r.p.vb, tmax = M0.Tm * 1.35, pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) { const tt = tmax * i / 120; pts.push([tt, 0.3 * vbShape(tt / M0.T03)]); }
  return {
    title: 'Aşınma ilerlemesi (VB, mm)', xmin: 0, xmax: tmax, ymin: 0, ymax: Math.max(vb * 1.4, 0.35), xlabel: 'kesme süresi, dk', yfmt: (v) => fmtN(v, 2),
    series: [{ pts, color: p.grafik, fill: saydam(p.grafik, 0.12) }],
    hlines: [{ y: vb, color: p.over, label: 'Değişim sınırı VB ' + fmtN(vb, 2) }],
    vlines: [{ x: M0.TR, color: p.ok, label: 'Güvenli değişim ' + fmtN(M0.TR, 0) + ' dk' }, { x: M0.Tm, color: p.warn, label: 'Ortalama ' + fmtN(M0.Tm, 0), dy: 14 }],
  };
}

export function dagilimGrafigi(r: HesapliSonuc, p: OmurPaleti): GrafikSecenegi {
  const M0 = r.M, L0 = Array.from(r.lives).sort((a, b) => a - b), hmax = L0[Math.floor(L0.length * 0.995)]!, nb = 30, bins = new Array<number>(nb).fill(0);
  L0.forEach((v) => { bins[Math.min(nb - 1, Math.floor(v / hmax * nb))]!++; });
  const bw = hmax / nb;
  let peak = 0;
  const bars = bins.map((c, k) => { const d = c / L0.length / bw; peak = Math.max(peak, d); return { x0: k * bw, x1: (k + 1) * bw, y: d, color: saydam(p.grafik2, 0.55) }; });
  const pdf: [number, number][] = [];
  for (let k2 = 1; k2 <= 100; k2++) {
    const x = hmax * k2 / 100, z = x / M0.eta, b = M0.P.beta, y = b / M0.eta * Math.pow(z, b - 1) * Math.exp(-Math.pow(z, b));
    pdf.push([x, y]); peak = Math.max(peak, y);
  }
  return {
    title: 'Aynı takımdan 2000 adet: ömür dağılımı', xmin: 0, xmax: hmax, ymin: 0, ymax: peak * 1.15, xlabel: 'dk', yfmt: () => '', bars,
    series: [{ pts: pdf, color: p.grafik2 }],
    vlines: [{ x: M0.TR, color: p.ok, label: '%' + r.p.rel + ' bu süreyi geçer' }, { x: M0.Tm, color: p.warn, label: 'Ortalama', dy: 14 }],
  };
}

export function hizGrafigi(r: HesapliSonuc, p: OmurPaleti): GrafikSecenegi {
  const M0 = r.M, vs: [number, number][] = [], v0 = r.p.vc * 0.5, v1 = r.p.vc * 1.8;
  let tmx = 0;
  for (let k3 = 0; k3 <= 80; k3++) {
    const vc = v0 + (v1 - v0) * k3 / 80, M = lifeModel(r.t, r.mat, Object.assign({}, r.p, { vc })), T = M.err !== undefined ? 0 : M.Tm;
    vs.push([vc, T]); tmx = Math.max(tmx, Math.min(T, M0.Tm * 6));
  }
  const vl: GrafikCizgisi[] = [{ x: r.p.vc, color: p.yazi, label: 'Şu an ' + fmtN(r.p.vc, 0) }];
  if (r.vOpt) vl.push({ x: r.vOpt, color: p.ok, label: 'Ekonomik ' + fmtN(r.vOpt, 0), dy: 14 });
  return {
    title: 'Kesme hızı ↑ → ömür ↓', xmin: v0, xmax: v1, ymin: 0, ymax: tmx * 1.05, xlabel: 'Vc m/dk',
    series: [{ pts: vs, color: p.crit, fill: saydam(p.crit, 0.1) }], vlines: vl,
  };
}
