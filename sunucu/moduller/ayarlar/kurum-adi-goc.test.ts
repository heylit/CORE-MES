import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// Firma adı taşıma göçü (1942 a, 1942 teyit) dolu kurulumda: satın alma adı önce, boşsa finans adı; elle girilmiş ayar korunur.
// Adlar uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TASIMA_GOCU = '_kabuk_kurum_adi_tasima.sql';

interface Durum { satinAlma: string; finans: string; ayar?: string }

async function tasi(onek: string, d: Durum): Promise<string | null> {
  const ortam = await testSemasiAc(onek);
  const klasor = await mkdtemp(join(tmpdir(), `tmiv2-${onek}-`));
  try {
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(TASIMA_GOCU));
    assert.ok(goc, 'taşıma göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: onek, parola: 'dogru-parola-1' }));
    await sahip.sorgu('UPDATE satin_alma_ayar SET sirket = $1', [d.satinAlma]);
    await sahip.sorgu('UPDATE finans_ayar SET sirket_adi = $1', [d.finans]);
    if (d.ayar !== undefined) {
      await sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('kabuk.kurum-adi', $1::jsonb, $2)", [JSON.stringify(d.ayar), kisi]);
    }
    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const satir = await sahip.tek<{ ad: string }>("SELECT deger #>> '{}' AS ad FROM ayar WHERE anahtar = 'kabuk.kurum-adi'");
    const eski = await sahip.tek<{ s: string; f: string }>('SELECT (SELECT sirket FROM satin_alma_ayar) AS s, (SELECT sirket_adi FROM finans_ayar) AS f');
    assert.deepEqual(eski, { s: d.satinAlma, f: d.finans }, 'eski sütunlar değişmez');
    return satir?.ad ?? null;
  } finally {
    await rm(klasor, { recursive: true, force: true });
    await ortam.kaldir();
  }
}

describe('firma adı taşıma göçü (gerçek PostgreSQL)', () => {
  test('satın alma adı önce taşınır; boşsa finans adı; finansın varsayılanı ve 80 karakteri aşan ad taşınmaz', async () => {
    assert.equal(await tasi('kagoc1', { satinAlma: ' Ornek Satin Alma Ltd ', finans: 'Ornek Finans' }), 'Ornek Satin Alma Ltd');
    assert.equal(await tasi('kagoc2', { satinAlma: '', finans: 'Ornek Finans' }), 'Ornek Finans');
    assert.equal(await tasi('kagoc3', { satinAlma: '', finans: 'Şirketim' }), null);
    assert.equal(await tasi('kagoc4', { satinAlma: 'a'.repeat(81), finans: 'Ornek Finans' }), 'Ornek Finans');
  });

  test('elle girilmiş firma adı korunur; eski varsayılan ve boş ayar üzerine yazılır', async () => {
    assert.equal(await tasi('kagoc5', { satinAlma: 'Ornek Satin Alma', finans: 'Şirketim', ayar: 'Elle Girilen' }), 'Elle Girilen');
    assert.equal(await tasi('kagoc6', { satinAlma: 'Ornek Satin Alma', finans: 'Şirketim', ayar: 'TMI' }), 'Ornek Satin Alma');
    assert.equal(await tasi('kagoc7', { satinAlma: 'Ornek Satin Alma', finans: 'Şirketim', ayar: '' }), 'Ornek Satin Alma');
  });
});
