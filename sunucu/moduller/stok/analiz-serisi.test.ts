import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { tuketimSerisi } from './disari.ts';

// 2151: Satın alma analizinin okuduğu aylık tüketim serisi. Veriler uydurmadır.
describe('stok aylık tüketim serisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let konum = 0;
  const kartlar: number[] = [];
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  // Hareket doğrudan tablo sahibiyle, fişiyle yazılır: seri yalnız hareket satırlarını okur, bakiye tutarlılığı bu testin konusu değildir.
  async function fisli(fisTuru: string, hareketSql: string, degerler: unknown[]): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('${fisTuru}', pg_current_xact_id(), ${'$'}${degerler.length + 1}) RETURNING id),
         h AS (${hareketSql} RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f RETURNING hareket_id::int AS id`, [...degerler, kisi]))!.id;
  }
  const hareket = (kart: number, zaman: string, tur: 'giris' | 'cikis', miktar: string, neden: string | null = null): Promise<number> => {
    const giris = tur === 'giris';
    return fisli(tur,
      `INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, kisi_id, onayli_eksi, eksi_onay_kaynagi)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [zaman, tur, kart, giris ? null : konum, giris ? konum : null, miktar, giris ? 'mal_kabul' : null, neden, kisi, !giris, giris ? null : 'kisi']);
  };
  const geriAl = (kart: number, zaman: string, hareketId: number, miktar: string): Promise<number> => fisli('geri_alma',
    `INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, geri_alinan_id, kisi_id) VALUES ($1, 'geri_alma', $2, $3, $4, $5, $6)`,
    [zaman, kart, konum, miktar, hareketId, kisi]);

  before(async () => {
    ortam = await testVeritabaniKur('stok_analiz_serisi');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Seri Yazan', kullaniciAdi: 'analiz-serisi', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AS-', 0)");
    for (const sira of [1, 2, 3]) {
      kartlar.push((await sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'sarf', 'AS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
        [`as-${sira}`, sira, JSON.stringify({ id: `as-${sira}`, com: { ad: `Deneme sarf ${sira}` } }), kisi]))!.no);
    }
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('AS', 'Deneme depo') RETURNING id"))!.id;
    konum = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'AS-01', 'depo_zemini', 'Deneme zemin') RETURNING id", [depo]))!.id;

    const [a, b] = kartlar as [number, number, number];
    await hareket(a, '2026-01-05T08:00:00Z', 'giris', '100');
    await hareket(a, '2026-01-10T08:00:00Z', 'cikis', '10', 'numune');
    await hareket(a, '2026-01-20T08:00:00Z', 'cikis', '2', 'fire');
    // Tesis saatiyle şubat başı (UTC'de hâlâ ocak): şubata sayılır.
    await hareket(a, '2026-01-31T22:30:00Z', 'cikis', '4', 'sevk');
    const geriAlinan = await hareket(a, '2026-03-03T08:00:00Z', 'cikis', '6', 'diger');
    // Nisanda yapılan geri alma, geri aldığı mart çıkışından düşer; mart sıfırlanır ve dönmez.
    await geriAl(a, '2026-04-02T08:00:00Z', geriAlinan, '6');
    // Tedarikçiye iade tüketim değildir.
    await hareket(a, '2026-04-10T08:00:00Z', 'cikis', '30', 'tedarikci_iade');
    await hareket(b, '2026-02-01T08:00:00Z', 'giris', '5');
  });
  after(async () => { await ortam?.kaldir(); });

  test('ay başına net tüketim: iade sayılmaz, geri alma asıl çıkışın ayından düşer, ay tesis saatiyle', async () => {
    const [a] = kartlar as [number, number, number];
    const s = await tuketimSerisi(o().vt, { basAy: '2026-01', bitAy: '2026-06', malzemeIdler: [a] });
    assert.deepEqual(s.aylar.map((x) => [x.ay, Number(x.miktar)]), [['2026-01', 12], ['2026-02', 4]]);
    assert.equal(s.tarihler.length, 1);
    assert.equal(new Date(s.tarihler[0]!.ilkHareket).toISOString(), '2026-01-05T08:00:00.000Z');
    // Geri alınan mart çıkışı son tüketim sayılmaz; iade de değildir.
    assert.equal(new Date(s.tarihler[0]!.sonTuketim!).toISOString(), '2026-01-31T22:30:00.000Z');
  });

  test('tüketimi olmayan kart: ay satırı yok, ilk hareket var, son tüketim null; hiç hareketi olmayan kart dönmez', async () => {
    const [, b, c] = kartlar as [number, number, number];
    const s = await tuketimSerisi(o().vt, { basAy: '2026-01', bitAy: '2026-12', malzemeIdler: [b, c] });
    assert.deepEqual(s.aylar, []);
    assert.deepEqual(s.tarihler.map((t) => [t.malzemeId, t.sonTuketim]), [[b, null]]);
  });

  test('aralık dışındaki ay gelmez; boş liste sorgu yapmaz; hatalı ve 60 aydan uzun aralık reddedilir', async () => {
    const [a] = kartlar as [number, number, number];
    assert.deepEqual((await tuketimSerisi(o().vt, { basAy: '2026-02', bitAy: '2026-02', malzemeIdler: [a] })).aylar.map((x) => x.ay), ['2026-02']);
    assert.deepEqual(await tuketimSerisi(o().vt, { basAy: '2026-01', bitAy: '2026-02', malzemeIdler: [] }), { aylar: [], tarihler: [] });
    await assert.rejects(tuketimSerisi(o().vt, { basAy: '2026-13', bitAy: '2026-12' }), RangeError);
    await assert.rejects(tuketimSerisi(o().vt, { basAy: '2026-05', bitAy: '2026-04' }), RangeError);
    await assert.rejects(tuketimSerisi(o().vt, { basAy: '2021-01', bitAy: '2026-01' }), RangeError);
    assert.equal((await tuketimSerisi(o().vt, { basAy: '2022-01', bitAy: '2026-12' })).aylar.length, 2);
  });
});
