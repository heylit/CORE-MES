import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bekleyenKayitlar, cozulmusEskidi, kararBekleyenKayitMi, kararBekler } from '../../../../arkon/web/src/data/biten-is';

// Karar 3158 a: bağlantı yokken beklemiş üretim kaydı reddedilince kaybolmaz; cihazda "karar bekliyor" olarak kalır.
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
interface Bekleyen { anahtar: number; tur: string; satir: { cid?: string }; durum: string; neden: string | null; yenidenDenenir: boolean }
interface Depo {
  init(): Promise<unknown>; status(): { pending: number };
  local: { add(s: string, v: unknown): Promise<unknown> };
  Log: { bekleyenler(): Promise<Bekleyen[]>; kararCoz(a: number, yol: 'yeniden' | 'vazgec' | 'duzelt'): Promise<boolean> };
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

const say = (cid: string, uid = '1') => ({ op: 'log', kind: 'counts', uid, at: 5, row: { cid, kind: 'good', delta: 1, orderNo: 'ORN-UE-1', pkgId: null } });
let gonderilen: string[] = [];
let kabul = new Set<string>();
let ozelCevap = new Map<string, { durum: number; govde: unknown }>();
const bekle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  gonderilen = []; kabul = new Set(); ozelCevap = new Map();
  localStorage.clear();
  localStorage.setItem('arkon:server', JSON.stringify('http://sunucu.test'));
  localStorage.setItem('arkon:session', JSON.stringify({ token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'ORN Operatör', role: 'operator' } }));
  const s = sahteIndexedDb();
  vi.stubGlobal('indexedDB', s.indexedDB);
  vi.stubGlobal('IDBRequest', s.IDBRequest);
  const cevap = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string; body?: string }) => {
    const yol = new URL(girdi).pathname;
    if (yol === '/api/health') return cevap(200, { app: 'arkon-mes' });
    if (yol === '/api/me') return cevap(200, { id: '1', name: 'ORN Operatör', role: 'operator' });
    const yeniden = /^\/api\/log\/counts\/([^/]+)\/yeniden-dene$/.exec(yol);
    if (yeniden && ayar?.method === 'POST') {
      const cid = decodeURIComponent(yeniden[1]!);
      gonderilen.push(`yeniden:${cid}`);
      const ozel = ozelCevap.get(cid);
      if (ozel) return cevap(ozel.durum, ozel.govde);
      if (kabul.has(cid)) return cevap(200, { sonuc: 'yazildi', neden: null });
      return cevap(409, { error: 'Bu adımda sonradan yeniden sayım yapıldı; eski sayım yeniden denenmez. Gerekirse düzelterek gönderin.' });
    }
    if (yol === '/api/log/counts' && ayar?.method === 'POST') {
      const cid = (JSON.parse(ayar.body ?? '[]') as { cid: string }[])[0]!.cid;
      gonderilen.push(cid);
      if (cid.startsWith('yazilmadi') && !kabul.has(cid)) return cevap(409, { error: 'Hedef aşılıyor.' });
      if (cid.startsWith('yazildi')) return cevap(200, { eklenen: 1, reddedilen: [{ cid, ileti: 'Emir beklemede.' }], uyarilar: [] });
      return cevap(200, { eklenen: 1, reddedilen: [], uyarilar: [] });
    }
    return cevap(200, []);
  }));
  vi.resetModules();
});
afterEach(async () => { await bekle(30); vi.unstubAllGlobals(); });

describe('karar bekleyen kuyruk kaydı (saf)', () => {
  const red = (ek: object = {}) => ({ ileti: 'Neden', at: 1000, yazildi: false, ...ek });
  it('yalnız oturumdaki kişinin üretim kayıtları listelenir; belge yazımı ve başkasının kaydı girmez', () => {
    const kuyruk: [number, unknown][] = [[1, say('a')], [2, say('b', '2')], [3, { op: 'put', store: 'pkgs', id: 'p', uid: '1' }], [4, { ...say('c'), red: red() }]];
    const liste = bekleyenKayitlar(kuyruk, '1', new Set<number>(), false);
    expect(liste.map((x) => [x.anahtar, x.durum, x.yenidenDenenir])).toEqual([[1, 'bekliyor', false], [4, 'karar', true]]);
    expect(liste[1]!.neden).toBe('Neden');
  });
  it('gönderim sürerken bekleyen "gonderiliyor" olur; karar bekleyen değişmez', () => {
    const liste = bekleyenKayitlar([[1, say('a')], [2, { ...say('b'), red: red() }]], '1', new Set<number>(), true);
    expect(liste.map((x) => x.durum)).toEqual(['gonderiliyor', 'karar']);
  });
  it('sunucuda yazılmış retten yalnız sayım yeniden denenir; bir kez denenmiş ve çözülmüş kayıt denenmez', () => {
    const olay = { op: 'log', kind: 'events', uid: '1', at: 5, row: { cid: 'e' } };
    const liste = bekleyenKayitlar([
      [1, { ...say('a'), red: red({ yazildi: true }) }], [2, { ...olay, red: red({ yazildi: true }) }], [3, { ...say('c'), red: red({ yenidenDenendi: true }) }],
      [4, { ...say('b'), red: red({ cozum: 'vazgecildi', cozumAt: 2000 }) }],
    ], '1', new Set<number>(), false);
    expect(liste.map((x) => [x.durum, x.yenidenDenenir])).toEqual([['karar', true], ['karar', false], ['karar', false], ['vazgecildi', false]]);
  });
  it('gecikmeli ret yalnız cihazda karar bekleyen kayda aitse yutulur', () => {
    const kuyruk = [say('a'), { ...say('b'), red: red() }, { op: 'put', store: 'pkgs', id: 'b', red: red() }];
    expect(kararBekleyenKayitMi(kuyruk, 'b')).toBe(true);
    expect(kararBekleyenKayitMi(kuyruk, 'a')).toBe(false);
    expect(kararBekleyenKayitMi(kuyruk, 'yok')).toBe(false);
  });
  it('çözülmüş iz bir gün sonra eskir; çözülmemiş karar hiç eskimez', () => {
    const gun = 24 * 3600e3;
    expect(cozulmusEskidi({ red: red({ cozum: 'vazgecildi', cozumAt: 1000 }) }, 1000 + gun + 1)).toBe(true);
    expect(cozulmusEskidi({ red: red({ cozum: 'vazgecildi', cozumAt: 1000 }) }, 1000 + gun)).toBe(false);
    expect(cozulmusEskidi({ red: red() }, 1000 + 30 * gun)).toBe(false);
    expect(kararBekler(say('a'))).toBe(false);
  });
});

describe('kuyruk gönderimi: reddedilen bekleyen kayıt düşmez', () => {
  it('kabul edilen silinir; 4xx ve cevaptaki ret kuyrukta karar bekler, bekleyen sayısına girmez ve yeniden gönderilmez', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    for (const cid of ['tamam-1', 'yazilmadi-1', 'yazildi-1']) await AKStore.local.add('outbox', say(cid));
    const olaylar: { cid?: string; bekledi?: boolean }[] = []; const ozet: { kesin: number; karar: number }[] = [];
    window.addEventListener('arkon-rejected', (e) => olaylar.push((e as CustomEvent).detail));
    window.addEventListener('arkon-kuyruk-bitti', (e) => ozet.push((e as CustomEvent).detail));
    await AKStore.init(); await bekle(120);

    const liste = await AKStore.Log.bekleyenler();
    expect(liste.map((x) => [x.satir.cid, x.durum, x.neden, x.yenidenDenenir])).toEqual([
      ['yazilmadi-1', 'karar', 'Hedef aşılıyor.', true], ['yazildi-1', 'karar', 'Emir beklemede.', true]]);
    expect(AKStore.status().pending).toBe(0);
    expect(olaylar.map((o) => [o.cid, o.bekledi])).toEqual([['yazilmadi-1', true], ['yazildi-1', true]]);
    expect(ozet).toContainEqual({ kesin: 1, karar: 2 });
    expect(gonderilen).toEqual(['tamam-1', 'yazilmadi-1', 'yazildi-1']);
  });

  it('"yeniden": sunucuda yazılmamış kayıt kuyruğa döner ve güncel kuralla yeniden gönderilir', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazilmadi-1'));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    kabul.add('yazilmadi-1');
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(true);
    await bekle(120);
    expect(await AKStore.Log.bekleyenler()).toEqual([]);
    expect(gonderilen.filter((c) => c === 'yazilmadi-1')).toHaveLength(2);
  });

  it('"yeniden": ikinci kez reddedilen kayıt bir daha denenmez', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazilmadi-1'));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(true);
    await bekle(120);
    expect((await AKStore.Log.bekleyenler()).map((x) => [x.durum, x.yenidenDenenir])).toEqual([['karar', false]]);
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(false);
  });

  it('"yeniden": sunucuda yazılmış sayım sunucuya sorulur; yazılırsa kuyruktan düşer ve adet ekrana döner', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazildi-1'));
    const donen: { cid?: string }[] = [];
    window.addEventListener('arkon-sayim-yeniden-yazildi', (e) => donen.push((e as CustomEvent).detail));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    kabul.add('yazildi-1');
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(true);
    expect(await AKStore.Log.bekleyenler()).toEqual([]);
    expect(donen.map((d) => d.cid)).toEqual(['yazildi-1']);
    expect(gonderilen).toEqual(['yazildi-1', 'yeniden:yazildi-1']);
  });

  it('"yeniden": sunucu sayımı kuyruğa aldıysa ("bekliyor") yazılmış gibi düşer ve adet ekrana döner', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazildi-1'));
    const donen: { cid?: string }[] = [];
    window.addEventListener('arkon-sayim-yeniden-yazildi', (e) => donen.push((e as CustomEvent).detail));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    ozelCevap.set('yazildi-1', { durum: 200, govde: { sonuc: 'bekliyor', neden: null } });
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(true);
    expect(await AKStore.Log.bekleyenler()).toEqual([]);
    expect(donen.map((d) => d.cid)).toEqual(['yazildi-1']);
  });

  it('"yeniden": sunucu meşgulse (503) ya da kaydı bulamazsa (404) hak yanmaz, kayıt olduğu gibi kalır', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazildi-1'));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    for (const durum of [503, 404]) {
      ozelCevap.set('yazildi-1', { durum, govde: { error: 'ORN' } });
      expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(false);
      const [b] = await AKStore.Log.bekleyenler();
      expect([b!.durum, b!.yenidenDenenir, b!.neden]).toEqual(['karar', true, a!.neden]);
    }
    expect(gonderilen.filter((c) => c.startsWith('yeniden:'))).toHaveLength(2);
  });

  it('"yeniden": sunucu yine reddederse neden güncellenir, kayıt kalır ve bir daha denenmez', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazildi-1'));
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(true);
    const [b] = await AKStore.Log.bekleyenler();
    expect([b!.durum, b!.yenidenDenenir]).toEqual(['karar', false]);
    expect(b!.neden).toMatch(/sonradan yeniden sayım/);
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(false);
    expect(gonderilen.filter((c) => c.startsWith('yeniden:'))).toHaveLength(1);
  });

  it('"vazgec" kaydı göndermez, iz olarak tutar; başkasının kaydı çözülemez', async () => {
    const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as { AKStore: Depo };
    await AKStore.local.add('outbox', say('yazilmadi-1'));
    const baskasi = (await AKStore.local.add('outbox', { ...say('yazilmadi-2', '2'), red: { ileti: 'x', at: 1, yazildi: false } })) as number;
    await AKStore.init(); await bekle(120);
    const [a] = await AKStore.Log.bekleyenler();

    expect(await AKStore.Log.kararCoz(baskasi, 'vazgec')).toBe(false);
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'vazgec')).toBe(true);
    expect(await AKStore.Log.kararCoz(a!.anahtar, 'yeniden')).toBe(false);
    await bekle(60);
    expect((await AKStore.Log.bekleyenler()).map((x) => x.durum)).toEqual(['vazgecildi']);
    expect(gonderilen).toEqual(['yazilmadi-1']);
  });
});
