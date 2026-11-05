import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeKartiIzleri } from './disari.ts';

// 2114c: Arşivdeki silinmiş kartın bu modüldeki izi; yalnız istenen kartın satırı sayılır.
describe('stok: malzeme kartı izi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kart = { no: 0, kimlik: 'iz-kart-1', stokKodu: 'IZ-00001' };
  const baska = { no: 990002, kimlik: 'iz-kart-2', stokKodu: 'HM990002' };
  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_kart_izi');
    const kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('IZ-', 0)");
    kart.no = (await ortam.vt.tx((db) => db.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('iz-kart-1', 'sarf', 'IZ-', 1, 'iptal', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'iz-kart-1', com: { ad: 'Deneme sarf' } }), kisi])))!.no;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iz yokken boş, iz varken yalnız o kart döner', async () => {
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska])), []);
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [])), []);
    await vt().vt.tx((db) => db.sorgu(`INSERT INTO stok_malzeme_ayari (malzeme_id) VALUES ($1)`, [kart.no]));
    const izler = await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska]));
    assert.deepEqual(izler.map(({ no, kayit, tur, adet }) => ({ no, kayit, tur, adet })), [{ kayit: 'Malzeme ayarı', tur: 'kesin', adet: 1 }].map((b) => ({ no: kart.no, ...b })));
  });
});
