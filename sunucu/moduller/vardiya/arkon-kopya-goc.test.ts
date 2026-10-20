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
const KOPYA_GOCU = '_vardiya_arkon_kopyasi.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Kopya göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('vardiyakopya');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-vardiyakopya-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(KOPYA_GOCU)) ?? '';
  assert.ok(goc, 'kopya göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const arkonVardiyasi = (o: Ortam, v: unknown) => o.ortam.vt.sorgu(
  "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('kv', 'shifts', $1, 1, $2)", [JSON.stringify({ v }), o.kisiId]);

const vardiyalar = (o: Ortam) => o.ortam.vt.sorgu<{ ad: string; baslangic: string; bitis: string; molalar: string[] }>(
  `SELECT v.ad, to_char(v.baslangic, 'HH24:MI') AS baslangic, to_char(v.bitis, 'HH24:MI') AS bitis,
          coalesce(array_agg(to_char(m.baslangic, 'HH24:MI') || '-' || to_char(m.bitis, 'HH24:MI') ORDER BY m.baslangic) FILTER (WHERE m.id IS NOT NULL), '{}') AS molalar
   FROM vardiya v LEFT JOIN vardiya_molasi m ON m.vardiya_id = v.id GROUP BY v.id ORDER BY v.ad`);

describe('Arkon vardiyalarının Vardiya modülüne kopya göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('geçerli Arkon vardiyaları molalarıyla kopyalanır; aynı adlı vardiya korunur; bozuk satır ve mola atlanır; Arkon belgesi değişmez', async () => {
    const x = al();
    await x.ortam.vt.sorgu("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Sabah', '07:00', '15:00')");
    const arkon = [
      { name: 'Sabah', start: '08:00', end: '16:00', breaks: [] },
      { name: ' Gece ', start: '22:00', end: '06:00', breaks: [{ at: '23:50', min: 30 }, { at: '03:00', min: 'x' }, { at: '25:00', min: 10 }] },
      { name: 'Gece', start: '23:00', end: '07:00', breaks: [] },
      { name: '', start: '08:00', end: '16:00' },
      { name: 'Saatsiz', start: '8', end: '16:00' },
      { name: 'Eşit', start: '08:00', end: '08:00' },
      'metin',
    ];
    await arkonVardiyasi(x, arkon);
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await vardiyalar(x), [
      { ad: 'Gece', baslangic: '22:00', bitis: '06:00', molalar: ['23:50-00:20'] },
      { ad: 'Sabah', baslangic: '07:00', bitis: '15:00', molalar: [] },
    ]);
    const belge = await x.ortam.vt.tek<{ govde: unknown }>("SELECT govde FROM arkon_belge WHERE depo = 'kv' AND kimlik = 'shifts'");
    assert.deepEqual(belge?.govde, { v: arkon });
  });

  test('Arkon vardiya belgesi yoksa ya da dizi değilse göç bir şey eklemez', async () => {
    const x = al();
    await arkonVardiyasi(x, { name: 'Dizi değil' });
    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await vardiyalar(x), []);
  });
});
