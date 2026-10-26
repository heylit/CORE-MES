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

// 563 c, 563 2 a: göç yalnız yeni tablo açar; dolu veritabanında var olan yetkinlik ve makine satırları değişmez. Veriler uydurmadır.
describe('makine yetkinliği göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocmy');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocmy-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('dolu veritabanında var olan satırlar değişmez, yeni tablolar boş açılır; kısıtlar ve kademeli silme çalışır', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_istasyonlar_makine_yetkinlik.sql'));
    assert.equal(sira > 0, true, 'makine yetkinliği göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    const im = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IM1', 'Deneme') RETURNING id"))!.id;
    const ist = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('IST1', 'Deneme', $1) RETURNING id", [im]))!.id;
    const mk = (await sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('MK1', 'Deneme', $1) RETURNING id", [ist]))!.id;
    await sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id, veren_kisi_id, verilme) VALUES ($1, $2, $1, now())', [kisi, ist]);
    const once = {
      yetkinlik: await sahip.sorgu('SELECT * FROM istasyonlar_yetkinlik ORDER BY kisi_id, istasyon_id'),
      makine: await sahip.sorgu('SELECT * FROM makine ORDER BY id'),
    };

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    assert.deepEqual(await sahip.sorgu('SELECT * FROM istasyonlar_yetkinlik ORDER BY kisi_id, istasyon_id'), once.yetkinlik);
    assert.deepEqual(await sahip.sorgu('SELECT * FROM makine ORDER BY id'), once.makine);
    for (const tablo of ['istasyonlar_makine_yetkinlik', 'istasyonlar_makine_yetkinlik_gecmisi', 'istasyonlar_kisi_tezgah_siniri']) {
      assert.deepEqual(await sahip.sorgu(`SELECT count(*)::int AS n FROM ${tablo}`), [{ n: 0 }], tablo);
    }

    await sahip.sorgu('INSERT INTO istasyonlar_makine_yetkinlik (kisi_id, makine_id, veren_kisi_id) VALUES ($1, $2, $1)', [kisi, mk]);
    await assert.rejects(sahip.sorgu('INSERT INTO istasyonlar_kisi_tezgah_siniri (kisi_id, en_cok, degistiren_kisi_id) VALUES ($1, 0, $1)', [kisi]));
    await assert.rejects(sahip.sorgu('INSERT INTO istasyonlar_kisi_tezgah_siniri (kisi_id, en_cok, degistiren_kisi_id) VALUES ($1, 21, $1)', [kisi]));
    await sahip.sorgu('INSERT INTO istasyonlar_kisi_tezgah_siniri (kisi_id, en_cok, degistiren_kisi_id) VALUES ($1, 20, $1)', [kisi]);
    await assert.rejects(sahip.sorgu(
      "INSERT INTO istasyonlar_makine_yetkinlik_gecmisi (kisi_id, makine_id, makine_kod, islem, neden, degistiren_kisi_id) VALUES ($1, $2, 'MK1', 'degistir', 'elle', $1)", [kisi, mk],
    ));
    await sahip.sorgu('DELETE FROM makine WHERE id = $1', [mk]);
    assert.deepEqual(await sahip.sorgu('SELECT count(*)::int AS n FROM istasyonlar_makine_yetkinlik'), [{ n: 0 }]);
  });
});
