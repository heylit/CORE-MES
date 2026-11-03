import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

// İK firma adı göçü (1942 teyit: İK > Satın alma > Finans) dolu kurulumda: önceki taşıma göçünün yazdığı ad İK adıyla değişir,
// elle girilmiş ad korunur. Adlar uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const TASIMA_GOCU = '_kabuk_kurum_adi_tasima.sql';
const IK_GOCU = '_kabuk_kurum_adi_ik.sql';

// ik: undefined İK ayar satırı yok, null satır var ama ad girilmemiş.
interface Durum { satinAlma: string; ik?: string | null; once?: string; sonra?: string }

async function tasi(onek: string, d: Durum): Promise<string | null> {
  const ortam = await testSemasiAc(onek);
  const klasor = await mkdtemp(join(tmpdir(), `tmiv2-${onek}-`));
  try {
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const tasima = hepsi.find((ad) => ad.endsWith(TASIMA_GOCU));
    const ikGocu = hepsi.find((ad) => ad.endsWith(IK_GOCU));
    assert.ok(tasima && ikGocu, 'göçler bulunamadı');
    const kopyala = async (sec: (ad: string) => boolean) => { for (const ad of hepsi.filter(sec)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad)); };
    await kopyala((a) => a < tasima);
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: onek, parola: 'dogru-parola-1' }));
    await sahip.sorgu('UPDATE satin_alma_ayar SET sirket = $1', [d.satinAlma]);
    await sahip.sorgu("UPDATE finans_ayar SET sirket_adi = 'Şirketim'");
    if (d.ik !== undefined) {
      await sahip.sorgu("INSERT INTO ik_genel_ayar (anahtar, sirket, guncelleyen_kisi_id) VALUES ('genel', $1, $2) ON CONFLICT (anahtar) DO UPDATE SET sirket = EXCLUDED.sirket", [d.ik, kisi]);
    }
    const elle = (ad: string) => sahip.sorgu(
      "INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('kabuk.kurum-adi', $1::jsonb, $2) ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, guncelleme = now()",
      [JSON.stringify(ad), kisi],
    );
    if (d.once !== undefined) await elle(d.once);
    await kopyala((a) => a === tasima);
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [tasima]);
    if (d.sonra !== undefined) await elle(d.sonra);
    await kopyala((a) => a > tasima && a <= ikGocu);
    assert.ok((await gocleriUygula(ayar, klasor, { sema })).includes(ikGocu));
    const satir = await sahip.tek<{ ad: string }>("SELECT deger #>> '{}' AS ad FROM ayar WHERE anahtar = 'kabuk.kurum-adi'");
    const ik = await sahip.tek<{ sirket: string | null }>("SELECT sirket FROM ik_genel_ayar WHERE anahtar = 'genel'");
    assert.equal(ik?.sirket ?? null, d.ik ?? null, 'İK sütunu değişmez');
    return satir?.ad ?? null;
  } finally {
    await rm(klasor, { recursive: true, force: true });
    await ortam.kaldir();
  }
}

describe('İK firma adı göçü (gerçek PostgreSQL)', () => {
  test('taşıma göçünün yazdığı satın alma adı İK adıyla değişir; ayar yoksa İK adı yazılır; İK adı boşsa önceki ad kalır', async () => {
    assert.equal(await tasi('kaik1', { satinAlma: 'Ornek Satin Alma', ik: ' Ornek IK Atolye ' }), 'Ornek IK Atolye');
    assert.equal(await tasi('kaik2', { satinAlma: '', ik: 'Ornek IK Atolye' }), 'Ornek IK Atolye');
    assert.equal(await tasi('kaik3', { satinAlma: 'Ornek Satin Alma', ik: null }), 'Ornek Satin Alma');
    assert.equal(await tasi('kaik4', { satinAlma: 'Ornek Satin Alma' }), 'Ornek Satin Alma');
    assert.equal(await tasi('kaik5', { satinAlma: 'Ornek Satin Alma', ik: 'a'.repeat(81) }), 'Ornek Satin Alma');
  });

  test('elle girilmiş firma adı korunur: taşımadan önce de sonra da; eski varsayılan üzerine yazılır', async () => {
    assert.equal(await tasi('kaik6', { satinAlma: 'Ornek Satin Alma', ik: 'Ornek IK Atolye', once: 'Elle Girilen' }), 'Elle Girilen');
    assert.equal(await tasi('kaik7', { satinAlma: 'Ornek Satin Alma', ik: 'Ornek IK Atolye', sonra: 'Sonra Elle Girilen' }), 'Sonra Elle Girilen');
    assert.equal(await tasi('kaik8', { satinAlma: '', ik: 'Ornek IK Atolye', once: 'TMI' }), 'Ornek IK Atolye');
  });
});
