import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

interface Defter {
  id: string;
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 392 a: sipariş satırı tetiği (göç 20261023195100) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('sipariş satırı değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let siparis = 0;
  let mamulNo = 0;

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

  const defter = (id: number): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      `SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik
        WHERE tablo = 'siparisler_siparis_satiri' AND anahtar = jsonb_build_object('id', $1::int) ORDER BY denetim_degisiklik.id`,
      [id],
    );

  const satirAc = async (sira: number): Promise<number> =>
    (await o().sahip.tek<{ id: number }>(
      'INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar) VALUES ($1, $2, $3, 10) RETURNING id',
      [siparis, sira, mamulNo]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_defter');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'siparis-defter', parola: 'dogru-parola-1' }));
    const firma = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'musteri', $1) RETURNING id", [kisi]))!.id;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SDD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sdd-dnm-1', 'mamul', 'SDD-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sdd-dnm-1', com: { ad: 'Deneme mamul' } }), kisi],
    ))!.no;
    siparis = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO siparisler_siparis (no, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ('SD-DD-1', $1, '2026-10-23', '2026-11-30', 20, $2) RETURNING id`, [firma, kisi]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yeni satır deftere yazılmaz; güncelleme eski, yeni değer ve yazan kişiyle düşer', async () => {
    const satir = await satirAc(1);
    assert.deepEqual(await defter(satir), []);
    await kisiyle((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = 12 WHERE id = $1', [satir]));
    assert.deepEqual((await defter(satir)).map(({ islem, alanlar, kisi_id }) => ({ islem, alanlar, kisi_id })), [
      { islem: 'guncelle', alanlar: { miktar: { eski: 10, yeni: 12 } }, kisi_id: kisi },
    ]);
  });

  test('değer değişmeyen yazım satır yazmaz; silme kişisiz yazımda (göç, arka iş) kişi boş düşer', async () => {
    const satir = await satirAc(2);
    await kisiyle((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = miktar WHERE id = $1', [satir]));
    assert.deepEqual(await defter(satir), []);
    await o().sahip.sorgu('DELETE FROM siparisler_siparis_satiri WHERE id = $1', [satir]);
    const [sil, ...fazla] = await defter(satir);
    assert.deepEqual(fazla, []);
    assert.ok(sil);
    assert.equal(sil.islem, 'sil');
    assert.equal(sil.kisi_id, null);
    assert.deepEqual(sil.alanlar.miktar, { eski: 10, yeni: null });
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const satir = await satirAc(3);
    await kisiyle((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = 15 WHERE id = $1', [satir]));
    const [kayit] = await defter(satir);
    assert.ok(kayit);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [kayit.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [kayit.id]));
    assert.deepEqual(await defter(satir), [kayit]);
  });
});
