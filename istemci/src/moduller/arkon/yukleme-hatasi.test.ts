import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Gerçek Arkon veri katmanı (store.ts) sunucu kipinde, fetch sahte: eşitleme sırasında dosya yükleme ucunun cevabı belgenin kaderini belirler.
const STORE_YOLU = '../../../../arkon/web/src/data/store.ts';
interface Dilim { AKStore: { init(): Promise<unknown>; DB: { put(s: string, v: unknown): Promise<void> }; local: { get(s: string, k: string): Promise<unknown> } } }

const OZET_BASLIK = { app: 'arkon-mes' };
const BUYUK = 20000;

interface Cagri { yontem: string; yol: string }
let cagrilar: Cagri[] = [];
let parcaCevabi: { durum: number; govde: unknown } = { durum: 200, govde: { ok: true } };

function fetchKur(): void {
  cagrilar = [];
  vi.stubGlobal('fetch', vi.fn(async (girdi: string, ayar?: { method?: string; body?: unknown }) => {
    const url = new URL(girdi);
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol: url.pathname });
    const don = (durum: number, govde: unknown): Response => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/health') return don(200, OZET_BASLIK);
    if (url.pathname === '/api/me') return don(200, { id: '1', name: 'Ali', role: 'prep', wcs: [], active: true });
    if (url.pathname === '/api/blob/missing') return don(200, JSON.parse(String(ayar?.body)));
    if (url.pathname.startsWith('/api/blob/') && yontem === 'PUT') return don(parcaCevabi.durum, parcaCevabi.govde);
    if (url.pathname.startsWith('/api/doc/pkgs/') && yontem === 'PUT') return don(200, { u: 1 });
    return don(404, null);
  }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('arkon:server', JSON.stringify('http://sunucu.test'));
  localStorage.setItem('arkon:session', JSON.stringify({ token: 't', srv: 'http://sunucu.test', user: { id: '1', name: 'Ali', role: 'prep' } }));
  parcaCevabi = { durum: 200, govde: { ok: true } };
  fetchKur();
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (dinleyici !== null) window.removeEventListener('arkon-kayit-reddedildi', dinleyici);
  dinleyici = null;
});

async function depo(): Promise<Dilim['AKStore']> {
  const { AKStore } = (await import(/* @vite-ignore */ STORE_YOLU)) as Dilim;
  await AKStore.init();
  return AKStore;
}
const paket = (): { id: string; files: { name: string; bytes: Uint8Array }[] } => ({ id: 'p1', files: [{ name: 'a.pdf', bytes: new Uint8Array(BUYUK).fill(7) }] });
const docYazildi = (): boolean => cagrilar.some((c) => c.yontem === 'PUT' && c.yol.startsWith('/api/doc/pkgs/'));
const reddedilenler: unknown[] = [];
let dinleyici: ((e: Event) => void) | null = null;
const dinle = (): void => {
  reddedilenler.length = 0;
  dinleyici = (e) => reddedilenler.push((e as CustomEvent).detail);
  window.addEventListener('arkon-kayit-reddedildi', dinleyici);
};

describe('Arkon eşitleme: dosya yükleme cevabı', () => {
  it('izinli: yükleme kabul edilince büyük dosyalı paket sunucuya yazılır ve ret iletisi çıkmaz', async () => {
    dinle();
    const d = await depo();
    await d.DB.put('pkgs', paket());
    expect(cagrilar.some((c) => c.yontem === 'PUT' && c.yol.startsWith('/api/blob/'))).toBe(true);
    expect(docYazildi()).toBe(true);
    expect(reddedilenler).toEqual([]);
  });

  it('yükleme 429 verince put hata fırlatır, sunucuya belge yazılmaz, yerel kopya kalır ve ekrana sunucunun iletisi gider', async () => {
    dinle();
    parcaCevabi = { durum: 429, govde: { error: 'Açık yükleme sayısı sınırına ulaşıldı' } };
    const d = await depo();
    await expect(d.DB.put('pkgs', paket())).rejects.toMatchObject({ status: 429 });
    expect(docYazildi()).toBe(false);
    expect(((await d.local.get('pkgs', 'p1')) as { id: string } | undefined)?.id).toBe('p1');
    expect(reddedilenler).toEqual([{ store: 'pkgs', id: 'p1', msg: 'Açık yükleme sayısı sınırına ulaşıldı' }]);
  });
});
