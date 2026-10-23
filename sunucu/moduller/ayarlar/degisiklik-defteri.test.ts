import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { ayarDegeriniSil, ayarDegeriniYaz } from './sorgular.ts';

interface Defter {
  id: string;
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

const DORT_GOZ = 'malzemeler.dort-goz';

// 392 a: ayar tetiği (göç 20261023195400) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('ayar değişiklik defteri (gerçek PostgreSQL)', () => {
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
        WHERE tablo = 'ayar' AND anahtar = jsonb_build_object('anahtar', $1::text) ORDER BY denetim_degisiklik.id`,
      [DORT_GOZ],
    );

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_defter');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'ayar-defter', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('ilk yazım, değişim ve varsayılana dönüş eski, yeni değer ve yazan kişiyle düşer; zaman ve güncelleyen yazılmaz', async () => {
    await kisiyle((db) => ayarDegeriniYaz(db, DORT_GOZ, true, kisi));
    await kisiyle((db) => ayarDegeriniYaz(db, DORT_GOZ, false, kisi));
    await kisiyle((db) => ayarDegeriniSil(db, DORT_GOZ));
    const anahtar = (eski: string | null, yeni: string | null) => ({ anahtar: { eski, yeni } });
    assert.deepEqual((await defter()).map(({ islem, alanlar, kisi_id }) => ({ islem, alanlar, kisi_id })), [
      { islem: 'ekle', alanlar: { ...anahtar(null, DORT_GOZ), deger: { eski: null, yeni: true } }, kisi_id: kisi },
      { islem: 'guncelle', alanlar: { deger: { eski: true, yeni: false } }, kisi_id: kisi },
      { islem: 'sil', alanlar: { ...anahtar(DORT_GOZ, null), deger: { eski: false, yeni: null } }, kisi_id: kisi },
    ]);
  });

  test('aynı değerin yeniden yazımı satır yazmaz; kişisiz yazım (göç) kişi boş düşer', async () => {
    await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, 'true', $2)", [DORT_GOZ, kisi]);
    const once = (await defter()).length;
    await kisiyle((db) => ayarDegeriniYaz(db, DORT_GOZ, true, kisi));
    const satirlar = await defter();
    assert.equal(satirlar.length, once);
    const son = satirlar.at(-1);
    assert.deepEqual(son && { islem: son.islem, kisi_id: son.kisi_id }, { islem: 'ekle', kisi_id: null });
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const [kayit] = await defter();
    assert.ok(kayit);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [kayit.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [kayit.id]));
    assert.deepEqual((await defter())[0], kayit);
  });
});
