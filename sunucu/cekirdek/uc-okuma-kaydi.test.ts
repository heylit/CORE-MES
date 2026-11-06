import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gizli } from '#paylasilan/gizli.ts';
import type { Db, Veritabani } from './db.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { DenetimGirdisi, Denetle } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

// Kart 2158 (2158-4 a, 2158-8 a): sınırlı hesabın okuması cevap gitmeden kaydedilir; kaydedilemezse cevap verilmez.
const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

const ISLEMLER = ['kisiler.oku'] as Kullanici['islemler'];
const KISILER: Record<string, Kullanici> = {
  ic: { id: 1, ad: 'ic', islemler: ISLEMLER },
  sinirli: { id: 2, ad: 'sinirli', islemler: ISLEMLER, sinirli: { bitis: '2099-01-01', taahhut: true } },
};
const GIZLI_DEGER = 'cok-gizli-deger';

function uygulama(denetle: Denetle): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  const kimlik = async (istek: { headers: Record<string, unknown> }): Promise<Kullanici | null> =>
    KISILER[String(istek.headers['x-kullanici'])] ?? null;
  const cevap = z.object({ veri: z.string() });
  uclariKaydet(app, [
    uc({
      yontem: 'GET', yol: '/kayit/:id', yetki: 'kisiler.oku', cevap,
      parametre: z.object({ id: z.coerce.number().int() }),
      sorgu: z.object({ q: z.string().optional(), anahtar: gizli(z.string()).optional() }),
      isle: () => ({ veri: 'ic-veri' }),
    }),
  ], { vt, kimlik, denetle, modul: 'kayit' });
  uclariKaydet(app, [uc({ yontem: 'GET', yol: '/oturum-ben', yetki: 'oturum', cevap, isle: () => ({ veri: 'ben' }) })], {
    vt, kimlik, denetle, modul: 'oturum',
  });
  return app;
}

const dene = (app: FastifyInstance, yol: string, ad: string) =>
  app.inject({ method: 'GET', url: `/api${yol}`, headers: { 'x-kullanici': ad } });

test('2158-4 a: sınırlı hesabın okuması okuma kipinde, yol ve kimlikle kaydedilir; gizli işaretli sorgu değeri çekirdekte maskelenir', async () => {
  const kayitlar: DenetimGirdisi[] = [];
  const app = uygulama(async (_db, girdi) => { kayitlar.push(girdi); });
  const c = await dene(app, `/kayit/7?q=ara&anahtar=${GIZLI_DEGER}`, 'sinirli');
  assert.equal(c.statusCode, 200);
  assert.equal(kayitlar.length, 1);
  const [k] = kayitlar;
  assert.equal(k?.kip, 'okuma');
  assert.equal(k?.kisiId, 2);
  assert.equal(k?.yol, '/kayit/:id');
  assert.equal(k?.modul, 'kayit');
  assert.deepEqual(k?.parametre, { id: 7 });
  assert.deepEqual(k?.sorgu, { q: 'ara', anahtar: '[gizli]' });
  assert.equal(JSON.stringify(kayitlar).includes(GIZLI_DEGER), false);
});

test('2158-4 a: iç hesabın okuması ve sınırlı hesabın oturum modülündeki okuması kaydedilmez', async () => {
  const kayitlar: DenetimGirdisi[] = [];
  const app = uygulama(async (_db, girdi) => { kayitlar.push(girdi); });
  assert.equal((await dene(app, '/kayit/7', 'ic')).statusCode, 200);
  assert.equal((await dene(app, '/oturum-ben', 'sinirli')).statusCode, 200);
  assert.deepEqual(kayitlar, []);
});

test('2158-8 a: okuma kaydı yazılamazsa sınırlı hesap 500 alır ve veri cevaba girmez', async () => {
  const app = uygulama(async () => { throw new Error('kayıt yazılamadı'); });
  const c = await dene(app, '/kayit/7', 'sinirli');
  assert.equal(c.statusCode, 500);
  assert.equal(c.body.includes('ic-veri'), false);
  assert.equal((await dene(app, '/kayit/7', 'ic')).statusCode, 200);
});
