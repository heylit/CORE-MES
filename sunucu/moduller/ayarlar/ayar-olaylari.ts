import type { Db } from '#cekirdek/db.ts';

// Ayar değişti olayı (2133-4 a): değer gerçekten değişince dinleyicilere aynı işlemde verilir; sevkiyat fabrika ayarından fabrika
// noktasını açar ya da günceller. Sevkiyat bu modülü okur; bu modül sevkiyatı ithal etseydi modüller döngüye girerdi. Bu yüzden
// dinleyici `sunucu/kablolama.ts`'te bağlanır. Dinleyicinin reddi ayar yazmasıyla birlikte bütün işlemi geri alır.
export interface AyarDegistiOlayi {
  anahtar: string;
  kisiId: number;
}

export type AyarDegistiDinleyicisi = (db: Db, olay: AyarDegistiOlayi) => Promise<void>;

const dinleyiciler: AyarDegistiDinleyicisi[] = [];

// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
export function ayarDegistiDinle(dinleyici: AyarDegistiDinleyicisi): () => void {
  dinleyiciler.push(dinleyici);
  return () => {
    const i = dinleyiciler.indexOf(dinleyici);
    if (i >= 0) dinleyiciler.splice(i, 1);
  };
}

export async function ayarDegistiBildir(db: Db, olay: AyarDegistiOlayi): Promise<void> {
  for (const d of [...dinleyiciler]) await d(db, olay);
}
