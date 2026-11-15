import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { uc, ucEnvanteri } from './uc.ts';

const ortak = { yontem: 'GET', yol: '/x', cevap: z.object({}), isle: () => ({}) } as const;

test("'oturum' ucu sahiplik beyanı olmadan tanımlanamaz; yanlış yazılmış değer bir tarafa sayılmaz", () => {
  // @ts-expect-error 'oturum' ucu sahiplik beyanı ister.
  assert.throws(() => uc({ ...ortak, yetki: 'oturum' }), /'oturum' ucu sahiplik beyanı ister \('kendi' \| 'yok'\): GET \/x/);
  // @ts-expect-error yalnız 'kendi' ve 'yok' yazılır.
  assert.throws(() => uc({ ...ortak, yetki: 'oturum', sahiplik: 'kendisi' }), /'oturum' ucu sahiplik beyanı ister/);
  assert.equal(uc({ ...ortak, yetki: 'oturum', sahiplik: 'kendi' }).sahiplik, 'kendi');
  assert.equal(uc({ ...ortak, yetki: 'oturum', sahiplik: 'yok' }).sahiplik, 'yok');
});

test('işlem isteyen, işlem listeli ve açık uç sahiplik beyanı almaz: yetki işlemdedir', () => {
  // @ts-expect-error yalnız 'oturum' ucunda verilir.
  assert.throws(() => uc({ ...ortak, yetki: 'kisiler.yaz', sahiplik: 'kendi' }), /Sahiplik beyanı yalnız 'oturum' ucunda verilir: GET \/x/);
  // @ts-expect-error yalnız 'oturum' ucunda verilir.
  assert.throws(() => uc({ ...ortak, yetki: { biri: ['kisiler.yaz'] }, sahiplik: 'yok' }), /Sahiplik beyanı yalnız 'oturum' ucunda/);
  // @ts-expect-error yalnız 'oturum' ucunda verilir.
  assert.throws(() => uc({ ...ortak, yetki: 'acik', sahiplik: 'yok' }), /Sahiplik beyanı yalnız 'oturum' ucunda/);
  assert.equal(uc({ ...ortak, yetki: 'kisiler.yaz' }).sahiplik, null);
  assert.equal(uc({ ...ortak, yetki: 'acik' }).sahiplik, null);
});

test('envanter beyanı yalnız oturum ucunda taşır', () => {
  const [kendi, islemli] = ucEnvanteri([uc({ ...ortak, yetki: 'oturum', sahiplik: 'kendi' }), uc({ ...ortak, yol: '/y', yetki: 'kisiler.yaz' })]);
  assert.equal(kendi?.sahiplik, 'kendi');
  assert.equal(islemli !== undefined && 'sahiplik' in islemli, false);
});
