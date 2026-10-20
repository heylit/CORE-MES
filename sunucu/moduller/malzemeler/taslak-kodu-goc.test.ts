import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Db } from '#cekirdek/db.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TASLAK_KODU_GOCU = '_malzemeler_taslak_kodu.sql';

async function kartEkle(db: Db, kisiId: number, kimlik: string, sira: number, durum: string, kayit: unknown, onaylama = false): Promise<void> {
  await db.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, $2) ON CONFLICT (onek) DO NOTHING', ['HM-TKG-', 99]);
  await db.sorgu(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, onaylama)
     VALUES ($1, 'hammadde', 'HM-TKG-', $2, $3, $4, $5, $5, CASE WHEN $6::boolean THEN now() END)`,
    [kimlik, sira, durum, JSON.stringify(kayit), kisiId, onaylama],
  );
}

describe('taslak kodu göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('taslakkodugoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-taslakkodu-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göçten önceki kartlarda "aktif olmuş" işareti durumdan ve sunucunun bastığı onay damgasından türetilir', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(TASLAK_KODU_GOCU));
    assert.ok(goc, 'taslak kodu göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });
    await vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'tkg-kisi', kullaniciAdi: 'tkg-kisi', parola: 'dogru-parola-1' });
      await kartEkle(db, kisi, 'g-aktif', 1, 'aktif', { id: 'g-aktif' });
      await kartEkle(db, kisi, 'g-pasif', 2, 'pasif', { id: 'g-pasif' });
      await kartEkle(db, kisi, 'g-damgali', 3, 'taslak', { id: 'g-damgali', onay: { durum: 'taslak', onay: { by: 1, t: 1 } } });
      await kartEkle(db, kisi, 'g-onayda', 4, 'onayda', { id: 'g-onayda', onay: { durum: 'onayda' } });
      await kartEkle(db, kisi, 'g-saf', 5, 'taslak', { id: 'g-saf' });
      await kartEkle(db, kisi, 'g-onaylama', 6, 'taslak', { id: 'g-onaylama' }, true);
      await kartEkle(db, kisi, 'g-pasifdamga', 7, 'taslak', { id: 'g-pasifdamga', onay: { durum: 'taslak', pasif: { by: 1, t: 1 } } });
    });

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const satirlar = await vt.sorgu<{ kimlik: string; aktif_oldu: boolean }>('SELECT kimlik, aktif_oldu FROM malzeme_katalog_karti ORDER BY sira_no');
    assert.deepEqual(satirlar.map((s) => [s.kimlik, s.aktif_oldu]), [
      ['g-aktif', true], ['g-pasif', true], ['g-damgali', true], ['g-onayda', false], ['g-saf', false], ['g-onaylama', true], ['g-pasifdamga', true],
    ]);
  });
});
