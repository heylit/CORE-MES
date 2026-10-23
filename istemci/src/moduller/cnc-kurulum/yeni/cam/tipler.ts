import type { IntPoint as Nokta, Path as Yol, Paths as Yollar } from '../hesap/kesit.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';
import type { MtPlani, MtSatiri } from './torna-freze.ts';

// Oto-CAM'in takim, malzeme ve tezgah kayitlari cekirdegin tipleridir. Freze takiminda cap vardir (prototip de oyle okur).
export type CamTakim = Kalem & { d: number };
export type CamMalzeme = IsMalzemesi;
export type CamTezgah = Tezgah;
export interface KesmeVerisi { F?: number; n?: number; f?: number; vc?: number; mode?: string }

export type V3 = [number, number, number];

export interface Yon {
  k: string;
  name: string;
  ax: V3;
  ay: V3;
  az: V3;
  plane?: string;
  iso?: string;
  flip?: boolean;
  axial?: boolean;
  back?: boolean;
  C?: number;
}

export interface CamParametre {
  ap: number;
  so: number;
  allow: number;
  allowF: number;
  scallop: number;
  clamp: number;
  maxSetups: number;
  tap: Record<string, boolean>;
  use32: boolean;
  tc: number;
  acc: number;
  safe: number;
  res: number;
  cal: Record<string, unknown>;
  noFace?: boolean;
}

export interface HamKutu { Lx: number; Ly: number; Lz: number }
export interface CamGeometri {
  V: Float64Array;
  T: ArrayLike<number>;
  stock: HamKutu;
  bar?: boolean;
  mt?: boolean;
  R?: number;
  zmax?: number;
}

export interface Voksel {
  nx: number;
  ny: number;
  nz: number;
  hx: number;
  hy: number;
  hz: number;
  h: number;
  part: Uint8Array;
  idx: (i: number, j: number, k: number) => number;
  air?: Uint8Array;
}

export interface YerelAg {
  V: Float64Array;
  T: ArrayLike<number>;
  tz0: Float64Array;
  tz1: Float64Array;
  Lx: number;
  Ly: number;
  Lz: number;
  o: V3;
  g0: V3;
  zmin: number;
  zmax: number;
}

export interface Ulasilamaz { vol: number; cnt: number; box: number[]; clamp: boolean }

export interface Baglama {
  d: number;
  dir: Yon;
  mode: string;
  vox: number;
  vol: number;
  op?: number;
  opn?: number;
  cx?: number;
  M?: YerelAg;
  L?: { x: number; y: number; z: number };
  zLo?: number;
  zHi?: number;
  pname?: string;
  dstock?: { txt: string; box: string };
}

export interface Atama {
  setups: Baglama[];
  assigned: Int8Array;
  tot: number;
  totVol: number;
  unreach: Ulasilamaz[];
  X: Voksel;
}

export interface Hareket { t: 0 | 1; x?: number; y?: number; z?: number; f?: number }
export interface CevrimDelik { x: number; y: number; top: number; depth: number }
export interface Cevrim { type: 'spot' | 'drill' | 'tap'; holes: CevrimDelik[]; peck?: number; pitch?: number }

export interface CamIslem {
  name: string;
  kind: string;
  tool: CamTakim;
  mv: Hareket[];
  cyc: Cevrim | null;
  depth: number;
  len: number;
  _last?: number[] | null;
  _link?: number;
  slots?: number;
  reach?: number;
  setup?: Baglama;
  sIdx?: number;
}

export interface Delik {
  x: number;
  y: number;
  r: number;
  top: number;
  bot: number;
  n: number;
  d?: number;
  through?: boolean;
  depth?: number;
  how?: 'drill' | 'helix' | 'none';
  tool?: CamTakim;
  tapM?: number;
  pitch?: number;
  tapKey?: string;
}

export interface Taban { z: number; reg: Yollar; pseudo?: boolean }

export interface BaglamaSonucu {
  ops: CamIslem[];
  warn: string[];
  M: YerelAg;
  holes?: Delik[];
  floors?: Taban[];
  zLo?: number;
  zHi?: number;
  free?: number;
}

export interface TakimSecimi {
  lib: CamTakim[];
  face: CamTakim[];
  end: CamTakim[];
  ball: CamTakim[];
  spot: CamTakim[];
  drill: CamTakim[];
  tap: CamTakim[];
}

export interface NcProgram { name: string; text: string; time?: CamSure | null; kind?: string; op?: number; sIdx?: number; back?: boolean }

export interface CamSure {
  // gParse sonucu: cekirdegin tipi; burada yalniz okunan alanlar.
  p: GkodSonucu;
  cut: number;
  rapid: number;
  dyn: number;
  tc: number;
  total: number;
}

export interface GkodHareketi { t: number; F: number; a: number[]; b: number[]; dur: number; pts?: number[] | null }
export interface GkodSonucu {
  moves: GkodHareketi[];
  tools: unknown[];
  total: number;
  stat: { feedT: number; perTool: Record<string, { t: number }> };
}

export interface CamIs {
  prm: CamParametre;
  mat: CamMalzeme;
  mach: CamTezgah;
  G: CamGeometri;
  setups: Baglama[];
  res: BaglamaSonucu[];
  warn: string[];
  part?: string;
  five?: boolean;
  X?: Voksel;
  AS?: Atama;
  T?: TakimSecimi;
  tmap?: Record<string, number>;
}

export type IsaretliYol = Yol & { slot?: boolean };
export type DonguYollari = IsaretliYol[] & { firstN?: number };
export type { Nokta, Yol, Yollar };

// Torna + freze plani secimi (prototipin camMTCfg'si); tezgah ve takim kayitlari cekirdegin tipleridir.
export interface MtAyari {
  lathM: Tezgah;
  lathMc: Tezgah;
  millSel: Tezgah;
  millMc: Tezgah;
  sep: boolean;
  canSame: boolean;
  lathLib: Kalem[];
  millLib: Kalem[];
}
// Ayar suresi, sigma ve FAI'nin okudugu is: torna + freze plani ya da yalniz freze isi (prototipte ikisi de `J`).
export type MtIs = MtPlani & { cfg: MtAyari; rows: MtSatiri[]; key?: string; _fai?: FaiSonucu; _mass?: number; _barFed?: boolean };
export type FrezeIs = CamIs & { mach: Tezgah & CamTezgah; key?: string; _fai?: FaiSonucu; _mass?: number };
export interface FaiKarakteristigi { k: string; name: string; nom: string; grp: string; no: number; inst: string; tm: number; cmm: boolean }
export interface FaiSonucu {
  chars: FaiKarakteristigi[];
  meas: number;
  rec: number;
  fixed: [string, number][];
  fixT: number;
  labor: number;
  cmmN: number;
  wait: number;
}
