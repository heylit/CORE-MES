// Ham parca kaynaklari (BLK FORM, Ham Malzeme sayfasi, takim yolundan otomatik, elle) ve program sifiri.
import type { HamSonuc } from '../hesap/ham.ts';
import type { HamKaynagi, HamKutu, Program, TakimBilgisi, TakimNo } from './tipler.ts';

export type HamOrijini = 'tlf' | 'tc' | 'blf' | 'bc' | 'cad';

export const HAM_ORIG: Record<HamOrijini, string> = {
  tlf: 'Üst yüzey · sol ön köşe', tc: 'Üst yüzey · merkez', blf: 'Alt yüzey · sol ön köşe', bc: 'Alt yüzey · merkez', cad: 'STEP modelinin kendi orijini',
};

// Ham Malzeme sonucundan program sifirina tasinmis kutu; yuvarlak cubuk kutu olarak gosterilir.
export function hamInfo(r: HamSonuc | null, o: HamOrijini, modelAdi: string | null): HamKutu | null {
  if (!r || !r.ok) return null;
  const c = r.ctr, sz = r.type === 'bar' ? [0, 1, 2].map((i) => (i === r.ai ? r.L! : r.D!)) : r.S!;
  const mn = [c[0]! - sz[0]! / 2, c[1]! - sz[1]! / 2, c[2]! - sz[2]! / 2], mx = [c[0]! + sz[0]! / 2, c[1]! + sz[1]! / 2, c[2]! + sz[2]! / 2];
  let sh: number[];
  if (o === 'tc') sh = [-c[0]!, -c[1]!, -mx[2]!];
  else if (o === 'blf') sh = [-mn[0]!, -mn[1]!, -mn[2]!];
  else if (o === 'bc') sh = [-c[0]!, -c[1]!, -mn[2]!];
  else if (o === 'cad') sh = [0, 0, 0];
  else sh = [-mn[0]!, -mn[1]!, -mx[2]!];
  return {
    x0: mn[0]! + sh[0]!, y0: mn[1]! + sh[1]!, z0: mn[2]! + sh[2]!, x1: mx[0]! + sh[0]!, y1: mx[1]! + sh[1]!, z1: mx[2]! + sh[2]!,
    shift: sh, label: r.label, bar: r.type === 'bar', file: modelAdi, src: 'ham',
  };
}

// Kesme hareketlerinin zarfi + en buyuk takim yaricapi; ust yuzey 0 ya da kesmenin en ustu.
export function autoBox(p: Program, takim: (T: TakimNo) => TakimBilgisi): HamKutu | null {
  const f = p.fbounds;
  if (f[0]! > f[3]!) return null;
  let r = 0;
  p.tools.forEach((T) => { r = Math.max(r, takim(T).d / 2); });
  const zt = f[5]! > 0 && f[2]! < 0 ? 0 : f[5]!;
  return { x0: Math.floor(f[0]! - r), y0: Math.floor(f[1]! - r), z0: Math.floor(Math.min(f[2]!, zt - 1) - 5), x1: Math.ceil(f[3]! + r), y1: Math.ceil(f[4]! + r), z1: zt, src: 'auto' };
}

export type ElleKutu = Omit<HamKutu, 'src'>;
export type HamSecenekleri = Partial<Record<HamKaynagi, HamKutu>> & { man: HamKutu };

export function gStockOpts(p: Program, ham: HamKutu | null, otomatik: HamKutu | null, elle: ElleKutu | null | undefined): HamSecenekleri {
  const o: Partial<Record<HamKaynagi, HamKutu>> = {};
  if (p.blk) o.blk = { x0: p.blk.min.x, y0: p.blk.min.y, z0: p.blk.min.z, x1: p.blk.max.x, y1: p.blk.max.y, z1: p.blk.max.z, src: 'blk' };
  if (ham) o.ham = ham;
  if (otomatik) o.auto = otomatik;
  const man = Object.assign({ src: 'man' as const }, elle || o.blk || o.auto || { x0: 0, y0: 0, z0: -20, x1: 100, y1: 100, z1: 0 });
  man.src = 'man';
  return { ...o, man };
}

// Secilen kaynak yoksa BLK FORM, o da yoksa otomatik kutu kullanilir.
export function gStockBox(o: HamSecenekleri, secim: HamKaynagi): { kullanilan: HamKaynagi; kutu: HamKutu | null } {
  let s = secim;
  if (!o[s]) s = o.blk ? 'blk' : 'auto';
  return { kullanilan: s, kutu: o[s] || null };
}

export function boxTxt(b: HamKutu | null | undefined, fmtN: (x: number, d?: number) => string): string {
  return b ? [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].map((v) => fmtN(v, v % 1 ? 1 : 0)).join(' × ') + ' mm' : '—';
}

export const HAM_ETIKETI: Record<HamKaynagi, string> = { blk: 'BLK FORM', ham: 'Ham Malzeme', auto: 'Otomatik', man: 'Elle' };

export interface GsimOzeti {
  name: string; machine: string; total: number; feedT: number;
  perTool: Record<string, { t: number; id: string | null; name: string; S: number; F: number }>;
}

// state.gsim: takim omru ve hazirlik bu ozeti okur; torna istasyonuna (T0101 -> 1) gore toplanir.
export function gExport(p: Program, tezgah: string, takim: (T: TakimNo) => TakimBilgisi, istasyon: (T: TakimNo) => TakimNo): GsimOzeti {
  const per: GsimOzeti['perTool'] = {};
  Object.keys(p.stat.perTool).forEach((T) => {
    const st = p.stat.perTool[T]!, Tn: TakimNo = isNaN(+T) ? T : +T, ti = takim(Tn), k = String(istasyon(Tn)), o = per[k];
    if (o) { o.F = (o.F * o.t + st.len) / Math.max(1e-9, o.t + st.t); o.t += st.t; return; }
    per[k] = { t: st.t, id: ti.id, name: ti.name, S: st.S, F: st.t > 0 ? st.len / st.t : 0 };
  });
  return { name: p.name || '', machine: tezgah, total: p.total, feedT: p.stat.feedT, perTool: per };
}
