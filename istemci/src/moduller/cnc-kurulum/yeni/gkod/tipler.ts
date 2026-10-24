// G-kod gorunumunun veri tipleri. Program ve hareket cekirdegin gParse ciktisidir (hesap/gkod.ts).

import type { GHareket, GProgram, GTakim } from '../hesap/gkod.ts';

export type TakimNo = GTakim;
export type Hareket = GHareket;
export type Program = GProgram;

export type HamKaynagi = 'blk' | 'ham' | 'auto' | 'man';

// Program sifirina gore ham kutu (mm).
export interface HamKutu {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; src: HamKaynagi;
  shift?: number[]; label?: string; bar?: boolean; file?: string | null;
}

export type TakimKaynagi = 'mag' | 'ov' | 'empty' | 'nopocket' | 'name';

// Kesici bilgisi: magazin cebinden ya da simulasyon icin elle secilen takimdan.
export interface TakimBilgisi {
  T: TakimNo; src: TakimKaynagi; name: string; d: number; ball: boolean; lathe: boolean; id: string | null; z: number;
  cone?: number; cutD?: number | null; dOv?: boolean;
  // Renk sirasi (TAKIM_RENKLERI dizini).
  col: number; t: Takim | null; magT: Takim | null;
}

// Takim kaydinin G-kod gorunumunun okudugu alanlari (cekirdek takim kaydi bunlari tasir).
export interface Takim { id: string; name: string; kind: string; d?: number; z?: number; cut?: { pitch?: number } }
