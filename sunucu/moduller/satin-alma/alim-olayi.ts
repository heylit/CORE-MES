import type { Db } from '#cekirdek/db.ts';

// Teslim yöntemi seçilmiş talebin siparişleri (kart #1310, 959 b): sevkiyattaki alım kalemlerini bu listeye eşitler. Taşıma teslim
// yöntemidir ("biz alacağız" biz, "firma getirir" firma); sevkiyattaki taşımayla aynı kayıttır, son yazan kalır. Boş liste, beklenecek
// bir şey kalmadı demektir (yöntem silindi, talep iptal oldu). Dinleyici talebin komutuyla aynı işlemde koşar; reddi komutu geri alır.
export type AlimTasimasi = 'biz' | 'firma';
export interface AlimOlayi {
  talepId: string;
  talepNo: string;
  alimlar: { firmaId: number; istenenTarih: string | null; tasima: AlimTasimasi }[];
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
