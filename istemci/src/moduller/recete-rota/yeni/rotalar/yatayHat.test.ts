import { describe, expect, it } from 'vitest';
import { yeniAdim, type Adim, type Operasyon } from './kurallar.ts';
import { ANA_HAT, hatSeritleri, hatYerlesimi, zamanCizelgesi, type SureGirdisi } from './yatayHat.ts';

// Uydurma operasyon ve adımlar (gerçek veri değil).
const op: Operasyon = { id: '21', code: 'OP21', abbr: 'A21', name: 'Operasyon 21', group: 'KES', groupName: 'Kesim', stationId: '31', setup: 10, cycle: 3, aktif: true };
const adim = (id: string, seq: number, ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op, id), seq, opNo: seq, ...ek });
// Her adım: hazırlık 10 dk + 10 parça x 2 dk = 30 dk.
const sure = (): SureGirdisi => ({ dk: 30, hazirlikDk: 10, parcaDk: 2 });
const sutun = (l: Adim[]) => Object.fromEntries(hatYerlesimi(l).kolon);

describe('3248 yatay hat yerleşimi', () => {
  it('tek hatlı rota tek şeritte soldan sağa dizilir', () => {
    const l = [adim('a', 10), adim('b', 20), adim('c', 30)];
    expect(sutun(l)).toEqual({ a: 0, b: 1, c: 2 });
    expect(hatSeritleri(l)).toEqual([ANA_HAT]);
  });

  it('dal ayrıldığı adımın sağında başlar, birleştiren adım dalın sağına düşer', () => {
    const l = [adim('a', 10), adim('b', 20), adim('d1', 30, { dal: 'A' }), adim('d2', 40, { dal: 'A' }), adim('c', 50), adim('m', 60, { birlesen: ['A'] })];
    expect(sutun(l)).toEqual({ a: 0, b: 1, d1: 2, d2: 3, c: 2, m: 4 });
    expect(hatSeritleri(l)).toEqual([ANA_HAT, 'A']);
  });

  it('ana hat adımından önce başlayan dal (rotanın başından) soldan başlar', () => {
    const l = [adim('d1', 10, { dal: 'B' }), adim('a', 20), adim('b', 30), adim('m', 40, { birlesen: ['B'] })];
    expect(sutun(l)).toEqual({ d1: 0, a: 0, b: 1, m: 2 });
  });

  it('ilk adımı bağımsız dal çatalı beklemez, soldan başlar', () => {
    const l = [adim('a', 10), adim('b', 20), adim('d1', 30, { dal: 'C', dep: 'bagimsiz' }), adim('m', 40, { birlesen: ['C'] })];
    expect(sutun(l)).toMatchObject({ d1: 0, m: 2 });
  });
});

describe('3248 süre şeridi', () => {
  it('bağımlı adım öncülü bitince başlar; kritik yol bütün hat', () => {
    const z = zamanCizelgesi([adim('a', 10), adim('b', 20)], sure);
    expect(z.zaman.get('b')).toMatchObject({ bas: 30, bit: 60, kritik: true, altSira: 0 });
    expect(z.kritikDk).toBe(60);
    expect(z.bitis).toBe(60);
  });

  it('örtülü adım öncülün ilk parçası çıkınca başlar, öncülden önce bitmez ve alt satıra iner', () => {
    const z = zamanCizelgesi([adim('a', 10), adim('b', 20, { dep: 'ortulu', depQty: 1 })], sure);
    // a: 0-30; b: 10 + 2 = 12'de başlar, 12 + 30 = 42'de biter (a'nın bitişi + bir parça 32'den sonra).
    expect(z.zaman.get('b')).toMatchObject({ bas: 12, bit: 42, altSira: 1 });
    expect(z.altSatir.get(ANA_HAT)).toBe(2);
  });

  it('kısa örtülü adım öncülünden önce bitemez: en erken öncülün bitişi + kendi bir parçası', () => {
    const kisa = (a: Adim): SureGirdisi => (a.id === 'b' ? { dk: 5, hazirlikDk: 0, parcaDk: 0.5 } : sure());
    const z = zamanCizelgesi([adim('a', 10), adim('b', 20, { dep: 'ortulu', depQty: 1 })], kisa);
    // a: 0-30; b 12'de başlar, 12 + 5 = 17 a bitmeden olurdu: bitiş 30 + 0,5.
    expect(z.zaman.get('b')).toMatchObject({ bas: 12, bit: 30.5 });
  });

  it('örtülü ve bağımsız başlangıç yalnız aynı şeritte geçerli: dalın ilk adımı ayrıldığı adımın bitişini bekler', () => {
    const ortulu = zamanCizelgesi([adim('a', 10), adim('d1', 20, { dal: 'A', dep: 'ortulu', depQty: 1 }), adim('m', 30, { birlesen: ['A'] })], sure);
    expect(ortulu.zaman.get('d1')).toMatchObject({ bas: 30, bit: 60 });
    // Bağımsız birleştiren adım başka şeritteki birleşen dalı öncülle birlikte değil, dal bitince başlar (d1: 60-90).
    const bagimsiz = zamanCizelgesi([adim('a', 10), adim('b', 20), adim('d1', 30, { dal: 'A' }), adim('m', 40, { dep: 'bagimsiz', birlesen: ['A'] })], sure);
    expect(bagimsiz.zaman.get('d1')).toMatchObject({ bas: 60, bit: 90 });
    expect(bagimsiz.zaman.get('m')?.bas).toBe(90);
  });

  it('bağımsız adım (tek hat) öncülle birlikte başlar', () => {
    const z = zamanCizelgesi([adim('a', 10), adim('b', 20, { dep: 'bagimsiz' })], sure);
    expect(z.zaman.get('b')).toMatchObject({ bas: 0, bit: 30 });
  });

  it('birleştiren adım en geç biten dalı bekler; kritik yol o daldan geçer', () => {
    const uzun = (a: Adim): SureGirdisi => (a.id === 'd1' ? { dk: 100, hazirlikDk: 10, parcaDk: 9 } : sure());
    const l = [adim('a', 10), adim('d1', 20, { dal: 'A' }), adim('b', 30), adim('m', 40, { birlesen: ['A'] })];
    const z = zamanCizelgesi(l, uzun);
    expect(z.zaman.get('m')).toMatchObject({ bas: 130, kritik: true });
    expect(z.zaman.get('d1')?.kritik).toBe(true);
    expect(z.zaman.get('b')?.kritik).toBe(false);
    expect(z.kritikDk).toBe(30 + 100 + 30);
  });

  it('süresi hesaplanamayan adım uydurulmaz: sıfır uzunluk ve "süre yok"', () => {
    const z = zamanCizelgesi([adim('a', 10), adim('b', 20)], (a) => (a.id === 'a' ? { dk: null, hazirlikDk: 0, parcaDk: 0 } : sure()));
    expect(z.zaman.get('a')).toMatchObject({ bas: 0, bit: 0, sureYok: true });
    expect(z.zaman.get('b')).toMatchObject({ bas: 0, bit: 30 });
  });

  it('fason adım sabit genişlikte çizilir, atölye süresine eklenmez', () => {
    const l = [adim('a', 10), adim('f', 20, { fasonId: '9', stationId: null }), adim('b', 30)];
    const z = zamanCizelgesi(l, sure);
    expect(z.zaman.get('f')).toMatchObject({ fason: true, bas: 30, bit: 30 + z.fasonPayi });
    expect(z.kritikDk).toBe(60);
  });
});
