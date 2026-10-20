import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const NUMARA_GOCU = '_satin_alma_numara_kurallari.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('sanumara');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-sanumara-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(NUMARA_GOCU)) ?? '';
  assert.ok(goc, 'numara kuralları göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}

describe('satın alma numaralarını ayara bağlayan göç (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('var olan talep numarası satırda kalır; numarasız eski yazım eski biçimi alır; yeni talep numarasız ya da Logo fişine sığmayan numarayla açılmaz; sipariş ve katalog numarası kalıptan bağımsızdır', async () => {
    const x = al();
    const eski = randomUUID();
    const kisi = await x.ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
      await db.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id) VALUES ($1, 2026, 7, 'Deneme talep', $2, $2)", [eski, k]);
      return k;
    });
    await copyFile(join(GOC_KLASORU, x.goc), join(x.klasor, x.goc));
    assert.deepEqual(await gocleriUygula(x.ortam.ayar, x.klasor, { sema: x.ortam.sema }), [x.goc]);
    assert.equal((await x.ortam.vt.tek<{ no: string }>('SELECT no FROM satin_alma_talep WHERE id = $1', [eski]))?.no, 'ST-2026-007');
    const talep = (no: string | null) => x.ortam.vt.tx((db) => db.sorgu(
      "INSERT INTO satin_alma_talep (id, no, baslik, talep_eden_kisi_id, acan_kisi_id) VALUES ($1, $2, 'Deneme talep', $3, $3)", [randomUUID(), no, kisi]));
    await assert.rejects(talep(null), /not-null|null value/);
    await assert.rejects(talep('DT-00000000000001'), /satin_alma_talep_no_bicim/);
    await assert.rejects(talep('ST-2026-007'), /satin_alma_talep_no_tek/);
    await talep('DT-001');
    // Numarasız eski yazım (yıl ve sıra) eski biçimi alır.
    const eskiYazim = randomUUID();
    await x.ortam.vt.tx((db) => db.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id) VALUES ($1, 2099, 8, 'Deneme talep', $2, $2)", [eskiYazim, kisi]));
    assert.equal((await x.ortam.vt.tek<{ no: string }>('SELECT no FROM satin_alma_talep WHERE id = $1', [eskiYazim]))?.no, 'ST-2099-008');
    const kisit = async (tablo: string, ad: string) => (await x.ortam.vt.tek<{ tanim: string }>(
      'SELECT pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2', [tablo, ad]))?.tanim ?? '';
    assert.match(await kisit('satin_alma_siparis', 'satin_alma_siparis_no_bicim'), /length\(no\) <= 16/);
    assert.match(await kisit('satin_alma_katalog', 'satin_alma_katalog_kod'), /length\(kod\) <= 40/);
  });
});
