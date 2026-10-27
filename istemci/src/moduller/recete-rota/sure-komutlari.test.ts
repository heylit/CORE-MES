import { afterEach, describe, expect, it, vi } from 'vitest';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kopruHatasi, kopruKur } from './kopru.ts';

// Bu testler eski çerçevenin Süreler testindeydi (805); yeni ekran aynı köprü komutlarını kullanır.
afterEach(() => { vi.unstubAllGlobals(); });

// Süreler köprüsü (169 c, 171 a): ekranın ölçüm okuması ve yazımı rota modülünün uçlarına yalnız izinli alanlarla gider. Veriler uydurmadır.
describe('Süreler köprüsü', () => {
  const DURUM: DurumCevabi = {
    items: [], units: [], opdefs: [], wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] },
    routes: {}, routeRevs: [], settings: { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: true, planDrafts: false }, moves: [], maliyet: null, malzemeKesildi: false,
  };
  interface Istek { yontem: string; yol: string; govde: unknown; baslik: Record<string, string> }
  const istekleriTopla = (cevap: (yontem: string, yol: string) => Response): Istek[] => {
    const istekler: Istek[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yontem = secenek?.method ?? 'GET';
      const yol = adres.replace('/api', '');
      istekler.push({ yontem, yol, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as unknown : undefined, baslik: (secenek?.headers ?? {}) as Record<string, string> });
      return cevap(yontem, yol);
    }));
    return istekler;
  };
  const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
  const SURELER = { revizyonId: 7, makineId: null, adimlar: [] };
  const tamam = (yontem: string, yol: string): Response =>
    yontem === 'POST' ? json(200, { ok: true }) : yol === '/plan/planlama-kaynagi' ? json(200, DURUM) : yol.startsWith('/rota/revizyonlar/7/sureler') ? json(200, SURELER) : json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });

  it('SUK-1: süre okuması revizyonun süreler ucuna gider, makine verilirse o makinenin görünümüyle; geçersiz kimlik istek atmaz', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    expect(await isle('sure-oku', { revizyonId: 7 })).toEqual(SURELER);
    await isle('sure-oku', { revizyonId: 7, makineId: 3 });
    expect(istekler.map((i) => `${i.yontem} ${i.yol}`)).toEqual(['GET /rota/revizyonlar/7/sureler', 'GET /rota/revizyonlar/7/sureler?makineId=3']);
    for (const v of [{}, { revizyonId: '7' }, { revizyonId: 7, makineId: 0 }, { revizyonId: 7, makineId: '3' }]) {
      expect(await isle('sure-oku', v).then(() => null, kopruHatasi)).toMatchObject({ durum: 400 });
    }
    expect(istekler).toHaveLength(2);
  });

  it('SUK-2: elle ölçüm ve kabul adımın ucuna istek kimliğiyle yalnız izinli alanlarla gider; kabul süre taşımaz; ardından bağlı durum okunur', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    const yaz = await isle('komut', { ad: 'rota-olcum-yaz', govde: { adimId: 41, tur: 'islem', sureDk: 3.5, makineId: null, okunanId: 9, sinsi: 1 } });
    expect(yaz).toMatchObject({ sonuc: { ok: true }, ek: null });
    await isle('komut', { ad: 'rota-olcum-yaz', govde: { adimId: 41, tur: 'hazirlik', sureDk: null, makineId: 3, okunanId: null } });
    await isle('komut', { ad: 'rota-olcum-kabul', govde: { adimId: 41, tur: 'degisim', olcumId: 12, makineId: 3, okunanId: 12, sureDk: 99 } });
    const postlar = istekler.filter((i) => i.yontem === 'POST');
    expect(postlar.map((i) => i.yol)).toEqual(['/rota/adimlar/41/gerceklesen-sure', '/rota/adimlar/41/gerceklesen-sure', '/rota/adimlar/41/gerceklesen-sure/kabul']);
    expect(postlar.map((i) => i.govde)).toEqual([
      { tur: 'islem', makineId: null, okunanId: 9, sureDk: 3.5 },
      { tur: 'hazirlik', makineId: 3, okunanId: null, sureDk: null },
      { tur: 'degisim', makineId: 3, okunanId: 12, olcumId: 12 },
    ]);
    expect(postlar.every((i) => Boolean(i.baslik[ISTEK_KIMLIGI_BASLIGI]))).toBe(true);
    expect(istekler.filter((i) => i.yol === '/plan/planlama-kaynagi')).toHaveLength(3);
  });

  it('SUK-3: geçersiz tür, adım, ölçüm ya da negatif süre istek atmadan 400 ile reddedilir', async () => {
    const istekler = istekleriTopla(tamam);
    const isle = kopruKur();
    const gecersizler: [string, Record<string, unknown>][] = [
      ['rota-olcum-yaz', { adimId: 41, tur: 'cevrim', sureDk: 1, makineId: null, okunanId: null }],
      ['rota-olcum-yaz', { adimId: 0, tur: 'islem', sureDk: 1, makineId: null, okunanId: null }],
      ['rota-olcum-yaz', { adimId: 41, tur: 'islem', sureDk: -1, makineId: null, okunanId: null }],
      ['rota-olcum-kabul', { adimId: 41, tur: 'islem', makineId: null, okunanId: null }],
      ['rota-olcum-kabul', { adimId: 41, tur: 'islem', olcumId: 5, makineId: 'x', okunanId: null }],
    ];
    for (const [ad, govde] of gecersizler) {
      expect(await isle('komut', { ad, govde }).then(() => null, kopruHatasi), JSON.stringify(govde)).toMatchObject({ durum: 400 });
    }
    expect(istekler).toHaveLength(0);
  });
});
