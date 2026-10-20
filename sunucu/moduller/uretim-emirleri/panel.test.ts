import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { durusDagilimi, gunlukUretim, sonOlaylar } from './servis.ts';

describe('uretim-emirleri panel serileri, boş veritabanı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => { ortam = await testVeritabaniKur('uretim_panel'); });
  after(async () => { await ortam?.kaldir(); });

  test('sayım, duruş ve terminal olayı yoksa seriler boştur (sıfırlı gün uydurulmaz)', async () => {
    assert.deepEqual(await gunlukUretim(o().vt, 30), { gunler: [] });
    assert.deepEqual(await durusDagilimi(o().vt, 14), { nedenler: [] });
    assert.deepEqual(await sonOlaylar(o().vt, null, 50), { olaylar: [] });
  });
});
