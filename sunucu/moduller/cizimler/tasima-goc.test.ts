import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const TASIMA_GOCU = '_cizimler_eski_dosyalar.sql';

interface Ortam { ortam: TestVeritabani; klasor: string; goc: string; kisiId: number }

// Taşıma göçünden önceki şema kurulur; göç henüz uygulanmaz.
async function hazirla(): Promise<Ortam> {
  const ortam = await testSemasiAc('cztasi');
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-cztasi-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
  const goc = hepsi.find((ad) => ad.endsWith(TASIMA_GOCU)) ?? '';
  assert.ok(goc, 'taşıma göçü bulunamadı');
  for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
  return { ortam, klasor, goc, kisiId };
}

async function gocuDene(o: Ortam): Promise<string[]> {
  await copyFile(join(GOC_KLASORU, o.goc), join(o.klasor, o.goc));
  return gocleriUygula(o.ortam.ayar, o.klasor, { sema: o.ortam.sema });
}

const ozet = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const pdf = (boy: number, dolgu: string): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(boy - 9, dolgu)]);
const step = Buffer.from('ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;\n');
const ikiliStl = (): Buffer => { const b = Buffer.alloc(84 + 50 * 2); b.writeUInt32LE(2, 80); return b; };
const iges = (): Buffer => Buffer.from(`${' '.repeat(72)}S      1\n${'x'.repeat(40)}`, 'latin1');

// Arkon dosyayı küçükse satır içinde ($ta), büyükse içerik deposunda ($blob) tutar.
const satirIci = (b: Buffer) => ({ $ta: 'u8', b: b.toString('base64') });

describe('Arkon ve atölye dosyalarının Çizim Merkezi’ne taşıma göçü (gerçek PostgreSQL)', () => {
  let o: Ortam | undefined;
  const al = (): Ortam => { if (!o) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return o; };
  beforeEach(async () => { o = await hazirla(); });
  afterEach(async () => {
    if (o) { await rm(o.klasor, { recursive: true, force: true }); await o.ortam.kaldir(); }
    o = undefined;
  });

  test('Arkon dosyaları içerikten türüyle belge olur; aynı içerik tek belge; sahte ve eksik dosya atlanır; kaynak değişmez', async () => {
    const x = al();
    const buyukPdf = pdf(20000, 'a');
    await x.ortam.vt.sorgu('INSERT INTO arkon_dosya (ozet, icerik, boyut, yukleyen_id) VALUES ($1, $2, $3, $4)',
      [ozet(buyukPdf), buyukPdf, buyukPdf.length, x.kisiId]);
    const cizim = {
      id: 'dr-1', name: 'Flanş çizimi',
      files: [
        { name: 'flans.pdf', kind: 'pdf', bytes: { $blob: ozet(buyukPdf), t: 'u8', n: buyukPdf.length } },
        { name: 'flans.step', kind: 'model', bytes: satirIci(step) },
        { name: 'kayip.pdf', kind: 'pdf', bytes: { $blob: 'f'.repeat(64), t: 'u8', n: 99999 } },
      ],
    };
    const paket = {
      id: 'p-1', partNo: 'P-1',
      files: [
        { name: 'kopya.pdf', kind: 'pdf', bytes: { $blob: ozet(buyukPdf), t: 'u8', n: buyukPdf.length } },
        { name: 'govde.stl', kind: 'model', bytes: satirIci(ikiliStl()) },
        { name: 'kapak.igs', kind: 'model', bytes: satirIci(iges()) },
        { name: 'ornek.pdf', kind: 'pdf', bytes: satirIci(Buffer.from('smp-pdf')) },
        { name: 'bozuk.pdf', kind: 'pdf', bytes: { $ta: 'u8', b: '%%%' } },
      ],
    };
    await x.ortam.vt.sorgu(
      `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id, degisti)
       VALUES ('pkgs', 'p-1', $1, 1, $3, '2026-03-01T09:00:00Z'), ('draws', 'dr-1', $2, 1, $3, '2026-04-01T09:00:00Z')`,
      [JSON.stringify(paket), JSON.stringify(cizim), x.kisiId]);
    const once = await x.ortam.vt.sorgu('SELECT depo, kimlik, govde, surum FROM arkon_belge ORDER BY depo, kimlik');

    assert.deepEqual(await gocuDene(x), [x.goc]);

    assert.deepEqual(await x.ortam.vt.sorgu(
      `SELECT b.ad, b.tur, b.aciklama, r.sira, r.durum, r.dosya_turu, r.yukleyen_id = b.olusturan_id AND r.yayinlayan_id = b.olusturan_id AS kisi,
              to_char(r.yayinlandi AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS gun
         FROM cizimler_belge b JOIN cizimler_revizyon r ON r.belge_id = b.id ORDER BY b.ad`), [
      { ad: 'flans.pdf', tur: 'teknik-resim', aciklama: 'Arkon çiziminden taşındı: Flanş çizimi', sira: 1, durum: 'yayinda', dosya_turu: 'pdf', kisi: true, gun: '2026-04-01' },
      { ad: 'flans.step', tur: '3b-model', aciklama: 'Arkon çiziminden taşındı: Flanş çizimi', sira: 1, durum: 'yayinda', dosya_turu: 'step', kisi: true, gun: '2026-04-01' },
      { ad: 'govde.stl', tur: '3b-model', aciklama: 'Arkon iş paketinden taşındı: P-1', sira: 1, durum: 'yayinda', dosya_turu: 'stl', kisi: true, gun: '2026-03-01' },
      { ad: 'kapak.igs', tur: '3b-model', aciklama: 'Arkon iş paketinden taşındı: P-1', sira: 1, durum: 'yayinda', dosya_turu: 'iges', kisi: true, gun: '2026-03-01' },
    ]);

    // Dosya bağlı, içerik bayt bayt aynı, bağ belgenin kimliğiyle.
    const pdfSatiri = await x.ortam.vt.tek<{ boyut: string; tur: string; bagsiz: boolean; icerik: Buffer; kayit: string; belge: string }>(
      `SELECT d.boyut::text, d.tur, d.bagsiz_zaman IS NULL AS bagsiz,
              (SELECT string_agg(icerik, ''::bytea ORDER BY sira) FROM dosya_icerigi WHERE ozet = d.ozet) AS icerik,
              g.kayit, (SELECT r.belge_id::text FROM cizimler_revizyon r WHERE r.ozet = d.ozet) AS belge
         FROM dosya d JOIN dosya_bagi g ON g.ozet = d.ozet AND g.modul = 'cizimler' WHERE d.ozet = $1`, [ozet(buyukPdf)]);
    assert.ok(pdfSatiri);
    assert.equal(pdfSatiri.boyut, String(buyukPdf.length));
    assert.equal(pdfSatiri.tur, 'pdf');
    assert.equal(pdfSatiri.bagsiz, true);
    assert.ok(pdfSatiri.icerik.equals(buyukPdf));
    assert.equal(pdfSatiri.kayit, pdfSatiri.belge);
    assert.equal((await x.ortam.vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM dosya_yukleyeni WHERE kisi_id = $1', [x.kisiId]))?.n, 4);

    assert.deepEqual(await x.ortam.vt.sorgu('SELECT depo, kimlik, govde, surum FROM arkon_belge ORDER BY depo, kimlik'), once);
  });

  test('tamamlanmış kroki parçaları birleşip kroki belgesi olur, salona bağlanır; fabrika krokisi bağsız; yarım kroki atlanır', async () => {
    const x = al();
    const salon = await x.ortam.vt.tek<{ id: number }>(
      `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('S1', 'Deneme salon', 20, 20, 1, $1) RETURNING id`,
      [x.kisiId]);
    const krokiKoy = async (salonId: number | null, ad: string, icerik: Buffer, tamam: boolean): Promise<void> => {
      const k = await x.ortam.vt.tek<{ id: number }>(
        `INSERT INTO atolye_kroki (salon_id, ad, boyut_bayt, parca_sayisi, ozet, kaydeden_kisi_id, kaydedildi)
         VALUES ($1, $2, $3, $4, $5, $6, '2026-05-01T09:00:00Z') RETURNING id`,
        [salonId, ad, icerik.length, Math.ceil(icerik.length / 524288), ozet(icerik), x.kisiId]);
      for (let sira = 0; sira * 524288 < icerik.length; sira++) {
        await x.ortam.vt.sorgu('INSERT INTO atolye_kroki_parca (kroki_id, sira, veri) VALUES ($1, $2, $3)',
          [k!.id, sira, icerik.subarray(sira * 524288, (sira + 1) * 524288)]);
      }
      if (tamam) await x.ortam.vt.sorgu('UPDATE atolye_kroki SET tamam = true, surum = surum + 1 WHERE id = $1', [k!.id]);
    };
    const salonPdf = pdf(600000, 'b');
    await krokiKoy(salon!.id, 'Salon planı', salonPdf, true);
    await krokiKoy(null, 'Fabrika planı', pdf(3000, 'c'), true);
    const s2 = await x.ortam.vt.tek<{ id: number }>(
      `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('S2', 'Yarım', 20, 20, 1, $1) RETURNING id`, [x.kisiId]);
    await krokiKoy(s2!.id, 'Yarım plan', pdf(3000, 'd'), false);

    assert.deepEqual(await gocuDene(x), [x.goc]);

    assert.deepEqual(await x.ortam.vt.sorgu(
      `SELECT b.ad, b.tur, b.aciklama, r.durum, g.hedef_modul, g.hedef_id
         FROM cizimler_belge b JOIN cizimler_revizyon r ON r.belge_id = b.id LEFT JOIN cizimler_bag g ON g.belge_id = b.id ORDER BY b.ad`), [
      { ad: 'Fabrika planı', tur: 'kroki', aciklama: 'Fabrika haritasından taşındı: fabrika krokisi', durum: 'yayinda', hedef_modul: null, hedef_id: null },
      { ad: 'Salon planı', tur: 'kroki', aciklama: 'Fabrika haritasından taşındı: Deneme salon', durum: 'yayinda', hedef_modul: 'atolye', hedef_id: salon!.id },
    ]);
    // 600 000 bayt, 512 KiB'lık iki parça olarak saklanır ve aynı içeriği verir.
    const parca = await x.ortam.vt.sorgu<{ sira: number; boy: number }>(
      'SELECT sira, length(icerik) AS boy FROM dosya_icerigi WHERE ozet = $1 ORDER BY sira', [ozet(salonPdf)]);
    assert.deepEqual(parca, [{ sira: 0, boy: 524288 }, { sira: 1, boy: 600000 - 524288 }]);
  });

  test('merkezde aynı içerikli revizyon varsa dosya yeniden belge olmaz', async () => {
    const x = al();
    await x.ortam.vt.sorgu(
      `INSERT INTO dosya (ozet, boyut, tur, ilk_yukleyen_id, bagsiz_zaman) VALUES ($1, $2, 'step', $3, NULL)`, [ozet(step), step.length, x.kisiId]);
    await x.ortam.vt.sorgu('INSERT INTO dosya_icerigi (ozet, sira, icerik) VALUES ($1, 0, $2)', [ozet(step), step]);
    const b = await x.ortam.vt.tek<{ id: number }>("INSERT INTO cizimler_belge (ad, tur, olusturan_id) VALUES ('Var olan', '3b-model', $1) RETURNING id", [x.kisiId]);
    await x.ortam.vt.sorgu("INSERT INTO cizimler_revizyon (belge_id, sira, ozet, dosya_turu, yukleyen_id) VALUES ($1, 1, $2, 'step', $3)", [b!.id, ozet(step), x.kisiId]);
    await x.ortam.vt.sorgu(
      "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('draws', 'dr-2', $1, 1, $2)",
      [JSON.stringify({ id: 'dr-2', name: 'Aynı', files: [{ name: 'ayni.step', kind: 'model', bytes: satirIci(step) }] }), x.kisiId]);

    assert.deepEqual(await gocuDene(x), [x.goc]);
    assert.deepEqual(await x.ortam.vt.sorgu('SELECT ad FROM cizimler_belge ORDER BY id'), [{ ad: 'Var olan' }]);
  });
});
