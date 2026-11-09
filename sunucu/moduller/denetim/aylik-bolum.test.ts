import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '../../cekirdek/goc.ts';
import { izinYok, testSemasiAc } from '../../cekirdek/test-vt.ts';
import type { TestVeritabani } from '../../cekirdek/test-vt.ts';
import { denetimDurumu } from './sorgular.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const BOLUM_GOCU = '20261108063200_denetim_aylik_bolum.sql';

const buAy = (tablo: string): string => {
  const simdi = new Date();
  return `${tablo}_y${String(simdi.getUTCFullYear())}m${String(simdi.getUTCMonth() + 1).padStart(2, '0')}`;
};

// Göç dolu tabloda denenir: bölüm göçünden önceki göçler uygulanır, satır yazılır, sonra kalan göçler uygulanır.
describe('denetim aylık bölüm göçü (1765): dolu denetim kaydı ve değişiklik defteri bölümlenir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor: string | undefined;
  let once: { kayit: unknown[]; degisiklik: unknown[] } | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const KAYIT_SQL = 'SELECT id::int, zaman, kisi_id, yontem, yol, parametre, govde, modul, yetki FROM denetim_kaydi ORDER BY id';
  const DEGISIKLIK_SQL = 'SELECT id::int, zaman, kisi_id, tablo, anahtar, islem, alanlar FROM denetim_degisiklik ORDER BY id';

  before(async () => {
    ortam = await testSemasiAc('denetim_bolum');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-denetim-bolum-'));
    const adlar = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    for (const ad of adlar.filter((a) => a < BOLUM_GOCU)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });

    const { vt } = ortam;
    await vt.sorgu("INSERT INTO kisi (ad) VALUES ('Bolum Denetim')");
    await vt.sorgu(`INSERT INTO denetim_kaydi (zaman, kisi_id, yontem, yol, govde, modul, yetki)
      SELECT t, (SELECT max(id) FROM kisi), 'POST', '/deneme/' || n, jsonb_build_object('n', n), 'denetim', 'denetim.oku'
        FROM unnest(ARRAY['2026-08-31T23:30:00Z', '2026-09-01T00:00:00Z', '2026-10-15T12:00:00Z']::timestamptz[]) WITH ORDINALITY u(t, n)`);
    await vt.sorgu("INSERT INTO denetim_kaydi (yontem, yol) VALUES ('GET', '/indir')");
    // Değişiklik defterine tetik yazar: izlenen tabloda güncelleme.
    await vt.sorgu("UPDATE kisi SET ad = 'Bolum Denetim 2' WHERE ad = 'Bolum Denetim'");
    once = { kayit: await vt.sorgu(KAYIT_SQL), degisiklik: await vt.sorgu(DEGISIKLIK_SQL) };

    for (const ad of adlar.filter((a) => a >= BOLUM_GOCU)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  });

  after(async () => {
    await ortam?.kaldir();
    if (klasor) await rm(klasor, { recursive: true, force: true });
  });

  test('her satır olduğu gibi kalır ve ayına göre bölüme düşer', async () => {
    const { vt, sahip } = acik();
    assert.equal((once?.kayit.length ?? 0) >= 4, true);
    assert.equal((once?.degisiklik.length ?? 0) >= 1, true);
    assert.deepEqual(await vt.sorgu(KAYIT_SQL), once?.kayit);
    // Bölüm göçünden sonraki göçler de izlenen tablolara yazabilir (2452: rol_islemi); onların yeni satırları deftere eklenir, eskiler değişmez.
    const sonId = Math.max(...(once?.degisiklik ?? []).map((s) => (s as { id: number }).id));
    assert.deepEqual((await vt.sorgu<{ id: number }>(DEGISIKLIK_SQL)).filter((s) => s.id <= sonId), once?.degisiklik);
    assert.deepEqual(
      await sahip.sorgu("SELECT yol, tableoid::regclass::text AS bolum FROM denetim_kaydi WHERE yol LIKE '/deneme/%' ORDER BY yol"),
      [
        { yol: '/deneme/1', bolum: 'denetim_kaydi_y2026m08' },
        { yol: '/deneme/2', bolum: 'denetim_kaydi_y2026m09' },
        { yol: '/deneme/3', bolum: 'denetim_kaydi_y2026m10' },
      ],
    );
  });

  test('iki tablo da zaman aralığına göre bölümlüdür; birincil anahtar (id, zaman), kimlik diziden devam eder', async () => {
    const { vt, sahip } = acik();
    for (const tablo of ['denetim_kaydi', 'denetim_degisiklik']) {
      assert.deepEqual(
        await sahip.tek("SELECT pg_get_partkeydef($1::regclass) AS anahtar, pg_get_constraintdef(c.oid) AS pk FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.contype = 'p'", [tablo]),
        { anahtar: 'RANGE (zaman)', pk: 'PRIMARY KEY (id, zaman)' },
        tablo,
      );
    }
    const enBuyuk = Math.max(...(once?.kayit ?? []).map((s) => (s as { id: number }).id));
    const yeni = await vt.tek<{ id: number; bolum: string }>(
      "INSERT INTO denetim_kaydi (yontem, yol) VALUES ('POST', '/yeni') RETURNING id::int, tableoid::regclass::text AS bolum");
    assert.deepEqual(yeni, { id: enBuyuk + 1, bolum: buAy('denetim_kaydi') });
  });

  test('yalnız ekleme sürer: uygulama güncelleyemez, silemez; durum ekranı tetikleri etkin görür', async () => {
    const { vt } = acik();
    await assert.rejects(vt.sorgu("UPDATE denetim_kaydi SET yol = '/baska'"), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM denetim_kaydi'), /yalnız ekleme/);
    await assert.rejects(vt.sorgu("UPDATE denetim_degisiklik SET tablo = 'baska'"), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM denetim_degisiklik'), /yalnız ekleme/);
    await assert.rejects(vt.sorgu(`TRUNCATE ${buAy('denetim_kaydi')}`), izinYok);
    const durum = await denetimDurumu(vt);
    assert.equal(durum.yazilir, true);
    assert.equal(durum.degismez, true);
  });
});
