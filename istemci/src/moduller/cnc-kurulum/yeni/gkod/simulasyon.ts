// G-Kod Sim. denetimi: prototipin GS nesnesi ve gLoad/gRefresh/gSeek/gAdvanceRemoval akisi. Gorunum degisince program,
// zaman ve talas haritasi korunur (prototipte GS kapanista yasar); ekran yalniz okur ve eylem cagirir.
import { clamp, fmtN, num } from '../bicim.ts';
import { save, state } from '../depo.ts';
import { gsimHazirla, gsimTakimlari, gYukle, tStation, type GTakimEslesmesi } from '../hesap/gkod.ts';
import { S } from '../parca-durumu.ts';
import { byId, dirtyUsage, machine, toolById, toolLib, tools } from '../secici.ts';
import { isLatheTool } from '../veri/takim-turu.ts';
import { gExplainAll, type Aciklama } from './aciklama.ts';
import { autoBox, gExport, gStockBox, gStockOpts, hamInfo, type ElleKutu, type HamOrijini, type HamSecenekleri } from './kaynak.ts';
import { gLocate, hareketBaslangici, satirHareketi } from './oynatma.ts';
import { gToolInfo, magazineUygula, secimDegistir, type TakimOrtami, type TakimSecimleri } from './takim.ts';
import { haritaKur, haritaSifirla, karsilastir, rasterPart, stampMove, type DonelHam, type YukseklikHaritasi } from './talas.ts';
import type { HamKaynagi, HamKutu, Program, Takim, TakimBilgisi, TakimNo } from './tipler.ts';

export interface SimDurumu {
  prog: Program | null;
  t: number;
  playing: boolean;
  idx: number;
  frac: number;
  sig: string;
  tools: Record<string, TakimBilgisi>;
  opts: HamSecenekleri | null;
  used: HamKaynagi;
  sb: HamKutu | null;
  hm: YukseklikHaritasi | null;
  ex: Aciklama[];
  tcl: number[];
  msg: string;
  parseT: string;
}

export const GS: SimDurumu = {
  prog: null, t: 0, playing: false, idx: 0, frac: 0, sig: '', tools: {}, opts: null, used: 'blk', sb: null, hm: null, ex: [], tcl: [], msg: '', parseT: '',
};

// Program adi basina takim secimleri (state.gtools[ad]); __v2 surum isareti de ayni nesnede durur.
export function gOvMap(): TakimSecimleri {
  const n = GS.prog?.name ?? '', g = gsimTakimlari();
  const m = g[n];
  if (m && typeof m === 'object') return m as TakimSecimleri;
  const yeni: GTakimEslesmesi = {};
  g[n] = yeni;
  return yeni as TakimSecimleri;
}

function ortam(heid: boolean, programTakimlari: TakimNo[]): TakimOrtami {
  const m = machine();
  return {
    tezgah: m, magazin: tools(), heid, programTakimlari, secimler: gOvMap(),
    takimBul: (id) => toolById(id) as Takim, kutuphaneden: (id) => byId(toolLib(m), id) as Takim | null, tornaTakimi: (t) => isLatheTool(t),
  };
}

export function bilgi(T: TakimNo): TakimBilgisi {
  const k = String(T), o = GS.tools[k];
  if (o) return o;
  const p = GS.prog, b = gToolInfo(T, ortam(p?.heid ?? false, p?.tools ?? []));
  GS.tools[k] = b;
  return b;
}
export const takimNo = (T: string): TakimNo => (isNaN(+T) ? T : +T);
export const istasyon = (T: TakimNo): TakimNo => tStation(T, machine(), GS.prog?.heid);

// Prototipin toolTxt'i (aciklamada takim adi); isaret T4 geregi metinden kalkti.
function takimMetni(T: string): string {
  if (!GS.prog) return 'T' + T;
  const ti = bilgi(takimNo(T));
  return 'T' + T + ' · ' + ti.name + (ti.src === 'mag' ? '' : ' (magazinde yok)');
}

function hamKutusu(): HamKutu | null {
  return hamInfo(S.res, gsimHazirla().hamOrigin as HamOrijini, S.P ? S.name : null);
}

// Durum imzasi: tezgah, magazin, secimler ya da ham degisince gorunum acilisinda yeniden hesaplanir.
export function gSig(): string {
  const gs = gsimHazirla(), h = hamKutusu();
  return state.machine + '|' + tools().join(',') + '|' + JSON.stringify(gOvMap()) + '|' + JSON.stringify(state['gstockMan'] || {}) + '|' + gs.stockSrc
    + gs.hamOrigin + '|' + (h ? [h.label, h.x0, h.y0, h.z1, S.name].join(',') : '');
}

function hamKur(p: Program): void {
  const gs = gsimHazirla();
  GS.opts = gStockOpts(p, hamKutusu(), autoBox(p, bilgi), state['gstockMan'] as ElleKutu | null | undefined);
  const { kullanilan, kutu } = gStockBox(GS.opts, gs.stockSrc as HamKaynagi);
  GS.used = kullanilan; GS.sb = kutu; GS.hm = null;
  if (!kutu || gs.lathe) return;
  if (!(kutu.x1 - kutu.x0 > 0 && kutu.y1 - kutu.y0 > 0 && kutu.z1 - kutu.z0 > 0)) return;
  const hm = haritaKur(kutu, p.dstock && kullanilan === 'blk' ? p.dstock as DonelHam : null);
  if (kullanilan === 'ham' && S.P && S.I && kutu.shift) {
    try { rasterPart(hm, S.P, S.I, S.q, kutu.shift); } catch { hm.PT = null; }
  }
  GS.hm = hm;
}

// Prototipin gRefresh'i: takim bilgisi, ham, ozet (state.gsim) ve aciklamalar yeniden kurulur, kayit yazilir.
export function gRefresh(): void {
  const p = GS.prog;
  if (!p) return;
  GS.tools = {};
  hamKur(p);
  state.gsim = gExport(p, state.machine, bilgi, istasyon);
  GS.sig = gSig();
  save();
  const a = gExplainAll(p.lines, p.heid, p.lathe, takimMetni);
  GS.ex = a.ex; GS.tcl = a.tcl;
  konumla();
}

// Zamani koruyarak yeniden hesap (takim ya da ham degisince prototipte t0 saklanir).
export function yenidenHesapla(): void { const t0 = GS.t; gRefresh(); GS.t = t0; konumla(); }

export function gLoad(text: string, name: string): void {
  const t0 = performance.now();
  const r = gYukle(text, name);
  if ('hata' in r) { GS.msg = r.hata; return; }
  const p = r.prog as Program;
  GS.prog = p; GS.t = 0; GS.playing = false;
  gRefresh();
  GS.msg = p.moves.length ? '' : '⚠ Programda hareket bulunamadı';
  GS.parseT = fmtN(p.lines.length) + ' satır · ' + fmtN(performance.now() - t0, 0) + ' ms';
}

export function gReparse(): void { if (GS.prog) gLoad(GS.prog.lines.join('\n'), GS.prog.name ?? ''); }

export function konumla(): void {
  const p = GS.prog;
  if (!p || !p.moves.length) return;
  const L = gLocate(p, GS.t);
  GS.idx = L.i; GS.frac = L.f;
}

export function gSeek(t: number): void { if (!GS.prog) return; GS.t = clamp(t, 0, GS.prog.total); konumla(); }
export function gSeekMove(i: number): void { if (GS.prog) gSeek(hareketBaslangici(GS.prog, i)); }
export function gSeekLine(ln: number): void { if (!GS.prog) return; const k = satirHareketi(GS.prog, ln); if (k >= 0) gSeekMove(k); }
export function gPlay(on: boolean): void {
  if (!GS.prog) return;
  if (on && GS.t >= GS.prog.total) gSeek(0);
  GS.playing = on;
}

// Oynatma adimi (prototipte her karede): zaman ilerler, sonda durur. Degisiklik olduysa true.
export function ilerle(dtSn: number, hiz: number): boolean {
  const p = GS.prog;
  if (!p || !p.moves.length || !GS.playing) return false;
  GS.t += dtSn * hiz;
  if (GS.t >= p.total) { GS.t = p.total; GS.playing = false; }
  konumla();
  return true;
}

// Prototipin gAdvanceRemoval'i: gecilen hareketler haritaya damgalanir (sure butcesiyle); geri sarinca harita sifirlanir.
// Karsilastirma (dalma, kalan malzeme) harita degisince hesaplanir. Degisiklik olduysa true.
export function talasIlerle(butceMs: number): boolean {
  const hm = GS.hm, p = GS.prog, gs = gsimHazirla();
  if (!hm || !gs.removal || !p) return false;
  const t0 = performance.now();
  if (hm.done > GS.idx + 1) haritaSifirla(hm);
  const once = hm.done;
  while (hm.done < GS.idx && performance.now() - t0 < butceMs) { const mv = p.moves[hm.done]!; stampMove(hm, mv, bilgi(mv.T)); hm.done++; }
  const mv = p.moves[GS.idx];
  if (hm.done === GS.idx && mv && GS.frac > 0) stampMove(hm, mv, bilgi(mv.T), GS.frac);
  const degisti = hm.dirty || hm.done !== once;
  if (hm.dirty) { hm.cmp = hm.PT ? karsilastir(hm) : null; hm.dirty = false; }
  return degisti;
}

export function talasSifirla(): void { if (GS.hm) haritaSifirla(GS.hm); }

// Takim tablosu: kutuphaneden secim ve elle cap (prototipin #gTools change'i).
export function takimSec(T: TakimNo, id: string): void { secimDegistir(gOvMap(), T, 'id', id, null); yenidenHesapla(); }
export function capGir(T: TakimNo, d: string): void {
  const o = gOvMap()[String(T)], base = o?.id ? byId(toolLib(machine()), o.id) : bilgi(T).magT;
  secimDegistir(gOvMap(), T, 'd', d, base?.d ?? null);
  yenidenHesapla();
}
export function magazineYaz(): number {
  const n = magazineUygula(gOvMap(), tools(), (T) => istasyon(T));
  dirtyUsage();
  save();
  gRefresh();
  GS.msg = '✓ ' + n + ' takım kurulum magazinine yazıldı.';
  return n;
}

// Ham parca kaynagi, program sifiri ve elle kutu (prototipin #gStockUI change'i).
export function hamSec(k: HamKaynagi): void { gsimHazirla().stockSrc = k; gRefresh(); }
export function orijinSec(o: HamOrijini): void { gsimHazirla().hamOrigin = o; gRefresh(); }
export function elleDegistir(k: 'x0' | 'y0' | 'z0' | 'x1' | 'y1' | 'z1', v: number): void {
  const m: Partial<HamKutu> = { ...GS.opts?.man, [k]: num(v, 0) };
  delete m.src;
  state['gstockMan'] = m;
  gRefresh();
}
