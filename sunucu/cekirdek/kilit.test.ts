import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from './db.ts';
import { islemKilidiAl, islemKilidiDene, semaliKilitAnahtariSql } from './kilit.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

describe('işlem kilidi şema kapsamlıdır', () => {
  let a: TestVeritabani | undefined;
  let b: TestVeritabani | undefined;
  before(async () => {
    a = await testSemasiAc('kilit_a');
    b = await testSemasiAc('kilit_b');
  });
  after(async () => { await a?.kaldir(); await b?.kaldir(); });

  // Kilidi transaction içinde tutar; verilen iş bitince transaction kapanır ve kilit bırakılır.
  const tutarken = async (ortam: TestVeritabani, al: (db: Db) => Promise<void>, is: () => Promise<void>): Promise<void> => {
    let birak: () => void = () => undefined;
    const tutulur = new Promise<void>((coz) => { birak = coz; });
    let alindi: () => void = () => undefined;
    const alindiSoz = new Promise<void>((coz) => { alindi = coz; });
    const tx = ortam.vt.tx(async (db) => { await al(db); alindi(); await tutulur; });
    await alindiSoz;
    try { await is(); } finally { birak(); await tx; }
  };
  const dene = (ortam: TestVeritabani, ad: string, kimlik?: number): Promise<boolean> =>
    ortam.vt.tx((db) => islemKilidiDene(db, ad, kimlik));

  test('aynı şemada tutulan kilit ikinci denemeyi reddeder, transaction bitince bırakılır', async () => {
    if (!a) throw new Error('kurulum yok');
    const ortam = a;
    for (const kimlik of [undefined, 7]) {
      await tutarken(ortam, (db) => islemKilidiAl(db, 'deneme', kimlik), async () => {
        assert.equal(await dene(ortam, 'deneme', kimlik), false);
      });
      assert.equal(await dene(ortam, 'deneme', kimlik), true);
    }
  });

  test('başka şemadaki aynı adlı ve aynı kimlikli kilit bu şemayı engellemez', async () => {
    if (!a || !b) throw new Error('kurulum yok');
    const [ka, kb] = [a, b];
    for (const kimlik of [undefined, 7]) {
      await tutarken(ka, (db) => islemKilidiAl(db, 'deneme', kimlik), async () => {
        assert.equal(await dene(kb, 'deneme', kimlik), true);
        assert.equal(await dene(ka, 'deneme', kimlik), false);
      });
    }
  });

  test('ad ya da kimlik farklıysa kilitler birbirini engellemez; kimliksiz ve kimlikli aynı ad ayrı kilittir', async () => {
    if (!a) throw new Error('kurulum yok');
    const ortam = a;
    await tutarken(ortam, (db) => islemKilidiAl(db, 'deneme', 7), async () => {
      assert.equal(await dene(ortam, 'deneme', 8), true);
      assert.equal(await dene(ortam, 'baska', 7), true);
      assert.equal(await dene(ortam, 'deneme'), true);
    });
  });

  test('anahtar ifadesi pg_locks satırıyla eşleşir (testlerin bekleyen kilidi bulması için)', async () => {
    if (!a) throw new Error('kurulum yok');
    const ortam = a;
    await tutarken(ortam, (db) => islemKilidiAl(db, 'deneme', 42), async () => {
      const r = await ortam.vt.tek<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted
            AND classid = (${semaliKilitAnahtariSql("'deneme'")}::bigint & 4294967295)::oid AND objid = 42::oid AND objsubid = 2`,
      );
      assert.equal(r?.n, 1);
    });
  });
});
