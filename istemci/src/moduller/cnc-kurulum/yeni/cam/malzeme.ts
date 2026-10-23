import { coolHint } from '../hesap/kesme.ts';
import { matBeh, matRef, mbCat, mbTimeAs, type MalzemeOzu, type SureDagilimi } from '../hesap/malzeme-davranisi.ts';
import { allMaterials, byId } from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import type { IsMalzemesi, Kalem } from '../veri/tipler.ts';
import { camCal } from './ayar-suresi.ts';
import type { FrezeIs, MtIs, NcProgram } from './tipler.ts';

/* Malzeme etkisi kutusunun hesabi: cevrim suresi C45'e gore, ayni ailenin diger durumlari, 17-4PH yaslandirma kuculmesi. */
export function mbSplit(J: MtIs | FrezeIs, kind: 'mt' | 'mill', progs: Record<string, NcProgram>): SureDagilimi {
  const S: SureDagilimi = { fin: 0, mill: 0, turn: 0, tot: 0 };
  if (kind === 'mt') (J as MtIs).rows.forEach((r) => { S[mbCat(r)] += r.cut || 0; S.tot += r.time || 0; });
  else Object.keys(progs || {}).forEach((k) => { const t = progs[k]!.time; if (!t) return; S.tot += t.total; S.mill += t.cut * 0.6; S.fin += t.cut * 0.4; });
  return S;
}
export function mbSize(J: MtIs | FrezeIs, kind: 'mt' | 'mill'): { L: number; D: number } | null {
  if (kind === 'mt') { let r = 0; (J as MtIs).P.prof.forEach((p) => { r = Math.max(r, p.r); }); return { L: (J as MtIs).Lp, D: 2 * r }; }
  const st = J.G && J.G.stock; return st ? { L: Math.max(st.Lx, st.Ly, st.Lz), D: 0 } : null;
}
export interface MalzemeEtkisi {
  m: IsMalzemesi; b: ReturnType<typeof matBeh>; ref: MalzemeOzu; S: SureDagilimi; cal: number;
  tNow: number; tRef: number; x: number; isRef: boolean; n: number; dl: number; cool: Kalem | null;
  sz: { L: number; D: number } | null; sib: { q: IsMalzemesi; t: number }[];
}
export function malzemeEtkisi(J: MtIs | FrezeIs, kind: 'mt' | 'mill', progs: Record<string, NcProgram>): MalzemeEtkisi {
  const m = (kind === 'mt' ? (J as MtIs).c.mat : (J as FrezeIs).mat) as IsMalzemesi, b = matBeh(m), ref = matRef(), S = mbSplit(J, kind, progs), cal = camCal();
  const tNow = S.tot * cal, tRef = mbTimeAs(S, m, ref) * cal, x = tNow / Math.max(1e-6, tRef), isRef = m.id === ref.id;
  const n = 0.25 * b.nk, dl = 1 - Math.pow(1.1, -1 / n), cool = byId(D.COOL, coolHint(m));
  const sib = m.fam ? allMaterials().filter((q) => q.fam === m.fam).map((q) => ({ q, t: mbTimeAs(S, m, q) * cal })) : [];
  return { m, b, ref, S, cal, tNow, tRef, x, isRef, n, dl, cool, sz: m.fam === '174ph' ? mbSize(J, kind) : null, sib };
}
