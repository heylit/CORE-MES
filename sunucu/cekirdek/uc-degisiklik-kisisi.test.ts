import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { veritabaniAc } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Kimlik } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

// Defter tetiği kişiyi ortak sözleşmedeki ifadeyle okur; test aynı ifadeyi kullanır ki tetik ile uç aynı şeyi görsün.
const KISI_IFADESI = "NULLIF(current_setting('tmiv2.kisi_id', true), '')::int";

describe('yazma ucu değişikliği yapan kişiyi transaction ayarına yazar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  // Tek bağlantılı havuz: bir isteğin ayarı sonraki işe sızsaydı aynı bağlantıda görünürdü.
  let tekBaglanti: Veritabani | undefined;
  let app: FastifyInstance;

  const vt = (): Veritabani => {
    if (!tekBaglanti) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return tekBaglanti;
  };
  const kayitlar = async (): Promise<Array<{ ad: string; kisi_id: number | null }>> =>
    vt().sorgu('SELECT ad, kisi_id FROM kisi_izi ORDER BY id');

  const kimlik: Kimlik = async (istek) => {
    if (istek.headers['x-kim'] === 'yetkili') return { id: 7, ad: 'deneme', islemler: ['kisiler.yaz'] };
    if (istek.headers['x-kim'] === 'yetkisiz') return { id: 8, ad: 'deneme', islemler: [] };
    return null;
  };

  before(async () => {
    ortam = await testSemasiAc('ucdegkisi');
    await ortam.sahip.sorgu(`
      CREATE TABLE kisi_izi (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad text NOT NULL, kisi_id int);
      CREATE TABLE kalem (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad text NOT NULL);
      CREATE FUNCTION kisi_izi_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        INSERT INTO kisi_izi (ad, kisi_id) VALUES (NEW.ad, ${KISI_IFADESI});
        RETURN NEW;
      END $$;
      CREATE TRIGGER kalem_kisi AFTER INSERT ON kalem FOR EACH ROW EXECUTE FUNCTION kisi_izi_yaz();
    `);
    tekBaglanti = veritabaniAc(ortam.ayar, { sema: ortam.sema, havuzBoyutu: 1 });

    app = Fastify();
    hataYonetiminiKur(app);
    const govde = z.object({ ad: z.string(), kisi_id: z.number().optional() });
    const kisi = z.object({ kisi: z.number().nullable() });
    const bos = z.undefined();
    const ekle = async ({ db, govde: g }: { db: Db; govde: z.output<typeof govde> }): Promise<undefined> => {
      await db.sorgu('INSERT INTO kalem (ad) VALUES ($1)', [g.ad]);
      return undefined;
    };
    uclariKaydet(
      app,
      [
        uc({ yontem: 'POST', yol: '/oturumlu', yetki: 'oturum', govde, cevap: bos, isle: ekle }),
        uc({ yontem: 'POST', yol: '/islemli', yetki: 'kisiler.yaz', govde, cevap: bos, isle: ekle }),
        uc({ yontem: 'POST', yol: '/acik', yetki: 'acik', govde, cevap: bos, isle: ekle }),
        uc({
          yontem: 'GET', yol: '/okuma', yetki: 'oturum', cevap: kisi,
          isle: async ({ db }) => ({ kisi: (await db.tek<{ kisi: number | null }>(`SELECT ${KISI_IFADESI} AS kisi`))?.kisi ?? null }),
        }),
      ],
      { vt: vt(), kimlik },
    );
  });

  beforeEach(async () => {
    await vt().sorgu('DELETE FROM kisi_izi');
    await vt().sorgu('DELETE FROM kalem');
  });

  after(async () => {
    await tekBaglanti?.kapat();
    await ortam?.kaldir();
  });

  test('oturumlu ve işlemli yazma ucunda tetik oturumdaki kişiyi görür; gövdedeki kişi alanı yok sayılır', async () => {
    const ilk = await app.inject({ method: 'POST', url: '/api/oturumlu', headers: { 'x-kim': 'yetkili' }, payload: { ad: 'bir' } });
    assert.equal(ilk.statusCode, 204, ilk.body);
    const ikinci = await app.inject({
      method: 'POST', url: '/api/islemli', headers: { 'x-kim': 'yetkili' }, payload: { ad: 'iki', kisi_id: 99 },
    });
    assert.equal(ikinci.statusCode, 204, ikinci.body);
    assert.deepEqual(await kayitlar(), [{ ad: 'bir', kisi_id: 7 }, { ad: 'iki', kisi_id: 7 }]);
  });

  test('ayar transaction ile düşer: aynı bağlantıdaki sonraki kimliksiz uç, arka iş ve doğrudan sorgu kişi görmez', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/oturumlu', headers: { 'x-kim': 'yetkili' }, payload: { ad: 'uc' } })).statusCode, 204);
    assert.equal((await app.inject({ method: 'POST', url: '/api/acik', payload: { ad: 'acik' } })).statusCode, 204);
    await vt().tx((db) => db.sorgu("INSERT INTO kalem (ad) VALUES ('arka')"));
    await vt().sorgu("INSERT INTO kalem (ad) VALUES ('dogrudan')");
    assert.deepEqual(await kayitlar(), [
      { ad: 'uc', kisi_id: 7 }, { ad: 'acik', kisi_id: null }, { ad: 'arka', kisi_id: null }, { ad: 'dogrudan', kisi_id: null },
    ]);
  });

  test('okuma ucu kişi ayarı yazmaz', async () => {
    const cevap = await app.inject({ method: 'GET', url: '/api/okuma', headers: { 'x-kim': 'yetkili' } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { kisi: null });
  });

  test('reddedilen yazma (oturumsuz ya da işlemsiz) işleyiciye ulaşmaz, satır ve kişi izi bırakmaz', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/oturumlu', payload: { ad: 'oturumsuz' } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/islemli', headers: { 'x-kim': 'yetkisiz' }, payload: { ad: 'islemsiz' } })).statusCode, 403);
    assert.deepEqual(await kayitlar(), []);
  });
});
