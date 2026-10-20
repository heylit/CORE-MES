import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from './db.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const SUNUCU_GOVDESI = { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' };
// Salt okunur transaction'da yazma denemesinin hata kodu (read_only_sql_transaction).
const SALT_OKUNUR_KODU = '25006';

const YAZMALAR = {
  ekle: "INSERT INTO okuma_kalem (ad) VALUES ('yeni')",
  guncelle: "UPDATE okuma_kalem SET ad = 'degisti' WHERE ad = 'ilk'",
  sil: "DELETE FROM okuma_kalem WHERE ad = 'yeni'",
} as const;
const ISLEMLER = ['ekle', 'guncelle', 'sil'] as const;

describe('okuma uçları salt okunur ve tek görüntüde koşar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const gunluk: string[] = [];
  // İşleyici ilk okumasını bitirince haber verir ve test salana dek ikinci okumaya geçmez.
  let ilkOkumaBitti: () => void = () => undefined;
  let devam: Promise<void> = Promise.resolve();

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const adlar = async (): Promise<string[]> =>
    (await vt().sorgu<{ ad: string }>('SELECT ad FROM okuma_kalem ORDER BY ad')).map((satir) => satir.ad);

  const hataKodlari = (): unknown[] =>
    gunluk
      .map((satir) => JSON.parse(satir) as { msg?: unknown; err?: { code?: unknown } })
      .filter((satir) => satir.msg === 'Beklenmeyen hata')
      .map((satir) => satir.err?.code);

  before(async () => {
    ortam = await testSemasiAc('ucokuma');
    await ortam.sahip.sorgu('CREATE TABLE okuma_kalem (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad text NOT NULL)');

    app = Fastify({ logger: { level: 'error', stream: { write: (satir: string) => { gunluk.push(satir); } } } });
    hataYonetiminiKur(app);
    const islem = z.object({ islem: z.enum(ISLEMLER) });
    const etkilenen = z.object({ etkilenen: z.number() });
    const yaz = async ({ db, parametre }: { db: Db; parametre: z.output<typeof islem> }): Promise<{ etkilenen: number }> =>
      ({ etkilenen: (await db.sorgu(`${YAZMALAR[parametre.islem]} RETURNING id`)).length });
    const say = async (db: Db): Promise<number> =>
      (await db.tek<{ sayi: number }>('SELECT count(*) AS sayi FROM okuma_kalem'))?.sayi ?? -1;
    uclariKaydet(
      app,
      [
        uc({ yontem: 'GET', yol: '/yaz/:islem', yetki: 'acik', parametre: islem, cevap: etkilenen, isle: yaz }),
        uc({ yontem: 'POST', yol: '/yaz/:islem', yetki: 'acik', parametre: islem, cevap: etkilenen, isle: yaz }),
        uc({
          yontem: 'GET', yol: '/iki-okuma', yetki: 'acik', cevap: z.object({ ilk: z.number(), ikinci: z.number() }),
          isle: async ({ db }) => {
            const ilk = await say(db);
            ilkOkumaBitti();
            await devam;
            return { ilk, ikinci: await say(db) };
          },
        }),
        uc({
          yontem: 'GET', yol: '/kodlu', yetki: 'acik', cevap: z.object({ sayi: z.number() }),
          isle: async ({ db, istek }) => {
            const sayi = await say(db);
            istek.durumKoduYaz(203);
            return { sayi };
          },
        }),
        uc({
          yontem: 'GET', yol: '/beklenmemis', yetki: 'acik', cevap: z.object({ sayi: z.number() }),
          isle: ({ db }) => {
            void db.sorgu('SELECT pg_sleep(0.2)').catch(() => undefined);
            return { sayi: 0 };
          },
        }),
      ],
      { vt: ortam.vt, kimlik: async () => null },
    );
  });

  // Kırmızıya dönen test satır bırakır; sonraki test onun artığıyla ikinci kez kırmızı olmasın.
  beforeEach(async () => {
    await vt().sorgu('DELETE FROM okuma_kalem');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('GET işleyicisinde ekleme, güncelleme ve silme veritabanında reddedilir: 500 SUNUCU, satırlar değişmez; aynı işler POST ile yazılır', async () => {
    await vt().sorgu("INSERT INTO okuma_kalem (ad) VALUES ('ilk'), ('yeni')");
    for (const islem of ISLEMLER) {
      gunluk.length = 0;
      const ret = await app.inject({ method: 'GET', url: `/api/yaz/${islem}` });
      assert.equal(ret.statusCode, 500, islem);
      assert.deepEqual(ret.json(), SUNUCU_GOVDESI, islem);
      // Reddeden veritabanıdır: başka bir hata da 500 verirdi.
      assert.deepEqual(hataKodlari(), [SALT_OKUNUR_KODU], islem);
      assert.deepEqual(await adlar(), ['ilk', 'yeni'], islem);
    }

    const sonuclar: string[][] = [];
    for (const islem of ISLEMLER) {
      const kabul = await app.inject({ method: 'POST', url: `/api/yaz/${islem}` });
      assert.equal(kabul.statusCode, 200, kabul.body);
      sonuclar.push(await adlar());
    }
    assert.deepEqual(sonuclar, [['ilk', 'yeni', 'yeni'], ['degisti', 'yeni', 'yeni'], ['degisti']]);
  });

  test('GET iki okuması arasında başka bağlantının yazdığını görmez; sonraki istek görür', async () => {
    await vt().sorgu("INSERT INTO okuma_kalem (ad) VALUES ('once')");
    let sal: () => void = () => undefined;
    devam = new Promise<void>((coz) => { sal = coz; });
    const ilkOkuma = new Promise<void>((coz) => { ilkOkumaBitti = coz; });

    const istek = app.inject({ method: 'GET', url: '/api/iki-okuma' });
    try {
      await ilkOkuma;
      // Yazı, işleyici ilk okumasını bitirdikten sonra ve ikincisinden önce kalıcı olur.
      await vt().sorgu("INSERT INTO okuma_kalem (ad) VALUES ('arada')");
      assert.deepEqual(await adlar(), ['arada', 'once']);
    } finally {
      sal();
    }
    const cevap = await istek;
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { ilk: 1, ikinci: 1 });

    ilkOkumaBitti = () => undefined;
    const sonraki = await app.inject({ method: 'GET', url: '/api/iki-okuma' });
    assert.deepEqual(sonraki.json(), { ilk: 2, ikinci: 2 });
  });

  test('GET okuma transaction içinde durum kodunu belirler; beklenmemiş sorgu bırakan GET 500 SUNUCU alır', async () => {
    const kodlu = await app.inject({ method: 'GET', url: '/api/kodlu' });
    assert.equal(kodlu.statusCode, 203);
    assert.deepEqual(kodlu.json(), { sayi: 0 });

    const beklenmemis = await app.inject({ method: 'GET', url: '/api/beklenmemis' });
    assert.equal(beklenmemis.statusCode, 500);
    assert.deepEqual(beklenmemis.json(), SUNUCU_GOVDESI);
    // Bağlantı havuza sağlam döndü: sonraki okuma çalışır.
    assert.equal((await app.inject({ method: 'GET', url: '/api/kodlu' })).statusCode, 203);
  });
});
