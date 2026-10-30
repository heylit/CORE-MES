import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { kapsamDisi } from './hata.ts';
import { retOlaylariniBosalt } from './red-kaydi.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

const KISILER: Record<string, Kullanici> = {
  goren: { id: 1, ad: 'goren', islemler: ['kisiler.oku'] },
  gormeyen: { id: 2, ad: 'gormeyen', islemler: ['sayfa.stok'] },
  firma: { id: 3, ad: 'firma', islemler: ['kisiler.oku'], disIzleyici: true },
  telefon: { id: 4, ad: 'telefon', islemler: ['kisiler.oku'], cihazProfili: 'telefon' },
};

function kur(uclar: readonly Uc[]): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, modul: 'finans', kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null });
  return app;
}

const okuma = uc({
  yontem: 'GET', yol: '/istasyonlar/:id', yetki: 'kisiler.oku', parametre: z.object({ id: z.coerce.number().int() }),
  cevap: z.object({ id: z.number() }),
  isle: ({ parametre }) => {
    if (parametre.id === 99) throw kapsamDisi();
    return { id: parametre.id };
  },
});

const iste = (app: FastifyInstance, url: string, ad?: string) =>
  app.inject({ method: 'GET', url, remoteAddress: '10.0.0.7', ...(ad === undefined ? {} : { headers: { 'x-kullanici': ad } }) });

test('izinli istek reddedilen istek kaydına girmez', async () => {
  const app = kur([okuma]);
  retOlaylariniBosalt();
  assert.equal((await iste(app, '/api/istasyonlar/1', 'goren')).statusCode, 200);
  assert.deepEqual(retOlaylariniBosalt().olaylar, []);
});

test('kapı reddi nedeni, kişisi, yol kalıbı ve cihazıyla yazılır; adresteki kimlik yazılmaz', async () => {
  const app = kur([okuma]);
  retOlaylariniBosalt();
  assert.equal((await iste(app, '/api/istasyonlar/5')).statusCode, 401);
  assert.equal((await iste(app, '/api/istasyonlar/5', 'gormeyen')).statusCode, 403);
  assert.equal((await iste(app, '/api/istasyonlar/5', 'firma')).statusCode, 403);
  assert.equal((await iste(app, '/api/istasyonlar/5', 'telefon')).statusCode, 403);
  const { olaylar } = retOlaylariniBosalt();
  assert.deepEqual(olaylar.map((o) => [o.neden, o.kisiId, o.yontem, o.yol, o.ip]), [
    ['oturum-yok', null, 'GET', '/istasyonlar/:id', '10.0.0.7'],
    ['yetki', 2, 'GET', '/istasyonlar/:id', '10.0.0.7'],
    ['dis-izleyici', 3, 'GET', '/istasyonlar/:id', '10.0.0.7'],
    ['cihaz', 4, 'GET', '/istasyonlar/:id', '10.0.0.7'],
  ]);
});

test('işleyicinin kapsam reddi kapıdan geçen kişiyle bir kez yazılır', async () => {
  const app = kur([okuma]);
  retOlaylariniBosalt();
  assert.equal((await iste(app, '/api/istasyonlar/99', 'goren')).statusCode, 403);
  const { olaylar } = retOlaylariniBosalt();
  assert.deepEqual(olaylar.map((o) => [o.neden, o.kisiId, o.yol]), [['kapsam', 1, '/istasyonlar/:id']]);
});

test('var olmayan adres sorgu dizgesi olmadan yazılır; cevap yine 404 ve aynı gövdedir', async () => {
  const app = kur([okuma]);
  retOlaylariniBosalt();
  const cevap = await iste(app, '/api/yonetim/yedek?anahtar=gizli', 'goren');
  assert.equal(cevap.statusCode, 404);
  assert.deepEqual(cevap.json(), { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  const { olaylar } = retOlaylariniBosalt();
  assert.deepEqual(olaylar.map((o) => [o.neden, o.kisiId, o.yol]), [['adres-yok', null, '/api/yonetim/yedek']]);
});
