import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { katalogKodSiralariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { katalogKodSiralari } from './servis.ts';

// 3747: Sistem Ayarları > Numara kuralları katalog kodunun önek başına son sırasını gösterir.
describe('malzemeler katalog kod sıraları (3747, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  before(async () => { ortam = await testVeritabaniKur('malzemekodsira'); });
  after(async () => { await ortam?.kaldir(); });

  test('önek sırasıyla döner; hiç kod verilmemiş önek 0 ile gelir ve sözleşmeye uyar', async () => {
    await o().sahip.sorgu('DELETE FROM malzeme_katalog_kod_sirasi');
    assert.deepEqual(await o().vt.tx((db) => katalogKodSiralari(db)), { siralar: [] });
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('YM-KSR-', 7), ('HM-KSR-', 42), ('SF-KSR-', 0)");
    const cevap = await o().vt.tx((db) => katalogKodSiralari(db));
    assert.deepEqual(cevap, { siralar: [{ onek: 'HM-KSR-', sonSira: 42 }, { onek: 'SF-KSR-', sonSira: 0 }, { onek: 'YM-KSR-', sonSira: 7 }] });
    assert.ok(katalogKodSiralariCevabi.safeParse(cevap).success);
  });
});
