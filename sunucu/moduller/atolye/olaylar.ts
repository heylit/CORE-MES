import type { Db } from '#cekirdek/db.ts';

// Fabrika Haritası'nın stoka verdiği haberler (kart 2902). Stok atölyeyi okur; atölye stoku ithal etseydi modüller döngüye girerdi.
// Bu yüzden dinleyici `sunucu/kablolama.ts`'te bağlanır (ADR 0006 madde 6). Olay komutla aynı işlemde verilir; dinleyicinin reddi
// bütün işlemi geri alır.

// Yeni bölüm açıldı. `islemler` açan kişinindir: dinleyen kendi yetki kuralını uygular (stok deposu yalnız stok.harita-yaz ile açılır).
export interface BolumAcildiOlayi {
  salonId: number;
  kod: string;
  kisiId: number;
  islemler: readonly string[];
}

type Dinleyici<T> = (db: Db, olay: T) => Promise<unknown>;

// Aynı dinleyici iki kez kaydedilmez (kablolama yeniden koşabilir); dönen işlev kaydı siler.
function kayit<T>() {
  const dinleyiciler: Dinleyici<T>[] = [];
  const dinle = (d: Dinleyici<T>): (() => void) => {
    if (!dinleyiciler.includes(d)) dinleyiciler.push(d);
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

const bolumAcildi = kayit<BolumAcildiOlayi>();
export const bolumAcildiDinle = bolumAcildi.dinle;
export const bolumAcildiBildir = bolumAcildi.bildir;
