import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgHatasi, ApiHatasi, OTURUM_BITTI } from '../../ortak/veri/api.ts';
import { ILETI_ARALIGI_MS, ILETI_AZAMI_ARALIK_MS, SANAL_SUNUCU, YETKI_YOK, anlikIletimKur, bagla, yoklamaAraligi } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';
import { tasiyiciYap } from './yeni/veri/tasiyici.ts';

// Kart 1507 (GH 47): ileti yoklaması kalıcı hatada (401, 403) durur, geçici hatada artan aralıkla yeniden dener.
const BUS = `${window.location.origin}${SANAL_SUNUCU}/api/bus?c=cihaz-1`;
const hata = (durum: number) => new ApiHatasi(durum, { kod: durum === 401 ? 'OTURUM_YOK' : durum === 403 ? 'YETKI_YOK' : 'SUNUCU', mesaj: 'Reddedildi.' });

const sahteIstemci = (cevaplar: unknown[]) => {
  const yollar: string[] = [];
  const istemci = {
    get: async (yol: string) => {
      yollar.push(yol);
      const c = cevaplar.length > 0 ? cevaplar.shift() : { son: 1, iletiler: [] };
      if (c instanceof Error) throw c;
      return c;
    },
    post: async () => undefined,
  } as unknown as Istemci;
  return { istemci, yollar };
};

const pencereKur = () => {
  const pencere = { document: window.document, location: window.location, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {} } as unknown as Window & typeof globalThis;
  pencere.Response = window.Response;
  return pencere;
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('yoklama aralığı', () => {
  it('hatasızken sabit, ardışık hatada ikiye katlanır ve sınırda kalır', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 100].map(yoklamaAraligi)).toEqual([2000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(yoklamaAraligi(1000)).toBe(ILETI_AZAMI_ARALIK_MS);
  });
});

describe('kalıcı hata: yoklama durur', () => {
  it.each([401, 403] as const)('%i sonrası ikinci istek gitmez; akış kapanır, onerror bir kez çağrılır', async (durum) => {
    const { istemci, yollar } = sahteIstemci([hata(durum)]);
    const durdular: number[] = [];
    let bekleme = 0;
    const iletim = anlikIletimKur(istemci, 'cihaz-1', async () => { bekleme += 1; }, (d) => durdular.push(d));
    let hatalar = 0;
    iletim.onerror = () => { hatalar += 1; };
    await vi.waitFor(() => expect(durdular).toEqual([durum]));
    await new Promise((t) => setTimeout(t, 10));
    expect(yollar).toHaveLength(1);
    expect(hatalar).toBe(1);
    expect(bekleme).toBe(0);
    expect(iletim.readyState).toBe(2);
  });

  it('403: köprü "Arkon için yetkiniz yok" bildirir, zaman geçse de yeniden sormaz', async () => {
    vi.useFakeTimers();
    const { istemci, yollar } = sahteIstemci([hata(403)]);
    const bildirimler: string[] = [];
    const pencere = pencereKur();
    bagla(pencere, { istemci, reddedildi: (i) => bildirimler.push(i) });
    const akis = new pencere.EventSource(BUS);
    await vi.advanceTimersByTimeAsync(ILETI_AZAMI_ARALIK_MS * 3);
    expect(yollar.filter((y) => y.startsWith('/arkon/iletiler'))).toHaveLength(1);
    expect(bildirimler).toEqual([YETKI_YOK]);
    expect(akis.readyState).toBe(2);
  });

  it('403: yeni ekranın taşıyıcısı da aynı bildirimi verir ve durur', async () => {
    vi.useFakeTimers();
    const { istemci, yollar } = sahteIstemci([hata(403)]);
    const bildirimler: string[] = [];
    const t = tasiyiciYap({ koken: window.location.origin, istemci, reddedildi: (i) => bildirimler.push(i) });
    new t.EventSource(BUS);
    await vi.advanceTimersByTimeAsync(ILETI_AZAMI_ARALIK_MS * 3);
    expect(yollar.filter((y) => y.startsWith('/arkon/iletiler'))).toHaveLength(1);
    expect(bildirimler).toEqual([YETKI_YOK]);
  });

  it('401: oturum bitti olayı (giriş ekranı) bir kez atılır, yetki bildirimi verilmez, yoklama durur', async () => {
    vi.useFakeTimers();
    const istekler: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      istekler.push(String(adres));
      return new Response(JSON.stringify({ kod: 'OTURUM_YOK', mesaj: 'Oturum yok.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }));
    let oturumBitti = 0;
    const dinle = () => { oturumBitti += 1; };
    window.addEventListener(OTURUM_BITTI, dinle);
    try {
      const bildirimler: string[] = [];
      const pencere = pencereKur();
      bagla(pencere, { reddedildi: (i) => bildirimler.push(i) });
      new pencere.EventSource(BUS);
      await vi.advanceTimersByTimeAsync(ILETI_AZAMI_ARALIK_MS * 3);
      expect(istekler.filter((a) => a.includes('/arkon/iletiler'))).toHaveLength(1);
      expect(oturumBitti).toBe(1);
      expect(bildirimler).toEqual([]);
    } finally {
      window.removeEventListener(OTURUM_BITTI, dinle);
    }
  });
});

describe('geçici hata: artan aralıkla yeniden denenir', () => {
  it('ağ hatası ve 5xx aralığı büyütür; başarılı okuma aralığı başa döndürür', async () => {
    const { istemci, yollar } = sahteIstemci([
      { son: 1, iletiler: [] },
      new AgHatasi(new TypeError('Failed to fetch')),
      hata(500),
      hata(503),
      hata(502),
      hata(500),
      hata(429),
      { son: 2, iletiler: [] },
    ]);
    const beklemeler: number[] = [];
    let birak: () => void = () => {};
    const bitti = new Promise<void>((t) => { birak = t; });
    const durdular: number[] = [];
    const iletim = anlikIletimKur(istemci, 'cihaz-1', async (ms) => { beklemeler.push(ms); if (beklemeler.length === 8) birak(); }, (d) => durdular.push(d));
    const olaylar: string[] = [];
    iletim.onopen = () => olaylar.push('acik');
    iletim.onerror = () => olaylar.push('hata');
    await bitti;
    iletim.close();
    expect(beklemeler).toEqual([ILETI_ARALIGI_MS, 2000, 4000, 8000, 16000, 30000, 30000, ILETI_ARALIGI_MS]);
    expect(olaylar).toEqual(['acik', 'hata', 'hata', 'hata', 'hata', 'hata', 'hata', 'acik']);
    expect(durdular).toEqual([]);
    expect(yollar).toHaveLength(8);
  });
});
