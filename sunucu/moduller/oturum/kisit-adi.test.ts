import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

describe('oturum kısıt adı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  before(async () => {
    ortam = await testVeritabaniKur('oturumkisit');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('anahtar özeti tekliği okunur adla durur; PostgreSQL adı kalmaz', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const satirlar = await ortam.vt.sorgu<{ ad: string; tur: string }>(
      `SELECT c.conname AS ad, c.contype::text AS tur FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relnamespace = to_regnamespace($1) AND t.relname = 'oturum' AND c.contype = 'u'`,
      [ortam.sema],
    );
    assert.deepEqual(satirlar, [{ ad: 'oturum_anahtar_ozeti_tek', tur: 'u' }]);
  });
});
