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

// 1372 a: iş merkezi, istasyon ve makine kartı tetikleri (göç 20261030167000) aynı ortak defter işlevine bağlıdır.
describe('iş merkezi, istasyon ve makine kartı değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let merkez = 0;
  let istasyon = 0;
  let makine = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });
  const defter = (tablo: string, id: number): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      "SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 AND anahtar = jsonb_build_object('id', $2::int) ORDER BY denetim_degisiklik.id",
      [tablo, id],
    );
  const ozet = (satirlar: Defter[]): [string, number | null, string[]][] => satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]);

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_kart_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'istasyon-kart-defter', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DDK', 'Deneme merkez') RETURNING id"))!.id;
    istasyon = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DDK-1', 'Deneme istasyon', $1) RETURNING id", [merkez]))!.id;
    makine = (await sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('DDM-1', 'Deneme makine', $1) RETURNING id", [istasyon]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('üç kartta güncelleme eski, yeni değer ve yazan kişiyle düşer; yalnız sürüm değişirse satır yazılmaz', async () => {
    await kisiyle((db) => db.sorgu("UPDATE is_merkezi SET ad = 'Yeni merkez', surum = surum + 1 WHERE id = $1", [merkez]));
    await kisiyle((db) => db.sorgu('UPDATE is_merkezi SET surum = surum + 1 WHERE id = $1', [merkez]));
    await kisiyle((db) => db.sorgu('UPDATE istasyon SET aktif = false WHERE id = $1', [istasyon]));
    await kisiyle((db) => db.sorgu("UPDATE makine SET marka_model = 'Deneme model' WHERE id = $1", [makine]));
    assert.deepEqual(ozet(await defter('is_merkezi', merkez)), [['guncelle', yonetici, ['ad']]]);
    // İstasyon eklemesi de deftere düşer (1968 a); kurulumdaki ekleme kişisizdir.
    const ist = ozet(await defter('istasyon', istasyon));
    assert.deepEqual(ist.map((s) => s.slice(0, 2)), [['ekle', null], ['guncelle', yonetici]]);
    assert.deepEqual(ist[1]?.[2], ['aktif']);
    assert.deepEqual((await defter('makine', makine))[0]?.alanlar.marka_model, { eski: null, yeni: 'Deneme model' });
  });

  test('kişisiz silme (göç) kişi boş yazılır', async () => {
    await o().sahip.sorgu('DELETE FROM makine WHERE id = $1', [makine]);
    assert.deepEqual(ozet(await defter('makine', makine)).at(-1)?.slice(0, 2), ['sil', null]);
  });
});

// 1968 a: plan ayarı, makine durumu ve istasyon eklemesi (göç 20261103090500) planın kapasitesidir; değişiklik akışı (1962) okur.
describe('istasyon plan ayarı, makine durumu ve istasyon eklemesi değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let merkez = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisiyle = <T>(is: (db: Db) => Promise<T>): Promise<T> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });
  const defter = (tablo: string): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>('SELECT id::text, islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 ORDER BY denetim_degisiklik.id', [tablo]);

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_plan_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'istasyon-plan-defter', parola: 'dogru-parola-1' }));
    merkez = (await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DPA', 'Deneme merkez') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yeni istasyon ekle olarak yazan kişiyle düşer; sürüm deftere girmez', async () => {
    await kisiyle((db) => db.sorgu("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DPA-1', 'Deneme istasyon', $1)", [merkez]));
    const [ekle] = await defter('istasyon');
    assert.equal(ekle?.islem, 'ekle');
    assert.equal(ekle?.kisi_id, yonetici);
    assert.deepEqual(ekle?.alanlar.kod, { eski: null, yeni: 'DPA-1' });
    assert.ok(!('surum' in (ekle?.alanlar ?? {})));
  });

  test('verim değişikliği eski ve yeni değerle düşer; değiştiren kişi ve zaman sütunu deftere girmez', async () => {
    const istasyon = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DPA-2', 'Verim istasyonu', $1) RETURNING id", [merkez]))!.id;
    await kisiyle((db) => db.sorgu('INSERT INTO istasyonlar_plan_ayari (istasyon_id, verim_yuzde, operator_ihtiyaci, degistiren_kisi_id) VALUES ($1, 90, 1, $2)', [istasyon, yonetici]));
    await kisiyle((db) => db.sorgu('UPDATE istasyonlar_plan_ayari SET verim_yuzde = 75, degisme = now() + interval \'1 minute\', surum = surum + 1 WHERE istasyon_id = $1', [istasyon]));
    const d = await defter('istasyonlar_plan_ayari');
    assert.deepEqual(d.map((x) => [x.islem, x.kisi_id]), [['ekle', yonetici], ['guncelle', yonetici]]);
    assert.deepEqual(d[1]?.alanlar, { verim_yuzde: { eski: 90, yeni: 75 } });
    for (const alan of ['degistiren_kisi_id', 'degisme', 'surum']) assert.ok(!(alan in (d[0]?.alanlar ?? {})), alan);
  });

  test('makine arızaya alınıp çalışır yapılması iki güncelleme olarak düşer', async () => {
    const istasyon = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DPA-3', 'Makine istasyonu', $1) RETURNING id", [merkez]))!.id;
    const makine = (await o().sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('DPM-1', 'Deneme makine', $1) RETURNING id", [istasyon]))!.id;
    await kisiyle((db) => db.sorgu("INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, 'calisir', $2)", [makine, yonetici]));
    await kisiyle((db) => db.sorgu("UPDATE istasyonlar_makine_durumu SET durum = 'ariza', aciklama = 'Deneme arızası' WHERE makine_id = $1", [makine]));
    await kisiyle((db) => db.sorgu("UPDATE istasyonlar_makine_durumu SET durum = 'calisir', aciklama = NULL WHERE makine_id = $1", [makine]));
    const d = await defter('istasyonlar_makine_durumu');
    assert.deepEqual(d.map((x) => x.islem), ['ekle', 'guncelle', 'guncelle']);
    assert.deepEqual(d[1]?.alanlar.durum, { eski: 'calisir', yeni: 'ariza' });
    assert.deepEqual(d[2]?.alanlar.durum, { eski: 'ariza', yeni: 'calisir' });
  });
});
