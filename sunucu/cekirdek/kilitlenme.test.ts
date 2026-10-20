import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { vtGeciciCakisma } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { gecersiz } from './hata.ts';
import { KILITLENME_YINELEME_SAYISI, kilitlenmedeYinele } from './kilitlenme.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const cevap = z.object({ tamam: z.boolean() });
const isle = () => ({ tamam: true });

// Sunucunun kendisinin ürettiği hata: sürücü onu gerçek kilitlenmeyle aynı sınıfta (pg.DatabaseError, aynı kod) verir.
const sunucuHatasi = (db: Db, kod: string): Promise<unknown> =>
  db.sorgu(`DO $$ BEGIN RAISE EXCEPTION 'deneme' USING ERRCODE = '${kod}'; END $$`);

test('kilitlenmede yineleme yalnız yazma ucunda tanımlanabilir; verilmezse kapalıdır', () => {
  const ortak = { yol: '/x', yetki: 'oturum', kilitlenmedeYinele: true, cevap, isle } as const;
  assert.throws(() => uc({ ...ortak, yontem: 'GET' }), /Kilitlenmede yineleme yalnız yazma ucunda verilebilir: GET \/x/);
  for (const yontem of ['POST', 'PUT', 'DELETE'] as const) assert.equal(uc({ ...ortak, yontem }).kilitlenmedeYinele, true);
  assert.equal(uc({ yontem: 'POST', yol: '/x', yetki: 'oturum', cevap, isle }).kilitlenmedeYinele, false);
});

test('kilitlenmedeYinele: geçici çakışmada her denemede yeni transaction açar, aralarda 10-50 ms bekler; tükenince son hatayı, başka hatayı ilk seferde verir', async () => {
  const vtHatasi = (code: string): Error => Object.assign(new pg.DatabaseError(`sunucu iletisi ${code}`, 0, 'error'), { code });
  // Sınıflayıcı yalnız sunucu hatasını tanır: kodu taşıyan sıradan nesne geçici sayılmaz.
  assert.equal(vtGeciciCakisma(Object.assign(new Error('x'), { code: '40P01' })), false);
  assert.deepEqual(['40P01', '40001', '23505', '57014', '55P03'].map((k) => vtGeciciCakisma(vtHatasi(k))), [true, true, false, false, false]);
  let tx = 0;
  const vt = { tx: async <S>(is: (db: Db) => Promise<S>): Promise<S> => { tx += 1; return is({ sorgu: async () => [], tek: async () => null }); } };

  for (const [rastgele, ms] of [[0, 10], [0.999999, 50]] as const) {
    tx = 0;
    const bekleme: number[] = [];
    const hatalar: Error[] = [];
    const sonuc = kilitlenmedeYinele(vt, async () => { const h = vtHatasi('40P01'); hatalar.push(h); throw h; }, { rastgele: () => rastgele, bekle: async (m) => { bekleme.push(m); } });
    await assert.rejects(sonuc, (h) => h === hatalar.at(-1));
    assert.deepEqual({ tx, bekleme }, { tx: 1 + KILITLENME_YINELEME_SAYISI, bekleme: Array<number>(KILITLENME_YINELEME_SAYISI).fill(ms) });
  }

  tx = 0;
  let deneme = 0;
  assert.equal(await kilitlenmedeYinele(vt, async () => { deneme += 1; if (deneme < 3) throw vtHatasi('40001'); return 'tamam'; }, { bekle: async () => undefined }), 'tamam');
  assert.equal(tx, 3);

  tx = 0;
  const bekleme: number[] = [];
  const ret = vtHatasi('23505');
  await assert.rejects(kilitlenmedeYinele(vt, async () => { throw ret; }, { bekle: async (m) => { bekleme.push(m); } }), (h) => h === ret);
  assert.deepEqual({ tx, bekleme }, { tx: 1, bekleme: [] });
});

describe('kilitlenmede yineleme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const sayac = new Map<string, number>();
  const say = (ad: string): number => { const n = (sayac.get(ad) ?? 0) + 1; sayac.set(ad, n); return n; };
  const vt = (): Veritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Kilitlenmeyi kuran rakip: uç 1. satırı kilitler, rakip 2. satırı; uç 2. satırı ister (önce bekleyen odur), rakip
  // 1. satırı isteyince sunucu önce bekleyeni, yani ucun transaction'ını düşürür. Rakip sonra kalıcı olur.
  let ucKilitledi: () => void = () => undefined;
  let rakipKilitledi: Promise<void> = Promise.resolve();
  let rakipKalici: Promise<void> = Promise.resolve();
  const rakipBaslat = (): Promise<void> => {
    const ucHazir = new Promise<void>((coz) => { ucKilitledi = coz; });
    let rakipHazir: () => void = () => undefined;
    rakipKilitledi = new Promise<void>((coz) => { rakipHazir = coz; });
    rakipKalici = vt().tx(async (db) => {
      await ucHazir;
      await db.sorgu('UPDATE kilit_deneme SET n = n + 10 WHERE id = 2');
      rakipHazir();
      // Sunucu her bekleyenin denetimini bir kez, kendi deadlock_timeout'u dolunca koşar; döngüyü ilk bulan düşer. Ucun
      // düşmesi için rakip, ucun denetiminden önce beklemeye girmeli, kendi denetimi de ucunkinden sonra gelmeli. Rakip bu
      // yüzden uç beklemeye başladıktan yarım süre sonra ister: pay iki yönde de yarım süre olur (hemen isteyince pay birkaç
      // ms'ydi ve CI yükünde kayboluyordu). Bekleme ve istek tek komutta, sunucunun içinde: Node'un olay döngüsü araya girmez.
      await db.sorgu(`DO $$
        BEGIN
          FOR i IN 1..2000 LOOP
            EXIT WHEN EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'transactionid' AND NOT granted
              AND transactionid::text = (pg_current_xact_id()::text::bigint % 4294967296)::text);
            IF i = 2000 THEN RAISE EXCEPTION 'uç 2. satırı beklemeye başlamadı'; END IF;
            PERFORM pg_sleep(0.005);
          END LOOP;
          PERFORM pg_sleep(extract(epoch FROM current_setting('deadlock_timeout')::interval) / 2);
          UPDATE kilit_deneme SET n = n + 10 WHERE id = 1;
        END $$`);
    });
    return rakipKalici;
  };

  const kilitlenen = uc({
    yontem: 'POST', yol: '/kilit/iki-satir', yetki: 'acik', kilitlenmedeYinele: true, cevap,
    isle: async ({ db }) => {
      const deneme = say('iki-satir');
      // Kurban düşünce bekleyen rakip uyanmadan yeni deneme 1. satırı kapabilir; o zaman rakip 1. satırı, deneme 2. satırı
      // bekler ve ikinci kilitlenme çıkar (CI yükünde görüldü). Yeni deneme bu yüzden rakibin kalıcı olmasını bekler.
      if (deneme > 1) await rakipKalici;
      await db.sorgu('UPDATE kilit_deneme SET n = n + 1 WHERE id = 1');
      if (deneme === 1) {
        ucKilitledi();
        await rakipKilitledi;
      }
      await db.sorgu('UPDATE kilit_deneme SET n = n + 1 WHERE id = 2');
      return { tamam: true };
    },
  });
  const uclar = [
    kilitlenen,
    uc({ yontem: 'POST', yol: '/kilit/hep', yetki: 'acik', kilitlenmedeYinele: true, cevap, isle: async ({ db }) => { say('hep'); await sunucuHatasi(db, '40P01'); return { tamam: true }; } }),
    uc({ yontem: 'POST', yol: '/kilit/serilestirme', yetki: 'acik', kilitlenmedeYinele: true, cevap, isle: async ({ db }) => { say('serilestirme'); await sunucuHatasi(db, '40001'); return { tamam: true }; } }),
    uc({ yontem: 'POST', yol: '/kilit/isaretsiz', yetki: 'acik', cevap, isle: async ({ db }) => { say('isaretsiz'); await sunucuHatasi(db, '40P01'); return { tamam: true }; } }),
    uc({ yontem: 'POST', yol: '/kilit/kural', yetki: 'acik', kilitlenmedeYinele: true, cevap, isle: () => { say('kural'); throw gecersiz('Kural reddi.'); } }),
    uc({ yontem: 'POST', yol: '/kilit/kisit', yetki: 'acik', kilitlenmedeYinele: true, cevap, isle: async ({ db }) => { say('kisit'); await db.sorgu('INSERT INTO kilit_deneme (id, n) VALUES (1, 0)'); return { tamam: true }; } }),
    uc({
      yontem: 'POST', yol: '/kilit/cerez', yetki: 'acik', kilitlenmedeYinele: true, cevap,
      isle: async ({ db, istek }) => {
        const deneme = say('cerez');
        istek.cerezYaz('deneme', String(deneme), 60);
        if (deneme === 1) await sunucuHatasi(db, '40P01');
        return { tamam: true };
      },
    }),
    uc({ yontem: 'POST', yol: '/kilit/sure', yetki: 'acik', kilitlenmedeYinele: true, cevap, isle: async ({ db }) => { say('sure'); await sunucuHatasi(db, '57014'); return { tamam: true }; } }),
  ];

  before(async () => {
    ortam = await testSemasiAc('kilit');
    await ortam.sahip.sorgu('CREATE TABLE kilit_deneme (id int PRIMARY KEY, n int NOT NULL)');
    await ortam.sahip.sorgu('INSERT INTO kilit_deneme (id, n) VALUES (1, 0), (2, 0)');
    await ortam.sahip.sorgu(`GRANT SELECT, INSERT, UPDATE ON kilit_deneme TO ${ortam.ayar.pg.kullanici}`);
    app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, uclar, { vt: ortam.vt, kimlik: async () => null });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const gonder = (yol: string) => app.inject({ method: 'POST', url: `/api/kilit/${yol}` });

  test('gerçek kilitlenme: işaretli uç bütün transaction\'ı yeniden koşar ve geçer; rakip de kalıcı olur, ilk denemenin yazısı kalmaz', { timeout: 30_000 }, async () => {
    // Kurbanı sunucu seçer. Rakibin isteği yük altında yarım deadlock_timeout'tan fazla gecikirse ucun tek denetimi döngüyü
    // görmeden geçer, rakip kurban olur ve uç ilk denemede kilitlenmeden geçer (CI'da görüldü, kart #1302). O zaman
    // denenecek durum hiç kurulmamıştır: tablo sıfırlanır, senaryo yeniden kurulur. Uç kurban olduğunda doğrulama aynıdır.
    const EN_COK_TUR = 5;
    let c: Awaited<ReturnType<typeof gonder>> | undefined;
    for (let tur = 1; ; tur += 1) {
      sayac.delete('iki-satir');
      await vt().sorgu('UPDATE kilit_deneme SET n = 0');
      const rakip = rakipBaslat().then(() => 'kalici' as const, (hata: unknown) => {
        if (vtGeciciCakisma(hata) && tur < EN_COK_TUR) return 'kurban' as const;
        throw hata;
      });
      c = await gonder('iki-satir');
      if (await rakip === 'kalici') break;
    }
    assert.ok(c);
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(sayac.get('iki-satir'), 2);
    const satirlar = await vt().sorgu<{ id: number; n: number }>('SELECT id, n FROM kilit_deneme ORDER BY id');
    assert.deepEqual(satirlar, [{ id: 1, n: 11 }, { id: 2, n: 11 }]);
  });

  test('kilitlenme ve serileştirme sürerse ilk koşu ve üç yineleme sonra 503 MESGUL; işaretsiz uç bir kez koşar ve yine 503 alır', async () => {
    for (const ad of ['hep', 'serilestirme', 'isaretsiz']) {
      const c = await gonder(ad);
      assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum: 503, kod: 'MESGUL' }, ad);
    }
    assert.deepEqual(
      { hep: sayac.get('hep'), serilestirme: sayac.get('serilestirme'), isaretsiz: sayac.get('isaretsiz') },
      { hep: 1 + KILITLENME_YINELEME_SAYISI, serilestirme: 1 + KILITLENME_YINELEME_SAYISI, isaretsiz: 1 },
    );
    assert.equal(KILITLENME_YINELEME_SAYISI, 3);
  });

  test('işaretli uçta iş kuralı reddi, kısıt ihlali ve süre aşımı yeniden denenmez: bir kez koşar, kendi cevabını alır', async () => {
    const kural = await gonder('kural');
    assert.equal(kural.statusCode, 422, kural.body);
    const kisit = await gonder('kisit');
    assert.equal(kisit.statusCode, 409, kisit.body);
    const sure = await gonder('sure');
    assert.deepEqual({ durum: sure.statusCode, kod: sure.json().kod }, { durum: 503, kod: 'MESGUL' }, sure.body);
    assert.deepEqual({ kural: sayac.get('kural'), kisit: sayac.get('kisit'), sure: sayac.get('sure') }, { kural: 1, kisit: 1, sure: 1 });
  });

  test('yinelenen denemede yalnız kalıcı olan denemenin çerezi döner', async () => {
    const c = await gonder('cerez');
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(sayac.get('cerez'), 2);
    const basliklar = ([] as string[]).concat(c.headers['set-cookie'] ?? []);
    assert.deepEqual(basliklar.map((b) => b.split(';')[0]), ['deneme=2']);
  });
});
