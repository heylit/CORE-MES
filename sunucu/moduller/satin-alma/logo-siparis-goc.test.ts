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
const LOGO_GOCU = '_satin_alma_logo_siparis.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Logo göçünden önceki bütün göçler kurulur; Logo göçü var olan siparişlerin üstüne uygulanır.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('salogo');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-salogo-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(LOGO_GOCU)) ?? '';
  assert.ok(goc, 'Logo göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}

describe('sipariş Logo alanları göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('var olan siparişler tekil sayı kimliği alır, Logo durumları boş kalır (kendiliğinden Logo\'ya gitmez); yeni sipariş sıradaki kimliği alır', async () => {
    const x = al();
    const ekle = async (sira: number) => x.ortam.vt.tx(async (db) => {
      const kisi = (await db.tek<{ id: number }>('SELECT id FROM kisi ORDER BY id LIMIT 1'))!.id;
      const firma = (await db.tek<{ id: number }>('SELECT id FROM finans_firma ORDER BY id LIMIT 1'))!.id;
      const [talepId, teklifId] = [randomUUID(), randomUUID()];
      await db.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, 'siparis_verildi')`,
        [talepId, sira, kisi]);
      await db.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-01-01', 'TRY')", [talepId, teklifId, firma]);
      await db.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-01-01')", [talepId, teklifId]);
      await db.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, siparis_no, no) VALUES ($1, $2, 'L-1', $3)", [talepId, teklifId, `SP-2026-00${sira}`]);
      return talepId;
    });
    await x.ortam.vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
      const firma = (await db.tek<{ id: number }>("INSERT INTO finans_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarik', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
      await db.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    });
    const eskiler = [await ekle(1), await ekle(2)];
    await copyFile(join(GOC_KLASORU, x.goc), join(x.klasor, x.goc));
    assert.deepEqual(await gocleriUygula(x.ortam.ayar, x.klasor, { sema: x.ortam.sema }), [x.goc]);
    const yeni = await ekle(3);
    const satirlar = await x.ortam.vt.sorgu<{ talep_id: string; id: number; logo_gonderim_durumu: string | null; logo_kayit_no: string | null; logo_iptal_durumu: string | null }>(
      'SELECT talep_id, id, logo_gonderim_durumu, logo_kayit_no, logo_iptal_durumu FROM satin_alma_siparis ORDER BY id');
    assert.deepEqual(satirlar.map((r) => r.talep_id), [...eskiler, yeni]);
    assert.equal(new Set(satirlar.map((r) => r.id)).size, 3);
    assert.ok(satirlar.every((r) => r.logo_gonderim_durumu === null && r.logo_kayit_no === null && r.logo_iptal_durumu === null));
  });
});
