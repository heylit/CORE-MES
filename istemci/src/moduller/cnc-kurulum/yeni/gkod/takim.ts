// Programdaki takim cagrisinin magazinle eslesmesi; simulasyon icin elle secim ve cap (gtools).
import { tStation } from '../hesap/gkod.ts';
import type { TezgahTuru } from '../veri/tipler.ts';
import type { Takim, TakimBilgisi, TakimNo } from './tipler.ts';

// Takim renkleri: prototipin TOOL_COLS sirasindaki 10 renk tasarim degiskenine oturur (T1). Takim bilgisi renk sirasini tasir;
// sahne degiskenin rengini, arayuz tc-ch-renk-<sira> sinifini kullanir.
export const TAKIM_RENKLERI = ['--done', '--run', '--grafik-2', '--hazard', '--stop', '--sahne3b-rota', '--hold', '--grafik', '--sahne3b-andon-yesil', '--sahne3b-turuncu'] as const;
export const renkSinifi = (sira: number): string => 'tc-ch-renk-' + sira;

export interface TakimSecimi { id?: string; d?: number }
export type TakimSecimleri = Record<string, TakimSecimi>;

export interface TezgahBilgisi { type: TezgahTuru }

export interface TakimOrtami {
  tezgah: TezgahBilgisi; magazin: string[]; heid: boolean; programTakimlari: TakimNo[]; secimler: TakimSecimleri;
  takimBul: (id: string) => Takim | null; kutuphaneden: (id: string) => Takim | null; tornaTakimi: (t: Takim) => boolean;
}

export function gToolInfo(T: TakimNo, o: TakimOrtami): TakimBilgisi {
  const arr = o.magazin, num0 = typeof T === 'number', st = num0 ? tStation(T, o.tezgah, o.heid) : T;
  const pocket = num0 ? (st as number) - 1 : -1;
  const magId = pocket >= 0 && pocket < arr.length ? arr[pocket]! : null, magT = magId && magId !== 'empty' ? o.takimBul(magId) : null, ov = o.secimler[String(T)] || {};
  let t = magT, src: TakimBilgisi['src'] = magT ? 'mag' : !num0 ? 'name' : pocket >= arr.length || pocket < 0 ? 'nopocket' : 'empty';
  if (ov.id) { const lt = o.kutuphaneden(ov.id); if (lt && lt.kind !== 'empty') { t = lt; src = magT && magT.id === lt.id ? 'mag' : 'ov'; } }
  const lathe = !!(t && o.tornaTakimi(t));
  const b: TakimBilgisi = { T, t, src, magT, name: t ? t.name : 'T' + T, d: t && t.d ? t.d : (lathe ? 4 : 10), ball: !!(t && t.kind === 'ball'), lathe, id: t ? t.id : null, z: t ? (t.z || 0) : 0, col: 0 };
  if (t && (t.kind === 'spot' || t.kind === 'chamfer' || t.kind === 'csink')) b.cone = 1;
  else if (t && (t.kind === 'drill' || t.kind === 'stepdrill')) b.cone = 0.6009;
  else if (t && (t.kind === 'center' || t.kind === 'engrave')) b.cone = 1.732;
  if (t && (t.kind === 'taperball' || t.kind === 'lollipop')) b.ball = true;
  if (t && t.kind === 'tap') b.cutD = (t.d || 0) - 1.0825 * ((t.cut && t.cut.pitch) || 1.5);
  if (ov.d) { b.d = ov.d; b.dOv = true; b.cutD = null; }
  b.col = Math.max(0, o.programTakimlari.indexOf(T)) % TAKIM_RENKLERI.length;
  return b;
}

// Takim tablosunda secim degisince: bos secim kaldirilir, magazindekiyle ayni cap yazilmaz.
export function secimDegistir(secimler: TakimSecimleri, T: TakimNo, alan: 'id' | 'd', deger: string, temelCap: number | null): void {
  const key = String(T), o = secimler[key] || (secimler[key] = {});
  if (alan === 'id') { if (deger) o.id = deger; else delete o.id; delete o.d; }
  else { const d = parseFloat(deger.replace(',', '.')); if (d > 0 && !(temelCap != null && temelCap === d)) o.d = d; else delete o.d; }
  if (!Object.keys(o).length) delete secimler[key];
}

// "Bu secimi kurulum magazinine uygula": secilen takim cebe yazilir, secimden dusulur; yazilan adet doner.
export function magazineUygula(secimler: TakimSecimleri, magazin: string[], istasyon: (T: number) => TakimNo): number {
  let n = 0;
  Object.keys(secimler).forEach((T) => {
    const o = secimler[T]!, p = (istasyon(+T) as number) - 1;
    if (o.id && p >= 0 && p < magazin.length) { magazin[p] = o.id; delete o.id; n++; if (!Object.keys(o).length) delete secimler[T]; }
  });
  return n;
}
