import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur } from '#cekirdek/uygulama.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './servis.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

// 2226-5 a: yeniden girişte yalnız aynı tarayıcının eski anahtarı kapanır; kişinin öbür cihazları açık kalır.
describe('yeniden giriş: aynı tarayıcının eski oturumu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const kisiEkle = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));

  const giris = (kullaniciAdi: string, parola = PAROLA, cerez?: string) =>
    app.inject({
      method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola },
      ...(cerez === undefined ? {} : { headers: { cookie: cerez } }),
    });

  const anahtar = (cevap: Awaited<ReturnType<typeof giris>>): string => {
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };

  const ben = (cerez: string) => app.inject({ method: 'GET', url: '/api/test/ben', headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('oturum_yeniden_giris');
    app = Fastify();
    hataYonetiminiKur(app);
    const testUclari = [
      uc({
        yontem: 'GET', yol: '/test/ben', yetki: 'oturum', cevap: z.object({ id: z.number() }),
        isle: ({ kullanici }) => ({ id: kullanici.id }),
      }),
    ];
    uclariKaydet(app, [...oturumUclari(), ...testUclari], { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt) });
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('aynı tarayıcıda yeniden giriş eski anahtarı (ve kopyasını) kapatır, öbür cihaz açık kalır', async () => {
    await kisiEkle('yg-iki-cihaz');
    const bilgisayar = anahtar(await giris('yg-iki-cihaz'));
    const telefon = anahtar(await giris('yg-iki-cihaz'));
    const kopya = bilgisayar;

    const yeni = anahtar(await giris('yg-iki-cihaz', PAROLA, bilgisayar));
    assert.notEqual(yeni, bilgisayar);
    assert.equal((await ben(yeni)).statusCode, 200);
    assert.equal((await ben(kopya)).statusCode, 401);
    assert.equal((await ben(telefon)).statusCode, 200);
  });

  test('başarısız giriş eski oturumu kapatmaz', async () => {
    await kisiEkle('yg-hatali');
    const eski = anahtar(await giris('yg-hatali'));
    const cevap = await giris('yg-hatali', 'yanlis-parola-1', eski);
    assert.notEqual(cevap.statusCode, 200);
    assert.equal((await ben(eski)).statusCode, 200);
  });

  test('aynı tarayıcıda başka kişi girerse öncekinin bu tarayıcıdaki oturumu kapanır', async () => {
    await kisiEkle('yg-once');
    await kisiEkle('yg-sonra');
    const once = anahtar(await giris('yg-once'));
    const sonra = anahtar(await giris('yg-sonra', PAROLA, once));
    assert.equal((await ben(once)).statusCode, 401);
    assert.equal((await ben(sonra)).statusCode, 200);
  });
});
