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

// 1224 a: işaret portalın firma atamasından (1021 b) her istekte okunur. Atama burada doğrudan portal deposuna yazılır;
// atama ucunun kendisi portal testlerindedir (BD-18) ve portal uygulamada kapalıdır (1067).
describe('dış izleyici: firma kişisi yalnız portal ve oturum uçlarına girer (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const kisiEkle = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));

  const firmaAta = (kisiId: number, firma: unknown): Promise<unknown> =>
    vt().tx((db) => db.sorgu(
      `INSERT INTO portal_belge (yol, ust, kimlik, veri, surum) VALUES ($1, 'users', $2, $3, 1)
       ON CONFLICT (yol) DO UPDATE SET veri = EXCLUDED.veri, surum = portal_belge.surum + 1`,
      [`users/tmi-${kisiId}`, `tmi-${kisiId}`, JSON.stringify({ id: `tmi-${kisiId}`, partyId: firma })],
    ));

  const girisYap = async (kullaniciAdi: string): Promise<{ cerez: string; kullanici: Record<string, unknown> }> => {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return { cerez: String(cevap.headers['set-cookie']).split(';')[0] ?? '', kullanici: cevap.json().kullanici };
  };

  const iste = (yol: string, cerez: string) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('oturum_dis_izleyici');
    app = Fastify();
    hataYonetiminiKur(app);
    const kimlik = kimlikCozucu(ortam.vt);
    const icUc = uc({ yontem: 'GET', yol: '/ic/okuma', yetki: 'oturum', cevap: z.object({ id: z.number() }), isle: ({ kullanici }) => ({ id: kullanici.id }) });
    const portalUcu = uc({ yontem: 'GET', yol: '/portal/deneme', yetki: 'oturum', cevap: z.object({ id: z.number() }), isle: ({ kullanici }) => ({ id: kullanici.id }) });
    uclariKaydet(app, oturumUclari(), { vt: ortam.vt, kimlik, modul: 'oturum' });
    uclariKaydet(app, [icUc], { vt: ortam.vt, kimlik, modul: 'rota' });
    uclariKaydet(app, [portalUcu], { vt: ortam.vt, kimlik, modul: 'portal' });
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('firmaya atanmış kişi girişte işaretli gelir; iç uç 403, portal ve oturum ucu 200', async () => {
    const kisi = await kisiEkle('dis.atanmis');
    await firmaAta(kisi, 'p1');
    const { cerez, kullanici } = await girisYap('dis.atanmis');
    assert.equal(kullanici['disIzleyici'], true);
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 403);
    assert.equal((await iste('/portal/deneme', cerez)).statusCode, 200);
    const ben = await iste('/oturum', cerez);
    assert.equal(ben.statusCode, 200);
    assert.equal(ben.json().kullanici.disIzleyici, true);
  });

  test('açık oturumda atama yapılınca bir sonraki istek kapanır; atama firm yapılınca yeniden açılır', async () => {
    const kisi = await kisiEkle('dis.sonradan');
    const { cerez, kullanici } = await girisYap('dis.sonradan');
    assert.equal(kullanici['disIzleyici'], undefined);
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 200);
    await firmaAta(kisi, 'p1');
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 403);
    await firmaAta(kisi, 'firm');
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 200);
  });

  test('portal kullanıcısı olmayan ya da firma içi kişi iç kişidir; bozuk firma alanı dış sayılır', async () => {
    await kisiEkle('ic.kisi');
    const ic = await girisYap('ic.kisi');
    assert.equal((await iste('/ic/okuma', ic.cerez)).statusCode, 200);
    const bozuk = await kisiEkle('dis.bozuk');
    await firmaAta(bozuk, 7);
    const dis = await girisYap('dis.bozuk');
    assert.equal((await iste('/ic/okuma', dis.cerez)).statusCode, 403);
  });
});
