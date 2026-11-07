import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { govdeTuruReddedilirMi, kaynakReddedilirMi } from './istek-kaynagi.ts';

const host = 'sunucu.local:4100';

describe('istek kaynağı (2226)', () => {
  it('aynı köken ve adres çubuğu geçer', () => {
    assert.equal(kaynakReddedilirMi({ secFetchSite: 'same-origin', origin: `http://${host}`, host }), false);
    assert.equal(kaynakReddedilirMi({ secFetchSite: 'none', origin: undefined, host }), false);
  });
  it('başka site ve aynı sitenin başka kapısı reddedilir', () => {
    assert.equal(kaynakReddedilirMi({ secFetchSite: 'cross-site', origin: 'http://kotu.example', host }), true);
    assert.equal(kaynakReddedilirMi({ secFetchSite: 'same-site', origin: 'http://sunucu.local:8080', host }), true);
  });
  it('Sec-Fetch-Site yoksa Origin adresle karşılaştırılır', () => {
    assert.equal(kaynakReddedilirMi({ secFetchSite: undefined, origin: `https://${host}`, host }), false);
    assert.equal(kaynakReddedilirMi({ secFetchSite: undefined, origin: 'http://sunucu.local:8080', host }), true);
    assert.equal(kaynakReddedilirMi({ secFetchSite: undefined, origin: 'null', host }), true);
  });
  it('tarayıcı dışı istek (başlıksız) geçer', () => {
    assert.equal(kaynakReddedilirMi({ secFetchSite: undefined, origin: undefined, host }), false);
  });
  it('gövdeli yazma yalnız JSON', () => {
    assert.equal(govdeTuruReddedilirMi('application/json; charset=utf-8', true), false);
    assert.equal(govdeTuruReddedilirMi('text/plain', true), true);
    assert.equal(govdeTuruReddedilirMi('application/x-www-form-urlencoded', true), true);
    assert.equal(govdeTuruReddedilirMi(undefined, true), true);
    assert.equal(govdeTuruReddedilirMi('text/plain', false), false);
  });
});

describe('uç kapısında istek kaynağı (2226)', async () => {
  const { default: Fastify } = await import('fastify');
  const { z } = await import('zod');
  const { uc, uclariKaydet } = await import('./uc.ts');
  const { hataYonetiminiKur } = await import('./uygulama.ts');
  const bos = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
  const vt = { ...bos, tx: <T>(is: (db: typeof bos) => Promise<T>) => is(bos), okumaTx: <T>(is: (db: typeof bos) => Promise<T>) => is(bos), kapat: async () => undefined };
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, [
    uc({ yontem: 'POST', yol: '/deneme', yetki: 'acik', govde: z.object({ a: z.number() }).optional(), cevap: z.object({ tamam: z.literal(true) }), isle: () => ({ tamam: true as const }) }),
    uc({ yontem: 'GET', yol: '/deneme', yetki: 'acik', cevap: z.object({ tamam: z.literal(true) }), isle: () => ({ tamam: true as const }) }),
  ], { vt, kimlik: async () => null });

  it('aynı kökenden JSON yazma geçer; cevap nosniff ve no-store taşır', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/deneme', headers: { 'sec-fetch-site': 'same-origin', host: 'h:1' }, payload: { a: 1 } });
    assert.equal(c.statusCode, 200);
    assert.equal(c.headers['x-content-type-options'], 'nosniff');
    assert.equal(c.headers['cache-control'], 'private, no-store');
  });
  it('başka siteden yazma 403', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/deneme', headers: { 'sec-fetch-site': 'cross-site' }, payload: { a: 1 } });
    assert.equal(c.statusCode, 403);
  });
  it('eski tarayıcıda yabancı Origin 403, aynı Origin geçer', async () => {
    const red = await app.inject({ method: 'POST', url: '/api/deneme', headers: { origin: 'http://baska:8080', host: 'h:1' }, payload: { a: 1 } });
    assert.equal(red.statusCode, 403);
    const gec = await app.inject({ method: 'POST', url: '/api/deneme', headers: { origin: 'http://h:1', host: 'h:1' }, payload: { a: 1 } });
    assert.equal(gec.statusCode, 200);
  });
  it('text/plain gövde reddedilir, gövdesiz yazma geçer', async () => {
    const red = await app.inject({ method: 'POST', url: '/api/deneme', headers: { 'content-type': 'text/plain' }, payload: '{"a":1}' });
    assert.equal(red.statusCode, 422);
    assert.match(red.body, /JSON olmal/);
    const gec = await app.inject({ method: 'POST', url: '/api/deneme' });
    assert.equal(gec.statusCode, 200);
  });
  it('okuma süzülmez', async () => {
    const c = await app.inject({ method: 'GET', url: '/api/deneme', headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(c.statusCode, 200);
  });
});
