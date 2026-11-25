import type { KmNumunePlani } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';

// 3689: Kalite Merkezi numune kuralının paket (`samp`) biçimine çevirisi. İstemci pakete alırken, sunucu paket yazılırken aynı dosyayı kullanır;
// böylece "plan Kalite Merkezi'nindir" kuralı iki tarafta aynı çeviriyle denetlenir.
export interface PaketNumuneKurali {
  id: string; when: 'first' | 'every' | 'time' | 'shift' | 'last'; n?: number; who: ('q' | 'op')[]; items: 'all' | 'crit' | number[]; gate?: boolean;
}
const ZAMAN = { ilk: 'first', her: 'every', sure: 'time', vardiya: 'shift', son: 'last' } as const;

export function kmNumuneKurallari(plan: Pick<KmNumunePlani, 'kurallar'>): PaketNumuneKurali[] {
  return plan.kurallar.map((k) => ({
    id: k.kimlik,
    when: ZAMAN[k.ne],
    ...(k.n === undefined ? {} : { n: k.n }),
    who: k.kim.map((w): 'q' | 'op' => (w === 'kalite' ? 'q' : 'op')),
    items: k.balonlar === 'hepsi' ? 'all' : k.balonlar === 'kritik' ? 'crit' : [...k.balonlar],
    ...(k.kapi === undefined ? {} : { gate: k.kapi }),
  }));
}

// Anahtar sırasından bağımsız karşılaştırma (JSON'dan dönen belgede anahtar sırası korunmaz).
function kanonik(d: unknown): string {
  if (Array.isArray(d)) return `[${d.map(kanonik).join(',')}]`;
  if (d !== null && typeof d === 'object') {
    return `{${Object.entries(d as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${kanonik(v)}`).join(',')}}`;
  }
  return JSON.stringify(d) ?? 'null';
}
const sampOku = (g: unknown): unknown => (g !== null && typeof g === 'object' ? (g as Record<string, unknown>)['samp'] ?? [] : []);
export function kmNumuneBagiSurumu(g: unknown): number | null {
  const b = g !== null && typeof g === 'object' ? (g as Record<string, unknown>)['kmNumune'] : undefined;
  const s = b !== null && typeof b === 'object' ? (b as Record<string, unknown>)['surum'] : undefined;
  return typeof s === 'number' ? s : null;
}

// Kalite Merkezi'ne bağlı pakette numune planı yalnız Kalite Merkezi planının çevirisiyle değişir: aynı sürümü bağlayıp `samp`'ı o çeviriye
// eşitleyen yazım geçer, öteki her `samp` ya da bağ değişikliği reddedilir. Bağsız paket (malzemesiz eski paket) etkilenmez.
export function kmNumuneDegisimiGerekli(yeni: unknown, eski: unknown): boolean {
  const yb = kmNumuneBagiSurumu(yeni), eb = kmNumuneBagiSurumu(eski);
  if (yb === null && eb === null) return false;
  return yb !== eb || kanonik(sampOku(yeni)) !== kanonik(sampOku(eski));
}
export function kmNumuneDegisimiGecerli(yeni: unknown, plan: Pick<KmNumunePlani, 'kurallar' | 'surum'> | null): boolean {
  const yb = kmNumuneBagiSurumu(yeni);
  return yb !== null && plan !== null && plan.surum === yb && kanonik(sampOku(yeni)) === kanonik(kmNumuneKurallari(plan));
}
