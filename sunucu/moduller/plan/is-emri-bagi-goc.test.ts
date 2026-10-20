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

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const BAG_GOCU = '_plan_is_emri_bagi.sql';

describe('plan - iş emri bağı göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('planbaggoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-planbag-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('279 a: iş emri olmayan artık plan satırları silinir; senaryodaki deneme emri (eksi kimlik) kalır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(BAG_GOCU));
    assert.ok(goc, 'bağ göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'pb-kisi', kullaniciAdi: 'pb-kisi', parola: 'dogru-parola-1' }));
    const artik = 999_999;
    await sahip.sorgu("INSERT INTO plan_yerlesimi (is_emri_id, kisi_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, now(), now() + interval '1 hour', $2)", [artik, kisi]);
    await sahip.sorgu('INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet) VALUES ($1, 1, 3)', [artik]);
    const senaryo = (await sahip.tek<{ id: number }>('INSERT INTO plan_senaryosu (ad, taban_plan_surumu, acan_kisi_id) VALUES ($1, 1, $2) RETURNING id', ['Deneme', kisi]))!.id;
    for (const ie of [artik, -1001]) {
      await sahip.sorgu("INSERT INTO plan_senaryo_yerlesimi (senaryo_id, is_emri_id, kisi_id, baslangic, bitis) VALUES ($1, $2, $3, now(), now() + interval '1 hour')", [senaryo, ie, kisi]);
      await sahip.sorgu('INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, is_emri_id, parca_no, adet) VALUES ($1, $2, 1, 3)', [senaryo, ie]);
    }

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const idler = async (tablo: string) => (await sahip.sorgu<{ i: number }>(`SELECT is_emri_id AS i FROM ${tablo} ORDER BY 1`)).map((r) => r.i);
    assert.deepEqual(await idler('plan_yerlesimi'), []);
    assert.deepEqual(await idler('plan_yerlesim_parcasi'), []);
    assert.deepEqual(await idler('plan_senaryo_yerlesimi'), [-1001]);
    assert.deepEqual(await idler('plan_senaryo_yerlesim_parcasi'), [-1001]);
  });
});
