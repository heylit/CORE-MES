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

describe('makine yeri göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocm');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocm-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('yerleşik istasyonun aktif makineleri ayak izine yan yana dizilir; tek makineli istasyonun modeli makineye geçer; istasyon yeri değişmez', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_atolye_makine_yeri.sql'));
    assert.equal(sira > 0, true, 'makine yeri göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Göç Denemesi') RETURNING id");
    const salon = await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('A', 'A', 40, 24, 4, $1) RETURNING id", [kisi?.id],
    );
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IM1', 'Deneme') RETURNING id");
    const istasyon = async (kod: string) =>
      (await sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $1, $2) RETURNING id', [kod, im?.id]))?.id;
    const ikili = await istasyon('IST1');
    const tekli = await istasyon('IST2');
    const yersiz = await istasyon('IST3');
    const makine = async (kod: string, istasyonId: number | undefined, aktif = true) =>
      (await sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ($1, $1, $2, $3) RETURNING id', [kod, istasyonId, aktif]))?.id;
    const mA = await makine('MA', ikili);
    const mB = await makine('MB', ikili);
    await makine('MC', ikili, false);
    const mD = await makine('MD', tekli);
    await makine('ME', yersiz);
    // Tamamlanmış model, yükleme akışı olmadan: model tetikleyicileri bu satır için kapatılır.
    await sahip.sorgu('ALTER TABLE atolye_model DISABLE TRIGGER USER');
    const model = await sahip.tek<{ id: number }>(
      `INSERT INTO atolye_model (ad, kaynak_bicim, boyut_bayt, parca_sayisi, ozet, ucgen_sayisi, birim, yukari_eksen, tamam, kaydeden_kisi_id)
       VALUES ('M', 'glb', 100, 1, repeat('a', 64), 0, 'mm', 'z', true, $1) RETURNING id`, [kisi?.id],
    );
    await sahip.sorgu('ALTER TABLE atolye_model ENABLE TRIGGER USER');
    await vt.sorgu(
      `INSERT INTO atolye_istasyon_yeri (istasyon_id, salon_id, x, z, donus, genislik, derinlik, model_id)
       VALUES ($1, $3, 10, 10, 90, 6, 3, $4), ($2, $3, 20, 10, 0, 4, 2, $4)`,
      [ikili, tekli, salon?.id, model?.id],
    );
    const istasyonYerleriOnce = await vt.sorgu('SELECT * FROM atolye_istasyon_yeri ORDER BY istasyon_id');

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    assert.deepEqual(
      await vt.sorgu('SELECT makine_id AS "makineId", x, z, donus, genislik, derinlik, model_id AS "modelId" FROM atolye_makine_yeri ORDER BY makine_id'),
      [
        // 90° dönük 6 m'lik istasyon: eni z ekseninde, iki makine z = 8,5 ve 11,5'te.
        { makineId: mA, x: '10.00', z: '8.50', donus: '90.0', genislik: '3.00', derinlik: '3.00', modelId: null },
        { makineId: mB, x: '10.00', z: '11.50', donus: '90.0', genislik: '3.00', derinlik: '3.00', modelId: null },
        { makineId: mD, x: '20.00', z: '10.00', donus: '0.0', genislik: '4.00', derinlik: '2.00', modelId: model?.id },
      ],
    );
    assert.deepEqual(await vt.sorgu('SELECT * FROM atolye_istasyon_yeri ORDER BY istasyon_id'), istasyonYerleriOnce);
  });
});
