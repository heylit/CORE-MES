import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';

// Önizleme üç boyutlu kütüphaneyi gerektirir; bu dosya ağır parça içermez, ekran ve akış buradan karar verir.

export const KARE_SAYISI = 8;
// Y ekseni çevresinde dönen kameranın yukarıdan bakış açısı (derece).
export const BAKIS_YUKSEKLIGI = 20;
// Kare 64 KiB'ı aşarsa bütün kareler bir alt çözünürlükte yeniden çizilir; sonuncuda da aşarsa üretim vazgeçilir.
export const COZUNURLUKLER = [384, 320, 256] as const;
// Sunucudaki ONIZLEME_SINIRLARI.kareBayt (`paylasilan/sozlesme/cizimler.ts`); sözleşme zod taşıdığı için burada sayı olarak durur, karar sunucunundur.
export const KARE_BAYT_SINIRI = 64 * 1024;
// Okuyucu modeli tarayıcı belleğinde üçgenlere açar; çok büyük dosyada sekme çökmesin.
export const AZAMI_MODEL_BAYT = 25 * 1024 * 1024;

// Üretilmemesi hata değil karardır (cihaz, model boyu, kare boyu); iletisi kullanıcıya gösterilir.
export class OnizlemeAtlandi extends Error {}

export const onizlemeTuruMu = (tur: DosyaTuru): tur is 'step' | 'iges' => tur === 'step' || tur === 'iges';

export function webglVarMi(): boolean {
  return typeof WebGLRenderingContext !== 'undefined';
}

export const kareAcisi = (sira: number, adet = KARE_SAYISI): number => (2 * Math.PI * sira) / adet;

// `ciz` verilen çözünürlükte bütün kareleri üretir; ilk çözünürlük sınırı tutturan kareler döner.
export async function sinirdaKareler<K extends { boyut: number }>(ciz: (cozunurluk: number) => Promise<K[]>): Promise<K[]> {
  for (const cozunurluk of COZUNURLUKLER) {
    const kareler = await ciz(cozunurluk);
    if (kareler.every((k) => k.boyut <= KARE_BAYT_SINIRI)) return kareler;
  }
  throw new OnizlemeAtlandi('Önizleme kareleri 64 KiB sınırına sığmadı; önizleme üretilmedi.');
}
