import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { SIKISTIRMA_ESIGI, uc, uclariKaydet } from './uc.ts';
import type { Kimlik, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const okuyan: Kimlik = async () => ({ id: 2, ad: 'okuyan', islemler: ['kisiler.oku'] });
const yetkisiz: Kimlik = async () => ({ id: 3, ad: 'yetkisiz', islemler: [] });

function kur(uclar: readonly Uc[], kimlik: Kimlik = okuyan): FastifyInstance {
  const db: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
  const sar = async <T>(is: (db: Db) => Promise<T>): Promise<T> => is(db);
  const vt: Veritabani = { ...db, tx: sar, okumaTx: sar, kapat: async () => undefined };
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik });
  return app;
}

const metinCevabi = z.object({ metin: z.string() });
const oku = (yol: string, metin: () => string, onbellek?: 'etag'): Uc =>
  uc({ yontem: 'GET', yol, yetki: 'kisiler.oku', cevap: metinCevabi, ...(onbellek ? { onbellek } : {}), isle: () => ({ metin: metin() }) });

const BUYUK = 'a'.repeat(SIKISTIRMA_ESIGI);
const KUCUK = 'a'.repeat(100);

test('sıkıştırma: eşiği aşan JSON gzip ister istemciye sıkışık gider; gövde aynıdır, Vary yazılır', async () => {
  const app = kur([oku('/buyuk', () => BUYUK)]);
  const cevap = await app.inject({ method: 'GET', url: '/api/buyuk', headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert.equal(cevap.statusCode, 200);
  assert.equal(cevap.headers['content-encoding'], 'gzip');
  assert.match(String(cevap.headers.vary), /accept-encoding/i);
  assert.match(String(cevap.headers['content-type']), /^application\/json/);
  assert.ok(cevap.rawPayload.length < SIKISTIRMA_ESIGI / 10, String(cevap.rawPayload.length));
  assert.deepEqual(JSON.parse(gunzipSync(cevap.rawPayload).toString('utf8')), { metin: BUYUK });
});

test('sıkıştırma: eşik altı, gzip istemeyen ya da gzip;q=0 diyen istek düz JSON alır', async () => {
  const app = kur([oku('/buyuk', () => BUYUK), oku('/kucuk', () => KUCUK)]);
  const kucuk = await app.inject({ method: 'GET', url: '/api/kucuk', headers: { 'accept-encoding': 'gzip' } });
  assert.equal(kucuk.headers['content-encoding'], undefined);
  assert.deepEqual(kucuk.json(), { metin: KUCUK });
  for (const kodlama of [undefined, 'br, deflate', 'gzip;q=0', 'identity']) {
    const cevap = await app.inject({ method: 'GET', url: '/api/buyuk', headers: kodlama === undefined ? {} : { 'accept-encoding': kodlama } });
    assert.equal(cevap.headers['content-encoding'], undefined, String(kodlama));
    assert.match(String(cevap.headers.vary), /accept-encoding/i, String(kodlama));
    assert.deepEqual(cevap.json(), { metin: BUYUK }, String(kodlama));
  }
});

test('ETag: aynı gövde aynı etiketi alır; If-None-Match tutarsa 304 ve gövdesiz, gövde değişince 200; önbellek özeldir', async () => {
  let metin = 'ilk';
  const app = kur([oku('/harita', () => metin, 'etag')]);
  const ilk = await app.inject({ method: 'GET', url: '/api/harita' });
  assert.equal(ilk.statusCode, 200);
  const etiket = String(ilk.headers.etag);
  assert.match(etiket, /^"[A-Za-z0-9_-]+"$/);
  assert.equal(ilk.headers['cache-control'], 'private, no-cache');
  const ayni = await app.inject({ method: 'GET', url: '/api/harita', headers: { 'if-none-match': etiket } });
  assert.equal(ayni.statusCode, 304);
  assert.equal(ayni.body, '');
  assert.equal(ayni.headers.etag, etiket);
  assert.equal(ayni.headers['cache-control'], 'private, no-cache');
  metin = 'değişti';
  const yeni = await app.inject({ method: 'GET', url: '/api/harita', headers: { 'if-none-match': etiket } });
  assert.equal(yeni.statusCode, 200);
  assert.notEqual(yeni.headers.etag, etiket);
  assert.deepEqual(yeni.json(), { metin: 'değişti' });
});

test('ETag: yetkisiz ya da oturumsuz istek etiket tutsa da 304 almaz; ret döner', async () => {
  const etiket = String((await kur([oku('/harita', () => 'ilk', 'etag')]).inject({ method: 'GET', url: '/api/harita' })).headers.etag);
  const yetkisizde = await kur([oku('/harita', () => 'ilk', 'etag')], yetkisiz)
    .inject({ method: 'GET', url: '/api/harita', headers: { 'if-none-match': etiket } });
  assert.equal(yetkisizde.statusCode, 403);
  assert.equal(yetkisizde.headers.etag, undefined);
  const oturumsuz = await kur([oku('/harita', () => 'ilk', 'etag')], async () => null)
    .inject({ method: 'GET', url: '/api/harita', headers: { 'if-none-match': etiket } });
  assert.equal(oturumsuz.statusCode, 401);
  assert.equal(oturumsuz.headers.etag, undefined);
});

test('ETag seçeneği olmayan uç etiket yazmaz, If-None-Match yok sayılır', async () => {
  const app = kur([oku('/liste', () => 'x')]);
  const cevap = await app.inject({ method: 'GET', url: '/api/liste', headers: { 'if-none-match': '"x"' } });
  assert.equal(cevap.statusCode, 200);
  assert.equal(cevap.headers.etag, undefined);
});

test('ETag yalnız GET ucunda verilebilir', () => {
  assert.throws(
    () => uc({ yontem: 'POST', yol: '/yaz', yetki: 'kisiler.oku', cevap: metinCevabi, onbellek: 'etag', isle: () => ({ metin: '' }) }),
    /Önbellek etiketi yalnız GET ucunda/,
  );
});
