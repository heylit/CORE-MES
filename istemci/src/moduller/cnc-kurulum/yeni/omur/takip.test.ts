import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDemo, seedDemo } from './ornek.ts';
import { depoAdedi, kullanimDuzelt, parcaSuresi, takimDegisti, tezgahtakiKart, toplamlar } from './takip.ts';
import { depotKartlari, durumKur, lwDefs, state, TAKIMLAR, TEZGAH } from './test-verisi.ts';
import type { DepoKarti } from './tipler.ts';

vi.mock('./cekirdek.ts', () => import('./test-verisi.ts'));

beforeEach(() => { durumKur(); delete depotKartlari.d_mill; });

describe('lwDefs ve toplamlar', () => {
  it('tezgâh satırı ve boş depo satırı kurulur; özetler durumdan sayılır', () => {
    state.wear = { m1: { 0: { id: 'em10', used: 45, parts: 40, since: 1 }, 1: { id: 'fm50', used: 25, parts: 30, since: 1 } } };
    state.inv = { em10: { qty: 1 } };
    const defs = lwDefs();
    expect(defs.map((d) => d.key)).toEqual(['m1', '__depot']);
    const t = toplamlar(defs);
    expect(t.tot).toEqual({ over: 1, crit: 0, warn: 1, ok: 1 });
    // Ömrü dolan takımın depoda yedeği yok (1 adet, 1'i tezgâhta).
    expect(t.noSpare).toBe(1);
  });
  it('depo grubu stok girilmiş kalem varsa satır olur', () => {
    const k: DepoKarti = { depot: true, t: TAKIMLAR[0]!, id: 'em10', key: 'em10', stock: { st: 'low', avail: 0, qty: 1, used: 1, min: 1 }, shelf: 'Parmak', u: undefined, g: 'd_mill' };
    depotKartlari.d_mill = [k];
    const defs = lwDefs();
    expect(defs[1]).toMatchObject({ key: '__d_mill', depot: true, n: { crit: 1, low: 1, short: 0, ok: 0 } });
    expect(toplamlar(defs).dt).toEqual({ short: 0, low: 1, ok: 0 });
    expect(tezgahtakiKart(defs, TAKIMLAR[0]!)?.p).toBe(0);
  });
});

describe('takım değiştirildi ve düzeltmeler', () => {
  it('değişim kullanımı sıfırlar, başlangıcı yeniler; istenirse depodan bir yedek düşer', () => {
    state.wear = { m1: { 0: { id: 'em10', used: 45, parts: 40, since: 1, demo: 1 } } };
    state.inv = { em10: { qty: 3, demo: 1 } };
    takimDegisti({ m: TEZGAH, p: 0, t: TAKIMLAR[0]! }, true, 500);
    expect(state.wear['m1']![0]).toEqual({ id: 'em10', used: 0, parts: 0, since: 500 });
    expect(state.inv['em10']).toEqual({ qty: 2 });
    takimDegisti({ m: TEZGAH, p: 0, t: TAKIMLAR[0]! }, false, 600);
    expect(state.inv['em10']!.qty).toBe(2);
  });
  it('kullanılan süre düzeltilir (eksi değer sıfır), parça başı süre elle yazılır', () => {
    kullanimDuzelt({ m: TEZGAH, p: 1, t: TAKIMLAR[1]! }, '-3');
    expect(state.wear['m1']![1]!.used).toBe(0);
    kullanimDuzelt({ m: TEZGAH, p: 1, t: TAKIMLAR[1]! }, '7,5');
    expect(state.wear['m1']![1]!.used).toBe(7.5);
    parcaSuresi({ m: TEZGAH, p: 1, t: TAKIMLAR[1]! }, '0');
    expect(state.ptime?.['m1']?.[1]).toEqual({ id: 'fm50', tp: 0.01 });
  });
  it('depo adedi bir artar ya da azalır, sıfırın altına inmez', () => {
    state.inv = { em10: { qty: 0, demo: 1 } };
    const k = { key: 'em10' } as DepoKarti;
    depoAdedi(k, -1);
    expect(state.inv['em10']).toEqual({ qty: 0 });
    depoAdedi(k, 1);
    expect(state.inv['em10']!.qty).toBe(1);
  });
});

describe('örnek veri (210.1)', () => {
  it('yalnız çağrılınca yazılır, örnek işaretlidir ve temizle yalnız örneği siler', () => {
    state.inv = { dr8: { qty: 4 } };
    seedDemo(10 * 864e5);
    expect(state.lifeDemo).toBe('demo');
    expect(state.wear['m1']![0]).toMatchObject({ id: 'em10', demo: 1 });
    expect(state.wear['m1']![3]).toBeUndefined();
    expect(state.inv['em10']).toMatchObject({ demo: 1 });
    expect(state.inv['dr8']).toEqual({ qty: 4 });
    expect(state.life.perDay).toBe(40);
    state.wear['m1']![2] = { id: 'dr8', used: 3, parts: 1, since: 1 };
    clearDemo();
    expect(state.lifeDemo).toBe('cleared');
    expect(Object.keys(state.wear['m1']!)).toEqual(['2']);
    expect(state.inv).toEqual({ dr8: { qty: 4 } });
  });
});
