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
const EMIR_NO_GOCU = '_uretim_emirleri_emir_no.sql';

describe('emir no göçü dolu tabloda (gerçek PostgreSQL, kart #802)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('emirnogoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-emirno-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('var olan numaralar değişmez; numarasız eklemede eski biçim yazılır, verilen numara kullanılır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(EMIR_NO_GOCU));
    assert.ok(goc, 'emir no göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'en-kisi', kullaniciAdi: 'en-kisi', parola: 'dogru-parola-1' }));
    const merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ENG', 'Deneme') RETURNING id"))!.id;
    const ist = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('ENG1', 'Deneme', $1) RETURNING id", [merkez]))!.id;
    const ekle = async (emirNo?: string): Promise<{ id: number; emir_no: string }> => (await sahip.tek<{ id: number; emir_no: string }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id${emirNo === undefined ? '' : ', emir_no'})
       VALUES ('P-EN', 'Deneme', 5, $1, $2${emirNo === undefined ? '' : ', $3'}) RETURNING id, emir_no`, emirNo === undefined ? [ist, kisi] : [ist, kisi, emirNo]))!;
    await ekle();
    await ekle();
    const once = await sahip.sorgu<{ id: number; emir_no: string }>('SELECT id, emir_no FROM uretim_emri ORDER BY id');

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    assert.deepEqual(await sahip.sorgu('SELECT id, emir_no FROM uretim_emri ORDER BY id'), once, 'var olan emirlerin numarası değişmez');
    const eski = await ekle();
    assert.equal(eski.emir_no, `UE-${String(eski.id).padStart(6, '0')}`, 'numara verilmezse eski biçim');
    assert.equal((await ekle('ABC-P12-PARCA-2610-001')).emir_no, 'ABC-P12-PARCA-2610-001');
    await assert.rejects(ekle('ABC-P12-PARCA-2610-001'), /uretim_emri_no_benzersiz/);
    await assert.rejects(ekle(' X'), /uretim_emri_no_bicimi/);

  });
});
