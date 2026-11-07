import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tuslariIsle } from './yonetici-olustur.ts';

test('gizli parola girişi: Enter bitirir, geri silme siler, Ctrl+C ve Ctrl+D iptal eder', () => {
  assert.deepEqual(tuslariIsle('', 'abc'), { deger: 'abc', bitti: false, iptal: false });
  assert.deepEqual(tuslariIsle('abc', 'd\r'), { deger: 'abcd', bitti: true, iptal: false });
  assert.deepEqual(tuslariIsle('abc', '\u007f\u007fx\n'), { deger: 'ax', bitti: true, iptal: false });
  assert.deepEqual(tuslariIsle('', '\u007f'), { deger: '', bitti: false, iptal: false });
  assert.deepEqual(tuslariIsle('gizli', '\u0003'), { deger: '', bitti: true, iptal: true });
  assert.deepEqual(tuslariIsle('gizli', '\u0004'), { deger: '', bitti: true, iptal: true });
  // Ok ve işlev tuşlarının kaçış dizileri parolaya girmez; Türkçe harf ve boşluk girer.
  assert.deepEqual(tuslariIsle('', '\u001b[Dşifre\u001b[3~ cümlesi\u001bOA\r'), { deger: 'şifre cümlesi', bitti: true, iptal: false });
});
