import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// CI günlüğünün başı (kırmızı testin adı) GitHub dışından okunamıyor; uyarı satırı (annotation) ise API'den okunur.
// Bu raporcu yalnız kırmızı yaprak testi `::error` satırı olarak basar; asıl çıktı spec raporcusunda kalır.

interface Hata { message?: unknown; code?: unknown; cause?: unknown; stack?: unknown }
interface KirmiziVeri { name: string; file?: string; line?: number; details: { error?: Hata; type?: string } }
type Olay = { type: string; data: unknown };

const KOK = fileURLToPath(new URL('../', import.meta.url));

// GitHub iş akışı komutu kuralı: veri içindeki %, \r, \n kodlanır; özellik değerinde ayrıca : ve , kodlanır.
export function veriKodla(metin: string): string {
  return metin.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}
function ozellikKodla(metin: string): string {
  return veriKodla(metin).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

// node:test asıl hatayı ERR_TEST_FAILURE içinde `cause` olarak taşır.
function asilHata(hata: Hata | undefined): Hata | undefined {
  if (hata !== undefined && hata.code === 'ERR_TEST_FAILURE' && typeof hata.cause === 'object' && hata.cause !== null) return hata.cause as Hata;
  return hata;
}

export function hataSatiri(veri: KirmiziVeri): string | null {
  // Takım kırmızısı altındaki testin tekrarıdır; adı yaprakta görünür.
  if (veri.details.type === 'suite') return null;
  const hata = asilHata(veri.details.error);
  const ileti = typeof hata?.message === 'string' ? hata.message : String(hata?.message ?? 'bilinmeyen hata');
  const yigin = typeof hata?.stack === 'string' ? hata.stack.split('\n').slice(1, 6).join('\n') : '';
  const dosya = veri.file === undefined ? undefined : relative(KOK, veri.file.startsWith('file:') ? fileURLToPath(veri.file) : veri.file);
  const ozellikler = [
    ...(dosya === undefined ? [] : [`file=${ozellikKodla(dosya)}`]),
    ...(veri.line === undefined ? [] : [`line=${veri.line}`]),
    `title=${ozellikKodla(veri.name.slice(0, 200))}`,
  ];
  const govde = `${veri.name}\n${ileti.slice(0, 2000)}${yigin === '' ? '' : `\n${yigin}`}`;
  return `::error ${ozellikler.join(',')}::${veriKodla(govde)}\n`;
}

export default async function* raporla(olaylar: AsyncIterable<Olay>): AsyncGenerator<string> {
  for await (const olay of olaylar) {
    if (olay.type !== 'test:fail') continue;
    const satir = hataSatiri(olay.data as KirmiziVeri);
    if (satir !== null) yield satir;
  }
}
