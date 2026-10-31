import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';

interface Defter {
  id: string;
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

const ISLEM = 'kisiler.yonet';

// 392 a ve 258 a: dört yetki tablosunun tetiği (göç 20261023195300) ortak defter işlevine bağlıdır; sözleşme denetim modülündedir.
describe('yetki tabloları değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let kisi = 0;
  let rol = 0;

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
      'SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 AND anahtar = $2::jsonb ORDER BY denetim_degisiklik.id',
      [tablo, JSON.stringify(anahtar)],
    );
  const ozet = (satirlar: Defter[]): { islem: string; kisi_id: number | null }[] => satirlar.map(({ islem, kisi_id }) => ({ islem, kisi_id }));

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'kisiler-defter', parola: 'dogru-parola-1' }));
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Kişi', kullaniciAdi: 'kisiler-defter-2', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('rol açma, adını değiştirme ve silme eski, yeni değer ve yazan kişiyle düşer', async () => {
    rol = (await kisiyle((db) => db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('deneme_dd', 'Deneme rol') RETURNING id")) as { id: number }).id;
    await kisiyle((db) => db.sorgu("UPDATE rol SET ad = 'Yeni ad' WHERE id = $1", [rol]));
    await kisiyle((db) => db.sorgu('UPDATE rol SET ad = ad WHERE id = $1', [rol]));
    const [ekle, guncelle, ...fazla] = await defter('rol', { id: rol });
    assert.deepEqual(fazla, [], 'değer değişmeyen yazım satır yazmaz');
    assert.ok(ekle && guncelle);
    assert.deepEqual(ozet([ekle, guncelle]), [{ islem: 'ekle', kisi_id: yonetici }, { islem: 'guncelle', kisi_id: yonetici }]);
    assert.deepEqual(ekle.alanlar.kod, { eski: null, yeni: 'deneme_dd' });
    assert.deepEqual(guncelle.alanlar, { ad: { eski: 'Deneme rol', yeni: 'Yeni ad' } });
  });

  test('role işlem verme ve geri alma ekle ve sil olarak düşer', async () => {
    await kisiyle((db) => db.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol, ISLEM]));
    await kisiyle((db) => db.sorgu('DELETE FROM rol_islemi WHERE rol_id = $1 AND islem = $2', [rol, ISLEM]));
    assert.deepEqual(ozet(await defter('rol_islemi', { rol_id: rol, islem: ISLEM })),
      [{ islem: 'ekle', kisi_id: yonetici }, { islem: 'sil', kisi_id: yonetici }]);
  });

  test('kişiye rol atama ve alma uygulamanın kendi komutuyla deftere düşer', async () => {
    await kisiyle((db) => rolAta(db, yonetici, kisi, rol));
    await kisiyle((db) => rolAl(db, yonetici, kisi, rol));
    assert.deepEqual(ozet(await defter('kisi_rolu', { kisi_id: kisi, rol_id: rol })),
      [{ islem: 'ekle', kisi_id: yonetici }, { islem: 'sil', kisi_id: yonetici }]);
  });

  test('kişiye ek işlem verme ve geri alma deftere düşer; kişisiz yazım (göç) kişi boş yazılır', async () => {
    await kisiyle((db) => db.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [kisi, ISLEM, yonetici]));
    await o().sahip.sorgu('DELETE FROM kisi_islemi WHERE kisi_id = $1 AND islem = $2', [kisi, ISLEM]);
    const satirlar = await defter('kisi_islemi', { kisi_id: kisi, islem: ISLEM });
    assert.deepEqual(ozet(satirlar), [{ islem: 'ekle', kisi_id: yonetici }, { islem: 'sil', kisi_id: null }]);
    assert.deepEqual(satirlar[0]?.alanlar.veren_id, { eski: null, yeni: yonetici });
  });

  test('uygulama kullanıcısı defter satırını güncelleyemez ve silemez', async () => {
    const [kayit] = await defter('rol', { id: rol });
    assert.ok(kayit);
    await assert.rejects(o().vt.sorgu('UPDATE denetim_degisiklik SET kisi_id = NULL WHERE id = $1', [kayit.id]));
    await assert.rejects(o().vt.sorgu('DELETE FROM denetim_degisiklik WHERE id = $1', [kayit.id]));
    assert.deepEqual((await defter('rol', { id: rol }))[0], kayit);
  });
});

// 1372 a: kişi kartı tetiği (göç 20261030168000). Parola özeti, oturum düşürme anı ve sürüm deftere girmez.
describe('kişi kartı değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let kisi = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });
  const defter = (): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      "SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = 'kisi' AND anahtar = jsonb_build_object('id', $1::int) ORDER BY id",
      [kisi],
    );

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_kart_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'kisi-kart-defter', parola: 'dogru-parola-1' }));
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Kart Kişi', kullaniciAdi: 'kisi-kart-defter-2', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('ad ve etkinlik değişimi eski, yeni değer ve yazan kişiyle düşer', async () => {
    await kisiyle((db) => db.sorgu("UPDATE kisi SET ad = 'Yeni Ad', aktif = false, surum = surum + 1 WHERE id = $1", [kisi]));
    const [satir, ...fazla] = await defter();
    assert.deepEqual(fazla, []);
    assert.equal(satir?.kisi_id, yonetici);
    assert.deepEqual(Object.keys(satir?.alanlar ?? {}).sort(), ['ad', 'aktif']);
    assert.deepEqual(satir?.alanlar.ad, { eski: 'Kart Kişi', yeni: 'Yeni Ad' });
  });

  test('parola değişimi ve oturumları düşürme satır yazmaz; parola özeti defterde hiç geçmez', async () => {
    const once = (await defter()).length;
    await kisiyle((db) => db.sorgu("UPDATE kisi SET parola_ozeti = 'deneme-ozet', oturumlar_gecersiz_once = now(), surum = surum + 1 WHERE id = $1", [kisi]));
    assert.equal((await defter()).length, once);
    await kisiyle((db) => db.sorgu("UPDATE kisi SET parola_ozeti = 'deneme-ozet-2', ad = 'Son Ad' WHERE id = $1", [kisi]));
    const son = (await defter()).at(-1);
    assert.deepEqual(Object.keys(son?.alanlar ?? {}), ['ad']);
    const metin = JSON.stringify(await o().sahip.sorgu("SELECT alanlar FROM denetim_degisiklik WHERE tablo = 'kisi'"));
    assert.equal(metin.includes('deneme-ozet'), false);
    assert.equal(metin.includes('parola_ozeti'), false);
  });
});
