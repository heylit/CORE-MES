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
const PARALEL_GOCU = '_uretim_emirleri_paralel_adim.sql';

type Sahip = TestVeritabani['sahip'];

// Göçten önceki bütün göçler uygulanmış şema; göç dosyasının adı döner.
async function oncesiniKur(ortam: TestVeritabani, klasor: string): Promise<string> {
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(PARALEL_GOCU));
  assert.ok(goc, 'paralel adım göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  return goc;
}

interface Kurulum { kisi: number; ikinci: number; neden: number; emirKur: (adimlar: readonly ('bekliyor' | 'calisiyor' | 'tamam')[]) => Promise<{ emir: number; ist: number; adimlar: number[] }> }

async function kurulum(ortam: TestVeritabani, onek: string): Promise<Kurulum> {
  const { vt, sahip } = ortam;
  const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: `${onek}-kisi`, kullaniciAdi: `${onek}-kisi`, parola: 'dogru-parola-1' }));
  const ikinci = await vt.tx((db) => yoneticiOlustur(db, { ad: `${onek}-iki`, kullaniciAdi: `${onek}-iki`, parola: 'dogru-parola-1' }));
  const merkez = (await sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`${onek}M`, 'Deneme']))!.id;
  const neden = (await sahip.tek<{ id: number }>(
    "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ($1, 'Deneme duruşu', 'plansiz', 952) RETURNING id", [`${onek}-D1`]))!.id;
  let sayac = 0;
  const emirKur: Kurulum['emirKur'] = async (adimlar) => {
    sayac += 1;
    const ist = (await sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`${onek}I${sayac}`, `Deneme ${sayac}`, merkez]))!.id;
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-PA', 'Deneme', 5, $1, $2) RETURNING id", [ist, kisi]))!.id;
    const idler: number[] = [];
    for (const [i, durum] of adimlar.entries()) {
      const alan = { bekliyor: '', calisiyor: ', baslama = now()', tamam: ', baslama = now(), bitis = now(), saglam_adet = 5' }[durum];
      const id = (await sahip.tek<{ id: number }>(
        `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad)
         VALUES ($1, $2, $3, (SELECT min(id) FROM istasyonlar_operasyon_tipi), $4) RETURNING id`, [emir, i + 1, (i + 1) * 10, `Adım ${i + 1}`]))!.id;
      if (durum !== 'bekliyor') await sahip.sorgu(`UPDATE uretim_emirleri_is_emri SET durum = $2${alan} WHERE id = $1`, [id, durum]);
      idler.push(id);
    }
    if (adimlar.includes('calisiyor')) await sahip.sorgu("UPDATE uretim_emri SET durum = 'basladi', baslama = now() WHERE id = $1", [emir]);
    return { emir, ist, adimlar: idler };
  };
  return { kisi, ikinci, neden, emirKur };
}

const olay = (sahip: Sahip, k: Kurulum, e: { emir: number; ist: number }, isEmriId: number | null, ad: 'duraklat' | 'durdur' | 'devam' | 'ayar') =>
  sahip.sorgu(
    `INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman, is_emri_id) VALUES ($1, $2, $3, $4, $5, clock_timestamp(), $6)`,
    [e.emir, k.kisi, e.ist, ad, ad === 'durdur' ? k.neden : null, isEmriId],
  );
const katilim = (sahip: Sahip, kisi: number, e: { emir: number; ist: number }, isEmriId: number | null) =>
  sahip.sorgu('INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris) VALUES ($1, $2, $3, $4, now())', [e.emir, isEmriId, kisi, e.ist]);
const calisma = async (sahip: Sahip, emir: number) => (await sahip.tek<{ calisma: string }>('SELECT calisma FROM uretim_emri WHERE id = $1', [emir]))!.calisma;

describe('paralel adım göçü dolu tabloda (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('paraleladimgoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-paraleladim-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('var olan satırlar değişmez; emrin çalışma hâli adımların özeti olur; tek açık katılım adım başınadır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { sahip } = ortam;
    const goc = await oncesiniKur(ortam, klasor);
    const k = await kurulum(ortam, 'PA');

    // Göçten önce: tek çalışan adımlı emir duraklamış, öteki emirde açık katılım ve bitmiş adım var.
    const eski = await k.emirKur(['tamam', 'calisiyor']);
    await olay(sahip, k, eski, eski.adimlar[1]!, 'duraklat');
    const acik = await k.emirKur(['calisiyor', 'bekliyor']);
    await katilim(sahip, k.kisi, acik, acik.adimlar[0]!);
    const goruntu = async () => JSON.stringify(await sahip.sorgu(`
      SELECT 'e' AS t, id, durum, calisma, istasyon_id, baslama, bitis, saglam_adet, surum, NULL::int AS b FROM uretim_emri
      UNION ALL SELECT 'i', id, durum, NULL, istasyon_id, baslama, bitis, saglam_adet, surum, uretim_emri_id FROM uretim_emirleri_is_emri
      UNION ALL SELECT 'k', id, kapanis, NULL, istasyon_id, giris, cikis, kisi_id, NULL, is_emri_id FROM uretim_emirleri_katilim
      UNION ALL SELECT 'o', id, olay, NULL, istasyon_id, zaman, NULL, kisi_id, NULL, is_emri_id FROM uretim_olayi
      ORDER BY 1, 2`));
    const once = await goruntu();

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
    assert.equal(await goruntu(), once, 'göç hiçbir satırı değiştirmedi');
    assert.equal(await calisma(sahip, eski.emir), 'durakli');

    // Tek çalışan adım: sonuç eski kuralla aynıdır (yeni olayın hâli).
    const tek = await k.emirKur(['calisiyor']);
    for (const [ad, beklenen] of [['duraklat', 'durakli'], ['devam', 'calisiyor'], ['durdur', 'durdu'], ['ayar', 'calisiyor'], ['devam', 'calisiyor']] as const) {
      await olay(sahip, k, tek, tek.adimlar[0]!, ad);
      assert.equal(await calisma(sahip, tek.emir), beklenen, ad);
    }

    // İki çalışan adım: biri duraklayınca emir çalışır kalır, ikisi de duraklayınca duraklamış olur.
    const iki = await k.emirKur(['calisiyor', 'calisiyor']);
    const [a, b] = [iki.adimlar[0]!, iki.adimlar[1]!];
    await olay(sahip, k, iki, a, 'duraklat');
    assert.equal(await calisma(sahip, iki.emir), 'calisiyor', 'B sürüyor');
    await olay(sahip, k, iki, b, 'durdur');
    assert.equal(await calisma(sahip, iki.emir), 'durdu', 'ikisi de durdu');
    await olay(sahip, k, iki, a, 'ayar');
    assert.equal(await calisma(sahip, iki.emir), 'calisiyor', 'ayar eski kuralda olduğu gibi çalışıyor yazar');
    await olay(sahip, k, iki, a, 'devam');
    await olay(sahip, k, iki, b, 'duraklat');
    assert.equal(await calisma(sahip, iki.emir), 'calisiyor', 'A sürüyor');

    // Katılım: aynı kişi iki adımda açık olabilir, aynı adımda iki kez olamaz; iş emirsiz eski emirde kural emir başınadır.
    await katilim(sahip, k.ikinci, iki, a);
    await katilim(sahip, k.ikinci, iki, b);
    await assert.rejects(katilim(sahip, k.ikinci, iki, a), /uretim_emirleri_katilim_kiside_tek_acik/);
    const isEmirsiz = await k.emirKur([]);
    await katilim(sahip, k.ikinci, isEmirsiz, null);
    await assert.rejects(katilim(sahip, k.ikinci, isEmirsiz, null), /uretim_emirleri_katilim_is_emirsiz_tek_acik/);
    await katilim(sahip, k.kisi, isEmirsiz, null);
  });
});

describe('paralel adım göçü birden çok çalışan adımda durur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('paraleladimret');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-paraleladimret-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('aynı emirde iki çalışan adım varsa göç uygulanmaz ve dizin değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const goc = await oncesiniKur(ortam, klasor);
    const k = await kurulum(ortam, 'PR');
    await k.emirKur(['calisiyor', 'calisiyor']);
    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /Birden çok çalışan adımı olan 1 emir/);
    const dizin = await ortam.sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = 'uretim_olayi_is_emri_idx'", [ortam.sema]);
    assert.equal(dizin?.n, 0);
  });
});
