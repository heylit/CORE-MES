import { useEffect, useState } from 'react';
import type { ArkonDeposu } from './depo.ts';

// Tembel kipte (store.ts, kart #731) paket belgesindeki dosya baytı yerine `{ $blob, t, n }` işareti gelir. Liste dosyasız gelir;
// açılan paketin dosyaları `useCozulmus` ile baytlanır, öteki paketlerin dosyası bellekte durmaz.

export interface DosyaIsareti { $blob: string; t?: string; n?: number }

export const dosyaIsaretiMi = (x: unknown): x is DosyaIsareti =>
  !!x && typeof x === 'object' && !ArrayBuffer.isView(x) && typeof (x as { $blob?: unknown }).$blob === 'string';

// Baytı gelmiş dosya (işaret değil): görüntüleyici yalnız bunu açar.
export const baytiVar = (x: unknown): x is Uint8Array => x instanceof Uint8Array;

// Dosya boyu: bayt varsa onun, işaretliyse işaretteki, yoksa kayıttaki boy.
export function dosyaBoyu(f: { bytes?: unknown; size?: number }): number {
  if (ArrayBuffer.isView(f.bytes)) return f.bytes.byteLength;
  if (dosyaIsaretiMi(f.bytes) && typeof f.bytes.n === 'number') return f.bytes.n;
  return f.size || 0;
}

// Değer, anahtar değişince bir kez çözülür (dosyalar iner ya da cihazdan okunur); çözülene kadar null döner. Çözülemezse (çevrimdışı ve
// cihazda yok) değer olduğu gibi döner: baytı olmayan dosya görüntüleyicide atlanır.
export function useCozulmus<T>(depo: Pick<ArkonDeposu, 'coz'>, deger: T | null | undefined, anahtar: string): T | null {
  const [cozulen, cozulenYaz] = useState<{ anahtar: string; deger: T } | null>(null);
  useEffect(() => {
    if (deger === null || deger === undefined) return undefined;
    let canli = true;
    depo.coz(deger).then((d) => { if (canli) cozulenYaz({ anahtar, deger: d }); }, () => { if (canli) cozulenYaz({ anahtar, deger }); });
    return () => { canli = false; };
    // Yalnız anahtar değişince: aynı paketteki başka alan değişikliği dosyaları yeniden çözdürmez.
  }, [depo, anahtar]);
  return cozulen && cozulen.anahtar === anahtar && deger !== null && deger !== undefined ? cozulen.deger : null;
}

// ADR 0032: sunucunun hazırladığı PDF sayfa görüntüsü. Dosyanın blob özeti baytlardan bir kez hesaplanır; görüntü yoksa (henüz
// hazırlanmadı, imza tutmadı, yetki ya da ağ yok) null döner ve görüntüleyici sayfayı bu cihazda çizer.
const BLOB_OZETLERI = new WeakMap<Uint8Array, Promise<string>>();
export async function hazirPdfGoruntusu(
  depo: Pick<ArkonDeposu, 'sha256' | 'status'>, oku: (yol: string) => Promise<Uint8Array>, pdf: Uint8Array, sayfa: number, imza: string,
): Promise<Blob | null> {
  if (depo.status().mode !== 'server') return null;
  let ozet = BLOB_OZETLERI.get(pdf);
  if (ozet === undefined) { ozet = depo.sha256(pdf); BLOB_OZETLERI.set(pdf, ozet); }
  try {
    const sorgu = new URLSearchParams({ sayfa: String(sayfa), imza });
    const u = await oku(`/arkon/dosyalar/${await ozet}/goruntu?${sorgu.toString()}`);
    return u.length > 0 ? new Blob([u as Uint8Array<ArrayBuffer>], { type: 'image/png' }) : null;
  } catch {
    return null;
  }
}
