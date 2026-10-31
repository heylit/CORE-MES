import { afterEach, describe, expect, it, vi } from 'vitest';
import { ILETI_ARALIGI_MS, SANAL_SUNUCU, bagla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

// Y13 (kart #862): Arkon'un olay akışı TMI penceresinde döner; çerçeve kalkınca (başka sayfa, çıkış) kapatılmazsa her ziyaret bir yoklama döngüsü
// daha bırakır ve çıkıştan sonra da istek atar.
const BUS = `${window.location.origin}${SANAL_SUNUCU}/api/bus?c=cihaz-1`;
const ILETILER = '/arkon/iletiler';

const pencereKur = () => {
  const pencere = { document: window.document, location: window.location, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {} } as unknown as Window & typeof globalThis;
  pencere.Response = window.Response;
  return pencere;
};
const akisAc = (pencere: Window & typeof globalThis): EventSource => new pencere.EventSource(BUS);

afterEach(() => { vi.useRealTimers(); });

describe('Arkon olay akışı çerçeveyle kapanır', () => {
  it('bagla\'nın döndürdüğü işlev açık akışların hepsini kapatır; sonra TMI\'ye okuma gitmez', async () => {
    vi.useFakeTimers();
    const yollar: string[] = [];
    const istemci = { get: async (yol: string) => { yollar.push(yol); return { son: 1, iletiler: [] }; }, post: async () => undefined } as unknown as Istemci;
    const pencere = pencereKur();
    const kapat = bagla(pencere, { istemci });
    const birinci = akisAc(pencere);
    const ikinci = akisAc(pencere);
    ikinci.close();
    akisAc(pencere);
    await vi.advanceTimersByTimeAsync(ILETI_ARALIGI_MS);
    const kapanirken = yollar.filter((y) => y.startsWith(ILETILER)).length;
    expect(kapanirken).toBeGreaterThan(0);

    kapat();
    expect(birinci.readyState).toBe(2);
    await vi.advanceTimersByTimeAsync(ILETI_ARALIGI_MS * 5);
    expect(yollar.filter((y) => y.startsWith(ILETILER))).toHaveLength(kapanirken);
  });
});
