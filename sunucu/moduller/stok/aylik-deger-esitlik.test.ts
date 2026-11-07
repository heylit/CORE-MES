import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { aySonuMalzemeToplamlari } from './sorgular/malzeme/sorgular.ts';

// 2216 İP-5: ay sonu toplamı, tanımıyla (bugünkü bakiye eksi ay sonundan sonraki hareketlerin etkisi) satır satır karşılaştırılır.
// Ay sınırına denk gelen hareket, hurda konumuna taşıma ve istenen pencereden eski hareket dahil. Veriler uydurmadır.
describe('stok ay sonu malzeme toplamları tanımla aynıdır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  // Hareket tablo sahibiyle, fişiyle yazılır; bakiye de doğrudan yazılır: defter eşitliği bu testin konusu değildir.
  async function hareket(tur: 'giris' | 'cikis' | 'transfer', kart: number, zaman: string, miktar: number, kaynak: number | null, hedef: number | null): Promise<void> {
    await o().sahip.sorgu(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ($1, pg_current_xact_id(), $7) RETURNING id),
         h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, kisi_id, aciklama)
               VALUES ($2, $1, $3, $4, $5, $6, CASE WHEN $1 = 'giris' THEN 'mal_kabul' END, CASE WHEN $1 = 'cikis' THEN 'fire' END, $7, 'Deneme') RETURNING id)
       INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`,
      [tur, zaman, kart, kaynak, hedef, miktar, kisi]);
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_aylik_esitlik');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Ay Sonu', kullaniciAdi: 'ay-sonu-esitlik', parola: 'dogru-parola-1' }));
    const s = o().sahip;
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AE-', 0)");
    const kartlar: number[] = [];
    for (const sira of [1, 2, 3, 4]) {
      kartlar.push((await s.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'sarf', 'AE-', $2, 'aktif', $3, $4, $4) RETURNING no`,
        [`ae-${sira}`, sira, JSON.stringify({ id: `ae-${sira}`, com: { ad: `Deneme ${sira}` } }), kisi]))!.no);
    }
    const depo = (await s.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('AE', 'Deneme') RETURNING id"))!.id;
    const zemin = (await s.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'AE-01', 'depo_zemini', 'Zemin') RETURNING id", [depo]))!.id;
    const hurda = (await s.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'AE-H', 'hurda', 'Hurda') RETURNING id", [depo]))!.id;
    // Zamanlar bugünün ayına göre, tesis saatiyle: ay başı tam sınır, ay ortası ve 14 ay öncesi (pencere dışı).
    const an = async (ayGeri: number, gun: number, saat = 0): Promise<string> => (await o().vt.tek<{ z: string }>(
      "SELECT (date_trunc('month', now()) - make_interval(months => $1) + make_interval(days => $2, hours => $3))::text AS z", [ayGeri, gun, saat]))!.z;
    const [a, b, c, d] = kartlar as [number, number, number, number];
    for (let ay = 14; ay >= 0; ay -= 1) {
      await hareket('giris', a, await an(ay, 0), 10 + ay, null, zemin);
      if (ay % 2 === 0) await hareket('cikis', a, await an(ay, 9, 5), 3, zemin, null);
      if (ay % 3 === 0) await hareket('transfer', a, await an(ay, 14, 2), 2, zemin, hurda);
      if (ay % 4 === 1) await hareket('giris', b, await an(ay, 3, 8), 7, null, zemin);
    }
    await hareket('giris', c, await an(0, 0, 1), 4, null, zemin);
    // Bugün bakiyesi olmayan kart geçmiş ayda pozitif görünür: giriş iki ay önce, tamamı geçen ay çıktı.
    await hareket('giris', d, await an(2, 5), 6, null, zemin);
    await hareket('cikis', d, await an(1, 5), 6, zemin, null);
    for (const [kart, konum, miktar] of [[a, zemin, 120], [a, hurda, 10], [b, zemin, 28], [c, zemin, 4]] as const) {
      await s.sorgu("INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, $3, now())", [kart, konum, miktar]);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('her ay ve her pencere için tanımdaki toplam', async () => {
    const simdi = await o().vt.sorgu<{ m: number; h: boolean; t: string }>(
      "SELECT b.malzeme_id AS m, k.tur = 'hurda' AS h, sum(b.miktar)::text AS t FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id GROUP BY 1, 2");
    const etki = await o().vt.sorgu<{ z: string; m: number; h: boolean; d: string }>(
      `SELECT h.zaman::text AS z, h.malzeme_id AS m, k.tur = 'hurda' AS h, h.miktar::text AS d FROM stok_hareketi h JOIN stok_konum k ON k.id = h.hedef_konum_id
       UNION ALL SELECT h.zaman::text, h.malzeme_id, k.tur = 'hurda', (-h.miktar)::text FROM stok_hareketi h JOIN stok_konum k ON k.id = h.kaynak_konum_id`);
    for (const pencere of [1, 3, 12]) {
      const satirlar = await aySonuMalzemeToplamlari(o().vt, pencere);
      const aylar = [...new Set(satirlar.map((x) => x.ay))];
      assert.equal(aylar.length, pencere, `pencere ${pencere}`);
      for (const ay of aylar) {
        const buAy = satirlar.filter((x) => x.ay === ay);
        const son = buAy[0]!.son;
        const anahtarlar = new Map([...etki.map((e) => [`${e.m}|${e.h}`, { m: e.m, h: e.h }] as const), ...simdi.map((x) => [`${x.m}|${x.h}`, { m: x.m, h: x.h }] as const)]);
        const beklenen = [...anahtarlar.values()].flatMap((x) => {
          const sonra = son === null ? 0 : etki.filter((e) => e.m === x.m && e.h === x.h && Date.parse(e.z) >= Date.parse(son)).reduce((t, e) => t + Number(e.d), 0);
          const toplam = Number(simdi.find((y) => y.m === x.m && y.h === x.h)?.t ?? 0) - sonra;
          return toplam > 0 ? [[x.m, x.h, toplam]] : [];
        }).sort((p, q) => (p[0] as number) - (q[0] as number) || Number(p[1]) - Number(q[1]));
        const gelen = buAy.filter((x) => x.malzemeId !== null).map((x) => [x.malzemeId, x.hurda, Number(x.toplam)]);
        assert.deepEqual(gelen, beklenen, `pencere ${pencere}, ay ${ay}`);
      }
    }
  });
});
