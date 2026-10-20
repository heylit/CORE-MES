import type { Db } from '#cekirdek/db.ts';

// Emir bitti ve fason hareketi olayları (kart #1310): sevkiyat ve stok bu modülü okur; bu modül onları ithal etseydi modüller
// döngüye girerdi. Bu yüzden dinleyici kendini kaydeder (sayim-olayi.ts ile aynı kalıp). Olay komutla aynı işlemde verilir;
// dinleyicinin reddi bütün işlemi geri alır.
export interface EmirBittiOlayi {
  uretimEmriId: number;
  saglamAdet: number;
  kisiId: number;
}

// Emir iptal edildi (kart #1413): stok açık malzeme isteklerini kapatır. Birleşmeyle kapanan kol bu olay değildir; üretim üst emirde sürer.
export interface EmirIptalOlayi {
  uretimEmriId: number;
  kisiId: number;
}

// Parti üst emre birleşti (elle birleştirme ya da planlı kolun katılması): kaynak iptale geçer, üretim hedefte sürer. Stok kaynağın
// ayrılanını hedefe taşır; açık istekler kapanmaz.
export interface EmirBirlestiOlayi {
  uretimEmriId: number;
  hedefEmirId: number;
  kisiId: number;
}

// Emir açıldı: stok, istendiyse emrin girdilerini serbest stoktan ayırır (rezerve); yetmeyen kısım gelen malzemeyi bekler.
export interface EmirAcildiOlayi {
  uretimEmriId: number;
  kisiId: number;
  stoktanRezerve: boolean;
}

export interface FasonHareketiOlayi {
  // Ayrıntı fasonHareketiOzeti ile okunur.
  hareketId: number;
  // Fason adımından önceki iş emri (parça onun istasyonundan gider); fason ilk adımsa null.
  oncekiIsEmriId: number | null;
  kisiId: number;
}

type Dinleyici<T> = (db: Db, olay: T) => Promise<void>;
export type EmirBittiDinleyicisi = Dinleyici<EmirBittiOlayi>;
export type FasonHareketiDinleyicisi = Dinleyici<FasonHareketiOlayi>;
export type EmirIptalDinleyicisi = Dinleyici<EmirIptalOlayi>;
export type EmirAcildiDinleyicisi = Dinleyici<EmirAcildiOlayi>;
export type EmirBirlestiDinleyicisi = Dinleyici<EmirBirlestiOlayi>;

function kayit<T>() {
  const dinleyiciler: Dinleyici<T>[] = [];
  // Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
  const dinle = (d: Dinleyici<T>): (() => void) => {
    dinleyiciler.push(d);
    return () => {
      const i = dinleyiciler.indexOf(d);
      if (i >= 0) dinleyiciler.splice(i, 1);
    };
  };
  const bildir = async (db: Db, olay: T): Promise<void> => {
    for (const d of [...dinleyiciler]) await d(db, olay);
  };
  return { dinle, bildir };
}

const bitti = kayit<EmirBittiOlayi>();
const fason = kayit<FasonHareketiOlayi>();
const iptal = kayit<EmirIptalOlayi>();
const acildi = kayit<EmirAcildiOlayi>();
const birlesti = kayit<EmirBirlestiOlayi>();

export const emirBittiDinle = bitti.dinle;
export const emirBittiBildir = bitti.bildir;
export const fasonHareketiDinle = fason.dinle;
export const fasonHareketiBildir = fason.bildir;
export const emirIptalDinle = iptal.dinle;
export const emirIptalBildir = iptal.bildir;
export const emirAcildiDinle = acildi.dinle;
export const emirAcildiBildir = acildi.bildir;
export const emirBirlestiDinle = birlesti.dinle;
export const emirBirlestiBildir = birlesti.bildir;
