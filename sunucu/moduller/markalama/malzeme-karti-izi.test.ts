import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { malzemeKartiIzleri } from './disari.ts';

// 2114c: Arşivdeki silinmiş kartın bu modüldeki izi; yalnız istenen kartın satırı sayılır.
describe('markalama: malzeme kartı izi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kart = { no: 990001, kimlik: 'iz-kart-1', stokKodu: 'HM990001' };
  const baska = { no: 990002, kimlik: 'iz-kart-2', stokKodu: 'HM990002' };
  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('markalama_kart_izi');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iz yokken boş, iz varken yalnız o kart döner', async () => {
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska])), []);
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [])), []);
    await vt().vt.tx((db) => db.sorgu(`INSERT INTO markalama_sayaci (malzeme_id, son_sira, kapsam_anahtari) VALUES ($1, 3, '')`, [kart.no]));
    const izler = await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska]));
    assert.deepEqual(izler.map(({ no, kayit, tur, adet }) => ({ no, kayit, tur, adet })), [{ kayit: 'Seri sayacı', tur: 'kesin', adet: 1 }].map((b) => ({ no: kart.no, ...b })));
  });
});
