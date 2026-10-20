import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';

// Sipariş onaylandı (286 b): stüdyodan açılan acil siparişin emrini plan açar. Plan bu modülü okur; bu modül onu ithal etseydi
// modüller döngüye girerdi. Bu yüzden dinleyici kendini kaydeder (emir-olaylari.ts kalıbı). Olay onayla aynı işlemde verilir;
// dinleyicinin reddi onayı da geri alır ve hatası çağırana döner.
export interface SiparisOnaylandiOlayi {
  siparisId: number;
  kullanici: Kullanici;
}

export type SiparisOnaylandiDinleyicisi = (db: Db, olay: SiparisOnaylandiOlayi) => Promise<void>;

const dinleyiciler: SiparisOnaylandiDinleyicisi[] = [];

// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
export function siparisOnaylandiDinle(d: SiparisOnaylandiDinleyicisi): () => void {
  dinleyiciler.push(d);
  return () => {
    const i = dinleyiciler.indexOf(d);
    if (i >= 0) dinleyiciler.splice(i, 1);
  };
}

export async function siparisOnaylandiBildir(db: Db, olay: SiparisOnaylandiOlayi): Promise<void> {
  for (const d of [...dinleyiciler]) await d(db, olay);
}
