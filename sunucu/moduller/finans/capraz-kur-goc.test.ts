import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// Firma ve tutarlar uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const KUR_GOCU = '_finans_capraz_kur.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Göçten önceki şema kurulur; çapraz kur göçü henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('fnkurgoc');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-fnkurgoc-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(KUR_GOCU)) ?? '';
  assert.ok(goc, 'çapraz kur göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}
async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}
async function sutunVarMi(o: Ortam, tablo: string, sutun: string): Promise<boolean> {
  return (await o.ortam.vt.tek<{ n: number }>(
    'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [tablo, sutun]))?.n === 1;
}
async function islevVarMi(o: Ortam, ad: string): Promise<boolean> {
  return ((await o.ortam.vt.tek<{ n: number }>(
    'SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = current_schema() AND p.proname = $1', [ad]))?.n ?? 0) > 0;
}
// Aynı firmanın euro satış ve TL alış belgesi arasında tek mahsup.
async function mahsupKur(o: Ortam): Promise<void> {
  await o.ortam.vt.tx(async (db) => {
    const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
    const f = await db.tek<{ id: number }>("INSERT INTO finans_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'ikisi', $1) RETURNING id", [kisi]);
    const belge = (yon: string, kategori: string, pb: string, kur: number, tutar: number) => db.tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, olusturan_id)
       VALUES ($1, 'fatura', $2, $3, '2026-10-01', '2026-10-31', $4, $5, $6, 0, $7) RETURNING id`, [yon, kategori, f?.id, pb, kur, tutar, kisi]);
    const s = await belge('gelir', 'urun_satisi', 'EUR', 35, 100);
    const a = await belge('gider', 'mal_alimi', 'TRY', 1, 3500);
    await db.sorgu(
      "INSERT INTO finans_mahsup (firma_id, satis_belge_id, alis_belge_id, satis_tutari, alis_tutari, tarih, olusturan_id) VALUES ($1, $2, $3, 10, 350, '2026-10-02', $4)",
      [f?.id, s?.id, a?.id, kisi]);
  });
}

describe('finans çapraz kur göçü (FK3, gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('mahsup tablosu doluysa göç sayıyı yazıp durur; hiçbir şey değişmez', async () => {
    const x = al();
    await mahsupKur(x);
    await assert.rejects(gocuDene(x), /finans_mahsup: 1 kayıt var/);
    assert.equal(await sutunVarMi(x, 'finans_mahsup', 'capraz_kur'), false);
    assert.equal(await sutunVarMi(x, 'finans_ayar', 'capraz_kur_payi'), false);
    assert.equal(await islevVarMi(x, 'finans_referans_kur'), false);
  });

  test('mahsup tablosu boşsa göç uygulanır: kur sütunu, ayardaki pay (varsayılan 20) ve referans işlevi gelir', async () => {
    const x = al();
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.equal(await sutunVarMi(x, 'finans_mahsup', 'capraz_kur'), true);
    assert.equal((await x.ortam.vt.tek<{ p: string }>('SELECT capraz_kur_payi::text AS p FROM finans_ayar WHERE id = 1'))?.p, '20.00');
    assert.equal(await islevVarMi(x, 'finans_referans_kur'), true);
  });
});
