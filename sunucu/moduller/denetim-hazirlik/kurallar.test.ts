import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  KURULUM_ISARETI, ODA_SURESI_MS, baslangicBelgeleri, canliEsler, degistirebilirMi, derinBirlestir, durumYamala, erisebilirMi, kilitAlinirMi, sorgula, sonParca, ustYolu,
} from './kurallar.ts';
import type { DepoBelgesi } from './kurallar.ts';

const belge = (kimlik: string, veri: Record<string, unknown>): DepoBelgesi => ({ yol: `k/${kimlik}`, kimlik, veri, surum: 1 });

describe('denetim-hazirlik belge deposu kuralları', () => {
  test('BD-K1: yol üst koleksiyonuna ve kimliğine ayrılır', () => {
    assert.equal(ustYolu('channels/genel/msgs/m1'), 'channels/genel/msgs');
    assert.equal(sonParca('channels/genel/msgs/m1'), 'm1');
  });

  test('BD-K2: data/users/<kişi> yalnız o kişiye açık; data/users kimseye açık değil; öteki yollar herkese açık', () => {
    assert.equal(erisebilirMi('data/users/7/prefs', 7), true);
    assert.equal(erisebilirMi('data/users/7/prefs', 8), false);
    assert.equal(erisebilirMi('data/users/7', 7), true);
    assert.equal(erisebilirMi('data/users', 7), false);
    assert.equal(erisebilirMi('data/ayar', 7), true);
    assert.equal(erisebilirMi('orders/o1', 7), true);
  });

  test('BD-K3: birleştirme iç içe nesneleri birleştirir, diziyi ve düz değeri değiştirir, girdiyi değiştirmez', () => {
    const hedef = { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' };
    const sonuc = derinBirlestir(hedef, { a: { c: 3 }, d: [9], f: true });
    assert.deepEqual(sonuc, { a: { b: 1, c: 3 }, d: [9], e: 'x', f: true });
    assert.deepEqual(hedef, { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' });
  });

  test('BD-K4: sırasız sorgu kimliğe göre; sıralamada alanı olmayan sona düşer, eşitlikte kimlik belirler; sınır uygulanır', () => {
    const belgeler = [belge('c', { ts: 2 }), belge('a', { ts: 5 }), belge('b', {}), belge('d', { ts: 2 })];
    assert.deepEqual(sorgula(belgeler, {}).map((b) => b.kimlik), ['a', 'b', 'c', 'd']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'asc' } }).map((b) => b.kimlik), ['c', 'd', 'a', 'b']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'desc' }, sinir: 2 }).map((b) => b.kimlik), ['a', 'c']);
  });

  test('BD-K5: koşullar alanı olmayan belgeyi dışarıda bırakır; türler karışmaz', () => {
    const belgeler = [belge('a', { n: 1, t: ['x'] }), belge('b', { n: '1' }), belge('c', {}), belge('d', { n: 3 })];
    const kimlikler = (alan: string, islec: '==' | '!=' | '<' | '>=' | 'in' | 'not-in' | 'array-contains', deger: unknown) =>
      sorgula(belgeler, { filtreler: [{ alan, islec, deger }] }).map((b) => b.kimlik);
    assert.deepEqual(kimlikler('n', '==', 1), ['a']);
    assert.deepEqual(kimlikler('n', '!=', 1), ['b', 'd']);
    assert.deepEqual(kimlikler('n', '<', 3), ['a']);
    assert.deepEqual(kimlikler('n', '>=', 1), ['a', 'd']);
    assert.deepEqual(kimlikler('n', 'in', [3, '1']), ['b', 'd']);
    assert.deepEqual(kimlikler('n', 'not-in', [3]), ['a', 'b']);
    assert.deepEqual(kimlikler('t', 'array-contains', 'x'), ['a']);
  });

  test('BD-K6: kilit boşsa, süresi geçmişse ya da aynı sahibinse alınır; başkasının geçerli kilidi alınmaz', () => {
    assert.equal(kilitAlinirMi({ sahip: null, bitis: null }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 100 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's1', bitis: 500 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 500 }, 's1', 100), false);
  });

  test('BD-K7: oda durumu yamayla birleşir, null alanı siler; süresi geçen eş düşer', () => {
    assert.deepEqual(durumYamala({ a: 1, b: 2 }, { b: null, c: 3 }), { a: 1, c: 3 });
    const oda = new Map([[1, { durum: {}, guncellendi: 1000 }], [2, { durum: { yaziyor: 'genel' }, guncellendi: 1000 + ODA_SURESI_MS }]]);
    assert.deepEqual(canliEsler(oda, 1000 + ODA_SURESI_MS).map((e) => e.kisiId), [2]);
  });

  test('BD-K8: başlangıç belgeleri belge yoludur ve kurulum işareti varsa aralarındadır', () => {
    const belgeler = baslangicBelgeleri({ id: 5, ad: 'Deneme Kişi' }, 1_700_000_000_000);
    for (const b of belgeler) assert.equal(b.yol.split('/').length % 2, 0, b.yol);
    if (KURULUM_ISARETI === null) assert.deepEqual(belgeler, []);
    else assert.equal(belgeler.some((b) => b.yol === KURULUM_ISARETI), true);
  });

  test('BD-K9: ortak kayıt herkesin; öteki var olan belge yalnız oluşturanın', () => {
    assert.equal(degistirebilirMi('yerel/kalite-denetim', 8, 7), true);
    assert.equal(degistirebilirMi('channels/genel/msgs/m1', 7, 7), true);
    assert.equal(degistirebilirMi('channels/genel/msgs/m1', 8, 7), false);
    assert.equal(degistirebilirMi('channels/genel/msgs/m1', 8, null), false);
  });
});
