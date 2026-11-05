import type { Db } from '#cekirdek/db.ts';
import { sonKonfigurasyon } from './sorgular.ts';

// 1647: malzemenin yürürlükteki parça revizyonu (son konfigürasyon). Revizyonu olmayan malzeme haritada yoktur. Stok partisi ve satın
// alma sipariş satırı açılışta bunu yazar; bağı kablolama.ts kurar. Yetki denetlemez.
export async function yururluktekiParcaRevizyonlari(db: Db, malzemeIdleri: readonly number[]): Promise<Map<number, string>> {
  const sonuc = new Map<number, string>();
  for (const id of new Set(malzemeIdleri)) {
    const r = (await sonKonfigurasyon(db, id))?.parcaRevizyonu ?? null;
    if (r !== null) sonuc.set(id, r);
  }
  return sonuc;
}
export { malzemeKartiIzleri } from './sorgular.ts';
