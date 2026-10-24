import type { Aile, Belge, Form, KuralBaglami, Sozluk, Taslak, Tur, VaryantSecimi } from '../kurallar/index.ts';
import * as S from '../sabitler/index.ts';
import type { KartKaydi, TicariBilgi } from '../tipler.ts';

// Çekirdek tipleri `kurallar/index.ts`'den gelir; burada yalnız çekirdeğin dizin imzasıyla (unknown) taşıdığı ve sihirbazın okuduğu
// alanlar adlandırılır. Alan adları prototipin nesnelerindeki adlardır.

// Ticari bilginin sihirbazda doldurulan ek alanları (prototipte `D.com.grup`, `D.com.pb` ...).
export interface Ticari extends TicariBilgi {
  grup?: string;
  pb?: string;
  fe?: string;
  tkod?: string;
  ac1?: string;
  ac2?: string;
  ac3?: string;
  alisBirimi?: string;
  alisKatsayisi?: string;
}

// Ek özellik satırı (prototipte `D.extra`): ad, değer, birim metindir.
export type EkOzellik = { ad: string; v: string; u: string };
// Rota satırı (prototipte `D.ops`): no, operasyon kodu ve adın kopyası.
export type OpSatiri = { no: number; kod: string; ad: string };

// Taslağın yalnız ekranda yaşayan alanları (prototipte `D.vmode`, `D.vsel`, `D._dupOk` ...): kayıtta silinir ya da sunucu yok sayar.
export interface EkranAlanlari {
  vmode?: boolean;
  vsel?: VaryantSecimi;
  acManual?: boolean[];
  _dupOk?: boolean;
  _dupNeden?: string;
  talepGonderildi?: number;
  docs?: Belge[];
}
export interface SihirbazTaslagi extends Taslak, EkranAlanlari { com: Ticari; extra: EkOzellik[]; ops: OpSatiri[] }
// Taslağın sihirbaz bakışı: aynı nesne, tip yalnız okunan alanları adlandırır.
export const sihirbazTaslagi = (d: Taslak): SihirbazTaslagi => d as SihirbazTaslagi;

// Tablo girdileri; değer tipi çağıranın adlandırdığı alanlardır.
export const girdiler = <T>(o: Sozluk<T> | undefined | null): [string, T][] => Object.entries(o ?? {});

// Şablonun prototipteki alanları (hazır `SYS_TPL` ve kayıtlı şablon aynı biçimde).
export interface SablonAlanlari {
  id: string;
  ad?: string;
  tur?: KartKaydi['tur'];
  g?: KartKaydi['g'];
  bom?: KartKaydi['bom'];
  ops?: KartKaydi['ops'];
  com?: Partial<Ticari>;
  fam?: string;
  cls?: string;
  grade?: string;
  opts?: KartKaydi['opts'];
  ov?: KartKaydi['ov'];
  custom?: KartKaydi['custom'];
  form?: string;
  dims?: KartKaydi['dims'];
  stds?: string[];
  tol?: string;
}

// Tablolara bakış: ayarlı tablolar bağlamda (`b.t`), taban tablolar sabitlerde. Anahtar bulunmayabilir.
export const aileler = (b: KuralBaglami): Partial<Sozluk<Aile>> => b.t.FAMS;
export const formlar = (): Partial<Sozluk<Form>> => S.FORMS;
export const turler = (): Partial<Sozluk<Tur>> => S.TURLER;
