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
const BAG_GOCU = '_uretim_emirleri_rota_revizyonu_bagi.sql';

describe('emir - rota revizyonu bağı göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('rotabaggoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rotabag-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('278 a: revizyonu olmayan emir varsa göç durur ve hiçbir kaydı silmez; düzelince bağ kurulur, olmayan revizyon yazılamaz', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(BAG_GOCU));
    assert.ok(goc, 'bağ göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'rb-kisi', kullaniciAdi: 'rb-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RB-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rb-1', 'mamul', 'RB-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'rb-1', com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const rev = (await sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [kart, kisi]))!.id;
    const emirYaz = (revizyon: number) => sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ('P-RB', 'Deneme', 1, $1, $2, $3) RETURNING id",
      [kisi, kart, revizyon]);
    const iyi = (await emirYaz(rev))!.id;
    const bozuk = (await emirYaz(rev + 1000))!.id;

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    await assert.rejects(gocleriUygula(ayar, klasor, { sema }), /1 emrin kaynak rota revizyonu yok/);
    const sayi = async () => Number((await sahip.tek<{ n: string }>('SELECT count(*) AS n FROM uretim_emri'))!.n);
    assert.equal(await sayi(), 2, 'göç kayıt silmez');

    await sahip.sorgu('UPDATE uretim_emri SET kaynak_rota_revizyonu_id = $2 WHERE id = $1', [bozuk, rev]);
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    assert.equal(await sayi(), 2);
    await assert.rejects(emirYaz(rev + 1000), /uretim_emri_kaynak_rota_revizyonu/);
    assert.equal((await sahip.tek<{ r: number }>('SELECT kaynak_rota_revizyonu_id AS r FROM uretim_emri WHERE id = $1', [iyi]))!.r, rev);
  });
});
