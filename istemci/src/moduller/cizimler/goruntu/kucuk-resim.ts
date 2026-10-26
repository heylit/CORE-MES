import { COZUNURLUKLER, KARE_BAYT_SINIRI, KARE_KALITESI, OnizlemeAtlandi, TEK_KARE_BICIMLERI, sigdir } from '../onizleme-kurallari.ts';
import { pdfAc } from './pdf.ts';

// PDF'in ilk sayfasından ya da fotodan tek küçük resim karesi (kart #688). Hepsi bu cihazda çizilir; dışarıya istek yoktur.

function blobYap(tuval: HTMLCanvasElement, tur: string): Promise<Blob | null> {
  return new Promise((coz) => { tuval.toBlob(coz, tur, KARE_KALITESI); });
}

// Çözünürlük ve biçim sırasıyla dener; sınırı tutturan ilk kare döner.
async function sinirdaKare(ciz: (kutu: number) => Promise<HTMLCanvasElement>, bicimler: readonly string[]): Promise<Uint8Array> {
  for (const kutu of COZUNURLUKLER) {
    const tuval = await ciz(kutu);
    for (const tur of bicimler) {
      const b = await blobYap(tuval, tur);
      if (b !== null && b.type === tur && b.size <= KARE_BAYT_SINIRI) return new Uint8Array(await b.arrayBuffer());
    }
  }
  throw new OnizlemeAtlandi('Küçük resim 64 KiB sınırına sığmadı; üretilmedi.');
}

function tuvalAc(en: number, boy: number): { tuval: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const tuval = document.createElement('canvas');
  tuval.width = en;
  tuval.height = boy;
  const ctx = tuval.getContext('2d');
  if (ctx === null) throw new OnizlemeAtlandi('Bu cihazda çizim yüzeyi açılamadı; küçük resim üretilmedi.');
  return { tuval, ctx };
}

export async function pdfKaresi(veri: Uint8Array): Promise<Uint8Array> {
  let belge;
  try {
    belge = await pdfAc(veri);
  } catch {
    throw new OnizlemeAtlandi('PDF okunamadı; küçük resim üretilmedi.');
  }
  try {
    const sayfa = await belge.getPage(1);
    const birim = sayfa.getViewport({ scale: 1 });
    return await sinirdaKare(async (kutu) => {
      const { en, boy } = sigdir(birim.width, birim.height, kutu);
      const { tuval } = tuvalAc(en, boy);
      await sayfa.render({ canvas: tuval, viewport: sayfa.getViewport({ scale: en / birim.width }) }).promise;
      return tuval;
    }, TEK_KARE_BICIMLERI.pdf);
  } finally {
    void belge.loadingTask.destroy();
  }
}

export async function fotoKaresi(veri: Uint8Array): Promise<Uint8Array> {
  let resim: ImageBitmap;
  try {
    resim = await createImageBitmap(new Blob([new Uint8Array(veri)]));
  } catch {
    throw new OnizlemeAtlandi('Fotoğraf okunamadı; küçük resim üretilmedi.');
  }
  try {
    return await sinirdaKare(async (kutu) => {
      const { en, boy } = sigdir(resim.width, resim.height, kutu);
      const { tuval, ctx } = tuvalAc(en, boy);
      ctx.drawImage(resim, 0, 0, en, boy);
      return tuval;
    }, TEK_KARE_BICIMLERI.foto);
  } finally {
    resim.close();
  }
}
