import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import '../tasarim/tokens.css';
import { APPLE_SIMGESI, SIMGELER, TEMA_RENGI, WEB_BILDIRIMI, basEtiketleri } from './bildirim.ts';
import { calisaniKur } from './calisan.ts';
import type { CalisanCevabi, CalisanOrtami, Onbellek } from './calisan.ts';
import { servisCalisaniKaydet } from './kayit.ts';

describe('web uygulaması bildirimi', () => {
  it('kurulum alanları istenen değerlerde ve geçerli JSON', () => {
    const bildirim = JSON.parse(JSON.stringify(WEB_BILDIRIMI)) as Record<string, unknown>;
    expect(bildirim).toMatchObject({
      name: 'TMI CORE', short_name: 'TMI CORE', start_url: '/', scope: '/', display: 'standalone', orientation: 'any',
      theme_color: TEMA_RENGI, background_color: TEMA_RENGI,
    });
  });

  it('tema rengi açılıştaki (light) temanın zemin değişkeniyle aynı', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const zemin = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    expect(zemin).toBe(TEMA_RENGI);
  });

  it('simgeler 192 ve 512, ayrıca maskelenebilir; dosyalar public altında var', () => {
    for (const amac of ['any', 'maskable']) {
      expect(SIMGELER.filter((s) => s.purpose === amac).map((s) => s.sizes).sort()).toEqual(['192x192', '512x512']);
    }
    const ortak = join(import.meta.dirname, '../../../public');
    for (const yol of [...SIMGELER.map((s) => s.src), APPLE_SIMGESI]) expect(existsSync(join(ortak, yol))).toBe(true);
  });

  it('index.html etiketleri bildirimi, theme-color, apple-touch-icon ve iOS etiketlerini taşır; dış adres yok', () => {
    const etiketler = basEtiketleri();
    const ad = (n: string) => etiketler.find((e) => e.attrs['name'] === n)?.attrs['content'];
    expect(etiketler.find((e) => e.attrs['rel'] === 'manifest')?.attrs['href']).toBe('/manifest.webmanifest');
    expect(etiketler.find((e) => e.attrs['rel'] === 'apple-touch-icon')?.attrs['href']).toBe(APPLE_SIMGESI);
    expect(ad('theme-color')).toBe(TEMA_RENGI);
    expect(ad('apple-mobile-web-app-capable')).toBe('yes');
    expect(ad('apple-mobile-web-app-status-bar-style')).toBe('default');
    expect(ad('apple-mobile-web-app-title')).toBe('TMI CORE');
    expect(JSON.stringify([etiketler, WEB_BILDIRIMI])).not.toMatch(/https?:\/\//);
  });
});

describe('service worker kaydı', () => {
  it('düz http (güvenli olmayan bağlam), service worker yokken ya da geliştirmede kaydolmaz', () => {
    const kaydet = vi.fn(() => Promise.resolve());
    expect(servisCalisaniKaydet({ guvenli: false, uretim: true, kaydet })).toBe(false);
    expect(servisCalisaniKaydet({ guvenli: true, uretim: true, kaydet: null })).toBe(false);
    expect(servisCalisaniKaydet({ guvenli: true, uretim: false, kaydet })).toBe(false);
    expect(kaydet).not.toHaveBeenCalled();
  });

  it('güvenli bağlamda derlenmiş sürümde kök kapsamına kaydolur; reddedilen kayıt dışarı taşmaz', async () => {
    const kaydet = vi.fn(() => Promise.reject(new Error('yok')));
    expect(servisCalisaniKaydet({ guvenli: true, uretim: true, kaydet })).toBe(true);
    expect(kaydet).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    await Promise.resolve();
  });
});

function calisaniKurSahte(surum = 'yeni') {
  const dinleyiciler = new Map<string, (olay: never) => void>();
  const onbellekler = new Map<string, Map<string, CalisanCevabi>>();
  const acilan: string[] = [];
  const cevap: CalisanCevabi = { ok: true, type: 'basic', clone: () => cevap };
  const getir = vi.fn(() => Promise.resolve(cevap));
  const pencere = { url: 'https://tmi.yerel/plan', focus: vi.fn(() => Promise.resolve()), navigate: vi.fn(() => Promise.resolve()) };
  let acikPencereler: (typeof pencere)[] = [pencere];
  const ortam: CalisanOrtami = {
    konum: 'https://tmi.yerel/sw.js',
    dinle: (ad: string, fn: (olay: never) => void) => { dinleyiciler.set(ad, fn); },
    beklemedenGec: vi.fn(),
    sahiplen: vi.fn(() => Promise.resolve()),
    onbellekler: {
      keys: () => Promise.resolve([...onbellekler.keys()]),
      delete: (ad) => Promise.resolve(onbellekler.delete(ad)),
      open: (ad) => {
        acilan.push(ad);
        const o = onbellekler.get(ad) ?? new Map<string, CalisanCevabi>();
        onbellekler.set(ad, o);
        const onbellek: Onbellek = {
          match: (i) => Promise.resolve(o.get(i.url)),
          put: (i, c) => { o.set(i.url, c); return Promise.resolve(); },
        };
        return Promise.resolve(onbellek);
      },
    },
    getir,
    pencereler: {
      tumu: () => Promise.resolve(acikPencereler),
      ac: vi.fn(() => Promise.resolve()),
    },
  };
  calisaniKur(ortam, surum);

  // Ele alınan istekte cevap sözü döner, ele alınmayanda null (tarayıcı ağa gider).
  function iste(yol: string, method = 'GET'): Promise<CalisanCevabi> | null {
    let alinan: Promise<CalisanCevabi> | null = null;
    const olay = { request: { method, url: new URL(yol, ortam.konum).href }, respondWith: (c: Promise<CalisanCevabi>) => { alinan = c; } };
    dinleyiciler.get('fetch')?.(olay as never);
    return alinan;
  }
  async function etkinlestir() {
    let bekle: Promise<unknown> = Promise.resolve();
    dinleyiciler.get('activate')?.({ waitUntil: (s: Promise<unknown>) => { bekle = s; } } as never);
    await bekle;
  }
  async function bildirimeBas(data: unknown, pencereYok = false) {
    if (pencereYok) acikPencereler = [];
    let bekle: Promise<unknown> = Promise.resolve();
    const kapat = vi.fn();
    dinleyiciler.get('notificationclick')?.({ notification: { data, close: kapat }, waitUntil: (s: Promise<unknown>) => { bekle = s; } } as never);
    await bekle;
    return kapat;
  }
  return { iste, etkinlestir, bildirimeBas, onbellekler, acilan, getir, ortam, pencere };
}

describe('service worker önbelleği', () => {
  it('/api ve /arkon-mes/ istekleri ele alınmaz, önbelleğe girmez, doğrudan ağa gider', () => {
    const c = calisaniKurSahte();
    for (const yol of ['/api', '/api/oturum', '/api/uretim-emirleri?sayfa=2', '/api/assets/x.js', '/arkon-mes/', '/arkon-mes/index.html', '/arkon-mes/assets/a-1.js']) {
      expect(c.iste(yol)).toBeNull();
    }
    expect(c.acilan).toEqual([]);
    expect(c.getir).not.toHaveBeenCalled();
  });

  it('sayfa gezintisi, GET dışı istek ve başka kaynak ele alınmaz', () => {
    const c = calisaniKurSahte();
    expect(c.iste('/')).toBeNull();
    expect(c.iste('/uretim-emirleri/5')).toBeNull();
    expect(c.iste('/assets/index-abc.js', 'POST')).toBeNull();
    expect(c.iste('https://baska.yerel/assets/x.js')).toBeNull();
  });

  it('derlenmiş statik dosya sürüm önbelleğine alınır, ikinci istekte ağa gidilmez', async () => {
    const c = calisaniKurSahte('s1');
    await c.iste('/assets/index-abc.js');
    expect(c.onbellekler.get('tmi-statik-s1')?.has('https://tmi.yerel/assets/index-abc.js')).toBe(true);
    await c.iste('/assets/index-abc.js');
    expect(c.getir).toHaveBeenCalledTimes(1);
  });

  it('yeni sürüm etkinleşince eski sürümün önbelleği silinir, başka önbellek kalır; sayfalar sahiplenilir', async () => {
    const c = calisaniKurSahte('yeni');
    for (const ad of ['tmi-statik-eski', 'tmi-statik-yeni', 'baska']) c.onbellekler.set(ad, new Map());
    await c.etkinlestir();
    expect([...c.onbellekler.keys()].sort()).toEqual(['baska', 'tmi-statik-yeni']);
    expect(c.ortam.sahiplen).toHaveBeenCalled();
  });
});

describe('service worker cihaz bildirimi (342 a)', () => {
  it('bildirime basınca açık uygulama penceresi öne gelir ve bildirimin sayfasına gider', async () => {
    const c = calisaniKurSahte();
    const kapat = await c.bildirimeBas({ yol: '/istasyonlar' });
    expect(kapat).toHaveBeenCalled();
    expect(c.pencere.focus).toHaveBeenCalled();
    expect(c.pencere.navigate).toHaveBeenCalledWith('https://tmi.yerel/istasyonlar');
    expect(c.ortam.pencereler.ac).not.toHaveBeenCalled();
  });

  it('açık pencere yoksa sayfa yeni pencerede açılır', async () => {
    const c = calisaniKurSahte();
    await c.bildirimeBas({ yol: '/cnc-kurulum' }, true);
    expect(c.ortam.pencereler.ac).toHaveBeenCalledWith('https://tmi.yerel/cnc-kurulum');
  });

  it('yol uygulama içi değilse (başka kaynak, // ile başlayan, eksik) Bildirimler sayfası açılır', async () => {
    for (const data of [{ yol: 'https://baska.yerel/x' }, { yol: '//baska.yerel/x' }, { yol: 5 }, null]) {
      const c = calisaniKurSahte();
      await c.bildirimeBas(data);
      expect(c.pencere.navigate).toHaveBeenCalledWith('https://tmi.yerel/profil/bildirimler');
    }
  });
});
