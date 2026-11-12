import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { olcuListesi, olcuMetni } from './kurallar.ts';

describe('3121: ölçü sütununun yazımı (saf, kart föyündeki gibi)', () => {
  test('izinli: mm ölçüler × ile; çaplı formda Ø; mm dışı birim virgülden sonra; ondalık virgülle', () => {
    assert.equal(olcuMetni('cubuk', { d: 50, l: 3000 }), 'Ø50×3000 mm');
    assert.equal(olcuMetni('lama', { a: 20, b: 100, l: 500 }), '20×100×500 mm');
    assert.equal(olcuMetni('levha', { t: 2.5, w: 1000, l: 2000 }), '2,5×1000×2000 mm');
    assert.equal(olcuMetni('tel', { d: 2, L: 100 }), 'Ø2 mm, 100 m');
    assert.equal(olcuMetni('granul', { kg: 25 }), '25 kg');
  });
  test('yasak: bilinmeyen form, ölçüsüz kayıt ya da sayı olmayan ölçü uydurulmaz', () => {
    assert.equal(olcuMetni(null, { d: 50 }), null);
    assert.equal(olcuMetni('yok', { d: 50 }), null);
    assert.equal(olcuMetni('cubuk', null), null);
    assert.equal(olcuMetni('cubuk', { d: '50', l: null }), null);
    assert.equal(olcuMetni('cubuk', { d: 50 }), 'Ø50 mm');
  });
});

describe('3118: ölçü satırları adıyla ve birimiyle (saf)', () => {
  test('izinli: föydeki sırayla ad ve birimli değer; mm dışı birim kendi birimiyle', () => {
    assert.deepEqual(olcuListesi('cubuk', { d: 40, l: 3000 }), [{ ad: 'Çap', deger: '40 mm' }, { ad: 'Boy', deger: '3000 mm' }]);
    assert.deepEqual(olcuListesi('tel', { d: 2.5, L: 100 }), [{ ad: 'Çap', deger: '2,5 mm' }, { ad: 'Uzunluk', deger: '100 m' }]);
  });
  test('yasak: bilinmeyen form ya da sayı olmayan ölçü yazılmaz', () => {
    assert.deepEqual(olcuListesi('yok', { d: 1 }), []);
    assert.deepEqual(olcuListesi('cubuk', { d: '40' }), []);
  });
});
