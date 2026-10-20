import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Karar 103 a: tablette başka kişinin gönderilmemiş kaydı varsa yönetici ve amir girince bilgi gösterilir.
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
const YARDIMCI_YOLU = '../../../../arkon/web/src/data/bekleyen-kayit.ts';
interface Durum { pending: number; baskasi: number }
interface Depo { init(): Promise<unknown>; status(): Durum; local: { add(s: string, v: unknown): Promise<unknown> } }
interface Yardimci {
  baskasininKayitSayisi(sahipler: readonly (string | undefined)[], kisiId: string | null | undefined): number;
  bekleyenKayitIletisi(rol: string | undefined, sayi: number): string | null;
}

type Anahtar = number | string;
interface SahteDepo { yol?: string; otomatik: boolean; sira: number; kayit: Map<Anahtar, unknown> }
const sirala = (a: Anahtar, b: Anahtar): number => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);

// store.ts'nin kullandığı kadarı: open + onupgradeneeded, tek depolu işlem, get/getAll/getAllKeys/put/add/delete/clear.
function sahteIndexedDb(): { indexedDB: unknown; IDBRequest: unknown } {
  class SahteIstek { result: unknown; onsuccess: (() => void) | null = null; onerror: (() => void) | null = null; onupgradeneeded: (() => void) | null = null }
  const depolar = new Map<string, SahteDepo>();
  const vt = {
    objectStoreNames: { contains: (n: string) => depolar.has(n) },
    createObjectStore(n: string, ayar?: { keyPath?: string; autoIncrement?: boolean }) { depolar.set(n, { yol: ayar?.keyPath, otomatik: !!ayar?.autoIncrement, sira: 0, kayit: new Map() }); },
    transaction(n: string) {
      const d = depolar.get(n)!;
      const islem = { oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, error: null, objectStore: () => nesne };
      const istek = (f: () => unknown): SahteIstek => { const r = new SahteIstek(); r.result = f(); return r; };
      const yaz = (v: unknown, k?: Anahtar): Anahtar => {
        const a: Anahtar = k ?? (d.yol ? (v as Record<string, Anahtar>)[d.yol]! : ++d.sira);
        d.kayit.set(a, structuredClone(v)); return a;
      };
      const sirali = () => [...d.kayit.keys()].sort(sirala);
      const nesne = {
        get: (k: Anahtar) => istek(() => structuredClone(d.kayit.get(k))),
        getAll: () => istek(() => sirali().map((k) => structuredClone(d.kayit.get(k)))),
        getAllKeys: () => istek(() => sirali()),
        put: (v: unknown, k?: Anahtar) => istek(() => yaz(v, k)),
        add: (v: unknown) => istek(() => yaz(v)),
        delete: (k: Anahtar) => istek(() => { d.kayit.delete(k); }),
        clear: () => istek(() => { d.kayit.clear(); }),
      };
      setTimeout(() => islem.oncomplete?.(), 0);
      return islem;
    },
  };
  return {
    IDBRequest: SahteIstek,
    indexedDB: { open() { const r = new SahteIstek(); r.result = vt; setTimeout(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }, 0); return r; } },
  };
}

let istekler: { yontem: string; yol: string }[] = [];
beforeEach(() => {
  istekler = [];
  localStorage.clear();
  localStorage.setItem('arkon:server', JSON.stringify('http://sunucu.test'));
  localStorage.setItem('arkon:session', JSON.stringify({ token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'Amir', role: 'lead' } }));
  const s = sahteIndexedDb();
  vi.stubGlobal('indexedDB', s.indexedDB);
  vi.stubGlobal('IDBRequest', s.IDBRequest);
  // sunucu yanıt vermez: kuyruk gönderilemez, bekleyenler kuyrukta kalır
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string }) => {
    const url = new URL(girdi); istekler.push({ yontem: ayar?.method ?? 'GET', yol: url.pathname });
    throw new TypeError('ağ yok');
  }));
  vi.resetModules();
});
afterEach(async () => { await new Promise((r) => setTimeout(r, 30)); vi.unstubAllGlobals(); });

describe('Arkon: başkasının gönderilmemiş kaydı sayımı', () => {
  it('yalnız başka kişinin sahipli öğeleri sayılır; kendi ve sahipsiz öğe sayılmaz', async () => {
    const { baskasininKayitSayisi } = (await import(/* @vite-ignore */ YARDIMCI_YOLU)) as Yardimci;
    expect(baskasininKayitSayisi(['2', '2', '3', '1', undefined], '1')).toBe(3);
    expect(baskasininKayitSayisi([], '1')).toBe(0);
    expect(baskasininKayitSayisi([undefined], '1')).toBe(0);
  });
  it('oturum yokken hepsi başkasınındır', async () => {
    const { baskasininKayitSayisi } = (await import(/* @vite-ignore */ YARDIMCI_YOLU)) as Yardimci;
    expect(baskasininKayitSayisi(['2', undefined], null)).toBe(1);
  });
  it('bilgi yalnız yönetici ve amire, sayı sıfırdan büyükse çıkar', async () => {
    const { bekleyenKayitIletisi } = (await import(/* @vite-ignore */ YARDIMCI_YOLU)) as Yardimci;
    expect(bekleyenKayitIletisi('admin', 3)).toBe('Bu tablette 3 gönderilmemiş kayıt var');
    expect(bekleyenKayitIletisi('lead', 1)).toBe('Bu tablette 1 gönderilmemiş kayıt var');
    for (const rol of ['operator', 'quality', 'maint', 'prep', 'plan', undefined]) expect(bekleyenKayitIletisi(rol, 3)).toBeNull();
    expect(bekleyenKayitIletisi('admin', 0)).toBeNull();
  });
});

describe('Arkon veri katmanı durumu', () => {
  it('status().baskasi: kuyruktaki başka kişinin öğeleri sayılır, oturum sahibinin kendi öğesi sayılmaz; hiçbiri gönderilmez', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', { op: 'put', store: 'pkgs', id: 'p1', uid: '2', at: 1 });
    await AKStore.local.add('outbox', { op: 'del', store: 'pkgs', id: 'p2', uid: '3', at: 2 });
    await AKStore.local.add('outbox', { op: 'del', store: 'pkgs', id: 'p3', uid: '1', at: 3 });
    await AKStore.init();

    expect(AKStore.status().pending).toBe(3);
    expect(AKStore.status().baskasi).toBe(2);
    expect(istekler.some((i) => i.yontem === 'PUT' && i.yol === '/api/doc/pkgs/p1')).toBe(false);
  });
});
