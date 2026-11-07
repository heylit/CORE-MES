import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { yetkiYok } from './hata.ts';
import { cevapBasligiYazilirMi, uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

describe('cevap başlığı izin denetimi (2233)', () => {
  it('protokol başlıkları yazılır; kapı, çerez ve gövde başlıkları yazılmaz', () => {
    assert.equal(cevapBasligiYazilirMi('Secure-Session-Challenge'), true);
    assert.equal(cevapBasligiYazilirMi('secure-session-registration'), true);
    for (const ad of ['Set-Cookie', 'cache-control', 'Content-Type', 'content-length', 'Vary', 'X-Content-Type-Options', 'Location']) {
      assert.equal(cevapBasligiYazilirMi(ad), false, ad);
    }
    assert.equal(cevapBasligiYazilirMi('kötü ad'), false);
    assert.equal(cevapBasligiYazilirMi(''), false);
  });
});

describe('uç kapısında başlık okuma ve yazma (2233)', async () => {
  const bos = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
  const vt = { ...bos, tx: <T>(is: (db: typeof bos) => Promise<T>) => is(bos), okumaTx: <T>(is: (db: typeof bos) => Promise<T>) => is(bos), kapat: async () => undefined };
  const app = Fastify();
  hataYonetiminiKur(app);
  const cevap = z.object({ gelen: z.string().nullable() });
  uclariKaydet(app, [
    uc({
      yontem: 'POST', yol: '/baslik', yetki: 'acik', cevap,
      isle: ({ istek }) => {
        istek.baslikYaz('Deneme-Cevap', 'evet');
        return { gelen: istek.baslik('Deneme-Istek') };
      },
    }),
    uc({
      yontem: 'POST', yol: '/baslik-red', yetki: 'acik', cevap,
      isle: ({ istek }) => {
        istek.baslikYaz('Secure-Session-Challenge', '"meydan";id="1"');
        throw yetkiYok();
      },
    }),
    uc({
      yontem: 'POST', yol: '/baslik-yasak', yetki: 'acik', cevap,
      isle: ({ istek }) => {
        istek.baslikYaz('Set-Cookie', 'a=b');
        return { gelen: null };
      },
    }),
    uc({
      yontem: 'POST', yol: '/baslik-satir', yetki: 'acik', cevap,
      isle: ({ istek }) => {
        istek.baslikYaz('Deneme-Cevap', 'a\r\nSet-Cookie: x=y');
        return { gelen: null };
      },
    }),
  ], { vt, kimlik: async () => null });

  it('işleyici istek başlığını okur, yazdığı başlık cevaba gider', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/baslik', headers: { 'deneme-istek': 'merhaba' } });
    assert.equal(c.statusCode, 200);
    assert.deepEqual(c.json(), { gelen: 'merhaba' });
    assert.equal(c.headers['deneme-cevap'], 'evet');
  });

  it('başlık yoksa null okunur', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/baslik' });
    assert.deepEqual(c.json(), { gelen: null });
  });

  it('yazılan başlık hata cevabında da kalır (403 meydan okuması)', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/baslik-red' });
    assert.equal(c.statusCode, 403);
    assert.equal(c.headers['secure-session-challenge'], '"meydan";id="1"');
  });

  it('çerez başlığı ve satır sonu içeren değer yazılamaz', async () => {
    const yasak = await app.inject({ method: 'POST', url: '/api/baslik-yasak' });
    assert.equal(yasak.statusCode, 500);
    assert.equal(yasak.headers['set-cookie'], undefined);
    const satir = await app.inject({ method: 'POST', url: '/api/baslik-satir' });
    assert.equal(satir.statusCode, 500);
    assert.equal(satir.headers['set-cookie'], undefined);
  });
});
