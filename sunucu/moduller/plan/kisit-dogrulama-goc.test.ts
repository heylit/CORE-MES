import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// Kayıt yazan kişi kısıtı doğrulanır (2204-1 a): temiz veride doğrulanır; olmayan kişiye bağlı eski satır varsa göç durmaz,
// satır değişmez, kısıt NOT VALID kalır. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261106099900_plan_kisit_dogrulama.sql';
const KISIT = 'plan_planlama_kaydi_guncelleyen_kisi_fk';

describe('plan_planlama_kaydi kişi kısıtı doğrulanır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('plkisit');
    klasor = await mkdtemp(join(tmpdir(), 'kisit-dogrula-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('temiz veride kısıt doğrulanır; yetim eski satırda göç durmaz, satır değişmez, kısıt yeni yazmayı denetlemeyi sürdürür', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    assert.ok(hepsi.includes(GOC), 'göç bulunamadı');
    for (const ad of hepsi.filter((a) => a < GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const dogrulandi = async (): Promise<boolean> => (await sahip.tek<{ v: boolean }>(
      "SELECT convalidated AS v FROM pg_constraint WHERE conrelid = 'plan_planlama_kaydi'::regclass AND conname = $1", [KISIT]))!.v;
    assert.equal(await dogrulandi(), false, 'göçten önce kısıt doğrulanmamış olmalı');
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'plkisit', parola: 'dogru-parola-1' }));
    const ekle = (anahtar: string, kisiId: number) => sahip.sorgu(
      "INSERT INTO plan_planlama_kaydi (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', '{}'::jsonb, 1, $2)", [anahtar, kisiId]);
    await ekle('recete-rota-motoru-v1:planlama-kisit-temiz', kisi);

    await copyFile(join(GOC_KLASORU, GOC), join(klasor, GOC));
    await gocleriUygula(ayar, klasor, { sema });
    assert.equal(await dogrulandi(), true, 'temiz veride kısıt doğrulanır');

    // Eski satır benzetimi: kısıt kaldırılıp yetim satır yazılır, kısıt aynı tanımla NOT VALID geri gelir;
    // göç kaydı silinip göç yeniden uygulanır (klasörde ondan sonraki göç yok).
    const tanim = (await sahip.tek<{ t: string }>(
      "SELECT pg_get_constraintdef(oid) AS t FROM pg_constraint WHERE conrelid = 'plan_planlama_kaydi'::regclass AND conname = $1", [KISIT]))!.t;
    await sahip.sorgu(`ALTER TABLE plan_planlama_kaydi DROP CONSTRAINT ${KISIT}`);
    await ekle('recete-rota-motoru-v1:planlama-kisit-yetim', kisi + 1000);
    await sahip.sorgu(`ALTER TABLE plan_planlama_kaydi ADD CONSTRAINT ${KISIT} ${tanim.replace(/\s+NOT VALID$/, '')} NOT VALID`);
    await sahip.sorgu('DELETE FROM goc_kaydi WHERE ad = $1', [GOC]);
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [GOC]);
    assert.equal(await dogrulandi(), false, 'yetim satır varken kısıt NOT VALID kalır');
    const yetim = await sahip.tek<{ k: number }>("SELECT guncelleyen_kisi_id AS k FROM plan_planlama_kaydi WHERE anahtar = 'recete-rota-motoru-v1:planlama-kisit-yetim'");
    assert.equal(yetim?.k, kisi + 1000, 'yetim satır değişmez');
    await assert.rejects(ekle('recete-rota-motoru-v1:planlama-kisit-yeni', kisi + 2000), new RegExp(KISIT), 'yeni yazmada kişi denetlenir');
  });
});
