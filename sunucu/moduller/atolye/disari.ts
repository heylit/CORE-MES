// Başka modüllerin ithal edebildiği tek dosya. Raf, göz ve zemin alanı Fabrika Haritası'nda tek kaynaktır (kart #686):
// stok miktarı ve hareketi stokta kalır, yeri buradaki göze ya da alana bağlanır.
import type { Db } from '#cekirdek/db.ts';
import type { AlanTuru, FabrikaCevabi, GozKalemi, GozKalemiKaydi, KayitCevabi, RafKaydi, RafKodlamasi, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import { adresCoz, gozKodu } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

export type { AlanTuru, RafKodlamasi, RafTuru } from '#paylasilan/sozlesme/atolye.ts';

export interface Goz {
  id: number;
  // Raf kodlamasına göre (3168): Raf-Bölme-Kat-Göz (A12-03-2-1) ya da raf kodu ve sıra numarası (A7); raf kodu ya da
  // kodlama değişince adres değişir, kimlik kalır.
  adres: string;
  rafId: number;
  rafKodu: string;
  rafAktif: boolean;
  salonId: number;
  salonKodu: string;
  bolme: number;
  kat: number;
  goz: number;
  // 3168: sıra numarası (saklanmamışsa null).
  duzNo: number | null;
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

const goze = (kodlama: RafKodlamasi) => (g: sorgular.DisGozSatiri): Goz => ({ ...g, adres: gozKodu(kodlama, g.rafKodu, g) });

export const rafKodlamasi = (db: Db): Promise<RafKodlamasi> => servis.rafKodlamasi(db);

// Bütün gözler ya da bir bölümün gözleri; raf koduna, bölmeye, kata ve göze göre sıralı. `kodlama` verilirse adres o kodlamayla
// üretilir (kodlama değişmeden önceki kuru deneme, 3168); verilmezse geçerli kodlamayla.
export async function gozler(db: Db, salonId: number | null = null, kodlama?: RafKodlamasi): Promise<Goz[]> {
  const k = kodlama ?? await servis.rafKodlamasi(db);
  return (await sorgular.disGozler(db, salonId)).map(goze(k));
}

// Adres metni göze çözülür ("a12-3-2" de olur); kat verilmeyen adres göz değildir, göz verilmezse 1. göz. Sıra numaralı kodlamada
// raf harfi ve numara ("a7"); eski düzenin adresi o kodlamada göz bulmaz (eski kodun takma adı yok).
export async function gozBul(db: Db, adres: string): Promise<Goz | null> {
  const kodlama = await servis.rafKodlamasi(db);
  const p = adresCoz(adres, kodlama);
  if (!p) return null;
  if (p.duzNo !== null) {
    const d = await sorgular.disGozDuzNoIle(db, p.rafKodu, p.duzNo);
    return d && goze(kodlama)(d);
  }
  if (p.kat === null) return null;
  const g = await sorgular.disGozAdresle(db, p.rafKodu, p.bolme ?? 0, p.kat, p.goz ?? 1);
  return g && goze(kodlama)(g);
}

export async function gozAdresi(db: Db, gozId: number): Promise<Goz | null> {
  const g = await sorgular.disGoz(db, gozId);
  return g && goze(await servis.rafKodlamasi(db))(g);
}

// 3168: kodlama değişimi ve rafın yeniden numaralanması Stok Merkezi'nden (Stok > Ayarlar, raf görünümü); yetkiyi çağıran
// denetler ve konum kodlarını aynı kayıtta eşler.
export const rafKodlamasiDegistir = (db: Db, kodlama: RafKodlamasi, beklenen: RafKodlamasi, kisiId: number, kaynak: { yol: string; yetki: string }) =>
  servis.rafKodlamasiDegistir(db, kodlama, beklenen, kisiId, kaynak);
export const harfOlmayanRafKodlari = (db: Db): Promise<string[]> => servis.harfOlmayanRafKodlari(db);
export const rafYenidenNumarala = (db: Db, rafId: number) => servis.rafYenidenNumarala(db, rafId);

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

// Bütün bölümlerin yerleşimi fabrikadaki yeriyle (GET /atolye/fabrika ile aynı cevap, kart #114): Stok Merkezi tek fabrika
// zeminini bununla çizer. Okuma yetkisini çağıran (stok) kendi ucunda denetler.
export const fabrikaPlani = (db: Db): Promise<FabrikaCevabi> => servis.fabrika(db);

// Makinenin 3B görünümünü (CNC Kurulum `model_turu`, 2100-2 a) veren işlevi kaydeder; bağ kablolama.ts'tedir.
export type { MakineModelTuruCozucusu } from './servis.ts';
export const makineModelTuruCozucusu = (cozucu: servis.MakineModelTuruCozucusu): void => servis.makineModelTuruCozucusuKaydet(cozucu);
// 3202: depoda stoklu malzemeleri veren işlevi kaydeder (haritanın 3B model listesi); bağ kablolama.ts'tedir.
export type { DepoMalzemeCozucusu } from './servis.ts';
export const depoMalzemeCozucusu = (cozucu: servis.DepoMalzemeCozucusu): void => servis.depoMalzemeCozucusuKaydet(cozucu);
// 3230 a: silinecek rafın gözlerindeki stok engelini (malzeme, açık iş) veren işlevi kaydeder; bağ kablolama.ts'tedir.
export type { RafSilmeEngeliCozucusu } from './servis.ts';
export const rafSilmeEngeliCozucusu = (cozucu: servis.RafSilmeEngeliCozucusu | null): void => servis.rafSilmeEngeliCozucusuKaydet(cozucu);

// 2902: yeni bölüm açıldı haberi (dinleyen stok; bağ sunucu/kablolama.ts'te).
export type { BolumAcildiOlayi } from './olaylar.ts';
export { bolumAcildiDinle } from './olaylar.ts';
