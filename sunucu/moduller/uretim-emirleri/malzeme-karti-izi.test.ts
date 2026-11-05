import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeKartiIzleri } from './disari.ts';

// 2114c: Arşivdeki silinmiş kartın bu modüldeki izi. Kartlar gerçek satırdır: yabancı anahtarlı tablolar da yazılabilsin.
describe('uretim-emirleri: malzeme kartı izi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const kart = { no: 0, kimlik: 'iz-kart-1', stokKodu: 'IZ-00001' };
  const baska = { no: 0, kimlik: 'iz-kart-2', stokKodu: 'IZ-00002' };
  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_emirleri_kart_izi');
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('IZ-', 0)");
    for (const [k, sira] of [[kart, 1], [baska, 2]] as const) {
      k.no = (await ortam.vt.tx((db) => db.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'sarf', 'IZ-', $2, 'iptal', $3, $4, $4) RETURNING no`, [k.kimlik, sira, JSON.stringify({ id: k.kimlik, com: { ad: 'Deneme sarf' } }), yonetici])))!.no;
    }
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iz yokken boş döner (yabancı anahtarlı bağları ayrıca silme denemesi yakalar)', async () => {
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [kart, baska])), []);
    assert.deepEqual(await vt().vt.tx((db) => malzemeKartiIzleri(db, [])), []);
  });
});
