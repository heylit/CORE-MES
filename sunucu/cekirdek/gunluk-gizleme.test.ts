import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import Fastify from 'fastify';
import { GIZLI_DEGER, gunlukSecenegi } from './uygulama.ts';

function yakalayanGunluk(): { satirlar: string[]; akis: Writable } {
  const satirlar: string[] = [];
  const akis = new Writable({ write(parca: Buffer, _k, bitti) { satirlar.push(parca.toString('utf8')); bitti(); } });
  return { satirlar, akis };
}

test('günlük: çerez, yetki ve set-cookie başlıkları gizlenir; başka alan yazılır', async () => {
  const secenek = gunlukSecenegi('canli');
  assert.notEqual(secenek, false);
  const { satirlar, akis } = yakalayanGunluk();
  const app = Fastify({ logger: { ...(secenek || {}), stream: akis } });
  app.log.warn({ req: { headers: { cookie: 'tmi_oturum=gizli-deger-1', authorization: 'Bearer gizli-deger-2' } } }, 'istek');
  app.log.warn({ res: { headers: { 'set-cookie': 'tmi_oturum=gizli-deger-3' } }, headers: { cookie: 'gizli-deger-4', 'user-agent': 'deneme-tarayici' } }, 'cevap');
  await app.close();
  const metin = satirlar.join('');
  for (const gizli of ['gizli-deger-1', 'gizli-deger-2', 'gizli-deger-3', 'gizli-deger-4']) assert.equal(metin.includes(gizli), false, gizli);
  assert.equal(metin.includes(GIZLI_DEGER), true);
  assert.equal(metin.includes('deneme-tarayici'), true);
});

test('günlük: gerçek istekte çerez günlüğe düşmez', async () => {
  const secenek = gunlukSecenegi('gelistirme');
  const { satirlar, akis } = yakalayanGunluk();
  const app = Fastify({ logger: { ...(secenek || {}), stream: akis } });
  app.get('/deneme', async () => ({ ok: true }));
  await app.inject({ method: 'GET', url: '/deneme', headers: { cookie: 'tmi_oturum=gizli-deger-5', authorization: 'Bearer gizli-deger-6' } });
  await app.close();
  const metin = satirlar.join('');
  assert.equal(metin.includes('/deneme'), true);
  assert.equal(metin.includes('gizli-deger-5') || metin.includes('gizli-deger-6'), false);
});

test('günlük: testte kapalı', () => {
  assert.equal(gunlukSecenegi('test'), false);
});
