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

// Dört haneyi aşan kimlik kesilmeden yazılır (10000. kayıt 1000. kayıtla çakışmaz); göçten önceki numara değişmez,
// numara elle değiştirilemez. Veriler uydurmadır.
describe('değişiklik yönetimi numara sınırı göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocdyno');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocdyno-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('eski numara kalır; 1000 ve 10000 ayrı numara alır; numara elle değişmez', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_degisiklik_yonetimi_no_siniri.sql'));
    assert.equal(sira > 0, true, 'göç bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    const talepAc = async (): Promise<string> => (await sahip.tek<{ no: string }>(
      "INSERT INTO degisiklik_yonetimi_talep (baslik, aciliyet, acan_kisi_id) VALUES ('Deneme', 'normal', $1) RETURNING no", [kisi]))!.no;
    const emirAc = async (): Promise<string> => (await sahip.tek<{ no: string }>(
      "INSERT INTO degisiklik_yonetimi_emir (baslik, sinif, aciliyet, koordinator_kisi_id) VALUES ('Deneme', 'D1', 'normal', $1) RETURNING no",
      [kisi]))!.no;
    assert.equal(await talepAc(), 'ECR-0001');
    assert.equal(await emirAc(), 'ECO-0001');

    await gocleriUygula(ayar, GERCEK_KLASOR, { sema });
    assert.deepEqual(await sahip.sorgu('SELECT no FROM degisiklik_yonetimi_talep ORDER BY id'), [{ no: 'ECR-0001' }]);
    assert.deepEqual(await sahip.sorgu('SELECT no FROM degisiklik_yonetimi_emir ORDER BY id'), [{ no: 'ECO-0001' }]);

    for (const tablo of ['degisiklik_yonetimi_talep', 'degisiklik_yonetimi_emir']) {
      await sahip.sorgu(`ALTER TABLE ${tablo} ALTER COLUMN id RESTART WITH 1000`);
    }
    assert.equal(await talepAc(), 'ECR-1000');
    assert.equal(await emirAc(), 'ECO-1000');
    for (const tablo of ['degisiklik_yonetimi_talep', 'degisiklik_yonetimi_emir']) {
      await sahip.sorgu(`ALTER TABLE ${tablo} ALTER COLUMN id RESTART WITH 9999`);
    }
    assert.equal(await talepAc(), 'ECR-9999');
    assert.equal(await talepAc(), 'ECR-10000');
    assert.equal(await emirAc(), 'ECO-9999');
    assert.equal(await emirAc(), 'ECO-10000');

    await sahip.sorgu("UPDATE degisiklik_yonetimi_talep SET no = 'ECR-X' WHERE id = 1");
    await sahip.sorgu("UPDATE degisiklik_yonetimi_emir SET no = 'ECO-X', baslik = 'Yeni' WHERE id = 1");
    assert.deepEqual(await sahip.sorgu('SELECT no FROM degisiklik_yonetimi_talep WHERE id = 1'), [{ no: 'ECR-0001' }]);
    assert.deepEqual(await sahip.sorgu('SELECT no, baslik FROM degisiklik_yonetimi_emir WHERE id = 1'), [{ no: 'ECO-0001', baslik: 'Yeni' }]);
  });
});
