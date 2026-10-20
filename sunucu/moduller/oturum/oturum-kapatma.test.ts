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
import { istektekiOturumOzeti, kimlikCozucu } from './servis.ts';
import { kisiOturumlariniKapat } from './sorgular.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

// Oturumları kapatan sorgunun kendisi (sayı, hariç tutma). Parola akışlarındaki kullanımı hesabim-parola.test.ts ve
// kisiler/yaris.test.ts sınar; burada yalnız kapatma davranışı vardır.
describe('oturum kapatma: bir kişinin oturumları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const kisiEkle = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));

  const girisYap = async (kullaniciAdi: string): Promise<string> => {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };

  const ben = (cerez: string) => app.inject({ method: 'GET', url: '/api/test/ben', headers: { cookie: cerez } });
  const kapat = async (cerez: string, haric: boolean): Promise<number> => {
    const cevap = await app.inject({ method: 'POST', url: `/api/test/kapat?haric=${haric ? 1 : 0}`, headers: { cookie: cerez } });
    assert.equal(cevap.statusCode, 200);
    return cevap.json().kapanan;
  };

  before(async () => {
    ortam = await testVeritabaniKur('oturum_disari');
    app = Fastify();
    hataYonetiminiKur(app);
    const secenek = { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt) };
    // Kapatma yalnız bu test uçlarından çağrılır; üretimde çağıran parola akışlarıdır.
    const testUclari = [
      uc({
        yontem: 'GET', yol: '/test/ben', yetki: 'oturum', cevap: z.object({ id: z.number() }),
        isle: ({ kullanici }) => ({ id: kullanici.id }),
      }),
      uc({
        yontem: 'POST', yol: '/test/kapat', yetki: 'oturum', sorgu: z.object({ haric: z.string() }),
        cevap: z.object({ kapanan: z.number() }),
        isle: async ({ db, kullanici, istek, sorgu }) => ({
          kapanan: await kisiOturumlariniKapat(db, kullanici.id, sorgu.haric === '1' ? istektekiOturumOzeti(istek) : null),
        }),
      }),
    ];
    uclariKaydet(app, [...oturumUclari(), ...testUclari], secenek);
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('hepsini kapatma: kişinin bütün oturumları biter, başkasının oturumu kalır', async () => {
    await kisiEkle('kapat-hepsi');
    await kisiEkle('kapat-baska');
    const a = await girisYap('kapat-hepsi');
    const b = await girisYap('kapat-hepsi');
    const baska = await girisYap('kapat-baska');
    assert.equal((await ben(a)).statusCode, 200);

    assert.equal(await kapat(a, false), 2);
    assert.equal((await ben(a)).statusCode, 401);
    assert.equal((await ben(b)).statusCode, 401);
    assert.equal((await ben(baska)).statusCode, 200);

    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'kapat-hepsi'");
    assert.equal(await vt().tx((db) => kisiOturumlariniKapat(db, kisi?.id ?? 0, null)), 0);
  });

  test('biri hariç kapatma: hariç tutulan oturum açık kalır, öbürleri 401 olur', async () => {
    await kisiEkle('kapat-haric');
    const a = await girisYap('kapat-haric');
    const b = await girisYap('kapat-haric');
    const c = await girisYap('kapat-haric');

    assert.equal(await kapat(b, true), 2);
    assert.equal((await ben(b)).statusCode, 200);
    assert.equal((await ben(a)).statusCode, 401);
    assert.equal((await ben(c)).statusCode, 401);
  });
});
