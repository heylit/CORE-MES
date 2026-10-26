import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { emirlerinProjeleri } from '../disari.ts';

describe('emirlerinProjeleri (664, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  let projeli = 0;
  let projesiz = 0;
  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('emirprojeleri');
    const kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ep-yonetici', parola: 'dogru-parola-1' }));
    const merkez = (await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DEPM', 'Deneme') RETURNING id"))!.id;
    const ist = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DEP', 'Deneme', $1) RETURNING id", [merkez]))!.id;
    projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('EP.DENEME', 'Deneme proje', $1) RETURNING id", [kisi]))!.id;
    const emir = async (proje: number | null) => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id) VALUES ('DP-1', 'Deneme parça', 1, $1, $2, $3) RETURNING id`,
      [ist, kisi, proje]))!.id;
    projeli = await emir(projeId);
    projesiz = await emir(null);
  });
  after(async () => { await ortam?.kaldir(); });

  test('projeli emir projesini verir; projesiz ve olmayan emir haritada yok; boş dizide boş harita', async () => {
    const m = await o().vt.tx((db) => emirlerinProjeleri(db, [projeli, projesiz, projeli, 999999]));
    assert.deepEqual([...m], [[projeli, projeId]]);
    assert.equal((await o().vt.tx((db) => emirlerinProjeleri(db, []))).size, 0);
  });
});
