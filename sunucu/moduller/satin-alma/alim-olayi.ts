import type { Db } from '#cekirdek/db.ts';

// "Biz alacağız" denen talebin siparişleri (kart #1310): sevkiyat bekleme listesindeki alım satırlarını bu listeye eşitler. Boş liste,
// alınacak bir şey kalmadı demektir (yöntem değişti, talep iptal oldu). Dinleyici talebin komutuyla aynı işlemde koşar.
export interface AlimOlayi {
  talepId: string;
  talepNo: string;
  alimlar: { firmaId: number; istenenTarih: string | null }[];
  kisiId: number;
}
export type AlimDinleyicisi = (db: Db, olay: AlimOlayi) => Promise<void>;

const dinleyiciler: AlimDinleyicisi[] = [];

export function alimDinle(d: AlimDinleyicisi): () => void {
  dinleyiciler.push(d);
  return () => { dinleyiciler.splice(dinleyiciler.indexOf(d), 1); };
}

export async function alimBildir(db: Db, olay: AlimOlayi): Promise<void> {
  for (const d of dinleyiciler) await d(db, olay);
}
