import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

const ISLEMLER = ['kisiler.oku', 'portal.oku'] as Kullanici['islemler'];
const KISILER: Record<string, Kullanici> = {
  ic: { id: 1, ad: 'ic', islemler: ISLEMLER },
  icAcik: { id: 2, ad: 'icAcik', islemler: ISLEMLER, disIzleyici: false },
  dis: { id: 3, ad: 'dis', islemler: ISLEMLER, disIzleyici: true },
};

const cevap = z.object({ tamam: z.literal(true) });
const isle = (): { tamam: true } => ({ tamam: true });
const ucKur = (yol: string, yetki: Uc['yetki'], yontem: 'GET' | 'POST' = 'GET'): Uc => uc({ yontem, yol, yetki, cevap, isle });

function kur(app: FastifyInstance, uclar: readonly Uc[], modul?: string): void {
  uclariKaydet(app, uclar, {
    vt, kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null, ...(modul === undefined ? {} : { modul }),
  });
}

function uygulama(): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  kur(app, [ucKur('/rota', 'oturum'), ucKur('/rota/oku', 'kisiler.oku'), ucKur('/rota/yaz', 'oturum', 'POST')], 'rota');
  kur(app, [ucKur('/portal', 'portal.oku'), ucKur('/portal/oturumlu', 'oturum')], 'portal');
  kur(app, [ucKur('/oturum/ben', 'oturum')], 'oturum');
  kur(app, [ucKur('/modulsuz', 'oturum')]);
  kur(app, [ucKur('/acik', 'acik')], 'rota');
  return app;
}

const dene = (app: FastifyInstance, yontem: 'GET' | 'POST', yol: string, ad: string) =>
  app.inject({ method: yontem, url: `/api${yol}`, headers: { 'x-kullanici': ad } });

test('dış izleyici (1224 a) iç modülün oturumlu ve işlemli uçlarında 403 alır; iç kişi aynı uçlara girer', async () => {
  const app = uygulama();
  for (const [yontem, yol] of [['GET', '/rota'], ['GET', '/rota/oku'], ['POST', '/rota/yaz'], ['GET', '/modulsuz']] as const) {
    const ret = await dene(app, yontem, yol, 'dis');
    assert.equal(ret.statusCode, 403, yol);
    assert.equal(ret.json().kod, 'YETKI_YOK', yol);
    for (const ad of ['ic', 'icAcik']) assert.equal((await dene(app, yontem, yol, ad)).statusCode, 200, `${ad} ${yol}`);
  }
});

test('dış izleyici portal ve oturum uçlarına işlemi kadar girer; açık uç herkese açık kalır', async () => {
  const app = uygulama();
  for (const yol of ['/portal', '/portal/oturumlu', '/oturum/ben', '/acik']) {
    assert.equal((await dene(app, 'GET', yol, 'dis')).statusCode, 200, yol);
  }
  const islemsiz = Fastify();
  hataYonetiminiKur(islemsiz);
  uclariKaydet(islemsiz, [ucKur('/portal/yonet', 'portal.yonet')], {
    vt, modul: 'portal', kimlik: async () => ({ id: 4, ad: 'dis', islemler: ISLEMLER, disIzleyici: true }),
  });
  assert.equal((await islemsiz.inject({ method: 'GET', url: '/api/portal/yonet' })).statusCode, 403);
});
