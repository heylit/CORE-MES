import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeKartiIzleri } from './disari.ts';

// 2114c: Arşivdeki silinmiş kartın bu modüldeki izi; yalnız istenen kartın satırı sayılır.
describe('kalite-merkezi: malzeme kartı izi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  const kart = { no: 990001, kimlik: 'iz-kart-1', stokKodu: 'HM990001' };
  const baska = { no: 990002, kimlik: 'iz-kart-2', stokKodu: 'HM990002' };
  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('kalite_merkezi_kart_izi');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iz yokken boş, iz varken yalnız o kart döner', async () => {
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska])), []);
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [])), []);
    await vt().vt.tx((db) => db.sorgu(`INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ('belge', 'b1', jsonb_build_object('malzemeNo', $1::int), $2)`, [kart.no, kisi]));
    const izler = await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska]));
    assert.deepEqual(izler.map(({ no, kayit, tur, adet }) => ({ no, kayit, tur, adet })), [{ kayit: 'Kalite belgesi', tur: 'olasi', adet: 1 }].map((b) => ({ no: kart.no, ...b })));
  });
});
