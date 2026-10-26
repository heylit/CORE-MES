import { saklanacak, type PdfKaydi, type SaklananPdfKaydi } from './bellek.ts';
import { AKTol } from './cekirdek.ts';
import { ayarImzasi, PDF_ANAHTARLARI, type OkumaAyari } from './kurallar.ts';
import { dosyaOzeti } from './model.ts';
import { bitAc, murekkep, olcuOnerileri, type OlcuListesi } from './okuma.ts';
import { pdfAc, pdfCiz, type PdfSayfasi } from './pdf.ts';

// PDF sayfasının okuması (çizim, metin katmanı, mürekkep, ölçü önerileri) bir kez hesaplanır. Görüntüleyici cihaz önbelleğine yazar;
// hazırlık yayında aynı kaydı pakete koyar, terminal sayfayı yeniden okumadan açar (731). Anahtar ve biçim cihaz önbelleğiyle aynıdır.

export const pdfKaydiAnahtari = (ozet: string, sayfa: number, ayar: OkumaAyari): string => 'pdf:' + ozet + '#' + sayfa + ayarImzasi(ayar, PDF_ANAHTARLARI);

export function sayfaKaydi(R: PdfSayfasi & { ms: number }, ayar: OkumaAyari, sifreli: boolean, tani = false): PdfKaydi {
  const ink = murekkep(R.img);
  const textless = R.items.length < 8 || R.junk, cls = AKTol.detectClass(R.items.map((o) => o.s).join(' '));
  const t1 = performance.now();
  const dims: OlcuListesi = textless ? [] : olcuOnerileri(R.items, cls, { w: R.w, h: R.h, ink, ex: ayar.ex, auto: ayar.auto, diag: tani });
  const tDims = performance.now() - t1;
  return {
    w: R.w, h: R.h, pages: R.pages, scale: R.scale, items: R.items, junk: R.junk, textless, cls, dims, ...(dims.stats ? { stats: dims.stats } : {}),
    ...(dims.diag ? { diag: dims.diag } : {}), ink, png: {}, enc: sifreli, ms: { render: Math.round(R.ms), dims: Math.round(tDims) },
  };
}

// Saklanmış kayıt (cihaz önbelleği ya da paket) açılır; biçimi tutmayan kayıt yok sayılır, sayfa yeniden okunur.
export function saklananiAc(c: unknown): PdfKaydi | null {
  const k = c as Partial<SaklananPdfKaydi> | null | undefined;
  if (!k || !(k.inkBits instanceof Uint8Array) || typeof k.w !== 'number' || typeof k.h !== 'number' || k.inkBits.length * 8 < k.w * k.h) return null;
  const { inkBits, ...geri } = k as SaklananPdfKaydi;
  return { ...geri, ink: bitAc(inkBits, k.w * k.h) };
}

// Hazırlık yayında: verilen PDF sayfasının okuması paket için. Şifreli PDF sorulmadan atlanır (şifre terminalde istenir); okunamayan
// sayfa hata vermez, boş döner: yayın hazır veri olmadan da yapılır, terminal sayfayı kendisi okur.
export async function pdfHazirla(bytes: Uint8Array, sayfa: number, ayar: OkumaAyari): Promise<Record<string, SaklananPdfKaydi>> {
  let pdf: Awaited<ReturnType<typeof pdfAc>> | null = null;
  try {
    pdf = await pdfAc(bytes, async () => null);
    const n = Math.min(Math.max(1, sayfa), pdf.numPages);
    const kayit = sayfaKaydi(await pdfCiz(pdf, n, ayar), ayar, false);
    // Renklendirilmiş görüntüler (Blob) pakete girmez; terminal kendi temasıyla çizer.
    return { [pdfKaydiAnahtari(await dosyaOzeti(bytes), n, ayar)]: { ...saklanacak(kayit), png: {} } };
  } catch {
    return {};
  } finally {
    void pdf?.loadingTask.destroy();
  }
}
