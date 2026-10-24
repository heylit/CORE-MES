import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArkonKisi } from '#paylasilan/sozlesme/arkon.ts';
import type { Istemci } from '../../baglanti.ts';
import { depoModulu, depoyuBaslat, type ArkonDeposu } from './depo.ts';
import { tasiyiciYap } from './tasiyici.ts';

// Gerçek Arkon veri katmanı (store.ts) taşıyıcıyla, pencerenin fetch'i olmadan. Cihaz deposu testte yoktur (bellek kipi).

const KOKEN = window.location.origin;
const kisi = (kimlik: string, rol: ArkonKisi['rol'] = 'admin'): ArkonKisi =>
  ({ kimlik, ad: `Deneme ${kimlik}`, rol, isMerkezleri: [], istasyon: null, istasyonlar: [], aktif: true });

function istemciKur(ben: () => ArkonKisi) {
  const yazmalar: { yol: string; govde: unknown }[] = [];
  const istemci: Istemci = {
    get: vi.fn(async (yol: string) => {
      if (yol === '/arkon/ben') return { kisi: ben() };
      if (yol.startsWith('/arkon/iletiler')) return { son: 0, iletiler: [] };
      if (yol.startsWith('/arkon/belgeler/')) return yol.split('/').length > 4 ? { belge: null } : { belgeler: [] };
      return undefined;
    }) as unknown as Istemci['get'],
    post: vi.fn(async (yol: string, govde?: unknown) => {
      yazmalar.push({ yol, govde });
      return yol.endsWith('/yaz') ? { sonuc: 'yazildi', surum: 1 } : { eklenen: 1 };
    }) as unknown as Istemci['post'],
  };
  return { istemci, yazmalar };
}

const kapatilacak: (() => void)[] = [];
afterEach(() => { for (const k of kapatilacak.splice(0)) k(); });

async function baslat(k: ArkonKisi, istemci: Istemci): Promise<ArkonDeposu> {
  const tasiyici = tasiyiciYap({ koken: KOKEN, istemci });
  kapatilacak.push(tasiyici.kapat);
  return depoyuBaslat({ kisi: k, tema: 'light', tasiyici });
}

describe('Yeni ekranın veri katmanı', () => {
  it('store.ts yüklenir ve ekranın kullandığı yüzü verir', async () => {
    const d = await depoModulu();
    for (const ad of ['init', 'status', 'onStatus', 'tasiyiciKur', 'sha256'] as const) expect(typeof d[ad]).toBe('function');
    for (const ad of ['all', 'get', 'put', 'del'] as const) expect(typeof d.DB[ad]).toBe('function');
    for (const ad of ['send', 'yerel', 'on'] as const) expect(typeof d.Bus[ad]).toBe('function');
    for (const ad of ['add', 'query', 'on'] as const) expect(typeof d.Log[ad]).toBe('function');
    for (const ad of ['current', 'logout'] as const) expect(typeof d.Auth[ad]).toBe('function');
    for (const ad of ['sirala', 'surum'] as const) expect(typeof d.Plan[ad]).toBe('function');
    for (const ad of ['get', 'put', 'clear'] as const) expect(typeof d.Cache[ad]).toBe('function');
    for (const ad of ['toFile', 'fromFile', 'fileName'] as const) expect(typeof d.Pkg[ad]).toBe('function');
    for (const ad of [
      'flush', 'materials', 'merkezBelgeleri', 'merkezdenAl', 'merkezKontrol', 'anomaliler', 'anomaliIstatistigi', 'operatorOzeti',
      'makineAyrimlari', 'refakatKartlari', 'cagriEkiplerim', 'tmiAdimlari', 'tmiAdimIsaretle', 'uretimHazirligi',
    ] as const) expect(typeof d.Server[ad]).toBe('function');
  });

  it('TMI\'ye bağlanır; belge yazması köprü üzerinden TMI ucuna gider', async () => {
    const { istemci, yazmalar } = istemciKur(() => kisi('k1'));
    const d = await baslat(kisi('k1'), istemci);
    expect(d.status()).toMatchObject({ mode: 'server', online: true });
    expect(d.Auth.current()?.id).toBe('k1');
    await d.DB.put('pkgs', { id: 'p1', no: 'UE-1' });
    expect(yazmalar).toContainEqual({ yol: '/arkon/belgeler/pkgs/p1/yaz', govde: expect.objectContaining({ govde: { id: 'p1', no: 'UE-1' } }) });
    expect(d.status().pending).toBe(0);
  });

  it('TMI\'de başka kişiyle girilince veri katmanı yeni kişiyle çalışır (sayfa yenilenmeden)', async () => {
    let simdiki = kisi('k1');
    const { istemci } = istemciKur(() => simdiki);
    const once = await baslat(simdiki, istemci);
    // TMI oturumu bitti (çıkış ya da 401): veri katmanının oturumu düşer; modül sayfada kalır.
    await once.Auth.logout();
    expect(once.Auth.current()).toBeNull();
    simdiki = kisi('k2', 'operator');
    const d = await baslat(simdiki, istemci);
    expect(d.Auth.current()).toMatchObject({ id: 'k2', role: 'operator' });
  });
});
