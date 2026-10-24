// Malzeme ayarlarının iskeletten (M0) aldığı her şey bu dosyadan geçer; bölümler iskeleti doğrudan ithal etmez.
import {
  alanZorunlu as hamAlanZorunlu, birlesmeListesi as hamBirlesmeListesi, cakismaAlanAdi as hamCakismaAlanAdi,
  firmaKodluTurler as hamFirmaKodluTurler, kuralBaglami, mukerrerGruplari as hamMukerrerGruplari, turAlanlari as hamTurAlanlari,
  type Aile, type AileSecenegi, type Alan, type BaglamGirdisi, type Form, type Kalite, type Kategori, type KuralBaglami, type Ozellik, type Sinif, type Tur,
} from '../kurallar/index.ts';
import { ALAN, BIRIM_T, BIRIMLER, DB_KAT, DOCTIPS, FAMS, PROPS, SARF_KAT, SERTIFIKA, TOLP } from '../sabitler/index.ts';
import type { GenelAyar, KatalogKarti, MalzemeAyari } from '../tipler.ts';

export type Deger = string | number;
export type { Aile, AileSecenegi, Alan, Form, Kalite, Kategori, Ozellik, Sinif, Tur };

// Ayarsız (yerleşik) tablolar: liste düzenleyicinin "varsayılan" değerleri buradan gelir.
export interface HamTablolar {
  FAMS: Readonly<Record<string, Aile>>;
  PROPS: readonly Ozellik[];
  SERTIFIKA: readonly string[];
  BIRIMLER: readonly string[];
  BIRIM_T: Readonly<Record<string, readonly string[]>>;
  TOLP: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  DOCTIPS: readonly string[];
  ALAN: Readonly<Record<string, readonly Alan[]>>;
  SARF_KAT: Readonly<Record<string, Kategori>>;
  DB_KAT: Readonly<Record<string, Kategori>>;
}

// Ayar uygulanmış tablolar (bağlamın `t`'si).
export interface AyarliTablolar {
  FAMS: Readonly<Record<string, Aile>>;
  PROPS: readonly Ozellik[];
  SARF_KAT: Readonly<Record<string, Kategori>>;
  DB_KAT: Readonly<Record<string, Kategori>>;
  HM_GRUP: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export const TABAN = { FAMS, PROPS, SERTIFIKA, BIRIMLER, BIRIM_T, TOLP, DOCTIPS, ALAN, SARF_KAT, DB_KAT } satisfies HamTablolar;
export {
  CAKISMA_OZEL, CAKISMA_VARSAYILAN, FIRMA_KODU_DESEN, FORMS, KOD_TUR, ROLLER, TURLER, YETKI, YETKI_AD,
} from '../sabitler/index.ts';

export type { BaglamGirdisi, GenelAyar, KatalogKarti, KuralBaglami, MalzemeAyari };

// Bağlam ekrandaki (kaydı sürüyor olabilen) ayar ve genel ayarla kurulur: kurallar ekranda görüneni okur.
export function bolumBaglami(g: BaglamGirdisi, ayar: MalzemeAyari, genel: GenelAyar): KuralBaglami {
  return kuralBaglami({ ...g, ortam: { ...g.ortam, malzemeAyari: ayar, genel } });
}

export const ayarliTablolar = (b: KuralBaglami): AyarliTablolar => b.t;

export const turAlanlari = (tur: string, b: KuralBaglami): readonly Alan[] => hamTurAlanlari(tur, b);
export const alanZorunlu = (tur: string, a: Alan, b: KuralBaglami): boolean => hamAlanZorunlu({ tur }, a, b);
export const cakismaAlanAdi = (tur: string, k: string, b: KuralBaglami): string => hamCakismaAlanAdi(tur, k, b);
export const firmaKodluTurler = (b: KuralBaglami): readonly string[] => hamFirmaKodluTurler(b);

export interface MukerrerGrubu { neden: string; kartlar: readonly KatalogKarti[] }
// Çekirdek kart kaydıyla çalışır; sonuç kayıt kimliğinden katalog kartına geri eşlenir.
export function mukerrerGruplari(b: KuralBaglami): readonly MukerrerGrubu[] {
  const kimlikle = new Map(b.kartlar.map((k) => [String(k.kayit.id ?? k.kimlik), k]));
  const gruplar = hamMukerrerGruplari(b.kartlar.map((k) => k.kayit), b);
  return gruplar.map((g) => ({ neden: g.neden, kartlar: g.kartlar.flatMap((x) => kimlikle.get(String(x.id)) ?? []) }));
}
export interface BirlesmeSatiri { eski_kod: string; eski_ad: string; yeni_kod: string; tarih: string; neden: string }
export const birlesmeListesi = (b: KuralBaglami): readonly BirlesmeSatiri[] =>
  hamBirlesmeListesi(b.kartlar.map((k) => k.kayit), b);
