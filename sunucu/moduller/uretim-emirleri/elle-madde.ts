import type { Db } from '#cekirdek/db.ts';
import { cakisma } from '#cekirdek/hata.ts';
import { AZAMI_LISTE_MADDESI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { LISTE_DOLU } from './kurallar.ts';
import * as s from './sorgular/adim-durumu/sorgular.ts';

// 3494-3 a: emre özel ek madde emrin hazırlık listesine yazılır (tek liste). Üretim Hazırlık (Arkon) kendi yetkisi ve kurallarıyla
// (kapalı iş emri, kendi azami sayısı, olay sırası) bu uçlardan yazar; liste sınırı ve sıra burada, Adım Durumu'nun eklemesiyle aynıdır.
export { elleMaddeler, elleMaddeBul, type ElleMaddeSatiri } from './sorgular/adim-durumu/sorgular.ts';

export async function elleMaddeEkle(db: Db, isEmriId: number, ad: string, kisiId: number): Promise<boolean> {
  const ie = await s.isEmrininEmriKilitle(db, isEmriId);
  if (ie === null) return false;
  if ((await s.listeMaddeSayisi(db, isEmriId)) >= AZAMI_LISTE_MADDESI) throw cakisma(LISTE_DOLU);
  await s.listeMaddesiEkle(db, { emirId: ie.emirId, isEmriId, ad, asama: 'hazirlik', kisiId, kontrol: null });
  return true;
}

export async function elleMaddeOlayiEkle(db: Db, id: number, olay: 'tamamla' | 'geri-al' | 'kaldir', kisiId: number): Promise<void> {
  await s.listeOlayiEkle(db, id, kisiId, olay);
}
