import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Gerçek Arkon veri katmanı (store.ts) sunucu kipinde; IndexedDB ve fetch sahte. Uygulama yeniden açılınca modül yeniden yüklenir,
// sahte IndexedDB testin elinde kaldığı için cihazdaki veri açılışlar arasında korunur (kesinti tatbikatı D1).
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
interface Depo { init(): Promise<unknown>; DB: { get(s: string, k: string): Promise<any>; put(s: string, v: unknown): Promise<void> }; local: { all(s: string): Promise<unknown[]> } }

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
    indexedDB: {
      open() {
        const r = new SahteIstek(); r.result = vt;
        setTimeout(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }, 0);
        return r;
      },
    },
  };
}

// Sunucudaki belge: tablet okuduğunda sürüm 3; tablet çevrimdışıyken başka cihaz `not` alanını değiştirip sürüm 5 yaptı.
let sunucuAcik = true;
let yazmaGecikmesi = 0;
let surum = 3;
let belge: Record<string, unknown> = { id: 'p1', durum: 'hazir', not: 'ilk' };
let yazilanlar: { taban: string | null; govde: Record<string, unknown> }[] = [];
function fetchKur(): void {
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string; body?: string }) => {
    if (!sunucuAcik) throw new TypeError('ağ yok');
    const url = new URL(girdi), yontem = ayar?.method ?? 'GET';
    const don = (durum: number, govde: unknown): Response => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/health') return don(200, { app: 'arkon-mes' });
    if (url.pathname === '/api/me') return don(200, { id: '1', name: 'Ali', role: 'prep', wcs: [], active: true });
    if (url.pathname === '/api/doc/pkgs/p1' && yontem === 'GET') return don(200, { id: 'p1', u: surum, d: belge });
    if (url.pathname === '/api/doc/pkgs/p1' && yontem === 'PUT') {
      if (yazmaGecikmesi) await new Promise((r) => setTimeout(r, yazmaGecikmesi));
      const govde = JSON.parse(ayar!.body!) as Record<string, unknown>, taban = url.searchParams.get('base');
      yazilanlar.push({ taban, govde });
      if (Number(taban) !== surum) return don(409, { error: 'çakışma', cur: { u: surum, d: belge } });
      belge = govde; surum++; return don(200, { u: surum });
    }
    return don(404, null);
  }));
}

async function ac(): Promise<Depo> {
  vi.resetModules();
  const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
  await AKStore.init();
  return AKStore;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('arkon:server', JSON.stringify('http://sunucu.test'));
  localStorage.setItem('arkon:session', JSON.stringify({ token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'Ali', role: 'prep' } }));
  const s = sahteIndexedDb();
  vi.stubGlobal('indexedDB', s.indexedDB);
  vi.stubGlobal('IDBRequest', s.IDBRequest);
  sunucuAcik = true; yazmaGecikmesi = 0; surum = 3; belge = { id: 'p1', durum: 'hazir', not: 'ilk' }; yazilanlar = [];
  fetchKur();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Arkon çevrimdışı yeniden açılış: son bilinen sürüm kaybolmaz', () => {
  it('tabletin değiştirdiği alan, uygulama çevrimdışı yeniden açılıp sonra eşitlenince korunur', async () => {
    const ilk = await ac();
    expect((await ilk.DB.get('pkgs', 'p1')).durum).toBe('hazir');

    // ağ koptu; başka cihaz `not` alanını değiştirdi; tablet uygulamayı çevrimdışı yeniden açıp `durum` alanını değiştirdi
    sunucuAcik = false;
    belge = { id: 'p1', durum: 'hazir', not: 'öteki cihaz' }; surum = 5;
    const cevrimdisi = await ac();
    await cevrimdisi.DB.put('pkgs', { id: 'p1', durum: 'basladi', not: 'ilk' });
    expect(yazilanlar).toEqual([]);
    expect(await cevrimdisi.local.all('outbox')).toHaveLength(1);

    // bağlantı geri geldi, uygulama yeniden açıldı: kuyruk gönderilir
    sunucuAcik = true;
    const son = await ac();
    await vi.waitFor(async () => expect(await son.local.all('outbox')).toHaveLength(0), { timeout: 3000 });
    expect(yazilanlar[0]?.taban).toBe('3');
    expect(belge).toEqual({ id: 'p1', durum: 'basladi', not: 'öteki cihaz' });
  });
});

// Akış A provası 2 (Y1): tek tablette art arda iki kayıt (Üretime geç: durum ve sayaç kaydı) aynı belgeye üst üste gidince ikincisi
// birincinin sürümünü bilmeden gidiyor, 409 alıp "başka cihazda değişmişti" iletisini çıkarıyordu; bu ileti başlatma uyarısını örtüyordu.
describe('Arkon aynı tablette art arda yazma', () => {
  it('aynı belgeye üst üste giden iki yazma sırayla gider; çakışma sayılmaz, son yazılan geçerlidir', async () => {
    const depo = await ac();
    await depo.DB.get('pkgs', 'p1');
    yazmaGecikmesi = 30; // ağ gecikmesi: ilk yazmanın cevabı gelmeden ikincisi yola çıkar
    const cakismalar: unknown[] = [];
    const dinle = (e: Event): void => { cakismalar.push((e as CustomEvent).detail); };
    window.addEventListener('arkon-cakisma', dinle);
    try {
      await Promise.all([
        depo.DB.put('pkgs', { id: 'p1', durum: 'basladi', not: 'ilk', at: 1 }),
        depo.DB.put('pkgs', { id: 'p1', durum: 'calisiyor', not: 'ilk', at: 2 }),
      ]);
    } finally { window.removeEventListener('arkon-cakisma', dinle); }
    expect(cakismalar).toEqual([]);
    expect(yazilanlar.map((y) => y.taban)).toEqual(['3', '4']);
    expect(belge).toEqual({ id: 'p1', durum: 'calisiyor', not: 'ilk', at: 2 });
  });
});
