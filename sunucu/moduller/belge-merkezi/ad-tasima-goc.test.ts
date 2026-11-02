import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const AD_GOCU = '_belge_merkezi_tasima.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Ad göçünden önceki şema kurulur ve doldurulur; göç dolu tabloda denenir.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('bmadi');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-bmadi-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(AD_GOCU)) ?? '';
  assert.ok(goc, 'ad göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuUygula(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const pdf = (dolgu: string): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, dolgu)]);
const ozet = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('Çizim Merkezi tablolarının belge merkezine ad göçü (gerçek PostgreSQL, dolu tablo)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('satırlar ve kimlikler aynı kalır; işlem adları, dosya bağı ve nesne adları yenilenir; revizyon değişmezliği sürer', async () => {
    const x = al();
    const vt = x.ortam.vt;
    const a = pdf('a');
    const b = pdf('b');
    for (const d of [a, b]) {
      await vt.sorgu("INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, $2, 'pdf', $3)", [ozet(d), d.length, x.kisiId]);
    }
    const belge = await vt.tek<{ id: number }>(
      "INSERT INTO cizimler_belge (ad, tur, olusturan_id) VALUES ('Flanş', 'teknik-resim', $1) RETURNING id", [x.kisiId]);
    assert.ok(belge);
    const yayinda = await vt.tek<{ id: number }>(
      `INSERT INTO cizimler_revizyon (belge_id, sira, ozet, dosya_turu, durum, yukleyen_id, yayinlayan_id, yayinlandi)
       VALUES ($1, 1, $2, 'pdf', 'yayinda', $3, $3, now()) RETURNING id`, [belge.id, ozet(a), x.kisiId]);
    const taslak = await vt.tek<{ id: number }>(
      "INSERT INTO cizimler_revizyon (belge_id, sira, ozet, dosya_turu, yukleyen_id) VALUES ($1, 2, $2, 'pdf', $3) RETURNING id",
      [belge.id, ozet(b), x.kisiId]);
    await vt.sorgu("INSERT INTO cizimler_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, 'malzemeler', 7, $2)", [belge.id, x.kisiId]);
    await vt.sorgu("INSERT INTO dosya_bagi (ozet, modul, kayit, ad, ekleyen_id) VALUES ($1, 'cizimler', $2, 'flans.pdf', $3)",
      [ozet(a), String(belge.id), x.kisiId]);
    const rolIslemi = async (islem: string): Promise<number> =>
      (await vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM rol_islemi WHERE islem = $1', [islem]))?.n ?? -1;
    const onceYayinla = await rolIslemi('cizimler.yayinla');
    assert.ok(onceYayinla > 0, 'yerleşik rollerde yayınlama işlemi olmalı');
    const onceSayfa = await rolIslemi('sayfa.cizimler');

    assert.deepEqual(await gocuUygula(x), [x.goc]);

    const satir = await vt.tek<{ id: number; ad: string }>('SELECT id, ad FROM belge_merkezi_belge WHERE id = $1', [belge.id]);
    assert.deepEqual(satir, { id: belge.id, ad: 'Flanş' });
    const revizyonlar = await vt.sorgu<{ id: number; durum: string }>('SELECT id, durum FROM belge_merkezi_revizyon ORDER BY id');
    assert.deepEqual(revizyonlar, [{ id: yayinda?.id, durum: 'yayinda' }, { id: taslak?.id, durum: 'taslak' }]);
    assert.equal((await vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM belge_merkezi_bag WHERE belge_id = $1', [belge.id]))?.n, 1);
    assert.equal(await rolIslemi('cizimler.yayinla'), 0);
    assert.equal(await rolIslemi('belge-merkezi.yayinla'), onceYayinla);
    assert.equal(await rolIslemi('sayfa.cizimler'), onceSayfa, 'sayfa işlemi bu göçte değişmez');
    assert.equal((await vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM dosya_bagi WHERE modul = 'belge-merkezi' AND kayit = $1", [String(belge.id)]))?.n, 1);
    assert.equal((await vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM dosya_bagi WHERE modul = 'cizimler'"))?.n, 0);
    const kalan = await vt.tek<{ n: number }>(
      `SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname LIKE 'cizimler\\_%')
            + (SELECT count(*) FROM pg_constraint WHERE conname LIKE 'cizimler\\_%' AND connamespace = current_schema()::regnamespace)
            + (SELECT count(*) FROM pg_proc WHERE proname LIKE 'cizimler\\_%' AND pronamespace = current_schema()::regnamespace) AS n`);
    assert.equal(Number(kalan?.n), 0, 'cizimler_ adlı nesne kalmamalı');

    // Yeni kimlik eski dizinin devamıdır.
    const yeni = await vt.tek<{ id: number }>(
      "INSERT INTO belge_merkezi_belge (ad, tur, olusturan_id) VALUES ('Kapak', 'teknik-resim', $1) RETURNING id", [x.kisiId]);
    assert.ok((yeni?.id ?? 0) > belge.id);

    await assert.rejects(vt.sorgu('DELETE FROM belge_merkezi_revizyon WHERE id = $1', [yayinda?.id]),
      (h: { constraint?: string }) => h.constraint === 'belge_merkezi_revizyon_silinmez');
    await assert.rejects(vt.sorgu("UPDATE belge_merkezi_revizyon SET durum = 'taslak' WHERE id = $1", [yayinda?.id]),
      (h: { constraint?: string }) => h.constraint === 'belge_merkezi_revizyon_durum_sirasi');
  });

  test('değişiklik yönetimi olay günlüğü yeni modül adını kabul eder, eskisini reddeder', async () => {
    const x = al();
    await gocuUygula(x);
    await x.ortam.vt.sorgu("INSERT INTO degisiklik_yonetimi_olay (tur, ilgili, kayit_no) VALUES ('revizyon_yayinlandi', 'belge-merkezi', 'DE-1')");
    await assert.rejects(
      x.ortam.vt.sorgu("INSERT INTO degisiklik_yonetimi_olay (tur, ilgili, kayit_no) VALUES ('revizyon_yayinlandi', 'cizimler', 'DE-2')"),
      (h: { constraint?: string }) => h.constraint === 'degisiklik_yonetimi_olay_ilgili_degeri');
  });
});
