import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));

// 1305 a: göç önce karta bağlanamayan satırları sayar; sıfır değilse hiçbir şey değiştirmeden durur ve satırları yazar, satır silinmez.
// Satır karta bağlanınca göç yeniden çalışır ve yabancı anahtarlar gelir. Veriler uydurmadır.
describe('değişiklik yönetimi malzeme yabancı anahtar göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocdyfk');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocdyfk-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('bağsız satır varken göç durur ve hiçbir şey değişmez; satır bağlanınca anahtarlar gelir ve bağsız satır reddedilir', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_degisiklik_yonetimi_malzeme_fk.sql'));
    assert.equal(sira > 0, true, 'göç bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DY-FK-', 0)");
    const kartAc = async (s: number): Promise<number> => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'DY-FK-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`dy-fk-${String(s)}`, s, JSON.stringify({ id: `dy-fk-${String(s)}`, com: { ad: `Deneme ${String(s)}`, birim: 'adet' } }), kisi]))!.no;
    const kart = await kartAc(1);
    const yok = kart + 1000;
    const talep = (await sahip.tek<{ id: number }>(
      "INSERT INTO degisiklik_yonetimi_talep (baslik, aciliyet, acan_kisi_id) VALUES ('Deneme', 'normal', $1) RETURNING id", [kisi]))!.id;
    await sahip.sorgu('INSERT INTO degisiklik_yonetimi_talep_kalemi (talep_id, malzeme_id, sira) VALUES ($1, $2, 1), ($1, $3, 2)', [talep, kart, yok]);
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO degisiklik_yonetimi_emir (baslik, sinif, aciliyet, koordinator_kisi_id) VALUES ('Deneme', 'D1', 'normal', $1) RETURNING id", [kisi]))!.id;
    await sahip.sorgu('INSERT INTO degisiklik_yonetimi_emir_kalemi (emir_id, malzeme_id, sira) VALUES ($1, $2, 1)', [emir, yok]);
    const kalemler = async (): Promise<unknown> => ({
      talep: await sahip.sorgu('SELECT * FROM degisiklik_yonetimi_talep_kalemi ORDER BY id'),
      emir: await sahip.sorgu('SELECT * FROM degisiklik_yonetimi_emir_kalemi ORDER BY id'),
    });
    const anahtarlar = async (): Promise<string[]> => (await sahip.sorgu<{ ad: string }>(
      `SELECT conname AS ad FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'malzeme_katalog_karti'::regclass
          AND conrelid = ANY(ARRAY['degisiklik_yonetimi_talep_kalemi', 'degisiklik_yonetimi_emir_kalemi', 'degisiklik_yonetimi_emir']::regclass[])
        ORDER BY conname`)).map((s) => s.ad);
    const once = await kalemler();

    await assert.rejects(gocleriUygula(ayar, GERCEK_KLASOR, { sema }), (hata: Error) => {
      assert.match(hata.message, /2 satır bir malzeme kartına bağlı değil/);
      assert.match(hata.message, new RegExp(`emir kalemi \\d+ → malzeme ${String(yok)}`));
      assert.match(hata.message, /Hiçbir şey değişmedi/);
      return true;
    });
    assert.deepEqual(await kalemler(), once);
    assert.deepEqual(await anahtarlar(), []);

    // Bağsız satırın kartı açılır (göç satırı değiştirmez; kartı insan açar), göç yeniden çalışır.
    await sahip.sorgu('UPDATE degisiklik_yonetimi_talep_kalemi SET malzeme_id = $1 WHERE malzeme_id = $2', [await kartAc(2), yok]);
    await sahip.sorgu('UPDATE degisiklik_yonetimi_emir_kalemi SET malzeme_id = $1 WHERE malzeme_id = $2', [await kartAc(3), yok]);
    const kalan = await gocleriUygula(ayar, GERCEK_KLASOR, { sema });
    assert.equal(kalan[0], hepsi[sira]);
    assert.deepEqual(await anahtarlar(),
      ['degisiklik_yonetimi_emir_kalemi_malzeme', 'degisiklik_yonetimi_emir_son_urun', 'degisiklik_yonetimi_talep_kalemi_malzeme']);

    await assert.rejects(sahip.sorgu('INSERT INTO degisiklik_yonetimi_talep_kalemi (talep_id, malzeme_id, sira) VALUES ($1, $2, 3)', [talep, yok]),
      /degisiklik_yonetimi_talep_kalemi_malzeme/);
    await assert.rejects(sahip.sorgu('INSERT INTO degisiklik_yonetimi_emir_kalemi (emir_id, malzeme_id, sira) VALUES ($1, $2, 2)', [emir, yok]),
      /degisiklik_yonetimi_emir_kalemi_malzeme/);
    await assert.rejects(sahip.sorgu(
      "UPDATE degisiklik_yonetimi_emir SET gecerlilik_turu = 'seri', gecerlilik_son_urun_id = $2, gecerlilik_ilk_seri = 1 WHERE id = $1", [emir, yok]),
    /degisiklik_yonetimi_emir_son_urun/);
  });
});
