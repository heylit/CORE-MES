import type { Db } from '#cekirdek/db.ts';
import type { KaliteKarari } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Sağlam sayım olayı (kart #1289): girilen ya da düzeltilen sağlam adet, sayımla aynı işlemde dinleyicilere verilir (stok onu
// istasyon konumuna üretim girişi ya da düzeltme düşüşü yazar). Stok bu modülü okur; bu modül stoku ithal etseydi modüller
// döngüye girerdi. Bu yüzden dinleyici kendini kaydeder. Dinleyicinin reddi sayımla birlikte bütün işlemi geri alır.
export interface SaglamSayimOlayi {
  uretimEmriId: number;
  // Sayımın bağlandığı iş emri; iş emirsiz eski emirde null.
  isEmriId: number | null;
  istasyonId: number;
  kisiId: number;
  // Ondalık metin: artı giriş, eksi düzeltme. Sıfır fark olay değildir.
  fark: string;
  // karar_bekliyor: ilk parça kararı beklenirken sayılan parça; stok onu aynı partiye karar bekliyor diye yazar (131 b).
  kaliteDurumu: 'serbest' | 'karar_bekliyor';
  // Sayılan parçanın refakat partisi (kart #125); kartsız sayımda null. Geçerliliğini dinleyen stok denetler.
  refakatPartisiId: number | null;
}

export type SaglamSayimDinleyicisi = (db: Db, olay: SaglamSayimOlayi) => Promise<void>;

const dinleyiciler: SaglamSayimDinleyicisi[] = [];

// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
export function saglamSayimDinle(dinleyici: SaglamSayimDinleyicisi): () => void {
  dinleyiciler.push(dinleyici);
  return () => {
    const i = dinleyiciler.indexOf(dinleyici);
    if (i >= 0) dinleyiciler.splice(i, 1);
  };
}

export async function saglamSayimiBildir(
  db: Db, olay: Omit<SaglamSayimOlayi, 'fark' | 'kaliteDurumu'> & { fark: number; kaliteDurumu?: SaglamSayimOlayi['kaliteDurumu'] },
): Promise<void> {
  if (olay.fark === 0) return;
  for (const d of [...dinleyiciler]) await d(db, { ...olay, fark: String(olay.fark), kaliteDurumu: olay.kaliteDurumu ?? 'serbest' });
}

// Hurda sayım olayı: girilen ya da geri alınan hurda, sayımla aynı işlemde dinleyicilere verilir (stok, hurdaya giden parçanın
// girdisini düşer). Sağlam olaydan ayrıdır: sağlam dinleyicisi hurdayı üretim girişi saymasın. Ret ve sıfır kuralı sağlamla aynıdır.
export interface HurdaSayimOlayi {
  uretimEmriId: number;
  isEmriId: number | null;
  istasyonId: number;
  kisiId: number;
  hurdaNedeniId: number;
  // Ondalık metin: artı hurda, eksi geri alma.
  fark: string;
  // Sayılan parçanın refakat partisi (kart #125); kartsız sayımda null. Geçerliliğini dinleyen stok denetler.
  refakatPartisiId: number | null;
}

export type HurdaSayimDinleyicisi = (db: Db, olay: HurdaSayimOlayi) => Promise<void>;

const hurdaDinleyicileri: HurdaSayimDinleyicisi[] = [];

export function hurdaSayimDinle(dinleyici: HurdaSayimDinleyicisi): () => void {
  hurdaDinleyicileri.push(dinleyici);
  return () => {
    const i = hurdaDinleyicileri.indexOf(dinleyici);
    if (i >= 0) hurdaDinleyicileri.splice(i, 1);
  };
}

export async function hurdaSayimiBildir(db: Db, olay: Omit<HurdaSayimOlayi, 'fark'> & { fark: number }): Promise<void> {
  if (olay.fark === 0) return;
  for (const d of [...hurdaDinleyicileri]) await d(db, { ...olay, fark: String(olay.fark) });
}

// Karar bekleyen sayımın kalite kararı: emrin o ana kadar karar bekleyen adedi onayda sağlama, retde redde geçer. Stok aynı
// partideki karar bekleyen bakiyeyi serbest ya da red yapar; üretim girişi değildir, sağlam olayı bu yüzden çıkmaz.
export interface KaliteKarariOlayi {
  uretimEmriId: number;
  isEmriId: number | null;
  kisiId: number;
  karar: KaliteKarari;
  // Ondalık metin, artı.
  adet: string;
  // Sayılan parçanın refakat partisi (kart #125); kartsız sayımda null. Geçerliliğini dinleyen stok denetler.
  refakatPartisiId: number | null;
}

export type KaliteKarariDinleyicisi = (db: Db, olay: KaliteKarariOlayi) => Promise<void>;

const kararDinleyicileri: KaliteKarariDinleyicisi[] = [];

export function kaliteKarariDinle(dinleyici: KaliteKarariDinleyicisi): () => void {
  kararDinleyicileri.push(dinleyici);
  return () => {
    const i = kararDinleyicileri.indexOf(dinleyici);
    if (i >= 0) kararDinleyicileri.splice(i, 1);
  };
}

export async function kaliteKarariBildir(db: Db, olay: Omit<KaliteKarariOlayi, 'adet'> & { adet: number }): Promise<void> {
  if (olay.adet === 0) return;
  for (const d of [...kararDinleyicileri]) await d(db, { ...olay, adet: String(olay.adet) });
}
