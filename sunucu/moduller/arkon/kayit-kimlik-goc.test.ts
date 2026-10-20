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

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const KIMLIK_GOCU = '_arkon_kayit_kimlik.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Kimlik göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('arkonkimgoc');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-arkonkimgoc-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(KIMLIK_GOCU)) ?? '';
  assert.ok(goc, 'kimlik göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

async function sutunVarMi(o: Ortam, sutun: string): Promise<boolean> {
  return (await o.ortam.vt.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'arkon_kayit' AND column_name = $1", [sutun]))?.n === 1;
}

const kayitEkle = (o: Ortam, cid: string, makine: string | null, merkez: string | null) => o.ortam.vt.sorgu(
  "INSERT INTO arkon_kayit (tur, cid, zaman, makine, is_merkezi, govde, kisi_id) VALUES ('counts', $1, now(), $2, $3, '{}', $4)", [cid, makine, merkez, o.kisiId]);

describe('arkon kayıt kimliği göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('kodlu satır varsa göç sayıyı yazıp durur; sütun eklenmez, satır değişmez', async () => {
    const x = al();
    await kayitEkle(x, 'g1', 'IST-1', null);
    await kayitEkle(x, 'g2', null, 'MER-1');
    await kayitEkle(x, 'g3', null, null);
    await assert.rejects(gocuDene(x), /kodlu 2 satır var.*kullanıcı onayı gerekir/);
    assert.equal(await sutunVarMi(x, 'istasyon_id'), false);
    assert.equal(await sutunVarMi(x, 'is_merkezi_id'), false);
    assert.equal((await x.ortam.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_kayit'))?.n, 3);
  });

  test('kodlu satır yoksa göç uygulanır: iki boş olabilen sütun gelir, eski satırlar boş kalır', async () => {
    const x = al();
    await kayitEkle(x, 'g3', null, null);
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.equal(await sutunVarMi(x, 'istasyon_id'), true);
    assert.equal(await sutunVarMi(x, 'is_merkezi_id'), true);
    assert.deepEqual(await x.ortam.vt.tek('SELECT istasyon_id, is_merkezi_id FROM arkon_kayit WHERE cid = $1', ['g3']), { istasyon_id: null, is_merkezi_id: null });
  });
});
