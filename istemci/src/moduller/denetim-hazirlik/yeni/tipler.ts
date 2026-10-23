// Denetim Hazırlığı kaydının tipleri. Kayıt bugünkü çerçeveyle aynı belgede durur (204 a: `yerel/kalite-denetim-v4`, `veri.deger`
// JSON metni); iki ekran aynı kaydı okuyup yazdığı için alan adları prototiptekiyle aynıdır ve yeniden adlandırılmaz.

export type ProgramKodu = 'iso9001' | 'as9100' | 'eydep';
export type Seviye = 'major' | 'minor' | 'obs';
// Soru puanı: 0-3 ya da uygulanmaz.
export type Cevap = '0' | '1' | '2' | '3' | 'na';

export interface Bulgu { lvl: Seviye; g: string; c: string; t: string }

export interface DenetimSonucu {
  major: number;
  minor: number;
  obs: number;
  // EYDEP puanı; girilmemişse boş metin (sıfır uydurulmaz).
  score: number | '';
  items: Bulgu[];
  areas: Partial<Record<string, number>>;
}

// Takvim kaydı: denetim ya da ona bağlı son gün (EYDEP belge teslimi, DÖF/NCR planı).
export interface Denetim {
  id: string;
  prog: ProgramKodu;
  kind: 'audit' | 'deadline';
  parent: string;
  sub: '' | 'docs' | 'ncr';
  type: string;
  date: string;
  end: string;
  cb: string;
  note: string;
  status: 'plan' | 'done' | 'cancel';
  res: DenetimSonucu;
}

export interface OzMaddesi { v: Cevap; n: string; pv: Cevap | '' }
export interface OzTuru { id: string; date: string; by: string; kind: string; items: Record<string, OzMaddesi> }
export interface AcikOzTuru {
  id: string;
  date: string;
  by: string;
  kind: string;
  qids: string[];
  items: Record<string, { v: Cevap | ''; n: string }>;
}
export type OzSikligi = 'biweekly' | 'monthly' | 'quarterly';
export interface OzDurumu {
  freq: OzSikligi;
  size: number;
  by: string;
  rounds: OzTuru[];
  cur: AcikOzTuru | null;
  last: Record<string, string>;
}

export interface HaftaGorevi { id: string; w: string; t: string; done: boolean }

// Program başına çalışma alanı (prototip `pw[program]`, `W()`).
export interface Calisma {
  curQ: number;
  curF: number;
  oz: OzDurumu;
  wkx: HaftaGorevi[];
  wkAnchor: { ad?: string; from?: string };
  prepView: 'week' | 'phase';
  ans: Record<string, Cevap>;
  notes: Record<string, string>;
  ev: Record<string, boolean[]>;
  checks: Record<string, boolean>;
  docs: Record<string, boolean>;
  cards: Record<string, string>;
  trace: Record<string, string>;
  done: Record<string, boolean>;
  exDone: Record<string, boolean>;
  def: boolean;
  cur: number;
  mode: string;
  quick: string[];
  dept: string;
  card: number;
  flipped: boolean;
  example: boolean;
  stage: number;
  clause: string;
  phase: number;
  chainSel: string;
  filter: string;
  docq: string;
}

export interface KysMaddesi { st: 0 | 1 | 2; date: string; code: string; rev: string; owner: string; note: string }
export type SurecTuru = 'y' | 'a' | 'd';
export interface Surec {
  id: string;
  name: string;
  type: SurecTuru;
  dir: 'le' | 'ge';
  vals: Record<string, number>;
  owner: string;
  inputs: string;
  outputs: string;
  kpi: string;
  unit: string;
  res: string;
  who: string;
  how: string;
  risk: string;
  target: number | '';
}
export interface UretilenDokuman {
  st: '' | 'taslak' | 'yayin';
  secs: Record<string, string>;
  hist: { rev: string; date: string; note: string }[];
  code: string;
  rev: string;
  prep: string;
  appr: string;
  pub: string;
  date: string;
}
export interface DokumanKaydi { id: string; code: string; name: string; type: string; rev: string; owner: string; loc: string; gen: string; date: string }
export type KysSekmesi = 'nedir' | 'yol' | 'blok' | 'surec' | 'dosya' | 'gorev' | 'rutin' | 'uret' | 'sema';
export interface Kys {
  sv: string;
  fl: string;
  tp: string;
  items: Record<string, KysMaddesi>;
  procs: Surec[];
  tab: KysSekmesi;
  filter: string;
  road: Record<string, true>;
  start: string;
  prefix: string;
  docs: DokumanKaydi[];
  roles: Record<string, { kisi: string; vekil: string }>;
  rt: Record<string, string[]>;
  rtStart: string;
  gd: Record<string, UretilenDokuman>;
  logo: string;
  stamp: '' | 'kontrollu' | 'kontrolsuz' | 'taslak';
}

export type KalibrasyonSonucu = 'uygun' | 'sartli' | 'red';
export interface Cihaz {
  id: string;
  no: string;
  ad: string;
  marka: string;
  seri: string;
  aralik: string;
  coz: string;
  yer: string;
  sorumlu: string;
  lab: string;
  cert: string;
  kabul: string;
  note: string;
  tur: 'dis' | 'ic' | 'dog';
  st: 'aktif' | 'yedek' | 'disi' | 'hurda';
  res: KalibrasyonSonucu | '';
  per: number;
  last: string;
  nx: string;
  hist: { date: string; res: KalibrasyonSonucu; lab: string; cert: string; note: string }[];
}
// `devs` kayıtta eski çerçevenin bıraktığı listedir; ekranda gösterilen liste Kalibrasyon modülünden gelir (329 a) ve kayda yazılmaz.
export interface Kal { devs: Cihaz[]; view: string; filter: string; q: string; month: string }

export type IcSonucu = '' | 'u' | 'g' | 'm' | 'M' | 'na';
export interface IcMaddesi { t: string; c: string; g: string; h: string; r: IcSonucu; n: string }
export interface IcYurutme { id: string; pid: string; pname: string; date: string; aud: string; done: boolean; audId: string; items: IcMaddesi[] }
export interface SahaMaddesi { r: '' | 'ok' | 'no' | 'na'; n: string; fix: boolean }
export interface SahaTuru { id: string; tpl: string; date: string; by: string; done: boolean; items: SahaMaddesi[] }
export interface IcPlanSatiri { pid: string; aud: string; months: string[] }
export interface Ic {
  plan: { year: number; rows: IcPlanSatiri[] };
  runs: IcYurutme[];
  saha: SahaTuru[];
  tab: string;
  // Açık yürütme ya da saha turu ("s:<id>"); kayıttaki iş durumudur.
  cur: string;
}

export interface FirmaBilgisi { firma: string; tesis: string; kapsam: string; kurulus: string; hazirlayan: string }

// Bir firma ya da saha profili (prototip `state`).
export interface Profil {
  ic: Ic;
  ux: 'rehber' | 'uzman';
  onbHide: boolean;
  kal: Kal;
  view: string;
  prog: ProgramKodu;
  updated: number;
  profile: FirmaBilgisi;
  audits: Denetim[];
  pw: Record<ProgramKodu, Calisma>;
  kys: Kys;
}

// Kaydın bütünü: profil listesi (prototip `store`).
export interface Depo {
  active: string;
  order: string[];
  data: Record<string, Profil>;
  lastBackup: number;
}

export type GorunumKodu =
  | 'home' | 'dash' | 'rehber' | 'sim' | 'kontrol' | 'hazirlik' | 'sorular' | 'rapor'
  | 'kys' | 'icd' | 'kalib' | 'takvim' | 'perf' | 'profil';

// Ekran durumu kişinin tarayıcısında kalır, ortak kayda yazılmaz (204 a). Açılışta kayıttaki son değerden başlar.
export interface ProgramEkrani {
  mode: string;
  cur: number;
  curQ: number;
  curF: number;
  dept: string;
  card: number;
  flipped: boolean;
  stage: number;
  clause: string;
  phase: number;
  chainSel: string;
  filter: string;
  docq: string;
  prepView: 'week' | 'phase';
}
export interface EkranDurumu {
  program: ProgramKodu;
  ux: 'rehber' | 'uzman';
  onbHide: boolean;
  pw: Record<ProgramKodu, ProgramEkrani>;
  kys: { tab: KysSekmesi; sv: string; fl: string; tp: string; filter: string };
  kal: { view: string; filter: string; q: string; month: string };
  ic: { tab: string };
}

// Durağan içerik (icerik/). Simge adları prototipin adlarıdır; ekran ortak simgeye çevirir.
export type Ton = 'vurgu' | 'bilgi' | 'uyari' | 'iyi';
export interface AsamaRengi { n: string; ton: Ton }
export interface Madde { n: string; s: string; ic: string; ph: number; looks: string[]; pit: string[] }
export interface Soru { id: string; g: string; c: string; w: 1 | 2 | 3; q: string; ev: string[]; fix: string; d: boolean }
// Mülakat kartı: [soru, iyi cevap].
export interface Departman { k: string; n: string; ic: string; items: [string, string][] }
// Hazırlık görevi: [kimlik, metin, madde?].
export interface HazirlikDonemi { t: string; s: string; items: ([string, string] | [string, string, string])[] }
export interface BelgelendirmeAsamasi { n: string; w: string; ic: string; d: string; f: string[]; t: string }
// [kimlik, madde, ad, tür]
export type ZorunluDokuman = [string, string, string, string];
export interface IzHalkasi { k: string; n: string; c: string; ic: string; s: string }
export interface PuanAciklamasi { v: Cevap; t: string; d: string }
export interface BulguSeviyesiTanimi { k: Seviye | 'good'; n: string; d: string; ex: string[]; cons: string }
