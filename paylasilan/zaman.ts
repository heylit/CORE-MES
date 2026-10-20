import { z } from 'zod';

// Zaman (timestamptz) saat dilimi bilgili ISO 8601 metni olarak taşınır: an tektir, istemci yerel saate kendisi
// çevirir. Saat farkı sunucu oturumunun saat dilimine göre değişir (yaz/kış saati dahil); metin karşılaştırılmaz,
// an karşılaştırılır. Saat dilimi taşımayan metin reddedilir: hangi an olduğu bilinemez.
// Tarih (date) gün olarak taşınır: saat ve saat dilimi yoktur, an'a çevrilmez (gün kayar).
const TARIH = /^(\d{4})-(\d{2})-(\d{2})$/;
// Veritabanının sonlu her zaman çıktısı geçer: eski yıllarda saat farkı saniye taşır (yerel ortalama saat),
// yıl altı basamağa çıkabilir, milattan önceki yıl ' BC' ekiyle gelir. Sonsuz değer ('infinity') an değildir, geçmez.
const ZAMAN = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2})(?::(\d{2}))?)( BC)?$/;

// Çalışma ortamının tarih ayrıştırıcısı 30 Şubat'ı Mart'a taşır; takvimde olmayan gün burada reddedilir.
// Yıl 1'den başlar (veritabanı 0000 yılını kabul etmez); milattan önceki N yılı takvim hesabında 1 - N'dir.
function takvimdeVar(yil: number, ay: number, gun: number, milattanOnce = false): boolean {
  if (yil < 1) return false;
  const y = milattanOnce ? 1 - yil : yil;
  const artik = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const gunSayisi = [31, artik ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][ay - 1];
  return gunSayisi !== undefined && gun >= 1 && gun <= gunSayisi;
}

function gecerliTarih(metin: string): boolean {
  const p = TARIH.exec(metin);
  return p !== null && takvimdeVar(Number(p[1]), Number(p[2]), Number(p[3]));
}

function gecerliAn(metin: string): boolean {
  const p = ZAMAN.exec(metin);
  if (p === null) return false;
  const sayi = (i: number): number => Number(p[i] ?? 0);
  return takvimdeVar(sayi(1), sayi(2), sayi(3), p[10] !== undefined)
    && sayi(4) <= 23 && sayi(5) <= 59 && sayi(6) <= 59 && sayi(7) <= 15 && sayi(8) <= 59 && sayi(9) <= 59;
}

export const tarihSemasi = z
  .string()
  .regex(TARIH, 'Tarih GGGG-AA-GG biçiminde olmalı.')
  .refine(gecerliTarih, 'Geçerli bir tarih girin.');

export const zamanSemasi = z
  .string()
  .regex(ZAMAN, 'Zaman saat dilimi bilgili ISO 8601 biçiminde olmalı (örnek: 2026-10-07T14:30:00+03:00).')
  .refine(gecerliAn, 'Geçerli bir tarih ve saat girin.');

export type Tarih = z.output<typeof tarihSemasi>;
export type Zaman = z.output<typeof zamanSemasi>;

// Sunucu tarafı bu yoldan da alır; istemci zod taşımayan `#paylasilan/tesis-zamani.ts`'ten ithal eder.
export { TESIS_SAAT_DILIMI, tesisGunBasi, tesisGunu, tesisSaati } from './tesis-zamani.ts';
