import type { Db } from '#cekirdek/db.ts';

// Fasona gönderim teslim olayı (kart #1310): fason işi tamamlanınca parça firmanın "Yolda" konumundan fason konumuna geçer; teslim geri
// alınırsa geri döner. Stok bu modülü okur, bu modül stoğu ithal edemez: stok dinleyicisini kaydeder. Olay durum komutuyla aynı
// işlemde verilir; dinleyicinin reddi durumu da geri alır.
export interface FasonSevkiOlayi {
  // İşe bağlı fason gidiş hareketleri (uretim-emirleri); ayrıntı fasonHareketiOzeti ile okunur.
  fasonHareketIdleri: number[];
  // true: teslim edildi; false: teslim geri alındı (iş yeniden yolda ya da havuzda).
  teslim: boolean;
  kisiId: number | null;
}
export type FasonSevkiDinleyicisi = (db: Db, olay: FasonSevkiOlayi) => Promise<void>;

const dinleyiciler: FasonSevkiDinleyicisi[] = [];
// Dönen işlev kaydı kaldırır (testler kendi dinleyicisini bırakır).
export function fasonSevkiDinle(d: FasonSevkiDinleyicisi): () => void {
  dinleyiciler.push(d);
  return () => {
    const i = dinleyiciler.indexOf(d);
    if (i >= 0) dinleyiciler.splice(i, 1);
  };
}
export async function fasonSevkiBildir(db: Db, olay: FasonSevkiOlayi): Promise<void> {
  if (olay.fasonHareketIdleri.length === 0) return;
  for (const d of [...dinleyiciler]) await d(db, olay);
}

// Ürün sevki olayı (E-12): bitmiş emrin ürününü taşıyan teslimat işi durum değiştirince (plan onayıyla yola çıkar, onay kalkınca
// planlanmışa döner, teslim edilir, geri alınır) emir, adet ve müşteri firmasıyla bildirilir; stok çıkışı buna bağlanır. Lot stok
// tarafında emrin bakiyesinden okunur. Fason olayıyla aynı kural: olay durum komutuyla aynı işlemde verilir, dinleyicinin reddi
// komutu da geri alır.
export type SevkIsDurumu = 'havuzda' | 'planlandi' | 'yolda' | 'tamamlandi';
export interface UrunSevkSatiri {
  isId: number;
  uretimEmriId: number;
  // Bekleme listesine düşen sağlam adet; bilinmiyorsa null.
  adet: string | null;
  // İşin bırakış noktasının firması; noktası firmaya bağlı değilse null.
  firmaId: number | null;
}
export interface UrunSevkiOlayi {
  satirlar: UrunSevkSatiri[];
  onceki: SevkIsDurumu;
  yeni: SevkIsDurumu;
  kisiId: number | null;
}
// Dinleyici sevki reddetmek için hata atar; sevke izin verip kullanıcıya göstermek istediği uyarıları döner (147 b: red parça).
export type UrunSevkiDinleyicisi = (db: Db, olay: UrunSevkiOlayi) => Promise<string[] | void>;

const urunDinleyicileri: UrunSevkiDinleyicisi[] = [];
export function urunSevkiDinle(d: UrunSevkiDinleyicisi): () => void {
  urunDinleyicileri.push(d);
  return () => {
    const i = urunDinleyicileri.indexOf(d);
    if (i >= 0) urunDinleyicileri.splice(i, 1);
  };
}
export async function urunSevkiBildir(db: Db, olay: UrunSevkiOlayi): Promise<string[]> {
  if (olay.satirlar.length === 0 || olay.onceki === olay.yeni) return [];
  const uyarilar: string[] = [];
  for (const d of [...urunDinleyicileri]) uyarilar.push(...((await d(db, olay)) ?? []));
  return uyarilar;
}
