import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TEK_CALISAN_GOCU = '_uretim_emirleri_tek_calisan.sql';

describe('tek çalışan göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('tekcalisangoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-tekcalisan-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('başlamış emirlerin çalışma hâli son olaydan doldurulur; öteki emirler ve var olan sütunlar değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(TEK_CALISAN_GOCU));
    assert.ok(goc, 'tek çalışan göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    // Göç öncesi şemada her istasyonda en çok bir başlamış emir olabilir: her senaryo ayrı istasyondadır.
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'tc-kisi', kullaniciAdi: 'tc-kisi', parola: 'dogru-parola-1' }));
    const merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TCM', 'Deneme') RETURNING id"))!.id;
    const neden = (await sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('TC-D1', 'Deneme duruşu', 'plansiz', 951) RETURNING id"))!.id;
    let sayac = 0;
    const emirKur = async (durum: 'planli' | 'basladi' | 'bitti', olaylar: readonly ('duraklat' | 'durdur' | 'devam')[], ayniAn = false): Promise<number> => {
      sayac += 1;
      const ist = (await sahip.tek<{ id: number }>(
        'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`TCI${sayac}`, `Deneme ${sayac}`, merkez]))!.id;
      const ek = durum === 'planli' ? '' : durum === 'basladi'
        ? ', baslama = now()' : ', baslama = now(), bitis = now(), saglam_adet = 3';
      const emir = (await sahip.tek<{ id: number }>(
        `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-TC', 'Deneme', 5, $1, $2) RETURNING id`, [ist, kisi]))!.id;
      if (durum !== 'planli') await sahip.sorgu(`UPDATE uretim_emri SET durum = $2${ek} WHERE id = $1`, [emir, durum]);
      for (const olay of olaylar) {
        await sahip.sorgu(
          `INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN '2026-01-01T00:00:00Z'::timestamptz ELSE clock_timestamp() END)`,
          [emir, kisi, ist, olay, olay === 'durdur' ? neden : null, ayniAn],
        );
      }
      return emir;
    };
    const olaysiz = await emirKur('basladi', []);
    const duraklat = await emirKur('basladi', ['duraklat']);
    const durdur = await emirKur('basladi', ['duraklat', 'durdur']);
    const devam = await emirKur('basladi', ['duraklat', 'devam']);
    const ayniAnDuraklat = await emirKur('basladi', ['devam', 'duraklat'], true);
    const ayniAnDevam = await emirKur('basladi', ['duraklat', 'devam'], true);
    const bitmis = await emirKur('bitti', ['duraklat']);
    const planli = await emirKur('planli', ['duraklat']);

    const ozet = () => sahip.sorgu<Record<string, unknown>>(
      `SELECT id, emir_no, parca_no, parca_ad, adet, istasyon_id, durum, acan_id, baslama, bitis, iptal, saglam_adet FROM uretim_emri ORDER BY id`);
    const once = JSON.stringify(await ozet());

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    const calisma = new Map((await sahip.sorgu<{ id: number; calisma: string }>('SELECT id, calisma FROM uretim_emri')).map((s) => [s.id, s.calisma]));
    assert.deepEqual(
      [olaysiz, duraklat, durdur, devam, ayniAnDuraklat, ayniAnDevam, bitmis, planli].map((id) => calisma.get(id)),
      ['calisiyor', 'durakli', 'durdu', 'calisiyor', 'durakli', 'calisiyor', 'calisiyor', 'calisiyor'],
    );
    assert.equal(JSON.stringify(await ozet()), once, 'var olan sütunlar değişmedi');
  });
});
