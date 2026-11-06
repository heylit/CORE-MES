import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { ikiliCevap, uc, uclariKaydet } from './uc.ts';
import type { Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

// Sınırlı hesaba rolünden yazma işlemi de verilmiş: kapı işlem listesine değil hesap türüne bakar.
const ISLEMLER = ['kisiler.oku', 'kisiler.yaz'] as Kullanici['islemler'];
const KISILER: Record<string, Kullanici> = {
  ic: { id: 1, ad: 'ic', islemler: ISLEMLER },
  sinirli: { id: 2, ad: 'sinirli', islemler: ISLEMLER, sinirli: { bitis: '2099-01-01', taahhut: true } },
  taahhutsuz: { id: 3, ad: 'taahhutsuz', islemler: ISLEMLER, sinirli: { bitis: '2099-01-01', taahhut: false } },
};

const cevap = z.object({ tamam: z.literal(true) });
const isle = (): { tamam: true } => ({ tamam: true });
const ucKur = (yol: string, yetki: Uc['yetki'], yontem: 'GET' | 'POST' = 'GET'): Uc => uc({ yontem, yol, yetki, cevap, isle });
const dosyaUcu = (yol: string): Uc => uc({
  yontem: 'GET', yol, yetki: 'kisiler.oku', cevap: ikiliCevap,
  isle: () => ({ tur: 'application/pdf', ad: 'a.pdf', boyut: 1, akis: async function* () { yield Buffer.from('x'); } }),
});

function uygulama(): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  const kimlik = async (istek: { headers: Record<string, unknown> }): Promise<Kullanici | null> =>
    KISILER[String(istek.headers['x-kullanici'])] ?? null;
  uclariKaydet(app, [
    ucKur('/rota/oku', 'kisiler.oku'), ucKur('/rota/oturumlu', 'oturum'),
    ucKur('/rota/yaz', 'kisiler.yaz', 'POST'), ucKur('/rota/oturumlu-yaz', 'oturum', 'POST'), dosyaUcu('/rota/dosya'),
  ], { vt, kimlik, modul: 'rota' });
  uclariKaydet(app, [ucKur('/oturum/ben', 'oturum'), ucKur('/hesabim/taahhut', 'oturum', 'POST'), dosyaUcu('/oturum/dosya')], {
    vt, kimlik, modul: 'oturum',
  });
  uclariKaydet(app, [ucKur('/modulsuz-yaz', 'oturum', 'POST')], { vt, kimlik });
  return app;
}

const dene = (app: FastifyInstance, yontem: 'GET' | 'POST', yol: string, ad: string) =>
  app.inject({ method: yontem, url: `/api${yol}`, headers: { 'x-kullanici': ad } });

test('2158-1 a: sınırlı hesap okur; yazma işlemi rolünde olsa da iç modülde yazamaz (403); iç kişi aynı uçlara girer', async () => {
  const app = uygulama();
  for (const yol of ['/rota/oku', '/rota/oturumlu']) assert.equal((await dene(app, 'GET', yol, 'sinirli')).statusCode, 200, yol);
  for (const yol of ['/rota/yaz', '/rota/oturumlu-yaz', '/modulsuz-yaz']) {
    const ret = await dene(app, 'POST', yol, 'sinirli');
    assert.equal(ret.statusCode, 403, yol);
    assert.equal(ret.json().kod, 'YETKI_YOK', yol);
    assert.equal((await dene(app, 'POST', yol, 'ic')).statusCode, 200, `ic ${yol}`);
  }
});

test('2158-1 a: sınırlı hesap yalnız oturum modülünde yazar (kendi parolası, taahhüt)', async () => {
  const app = uygulama();
  assert.equal((await dene(app, 'POST', '/hesabim/taahhut', 'sinirli')).statusCode, 200);
  assert.equal((await dene(app, 'GET', '/oturum/ben', 'sinirli')).statusCode, 200);
});

test('2158-6 c: sınırlı hesaba dosya hiç verilmez, oturum modülünde de; iç kişi indirir', async () => {
  const app = uygulama();
  for (const yol of ['/rota/dosya', '/oturum/dosya']) {
    assert.equal((await dene(app, 'GET', yol, 'sinirli')).statusCode, 403, yol);
    assert.equal((await dene(app, 'GET', yol, 'ic')).statusCode, 200, `ic ${yol}`);
  }
});

test('2158-5 a: taahhüt onaylanmadan sınırlı hesap oturum modülü dışında okuyamaz; oturum modülünde okur ve onaylar', async () => {
  const app = uygulama();
  for (const yol of ['/rota/oku', '/rota/oturumlu']) assert.equal((await dene(app, 'GET', yol, 'taahhutsuz')).statusCode, 403, yol);
  assert.equal((await dene(app, 'GET', '/oturum/ben', 'taahhutsuz')).statusCode, 200);
  assert.equal((await dene(app, 'POST', '/hesabim/taahhut', 'taahhutsuz')).statusCode, 200);
});
