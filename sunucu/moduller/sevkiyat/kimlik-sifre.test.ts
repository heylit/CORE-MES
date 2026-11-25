import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import { anahtarCoz, kimlikCoz, kimlikMaskele, kimlikSifrele } from './kimlik-sifre.ts';

// Değerler sentetiktir (gerçek kimlik no değil).
const ORN = '00000000000';
describe('şoför kimlik no şifreleme', () => {
  const anahtar = randomBytes(32);
  test('gidiş dönüş; şifreli metin değeri içermez, her seferinde farklıdır', () => {
    const a = kimlikSifrele(ORN, anahtar);
    assert.equal(kimlikCoz(a, anahtar), ORN);
    assert.equal(a.includes(ORN), false);
    assert.notEqual(a, kimlikSifrele(ORN, anahtar));
  });
  test('yanlış anahtar, oynanmış ve bozuk değer null verir', () => {
    const a = kimlikSifrele(ORN, anahtar);
    assert.equal(kimlikCoz(a, randomBytes(32)), null);
    const p = a.split('.');
    assert.equal(kimlikCoz([p[0], p[1], p[2], 'AAAA'].join('.'), anahtar), null);
    assert.equal(kimlikCoz('bozuk', anahtar), null);
  });
  test('kısaltılmış doğrulama etiketi reddedilir (Risk N1)', () => {
    const p = kimlikSifrele(ORN, anahtar).split('.');
    const kisa = Buffer.from(p[2] ?? '', 'base64url').subarray(0, 4).toString('base64url');
    assert.equal(kimlikCoz([p[0], p[1], kisa, p[3]].join('.'), anahtar), null);
  });
  test('anahtar 32 bayt base64 olmalı; yoksa ya da kısaysa alan kapalı', () => {
    assert.equal(anahtarCoz(undefined), null);
    assert.equal(anahtarCoz(''), null);
    assert.equal(anahtarCoz(randomBytes(16).toString('base64')), null);
    assert.equal(anahtarCoz(randomBytes(32).toString('base64'))?.length, 32);
  });
  test('maske son üç haneyi bırakır', () => {
    assert.equal(kimlikMaskele('12345678901'), '********901');
    assert.equal(kimlikMaskele('12'), '**');
  });
});
