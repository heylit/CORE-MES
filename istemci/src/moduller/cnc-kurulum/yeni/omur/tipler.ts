// Takım Ömrü'nün durumdan okuduğu alanların biçimi. Şema prototipindir (`cnc-kurulum-motoru.v1`); burada yalnız bu görünümün
// dokunduğu alanlar yazılır, yeni alan yoktur.

import type { OmurAyari } from '../durum.ts';
import type {
  DepoKarti, IslemTuru, KesmeKosulu, OmurHatasi, OmurModeli as OmurHesabi, SureBilgisi,
} from '../hesap/omur.ts';
import type { KalemStokOzeti, Kullanim } from '../secici.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';

export type { DepoKarti, IsMalzemesi, KesmeKosulu, Kullanim, OmurAyari, OmurHesabi, SureBilgisi, Tezgah };
export type OmurModeli = OmurHesabi | OmurHatasi;
export type TakimTuru = IslemTuru;
// Analizin kesme koşulu: anahtar (takım|malzeme) her zaman kurulur (kalibrasyon bununla saklanır).
export type KesmeParametresi = KesmeKosulu & { key: string };
// Kalemin stok özeti (iskeletin stockOf'u).
export type StokDurumu = KalemStokOzeti;

// Takım, kütüphane kalemidir (iskeletin tipi).
export type Takim = Kalem;

export interface YenilemeGecmisi {
  t: number;
  a: string;
  txt: string;
  s?: YenilemeAni;
}

export interface YenilemeAni {
  used: number;
  parts: number;
  ed: number;
  rg: number;
  lf: number;
  dd: number;
  dl: number;
}

// `state.wear[tezgâh][cep]`: kullanım (dk), parça, takıldığı an; yenileme alanları (kenar, bileme, ömür katsayısı, çap ve boy kaybı).
export interface AsinmaKaydi {
  id: string;
  used: number;
  parts: number;
  since: number | null;
  demo?: 1;
  ed?: number;
  rg?: number;
  lf?: number;
  dd?: number;
  dl?: number;
  log?: YenilemeGecmisi[];
}

export type OmurDurumu = 'ok' | 'warn' | 'crit' | 'over' | 'na';

// Çekirdeğin `lifeCard`ı: tezgâhtaki bir cebin ömür kartı. Çekirdek tipi alanları isteğe bağlı yazar; lifeCard tpi, src, q, M, w,
// stock, spare ve st'yi her kartta kurar, burada zorunludur.
export interface OmurKarti {
  depot?: false;
  m: Tezgah;
  p: number;
  t: Takim;
  id: string;
  tpi: SureBilgisi;
  src: 'program' | 'katalog';
  q: KesmeKosulu;
  M: OmurModeli;
  w: AsinmaKaydi;
  stock: StokDurumu;
  spare: number | null;
  st: OmurDurumu;
  TR?: number;
  rem?: number;
  pct?: number;
  tp?: number;
  parts?: number;
  partsTot?: number;
  hrs?: number;
  days?: number;
}

// Çekirdeğin `depotCards`ı: depodaki bir kalem.
export type CarkKarti = OmurKarti | DepoKarti;
