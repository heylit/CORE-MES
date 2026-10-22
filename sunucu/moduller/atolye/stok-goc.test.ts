import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { alanlar, fabrikaPlani, gozAdresi, gozBul, gozler, raflar } from './disari.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));

describe('stok rafları Fabrika Haritası\'na kopyalanır (kart #686, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocs');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocs-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('depo bölüm, raf raf, raf gözü göz, öteki konum alan olur; ön yüz ve göz yeri korunur; kod çakışması çözülür', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_atolye_stok_raflari.sql'));
    assert.equal(sira > 0, true, 'kopya göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema, vt } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    const kisi = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Göç Denemesi') RETURNING id");
    // Atölyede ANA bölümü ve A12 rafı zaten var: depo ANA-DEPO olur, raf 12 AN12 olur.
    const ana = await vt.tek<{ id: number }>(
      `INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ANA', 'Atölye', 20, 20, 4, $1) RETURNING id`,
      [kisi?.id],
    );
    await vt.sorgu(
      `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus)
       VALUES ($1, 'A12', 'Var olan', 'palet', 1, 1, 1, 2, 1, 2, 5, 5, 0)`,
      [ana?.id],
    );
    const depo = await vt.tek<{ id: number }>("SELECT id FROM stok_depo WHERE kod = 'ANA'");
    await vt.sorgu("INSERT INTO stok_depo (kod, ad) VALUES ('D2', 'Boş depo')");
    const stokRaf = (kod: string, tur: string, numaralama: string, bolme: number, kat: number, g: number, d: number, h: number, x: number, z: number, aci: number, ters: boolean) =>
      vt.tek<{ id: number }>(
        `INSERT INTO stok_raf (depo_id, kod, tur, numaralama, bolme_sayisi, kat_sayisi, bolme_genislik_m, derinlik_m, kat_araligi_m, x_m, z_m, aci, on_yuz_ters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [depo?.id, kod, tur, numaralama, bolme, kat, g, d, h, x, z, aci, ters],
      );
    const r12 = await stokRaf('12', 'palet', 'sirali', 3, 2, 2.7, 1.1, 1.5, 0, 0, 0, false);
    const rB = await stokRaf('B', 'celik', 'cift', 2, 10, 1, 0.5, 0.45, 10, -10, 90, true);
    const konum = (kod: string, rafId: number | undefined, bolme: number, kat: number) => vt.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, raf_id, bolme_no, kat_no) VALUES ($1, $2, 'raf_gozu', $3, $4, $5) RETURNING id",
      [depo?.id, kod, rafId, bolme, kat],
    );
    const k1 = await konum('12-01-01', r12?.id, 1, 1);
    const k2 = await konum('12-03-02', r12?.id, 3, 2);
    const k3 = await konum('B-02-10', rB?.id, 2, 10);
    const k4 = await konum('B-04-01', rB?.id, 4, 1);
    // Çift numaralı rafta tek numara rafın ölçüsüne uymaz: bağlanmaz.
    const k5 = await konum('B-03-01', rB?.id, 3, 1);
    await vt.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'ZEMIN1', 'depo_zemini', NULL)", [depo?.id]);

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    assert.deepEqual(
      await vt.sorgu(`SELECT kod, ad, genislik, derinlik, hucre_boyu, giris_x, giris_z, fabrika_x, stok_depo_id = $1 AS ana
                        FROM atolye_salon WHERE stok_depo_id IS NOT NULL ORDER BY kod`, [depo?.id]),
      [
        // Kutu: bina -10..30 x -30..10, iki konumsuz alan için üstte 4 m şerit, 1 m pay: x -11..31, z -35..11.
        { kod: 'ANA-DEPO', ad: 'Ana depo', genislik: '42.00', derinlik: '46.00', hucre_boyu: '5.00', giris_x: '21.00', giris_z: '40.00', fabrika_x: '25.00', ana: true },
        { kod: 'D2', ad: 'Boş depo', genislik: '12.00', derinlik: '12.00', hucre_boyu: '5.00', giris_x: null, giris_z: null, fabrika_x: '76.00', ana: false },
      ],
    );
    assert.deepEqual(
      await vt.sorgu(`SELECT kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, x, z, donus, stok_raf_id
                        FROM atolye_raf WHERE stok_raf_id IS NOT NULL ORDER BY kod`),
      [
        // Ters yüzlü çelik raf 90 derecede: merkez ilk bölme kenarından 1 m solda, ön yüz +z, dönüş 0.
        { kod: 'AB', ad: 'Ana depo / B', tur: 'kucuk_parca', bolme_sayisi: 2, kat_sayisi: 10, goz_sayisi: 1, bolme_genisligi: '1.00', x: '20.00', z: '25.00', donus: '0.0', stok_raf_id: rB?.id },
        { kod: 'AN12', ad: 'Ana depo / 12', tur: 'palet', bolme_sayisi: 3, kat_sayisi: 2, goz_sayisi: 1, bolme_genisligi: '2.70', x: '11.00', z: '30.95', donus: '270.0', stok_raf_id: r12?.id },
      ],
    );
    assert.deepEqual(
      await vt.sorgu(`SELECT r.kod, g.bolme, g.kat, g.goz, g.stok_konum_id FROM atolye_goz g JOIN atolye_raf r ON r.id = g.raf_id
                       WHERE g.stok_konum_id IS NOT NULL ORDER BY r.kod, g.bolme, g.kat`),
      [
        // Ters yüzde bölme sırası tersten: çift 2 (ilk bölme) 2. bölme, çift 4 1. bölme olur.
        { kod: 'AB', bolme: 1, kat: 1, goz: 1, stok_konum_id: k4?.id },
        { kod: 'AB', bolme: 2, kat: 10, goz: 1, stok_konum_id: k3?.id },
        { kod: 'AN12', bolme: 1, kat: 1, goz: 1, stok_konum_id: k1?.id },
        { kod: 'AN12', bolme: 3, kat: 2, goz: 1, stok_konum_id: k2?.id },
      ],
    );
    assert.equal((await vt.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM atolye_goz WHERE stok_konum_id = $1', [k5?.id]))?.sayi, 0);
    assert.equal((await vt.tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM atolye_goz g JOIN atolye_raf r ON r.id = g.raf_id WHERE r.kod = 'AB'"))?.sayi, 20);
    assert.deepEqual(
      await vt.sorgu(`SELECT a.tur, a.ad, a.x, a.z, a.genislik, a.derinlik, k.kod FROM atolye_alan a JOIN stok_konum k ON k.id = a.stok_konum_id ORDER BY a.id`),
      [
        { tur: 'kabul', ad: 'Mal kabul alanı', x: '21.00', z: '40.00', genislik: '12.00', derinlik: '5.00', kod: 'KABUL' },
        { tur: 'uretim_cikisi', ad: 'Üretim çıkış alanı', x: '3.50', z: '3.00', genislik: '3.00', derinlik: '3.00', kod: 'URETIM' },
        { tur: 'depo_zemini', ad: 'ZEMIN1', x: '7.50', z: '3.00', genislik: '3.00', derinlik: '3.00', kod: 'ZEMIN1' },
      ],
    );

    // Başka modüle verilenler (disari.ts).
    const bulunan = await gozBul(vt, 'an12-3-2');
    assert.equal(bulunan?.adres, 'AN12-03-2-1');
    assert.equal((await gozAdresi(vt, bulunan?.id ?? 0))?.rafKodu, 'AN12');
    assert.equal(await gozBul(vt, 'AN12-03'), null);
    assert.equal(await gozAdresi(vt, 999999), null);
    assert.equal((await gozBul(vt, 'AB-02-10'))?.kat, 10);
    const salon = bulunan?.salonId ?? 0;
    assert.equal((await gozler(vt, salon)).length, 6 + 20);
    assert.deepEqual((await raflar(vt)).filter((r) => r.salonId === salon).map((r) => r.kod), ['AB', 'AN12']);
    assert.deepEqual((await alanlar(vt, salon)).map((a) => a.tur), ['kabul', 'uretim_cikisi', 'depo_zemini']);
    // Fabrika planı (#114): bölüm fabrikadaki yeriyle, rafları ve stok alanlarıyla; atölye ucuyla aynı veri.
    const plan = (await fabrikaPlani(vt)).bolumler.find((b) => b.salon.id === salon);
    assert.ok(plan);
    assert.deepEqual(plan.raflar.map((r) => r.kod).sort(), ['AB', 'AN12']);
    assert.deepEqual(plan.alanlar.map((a) => [a.tur, a.genislik]), [['kabul', '12.00'], ['uretim_cikisi', '3.00'], ['depo_zemini', '3.00']]);
    assert.match(plan.salon.fabrika.x, /^-?\d+\.\d{2}$/);
  });
});
