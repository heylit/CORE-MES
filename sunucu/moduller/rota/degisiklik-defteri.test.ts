import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

interface Defter {
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 1372 a: rota revizyonu ve adım değişiklik defteri (göç 20261030166000); sözleşme denetim modülündedir.
describe('rota revizyonu ve adım değişiklik defteri (göç 20261030166000) (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let rev = 0;
  let adim = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Yazma ucu kişiyi transaction başında bu değişkene yazar; test aynı yolu uygulama kullanıcısıyla izler.
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });

  const defter = (tablo: string, anahtar: Record<string, unknown>): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      'SELECT islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 AND anahtar = $2::jsonb ORDER BY id',
      [tablo, JSON.stringify(anahtar)],
    );

  before(async () => {
    ortam = await testVeritabaniKur('rota_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'rota-defter', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RD-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rd-1', 'mamul', 'RD-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'rd-1', com: { ad: 'Deneme mamul' } }), yonetici]))!.no;
    rev = (await sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [kart, yonetici]))!.id;
    await sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, 10, $2)', [kart, rev]);
    adim = (await sahip.tek<{ id: number }>(
      `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, birim_sure_dk)
       VALUES ($1, $2, 10, 1, 1, 'Deneme adım', 1) RETURNING id`, [rev, kart]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('taslakta adım süresi düzeltmesi eski, yeni değer ve yazan kişiyle düşer', async () => {
    await kisiyle((db) => db.sorgu('UPDATE rota_adimi SET birim_sure_dk = 2 WHERE id = $1', [adim]));
    const satirlar = await defter('rota_adimi', { id: adim });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]), [['guncelle', yonetici, ['birim_sure_dk']]]);
  });

  test('revizyon durum geçişi düşer; yalnız sürüm değişirse satır yazılmaz', async () => {
    await kisiyle((db) => db.sorgu("UPDATE rota_revizyonu SET aciklama = 'Deneme', surum = surum + 1 WHERE id = $1", [rev]));
    await kisiyle((db) => db.sorgu('UPDATE rota_revizyonu SET surum = surum + 1 WHERE id = $1', [rev]));
    const satirlar = await defter('rota_revizyonu', { id: rev });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]), [['guncelle', yonetici, ['aciklama']]]);
  });
});
