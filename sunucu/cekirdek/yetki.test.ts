import assert from 'node:assert/strict';
import { test } from 'node:test';
import { islemVarMi } from './yetki.ts';
import type { Kullanici } from './yetki.ts';

const kullanici = (islemler: Kullanici['islemler']): Kullanici => ({ id: 1, ad: 'deneme', islemler });

test('işlem yalnız listedeyse vardır; bir işlem ötekini kapsamaz', () => {
  const k = kullanici(['kisiler.yaz', 'sayfa.personel']);
  assert.equal(islemVarMi(k, 'kisiler.yaz'), true);
  assert.equal(islemVarMi(k, 'sayfa.personel'), true);
  assert.equal(islemVarMi(k, 'kisiler.oku'), false);
  assert.equal(islemVarMi(k, 'kisiler.rol-yonet'), false);
  assert.equal(islemVarMi(kullanici([]), 'kisiler.oku'), false);
});
