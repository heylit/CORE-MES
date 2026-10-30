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

// 1372 a: firma kartı ve adres değişiklik defteri (göç 20261030165000); sözleşme denetim modülündedir.
describe('firma kartı ve adres değişiklik defteri (göç 20261030165000) (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let firma = 0;
  let adres = 0;

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
    ortam = await testVeritabaniKur('mt_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'mt-defter', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    firma = (await sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (kod, ad, tur, olusturan_id) VALUES ('DD-1', 'Deneme firma', 'musteri', $1) RETURNING id", [yonetici]))!.id;
    adres = (await sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_adres (firma_id, tur, ad, olusturan_id) VALUES ($1, 'teslim', 'Depo', $2) RETURNING id", [firma, yonetici]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('firma güncellemesi eski, yeni değer ve yazan kişiyle düşer; yalnız sürüm ve güncelleme izi değişirse satır yazılmaz', async () => {
    await kisiyle((db) => db.sorgu("UPDATE musteri_tedarikci_firma SET vade_gunu = 45, surum = surum + 1, guncelleme = now() WHERE id = $1", [firma]));
    await kisiyle((db) => db.sorgu("UPDATE musteri_tedarikci_firma SET surum = surum + 1, guncelleme = now(), guncelleyen_id = $2 WHERE id = $1", [firma, yonetici]));
    const satirlar = await defter('musteri_tedarikci_firma', { id: firma });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]), [['guncelle', yonetici, ['vade_gunu']]]);
    assert.equal(satirlar[0]?.alanlar.vade_gunu?.yeni, 45);
  });

  test('adres güncellemesi ve kişisiz silme (arka iş) düşer', async () => {
    await kisiyle((db) => db.sorgu("UPDATE musteri_tedarikci_adres SET ad = 'Ana depo' WHERE id = $1", [adres]));
    await o().sahip.sorgu('DELETE FROM musteri_tedarikci_adres WHERE id = $1', [adres]);
    const satirlar = await defter('musteri_tedarikci_adres', { id: adres });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id]), [['guncelle', yonetici], ['sil', null]]);
    assert.deepEqual(satirlar[0]?.alanlar.ad, { eski: 'Depo', yeni: 'Ana depo' });
  });
});
