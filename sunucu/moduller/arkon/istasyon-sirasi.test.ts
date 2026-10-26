import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { istasyonHazirlikSirasi } from './disari.ts';

// 718 (3a): saatin okuduğu Hazırlık sırası istasyona göre süzülür ve sıra numarasıyla gelir.
describe('arkon istasyon Hazırlık sırası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let a = 0;
  let b = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkon_istasyon_sirasi');
    const sahip = ortam.sahip;
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('AIS', 'Deneme merkezi') RETURNING id");
    const ist = async (kod: string) => (await sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $1, $2, true) RETURNING id', [kod, im!.id]))!.id;
    a = await ist('AIS1');
    b = await ist('AIS2');
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Hazırlık') RETURNING id"))!.id;
    // İş emri anahtarı tabloda bilinçli yok (göç yorumu): kimlikler uydurma sayıdır.
    for (const [isEmriId, parcaNo, istasyonId, sira] of [[11, 0, a, 2], [12, 0, a, 1], [13, 2, a, 3], [14, 0, b, 1]]) {
      await sahip.sorgu('INSERT INTO arkon_kuyruk_sirasi (is_emri_id, parca_no, istasyon_id, sira, surum, kisi_id) VALUES ($1, $2, $3, $4, 1, $5)',
        [isEmriId, parcaNo, istasyonId, sira, kisi]);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('yalnız istenen istasyonun satırları, sıra numarasına göre', async () => {
    assert.deepEqual(await istasyonHazirlikSirasi(ortam!.vt, a), [
      { isEmriId: 12, parcaNo: 0, sira: 1 }, { isEmriId: 11, parcaNo: 0, sira: 2 }, { isEmriId: 13, parcaNo: 2, sira: 3 },
    ]);
    assert.deepEqual(await istasyonHazirlikSirasi(ortam!.vt, b), [{ isEmriId: 14, parcaNo: 0, sira: 1 }]);
  });

  test('sırası olmayan istasyonda boş liste', async () => {
    assert.deepEqual(await istasyonHazirlikSirasi(ortam!.vt, 999999), []);
  });
});
