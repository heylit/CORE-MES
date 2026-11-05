import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisininRolleri, rollerVeBayraklari, yoneticiOlustur } from './disari.ts';
import { kisiEkle } from './servis.ts';

describe('kisininRolleri ve rollerVeBayraklari (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let rolsuz = 0;
  let ikiRollu = 0;
  let rolA = 0;
  let rolB = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_rolleri');
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    rolsuz = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Rolsüz Deneme', gorev: null }));
    ikiRollu = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'İki Rollü Deneme', gorev: null }));
    rolA = (await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('deneme_a', 'Deneme A') RETURNING id"))?.id ?? 0;
    rolB = (await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('deneme_b', 'Deneme B') RETURNING id"))?.id ?? 0;
    await ortam.vt.sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2), ($1, $3)', [ikiRollu, rolB, rolA]);
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('kişinin bütün rolleri kimlik sırasıyla, bayrağıyla döner', async () => {
    assert.deepEqual(await vt().tx((db) => kisininRolleri(db, ikiRollu)), [
      { id: rolA, kod: 'deneme_a', yonetici: false },
      { id: rolB, kod: 'deneme_b', yonetici: false },
    ]);
  });

  test('yönetici rolü bayrakla döner', async () => {
    const roller = await vt().tx((db) => kisininRolleri(db, yonetici));
    assert.deepEqual(roller.map((r) => [r.kod, r.yonetici]), [['yonetici', true]]);
  });

  test('rolsüz ve olmayan kişide boş dizi döner', async () => {
    assert.deepEqual(await vt().tx((db) => kisininRolleri(db, rolsuz)), []);
    assert.deepEqual(await vt().tx((db) => kisininRolleri(db, 999999)), []);
  });

  test('rollerVeBayraklari: bütün roller bayrağıyla döner', async () => {
    const roller = await vt().tx((db) => rollerVeBayraklari(db));
    const bul = (kod: string) => roller.find((r) => r.kod === kod);
    assert.deepEqual(bul('deneme_a'), { id: rolA, kod: 'deneme_a', ad: 'Deneme A', yonetici: false });
    assert.equal(bul('yonetici')?.yonetici, true);
  });
});
