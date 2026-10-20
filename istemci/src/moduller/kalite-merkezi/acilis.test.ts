import { Blob as NodeBlob } from 'node:buffer';
import { URL as NodeURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { ON_BETIK, SON_BETIK, VERI_KANALI } from './acilis.ts';

// Çerçeve betikleri ayrı bir bağlamda, çerçevenin penceresini taklit eden nesneyle koşulur. Blob ve URL tarayıcınınki gibi
// olsun diye Node'unkilerdir (jsdom'unkinde createObjectURL yok, Blob'u Response okuyamaz).
function pencere(ek: Record<string, unknown> = {}) {
  const dinleyiciler: ((e: { source: unknown; data: unknown }) => void)[] = [];
  const giden: { ileti: unknown; hedef: string }[] = [];
  const ust = { postMessage: (ileti: unknown, hedef: string) => { giden.push({ ileti, hedef }); } };
  const asilFetch = vi.fn(async () => new Response('dis'));
  const baglam: Record<string, unknown> = {
    __TMI_KM: { koken: 'http://tmi' }, parent: ust, fetch: asilFetch, URL: NodeURL, Map, Promise, Blob: NodeBlob, Response, JSON, String, Math, setInterval, clearInterval,
    addEventListener: (ad: string, f: (e: { source: unknown; data: unknown }) => void) => { if (ad === 'message') dinleyiciler.push(f); },
    ...ek,
  };
  baglam['window'] = baglam;
  createContext(baglam);
  const gonder = (data: unknown, source: unknown = ust) => { for (const f of dinleyiciler) f({ source, data }); };
  return { baglam, giden, gonder, ust, asilFetch, kos: (betik: string) => runInContext(betik, baglam) };
}

describe('Kalite Merkezi ön betiği (fetch ve URL)', () => {
  it('api/ istekleri kabuğa ileti olarak gider, cevap Response olarak döner; başka adres asıl fetch’e gider', async () => {
    const w = pencere();
    w.kos(ON_BETIK);
    const f = w.baglam['fetch'] as (a: string, s?: unknown) => Promise<Response>;
    const cevap = f('api/doc/ncr/n1', { method: 'put', body: '{"a":1}' });
    expect(w.giden).toEqual([{ hedef: 'http://tmi', ileti: { kanal: VERI_KANALI, yon: 'istek', id: 1, tip: 'api', veri: { adres: 'api/doc/ncr/n1', yontem: 'PUT', govde: '{"a":1}' } } }]);
    w.gonder({ kanal: VERI_KANALI, yon: 'yanit', id: 1, durum: 403, json: { hata: 'yok' } }, {});
    w.gonder({ kanal: VERI_KANALI, yon: 'yanit', id: 1, durum: 200, json: { version: 3 } });
    const r = await cevap;
    expect([r.status, await r.json()]).toEqual([200, { version: 3 }]);
    await f('data:,x');
    expect(w.asilFetch).toHaveBeenCalledWith('data:,x', undefined);
  });

  it('kayıt formunun tabanı yalnız aynı kaydın yazmasına bir kez eklenir; başka kayda ve sonraki yazmaya taşınmaz', () => {
    const w = pencere();
    w.kos(ON_BETIK);
    const f = w.baglam['fetch'] as (a: string, s?: unknown) => Promise<Response>;
    const adresler = () => w.giden.map((g) => (g.ileti as { veri: { adres: string } }).veri.adres);
    w.baglam['__TMI_KM_TABAN'] = { c: 'ncr', id: 'n:1', t: '2026-10-14T08:00:00.000Z' };
    void f('api/doc/ncr/n%3A1', { method: 'PUT', body: '{}' });
    void f('api/doc/ncr/n%3A1', { method: 'PUT', body: '{}' });
    w.baglam['__TMI_KM_TABAN'] = { c: 'ncr', id: 'baska', t: 'x' };
    void f('api/doc/ncr/n%3A1', { method: 'PUT', body: '{}' });
    w.baglam['__TMI_KM_TABAN'] = { c: 'ncr', id: 'n2' };
    void f('api/doc/ncr/n2', { method: 'PUT', body: '{}' });
    expect(adresler()).toEqual(['api/doc/ncr/n%3A1?taban=2026-10-14T08%3A00%3A00.000Z', 'api/doc/ncr/n%3A1', 'api/doc/ncr/n%3A1', 'api/doc/ncr/n2']);
    expect(w.baglam['__TMI_KM_TABAN']).toBeUndefined();
  });

  it('ikili cevap Blob olarak döner', async () => {
    const w = pencere();
    w.kos(ON_BETIK);
    const cevap = (w.baglam['fetch'] as (a: string) => Promise<Response>)('api/files/f1');
    w.gonder({ kanal: VERI_KANALI, yon: 'yanit', id: 1, durum: 200, blob: new NodeBlob(['%PDF'], { type: 'application/pdf' }) });
    const r = await cevap;
    expect([r.headers.get('Content-Type'), await r.text()]).toEqual(['application/pdf', '%PDF']);
  });

  it('URL: about: tabanına göre göreli adres yer tutucu tabana çözülür; başka her durum asıl URL gibidir', () => {
    const w = pencere();
    w.kos(ON_BETIK);
    const U = w.baglam['URL'] as typeof URL;
    expect(new U('kmcore.js', 'about:srcdoc').href).toBe('http://km.invalid/kmcore.js');
    expect(new U('a/b', 'http://x/y/').href).toBe('http://x/y/a/b');
    expect(new U('blob:http://x/1').href).toBe('blob:http://x/1');
    expect(() => new U('a', 'gecersiz')).toThrow();
    expect(new U('http://x/') instanceof NodeURL).toBe(true);
    expect(U.createObjectURL).toBeTypeOf('function');
  });
});

describe('Kalite Merkezi görünüm betiği (tmi-gorunum)', () => {
  function uygulama() {
    const UI = { view: 'today' };
    const ciz = vi.fn();
    const ayarlar = vi.fn();
    const modal = { hidden: false };
    const kapat = vi.fn((zorla?: boolean) => { if (zorla === true) modal.hidden = true; });
    const w = pencere({
      UI, VIEWS: [{ id: 'today' }, { id: 'ncr' }, { id: 'capa' }], openSettings: ayarlar, closeModal: kapat,
      document: { getElementById: (k: string) => (k === 'modal' ? modal : null) },
      render: ciz, go: (v: string) => { UI.view = v; (w.baglam['render'] as () => void)(); },
    });
    w.kos(SON_BETIK);
    return { w, UI, ciz, ayarlar, kapat, modal };
  }
  const gorunum = (gorunumAdi: string, sira: number) => ({ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum', gorunum: gorunumAdi, sira });

  it('hazır bildirir; kabuğun istediği görünüme geçer ve isteğin yankısını bildirmez', () => {
    const { w, UI, ciz } = uygulama();
    expect(w.giden[0]?.ileti).toEqual({ kanal: 'tmi-gorunum', surum: 1, tip: 'hazir' });
    w.giden.length = 0;
    w.gonder(gorunum('ncr', 1));
    expect(UI.view).toBe('ncr');
    expect(ciz).toHaveBeenCalled();
    expect(w.giden.filter((g) => (g.ileti as { tip: string }).tip === 'gorunum-degisti')).toEqual([]);
  });

  it('kullanıcının içerideki geçişi son alınan sırayla bildirilir; menüde olmayan görünüm uygulanmaz; ayarlar penceresi açılır', () => {
    const { w, UI, ayarlar } = uygulama();
    w.gonder(gorunum('ncr', 4));
    w.giden.length = 0;
    UI.view = 'capa';
    (w.baglam['render'] as () => void)();
    expect(w.giden.map((g) => g.ileti)).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'capa', sira: 4 }]);
    w.gonder(gorunum('yok', 5));
    expect(UI.view).toBe('capa');
    w.gonder(gorunum('ayarlar', 6));
    expect(ayarlar).toHaveBeenCalledOnce();
    w.gonder(gorunum('ncr', 7), {});
    expect(UI.view).toBe('capa');
  });

  it('kabuğun açtığı ayarlar penceresi kapanınca altta kalan görünüm bildirilir: adres "ayarlar"da takılmaz', () => {
    const { w, kapat, modal } = uygulama();
    w.gonder(gorunum('ncr', 2));
    w.gonder(gorunum('ayarlar', 3));
    w.giden.length = 0;
    // Kaydedilmemiş değişiklik sorusu: pencere açık kalır, adres değişmez.
    (w.baglam['closeModal'] as (z?: boolean) => void)();
    expect(w.giden).toEqual([]);
    (w.baglam['closeModal'] as (z?: boolean) => void)(true);
    expect(modal.hidden).toBe(true);
    expect(kapat).toHaveBeenCalledWith(true);
    expect(w.giden.map((g) => g.ileti)).toEqual([{ kanal: 'tmi-gorunum', surum: 1, tip: 'gorunum-degisti', gorunum: 'ncr', sira: 3 }]);
    w.giden.length = 0;
    (w.baglam['closeModal'] as () => void)();
    expect(w.giden).toEqual([]);
  });
});
