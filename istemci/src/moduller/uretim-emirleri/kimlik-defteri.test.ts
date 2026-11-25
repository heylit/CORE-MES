import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgHatasi, ApiHatasi } from '../../ortak/veri/api.ts';
import { KimlikDefteri, topluGonder } from './kimlik-defteri.ts';

afterEach(() => { vi.useRealTimers(); });

// Kart 3700: toplu statü yazımı. ORN- uydurma gövdeler.
describe('toplu yazımın istek kimlikleri', () => {
  it('her parça isteği ayrı kimlikle gider', async () => {
    const kimlikler: string[] = [];
    await topluGonder(new KimlikDefteri(), [{ p: 'ORN-1' }, { p: 'ORN-2' }], (_g, d) => { kimlikler.push(d.istekKimligi); return Promise.resolve('tamam'); });
    expect(kimlikler).toHaveLength(2);
    expect(new Set(kimlikler).size).toBe(2);
  });

  it('sonucu bilinmeyen hatadan sonra aynı gövdelerle yeniden basış parçaların kimliğini korur', async () => {
    vi.useFakeTimers();
    const defter = new KimlikDefteri();
    const gonderilen: string[] = [];
    let ikinciBozuk = true;
    const gonder = (g: { p: string }, d: { istekKimligi: string }) => {
      gonderilen.push(`${g.p}:${d.istekKimligi}`);
      return g.p === 'ORN-2' && ikinciBozuk ? Promise.reject(new AgHatasi('ag')) : Promise.resolve(g.p);
    };
    const ilk = topluGonder(defter, [{ p: 'ORN-1' }, { p: 'ORN-2' }], gonder);
    const ilkSonuc = ilk.catch((h: unknown) => h);
    await vi.runAllTimersAsync();
    expect(await ilkSonuc).toBeInstanceOf(AgHatasi);
    const k1 = gonderilen[0]!.split(':')[1];
    const k2 = gonderilen[1]!.split(':')[1];
    // ORN-2 ilk denemeden sonra aynı kimlikle yeniden denendi
    expect(gonderilen.filter((x) => x.startsWith('ORN-2')).every((x) => x.endsWith(k2!))).toBe(true);
    gonderilen.length = 0;
    ikinciBozuk = false;
    await topluGonder(defter, [{ p: 'ORN-1' }, { p: 'ORN-2' }], gonder);
    expect(gonderilen).toEqual([`ORN-1:${k1}`, `ORN-2:${k2}`]);
  });

  it('tam başarıdan ve sunucu retinden sonra kimlik yenilenir', async () => {
    const defter = new KimlikDefteri();
    const kimlikler: string[] = [];
    await topluGonder(defter, [{ p: 'ORN-1' }], (_g, d) => { kimlikler.push(d.istekKimligi); return Promise.resolve(1); });
    await expect(topluGonder(defter, [{ p: 'ORN-1' }], (_g, d) => { kimlikler.push(d.istekKimligi); return Promise.reject(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'x' })); })).rejects.toBeInstanceOf(ApiHatasi);
    await topluGonder(defter, [{ p: 'ORN-1' }], (_g, d) => { kimlikler.push(d.istekKimligi); return Promise.resolve(1); });
    expect(new Set(kimlikler).size).toBe(3);
  });
});
