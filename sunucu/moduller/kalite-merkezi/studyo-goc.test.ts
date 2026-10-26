import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));
const YENI_TABLOLAR = [
  'kalite_merkezi_balon', 'kalite_merkezi_numune', 'kalite_merkezi_numune_karari', 'kalite_merkezi_numune_plani', 'kalite_merkezi_olcum', 'kalite_merkezi_resim',
];

// 595 3 c: stüdyo göçü yalnız boş yeni tablo açar; Kalite Merkezi'nin dolu tablolarına dokunmaz (taşıma ayrı göç ve ayrı onaydır).
describe('Kalite Merkezi stüdyo göçü boş ve dolu veritabanında (gerçek PostgreSQL)', () => {
  const ortamlar: TestVeritabani[] = [];
  let klasor = '';

  before(async () => { klasor = await mkdtemp(join(tmpdir(), 'tmiv2-kmsg-')); });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    for (const o of ortamlar) await o.kaldir();
  });

  async function ac(onek: string): Promise<TestVeritabani> {
    const o = await testSemasiAc(onek);
    ortamlar.push(o);
    return o;
  }
  const satirSayilari = async (o: TestVeritabani): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(
    YENI_TABLOLAR.map(async (t) => [t, (await o.vt.tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`))!.n] as const),
  ));
  const bos = Object.fromEntries(YENI_TABLOLAR.map((t) => [t, 0]));

  test('KM-S01 boş veritabanında bütün göçler uygulanır; yeni tablolar boş açılır', async () => {
    const o = await ac('kmsgb');
    await gocleriUygula(o.ayar, GERCEK_KLASOR, { sema: o.sema });
    assert.deepEqual(await satirSayilari(o), bos);
  });

  test('KM-S02 dolu veritabanında Kalite Merkezi kayıtları değişmez; yeni tablolar boş açılır', async () => {
    const o = await ac('kmsgd');
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_kalite_merkezi_studyo.sql'));
    assert.equal(sira > 0, true, 'stüdyo göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    await gocleriUygula(o.ayar, klasor, { sema: o.sema });

    const kisi = (await o.vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Göç Denemesi') RETURNING id"))!.id;
    for (const [koleksiyon, kimlik, govde] of [
      ['parca', 'p-1', { parcaNo: 'DNM-1', sinif: 'Kritik' }],
      ['cizim', 'c-1', { ad: 'resim.pdf', balonlar: [{ no: 1, nominal: '10' }] }],
      ['insp', 'i-1', { no: 'MU-1', sonuc: 'Kabul' }],
    ] as const) {
      await o.vt.sorgu(
        'INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES ($1, $2, $3::jsonb, $4)', [koleksiyon, kimlik, JSON.stringify(govde), kisi],
      );
    }
    const oku = () => o.vt.sorgu('SELECT koleksiyon, kimlik, govde, surum::text AS surum FROM kalite_merkezi_belge ORDER BY koleksiyon, kimlik');
    const once = await oku();

    assert.deepEqual(await gocleriUygula(o.ayar, GERCEK_KLASOR, { sema: o.sema }), hepsi.slice(sira));
    assert.deepEqual(await oku(), once);
    assert.deepEqual(await satirSayilari(o), bos);
  });
});
