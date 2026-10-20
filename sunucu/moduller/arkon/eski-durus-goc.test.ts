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
const SILME_GOCU = '_arkon_eski_durus_belgeleri.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Silme göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('arkoneskidurus');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-arkoneskidurus-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(SILME_GOCU)) ?? '';
  assert.ok(goc, 'silme göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const belgeEkle = (o: Ortam, depo: string, kimlik: string) => o.ortam.vt.sorgu(
  'INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ($1, $2, $3, 1, $4)', [depo, kimlik, JSON.stringify({ id: kimlik }), o.kisiId]);

const belgeler = (o: Ortam) => o.ortam.vt.sorgu<{ depo: string; kimlik: string }>('SELECT depo, kimlik FROM arkon_belge ORDER BY depo, kimlik');

describe('Arkon eski planlı duruş belgelerini silen göç (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('yalnız downs belgeleri silinir; öteki depolar değişmez', async () => {
    const x = al();
    await belgeEkle(x, 'downs', 'eski-1');
    await belgeEkle(x, 'downs', 'tmi-pd-7');
    await belgeEkle(x, 'maint', 'bakim-1');
    await belgeEkle(x, 'kv', 'shifts');
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await belgeler(x), [{ depo: 'kv', kimlik: 'shifts' }, { depo: 'maint', kimlik: 'bakim-1' }]);
  });

  test('downs belgesi yoksa göç bir şey değiştirmez', async () => {
    const x = al();
    await belgeEkle(x, 'pkgs', 'paket-1');
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await belgeler(x), [{ depo: 'pkgs', kimlik: 'paket-1' }]);
  });
});
