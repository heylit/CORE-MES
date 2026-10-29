import type { Db } from '#cekirdek/db.ts';
import { firmaAdlari } from '../musteri-tedarikci/disari.ts';
import * as sorgu from './sorgular.ts';

export type EmirSevkDurumu = Omit<sorgu.SevkDurumuSatiri, 'uretimEmriId'>;

// Biten emrin sevkiyattaki yeri (kart #1338, Akış Süresi okur): bekleme listesine düştüğü an, kaldırıldıysa ne zaman,
// işe çevrildiyse işin durumu ve son durum zamanı. Bekleme listesine hiç düşmemiş emir haritada yoktur.
export async function emirlerinSevkDurumu(db: Db, emirIdleri: readonly number[]): Promise<Map<number, EmirSevkDurumu>> {
  if (emirIdleri.length === 0) return new Map();
  const satirlar = await sorgu.emirlerinSevkDurumu(db, emirIdleri);
  return new Map(satirlar.map(({ uretimEmriId, ...durum }) => [uretimEmriId, durum]));
}

export type EmirSevki = Omit<sorgu.EmirSevkiSatiri, 'uretimEmriId'> & { firmaAdi: string | null };

// İleri izlenebilirlik (E-12): lot -> emir (stok) -> sevk -> müşteri. Emrin ürününü taşıyan iptal edilmemiş işler; müşteri işin bırakış
// noktasının firmasıdır. Sevke hiç çıkmamış emir haritada yoktur.
export async function emirlerinSevkleri(db: Db, emirIdleri: readonly number[]): Promise<Map<number, EmirSevki[]>> {
  if (emirIdleri.length === 0) return new Map();
  const satirlar = await sorgu.emirlerinSevkleri(db, emirIdleri);
  const adlar = await firmaAdlari(db, satirlar.flatMap((s) => (s.firmaId === null ? [] : [s.firmaId])));
  const sonuc = new Map<number, EmirSevki[]>();
  for (const { uretimEmriId, ...s } of satirlar) {
    const liste = sonuc.get(uretimEmriId) ?? [];
    liste.push({ ...s, firmaAdi: s.firmaId === null ? null : adlar.get(s.firmaId) ?? null });
    sonuc.set(uretimEmriId, liste);
  }
  return sonuc;
}

// Fasona giden işin teslimi (kart #1310): stok parçayı firmanın Yolda konumundan fason konumuna taşır.
export { fasonSevkiDinle } from './sevk-olaylari.ts';
export type { FasonSevkiDinleyicisi, FasonSevkiOlayi } from './sevk-olaylari.ts';

// Biten emrin ürününü taşıyan işin durum değişimi (E-12): stok çıkışı ve ileri izlenebilirlik buna bağlanır.
export { urunSevkiDinle } from './sevk-olaylari.ts';
export type { SevkIsDurumu, UrunSevkiDinleyicisi, UrunSevkiOlayi, UrunSevkSatiri } from './sevk-olaylari.ts';

// uretim-emirleri ve satın alma sevkiyatı ithal edemez; bağı sunucu/kablolama.ts kurar. Olay komutla aynı işlemde gelir; sevkiyatın reddi
// komutu da geri alır.
export { alimYansit, emirBittiYansit, fasonHareketiYansit } from './servis.ts';

// Satış faturası sevke bağlanırken (260 a, Finans): iş yoksa null; firma ve sipariş bilinmiyorsa null.
export { sevkIsiOzeti } from './servis.ts';
export type { SevkIsiOzeti } from './servis.ts';

// Satış faturasına sevk seçimi (302 a, Finans): siparişin emirlerini taşıyan işler; iptal edilenler `iptal: true` ile döner.
export { siparisinSevkleri } from './servis.ts';
export type { SiparisSevki } from './servis.ts';

// Depo son çıkışı ve kabulü (960, 962 a): stok listeyi okur, komutunu kendi işlemiyle aynı transaction'da yazar.
export { depoBekleyenleri, depoCikisiniGeriAl, depoCikisiYaz, depoKabuluYaz, depoKalemiAl } from './tum-isler.ts';
export type { DepoKalemi } from './tum-isler.ts';

// Satın almanın teslim yöntemi kalemin taşımasını yazar (959 b): yer 'satin-alma', son yazan izi kalır.
export { tasimaDegistir } from './tum-isler.ts';

// Takvim (891): günü aralıktaki sevkiyat işleri; yetkiyi çağıran denetler (sevkiyat.oku).
export { takvimKayitlari } from './servis.ts';
