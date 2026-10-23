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

const KART = 'mdd-dnm-1';

// 392 a: kart tetiği (göç 20261023195200) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('malzeme kartı değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;

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

  const defter = (): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      `SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik
        WHERE tablo = 'malzeme_katalog_karti' AND anahtar = jsonb_build_object('kimlik', $1::text) ORDER BY denetim_degisiklik.id`,
      [KART],
    );

  before(async () => {
    ortam = await testVeritabaniKur('malzemeler_defter');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'malzeme-defter', parola: 'dogru-parola-1' }));
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MDD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    await o().sahip.sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'MDD-DNM-', 1, 'aktif', $2, $3, $3)`,
      [KART, JSON.stringify({ id: KART, com: { ad: 'Deneme mamul' } }), kisi],
    );
  });
  after(async () => { await ortam?.kaldir(); });

  test('yeni kart deftere yazılmaz; güncelleme eski, yeni değer ve kişiyle düşer, kayıt üst anahtar düzeyinde ayrılır', async () => {
    assert.deepEqual(await defter(), []);
    await kisiyle((db) => db.sorgu(
      `UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,ad}', '"Yeni ad"'), aciklama_1 = 'Not',
              surum = surum + 1, guncelleme = now(), guncelleyen_kisi_id = $2 WHERE kimlik = $1`, [KART, kisi]));
    assert.deepEqual((await defter()).map(({ islem, alanlar, kisi_id }) => ({ islem, alanlar, kisi_id })), [{
      islem: 'guncelle',
      alanlar: {
        'kayit.com': { eski: { ad: 'Deneme mamul' }, yeni: { ad: 'Yeni ad' } },
        aciklama_1: { eski: null, yeni: 'Not' },
      },
      kisi_id: kisi,
    }]);
  });

  test('yalnız sürüm, zaman ve güncelleyen değişen yazım satır yazmaz; kişisiz yazım (göç, arka iş) kişi boş düşer', async () => {
    const once = (await defter()).length;
    await kisiyle((db) => db.sorgu(
      'UPDATE malzeme_katalog_karti SET surum = surum + 1, guncelleme = now(), guncelleyen_kisi_id = $2 WHERE kimlik = $1', [KART, kisi]));
    assert.equal((await defter()).length, once);
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET aciklama_2 = 'Göç notu' WHERE kimlik = $1", [KART]);
    const son = (await defter()).at(-1);
    assert.deepEqual(son && { alanlar: son.alanlar, kisi_id: son.kisi_id }, { alanlar: { aciklama_2: { eski: null, yeni: 'Göç notu' } }, kisi_id: null });
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const [kayit] = await defter();
    assert.ok(kayit);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [kayit.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [kayit.id]));
    assert.deepEqual((await defter())[0], kayit);
  });
});
