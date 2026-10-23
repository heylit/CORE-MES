// Torna: donel parca -> profil -> alin, kaba, finis, kanal, delik, kesme (ISO, X cap).
// Ag eksen yereldir: z eksen, x/y radyal; on alin zmax.
import { CLP, CK, cArea, camSlice } from '../hesap/kesit.ts';
import { mbAp } from '../hesap/malzeme-davranisi.ts';
import { fmtN } from '../bicim.ts';
import { camFmtI, camRDP3, kesme } from './cekirdek.ts';
import type { CamMalzeme, CamParametre, CamSure, CamTakim, CamTezgah, Nokta, V3 } from './tipler.ts';

export interface TornaAgi { V: Float64Array; T: ArrayLike<number>; D0: number; L0: number; ID?: number; face: number }
export interface ProfilNoktasi { z: number; r: number; ri: number }
export interface TornaProfili { prof: ProfilNoktasi[]; len: number; nonrot: number; n: number }
export interface TornaIslemi { name: string; tool: CamTakim; sub: string; kind: 'lathe'; i0: number; i1?: number }
export interface TornaKanali { a: number; b: number; depth: number }
export interface TornaSecenegi {
  op2?: boolean;
  ID?: number;
  P?: TornaProfili;
  D0?: number;
  face?: number;
  zLim?: number;
  mt?: boolean;
  tn?: Record<string, number>;
  noBore?: boolean;
  noPartOff?: boolean;
  offAllow?: number;
}
export interface TornaSonucu {
  text: string;
  lines: string[];
  hdr: number;
  tail: number;
  ops: TornaIslemi[];
  name: string;
  prof: ProfilNoktasi[];
  env: Float64Array;
  Lp: number;
  warn: string[];
  tn: Record<string, number>;
  grooves: TornaKanali[];
  bore: number;
  Lb: number;
  backLen: number;
  D0: number;
  time?: CamSure | null;
}
export type TornaTezgahi = CamTezgah;

export function camLatheProfile(Lm: { V: ArrayLike<number>; T: ArrayLike<number> }, step: number): TornaProfili {
  const V = Lm.V, T = Lm.T, nt = T.length / 3, tz0 = new Float64Array(nt), tz1 = new Float64Array(nt); let zmin = 1e9, zmax = -1e9;
  for (let t = 0; t < nt; t++) { const a = V[T[t * 3]! * 3 + 2]!, b = V[T[t * 3 + 1]! * 3 + 2]!, c = V[T[t * 3 + 2]! * 3 + 2]!; tz0[t] = Math.min(a, b, c); tz1[t] = Math.max(a, b, c); zmin = Math.min(zmin, tz0[t]!); zmax = Math.max(zmax, tz1[t]!); }
  const MM = { V, T, tz0, tz1 }, prof: ProfilNoktasi[] = []; let nonrot = 0;
  const merkez: Nokta = { X: 0, Y: 0 };
  for (let z = zmax - step / 2; z > zmin; z -= step) {
    const sl = camSlice(MM, z), area = cArea(sl); let ro = 0, ri = 0;
    sl.forEach((p) => { const hole = !CLP.Clipper.Orientation(p), inside = CLP.Clipper.PointInPolygon(merkez, p) !== 0; let mn = 1e18, mx = 0; p.forEach((q) => { const d = Math.hypot(q.X, q.Y); if (d < mn) mn = d; if (d > mx) mx = d; }); if (!hole) ro = Math.max(ro, mx / CK); else if (inside) ri = Math.max(ri, mn / CK); });
    const ideal = Math.PI * (ro * ro - ri * ri); if (ideal > 1 && Math.abs(area - ideal) / ideal > 0.04) nonrot++;
    prof.push({ z: z - zmax, r: ro, ri });
  }
  return { prof, len: zmax - zmin, nonrot, n: prof.length };
}

export function camLathe(Lm: TornaAgi, _prm: CamParametre, mach: TornaTezgahi, mat: CamMalzeme, lib: CamTakim[], o?: TornaSecenegi): TornaSonucu {
  o = o || {}; const op2 = !!o.op2, ID = o.ID != null ? o.ID : (Lm.ID || 0);
  const P = o.P || camLatheProfile(Lm, 0.25), pr = P.prof, Lp = P.len, D0 = o.D0 || Lm.D0, face = o.face != null ? o.face : Lm.face, warn: string[] = [], out: string[] = [], allowR = 0.3, ops: TornaIslemi[] = [];
  let cur: TornaIslemi | null = null;
  const zLim = op2 ? Math.min(Lp, o.zLim!) : Lp;
  if (!o.mt && P.nonrot > P.n * 0.05) warn.push('Parçada dönel olmayan detaylar var (düz yüzey, kama kanalı, yan delik): torna programı yalnız dönel profili işler — bunlar için freze/canlı takım gerekir');
  const env = new Float64Array(pr.length); let m = 0; for (let i = 0; i < pr.length; i++) { m = Math.max(m, pr[i]!.r); env[i] = m; }
  // env: onden geriye monoton artan zarf (ondeki dalma yok)
  const pick = (kind: string, f?: (t: CamTakim) => boolean): CamTakim[] => lib.filter((t) => t.kind === kind && (!f || f(t)));
  const tR = pick('lt_ext', (t) => /kaba/i.test(t.name))[0] || pick('lt_ext')[0], tF = pick('lt_ext', (t) => /finiş/i.test(t.name))[0] || tR, tG = pick('lt_groove')[0], tP = pick('lt_part')[0], tD = pick('drill').concat(pick('lt_udrill')).sort((a, b) => b.d - a.d), tB = pick('lt_bore');
  const tn = o.tn || {}; const T = (t: CamTakim): number => { if (!tn[t.id]) tn[t.id] = Object.keys(tn).length + 1; return tn[t.id]!; };
  const H = (l: string): void => { out.push(l); }; const f3 = (v: number): string => camFmtI(v);
  const no = (t: CamTakim): string => { const n = T(t); return (n < 10 ? '0' : '') + n; };
  const beg = (name: string, t: CamTakim, sub: string): void => { if (cur) cur.i1 = out.length; cur = { name, tool: t, sub, kind: 'lathe', i0: out.length }; ops.push(cur); };
  const head = (t: CamTakim, op: string): ReturnType<typeof kesme> => { const cd = kesme(t, mat, mach), off = no(t); H('(' + op + ' - ' + t.name + ')'); H('T' + off + off); if (cd.n && !/^G96/.test(cd.mode || '')) { H('G97 S' + Math.round(cd.n) + ' M3'); } else { H('G50 S' + (mach.spindle || mach.rpm || 3000)); H('G96 S' + Math.round(cd.vc || 150) + ' M3'); } H('M8'); return cd; };
  const pn = op2 ? 'O2020 (OTO-CAM TORNA ARKA TARAF - ' : 'O2010 (OTO-CAM TORNA - ';
  H('%'); H(pn + mat.name + ')'); H('(HAM: D' + f3(D0) + (op2 ? ' - TERS BAGLAMA, ON CAPTAN TUTULUR' : ' L' + f3(Lm.L0)) + ' - PARCA BOYU ' + f3(Lp) + ' - Z0 = BITMIS ' + (op2 ? 'ARKA' : 'ON') + ' ALIN)'); H('G21 G18 G40 G99'); H(op2 ? 'G55' : 'G54');
  const hdr = out.length, xF0 = ID > 0 ? ID - 1 : -1.6;
  // 1) alin + kaba
  if (tR) {
    beg(op2 ? 'Arka alın + kaba' : 'Alın + dış çap kaba', tR, 'rough');
    const cd = head(tR, op2 ? 'ARKA ALIN VE KABA' : 'ALIN VE KABA'), F = cd.f || 0.25; H('G0 X' + f3(D0 + 2) + ' Z' + f3(face + 1));
    for (let zf = face - 2; zf > -0.001; zf -= 2) { const z = Math.max(0, zf); H('G0 Z' + f3(z)); H('G1 X' + f3(xF0) + ' F' + f3(F * 0.8)); H('G0 Z' + f3(z + 1)); H('G0 X' + f3(D0 + 2)); if (z === 0) break; }
    if (face > 0) { H('G0 Z0'); H('G1 X' + f3(xF0) + ' F' + f3(F * 0.8)); H('G0 Z1'); H('G0 X' + f3(D0 + 2)); }
    const ap = mbAp(mat); let minR = 1e9; for (let mi = 0; mi < pr.length; mi++) if (pr[mi]!.z >= -zLim) minR = Math.min(minR, env[mi]!); minR += allowR;
    for (let X = D0 - 2 * ap; X / 2 > minR - 1e-6; X -= 2 * ap) {
      const xr = X / 2; let zEnd = -zLim, found = false; for (let k = 0; k < pr.length; k++) { if (env[k]! + allowR > xr) { zEnd = pr[k]!.z + 0.25; found = true; break; } }
      if (found && zEnd > -0.3) continue; zEnd = Math.max(zEnd, -zLim);
      H('G0 X' + f3(X) + ' Z1'); H('G1 Z' + f3(zEnd) + ' F' + f3(F)); H('G1 X' + f3(X + 2 * ap + 0.5) + ' Z' + f3(zEnd + 0.5)); H('G0 Z1');
    }
    H('G0 X' + f3(D0 + 2)); H('G0 Z' + f3(face + 5)); H('M9');
  } else warn.push('Kütüphanede dış çap kaba takımı yok');
  // 2) delik (eksenel): capraz delik bosluklarini tolere et
  let bore = 0, Lb = 0, gap = 0; for (let k2 = 0; k2 < pr.length; k2++) { if (pr[k2]!.ri > 0.3) { bore = Math.max(bore, pr[k2]!.ri); Lb = -pr[k2]!.z; gap = 0; } else if (bore > 0 && ++gap > 16) break; else if (!bore) break; }
  if (o.noBore) bore = 0;
  if (bore > 0) {
    // boru haminda delik zaten var: delme yok, baralama boru ic capindan baslar
    const Db = bore * 2, pre = ID > 0 ? ID : 0, dr = pre ? null : tD.filter((t) => t.d <= Db + 0.05)[0];
    if (!dr && !pre) warn.push('Ø' + fmtN(Db, 1) + ' eksenel delik için uygun matkap yok');
    else {
      if (!pre && dr) {
        beg('Eksenel delme Ø' + fmtN(dr.d, 1), dr, 'drill');
        const cdd = kesme(dr, mat, mach), off = no(dr), Fd = cdd.f || 0.12, peck = dr.d * 2.5;
        H('(DELIK - ' + dr.name + ')'); H('T' + off + off); H('G97 S' + Math.round(cdd.n || 1500) + ' M3'); H('M8'); H('G0 X0 Z3');
        for (let zz = -peck; ; zz -= peck) { const zt = Math.max(-(Lb + (dr.d * 0.3)), zz); H('G1 Z' + f3(zt) + ' F' + f3(Fd)); H('G0 Z1'); if (zt <= -(Lb + dr.d * 0.3) + 1e-6) break; H('G0 Z' + f3(zt + 0.5)); }
        H('G0 Z' + f3(face + 5)); H('M9');
      }
      const d0 = pre || dr!.d;
      if (Db - d0 > 0.2) { const bb = tB.filter((t) => (t.bar || 1.6) * 10 < Db - 1)[0]; if (bb) { beg('Delik baralama Ø' + fmtN(Db, 2), bb, 'bore'); const cdb = kesme(bb, mat, mach), ob = no(bb); H('(DELIK BARALAMA - ' + bb.name + ')'); H('T' + ob + ob); H('G50 S' + (mach.spindle || 3000)); H('G96 S' + Math.round(cdb.vc || 120) + ' M3'); for (let Xb = d0 + 1; Xb < Db + 1e-6; Xb = Math.min(Db, Xb + 2)) { H('G0 X' + f3(Xb) + ' Z1'); H('G1 Z' + f3(-Lb) + ' F' + f3(cdb.f || 0.12)); H('G1 X' + f3(Xb - 0.5)); H('G0 Z1'); if (Xb >= Db) break; } H('G0 X' + f3(d0 - 1) + ' Z' + f3(face + 5)); } else warn.push('Ø' + fmtN(Db, 1) + ' delik ' + (pre ? 'boru iç çapı' : 'matkapla') + ' Ø' + fmtN(d0, 1) + (pre ? ';' : ' açıldı;') + ' baralama barı bu çapa girmiyor — rayba ya da küçük bar gerekir'); }
    }
  }
  // 3) finis profili
  if (tF) {
    beg(op2 ? 'Arka profil finiş' : 'Dış çap finiş', tF, 'finish');
    const cdf = head(tF, op2 ? 'ARKA PROFIL FINIS' : 'DIS CAP FINIS'), Ff = cdf.f || 0.12, pts: number[][] = [];
    for (let q = 0; q < pr.length; q++) { if (pr[q]!.z < -zLim) break; pts.push([pr[q]!.z, env[q]! * 2]); }
    const simp = camRDP3(pts.map((p): V3 => [p[0]!, p[1]!, 0]), 0.005);
    H('G0 X' + f3(bore > 0 ? bore * 2 - 1 : -1.6) + ' Z1'); H('G1 Z0 F' + f3(Ff)); H('G1 X' + f3(simp[0]![1] - 1));
    simp.forEach((p) => { H('G1 X' + f3(p[1]) + ' Z' + f3(p[0])); });
    if (!op2) H('G1 Z' + f3(-Lp)); H('G1 X' + f3(D0 + 1)); H('G0 Z' + f3(face + 5)); H('M9');
  }
  // 4) kanallar (zarfin altinda kalan bolgeler)
  let grooves: TornaKanali[] = [], g0: { a: number; b?: number; depth: number } | null = null;
  for (let g = 0; g < pr.length; g++) { const under = env[g]! - pr[g]!.r > 0.08; if (under && !g0) g0 = { a: g, depth: 0 }; if (under) g0!.depth = Math.max(g0!.depth, env[g]! - pr[g]!.r); if ((!under || g === pr.length - 1) && g0) { g0.b = under ? g : g - 1; grooves.push(g0 as TornaKanali); g0 = null; } }
  const back = grooves.filter((gr) => gr.b >= pr.length - 2); grooves = grooves.filter((gr) => gr.b < pr.length - 2 && (!op2 || -pr[gr.b]!.z < zLim - 0.3));
  const backLen = back.length ? (back[0]!.b - back[0]!.a + 1) * 0.25 : 0;
  if (back.length && !o.mt) warn.push('Arka taraftaki küçük çaplı bölüm (Ø' + fmtN(2 * pr[pr.length - 1]!.r, 1) + ', ' + fmtN(backLen, 1) + ' mm) öndeki büyük çapın arkasında kalıyor: 2. bağlamada (parça ters çevrilerek) işlenmeli');
  if (grooves.length) {
    if (!tG) warn.push(grooves.length + ' kanal/boyun var ama kanal takımı yok');
    else {
      beg('Kanal / boyun × ' + grooves.length, tG, 'groove');
      let w = 3; const mw = /(\d+(?:[.,]\d)?) *mm/.exec(tG.name); if (mw) w = parseFloat(mw[1]!.replace(',', '.'));
      const cdg = kesme(tG, mat, mach), og = no(tG); H('(KANAL - ' + tG.name + ')'); H('T' + og + og); H('G97 S' + Math.round(cdg.n || 600) + ' M3'); H('M8');
      grooves.forEach((gr) => {
        const za = pr[gr.a]!.z + 0.125, zb = pr[gr.b]!.z - 0.125, gw = za - zb; if (gw < w - 0.05) { warn.push('Kanal ' + fmtN(gw, 1) + ' mm, kanal ucu ' + fmtN(w, 1) + ' mm — sığmıyor'); return; }
        const Xo = 2 * Math.max(env[gr.a]!, env[gr.b]!) + 1;
        for (let zc = za - w / 2; ; zc -= w * 0.8) { zc = Math.max(zc, zb + w / 2); let rmin = 1e9; for (let j = gr.a; j <= gr.b; j++) if (pr[j]!.z <= zc + w / 2 && pr[j]!.z >= zc - w / 2) rmin = Math.min(rmin, pr[j]!.r); H('G0 X' + f3(Xo) + ' Z' + f3(zc)); H('G1 X' + f3(2 * rmin) + ' F' + f3(cdg.f || 0.05)); H('G0 X' + f3(Xo)); if (zc <= zb + w / 2 + 1e-6) break; }
      });
      H('G0 X' + f3(D0 + 2) + ' Z' + f3(face + 5)); H('M9');
    }
  }
  const tail = out.length;
  // 5) kesme (2. baglama icin 0,5 mm alin payi birakir)
  const offA = o.offAllow != null ? o.offAllow : 0.5;
  if (!o.noPartOff) {
    if (tP) { beg('Kesme (' + fmtN(offA, 1) + ' mm alın payı)', tP, 'part'); const cdp = kesme(tP, mat, mach), op = no(tP), wp = 3; H('(KESME - ' + tP.name + ')'); H('T' + op + op); H('G97 S' + Math.round(cdp.n || 500) + ' M3'); H('M8'); H('G0 X' + f3(D0 + 2) + ' Z' + f3(-Lp - offA - wp / 2)); H('G1 X' + f3(bore > 0 && Lb >= Lp - 0.5 ? bore * 2 - 1 : -0.5) + ' F' + f3(cdp.f || 0.05)); H('G0 X' + f3(D0 + 2)); H('M9'); }
    else warn.push('Kesme takımı yok — parça elle ayrılmalı');
  }
  const son = cur as TornaIslemi | null; if (son) son.i1 = out.length;
  H('G28 U0 W0'); H('M30'); H('%');
  if (!o.mt) warn.push('Arka alın ve pahlar için 2. bağlama (ters çevirip alın tornalama) gerekir');
  return { text: out.join('\n'), lines: out, hdr, tail, ops, name: op2 ? 'OP20_TORNA_ARKA.NC' : 'OP10_TORNA.NC', prof: pr, env, Lp, warn, tn, grooves, bore, Lb, backLen, D0 };
}
