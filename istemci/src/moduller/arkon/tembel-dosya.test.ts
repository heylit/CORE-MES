import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Kart #731 (karar 726 a): yeni ekranın tembel kipi. Paket listesi dosyasız gelir, dosya açılınca iner; arka plan indirmesi ayrı uçtan
// cihaza yazar; temizlik anılmayan dosyayı siler. Gerçek store.ts; IndexedDB ve fetch sahte (surum-kaybi.test.ts'deki gibi).
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
interface Depo {
  init(): Promise<unknown>; tembelKur(): void; coz<T>(x: T): Promise<T>; dosyalariIndir(o: readonly unknown[], d?: readonly unknown[]): void;
  dosyaDeposunuTemizle(): Promise<string[]>;
  DB: { all(s: string): Promise<any[]>; get(s: string, k: string): Promise<any>; put(s: string, v: unknown): Promise<void> };
  local: { all(s: string): Promise<unknown[]>; keys(s: string): Promise<unknown[]>; get(s: string, k: string): Promise<any>; put(s: string, v: unknown, k?: string): Promise<unknown> };
}

type Anahtar = number | string;
interface SahteDepo { yol?: string; otomatik: boolean; sira: number; kayit: Map<Anahtar, unknown> }
const sirala = (a: Anahtar, b: Anahtar): number => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === 'number' ? -1 : 1);

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

const BOY = 20000;
const dosya = (tohum: number): Uint8Array => new Uint8Array(BOY).map((_, i) => (i * tohum) % 251);
const SUNUCU_DOSYALARI: Record<string, Uint8Array> = { h1: dosya(3), h2: dosya(7), h3: dosya(11) };
const isaret = (h: string) => ({ $blob: h, t: 'u8', n: BOY });
const paket = (id: string, h: string) => ({ id, no: 'UE-' + id, files: [{ name: id + '.pdf', kind: 'pdf', bytes: isaret(h) }] });

let sunucuAcik = true;
let istenenler: string[] = [];
let yazilanlar: Record<string, unknown>[] = [];
function fetchKur(): void {
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string; body?: string }) => {
    if (!sunucuAcik) throw new TypeError('ağ yok');
    const url = new URL(girdi), yontem = ayar?.method ?? 'GET';
    istenenler.push(yontem + ' ' + url.pathname);
    const don = (durum: number, govde: unknown): Response => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/health') return don(200, { app: 'arkon-mes' });
    if (url.pathname === '/api/me') return don(200, { id: '1', name: 'Ali', role: 'operator', wcs: [], active: true });
    if (url.pathname === '/api/doc/pkgs' && yontem === 'GET') return don(200, [{ id: 'p1', u: 1, d: paket('p1', 'h1') }, { id: 'p2', u: 1, d: paket('p2', 'h2') }]);
    if (url.pathname === '/api/doc/pkgs/p1' && yontem === 'PUT') { yazilanlar.push(JSON.parse(ayar!.body!)); return don(200, { u: 2 }); }
    const b = /^\/api\/blob\/(\w+)(\/arka)?$/.exec(url.pathname);
    if (b && yontem === 'GET') { const u = SUNUCU_DOSYALARI[b[1]!]; return u ? new Response(u.slice(), { status: 200 }) : don(404, { error: 'yok' }); }
    return don(404, null);
  }));
}

async function ac(tembel: boolean): Promise<Depo> {
  vi.resetModules();
  const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
  if (tembel) AKStore.tembelKur();
  await AKStore.init();
  return AKStore;
}

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  localStorage.setItem('arkon:server', JSON.stringify('http://sunucu.test'));
  localStorage.setItem('arkon:session', JSON.stringify({ token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'Ali', role: 'operator' } }));
  const s = sahteIndexedDb();
  vi.stubGlobal('indexedDB', s.indexedDB);
  vi.stubGlobal('IDBRequest', s.IDBRequest);
  sunucuAcik = true; istenenler = []; yazilanlar = [];
  fetchKur();
});
// Önceki açılışın gecikmeli kuyruk gönderimi sahte depo kalkmadan bitsin.
afterEach(async () => { await new Promise((r) => setTimeout(r, 120)); vi.unstubAllGlobals(); });

const dosyaIstekleri = () => istenenler.filter((x) => x.includes('/api/blob/'));

describe('Arkon tembel kip: paket listesi dosyasız gelir', () => {
  it('liste dosya indirmeden gelir; dosya `coz` ile açılınca iner, ikinci açılış bellekten', async () => {
    const d = await ac(true);
    const liste = await d.DB.all('pkgs');
    expect(liste.map((p) => p.files[0].bytes)).toEqual([isaret('h1'), isaret('h2')]);
    expect(dosyaIstekleri()).toEqual([]);
    const acik = await d.coz(liste[0]);
    expect(acik.files[0].bytes).toEqual(SUNUCU_DOSYALARI.h1);
    expect(dosyaIstekleri()).toEqual(['GET /api/blob/h1']);
    await d.coz(liste[0]);
    expect(dosyaIstekleri()).toEqual(['GET /api/blob/h1']);
  });

  it('işaretli belge yazılınca işaret aynen geri gider: dosya yeniden yüklenmez', async () => {
    const d = await ac(true);
    const [p1] = await d.DB.all('pkgs');
    await d.DB.put('pkgs', { ...p1, no: 'UE-p1-yeni' });
    expect(yazilanlar).toEqual([{ ...paket('p1', 'h1'), no: 'UE-p1-yeni' }]);
    expect(istenenler.filter((x) => x.startsWith('PUT /api/blob') || x.startsWith('POST /api/blob'))).toEqual([]);
  });

  it('arka plan indirmesi ayrı uçtan cihaza yazar; sonra açılış ağa çıkmaz', async () => {
    const d = await ac(true);
    const liste = await d.DB.all('pkgs');
    d.dosyalariIndir([liste[1]], [liste[0]]);
    await vi.waitFor(async () => expect(await d.local.keys('blobs')).toEqual(['h1', 'h2']), { timeout: 3000 });
    expect(dosyaIstekleri()).toEqual(['GET /api/blob/h2/arka', 'GET /api/blob/h1/arka']);
    // uygulama yeniden açıldı (bellek boş), ağ yok: dosya cihazdan açılır
    sunucuAcik = false;
    const yeniden = await ac(true);
    expect((await yeniden.coz(liste[0])).files[0].bytes).toEqual(SUNUCU_DOSYALARI.h1);
    expect(dosyaIstekleri()).toEqual(['GET /api/blob/h2/arka', 'GET /api/blob/h1/arka']);
  });

  it('temizlik: hiçbir belgenin anmadığı dosya silinir, anılan ve öncelikli olan kalır', async () => {
    const d = await ac(true);
    const liste = await d.DB.all('pkgs');
    await d.local.put('blobs', SUNUCU_DOSYALARI.h3, 'h3');
    d.dosyalariIndir([liste[0]], [liste[1]]);
    await vi.waitFor(async () => expect(await d.local.keys('blobs')).toEqual(['h1', 'h2', 'h3']), { timeout: 3000 });
    expect(await d.dosyaDeposunuTemizle()).toEqual(['h3']);
    expect(await d.local.keys('blobs')).toEqual(['h1', 'h2']);
    expect(await d.local.keys('blobzaman')).toEqual(['h1', 'h2']);
  });
});

describe('Arkon eski çerçeve aynı cihazda (tembel kip kapalı)', () => {
  it('aynadaki işaretli paket çevrimdışı okunurken baytla çözülür', async () => {
    const t = await ac(true);
    const liste = await t.DB.all('pkgs');
    await t.coz(liste[0]);
    await vi.waitFor(async () => expect((await t.local.all('pkgs')).length).toBe(2));
    sunucuAcik = false;
    const eski = await ac(false);
    const p1 = await eski.DB.get('pkgs', 'p1');
    expect(p1.files[0].bytes).toEqual(SUNUCU_DOSYALARI.h1);
  });
});
