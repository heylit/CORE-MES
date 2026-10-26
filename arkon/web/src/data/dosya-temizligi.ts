// Tabletteki dosya deposu (IndexedDB 'blobs') temizliği (kart #731, karar 726 a). Dosyalar arka planda indirildiği için depo kendiliğinden
// büyür: hiçbir belgenin anmadığı dosya silinir; toplam sınırı aşarsa en uzun süredir açılmayan silinir. Açık iş ve kuyruktaki işlerin
// dosyası hiçbir durumda silinmez. Silinen dosya gerekirse sunucudan yeniden iner.

/** Tablette tutulan dosyaların toplam sınırı (bayt). */
export const DOSYA_DEPO_SINIRI = 2 * 1024 ** 3;

export interface DepodakiDosya { h: string; at: number; n: number }

/** Belgede `{ $blob: özet }` biçiminde anılan dosya özetleri (kablo biçimi ya da tembel kipteki işaret). */
export function anilanOzetler(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (!x || typeof x !== 'object' || ArrayBuffer.isView(x)) return out;
  if (Array.isArray(x)) { for (const v of x) anilanOzetler(v, out); return out; }
  const o = x as Record<string, unknown>;
  if (typeof o.$blob === 'string') { out.add(o.$blob); return out; }
  for (const k in o) anilanOzetler(o[k], out);
  return out;
}

export function silinecekDosyalar(dosyalar: readonly DepodakiDosya[], anilan: ReadonlySet<string>, korunan: ReadonlySet<string>, sinir = DOSYA_DEPO_SINIRI): string[] {
  const sil: string[] = [], kalan: DepodakiDosya[] = [];
  for (const d of dosyalar) {
    if (korunan.has(d.h)) continue;
    if (!anilan.has(d.h)) sil.push(d.h); else kalan.push(d);
  }
  const silinen = new Set(sil);
  let toplam = dosyalar.filter((d) => !silinen.has(d.h)).reduce((t, d) => t + d.n, 0);
  for (const d of [...kalan].sort((a, b) => a.at - b.at)) {
    if (toplam <= sinir) break;
    sil.push(d.h); toplam -= d.n;
  }
  return sil;
}
