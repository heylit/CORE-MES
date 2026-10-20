import { describe, expect, it } from 'vitest';
import type { IkinciMenu } from './ikinci-menu.ts';
import { gecmisiIlerlet, sonYerler, yerAdi, type Gecmis } from './gezinme-gecmisi.ts';

const adim = (anahtar: string, yol = `/${anahtar}`) => ({ anahtar, yol });
const gecmis = (anahtarlar: string[], konum: number): Gecmis => ({ adimlar: anahtarlar.map((a) => adim(a)), konum });
const anahtarlar = (g: Gecmis) => g.adimlar.map((a) => a.anahtar);

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [{ maddeler: [
    { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'sayfa.stok' },
    { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'sayfa.stok' },
  ] }],
};

describe('gecmisiIlerlet', () => {
  it('yeni adım eklenir; geri dönülmüşken eklenen adım ileri adımları siler', () => {
    const g = gecmisiIlerlet(gecmis(['a', 'b', 'c'], 1), 'PUSH', adim('d'));
    expect(anahtarlar(g)).toEqual(['a', 'b', 'd']);
    expect(g.konum).toBe(2);
  });

  it('değiştirilen adım yerinde kalır, ileri adımlar silinmez', () => {
    const g = gecmisiIlerlet(gecmis(['a', 'b', 'c'], 1), 'REPLACE', adim('x', '/b?sayfa=2'));
    expect(anahtarlar(g)).toEqual(['a', 'x', 'c']);
    expect(g.adimlar[1]?.yol).toBe('/b?sayfa=2');
    expect(g.konum).toBe(1);
  });

  it('geri ya da ileri dönülen adım bilinen adımsa konum oraya geçer, liste değişmez', () => {
    const g = gecmisiIlerlet(gecmis(['a', 'b', 'c'], 2), 'POP', adim('a'));
    expect(anahtarlar(g)).toEqual(['a', 'b', 'c']);
    expect(g.konum).toBe(0);
    expect(gecmisiIlerlet(g, 'POP', adim('c')).konum).toBe(2);
  });

  it('reddedilen: bilinmeyen adıma dönülürse sayım o adımdan yeniden başlar, geri gidilecek yer kalmaz', () => {
    const g = gecmisiIlerlet(gecmis(['a', 'b'], 1), 'POP', adim('kabuktan-once'));
    expect(anahtarlar(g)).toEqual(['kabuktan-once']);
    expect(g.konum).toBe(0);
  });

  it('aynı adım yeniden bildirilirse geçmiş değişmez', () => {
    const once = gecmis(['a', 'b'], 1);
    expect(gecmisiIlerlet(once, 'PUSH', adim('b'))).toBe(once);
  });
});

describe('yerAdi', () => {
  it('ana sayfa, sayfa ve ikinci menü maddesi adlandırılır; sorgu ve çapa yok sayılır', () => {
    expect(yerAdi('/', [MENU])).toBe('Ana sayfa');
    expect(yerAdi('/rota', [MENU])).toBe('Rota');
    expect(yerAdi('/stok/okut?kod=1#ust', [MENU])).toBe('Stok Merkezi › Okut');
    expect(yerAdi('/stok', [MENU])).toBe('Stok Merkezi › İş kutusu');
  });

  it('reddedilen: hiçbir sayfaya ait olmayan yol sayfa adı uydurmaz', () => {
    expect(yerAdi('/olmayan-yer', [MENU])).toBe('TMI CORE');
  });
});

describe('sonYerler', () => {
  it('geri yönde en yakın başta; şimdiki yer ve tekrar eden yer bir kez bile yazılmaz', () => {
    const g: Gecmis = { adimlar: [adim('1', '/a'), adim('2', '/b'), adim('3', '/a'), adim('4', '/c'), adim('5', '/c'), adim('6', '/d')], konum: 4 };
    expect(sonYerler(g)).toEqual([{ yol: '/a', adim: -2 }, { yol: '/b', adim: -3 }]);
  });

  it('en çok on yer verir; ileri yöndeki adımlar listede yoktur', () => {
    const adimlar = Array.from({ length: 15 }, (_, i) => adim(String(i), `/y${i}`));
    const yerler = sonYerler({ adimlar, konum: 13 });
    expect(yerler).toHaveLength(10);
    expect(yerler[0]).toEqual({ yol: '/y12', adim: -1 });
    expect(yerler.some((y) => y.yol === '/y14')).toBe(false);
  });

  it('reddedilen: ilk adımda geri yer yoktur', () => {
    expect(sonYerler(gecmis(['a', 'b'], 0))).toEqual([]);
  });
});
