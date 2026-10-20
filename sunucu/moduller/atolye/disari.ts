// Başka modüllerin ithal edebildiği tek dosya. Raf, göz ve zemin alanı Fabrika Haritası'nda tek kaynaktır (kart #686):
// stok miktarı ve hareketi stokta kalır, yeri buradaki göze ya da alana bağlanır.
import type { Db } from '#cekirdek/db.ts';
import type { AlanTuru, GozKalemi, GozKalemiKaydi, KayitCevabi, RafKaydi, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import { adresCoz, gozAdresi as adresUret } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

export type { AlanTuru, RafTuru } from '#paylasilan/sozlesme/atolye.ts';

export interface Goz {
  id: number;
  // Raf-Bölme-Kat-Göz (A12-03-2-1); raf kodu değişince adres değişir, kimlik kalır.
  adres: string;
  rafId: number;
  rafKodu: string;
  rafAktif: boolean;
  salonId: number;
  salonKodu: string;
  bolme: number;
  kat: number;
  goz: number;
}

export interface Raf {
  id: number;
  salonId: number;
  kod: string;
  ad: string;
  tur: RafTuru;
  aktif: boolean;
}

export interface Alan {
  id: number;
  salonId: number;
  tur: AlanTuru;
  ad: string;
}

const goze = (g: sorgular.DisGozSatiri): Goz => ({ ...g, adres: adresUret(g.rafKodu, g.bolme, g.kat, g.goz) });

// Bütün gözler ya da bir bölümün gözleri; raf koduna, bölmeye, kata ve göze göre sıralı.
export async function gozler(db: Db, salonId: number | null = null): Promise<Goz[]> {
  return (await sorgular.disGozler(db, salonId)).map(goze);
}

// Adres metni göze çözülür ("a12-3-2" de olur); kat verilmeyen adres göz değildir, göz verilmezse 1. göz.
export async function gozBul(db: Db, adres: string): Promise<Goz | null> {
  const p = adresCoz(adres);
  if (!p || p.kat === null) return null;
  const g = await sorgular.disGozAdresle(db, p.rafKodu, p.bolme ?? 0, p.kat, p.goz ?? 1);
  return g && goze(g);
}

export async function gozAdresi(db: Db, gozId: number): Promise<Goz | null> {
  const g = await sorgular.disGoz(db, gozId);
  return g && goze(g);
}

export async function raflar(db: Db): Promise<Raf[]> {
  return (await sorgular.raflar(db, null)).map(({ id, salonId, kod, ad, tur, aktif }) => ({ id, salonId, kod, ad, tur, aktif }));
}

// Zemin alanları; stok kendi türlerini (kabul, üretim çıkışı, depo zemini, fason) süzer.
export async function alanlar(db: Db, salonId: number | null = null): Promise<Alan[]> {
  return (await sorgular.alanlar(db, salonId)).map(({ id, salonId: s, tur, ad }) => ({ id, salonId: s, tur, ad }));
}

// Depo bölümünün raf ve göz kalemi yazımı Stok Merkezi'nden (kart #1304): yetkiyi ve bölümün stok deposu olduğunu çağıran
// (stok) denetler. Raf kaydında yalnız raflar değişir; bölümün öbür öğeleri kayıtlı haliyle kalır.
export const rafYerlesimiKaydet = (db: Db, salonId: number, kayit: { surum: number; raflar: RafKaydi[] }, kisiId: number): Promise<KayitCevabi> =>
  servis.rafYerlesimiKaydet(db, salonId, kayit, kisiId);
export const gozKalemiYaz = (db: Db, kayit: GozKalemiKaydi, kisiId: number): Promise<GozKalemi> => servis.gozKalemiYaz(db, kayit, kisiId);
export const gozKalemiSil = (db: Db, id: number): Promise<void> => servis.gozKalemiSil(db, id);
// Göz kaleminin bölümü; kalem yoksa null.
export const gozKaleminBolumu = async (db: Db, id: number): Promise<number | null> => (await sorgular.gozKalemiBul(db, id))?.salonId ?? null;

export interface IstasyonYeri {
  istasyonId: number;
  salonId: number;
  // Metre, ondalık metin (yerleşim cevabıyla aynı).
  x: string;
  z: string;
}

// İstasyonların haritadaki yeri; bölüm verilirse yalnız o bölüm. Yetki ve kapsam süzgeci çağırandadır.
export async function istasyonYerleri(db: Db, salonId: number | null = null): Promise<IstasyonYeri[]> {
  return (await sorgular.istasyonYerleri(db, salonId)).map(({ istasyonId, salonId: s, x, z }) => ({ istasyonId, salonId: s, x, z }));
}

export type { ZeminBolumu, ZeminNesnesi } from './servis.ts';
export const zemin = (db: Db) => servis.zemin(db);
