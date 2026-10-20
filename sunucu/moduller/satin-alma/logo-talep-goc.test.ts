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
const LOGO_GOCU = '_satin_alma_logo_talep.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Talep fişi göçünden önceki bütün göçler kurulur; göç var olan taleplerin üstüne uygulanır.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('salogot');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-salogot-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(LOGO_GOCU)) ?? '';
  assert.ok(goc, 'Talep fişi göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}

describe('talep fişi Logo alanları göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('var olan talep ve kalemler tekil sayı kimliği alır, Logo durumları boş kalır (onaylı talep kendiliğinden Logo\'ya gitmez)', async () => {
    const x = al();
    const kisi = await x.ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
    const ekle = (sira: number) => x.ortam.vt.tx(async (db) => {
      const talepId = randomUUID();
      await db.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, 'onayda')`,
        [talepId, sira, kisi]);
      for (const s of [1, 2]) {
        await db.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar) VALUES ($1, $2, $3, 'Deneme kalem', 1)", [talepId, randomUUID(), s]);
      }
    });
    await ekle(1);
    await ekle(2);
    await copyFile(join(GOC_KLASORU, x.goc), join(x.klasor, x.goc));
    assert.deepEqual(await gocleriUygula(x.ortam.ayar, x.klasor, { sema: x.ortam.sema }), [x.goc]);
    const talepler = await x.ortam.vt.sorgu<{ sayi_id: number; logo_gonderim_durumu: string | null; logo_kayit_no: string | null }>(
      'SELECT sayi_id, logo_gonderim_durumu, logo_kayit_no FROM satin_alma_talep');
    assert.equal(new Set(talepler.map((r) => r.sayi_id)).size, 2);
    assert.ok(talepler.every((r) => r.logo_gonderim_durumu === null && r.logo_kayit_no === null));
    const kalemler = await x.ortam.vt.sorgu<{ sayi_id: number; logo_satir_ref: string | null }>('SELECT sayi_id, logo_satir_ref FROM satin_alma_talep_kalemi');
    assert.equal(new Set(kalemler.map((r) => r.sayi_id)).size, 4);
    assert.ok(kalemler.every((r) => r.logo_satir_ref === null));
  });
});
