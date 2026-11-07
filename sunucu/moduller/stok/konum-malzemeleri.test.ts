import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { konumAyrintiCevabi, konumMalzemeleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 2224-2 b: stok_bakiye.konuma_gelis. "Bu konumda" konuma gelişten sayılır; ilk_giris depoya ilk giriştir ve transferde taşınır.
// Her bakiye yazımında geliş hareketten yenilenir: eldeki miktarı karşılayan en eski giriş; aynı konumdaki statü ya da kalite
// değişimi ve geri alınan giriş sayılmaz. Göçün doldurması aynı kuralla eski satırları doldurur.
const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261107171006_stok_bakiye_konuma_gelis.sql';

type Kalite = 'serbest' | 'karar_bekliyor';
interface Hareket { tur: 'giris' | 'cikis' | 'transfer' | 'geri_alma'; kaynak?: number; hedef?: number; miktar: string; saatOnce: number; geriAlinan?: number; kalite?: [Kalite, Kalite] }

describe('stok konumdaki malzemeler (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let kisi = 0;
  let kabul = 0;
  let raf = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async (kim: string | null, yol: string): Promise<{ durum: number; govde: unknown }> => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: kim === null ? {} : { cookie: cerezler.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  let sira = 0;
  async function kart(): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['KMZ-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'KMZ-DNM-', $2, 'aktif', $3, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [`kmz-dnm-${sira}`, sira, JSON.stringify({ id: `kmz-dnm-${sira}`, com: { ad: `Deneme ${sira}` } })],
    );
    return r!.no;
  }
  const once = (saat: number): string => new Date(Date.now() - saat * SAAT).toISOString();
  // Hareket ve bakiyesi aynı işlemde (hareket defteri tetiği işlem sonunda eşitliği denetler), servisin tek yazım yolundan.
  async function yaz(m: number, h: Hareket): Promise<number> {
    return o().vt.tx(async (db: Db) => {
      const fis = h.tur === 'cikis' ? 'cikis' : h.tur;
      const id = (await db.tek<{ id: number }>(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($9, pg_current_xact_id(), $7) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, kisi_id, geri_alinan_id, giris_kaynagi, cikis_nedeni,
                   kaynak_kalite_durumu, hedef_kalite_durumu)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $2 = 'giris' THEN 'mal_kabul' END, CASE WHEN $2 = 'cikis' THEN 'diger' END, $10, $11) RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f RETURNING hareket_id::int AS id`,
        [once(h.saatOnce), h.tur, m, h.kaynak ?? null, h.hedef ?? null, h.miktar, kisi, h.geriAlinan ?? null, fis, h.kalite?.[0] ?? null, h.kalite?.[1] ?? null],
      ))!.id;
      if (h.kaynak !== undefined) await bakiyeDegistir(db, { malzemeId: m, konumId: h.kaynak, partiId: null, kaliteDurumu: h.kalite?.[0] ?? 'serbest', fark: -binde(h.miktar) });
      if (h.hedef !== undefined) {
        await bakiyeDegistir(db, { malzemeId: m, konumId: h.hedef, partiId: null, kaliteDurumu: h.kalite?.[1] ?? 'serbest', fark: binde(h.miktar), ilkGiris: once(h.saatOnce) });
      }
      return id;
    });
  }
  const gelis = async (m: number, konum: number, kalite: Kalite = 'serbest'): Promise<string | null> =>
    (await o().sahip.tek<{ g: string | null }>('SELECT konuma_gelis::text AS g FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND kalite_durumu = $3', [m, konum, kalite]))?.g ?? null;
  const yakin = (gercek: string | null | undefined, saatOnce: number, mesaj: string): void => {
    assert.ok(gercek, mesaj);
    assert.ok(Math.abs(Date.parse(gercek) - Date.parse(once(saatOnce))) < 60_000, `${mesaj}: ${gercek} != ${once(saatOnce)}`);
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_konum_malzeme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    kisi = (await ortam.vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    kabul = (await ortam.vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    raf = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'D-KMZ1', 'depo_zemini', 'Deneme zemini') RETURNING id",
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: girişsiz 401, stok işlemi olmayan 403, depo 200', async () => {
    assert.equal((await iste(null, '/stok/konum-malzemeleri')).durum, 401);
    assert.equal((await iste('operator', '/stok/konum-malzemeleri')).durum, 403);
    assert.equal((await iste('depo', '/stok/konum-malzemeleri')).durum, 200);
  });

  test('taşınan malzemede geliş taşıma anıdır; depoya ilk giriş taşınır, değişmez', async () => {
    const m = await kart();
    await yaz(m, { tur: 'giris', hedef: kabul, miktar: '10', saatOnce: 240 });
    await yaz(m, { tur: 'transfer', kaynak: kabul, hedef: raf, miktar: '10', saatOnce: 2 });
    const c = await iste('depo', `/stok/konumlar/${raf}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const b = konumAyrintiCevabi.parse(c.govde).bakiyeler.find((x) => x.malzemeId === m);
    yakin(b?.konumaGelis, 2, 'konuma geliş taşıma anı');
  });

  test('parça parça gelen stok: eldeki miktarı karşılayan en eski geliş; çıkışta ilerler; yerinde kalite değişimi gelişi değiştirmez', async () => {
    const m = await kart();
    await yaz(m, { tur: 'giris', hedef: raf, miktar: '4', saatOnce: 100 });
    await yaz(m, { tur: 'giris', hedef: raf, miktar: '3', saatOnce: 50 });
    await yaz(m, { tur: 'giris', hedef: raf, miktar: '2', saatOnce: 10 });
    yakin(await gelis(m, raf), 100, '9 birimin en eskisi 100 saat önce geldi');
    await yaz(m, { tur: 'cikis', kaynak: raf, miktar: '4', saatOnce: 5 });
    yakin(await gelis(m, raf), 50, 'ilk giren çıktı; kalan 5 birimin en eskisi 50 saat önce');
    await yaz(m, { tur: 'transfer', kaynak: raf, hedef: raf, miktar: '5', saatOnce: 1, kalite: ['serbest', 'karar_bekliyor'] });
    yakin(await gelis(m, raf, 'karar_bekliyor'), 50, 'kalite değişimi yerinde; geliş 50 saat önce kalır');
  });

  test('geri alınan giriş geliş sayılmaz', async () => {
    const m = await kart();
    await yaz(m, { tur: 'giris', hedef: raf, miktar: '5', saatOnce: 100 });
    const yanlis = await yaz(m, { tur: 'giris', hedef: raf, miktar: '9', saatOnce: 1 });
    await yaz(m, { tur: 'geri_alma', kaynak: raf, miktar: '9', saatOnce: 1, geriAlinan: yanlis });
    yakin(await gelis(m, raf), 100, 'geri alınan 9 sayılmaz');
  });

  test('liste: en uzun bekleyen önce, gelişi bilinmeyen sonda; tür süzgeci', async () => {
    const eski = await kart();
    const yeni = await kart();
    const bilinmeyen = await kart();
    await yaz(eski, { tur: 'giris', hedef: kabul, miktar: '1', saatOnce: 500 });
    await yaz(yeni, { tur: 'giris', hedef: kabul, miktar: '1', saatOnce: 1 });
    await yaz(bilinmeyen, { tur: 'giris', hedef: kabul, miktar: '1', saatOnce: 3 });
    // Göçten önce hareketsiz yazılmış eski satır gibi: geliş bilinmez.
    await o().sahip.sorgu('UPDATE stok_bakiye SET konuma_gelis = NULL WHERE malzeme_id = $1', [bilinmeyen]);
    const c = await iste('depo', '/stok/konum-malzemeleri?tur=kabul&sayfaBoyu=200');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const satirlar = konumMalzemeleriCevabi.parse(c.govde).satirlar;
    assert.deepEqual(satirlar.map((x) => x.malzemeId).filter((x) => [eski, yeni, bilinmeyen].includes(x)), [eski, yeni, bilinmeyen]);
    assert.equal(satirlar.find((x) => x.malzemeId === bilinmeyen)?.konumaGelis, null, 'uydurulmaz');
    assert.ok(satirlar.every((x) => x.konumTur === 'kabul'));
  });
});

// Göç, dolu tabloyu hareketten doldurur: göçten önceki şemaya satır yazılır, sonra yalnız bu göç uygulanır. Veriler uydurmadır.
describe('stok_bakiye.konuma_gelis göçü eski satırları doldurur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('stkgelis');
    klasor = await mkdtemp(join(tmpdir(), 'konuma-gelis-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('taşınan satır taşınma zamanını, parça parça girenler eldekini karşılayan girişi alır; hareketsiz satır boş kalır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    assert.ok(hepsi.includes(GOC), 'göç bulunamadı');
    for (const ad of hepsi.filter((a) => a < GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'stkgelis', parola: PAROLA }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KG-', 0)");
    const kart = async (n: number): Promise<number> => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'KG-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`kg-${n}`, n, JSON.stringify({ id: `kg-${n}`, com: { ad: `Deneme ${n}` } }), kisi]))!.no;
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('KG', 'Deneme depo') RETURNING id"))!.id;
    const konum = async (kod: string): Promise<number> => (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, $2, 'depo_zemini', 'Deneme zemin') RETURNING id", [depo, kod]))!.id;
    const once = (saat: number): string => new Date(Date.now() - saat * SAAT).toISOString();
    // Hareket, fişi ve bakiyesi tek komutta (tek işlem) yazılır: konu yalnız göçün doldurmasıdır.
    const yaz = async (m: number, tur: 'giris' | 'transfer', kaynak: number | null, hedef: number, miktar: number, saatOnce: number): Promise<void> => {
      await sahip.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($2, pg_current_xact_id(), $7) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $2 = 'giris' THEN 'mal_kabul' END) RETURNING id),
           s AS (INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f),
           c AS (UPDATE stok_bakiye SET miktar = miktar - $6 WHERE malzeme_id = $3 AND konum_id = $4 AND miktar <> $6),
           d AS (DELETE FROM stok_bakiye WHERE malzeme_id = $3 AND konum_id = $4 AND miktar = $6)
         INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($3, $5, $6, $1)
         ON CONFLICT ON CONSTRAINT stok_bakiye_tek DO UPDATE SET miktar = stok_bakiye.miktar + EXCLUDED.miktar`,
        [once(saatOnce), tur, m, kaynak, hedef, miktar, kisi]);
    };
    const k1 = await konum('KG-01');
    const k2 = await konum('KG-02');
    const tasinan = await kart(1);
    const parcali = await kart(2);
    const hareketsiz = await kart(3);
    await yaz(tasinan, 'giris', null, k1, 3, 240);
    await yaz(tasinan, 'transfer', k1, k2, 3, 48);
    await yaz(parcali, 'giris', null, k1, 2, 120);
    await yaz(parcali, 'giris', null, k1, 2, 24);
    await sahip.sorgu('UPDATE stok_bakiye SET miktar = 3 WHERE malzeme_id = $1', [parcali]);
    await sahip.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, 1, $3)', [hareketsiz, k1, once(500)]);

    await copyFile(join(GOC_KLASORU, GOC), join(klasor, GOC));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [GOC]);
    const gelis = async (m: number): Promise<string | null> =>
      (await sahip.tek<{ g: string | null }>('SELECT konuma_gelis::text AS g FROM stok_bakiye WHERE malzeme_id = $1', [m]))!.g;
    const yakin = (gercek: string | null, saatOnce: number, mesaj: string): void => {
      assert.ok(gercek, mesaj);
      assert.ok(Math.abs(Date.parse(gercek) - Date.parse(once(saatOnce))) < 60_000, `${mesaj}: ${gercek}`);
    };
    yakin(await gelis(tasinan), 48, 'taşınan satır depoya girişi değil taşınmayı alır');
    yakin(await gelis(parcali), 120, 'eldeki 3 birimi karşılayan en eski giriş');
    assert.equal(await gelis(hareketsiz), null, 'hareketi olmayan satıra zaman uydurulmaz');
  });
});
