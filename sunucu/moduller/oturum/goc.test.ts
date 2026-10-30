import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { izinYok, testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));

describe('deneme koruması göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  const adlar = async (): Promise<string[]> =>
    (await acik().vt.sorgu<{ kullanici_adi: string }>('SELECT kullanici_adi FROM giris_denemesi ORDER BY id')).map((s) => s.kullanici_adi);

  before(async () => {
    ortam = await testSemasiAc('gocd');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocd-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('dolu tabloda uygulanır, satırlar kalır; UPDATE ve TRUNCATE reddedilir, DELETE yalnız 30 günden eski satırda kabul edilir', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_oturum_deneme_korumasi.sql'));
    assert.equal(sira > 0, true, 'deneme koruması göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    // Sınırın iki yanı: saklama süresini aşmış ve dolmasına bir gün kalmış satır. Pay bir gün: genç satır göçler ve
    // silme denemesi boyunca genç kalmalı; bir dakikalık pay yük altında aşılmıştı (kart #1302).
    await vt.sorgu(
      `INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES
         ('eski', 'hatali', '10.0.0.1', now() - interval '30 days 1 minute'),
         ('eski-kalan', 'basarili', '10.0.0.1', now() - interval '45 days'),
         ('genc', 'hatali', '10.0.0.1', now() - interval '29 days'),
         ('taze', 'basarili', '10.0.0.1', now())`,
    );
    // Göçten önce koruma yoktu: aşağıdaki retler bu göçün işidir.
    await vt.sorgu("UPDATE giris_denemesi SET ip = '10.0.0.2' WHERE kullanici_adi = 'taze'");

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    assert.deepEqual(await adlar(), ['eski', 'eski-kalan', 'genc', 'taze']);

    const yalnizEkleme = /giris_denemesi tablosuna yalnız ekleme yapılır/;
    const gencSilinmez = /giris_denemesi tablosundan yalnız 30 günden eski satır silinir/;

    await assert.rejects(vt.sorgu("UPDATE giris_denemesi SET sonuc = 'basarili' WHERE kullanici_adi = 'genc'"), yalnizEkleme, 'genç satır UPDATE');
    await assert.rejects(vt.sorgu("UPDATE giris_denemesi SET zaman = now() WHERE kullanici_adi = 'eski'"), yalnizEkleme, 'eski satır UPDATE');
    // Uygulama kullanıcısını boşaltmadan yetki alıkoyar; tetikleyici, hakkı olan sahibi de durdurur.
    await assert.rejects(vt.sorgu('TRUNCATE giris_denemesi'), izinYok, 'TRUNCATE (uygulama)');
    await assert.rejects(sahip.sorgu('TRUNCATE giris_denemesi'), yalnizEkleme, 'TRUNCATE (sahip)');
    await assert.rejects(vt.sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'genc'"), gencSilinmez, 'genç satır DELETE');
    await assert.rejects(vt.sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'taze'"), gencSilinmez, 'taze satır DELETE');
    // Koşulsuz silme genç satıra takılır ve bütünüyle geri alınır: eski satırlar da yerinde kalır.
    await assert.rejects(vt.sorgu('DELETE FROM giris_denemesi'), gencSilinmez, 'koşulsuz DELETE');
    assert.deepEqual(
      await vt.sorgu('SELECT kullanici_adi, sonuc, ip FROM giris_denemesi ORDER BY id'),
      [
        { kullanici_adi: 'eski', sonuc: 'hatali', ip: '10.0.0.1' },
        { kullanici_adi: 'eski-kalan', sonuc: 'basarili', ip: '10.0.0.1' },
        { kullanici_adi: 'genc', sonuc: 'hatali', ip: '10.0.0.1' },
        { kullanici_adi: 'taze', sonuc: 'basarili', ip: '10.0.0.2' },
      ],
    );

    // Tam 30 günlük satır eski sayılmaz. Saat transaction boyunca sabittir: ekleme ile silme aynı ana bakar.
    const sinirda = await vt.tx(async (db) => {
      await db.sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES ('sinirda', 'hatali', '10.0.0.1', now() - interval '30 days')");
      await db.sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'sinirda'");
      return 'silindi';
    }).catch((hata: unknown) => String(hata));
    assert.match(sinirda, gencSilinmez, 'tam 30 günlük satır DELETE');
    // Bir mikrosaniye eskisi silinir.
    await vt.tx(async (db) => {
      await db.sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES ('sinir-otesi', 'hatali', '10.0.0.1', now() - interval '30 days' - interval '1 microsecond')");
      await db.sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'sinir-otesi'");
      assert.deepEqual(await db.sorgu("SELECT 1 FROM giris_denemesi WHERE kullanici_adi = 'sinir-otesi'"), []);
    });

    await vt.sorgu("DELETE FROM giris_denemesi WHERE kullanici_adi = 'eski'");
    assert.deepEqual(await adlar(), ['eski-kalan', 'genc', 'taze']);
    // Ekleme serbest kalır.
    await vt.sorgu("INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip) VALUES ('yeni', 'hatali', '10.0.0.1')");
    assert.deepEqual(await adlar(), ['eski-kalan', 'genc', 'taze', 'yeni']);
  });
});

// Kart #1358: cihaz profili göçü dolu ortak cihaz tablosuna yazmaz; açık cihazlara istasyon ataması ekler (739 a davranışı sürsün),
// kapanmış cihaza eklemez. Kayıtsız cihaz Tam başlar (1341 a geçişi).
describe('cihaz profili göçü var olan ortak cihazlarla (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('gocp');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocp-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('açık cihaz istasyon olur, kapanmış cihaza atama yazılmaz; ortak cihaz satırları değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_oturum_cihaz_profili.sql'));
    assert.equal(sira > 0, true, 'cihaz profili göçü bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    const { ayar, sema, sahip } = ortam;
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    if (kisi === null) throw new Error('kişi satırı kurulamadı');
    await sahip.sorgu(
      `INSERT INTO oturum_ortak_cihaz (belirtec_ozeti, ad, kaydeden_kisi_id, kaydedildi, kapandi, kapatan_kisi_id) VALUES
         ('ozet-acik', 'Deneme acik', $1, now(), NULL, NULL), ('ozet-kapali', 'Deneme kapali', $1, now(), now(), $1)`,
      [kisi.id],
    );
    const once = await sahip.sorgu('SELECT * FROM oturum_ortak_cihaz ORDER BY id');

    await gocleriUygula(ayar, GERCEK_KLASOR, { sema });
    assert.deepEqual(await sahip.sorgu('SELECT * FROM oturum_ortak_cihaz ORDER BY id'), once);
    assert.deepEqual(
      await sahip.sorgu(`SELECT c.ad, a.profil FROM oturum_cihaz_profil_atamasi a JOIN oturum_ortak_cihaz c ON c.id = a.cihaz_id`),
      [{ ad: 'Deneme acik', profil: 'istasyon' }],
    );
    assert.deepEqual(await sahip.sorgu('SELECT kayitsiz_profil FROM oturum_cihaz_ayari'), [{ kayitsiz_profil: 'tam' }]);
  });
});
