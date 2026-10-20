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
const NUMARA_GOCU = '_satin_alma_siparis_no_eski.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string }

// Numara sütunu ve sayaç kurulur; var olan siparişleri numaralayan göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('sasipno');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-sasipno-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(NUMARA_GOCU)) ?? '';
  assert.ok(goc, 'numara göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return { ortam, klasor, goc };
}

describe('var olan siparişleri numaralayan göç (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('yıl sipariş tarihinden, yoksa talebin açılışından; yıl içinde tarih sırasıyla numara; sayaç son sıradan devam eder', async () => {
    const x = al();
    // [talep sırası, sipariş tarihi, talep açılışı]
    const siparisler: [number, string | null, string][] = [
      [1, '2026-01-05', '2025-12-20T10:00:00Z'],
      [2, '2025-12-30', '2025-12-20T10:00:00Z'],
      [3, '2026-01-02', '2026-01-01T10:00:00Z'],
      // Tarihsiz sipariş, İstanbul'da 2026'nın ilk günü açılmış talepten yılını alır (UTC'de hâlâ 2025).
      [4, null, '2025-12-31T22:30:00Z'],
    ];
    const talepler = await x.ortam.vt.tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' });
      const firma = (await db.tek<{ id: number }>("INSERT INTO finans_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarik', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
      await db.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
      const idler: string[] = [];
      for (const [sira, tarih, acilis] of siparisler) {
        const talepId = randomUUID();
        const teklifId = randomUUID();
        await db.sorgu(
          `INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, olusturma)
           VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, 'siparis_verildi', $4)`, [talepId, sira, kisi, acilis],
        );
        await db.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-01-01', 'TRY')", [talepId, teklifId, firma]);
        await db.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-01-01')", [talepId, teklifId]);
        await db.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, siparis_no, siparis_tarihi) VALUES ($1, $2, 'L-1', $3)", [talepId, teklifId, tarih]);
        idler.push(talepId);
      }
      // Göçten önce verilmiş yeni numara korunur ve sayacın altında kalmaz.
      await db.sorgu("INSERT INTO satin_alma_siparis_sayaci (yil, son_sira) VALUES (2025, 7)");
      return idler;
    });
    await gocleriUygula(x.ortam.ayar, x.klasor, { sema: x.ortam.sema });
    await copyFile(join(GOC_KLASORU, x.goc), join(x.klasor, x.goc));
    assert.deepEqual(await gocleriUygula(x.ortam.ayar, x.klasor, { sema: x.ortam.sema }), [x.goc]);
    const no = async (talepId: string) => (await x.ortam.vt.tek<{ no: string; siparis_no: string }>(
      'SELECT no, siparis_no FROM satin_alma_siparis WHERE talep_id = $1', [talepId]))!;
    assert.deepEqual(await Promise.all(talepler.map(async (t) => (await no(t)).no)), ['SP-2026-003', 'SP-2025-001', 'SP-2026-002', 'SP-2026-001']);
    assert.equal((await no(talepler[0]!)).siparis_no, 'L-1');
    const sayac = await x.ortam.vt.sorgu<{ yil: number; son_sira: number }>('SELECT yil, son_sira FROM satin_alma_siparis_sayaci ORDER BY yil');
    assert.deepEqual(sayac.map((r) => [r.yil, r.son_sira]), [[2025, 7], [2026, 3]]);
  });
});
