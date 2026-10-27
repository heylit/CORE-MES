import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
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
const TASIMA_GOCU = '_arkon_dosya_ortak_depo.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number; baskaId: number }

// Taşıma göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('akdepo');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-akdepo-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(TASIMA_GOCU)) ?? '';
  assert.ok(goc, 'taşıma göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  const baskaId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Başka', kullaniciAdi: 'deneme-baska', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId, baskaId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const ozet = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
// Sentetik içerik: imza türü belirler, gerisi rastgele.
const pdf = (boy: number): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(boy - 9)]);
const step = (): Buffer => Buffer.concat([Buffer.from('ISO-10303-21;\nHEADER;\n'), randomBytes(20000)]);

describe('Arkon dosyalarının ortak depoya taşıma göçü (kart #732, gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });
  const arkonaYaz = (x: Ortam, b: Buffer, kisi: number) =>
    x.ortam.vt.sorgu('INSERT INTO arkon_dosya (ozet, icerik, boyut, yukleyen_id) VALUES ($1, $2, $3, $4)', [ozet(b), b, b.length, kisi]);

  test('içerik 512 KB parçalara bölünür, tür içerikten bulunur (tanınmayan ikili), yükleyen korunur, Arkon deposuna bağlanır; kaynak değişmez', async () => {
    const x = al();
    const buyuk = pdf(1024 * 1024 + 7);
    const model = step();
    const ag = randomBytes(40000);
    for (const b of [buyuk, model, ag]) await arkonaYaz(x, b, x.kisiId);

    await gocuDene(x);

    const satirlar = await x.ortam.vt.sorgu<{ ozet: string; tur: string; boyut: string; ilk: number; bagsiz: Date | null }>(
      'SELECT ozet, tur, boyut::text AS boyut, ilk_yukleyen_id AS ilk, bagsiz_zaman AS bagsiz FROM dosya ORDER BY boyut');
    assert.deepEqual(satirlar.map((s) => [s.ozet, s.tur, Number(s.boyut), s.ilk, s.bagsiz]).sort(), [
      [ozet(buyuk), 'pdf', buyuk.length, x.kisiId, null], [ozet(model), 'step', model.length, x.kisiId, null], [ozet(ag), 'ikili', ag.length, x.kisiId, null],
    ].sort());
    const parcalar = await x.ortam.vt.sorgu<{ sira: number; icerik: Buffer }>('SELECT sira, icerik FROM dosya_icerigi WHERE ozet = $1 ORDER BY sira', [ozet(buyuk)]);
    assert.deepEqual(parcalar.map((p) => p.sira), [0, 1, 2]);
    assert.ok(parcalar.every((p) => p.icerik.length <= 524288));
    assert.ok(Buffer.concat(parcalar.map((p) => p.icerik)).equals(buyuk));
    const baglar = await x.ortam.vt.sorgu<{ ozet: string }>("SELECT ozet FROM dosya_bagi WHERE modul = 'arkon' AND kayit = 'depo' AND ad = ozet");
    assert.equal(baglar.length, 3);
    const yukleyenler = await x.ortam.vt.sorgu<{ n: number }>('SELECT count(*)::int AS n FROM dosya_yukleyeni WHERE kisi_id = $1', [x.kisiId]);
    assert.equal(yukleyenler[0]?.n, 3);
    assert.equal((await x.ortam.vt.sorgu('SELECT 1 FROM arkon_dosya')).length, 3);
  });

  test('ortak depoda zaten olan dosyaya yalnız yükleyen ve bağ eklenir; içerik yinelenmez, bağsız sayımı durur', async () => {
    const x = al();
    const ayni = pdf(3000);
    const o2 = ozet(ayni);
    await x.ortam.vt.sorgu("INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id) VALUES ($1, $2, 'pdf', $3)", [o2, ayni.length, x.baskaId]);
    await x.ortam.vt.sorgu('INSERT INTO dosya_icerigi (ozet, sira, icerik) VALUES ($1, 0, $2)', [o2, ayni]);
    await x.ortam.vt.sorgu('INSERT INTO dosya_yukleyeni (ozet, kisi_id) VALUES ($1, $2)', [o2, x.baskaId]);
    await arkonaYaz(x, ayni, x.kisiId);

    await gocuDene(x);

    const d = await x.ortam.vt.tek<{ ilk: number; bagsiz: Date | null }>('SELECT ilk_yukleyen_id AS ilk, bagsiz_zaman AS bagsiz FROM dosya WHERE ozet = $1', [o2]);
    assert.deepEqual(d, { ilk: x.baskaId, bagsiz: null });
    assert.equal((await x.ortam.vt.sorgu('SELECT 1 FROM dosya_icerigi WHERE ozet = $1', [o2])).length, 1);
    assert.deepEqual((await x.ortam.vt.sorgu<{ kisi_id: number }>('SELECT kisi_id FROM dosya_yukleyeni WHERE ozet = $1 ORDER BY kisi_id', [o2])).map((s) => s.kisi_id).sort(),
      [x.kisiId, x.baskaId].sort());
    assert.equal((await x.ortam.vt.sorgu("SELECT 1 FROM dosya_bagi WHERE ozet = $1 AND modul = 'arkon' AND kayit = 'depo'", [o2])).length, 1);
  });

  test('boş dosya varsa göç durur ve hiçbir şey taşınmaz', async () => {
    const x = al();
    await arkonaYaz(x, pdf(2000), x.kisiId);
    await x.ortam.vt.sorgu("INSERT INTO arkon_dosya (ozet, icerik, boyut, yukleyen_id) VALUES ($1, ''::bytea, 0, $2)", ['0'.repeat(64), x.kisiId]);
    await assert.rejects(gocuDene(x), /boş dosya/);
    assert.equal((await x.ortam.vt.sorgu('SELECT 1 FROM dosya')).length, 0);
  });
});
