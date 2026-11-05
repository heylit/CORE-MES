import type { Db } from '#cekirdek/db.ts';

// Firma değişti olayı (2133-1 b): kart ya da adresleri yazılınca dinleyicilere aynı işlemde verilir; sevkiyat firmanın noktasını
// buradan açar ya da günceller. Sevkiyat bu modülü okur; bu modül sevkiyatı ithal etseydi modüller döngüye girerdi. Bu yüzden
// dinleyici `sunucu/kablolama.ts`'te bağlanır. Dinleyicinin reddi firma yazmasıyla birlikte bütün işlemi geri alır.
export interface FirmaDegistiOlayi {
  firmaId: number;
  // Adres kaldırılmadan hemen önce verilir: dinleyici o adrese bağlı kaydını başka adrese taşır. Öteki yazmalarda null.
  kaldirilanAdresId: number | null;
}

export type FirmaDegistiDinleyicisi = (db: Db, olay: FirmaDegistiOlayi) => Promise<void>;

const dinleyiciler: FirmaDegistiDinleyicisi[] = [];

// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
export function firmaDegistiDinle(dinleyici: FirmaDegistiDinleyicisi): () => void {
  dinleyiciler.push(dinleyici);
  return () => {
    const i = dinleyiciler.indexOf(dinleyici);
    if (i >= 0) dinleyiciler.splice(i, 1);
  };
}

export async function firmaDegistiBildir(db: Db, olay: FirmaDegistiOlayi): Promise<void> {
  for (const d of [...dinleyiciler]) await d(db, olay);
}
