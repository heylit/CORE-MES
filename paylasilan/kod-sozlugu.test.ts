import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kodTuru } from './kod-sozlugu.ts';

test('kod sözlüğü: her önek kendi türüne yönlendirir', () => {
  assert.deepEqual(kodTuru('LOC:A-01-01'), { tur: 'konum', deger: 'A-01-01' });
  assert.deepEqual(kodTuru('MLZ:901'), { tur: 'malzeme', deger: '901' });
  assert.deepEqual(kodTuru('LOT:LT-000123'), { tur: 'lot', deger: 'LT-000123' });
  assert.deepEqual(kodTuru('UE:4512'), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('RAF:A12'), { tur: 'raf', deger: 'A12' });
  assert.deepEqual(kodTuru('UE:UE-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
});

test('kod sözlüğü: öneksiz emir ve lot numarası tanınır', () => {
  assert.deepEqual(kodTuru('UE-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
  assert.deepEqual(kodTuru('LT-000123'), { tur: 'lot', deger: 'LT-000123' });
});

test('kod sözlüğü: büyük-küçük harf ve boşluk sonucu değiştirmez', () => {
  assert.deepEqual(kodTuru('  loc : a-01-01 \n'), { tur: 'konum', deger: 'A-01-01' });
  assert.deepEqual(kodTuru('Mlz: 901'), { tur: 'malzeme', deger: '901' });
  assert.deepEqual(kodTuru('lot:lt-000123'), { tur: 'lot', deger: 'LT-000123' });
  assert.deepEqual(kodTuru(' raf : a12 '), { tur: 'raf', deger: 'A12' });
  assert.deepEqual(kodTuru(' ue : 4512 '), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' });
  assert.deepEqual(kodTuru('ue-004512'), { tur: 'uretim-emri', deger: 'UE-004512', bicim: 'no' });
  assert.deepEqual(kodTuru(' lt-000123'), { tur: 'lot', deger: 'LT-000123' });
});

test('kod sözlüğü: tanınmayan, boş ya da biçimi tutmayan kod "bilinmiyor" döner, ham değer kırpılarak kalır', () => {
  for (const ham of ['', '   ', 'XYZ:12', 'A-01-01', '901', 'LOC:', 'LOT:', 'RAF:', 'MLZ:abc', 'MLZ:', 'UE:abc', 'UE:', 'UE-', 'LT-', 'UE-12A', 'IE:5']) {
    assert.deepEqual(kodTuru(ham), { tur: 'bilinmiyor', deger: ham.trim() }, ham);
  }
  assert.deepEqual(kodTuru(' xyz:12 '), { tur: 'bilinmiyor', deger: 'xyz:12' });
});
