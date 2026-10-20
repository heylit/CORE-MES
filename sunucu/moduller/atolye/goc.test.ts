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

describe('geçiş göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocg');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocg-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('her bölümün girişi en yakın kenarda 4 m kepenk olur; kenar ucundaki giriş kenarın içine çekilir; girişsiz bölüme geçiş eklenmez', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_atolye_gecis.sql'));
    assert.equal(sira > 0, true, 'geçiş göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Göç Denemesi') RETURNING id");
    const salon = (kod: string, g: number, d: number, giris: [number, number] | null) => vt.sorgu(
      `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, giris_x, giris_z, kaydeden_kisi_id, fabrika_x)
       VALUES ($1, $1, $2, $3, 4, $4, $5, $6, $7)`,
      [kod, g, d, giris?.[0] ?? null, giris?.[1] ?? null, kisi?.id, kod.charCodeAt(0) * 600],
    );
    await salon('A', 40, 24, [20, 23.5]);
    await salon('B', 30, 20, [0.5, 1]);
    await salon('C', 30, 20, [29, 10]);
    await salon('D', 30, 20, null);

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    assert.deepEqual(
      await vt.sorgu(`SELECT s.kod, g.tur, g.kenar, g.ofset, g.genislik FROM atolye_gecis g JOIN atolye_salon s ON s.id = g.salon_id ORDER BY s.kod`),
      [
        { kod: 'A', tur: 'kepenk', kenar: 'on', ofset: '0.00', genislik: '4.00' },
        // Sol kenar (x = 0,5) en yakın; z = 1 kenarın ucunda, kepenk kenarın içine çekilir: ofset 2 - 10.
        { kod: 'B', tur: 'kepenk', kenar: 'sol', ofset: '-8.00', genislik: '4.00' },
        { kod: 'C', tur: 'kepenk', kenar: 'sag', ofset: '0.00', genislik: '4.00' },
      ],
    );
  });
});
