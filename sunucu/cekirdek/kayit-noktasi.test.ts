import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { kayitNoktasi } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi, cakisma, mesgul } from './hata.ts';
import type { TekrarDeposu } from './tekrar.ts';
import { testSemasiAc } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Kimlik } from './uc.ts';

const pgKodu = (hata: unknown): unknown => (hata as { code?: unknown } | null)?.code;
// Sunucunun kendi hata kodunu üretir: kilitlenme ve sıralama çakışması iki bağlantıyla kurulunca kurbanı sunucu seçer.
const hataVer = (db: Db, kod: string): Promise<unknown> =>
  db.sorgu(`DO $$ BEGIN RAISE EXCEPTION 'deneme' USING ERRCODE = '${kod}'; END $$`);

describe('kayıt noktası (gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };
  const ekle = (db: Db, id: number, ad: string): Promise<unknown> =>
    db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [id, ad]);
  const aralik = async (bas: number): Promise<number[]> =>
    (await acik().sorgu<{ id: number }>('SELECT id FROM kalem WHERE id >= $1 AND id < $1 + 10 ORDER BY id', [bas])).map((k) => k.id);

  before(async () => {
    const ortam = await testSemasiAc('kayit_noktasi');
    ({ kaldir } = ortam);
    await ortam.sahip.sorgu('CREATE TABLE kalem (id int PRIMARY KEY, ad text NOT NULL)');
    await ortam.sahip.sorgu('CREATE TABLE anahtar (kimlik text PRIMARY KEY, cevap jsonb)');
    vt = ortam.vt;
  });

  after(async () => {
    await kaldir?.();
  });

  test('başarıda değer döner; iç ve dış yazılar kalıcıdır', async () => {
    const sonuc = await acik().tx(async (db) => {
      await ekle(db, 1, 'dış');
      const ic = await kayitNoktasi(db, async () => {
        await ekle(db, 2, 'iç');
        return 'bitti';
      });
      await ekle(db, 3, 'sonra');
      return ic;
    });
    assert.deepEqual(sonuc, { tamam: true, deger: 'bitti' });
    assert.deepEqual(await aralik(0), [1, 2, 3]);
  });

  test('uygulama hatası fırlamaz, döner; iç yazılar geri alınır, önceki ve sonraki dış yazılar kalır', async () => {
    const ret = cakisma('kural reddetti');
    const sonuc = await acik().tx(async (db) => {
      await ekle(db, 10, 'dış');
      const ic = await kayitNoktasi(db, async () => {
        await ekle(db, 11, 'iç');
        assert.equal((await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM kalem WHERE id = 11'))?.n, 1);
        throw ret;
      });
      await ekle(db, 12, 'ret kaydı');
      return ic;
    });
    assert.deepEqual(sonuc, { tamam: false, hata: ret, kisit: null });
    assert.equal(sonuc.tamam === false && sonuc.hata, ret);
    assert.deepEqual(await aralik(10), [10, 12]);
  });

  test('kısıt ihlalinden (23505) sonra transaction çalışmayı sürdürür ve kalıcı olur; ihlal uygulama hatası olarak döner', async () => {
    const sonuc = await acik().tx(async (db) => {
      await ekle(db, 20, 'dış');
      const ic = await kayitNoktasi(db, async () => {
        await ekle(db, 21, 'iç');
        await ekle(db, 20, 'çakışan');
      });
      // İptal durumundaki transaction'da bu okuma ve yazma reddedilirdi.
      assert.equal((await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM kalem WHERE id IN (20, 21)'))?.n, 1);
      await ekle(db, 22, 'ret kaydı');
      return ic;
    });
    assert.equal(sonuc.tamam, false);
    if (sonuc.tamam) return;
    assert.ok(sonuc.hata instanceof UygulamaHatasi);
    assert.equal(sonuc.hata.kod, 'CAKISMA');
    assert.deepEqual(sonuc.kisit, { pgKodu: '23505', kisit: 'kalem_pkey', tablo: 'kalem' });
    assert.deepEqual(await aralik(20), [20, 22]);
  });

  test('iç içe üç düzey: her ret yalnız kendi düzeyinin yazısını geri alır; dıştaki ret içtekilerin kalan yazısını da alır', async () => {
    await acik().tx(async (db) => {
      const dis = await kayitNoktasi(db, async () => {
        await ekle(db, 30, 'birinci düzey');
        const orta = await kayitNoktasi(db, async () => {
          await ekle(db, 31, 'ikinci düzey');
          const ic = await kayitNoktasi(db, async () => {
            await ekle(db, 32, 'üçüncü düzey');
            await ekle(db, 30, 'çakışan');
          });
          assert.equal(ic.tamam, false);
          // En içteki ret ikinci düzeyin yazısını almadı; ikinci düzey sürer.
          await ekle(db, 33, 'içten sonra');
        });
        assert.equal(orta.tamam, true);
        await ekle(db, 34, 'ortadan sonra');
      });
      assert.equal(dis.tamam, true);

      const geriAlinan = await kayitNoktasi(db, async () => {
        const orta = await kayitNoktasi(db, async () => {
          assert.equal((await kayitNoktasi(db, () => ekle(db, 35, 'başarılı en iç'))).tamam, true);
          await ekle(db, 36, 'başarılı orta');
        });
        assert.equal(orta.tamam, true);
        throw cakisma('dış ret');
      });
      assert.equal(geriAlinan.tamam, false);
      await ekle(db, 37, 'en son');
    });
    assert.deepEqual(await aralik(30), [30, 31, 33, 34, 37]);
  });

  test('art arda iki nokta: ilkinin reddi ikincisinin yazısını etkilemez', async () => {
    await acik().tx(async (db) => {
      assert.equal((await kayitNoktasi(db, () => ekle(db, 1, 'çakışan'))).tamam, false);
      assert.equal((await kayitNoktasi(db, () => ekle(db, 40, 'ikinci'))).tamam, true);
    });
    assert.deepEqual(await aralik(40), [40]);
  });

  test('dış transaction geri alınırsa başarılı noktanın yazısı da geri alınır', async () => {
    await assert.rejects(
      acik().tx(async (db) => {
        assert.equal((await kayitNoktasi(db, () => ekle(db, 50, 'iç'))).tamam, true);
        throw new Error('dış iş reddetti');
      }),
      /dış iş reddetti/,
    );
    assert.deepEqual(await aralik(50), []);
  });

  test('iş iptal eden hatayı yutup dönerse nokta başarı bildirmez: çağrının kendisi 25P02 ile reddeder', async () => {
    let noktaHatasi: unknown;
    await assert.rejects(
      acik().tx(async (db) => {
        await ekle(db, 60, 'dış');
        const nokta = kayitNoktasi(db, async () => {
          await ekle(db, 60, 'çakışan').catch(() => undefined);
        });
        noktaHatasi = await nokta.then(() => null, (h: unknown) => h);
        // Reddi yutan çağıran da kalıcı yazamaz.
      }),
      /iptal durumundaydı/,
    );
    assert.equal(pgKodu(noktaHatasi), '25P02');
    assert.deepEqual(await aralik(60), []);
  });

  test('okuma transaction\'ında, transaction dışında ve biten transaction\'ın db\'siyle açılamaz; iş hiç koşmaz', async () => {
    let kostu = 0;
    const is = async (): Promise<void> => { kostu += 1; };
    await assert.rejects(acik().okumaTx((db) => kayitNoktasi(db, is)), /okuma transaction'ında açılamaz/);
    await assert.rejects(kayitNoktasi(acik(), is), /yalnız yazma transaction'ının db'siyle/);
    let sakli: Db | undefined;
    await acik().tx(async (db) => {
      sakli = db;
      await db.sorgu('SELECT 1');
    });
    assert.ok(sakli);
    await assert.rejects(kayitNoktasi(sakli, is), /Transaction bitti/);
    assert.equal(kostu, 0);
    // Reddedilen denemeler bağlantıyı bozmadı: okuma transaction'ı ve havuz çalışıyor.
    assert.equal((await acik().okumaTx((db) => db.tek<{ n: number }>('SELECT 1 AS n')))?.n, 1);
  });

  test('noktaya dönülemiyorsa (bağlantı koptu) özgün hata fırlar; dış yazı kalıcı olmaz, havuz çalışmayı sürdürür', async () => {
    const ozgun = cakisma('bağlantı koparken gelen ret');
    await assert.rejects(
      acik().tx(async (db) => {
        await ekle(db, 70, 'dış');
        await kayitNoktasi(db, async () => {
          await db.sorgu('SELECT pg_terminate_backend(pg_backend_pid())').catch(() => undefined);
          throw ozgun;
        });
        assert.fail('nokta sonuç döndürmemeliydi');
      }),
      (hata) => hata === ozgun,
    );
    assert.deepEqual(await aralik(70), []);
  });

  test('geçici hata ret sayılmaz: kilitlenme, sıralama çakışması ve kilit süresi fırlar; iç yazı geri alınır, yakalayan transaction sürer', async () => {
    for (const [sira, kod] of ['40P01', '40001', '55P03'].entries()) {
      const taban = 80 + sira * 3;
      const firlayan = await acik().tx(async (db) => {
        await ekle(db, taban, 'dış');
        const hata: unknown = await kayitNoktasi(db, async () => {
          await ekle(db, taban + 1, 'iç');
          await hataVer(db, kod);
        }).then(() => null, (h: unknown) => h);
        await ekle(db, taban + 2, 'yakalayandan sonra');
        return hata;
      });
      assert.equal(pgKodu(firlayan), kod, kod);
    }
    assert.deepEqual(await aralik(80), [80, 82, 83, 85, 86, 88]);
  });

  test('sunucunun süre aşımı iptali (57014) fırlar; iç yazı geri alınır, yakalayan transaction sürer ve kalıcı olur', { timeout: 20_000 }, async () => {
    const firlayan = await acik().tx(async (db) => {
      await ekle(db, 90, 'dış');
      const hata: unknown = await kayitNoktasi(db, async () => {
        await ekle(db, 91, 'iç');
        await db.sorgu("SET LOCAL statement_timeout = '50ms'");
        await db.sorgu('SELECT pg_sleep(5)');
      }).then(() => null, (h: unknown) => h);
      await ekle(db, 92, 'yakalayandan sonra');
      return hata;
    });
    assert.equal(pgKodu(firlayan), '57014');
    assert.deepEqual(await aralik(90), [90, 92]);
  });

  test('beklenmeyen hata ve sunucu sınıfı uygulama hatası ret sayılmaz: aynı hata fırlar, iç yazı geri alınır', async () => {
    const hatalar = [new TypeError('kod kusuru'), mesgul()];
    for (const [sira, beklenen] of hatalar.entries()) {
      const taban = 100 + sira * 3;
      const firlayan = await acik().tx(async (db) => {
        const hata: unknown = await kayitNoktasi(db, async () => {
          await ekle(db, taban, 'iç');
          throw beklenen;
        }).then(() => null, (h: unknown) => h);
        await ekle(db, taban + 1, 'yakalayandan sonra');
        return hata;
      });
      assert.equal(firlayan, beklenen);
    }
    assert.deepEqual(await aralik(100), [101, 104]);
  });

  describe('uç katmanından', () => {
    const cevap = z.object({ reddedildi: z.boolean() });
    const KIMLIK = '6f1b2c3d-0000-4000-8000-00000000a211';
    const hatalar: unknown[] = [];
    let app: FastifyInstance | undefined;
    let kosma = 0;

    // Anahtarı işleyiciyle aynı db'ye yazar: uç katmanının işleyiciye verdiği db ile depoya verdiği aynı transaction'dır.
    const depo: TekrarDeposu = {
      async ayir(db, istek) {
        const yeni = await db.sorgu('INSERT INTO anahtar (kimlik) VALUES ($1) ON CONFLICT DO NOTHING RETURNING kimlik', [istek.istekKimligi]);
        if (yeni.length > 0) return null;
        const satir = await db.tek<{ cevap: unknown }>('SELECT cevap FROM anahtar WHERE kimlik = $1', [istek.istekKimligi]);
        return { govdeOzeti: istek.govdeOzeti, durumKodu: 200, cevap: satir?.cevap };
      },
      async sonucYaz(db, anahtar, sonuc) {
        await db.sorgu('UPDATE anahtar SET cevap = $2 WHERE kimlik = $1', [anahtar.istekKimligi, JSON.stringify(sonuc.cevap)]);
      },
      async birak(db, anahtar) {
        await db.sorgu('DELETE FROM anahtar WHERE kimlik = $1', [anahtar.istekKimligi]);
      },
    };

    before(() => {
      const isle = async ({ db }: { db: Db }): Promise<{ reddedildi: boolean }> => {
        kosma += 1;
        await ekle(db, 200 + kosma * 3, 'üst modülün yazısı');
        const alt = await kayitNoktasi(db, async () => {
          await ekle(db, 201 + kosma * 3, 'alt komutun yazısı');
          await ekle(db, 1, 'çakışan');
        });
        await ekle(db, 202 + kosma * 3, 'ret kaydı');
        return { reddedildi: !alt.tamam };
      };
      const kimlik: Kimlik = async () => ({ id: 7, ad: 'deneme', islemler: [] });
      app = Fastify();
      app.setErrorHandler((hata, _istek, yanit) => {
        hatalar.push(hata);
        return yanit.code(hata instanceof UygulamaHatasi ? hata.durum : 500).send({});
      });
      uclariKaydet(app, [
        uc({ yontem: 'POST', yol: '/kn/duz', yetki: 'oturum', cevap, isle }),
        uc({ yontem: 'POST', yol: '/kn/korumali', yetki: 'oturum', tekrarKorumali: true, cevap, isle }),
        uc({
          yontem: 'GET', yol: '/kn/oku', yetki: 'oturum', cevap,
          isle: async ({ db }) => ({ reddedildi: !(await kayitNoktasi(db, async () => undefined)).tamam }),
        }),
      ], { vt: acik(), kimlik, tekrar: depo });
    });

    after(async () => {
      await app?.close();
    });

    test('yazma ucunun işleyicisi (düz ve tekrar korumalı) nokta açar: alt ret geri alınır, üst yazılar ve saklı cevap kalır', async () => {
      assert.ok(app);
      const duz = await app.inject({ method: 'POST', url: '/api/kn/duz' });
      assert.deepEqual([duz.statusCode, duz.json()], [200, { reddedildi: true }], String((hatalar.at(-1) as Error | undefined)?.message));
      assert.deepEqual(await aralik(200), [203, 205]);

      const basliklar = { 'istek-kimligi': KIMLIK };
      const ilk = await app.inject({ method: 'POST', url: '/api/kn/korumali', headers: basliklar });
      assert.deepEqual([ilk.statusCode, ilk.json()], [200, { reddedildi: true }], String((hatalar.at(-1) as Error | undefined)?.message));
      assert.deepEqual(await aralik(200), [203, 205, 206, 208]);
      // Yineleme saklı cevabı alır: nokta, deponun aynı transaction'daki yazısını bozmadı.
      const yine = await app.inject({ method: 'POST', url: '/api/kn/korumali', headers: basliklar });
      assert.deepEqual([yine.statusCode, yine.json()], [200, { reddedildi: true }]);
      assert.equal(kosma, 2);
    });

    test('okuma ucunun işleyicisi nokta açamaz: açık hatayla 500', async () => {
      assert.ok(app);
      const once = hatalar.length;
      assert.equal((await app.inject({ method: 'GET', url: '/api/kn/oku' })).statusCode, 500);
      assert.equal(hatalar.length, once + 1);
      assert.match(String((hatalar.at(-1) as Error).message), /okuma transaction'ında açılamaz/);
    });
  });
});
