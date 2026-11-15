import type { Db } from '#cekirdek/db.ts';

// Proje açıldı ve proje değişti (2067, kart 3288-2; 3272 ile ortak olay): kayıtla aynı işlemde verilir, dinleyicinin reddi kaydı da
// geri alır. Ortak Dosyalar projenin klasörünü açar ve adını eşitler. Dinleyiciler başka modüldedir; bu modül onları ithal etseydi
// modüller döngüye girerdi, bu yüzden bağ `sunucu/kablolama.ts`'tedir. Olay yalnız kimliği taşır; imza yalnız alan eklenerek değişir.
export interface ProjeOlayi {
  projeId: number;
  kisiId: number;
}

export type ProjeOlayiDinleyicisi = (db: Db, olay: ProjeOlayi) => Promise<void>;

function olayKur() {
  const dinleyiciler: ProjeOlayiDinleyicisi[] = [];
  return {
    // Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
    dinle(d: ProjeOlayiDinleyicisi): () => void {
      dinleyiciler.push(d);
      return () => {
        const i = dinleyiciler.indexOf(d);
        if (i >= 0) dinleyiciler.splice(i, 1);
      };
    },
    async bildir(db: Db, olay: ProjeOlayi): Promise<void> {
      for (const d of [...dinleyiciler]) await d(db, olay);
    },
  };
}

const acildi = olayKur();
const degisti = olayKur();

export const projeAcildiDinle = acildi.dinle;
export const projeAcildiBildir = acildi.bildir;
export const projeDegistiDinle = degisti.dinle;
export const projeDegistiBildir = degisti.bildir;
