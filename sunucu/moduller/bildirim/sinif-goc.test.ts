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

// 2174-2 a: sınıf göçü dolu tabloya yalnız varsayılanlı sütun ekler; var olan satır bilgi olur, yapıldı boş kalır. Veriler uydurmadır.
describe('bildirim sınıfı göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocbs');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocbs-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('var olan satırlar bilgi sınıfına geçer, öteki sütunlar değişmez; kısıtlar geçersiz sınıfı ve bilgide yapıldıyı reddeder', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_bildirim_sinif.sql'));
    assert.equal(sira > 0, true, 'bildirim sınıfı göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    await sahip.sorgu(
      `INSERT INTO bildirim_kaydi (kisi_id, tur, onem, baslik, kaynak_modul, tekil_anahtar, okundu)
       VALUES ($1, 'malzemeler.kart-onay-bekliyor', 'uyari', 'Onay bekliyor', 'malzemeler', 'malzemeler.kart-onay-bekliyor:K1', NULL),
              ($1, 'istasyonlar.makine-durdu', 'acil', 'Durdu', 'istasyonlar', NULL, now())`, [kisi],
    );
    const once = await sahip.sorgu('SELECT * FROM bildirim_kaydi ORDER BY id');

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    const sonra = await sahip.sorgu<Record<string, unknown>>('SELECT * FROM bildirim_kaydi ORDER BY id');
    assert.deepEqual(sonra.map((r) => [r['sinif'], r['yapildi']]), [['bilgi', null], ['bilgi', null]]);
    assert.deepEqual(sonra.map(({ sinif: _s, yapildi: _y, ...r }) => r), once);

    await assert.rejects(sahip.sorgu("UPDATE bildirim_kaydi SET sinif = 'duyuru'"));
    await assert.rejects(sahip.sorgu('UPDATE bildirim_kaydi SET yapildi = now()'));
    await sahip.sorgu("UPDATE bildirim_kaydi SET sinif = 'gorev', yapildi = now() WHERE tekil_anahtar IS NOT NULL");
  });
});
