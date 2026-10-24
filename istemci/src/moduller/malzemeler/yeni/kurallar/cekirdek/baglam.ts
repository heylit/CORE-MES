import * as C from './hepsi.ts';
import { iletileriBagla } from './ortam.ts';

// Çekirdek tek durumla çalışır (prototipteki gibi modül düzeyinde taslak, ayar ve tablolar). Bağlam değişince durum ilk hâline döner
// ve yeni bağlamın başlangıcı çalışır; böylece her bağlam prototipin taze bir sayfasıyla aynı sonucu verir.
type Kayit = Record<string | number, unknown>;

export function derinKopya<T>(x: T, gorulen = new Map<unknown, unknown>()): T {
  if (x === null || typeof x !== 'object') return x;
  if (gorulen.has(x)) return gorulen.get(x) as T;
  if (x instanceof Date) return new Date(x.getTime()) as T;
  if (x instanceof RegExp) return x;
  if (x instanceof Set) { const s = new Set(); gorulen.set(x, s); for (const v of x) s.add(derinKopya(v, gorulen)); return s as T; }
  if (x instanceof Map) { const m = new Map(); gorulen.set(x, m); for (const [k, v] of x) m.set(k, derinKopya(v, gorulen)); return m as T; }
  const y: Kayit = Array.isArray(x) ? ([] as unknown as Kayit) : Object.create(Object.getPrototypeOf(x) as object) as Kayit;
  gorulen.set(x, y);
  for (const k of Object.keys(x)) y[k] = derinKopya((x as Kayit)[k], gorulen);
  return y as T;
}

function yerinde(hedef: object, kaynak: object, gorulen: Set<object>): void {
  if (gorulen.has(hedef)) return;
  gorulen.add(hedef);
  if (hedef instanceof Set && kaynak instanceof Set) { hedef.clear(); for (const v of kaynak) hedef.add(derinKopya(v)); return; }
  if (hedef instanceof Map && kaynak instanceof Map) { hedef.clear(); for (const [k, v] of kaynak) hedef.set(k, derinKopya(v)); return; }
  const h = hedef as Kayit; const k = kaynak as Kayit;
  if (Array.isArray(h)) h.length = (k as unknown as unknown[]).length;
  for (const a of Object.keys(h)) if (!(a in k)) delete h[a];
  for (const a of Object.keys(k)) {
    const hv = h[a]; const kv = k[a];
    if (hv && kv && typeof hv === 'object' && typeof kv === 'object' && Array.isArray(hv) === Array.isArray(kv) && Object.getPrototypeOf(hv) === Object.getPrototypeOf(kv)) yerinde(hv, kv, gorulen);
    else h[a] = derinKopya(kv);
  }
}

const ns = C as unknown as Kayit;
const ilk = derinKopya(Object.fromEntries([...C.SABIT_NESNELER, ...C.DEGISKENLER].map((a) => [a, ns[a]])));
let aktif: object | null = null;

export interface BaslatGirdisi { hazir: Kayit; birim: string; kartlar: unknown[]; sablonlar: unknown[]; kaldirabilir: unknown; iletiler?: string[] }

function ilkHaleDon(): void {
  const gorulen = new Set<object>();
  for (const a of C.SABIT_NESNELER) { const h = ns[a]; const k = ilk[a]; if (h && typeof h === 'object' && k && typeof k === 'object') yerinde(h, k, gorulen); }
  for (const a of C.DEGISKENLER) (ns[`ayarla_${a}`] as (v: unknown) => unknown)(derinKopya(ilk[a]));
}

// anahtar: bağlam nesnesi (aynı anahtarla gelen çağrı durumu yeniden kurmaz).
export function cekirdekSec(anahtar: object, girdi: BaslatGirdisi): typeof C {
  if (aktif !== anahtar) {
    ilkHaleDon();
    iletileriBagla(girdi.iletiler);
    C.baslat(derinKopya(girdi));
    aktif = anahtar;
  }
  return C;
}
