import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kaliteEtiketleri } from './disari.ts';

describe('stok kalite durum etiketi okuması (kart 1525; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => { ortam = await testVeritabaniKur('stok_kalite_etiketi'); });
  after(async () => { await ortam?.kaldir(); });

  test('durum bakiye satırından okunur; lotsuz ve olmayan satır gelmez; istenen sıra korunur', async () => {
    const sahip = o().sahip;
    const kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'stok-kalite-etk', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KE-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ke-1', 'hammadde', 'KE-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ke-1', com: { ad: 'Deneme çubuk' } }), kisiId]))!.no;
    const konum = (await sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const parti = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_parti (malzeme_id, acan_kisi_id, lot_no) VALUES ($1, $2, 'LT-KE-1') RETURNING id", [kart, kisiId]))!.id;
    const bakiye = async (partiId: number | null, kalite: string, miktar: string) => (await sahip.tek<{ id: number }>(
      'INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, kalite_durumu, miktar, ilk_giris) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id',
      [kart, konum, partiId, kalite, miktar]))!.id;
    const red = await bakiye(parti, 'red', '3');
    const serbest = await bakiye(parti, 'serbest', '9');
    const lotsuz = await bakiye(null, 'karar_bekliyor', '2');

    const sonuc = await o().vt.tx((db) => kaliteEtiketleri(db, [serbest, lotsuz, 2147483007, red]));
    assert.deepEqual(sonuc.map((e) => [e.bakiyeId, e.kaliteDurumu, e.lotNo, e.konumKod]), [[serbest, 'serbest', 'LT-KE-1', 'KABUL'], [red, 'red', 'LT-KE-1', 'KABUL']]);
    assert.equal(sonuc[1]?.malzemeAd, 'Deneme çubuk');
    assert.equal(Number(sonuc[1]?.miktar), 3);
    assert.deepEqual(await o().vt.tx((db) => kaliteEtiketleri(db, [])), []);
  });
});
