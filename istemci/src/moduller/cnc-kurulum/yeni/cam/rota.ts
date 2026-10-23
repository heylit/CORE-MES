import { fmtN } from '../bicim.ts';
import { prMachineChanged } from '../hesap/hazirlik.ts';
import { state } from '../depo.ts';
import type { Tezgah } from '../veri/tipler.ts';
import { camCal } from './ayar-suresi.ts';
import { camKaydi } from './durum.ts';
import { camCaps } from '../hesap/sinirlar.ts';
import { camFitMill, camFitMT, type SigmaListesi } from './sigma.ts';
import type { FrezeIs, MtIs, NcProgram } from './tipler.ts';
import type { TornaSonucu } from './torna.ts';

/* Rota ve tezgah secimi: yontemi parcanin geometrisi belirler (S.geo), ham turu degil.
   a: torna + ayri freze tezgahi · b: tek baglamada torna-freze · c: bloktan freze.
   On sigma: tezgah sinirlari (camCaps) parca ve hamla karsilastirilir; programa bagli denetimler uretimden sonra (sigma.ts). */
export type Rota = 'a' | 'b' | 'c';
export const RT_NAME: Record<Rota, string> = { a: 'Torna + ayrı freze', b: 'Torna-freze · tek bağlama', c: 'Bloktan freze' };

// Ham Malzeme'nin (P3) Oto-CAM'e verdigi sonuc; alan adlari prototipin S.geo / S.alt / S.axKey'idir.
export interface HamGeometrisi { method: 'turn' | 'mill' | 'mt' | string; ai: number | string }
export interface CubukHami { D: number; L: number; label: string; partLen: number; partD: number }
export interface BlokHami { label: string; S: [number, number, number]; Vs: number }
export interface HamSonucu { geo: HamGeometrisi | null; alt: { bar: CubukHami | null; block: BlokHami | null } | null; axKey: string; P?: unknown }
export function rtGeo(H: HamSonucu | null): HamGeometrisi | null { return H && H.P && H.geo && H.alt && H.alt.bar && H.alt.block ? H.geo : null; }

export interface TezgahUygunlugu { m: Tezgah; bad: string[]; warn: string[]; u: number; info?: string }
export function rtLim(o: TezgahUygunlugu, v: number, l: number | undefined, txt: string, hard: boolean): void { if (!(l! > 0)) return; o.u = Math.max(o.u, v / l!); if (v > l!) (hard ? o.bad : o.warn).push(txt); }
export function rtLatheChk(m: Tezgah, rb: CubukHami): TezgahUygunlugu {
  const C = camCaps(m), o: TezgahUygunlugu = { m, bad: [], warn: [], u: 0 }, D = rb.D, L = rb.L;
  rtLim(o, D, C.maxD, 'ham Ø' + fmtN(D, 0) + ' > tornalama çapı Ø' + fmtN(C.maxD, 0), true);
  rtLim(o, L, C.maxL, 'boy ' + fmtN(L, 0) + ' > tornalama boyu ' + fmtN(C.maxL, 0), true);
  if (C.chuck) rtLim(o, D, C.chuck * 25.4 * 0.8, 'ham Ø' + fmtN(D, 0) + ' ' + C.chuck + '" aynanın tutma aralığı dışında', true);
  if (C.bar && D > C.bar) o.warn.push('çubuk Ø' + fmtN(D, 0) + ' iş mili deliğinden (Ø' + fmtN(C.bar, 0) + ') geçmez: kesilmiş hamla tek tek bağlanır');
  if (m.manual) o.warn.push('elle kumandalı: NC programı çalışmaz');
  if (!(C.maxD! > 0) && !(C.maxL! > 0)) o.warn.push('tezgâh sınırları girilmemiş (Hazırlık → Tezgâh bilgileri)');
  o.info = 'Ø' + fmtN(D, 0) + ' / ' + (C.maxD ? fmtN(C.maxD, 0) : '?') + ' · çubuk deliği ' + (C.bar ? 'Ø' + fmtN(C.bar, 0) : '?') + ' · boy ' + fmtN(L, 0) + ' / ' + (C.maxL ? fmtN(C.maxL, 0) : '?');
  return o;
}
export function rtMillChk(m: Tezgah, sz: number[], mass: number): TezgahUygunlugu {
  const C = camCaps(m), o: TezgahUygunlugu = { m, bad: [], warn: [], u: 0 }, lx = Math.max(sz[0]!, sz[1]!), ly = Math.min(sz[0]!, sz[1]!), lz = sz[2]!;
  rtLim(o, mass, C.load, fmtN(mass, 1) + ' kg > tabla yükü ' + fmtN(C.load, 0) + ' kg', true);
  rtLim(o, lx + 20, C.xT, 'boy ' + fmtN(lx, 0) + ' + takım > X kursu ' + fmtN(C.xT, 0), true);
  rtLim(o, ly + 20, C.yT, 'en ' + fmtN(ly, 0) + ' + takım > Y kursu ' + fmtN(C.yT, 0), true);
  rtLim(o, lz + 150, C.zDay, 'yükseklik ' + fmtN(lz, 0) + ' + takım boyu > iş mili–tabla ' + fmtN(C.zDay, 0), true);
  if (C.tblW) rtLim(o, lx, C.tblW[0], 'boy ' + fmtN(lx, 0) + ' > tabla ' + fmtN(C.tblW[0], 0), true);
  if (C.viseW && ly > C.viseW) o.warn.push('en ' + fmtN(ly, 0) + ' > mengene ' + fmtN(C.viseW, 0) + ': pabuç / aparatla bağlanır');
  if (!(C.xT! > 0)) o.warn.push('tezgâh sınırları girilmemiş (Hazırlık → Tezgâh bilgileri)');
  o.info = fmtN(lx, 0) + ' × ' + fmtN(ly, 0) + ' × ' + fmtN(lz, 0) + ' mm · ' + fmtN(mass, 1) + ' / ' + (C.load ? fmtN(C.load, 0) : '?') + ' kg';
  return o;
}
// sira: siganlar once, uyarisi az olan, sinirinin %85'ini asmayan, sonra sigan en kucuk tezgah
export function rtSort(L: TezgahUygunlugu[]): TezgahUygunlugu[] { return L.sort((a, b) => (a.bad.length ? 1 : 0) - (b.bad.length ? 1 : 0) || a.warn.length - b.warn.length || (a.u > 0.85 ? 1 : 0) - (b.u > 0.85 ? 1 : 0) || b.u - a.u); }

export interface RotaListeleri { key: string; a: { lathe: TezgahUygunlugu[]; mill: TezgahUygunlugu[] }; b: { mt: TezgahUygunlugu[] }; c: { mill: TezgahUygunlugu[] } }
let rtOnbellek: RotaListeleri | null = null;
export function rtLists(H: HamSonucu | null, rho: number, Ms: Tezgah[]): RotaListeleri | null {
  const g = rtGeo(H); if (!g) return null; const rb = H!.alt!.bar!, bl = H!.alt!.block!;
  const key = H!.axKey + '|' + rb.label + '|' + bl.label + '|' + rho + '|' + g.method + '|' + Ms.map((m) => m.id + JSON.stringify(m.info || {})).join(',');
  if (rtOnbellek && rtOnbellek.key === key) return rtOnbellek;
  const lat = Ms.filter((m) => m.type !== 'mill'), mil = Ms.filter((m) => m.type === 'mill');
  const cyl = [rb.partLen, rb.partD, rb.partD], cylM = Math.PI * rb.partD * rb.partD / 4 * rb.partLen / 1e6 * rho;
  const L: RotaListeleri = { key, a: { lathe: rtSort(lat.map((m) => rtLatheChk(m, rb))), mill: rtSort(mil.map((m) => rtMillChk(m, cyl, cylM))) },
    b: { mt: rtSort(lat.map((m) => { const o = rtLatheChk(m, rb); if (g.method !== 'turn' && m.type !== 'millturn' && !m.live) o.bad.push('canlı takım / C ekseni yok'); return o; })) },
    c: { mill: rtSort(mil.map((m) => rtMillChk(m, bl.S, bl.Vs / 1e6 * rho))) } };
  rtOnbellek = L; return L;
}
export function rtFirst(L: TezgahUygunlugu[] | null | undefined): TezgahUygunlugu | null { return L && L.length && !L[0]!.bad.length ? L[0]! : null; }
export function rtOk(r: Rota, Ls: RotaListeleri, g: HamGeometrisi): boolean { if (r === 'a') return !!rtFirst(Ls.a.lathe) && (g.method === 'turn' || !!rtFirst(Ls.a.mill)); if (r === 'b') return !!rtFirst(Ls.b.mt); return !!rtFirst(Ls.c.mill); }
export function rtRecommend(Ls: RotaListeleri, g: HamGeometrisi): Rota { const o: Rota[] = g.method === 'mill' ? ['c', 'b', 'a'] : g.method === 'turn' ? ['a', 'b', 'c'] : ['b', 'a', 'c']; for (let i = 0; i < 3; i++) if (rtOk(o[i]!, Ls, g)) return o[i]!; return o[0]!; }

// Secili rota: parca ya da eksen degisince onerilene doner, elle secimler (`state.cam.rt`) silinir.
export function camRoute(H: HamSonucu | null, rho: number, Ms: Tezgah[]): Rota | '' {
  const g = rtGeo(H); if (!g) return ''; const c = camKaydi(), k = H!.axKey + '|' + g.ai;
  if (c.routeKey !== k || !RT_NAME[c.route as Rota]) { c.routeKey = k; c.route = rtRecommend(rtLists(H, rho, Ms)!, g); c.rt = {}; }
  return c.route as Rota;
}
export type RotaRolu = 'lathe' | 'mill' | 'mt';
export function rtPick(Ls: RotaListeleri, r: Rota, role: RotaRolu): TezgahUygunlugu {
  const L = (Ls[r] as Record<string, TezgahUygunlugu[]>)[role]!, id = ((camKaydi().rt || {})[r] || {})[role], x = id && L.filter((q) => q.m.id === id)[0];
  return x || L[0]!;
}
export function camApplyRoute(r: Rota | '', H: HamSonucu | null, rho: number, Ms: Tezgah[]): void {
  const g = rtGeo(H); if (!r || !g) return; const prev = state.machine, c = camKaydi(), Ls = rtLists(H, rho, Ms)!;
  if (r === 'a') { state.machine = rtPick(Ls, 'a', 'lathe').m.id; c.mtMill = g.method === 'turn' ? 'same' : rtPick(Ls, 'a', 'mill').m.id; }
  else if (r === 'b') { state.machine = rtPick(Ls, 'b', 'mt').m.id; c.mtMill = 'same'; }
  else state.machine = rtPick(Ls, 'c', 'mill').m.id;
  if (state.machine !== prev) prMachineChanged();
}
export function rtKey(H: HamSonucu | null, matId: string): string { const c = camKaydi(); return (H ? H.axKey : '') + '|' + (H && H.alt ? H.alt.bar!.label + '|' + H.alt.block!.label : '') + '|' + matId + '|' + JSON.stringify(c.prm) + '|' + JSON.stringify(c.rt || {}); }

export interface RotaOzeti { setups: number; time: number; un: number; bad: number }
export interface RotaSonucu { job?: FrezeIs | null; lathe?: TornaSonucu | null; mt?: MtIs | null; progs: Record<string, NcProgram> }
export function rtSum(o: RotaSonucu): RotaOzeti | null {
  const cal = camCal(), bad = (L: SigmaListesi): number => L.filter((x) => 'st' in x && x.st === 'bad').length;
  if (o.mt) { const J = o.mt; return { setups: J.ops!.length, time: J.total! * cal, un: J.AS.unreach.reduce((a, u) => a + u.vol, 0), bad: bad(camFitMT(J)) }; }
  if (o.job) { const J = o.job; let t = 0; Object.keys(o.progs).forEach((k) => { const tm = o.progs[k]!.time; if (tm) t += tm.total; }); return { setups: J.setups.length, time: t * cal, un: J.AS!.unreach.filter((u) => !u.clamp).reduce((a, u) => a + u.vol, 0), bad: bad(camFitMill(J)) }; }
  if (o.lathe) return { setups: 2, time: (o.lathe.time ? o.lathe.time.total : 0) * cal, un: 0, bad: 0 };
  return null;
}
