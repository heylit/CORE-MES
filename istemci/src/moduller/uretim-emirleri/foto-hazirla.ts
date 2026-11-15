import { DosyaHatasi } from '../belge-merkezi/disari.ts';

// Sunucunun liste fotoğrafı sınırı (adim-durumu.ts FOTO_SINIRI); sunucu türü ve boyutu içerikten ayrıca denetler.
export const FOTO_AZAMI_BAYT = 10 * 1024 * 1024;
export const FOTO_TURLERI = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const FOTO_KABUL = FOTO_TURLERI.join(',');
// Telefon fotoğrafı büyük çözünürlüklüdür; uzun kenar bununla sınırlanır, kanıt için yeter ve 10 MB'ı aşmaz.
const AZAMI_KENAR = 4000;

const turMu = (t: string): t is (typeof FOTO_TURLERI)[number] => (FOTO_TURLERI as readonly string[]).includes(t);

// Fotoğraf tuvale yeniden çizilir: konum dahil EXIF bilgisi yeni dosyaya geçmez (3249-2 a, Risk K4). Yön resme uygulanır.
export async function fotografHazirla(dosya: File): Promise<{ veri: Uint8Array; ad: string }> {
  if (!turMu(dosya.type)) throw new DosyaHatasi('Yalnız PNG, JPEG ya da WEBP resim eklenir.');
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw new DosyaHatasi('Bu tarayıcı fotoğrafı hazırlayamadı.');
  const resim = await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  const oran = Math.min(1, AZAMI_KENAR / Math.max(resim.width, resim.height));
  const tuval = document.createElement('canvas');
  tuval.width = Math.max(1, Math.round(resim.width * oran));
  tuval.height = Math.max(1, Math.round(resim.height * oran));
  const ciz = tuval.getContext('2d');
  if (ciz === null) throw new DosyaHatasi('Bu tarayıcı fotoğrafı hazırlayamadı.');
  ciz.drawImage(resim, 0, 0, tuval.width, tuval.height);
  resim.close();
  const tur = dosya.type;
  const blob = await new Promise<Blob | null>((cozum) => { tuval.toBlob(cozum, tur, 0.9); });
  if (blob === null) throw new DosyaHatasi('Bu tarayıcı fotoğrafı hazırlayamadı.');
  if (blob.size > FOTO_AZAMI_BAYT) throw new DosyaHatasi("Dosya 10 MB'tan büyük. Daha küçük bir resim seçin.");
  return { veri: new Uint8Array(await blob.arrayBuffer()), ad: dosya.name.slice(-120) || 'fotograf' };
}
