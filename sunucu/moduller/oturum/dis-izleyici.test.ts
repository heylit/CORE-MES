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

// Portal kapalıyken oturum dış izleyici işaretini (1224 a) portalın firma atamasından okumaz. Atama burada doğrudan portal
// deposuna yazılır; atama ucunun kendisi portal testlerindedir (BD-18) ve portal uygulamada kapalıdır (1067).
describe('dış izleyici: portal kapalıyken firma ataması oturumu etkilemez (gerçek PostgreSQL)', () => {
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

  test('portaldaki firma ataması oturumu etkilemez: kişi işaretsiz gelir, iç uca girer', async () => {
    const kisi = await kisiEkle('dis.atanmis');
    await firmaAta(kisi, 'p1');
    const { cerez, kullanici } = await girisYap('dis.atanmis');
    assert.equal(kullanici['disIzleyici'], undefined);
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 200);
    const ben = await iste('/oturum', cerez);
    assert.equal(ben.statusCode, 200);
    assert.equal(ben.json().kullanici.disIzleyici, undefined);
  });

  test('açık oturumda sonradan yapılan atama da bir sonraki isteği değiştirmez', async () => {
    const kisi = await kisiEkle('dis.sonradan');
    const { cerez } = await girisYap('dis.sonradan');
    await firmaAta(kisi, 'p1');
    assert.equal((await iste('/ic/okuma', cerez)).statusCode, 200);
  });
});
