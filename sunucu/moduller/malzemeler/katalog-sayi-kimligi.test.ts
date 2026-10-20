import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Db } from '#cekirdek/db.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeAdlari, malzemeKullanilabilirMi, malzemeOzeti } from './disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const SAYI_KIMLIGI_GOCU = '_malzemeler_katalog_sayi_kimligi.sql';

async function kisiAc(db: Db, ad: string): Promise<number> {
  return yoneticiOlustur(db, { ad, kullaniciAdi: ad, parola: 'dogru-parola-1' });
}

// Göçten önceki biçimde de çalışması için `no` sütunu verilmez.
async function kartEkle(db: Db, kisiId: number, kimlik: string, sira: number, durum: string, kayit: unknown): Promise<void> {
  await db.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, $2) ON CONFLICT (onek) DO NOTHING', ['HM-SNO-', 99]);
  await db.sorgu(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'hammadde', 'HM-SNO-', $2, $3, $4, $5, $5)`,
    [kimlik, sira, durum, JSON.stringify(kayit), kisiId],
  );
}

describe('katalog kartı sayı kimliği göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('katnogoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-katno-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göçten önce açılmış kartlar göçle numaralanır; göçten sonra açılan kart sıradaki numarayı alır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const sayi = hepsi.find((ad) => ad.endsWith(SAYI_KIMLIGI_GOCU));
    assert.ok(sayi, 'sayı kimliği göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < sayi)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const eski = await vt.sorgu<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'malzeme_katalog_karti' AND column_name = 'no'",
    );
    assert.deepEqual(eski, [], 'göçten önce sütun yok');
    await vt.tx(async (db) => {
      const kisi = await kisiAc(db, 'goc-kisi');
      for (const [i, k] of ['eski-a', 'eski-b', 'eski-c'].entries()) await kartEkle(db, kisi, k, i + 1, 'aktif', { id: k });
    });

    await copyFile(join(GOC_KLASORU, sayi), join(klasor, sayi));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [sayi]);

    const satirlar = await vt.sorgu<{ kimlik: string; no: number }>('SELECT kimlik, no FROM malzeme_katalog_karti ORDER BY no');
    assert.equal(satirlar.length, 3);
    assert.deepEqual(new Set(satirlar.map((s) => s.kimlik)), new Set(['eski-a', 'eski-b', 'eski-c']));
    assert.equal(new Set(satirlar.map((s) => s.no)).size, 3, 'her eski kart ayrı numara aldı');
    assert.ok(satirlar.every((s) => Number.isInteger(s.no) && s.no > 0));

    await vt.tx(async (db) => {
      const kisi = (await db.tek<{ id: number }>('SELECT id FROM kisi LIMIT 1'))!.id;
      await kartEkle(db, kisi, 'yeni-d', 4, 'taslak', { id: 'yeni-d' });
    });
    const yeni = await vt.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'yeni-d'");
    assert.equal(yeni!.no, Math.max(...satirlar.map((s) => s.no)) + 1);
  });
});

describe('katalog kartı sayı kimliği ve disari.ts (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const noAl = async (kimlik: string): Promise<number> => (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  let sira = 0;
  const ac = async (kimlik: string, durum: string, kayit: unknown): Promise<number> => {
    await vt().tx((db) => kartEkle(db, kisiId, kimlik, ++sira, durum, kayit));
    return noAl(kimlik);
  };

  before(async () => {
    ortam = await testVeritabaniKur('katno');
    kisiId = await vt().tx((db) => kisiAc(db, 'sayi-kisi'));
  });
  after(async () => { await ortam?.kaldir(); });

  test('no tekil ve artar; UPDATE ile verilen değer reddedilir ve numara değişmez', async () => {
    const a = await ac('no-a', 'taslak', { id: 'no-a' });
    const b = await ac('no-b', 'taslak', { id: 'no-b' });
    assert.ok(b > a, 'sonradan açılan kartın numarası büyük');
    await assert.rejects(vt().sorgu('UPDATE malzeme_katalog_karti SET no = $2 WHERE kimlik = $1', ['no-a', 9999]), (e: { code?: string }) => e.code === '428C9');
    await assert.rejects(
      vt().sorgu('INSERT INTO malzeme_katalog_karti (no, kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id) VALUES (5000, $1, $2, $3, 777, $4, $5, $6, $6)',
        ['no-x', 'hammadde', 'HM-SNO-', 'taslak', JSON.stringify({}), kisiId]),
      (e: { code?: string }) => e.code === '428C9',
      'açık değerle ekleme reddedilir',
    );
    for (const sql of ['UPDATE malzeme_katalog_karti SET no = DEFAULT WHERE kimlik = $1']) {
      await assert.rejects(vt().sorgu(sql, ['no-a']), (e: { code?: string; constraint?: string }) => e.code === '23514' && e.constraint === 'malzeme_katalog_karti_no_degismez');
    }
    assert.equal(await noAl('no-a'), a);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET guncelleme = now(), kayit = '{\"id\":\"no-a\",\"x\":1}' WHERE kimlik = $1", ['no-a']);
    assert.equal(await noAl('no-a'), a, 'içerik güncellemesi çalışır, numara aynı');
    const c = await ac('no-c', 'taslak', { id: 'no-c' });
    assert.ok(c > b);
  });

  test('malzemeOzeti: sayı kimliğiyle kartı verir; olmayan numara null', async () => {
    const no = await ac('oz-a', 'aktif', { id: 'oz-a', com: { ad: 'Paslanmaz sac' } });
    await vt().tx(async (db) => {
      assert.deepEqual(await malzemeOzeti(db, no), { id: no, kimlik: 'oz-a', kod: `HM-SNO-${String(sira).padStart(5, '0')}`, tur: 'hammadde', ad: 'Paslanmaz sac', onayDurumu: 'aktif', birim: null, kategori: null, kategoriAdi: null, hizmetYonu: null });
      assert.equal(await malzemeOzeti(db, 999999), null);
    });
  });

  test('malzemeKullanilabilirMi: yalnız aktif kartta true', async () => {
    const nolar: Record<string, number> = {};
    for (const d of ['taslak', 'onayda', 'aktif', 'pasif', 'iptal']) nolar[d] = await ac(`kul-${d}`, d, { id: `kul-${d}` });
    await vt().tx(async (db) => {
      for (const [d, no] of Object.entries(nolar)) assert.equal(await malzemeKullanilabilirMi(db, no), d === 'aktif', d);
      assert.equal(await malzemeKullanilabilirMi(db, 999999), false);
    });
  });

  test('malzemeAdlari: boş dizide sorgu atılmaz, yinelenen tek, olmayan haritada yok, pasif adıyla gelir, adı olmayan kart koduyla gelir', async () => {
    const a = await ac('ad-a', 'aktif', { id: 'ad-a', com: { ad: 'Alüminyum levha' } });
    const p = await ac('ad-p', 'pasif', { id: 'ad-p', com: { ad: 'Eski bakır' } });
    const nesneDegil = await ac('ad-n', 'aktif', { id: 'ad-n', com: 'metin' });
    const adsiz = await ac('ad-s', 'aktif', { id: 'ad-s', com: {} });
    const bosAd = await ac('ad-b', 'aktif', { id: 'ad-b', com: { ad: '   ' } });
    const sayiAd = await ac('ad-y', 'aktif', { id: 'ad-y', com: { ad: 42 } });

    let atilan = 0;
    await vt().tx(async (db) => {
      const sarmal: Db = { ...db, sorgu: (...g: Parameters<Db['sorgu']>) => { atilan++; return db.sorgu(...g); }, tek: (...g: Parameters<Db['tek']>) => { atilan++; return db.tek(...g); } } as Db;
      assert.deepEqual([...(await malzemeAdlari(sarmal, [])).entries()], []);
      assert.equal(atilan, 0, 'boş dizide sorgu atılmadı');

      const harita = await malzemeAdlari(sarmal, [a, a, p, 999999, nesneDegil, adsiz, bosAd, sayiAd]);
      assert.equal(atilan, 1, 'tek sorgu');
      const kod = async (no: number): Promise<string> => (await vt().tek<{ stok_kodu: string }>('SELECT stok_kodu FROM malzeme_katalog_karti WHERE no = $1', [no]))!.stok_kodu;
      const beklenen = new Map<number, string>([[a, 'Alüminyum levha'], [p, 'Eski bakır']]);
      for (const no of [nesneDegil, adsiz, bosAd, sayiAd]) beklenen.set(no, await kod(no));
      assert.deepEqual([...harita.entries()].sort((x, y) => x[0] - y[0]), [...beklenen.entries()].sort((x, y) => x[0] - y[0]));
    });
  });
});
