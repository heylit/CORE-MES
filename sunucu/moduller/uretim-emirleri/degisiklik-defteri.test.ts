import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

interface Defter {
  id: string;
  anahtar: Record<string, unknown>;
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 392 a: emir ve iş emri tetiği (göç 20261023195000) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('üretim emri değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let emir = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Yazma ucu kişiyi transaction başında bu değişkene yazar; test aynı yolu uygulama kullanıcısıyla izler.
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(kisi)]);
      return is(db);
    });

  const defter = (tablo: string, id: number): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      `SELECT id::text, anahtar, islem, alanlar, kisi_id FROM denetim_degisiklik
        WHERE tablo = $1 AND anahtar = jsonb_build_object('id', $2::int) ORDER BY denetim_degisiklik.id`,
      [tablo, id],
    );

  async function emirAc(): Promise<number> {
    const merkez = (await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DDM', 'Deneme') RETURNING id"))!.id;
    const ist = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DDI', 'Deneme', $1) RETURNING id", [merkez]))!.id;
    return (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-DD', 'Deneme', 5, $1, $2) RETURNING id",
      [ist, kisi]))!.id;
  }

  async function isEmriAc(): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad)
       VALUES ($1, 1, 10, (SELECT min(id) FROM istasyonlar_operasyon_tipi), 'Tornalama') RETURNING id`, [emir]))!.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('ue_defter');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'ue-defter', parola: 'dogru-parola-1' }));
    emir = await emirAc();
  });
  after(async () => { await ortam?.kaldir(); });

  test('yeni emir deftere yazılmaz; güncelleme eski, yeni değer ve yazan kişiyle düşer, sürüm defterde yer almaz', async () => {
    assert.deepEqual(await defter('uretim_emri', emir), []);
    await kisiyle((db) => db.sorgu('UPDATE uretim_emri SET adet = 7, surum = surum + 1 WHERE id = $1', [emir]));
    const satirlar = await defter('uretim_emri', emir);
    assert.equal(satirlar.length, 1);
    assert.deepEqual(satirlar.map(({ islem, alanlar, kisi_id }) => ({ islem, alanlar, kisi_id })), [
      { islem: 'guncelle', alanlar: { adet: { eski: 5, yeni: 7 } }, kisi_id: kisi },
    ]);
  });

  test('değer değişmeyen yazım (yalnız sürüm artışı dahil) satır yazmaz', async () => {
    const once = (await defter('uretim_emri', emir)).length;
    await kisiyle((db) => db.sorgu('UPDATE uretim_emri SET adet = adet, surum = surum + 1 WHERE id = $1', [emir]));
    assert.equal((await defter('uretim_emri', emir)).length, once);
  });

  test('iş emrinin güncellemesi ve silinmesi deftere düşer; kişisiz yazım (göç, arka iş) kişi boş yazılır', async () => {
    const isEmri = await isEmriAc();
    await kisiyle((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET ad = 'Frezeleme', surum = surum + 1 WHERE id = $1", [isEmri]));
    await o().sahip.sorgu('DELETE FROM uretim_emirleri_is_emri WHERE id = $1', [isEmri]);
    const [guncelle, sil, ...fazla] = await defter('uretim_emirleri_is_emri', isEmri);
    assert.deepEqual(fazla, []);
    assert.deepEqual(guncelle && { islem: guncelle.islem, alanlar: guncelle.alanlar, kisi_id: guncelle.kisi_id },
      { islem: 'guncelle', alanlar: { ad: { eski: 'Tornalama', yeni: 'Frezeleme' } }, kisi_id: kisi });
    assert.ok(sil);
    assert.equal(sil.islem, 'sil');
    assert.equal(sil.kisi_id, null);
    assert.deepEqual(sil.alanlar.ad, { eski: 'Frezeleme', yeni: null });
    assert.equal(sil.alanlar.surum, undefined);
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const [satir] = await defter('uretim_emri', emir);
    assert.ok(satir);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [satir.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [satir.id]));
    assert.deepEqual((await defter('uretim_emri', emir))[0], satir);
  });
});
