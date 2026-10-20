import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kaliteAskisindakiTedarikciler } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Satın alma askıdaki tedarikçiyi Kalite Merkezi'nin tedarikçi onayından okur; firma kimliği uygulamada yok, ad ve kod döner.
describe('Kalite Merkezi askıdaki tedarikçiler (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yaz = (kimlik: string, govde: Record<string, unknown>, koleksiyon = 'sup') =>
    o().vt.tx((db) => sorgular.yaz(db, koleksiyon, kimlik, govde, kisiId));

  before(async () => {
    ortam = await testVeritabaniKur('km_askidaki_tedarikci');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('KM-K87 yalnız onayı Askıda olan, silinmemiş tedarikçi döner; kod boşsa null, ad kırpılır', async () => {
    assert.deepEqual(await o().vt.tx((db) => kaliteAskisindakiTedarikciler(db)), []);
    await yaz('sup_a', { ad: ' Deneme A ', kod: 'TED-A', onay: 'Askıda' });
    await yaz('sup_b', { ad: 'Deneme B', kod: '', onay: 'Askıda' });
    await yaz('sup_c', { ad: 'Deneme C', kod: 'TED-C', onay: 'Onaylı' });
    await yaz('sup_d', { ad: 'Deneme D', kod: 'TED-D' });
    await yaz('ncr_x', { ad: 'Deneme X', onay: 'Askıda' }, 'ncr');
    const surum = await yaz('sup_e', { ad: 'Deneme E', onay: 'Askıda' });
    await o().vt.tx((db) => sorgular.sil(db, 'sup', 'sup_e', kisiId, surum));

    assert.deepEqual(await o().vt.tx((db) => kaliteAskisindakiTedarikciler(db)), [
      { kimlik: 'sup_a', kod: 'TED-A', ad: 'Deneme A' },
      { kimlik: 'sup_b', kod: null, ad: 'Deneme B' },
    ]);
  });
});
