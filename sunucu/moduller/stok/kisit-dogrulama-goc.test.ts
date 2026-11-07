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

// Emre bağlı hareket kuralı doğrulanır (2204-1 a): temiz veride doğrulanır; kurala uymayan eski hareket varsa göç durmaz,
// defter değişmez, kısıt NOT VALID kalır. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261106100000_stok_kisit_dogrulama.sql';
const KISIT = 'stok_hareketi_emir_kurali';

describe('stok_hareketi emir kuralı doğrulanır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('stkisit');
    klasor = await mkdtemp(join(tmpdir(), 'kisit-dogrula-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('temiz veride kısıt doğrulanır; kurala uymayan eski harekette göç durmaz, defter değişmez, kısıt yeni yazmayı denetlemeyi sürdürür', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    assert.ok(hepsi.includes(GOC), 'göç bulunamadı');
    for (const ad of hepsi.filter((a) => a < GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const dogrulandi = async (): Promise<boolean> => (await sahip.tek<{ v: boolean }>(
      "SELECT convalidated AS v FROM pg_constraint WHERE conrelid = 'stok_hareketi'::regclass AND conname = $1", [KISIT]))!.v;
    assert.equal(await dogrulandi(), false, 'göçten önce kısıt doğrulanmamış olmalı');

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'stkisit', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KD-', 0)");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kd-1', 'sarf', 'KD-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kd-1', com: { ad: 'Deneme sarf' } }), kisi]))!.no;
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('KD', 'Deneme depo') RETURNING id"))!.id;
    const konum = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'KD-01', 'depo_zemini', 'Deneme zemin') RETURNING id", [depo]))!.id;
    const im = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('KDM', 'Deneme merkezi') RETURNING id"))!.id;
    const ist = (await sahip.tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('KDI', 'Deneme istasyon', $1, true) RETURNING id", [im]))!.id;
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('KD-P1', 'Deneme', 10, $1, $2) RETURNING id", [ist, kisi]))!.id;
    // Hareket fişiyle, doğrudan tablo sahibiyle yazılır: konu yalnız kısıttır.
    const giris = async (kaynak: 'uretim' | 'mal_kabul'): Promise<number> => (await sahip.tek<{ id: number }>(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $5) RETURNING id),
         h AS (INSERT INTO stok_hareketi (tur, malzeme_id, hedef_konum_id, miktar, giris_kaynagi, uretim_emri_id, kisi_id)
               VALUES ('giris', $1, $2, 1, $3, $4, $5) RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f RETURNING hareket_id::int AS id`,
      [kart, konum, kaynak, emir, kisi]))!.id;
    await giris('uretim');

    await copyFile(join(GOC_KLASORU, GOC), join(klasor, GOC));
    await gocleriUygula(ayar, klasor, { sema });
    assert.equal(await dogrulandi(), true, 'temiz veride kısıt doğrulanır');

    // Eski satır benzetimi: kısıt kaldırılıp emre bağlı mal kabul girişi yazılır, kısıt aynı tanımla NOT VALID geri gelir;
    // göç kaydı silinip göç yeniden uygulanır (klasörde ondan sonraki göç yok).
    const tanim = (await sahip.tek<{ t: string }>(
      "SELECT pg_get_constraintdef(oid) AS t FROM pg_constraint WHERE conrelid = 'stok_hareketi'::regclass AND conname = $1", [KISIT]))!.t;
    await sahip.sorgu(`ALTER TABLE stok_hareketi DROP CONSTRAINT ${KISIT}`);
    const eski = await giris('mal_kabul');
    await sahip.sorgu(`ALTER TABLE stok_hareketi ADD CONSTRAINT ${KISIT} ${tanim.replace(/\s+NOT VALID$/, '')} NOT VALID`);
    const once = await sahip.sorgu('SELECT * FROM stok_hareketi ORDER BY id');
    await sahip.sorgu('DELETE FROM goc_kaydi WHERE ad = $1', [GOC]);
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [GOC]);
    assert.equal(await dogrulandi(), false, 'kurala uymayan eski satır varken kısıt NOT VALID kalır');
    assert.deepEqual(await sahip.sorgu('SELECT * FROM stok_hareketi ORDER BY id'), once, 'defter değişmez');
    assert.ok(once.some((s) => Number((s as { id: unknown }).id) === eski));
    await assert.rejects(giris('mal_kabul'), new RegExp(KISIT), 'yeni yazmada kural denetlenir');
  });
});
