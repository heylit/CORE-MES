// CNC Kurulum Motoru veri biçimleri. Alan adları prototipin adlarıdır: durum kaydı (`cnc-kurulum-motoru.v1`) bu adlarla
// saklanır ve eski ekranla aynı kaydı paylaşır, ad değişirse eski kayıt okunamaz.

export type TezgahTuru = 'mill' | 'lathe' | 'millturn';
export type Kontrol = 'heid' | 'iso';
export type IsoGrubu = 'P' | 'M' | 'K' | 'N' | 'S' | 'H';

export interface KesmeVerisi { fz?: number; fr?: number; pitch?: number }

// Tezgâh bilgileri (Hazırlık → Tezgâh bilgileri); alanlar elle girilir, boş olabilir.
export type TezgahBilgisi = Record<string, string | number | null | undefined>;

export interface Tezgah {
  id: string;
  no?: string;
  name: string;
  code?: string;
  type: TezgahTuru;
  ctrl: Kontrol;
  taper: string;
  pockets: number;
  rpm: number;
  spindle?: number;
  live?: boolean;
  liveRpm?: number;
  manual?: boolean;
  kind: string;
  info?: TezgahBilgisi;
  custom?: boolean;
  // allMachines'in eklediği: numarasız ad (ad numarayla birleşince).
  baseName?: string;
  [alan: string]: unknown;
}

// Malzeme davranışı (zor malzemede kesme verisi dışındaki farklar); hesap/malzeme-davranisi.ts.
export interface MalzemeDavranisi { eng?: number; apT?: number; nk?: number; tune?: number }

export interface IsMalzemesi {
  id: string;
  name: string;
  code: string;
  iso: IsoGrubu;
  vcK: number;
  vcH: number;
  fk: number;
  color: number;
  isoCol: string;
  col: string;
  kind: string;
  desc: string;
  tags: string;
  rho?: number;
  rough?: number;
  metal?: number;
  fam?: string;
  cond?: string;
  hard?: string;
  age?: number;
  beh?: MalzemeDavranisi;
  custom?: boolean;
  [alan: string]: unknown;
}

// Kütüphanenin her kalemi (takım, tutucu, aparat, çene, sıfırlama, ölçüm, sarf, soğutma, kesici uç). Kalem türüne göre alanların
// bir kısmı vardır; elle eklenen kalem (`state.custom`) prototipin serbest alanlarını da taşır.
export interface Kalem {
  id: string;
  name: string;
  code?: string;
  kind: string;
  tags?: string;
  desc?: string;
  col?: string;
  d?: number;
  z?: number;
  tm?: string;
  vm?: number;
  cut?: KesmeVerisi;
  isTool?: boolean;
  s?: number;
  coat?: string;
  ins?: string;
  bar?: number;
  kap?: number;
  ln?: number;
  ld?: number;
  lc?: number;
  w?: number;
  ic?: number;
  d2?: number;
  lib?: 'mill' | 'lathe';
  cat?: string;
  live?: boolean;
  taper?: string;
  ht?: string;
  dia?: number;
  shelf?: string;
  v?: string;
  shape?: string;
  g?: string;
  mode?: string;
  color?: number;
  op?: number;
  only?: string;
  custom?: boolean;
  grp?: string;
  [alan: string]: unknown;
}
