import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '../../cekirdek/goc.ts';
import { izinYok, testSemasiAc } from '../../cekirdek/test-vt.ts';
import type { TestVeritabani } from '../../cekirdek/test-vt.ts';
import type { KayitSutunlari } from './kurallar.ts';
import { kayitEkle, yansimaYaz } from './sorgular.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const BOLUM_GOCU = '20261108063300_arkon_kayit_aylik_bolum.sql';
const KIMLIKSIZ = { istasyonId: null, isMerkeziId: null };
const kod = (beklenen: string) => (hata: unknown): boolean => (hata as { code?: unknown }).code === beklenen;

const sutunlar = (cid: string, zaman: Date): KayitSutunlari =>
  ({ cid, zaman, makine: 'T-01', isMerkezi: 'TAL', emirNo: 'UE-1', paketId: null, maddeId: null });

// Göç dolu tabloda denenir: bölüm göçünden önceki göçler uygulanır, kayıt ve yansıma yazılır, sonra kalan göçler uygulanır.
describe('arkon aylık bölüm göçü (1765): dolu arkon_kayit bölümlenir, yinelenen gönderim yine elenir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor: string | undefined;
  let kisiId = 0;
  let once: { kayit: unknown[]; yansima: unknown[] } | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const KAYIT_SQL = 'SELECT id::int, tur, cid, zaman, makine, emir_no, govde, kisi_id, varis FROM arkon_kayit ORDER BY id';
  const YANSIMA_SQL = 'SELECT id::int, kayit_id::int, emir_id, kisi_id, sonuc, neden FROM arkon_tmi_yansima ORDER BY id';

  before(async () => {
    ortam = await testSemasiAc('arkon_bolum');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-arkon-bolum-'));
    const adlar = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    for (const ad of adlar.filter((a) => a < BOLUM_GOCU)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });

    const { vt } = ortam;
    kisiId = (await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Bolum Arkon') RETURNING id"))?.id ?? 0;
    // Göç öncesi yazım eski biçimle: (tur, cid) tekil kısıtı ve tek sütunlu yansıma bağı.
    await vt.sorgu(`INSERT INTO arkon_kayit (tur, cid, zaman, makine, emir_no, govde, kisi_id)
      SELECT 'counts', 'eski-' || n, t, 'T-01', 'UE-1', jsonb_build_object('delta', n), $1
        FROM unnest(ARRAY['2026-08-31T23:30:00Z', '2026-09-01T00:00:00Z', '2026-10-15T12:00:00Z']::timestamptz[]) WITH ORDINALITY u(t, n)`, [kisiId]);
    await vt.sorgu(`INSERT INTO arkon_tmi_yansima (kayit_id, emir_id, kisi_id, sonuc, neden)
      SELECT id, 7, kisi_id, 'bekliyor', NULL FROM arkon_kayit WHERE cid = 'eski-1'`);
    await vt.sorgu(`INSERT INTO arkon_tmi_yansima (kayit_id, emir_id, kisi_id, sonuc, neden)
      SELECT id, NULL, kisi_id, 'eslenemedi', 'emir yok' FROM arkon_kayit WHERE cid = 'eski-3'`);
    once = { kayit: await vt.sorgu(KAYIT_SQL), yansima: await vt.sorgu(YANSIMA_SQL) };

    for (const ad of adlar.filter((a) => a >= BOLUM_GOCU)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  });

  after(async () => {
    await ortam?.kaldir();
    if (klasor) await rm(klasor, { recursive: true, force: true });
  });

  test('kayıt ve yansıma satırları olduğu gibi kalır; kayıt ayına göre bölüme düşer, yansıma kaydın zamanını taşır', async () => {
    const { vt, sahip } = acik();
    assert.equal(once?.kayit.length, 3);
    assert.equal(once?.yansima.length, 2);
    assert.deepEqual(await vt.sorgu(KAYIT_SQL), once?.kayit);
    assert.deepEqual(await vt.sorgu(YANSIMA_SQL), once?.yansima);
    assert.deepEqual(
      await sahip.sorgu('SELECT cid, tableoid::regclass::text AS bolum FROM arkon_kayit ORDER BY cid'),
      [
        { cid: 'eski-1', bolum: 'arkon_kayit_y2026m08' },
        { cid: 'eski-2', bolum: 'arkon_kayit_y2026m09' },
        { cid: 'eski-3', bolum: 'arkon_kayit_y2026m10' },
      ],
    );
    assert.deepEqual(
      await vt.sorgu('SELECT count(*)::int AS sayi FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id AND k.zaman = y.kayit_zaman'),
      [{ sayi: 2 }],
    );
    assert.deepEqual(await vt.sorgu('SELECT tur, cid FROM arkon_kayit_cid ORDER BY cid'),
      [{ tur: 'counts', cid: 'eski-1' }, { tur: 'counts', cid: 'eski-2' }, { tur: 'counts', cid: 'eski-3' }]);
  });

  test('aynı kayıt başka zamanla yeniden gelse de bir kez yazılır; göç öncesi cid de elenir; başka tür aynı cid ile yazılır', async () => {
    const { vt } = acik();
    const simdi = new Date();
    const ilk = await kayitEkle(vt, 'counts', sutunlar('yeni-1', simdi), { delta: 1 }, kisiId, KIMLIKSIZ);
    assert.equal(typeof ilk, 'number');
    // Tabletin eski kaydı pencere dışındaysa her gönderimde sunucu saati yazılır: ikinci gönderim başka zamanla gelir.
    assert.equal(await kayitEkle(vt, 'counts', sutunlar('yeni-1', new Date(simdi.getTime() + 60_000)), { delta: 1 }, kisiId, KIMLIKSIZ), null);
    assert.equal(await kayitEkle(vt, 'counts', sutunlar('eski-2', simdi), { delta: 9 }, kisiId, KIMLIKSIZ), null);
    assert.equal(typeof await kayitEkle(vt, 'events', sutunlar('yeni-1', simdi), { state: 'run' }, kisiId, KIMLIKSIZ), 'number');
    assert.deepEqual(
      await vt.sorgu("SELECT tur, count(*)::int AS sayi FROM arkon_kayit WHERE cid IN ('yeni-1', 'eski-2') GROUP BY tur ORDER BY tur"),
      [{ tur: 'counts', sayi: 2 }, { tur: 'events', sayi: 1 }],
    );
  });

  test('eşzamanlı aynı gönderimden yalnız biri yazılır', async () => {
    const { vt } = acik();
    const sonuclar = await Promise.all([0, 1, 2, 3].map((n) =>
      vt.tx((db) => kayitEkle(db, 'counts', sutunlar('ayni-anda', new Date(Date.now() + n)), { delta: 1 }, kisiId, KIMLIKSIZ))));
    assert.equal(sonuclar.filter((s) => s !== null).length, 1);
    assert.deepEqual(await vt.sorgu("SELECT count(*)::int AS sayi FROM arkon_kayit WHERE cid = 'ayni-anda'"), [{ sayi: 1 }]);
  });

  test('yansıma kaydın zamanıyla yazılır; olmayan kayda yansıma yazılamaz', async () => {
    const { vt } = acik();
    const id = await kayitEkle(vt, 'counts', sutunlar('yansiyan', new Date()), { delta: 2 }, kisiId, KIMLIKSIZ);
    assert.notEqual(id, null);
    await yansimaYaz(vt, id ?? 0, 7, kisiId, 'bekliyor', null);
    assert.deepEqual(
      await vt.sorgu('SELECT (y.kayit_zaman = k.zaman) AS ayni FROM arkon_tmi_yansima y JOIN arkon_kayit k ON k.id = y.kayit_id WHERE y.kayit_id = $1', [id]),
      [{ ayni: true }],
    );
    await assert.rejects(yansimaYaz(vt, -1, 7, kisiId, 'bekliyor', null), kod('23502'));
    await assert.rejects(
      vt.sorgu(`INSERT INTO arkon_tmi_yansima (kayit_id, kayit_zaman, emir_id, kisi_id, sonuc)
        SELECT id, zaman - interval '1 second', 7, $1, 'bekliyor' FROM arkon_kayit WHERE cid = 'eski-2'`, [kisiId]),
      /arkon_tmi_yansima_kayit_baglantisi/,
    );
  });

  test('yalnız ekleme sürer: kayıt ve koruma tablosu güncellenemez, silinemez; bağlı kaydın bölümü ayrılamaz', async () => {
    const { vt, sahip } = acik();
    await assert.rejects(vt.sorgu("UPDATE arkon_kayit SET emir_no = 'X'"), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM arkon_kayit'), /yalnız ekleme/);
    await assert.rejects(vt.sorgu("UPDATE arkon_kayit_cid SET cid = 'x'"), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM arkon_kayit_cid'), /yalnız ekleme/);
    await assert.rejects(sahip.sorgu('TRUNCATE arkon_kayit_cid'), /yalnız ekleme/);
    // Bölümü boşaltmayı önce yansıma bağı reddeder (0A000), bağsız bölümde yalnız-ekleme tetiği; iletiler sunucu diline bağlıdır.
    await assert.rejects(sahip.sorgu('TRUNCATE arkon_kayit_y2026m09'), kod('0A000'));
    await assert.rejects(vt.sorgu('ALTER TABLE arkon_kayit DETACH PARTITION arkon_kayit_y2026m08'), izinYok);
    // Yansıması olan kaydın ayı ayrılamaz: bağ bölüm başına PostgreSQL'in verdiği adla reddeder (23503).
    await assert.rejects(sahip.sorgu('ALTER TABLE arkon_kayit DETACH PARTITION arkon_kayit_y2026m08'), kod('23503'));
  });
});
