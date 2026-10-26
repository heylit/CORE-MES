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

// Kare kaynağı (kart #688): 3B modelden dönen kareler, PDF'in ilk sayfasından ve fotodan tek kare. DXF'ten üretilmez.
export type KareKaynagi = 'model' | 'pdf' | 'foto';
export function kareKaynagi(tur: DosyaTuru): KareKaynagi | null {
  if (tur === 'step' || tur === 'iges' || tur === 'stl' || tur === 'glb' || tur === 'gltf') return 'model';
  if (tur === 'pdf') return 'pdf';
  return tur === 'png' || tur === 'jpeg' || tur === 'webp' ? 'foto' : null;
}
export const onizlemeTuruMu = (tur: DosyaTuru): boolean => kareKaynagi(tur) !== null;

// Tek karede biçim sırası: çizim çizgisi PNG'de küçük kalır, foto WEBP ya da JPEG ister (PNG'de 64 KiB'ı aşar). Tarayıcı
// istenen biçimi yazamazsa PNG verir; o kare atlanır, sıradaki denenir.
export const TEK_KARE_BICIMLERI: Readonly<Record<'pdf' | 'foto', readonly string[]>> = {
  pdf: ['image/png', 'image/webp', 'image/jpeg'],
  foto: ['image/webp', 'image/jpeg'],
};
export const KARE_KALITESI = 0.8;

// Kaynağı kutuya oranını bozmadan sığdıran boyut; büyütmez.
export function sigdir(en: number, boy: number, kutu: number): { en: number; boy: number } {
  const oran = Math.min(1, kutu / Math.max(en, boy, 1));
  return { en: Math.max(1, Math.round(en * oran)), boy: Math.max(1, Math.round(boy * oran)) };
}

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
