import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { hataYonetiminiKur } from './uygulama.ts';

// Sınırı aşan gövde (Fastify 413) isteğin okunamadığı anlamına gelmez: kullanıcı ne yapacağını bilsin diye ayrı kodla döner.
test('sınırı aşan istek gövdesi 413 COK_BUYUK ve anlaşılır iletiyle döner; bozuk JSON 400 kalır', async () => {
  const app = Fastify({ bodyLimit: 64 });
  hataYonetiminiKur(app);
  app.post('/yaz', async () => ({ tamam: true }));
  const buyuk = await app.inject({
    method: 'POST', url: '/yaz', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ metin: 'x'.repeat(200) }),
  });
  assert.equal(buyuk.statusCode, 413, buyuk.body);
  assert.equal(buyuk.json().kod, 'COK_BUYUK');
  assert.match(buyuk.json().mesaj, /büyük/);
  const bozuk = await app.inject({ method: 'POST', url: '/yaz', headers: { 'content-type': 'application/json' }, payload: '{bozuk' });
  assert.equal(bozuk.statusCode, 400);
  assert.equal(bozuk.json().kod, 'DOGRULAMA');
});
