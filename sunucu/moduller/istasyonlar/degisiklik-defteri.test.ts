import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kisiIsMerkezleriniYaz } from './sorgular.ts';

interface Defter {
  id: string;
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 258 a: kişi-iş merkezi tetiği (göç 20261023195500) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('kişi iş merkezi ataması değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let kisi = 0;
  let merkezA = 0;
  let merkezB = 0;

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

  const defter = (merkez: number): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      `SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik
        WHERE tablo = 'kisi_is_merkezi' AND anahtar = jsonb_build_object('kisi_id', $1::int, 'is_merkezi_id', $2::int) ORDER BY denetim_degisiklik.id`,
      [kisi, merkez],
    );
  const ozet = (satirlar: Defter[]): { islem: string; kisi_id: number | null }[] => satirlar.map(({ islem, kisi_id }) => ({ islem, kisi_id }));

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'istasyon-defter', parola: 'dogru-parola-1' }));
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Kişi', kullaniciAdi: 'istasyon-defter-2', parola: 'dogru-parola-1' }));
    const merkez = async (kod: string): Promise<number> =>
      (await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [kod, `Deneme ${kod}`]))!.id;
    merkezA = await merkez('DDA');
    merkezB = await merkez('DDB');
  });
  after(async () => { await ortam?.kaldir(); });

  test('atama verme ve geri alma uygulamanın kendi yazımıyla eski, yeni değer ve yazan kişiyle düşer', async () => {
    await kisiyle((db) => kisiIsMerkezleriniYaz(db, kisi, [merkezA]));
    await kisiyle((db) => kisiIsMerkezleriniYaz(db, kisi, [merkezB]));
    const a = await defter(merkezA);
    assert.deepEqual(ozet(a), [{ islem: 'ekle', kisi_id: yonetici }, { islem: 'sil', kisi_id: yonetici }]);
    assert.deepEqual(a[0]?.alanlar.is_merkezi_id, { eski: null, yeni: merkezA });
    assert.deepEqual(a[1]?.alanlar.is_merkezi_id, { eski: merkezA, yeni: null });
    assert.deepEqual(ozet(await defter(merkezB)), [{ islem: 'ekle', kisi_id: yonetici }]);
  });

  test('kişisiz yazım (göç, arka iş) kişi boş yazılır', async () => {
    await o().sahip.sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1 AND is_merkezi_id = $2', [kisi, merkezB]);
    assert.deepEqual(ozet(await defter(merkezB)).at(-1), { islem: 'sil', kisi_id: null });
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const [kayit] = await defter(merkezA);
    assert.ok(kayit);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [kayit.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [kayit.id]));
    assert.deepEqual((await defter(merkezA))[0], kayit);
  });
});
