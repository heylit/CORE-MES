import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parcaAnahtari } from '#paylasilan/atolye-sabitleri.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));

// 3371 a: göç İ'yi I'ya katlar; katlanınca iki satır aynı anahtara düşüyorsa hiçbir şey değiştirmeden durur ve listeler.
// Eski anahtar yedek tabloda kalır. Veriler uydurmadır (ORN-).
describe('atölye kod anahtarı katlama göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocatlkat');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocatlkat-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('çakışma varken durur ve değiştirmez; çakışma kalkınca katlar, yedekler ve katlanmamış anahtarı reddeder', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_atolye_kod_anahtari_katlama.sql'));
    assert.equal(sira > 0, true, 'göç bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, sahip } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = (await sahip.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    const salon = (await sahip.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ORN-S', 'Deneme', 20, 10, 5, $1) RETURNING id",
      [kisi]))!.id;
    const raf = (await sahip.tek<{ id: number }>(
      `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus)
       VALUES ($1, 'R1', 'Deneme raf', 'palet', 2, 2, 1, 1.4, 1.0, 2.0, 5, 5, 0) RETURNING id`, [salon]))!.id;
    const goz = (await sahip.tek<{ id: number }>('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) VALUES ($1, 1, 1, 1) RETURNING id', [raf]))!.id;
    const gorunumEkle = (anahtar: string): Promise<unknown> => sahip.sorgu(
      "INSERT INTO atolye_kalem_gorunumu (kod_anahtari, kod, ambalaj, kaydeden_kisi_id) VALUES ($1, $2, 'koli', $3)", [anahtar, anahtar, kisi]);
    const gozeEkle = (anahtar: string): Promise<unknown> => sahip.sorgu(
      "INSERT INTO atolye_goz_kalemi (goz_id, kod_anahtari, kod, ad, doluluk, kaydeden_kisi_id) VALUES ($1, $2, $2, 'Deneme', 10, $3)", [goz, anahtar, kisi]);

    // Eski işlevin yazdığı anahtarlar: 'orn-mil-1' -> ORN-MİL-1, 'ORN-MIL-1' -> ORN-MIL-1 (aynı parça, iki satır).
    await gorunumEkle('ORN-MİL-1');
    await gorunumEkle('ORN-MIL-1');
    await gorunumEkle('ORN-KİT-2');
    await gozeEkle('ORN-KİT-2');
    await gozeEkle('ORN-PIM-3');

    await assert.rejects(gocleriUygula(ayar, GERCEK_KLASOR, { sema }), (hata: Error) => {
      assert.match(hata.message, /aynı anahtara düşen kalem görünümleri var, hiçbir şey değişmedi: görünüm ORN-MIL-1: ORN-MIL-1, ORN-MİL-1/);
      return true;
    });
    assert.deepEqual((await sahip.sorgu<{ k: string }>('SELECT kod_anahtari AS k FROM atolye_kalem_gorunumu ORDER BY 1')).map((s) => s.k),
      ['ORN-KİT-2', 'ORN-MIL-1', 'ORN-MİL-1']);

    await sahip.sorgu("DELETE FROM atolye_kalem_gorunumu WHERE kod_anahtari = 'ORN-MIL-1'");
    await gocleriUygula(ayar, GERCEK_KLASOR, { sema });
    assert.deepEqual((await sahip.sorgu<{ k: string }>('SELECT kod_anahtari AS k FROM atolye_kalem_gorunumu ORDER BY 1')).map((s) => s.k),
      ['ORN-KIT-2', 'ORN-MIL-1']);
    assert.deepEqual((await sahip.sorgu<{ k: string }>('SELECT kod_anahtari AS k FROM atolye_goz_kalemi ORDER BY 1')).map((s) => s.k),
      ['ORN-KIT-2', 'ORN-PIM-3']);
    assert.deepEqual(await sahip.sorgu('SELECT tablo, eski, yeni FROM atolye_kod_anahtari_yedegi ORDER BY tablo, eski'), [
      { tablo: 'atolye_goz_kalemi', eski: 'ORN-KİT-2', yeni: 'ORN-KIT-2' },
      { tablo: 'atolye_kalem_gorunumu', eski: 'ORN-KİT-2', yeni: 'ORN-KIT-2' },
      { tablo: 'atolye_kalem_gorunumu', eski: 'ORN-MİL-1', yeni: 'ORN-MIL-1' },
    ]);
    // Göçten sonra her yazım uygulamanın anahtarıyla aynı satırı bulur.
    for (const yazim of ['orn-mil-1', 'ORN-MIL-1', 'Orn-Mıl-1']) assert.equal(parcaAnahtari(yazim), 'ORN-MIL-1');
    await assert.rejects(gorunumEkle('ORN-İ-4'), /atolye_kalem_gorunumu_anahtar_katli/);
    await assert.rejects(gozeEkle('ORN-İ-4'), /atolye_goz_kalemi_anahtar_katli/);
  });
});
