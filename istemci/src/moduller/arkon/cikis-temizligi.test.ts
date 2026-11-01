import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Arkon çıkışta yerel verisini siler (karar 102 a): gönderilmemiş kayıt kuyruğu ve kuyruğun işaret ettiği belgeler kalır.
// Gerçek veri katmanı (store.ts) sunucu kipinde; IndexedDB ve fetch sahte.
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
const TEMIZLIK_YOLU = '../../../../arkon/web/src/data/yerel-temizlik.ts';
interface Depo {
  init(): Promise<unknown>;
  kipKur(k: 'ortak' | 'kisisel'): Promise<void>;
  status(): { memory: boolean; kip: string | null };
  DB: { put(s: string, v: unknown, k?: string): Promise<void>; del(s: string, k: string): Promise<void> };
  Cache: { put(k: string, v: unknown): Promise<void> };
  Auth: { logout(): Promise<void>; login(id: string, pin: string): Promise<unknown> };
  local: { all(s: string): Promise<{ op?: unknown }[]>; get(s: string, k: string): Promise<unknown>; put(s: string, v: unknown, k?: string): Promise<unknown> };
}
interface Temizlik { yerelVeriyiTemizle(ls: Storage, idb: unknown): Promise<void>; bekleyenKuyrukVar(idb: unknown): Promise<boolean> }

type Anahtar = number | string;
interface SahteDepo { yol?: string; otomatik: boolean; sira: number; kayit: Map<Anahtar, unknown> }
const sirala = (a: Anahtar, b: Anahtar): number => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);

// Tek veritabanı ('arkon-mes'); çok depolu işlem, sürümsüz açılışta yoksa upgradeneeded + iptal.
function sahteIndexedDb() {
  class SahteIstek { result: unknown; error: unknown = null; transaction: { abort(): void } | null = null; onsuccess: (() => void) | null = null; onerror: (() => void) | null = null; onupgradeneeded: (() => void) | null = null }
  const depolar = new Map<string, SahteDepo>();
  let var_ = false;
  const vt = {
    get objectStoreNames() { return Object.assign([...depolar.keys()], { contains: (n: string) => depolar.has(n) }); },
    createObjectStore(n: string, ayar?: { keyPath?: string; autoIncrement?: boolean }) { depolar.set(n, { yol: ayar?.keyPath, otomatik: !!ayar?.autoIncrement, sira: 0, kayit: new Map() }); },
    close() {},
    transaction(adlar: string | string[]) {
      const liste = typeof adlar === 'string' ? [adlar] : adlar;
      let bekleyen = 0; let bitti = false;
      const islem = { oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, error: null, objectStore: (n: string) => nesne(n) };
      const kontrol = () => setTimeout(() => { if (bekleyen === 0 && !bitti) { bitti = true; islem.oncomplete?.(); } }, 0);
      const istek = (f: () => unknown): SahteIstek => { const r = new SahteIstek(); r.result = f(); bekleyen++; setTimeout(() => { r.onsuccess?.(); bekleyen--; kontrol(); }, 0); return r; };
      const nesne = (n: string) => {
        if (!liste.includes(n)) throw new Error('işlem kapsamı dışı depo: ' + n);
        const d = depolar.get(n)!;
        const yaz = (v: unknown, k?: Anahtar): Anahtar => {
          const a: Anahtar = k ?? (d.yol ? (v as Record<string, Anahtar>)[d.yol]! : ++d.sira);
          d.kayit.set(a, structuredClone(v)); return a;
        };
        const sirali = () => [...d.kayit.keys()].sort(sirala);
        return {
          get: (k: Anahtar) => istek(() => structuredClone(d.kayit.get(k))),
          getAll: () => istek(() => sirali().map((k) => structuredClone(d.kayit.get(k)))),
          getAllKeys: () => istek(() => sirali()),
          count: () => istek(() => d.kayit.size),
          put: (v: unknown, k?: Anahtar) => istek(() => yaz(v, k)),
          add: (v: unknown) => istek(() => yaz(v)),
          delete: (k: Anahtar) => istek(() => { d.kayit.delete(k); }),
          clear: () => istek(() => { d.kayit.clear(); }),
        };
      };
      kontrol();
      return islem;
    },
  };
  return {
    IDBRequest: SahteIstek,
    depolar,
    varMi: () => var_,
    hazirla(adlar: string[]) { var_ = true; adlar.forEach((n) => vt.createObjectStore(n, n === 'outbox' ? { autoIncrement: true } : undefined)); },
    indexedDB: {
      open(_ad: string, surum?: number) {
        const r = new SahteIstek(); r.result = vt;
        setTimeout(() => {
          let iptal = false;
          if (!var_) {
            r.transaction = { abort() { iptal = true; } };
            if (surum === undefined) { r.onupgradeneeded?.(); if (iptal) { r.error = new Error('AbortError'); r.onerror?.(); return; } }
            else r.onupgradeneeded?.();
            var_ = true;
          }
          r.onsuccess?.();
        }, 0);
        return r;
      },
    },
  };
}

let sunucuAcik = true;
let istekler: { yontem: string; yol: string; govde: unknown }[] = [];
let sahte: ReturnType<typeof sahteIndexedDb>;
function fetchKur(): void {
  istekler = [];
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string; body?: string }) => {
    if (!sunucuAcik) throw new TypeError('ağ yok');
    const url = new URL(girdi), yontem = ayar?.method ?? 'GET';
    istekler.push({ yontem, yol: url.pathname, govde: ayar?.body ? JSON.parse(ayar.body) : undefined });
    const don = (durum: number, govde: unknown): Response => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/health') return don(200, { app: 'arkon-mes' });
    if (url.pathname === '/api/me') return don(200, { id: '1', name: 'Ali', role: 'prep', wcs: [], active: true });
    if (url.pathname === '/api/logout') return don(200, { ok: true });
    if (url.pathname === '/api/login') return don(200, { token: 't2', user: { id: '1', name: 'Ali', role: 'prep', wcs: [] } });
    if (url.pathname.startsWith('/api/doc/pkgs/') && yontem === 'PUT') return don(200, { u: 1 });
    return don(404, null);
  }));
}

function yerelAyarKur(): void {
  localStorage.clear();
  const yaz = (k: string, v: unknown) => localStorage.setItem('arkon:' + k, JSON.stringify(v));
  yaz('server', 'http://sunucu.test');
  yaz('session', { token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'Ali', role: 'prep' } });
  yaz('theme', 'dark');
  yaz('station', 'CNC-1');
  yaz('opName', 'Ali Veli');
  yaz('lastUser', '1');
  yaz('usersCache', [{ id: '1', name: 'Ali' }]);
}
const ls = (k: string): unknown => JSON.parse(localStorage.getItem('arkon:' + k) ?? 'null');

beforeEach(() => {
  sunucuAcik = true;
  yerelAyarKur();
  sahte = sahteIndexedDb();
  vi.stubGlobal('indexedDB', sahte.indexedDB);
  vi.stubGlobal('IDBRequest', sahte.IDBRequest);
  fetchKur();
  vi.resetModules();
});
afterEach(async () => { await new Promise((r) => setTimeout(r, 30)); vi.unstubAllGlobals(); });

async function depo(kip?: 'ortak' | 'kisisel'): Promise<Depo> {
  const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
  if (kip) await AKStore.kipKur(kip);
  await AKStore.init();
  return AKStore;
}
async function temizlik(): Promise<Temizlik> { return (await import(/* @vite-ignore */ TEMIZLIK_YOLU)) as Temizlik; }

describe('Arkon çıkışında yerel veri temizliği', () => {
  it('çıkışta outbox dışındaki bütün depolar ve kişiye ait anahtarlar silinir; kuyruk ve kuyruğun belgesi kalır', async () => {
    const d = await depo();
    await d.DB.put('pkgs', { id: 'p2', no: 'eski' }); // sunucuya gitti, yalnız cihaz aynasında
    await d.Cache.put('k', 1);
    sunucuAcik = false;
    await d.DB.put('pkgs', { id: 'p1', no: 'gonderilmemis' }); // kuyrukta
    await d.DB.del('pkgs', 'p3'); // kuyrukta, belgesi yok

    await d.Auth.logout();

    expect((await d.local.all('outbox')).map((o) => o.op).sort()).toEqual(['del', 'put']);
    expect(await d.local.get('pkgs', 'p1')).toEqual({ id: 'p1', no: 'gonderilmemis' });
    expect(await d.local.get('pkgs', 'p2')).toBeUndefined();
    expect(await d.local.all('cache')).toEqual([]);
    for (const k of ['session', 'opName', 'lastUser', 'usersCache']) expect(ls(k)).toBeNull();
    expect(ls('server')).toBe('http://sunucu.test');
    expect(ls('theme')).toBe('dark');
    expect(ls('station')).toBe('CNC-1');
  });

  it('aynı kişi yeniden girince kuyruktaki kayıt temizlikten sağ çıkmış belgeyle sunucuya gider', async () => {
    const d = await depo();
    sunucuAcik = false;
    await d.DB.put('pkgs', { id: 'p1', no: 'gonderilmemis' });
    await d.Auth.logout();
    sunucuAcik = true;
    istekler = [];

    await d.Auth.login('1', '1234');
    await vi.waitFor(() => expect(istekler.some((i) => i.yontem === 'PUT' && i.yol === '/api/doc/pkgs/p1')).toBe(true));
    expect(istekler.find((i) => i.yol === '/api/doc/pkgs/p1')?.govde).toEqual({ id: 'p1', no: 'gonderilmemis' });
  });

  it('sunucusuz yerel kipte çıkış yerel kaydı silmez: orada kaydın tek kopyası cihazdadır', async () => {
    localStorage.removeItem('arkon:server');
    localStorage.removeItem('arkon:session');
    sunucuAcik = false; // sayfayı sunan adreste de Arkon sunucusu yok
    const d = await depo();
    await d.local.put('pkgs', { id: 'p9', no: 'yerel' });

    await d.Auth.logout();

    expect(await d.local.get('pkgs', 'p9')).toEqual({ id: 'p9', no: 'yerel' });
  });

  it('yeni eklenen depo da kapsanır; kuyruk öğesinin sürüm/taban kaydı da kalır', async () => {
    const { yerelVeriyiTemizle } = await temizlik();
    sahte.hazirla(['outbox', 'pkgs', 'kv', 'surumler', 'yeni_depo']);
    const yaz = (n: string, k: Anahtar, v: unknown) => sahte.depolar.get(n)!.kayit.set(k, v);
    yaz('outbox', 1, { op: 'put', store: 'pkgs', id: 'p1', uid: '7' });
    yaz('outbox', 2, { op: 'put', store: 'kv', id: 'ayar', uid: '7' });
    yaz('pkgs', 'p1', { id: 'p1' }); yaz('pkgs', 'p2', { id: 'p2' });
    yaz('kv', 'ayar', { a: 1 }); yaz('kv', 'users', []);
    yaz('surumler', 'pkgs\u0000p1', { u: 3 }); yaz('surumler', 'pkgs\u0000p2', { u: 4 });
    yaz('yeni_depo', 'x', 1);

    await yerelVeriyiTemizle(localStorage, sahte.indexedDB);

    const anahtarlar = (n: string) => [...sahte.depolar.get(n)!.kayit.keys()];
    expect(anahtarlar('outbox')).toEqual([1, 2]);
    expect(anahtarlar('pkgs')).toEqual(['p1']);
    expect(anahtarlar('kv')).toEqual(['ayar']);
    expect(anahtarlar('surumler')).toEqual(['pkgs\u0000p1']);
    expect(anahtarlar('yeni_depo')).toEqual([]);
  });

  it('veritabanı hiç yoksa hata vermez ve boş veritabanı yaratmaz; yerel ayar yine temizlenir', async () => {
    const { yerelVeriyiTemizle } = await temizlik();
    await expect(yerelVeriyiTemizle(localStorage, sahte.indexedDB)).resolves.toBeUndefined();
    expect(sahte.varMi()).toBe(false);
    expect(ls('opName')).toBeNull();
  });
});

describe('Cihaz kipine göre yerel veri (karar 738 a, kart #739)', () => {
  it('ortak cihazda çıkış çizim dosyalarını ve ekran önbelleğini bırakır; kişiye ait veri yine silinir', async () => {
    const d = await depo('ortak');
    await d.local.put('blobs', new Uint8Array([1, 2]), 'h1');
    await d.local.put('blobzaman', { at: 1, n: 2 }, 'h1');
    await d.Cache.put('k', 1);
    await d.DB.put('pkgs', { id: 'p2', no: 'eski' });

    await d.Auth.logout();

    expect(Array.from(await d.local.get('blobs', 'h1') as Uint8Array)).toEqual([1, 2]);
    expect(await d.local.get('blobzaman', 'h1')).toEqual({ at: 1, n: 2 });
    expect((await d.local.all('cache')).length).toBe(1);
    expect(await d.local.get('pkgs', 'p2')).toBeUndefined();
    expect(ls('session')).toBeNull();
    expect(d.status()).toMatchObject({ kip: 'ortak', memory: false });
  });

  it('kişisel cihaz açılışta önceki veriyi (dosyalar dahil) siler ve bellekte çalışır; cihaz deposuna yazmaz', async () => {
    sahte.hazirla(['outbox', 'pkgs', 'blobs', 'blobzaman', 'cache', 'kv']);
    sahte.depolar.get('blobs')!.kayit.set('h1', new Uint8Array([1]));
    sahte.depolar.get('cache')!.kayit.set('k', { v: 1, at: 1 });
    sahte.depolar.get('pkgs')!.kayit.set('p1', { id: 'p1' });

    const d = await depo('kisisel');
    await d.DB.put('pkgs', { id: 'p3', no: 'yeni' });
    await d.Cache.put('k2', 1);

    expect(d.status()).toMatchObject({ kip: 'kisisel', memory: true });
    for (const n of ['blobs', 'cache', 'pkgs']) expect([...sahte.depolar.get(n)!.kayit.keys()]).toEqual([]);
    expect(ls('server')).toBe('http://sunucu.test');
    expect(ls('opName')).toBeNull();
  });

  it('gönderilmemiş kaydı olan kişisel cihaz o oturumda cihaz deposunu açık tutar; kayıt sunucuya gider', async () => {
    sahte.hazirla(['outbox', 'pkgs', 'blobs']);
    sahte.depolar.get('outbox')!.kayit.set(1, { op: 'put', store: 'pkgs', id: 'p1', uid: '1' });
    sahte.depolar.get('pkgs')!.kayit.set('p1', { id: 'p1', no: 'gonderilmemis' });
    sahte.depolar.get('blobs')!.kayit.set('h1', new Uint8Array([1]));

    const d = await depo('kisisel');

    expect(d.status()).toMatchObject({ kip: 'kisisel', memory: false });
    expect([...sahte.depolar.get('blobs')!.kayit.keys()]).toEqual([]);
    await vi.waitFor(() => expect(istekler.some((i) => i.yontem === 'PUT' && i.yol === '/api/doc/pkgs/p1')).toBe(true));
  });

  it('kuyruk sorusu veritabanı yoksa onu yaratmaz', async () => {
    const { bekleyenKuyrukVar } = await temizlik();
    expect(await bekleyenKuyrukVar(sahte.indexedDB)).toBe(false);
    expect(sahte.varMi()).toBe(false);
    sahte.hazirla(['outbox']);
    expect(await bekleyenKuyrukVar(sahte.indexedDB)).toBe(false);
    sahte.depolar.get('outbox')!.kayit.set(1, { op: 'put', store: 'pkgs', id: 'p1' });
    expect(await bekleyenKuyrukVar(sahte.indexedDB)).toBe(true);
  });
});
