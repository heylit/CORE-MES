import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

// Kısıtlar adlandırılır (P-B10, P-B22): PostgreSQL'in verdiği `_pkey` / `_fkey` adı hata iletisinde ve testte tabloya göre değişir.
describe('plan anahtar adları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  before(async () => { ortam = await testVeritabaniKur('plan_kisit'); });
  after(async () => { await ortam?.kaldir(); });

  test('plan_senaryo_yerlesimi birincil anahtarı, plan_ayari ve plan_senaryo_ayari birincil ve yabancı anahtarları adlıdır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const satirlar = await ortam.sahip.sorgu<{ tablo: string; ad: string; tur: string; tanim: string }>(
      `SELECT c.conrelid::regclass::text AS tablo, c.conname AS ad, c.contype::text AS tur, pg_get_constraintdef(c.oid) AS tanim
         FROM pg_constraint c
        WHERE c.conrelid = ANY (ARRAY['plan_senaryo_yerlesimi', 'plan_ayari', 'plan_senaryo_ayari']::regclass[])
          AND (c.contype = 'p' OR (c.contype = 'f' AND c.conrelid <> 'plan_senaryo_yerlesimi'::regclass))
        ORDER BY 1, 2`,
    );
    assert.deepEqual(satirlar.map((s) => [s.tablo, s.ad, s.tanim]), [
      ['plan_ayari', 'plan_ayari_degistiren', 'FOREIGN KEY (degistiren_kisi_id) REFERENCES kisi(id)'],
      ['plan_ayari', 'plan_ayari_tekil', 'PRIMARY KEY (tek)'],
      ['plan_senaryo_ayari', 'plan_senaryo_ayari_senaryo', 'FOREIGN KEY (senaryo_id) REFERENCES plan_senaryosu(id)'],
      ['plan_senaryo_ayari', 'plan_senaryo_ayari_tekil', 'PRIMARY KEY (senaryo_id)'],
      ['plan_senaryo_yerlesimi', 'plan_senaryo_yerlesimi_tekil', 'PRIMARY KEY (senaryo_id, is_emri_id)'],
    ]);
  });
});
