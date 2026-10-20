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
const ADLAR = ['kisi_ad_bos_degil', 'kisi_kullanici_adi_bicimi', 'rol_ad_bos_degil', 'rol_kod_bicimi', 'rol_kod_tek'];
const ESKI_ADLAR = ['kisi_ad_check', 'kisi_kullanici_adi_check', 'rol_ad_check', 'rol_kod_check', 'rol_kod_key'];

describe('rol ve kişi kısıt adları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const adlar = async (): Promise<string[]> => (await acik().vt.sorgu<{ ad: string }>(
    `SELECT c.conname AS ad FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relnamespace = to_regnamespace($1) AND t.relname IN ('rol', 'kisi') AND c.contype IN ('c', 'u')
      ORDER BY c.conname`,
    [acik().sema],
  )).map((s) => s.ad);

  before(async () => {
    ortam = await testSemasiAc('kisitad');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-kisitad-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('kısıt adları göçü: elle adlandırılmış kısıt göçü durdurmaz; sonunda PostgreSQL adı kalmaz, ihlal yeni adla döner', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_kisiler_kisit_adlari.sql'));
    assert.equal(sira > 0, true, 'kısıt adları göçü bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    const { ayar, sema, vt, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    for (const eski of ESKI_ADLAR) assert.ok((await adlar()).includes(eski), eski);

    // Biri önceden elle adlandırılmış olsun: göç yalnız eski adı bulduğunu değiştirir.
    await sahip.sorgu('ALTER TABLE rol RENAME CONSTRAINT rol_ad_check TO rol_ad_bos_degil');
    await gocleriUygula(ayar, GERCEK_KLASOR, { sema });

    const son = await adlar();
    for (const ad of ADLAR) assert.ok(son.includes(ad), ad);
    for (const eski of ESKI_ADLAR) assert.equal(son.includes(eski), false, eski);
    await assert.rejects(vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('yonetici', 'İkinci')"), /rol_kod_tek/);
    await assert.rejects(vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('Büyük', 'x')"), /rol_kod_bicimi/);
    await assert.rejects(vt.sorgu("INSERT INTO kisi (ad) VALUES ('  ')"), /kisi_ad_bos_degil/);
  });
});
