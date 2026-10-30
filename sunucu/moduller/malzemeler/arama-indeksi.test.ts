import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemeAra } from './servis.ts';

// İndeks ifadeleri sorgudaki ifadelerle birebir aynı değilse planlayıcı indeksi sessizce bırakır ve arama tam taramaya döner.
// Arama sorguları gerçek yoldan (malzemeAra) yakalanır ve aynı parametrelerle EXPLAIN edilir. Küçük tabloda planlayıcı
// sıralı taramayı ya da başka indeksi seçer; bu yüzden katalog sentetik satırlarla doldurulur. VACUUM, GIN'in bekleyen listesini
// indekse yazar: liste doluyken planlayıcı indeksi pahalı sayar ve sıralı taramayı seçer.
const SATIR = 20_000;
const INDEKSLER = ['stok_kodu', 'ad', 'eski_kod', 'tkod'].map((s) => `malzemeler_malzeme_katalog_karti_${s}_trgm`);
describe('malzemeler arama indeksi (kart #1244, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzemeindeks');
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme İndeks', kullaniciAdi: 'ix-yonetici', parola: 'dogru-parola-1' }));
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-IX-', $1)", [SATIR]);
    await vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       SELECT 'ix' || i, 'hammadde', 'HM-IX-', i, 'aktif',
              jsonb_build_object('com', jsonb_build_object('ad', 'Deneme çubuk ' || i, 'eskiKod', 'E-' || i, 'tkod', 'T-' || i)), $1, $1
         FROM generate_series(1, $2::int) AS i`, [kisi, SATIR]);
    await ortam.sahip.sorgu('VACUUM ANALYZE malzeme_katalog_karti');
  });
  after(async () => { await ortam?.kaldir(); });

  async function planlar(metin: string): Promise<string[]> {
    const yakalanan: { sql: string; p: readonly unknown[] }[] = [];
    const kaydeden: Db = {
      sorgu: async (sql, p = []) => { yakalanan.push({ sql, p }); return []; },
      tek: async (sql, p = []) => { yakalanan.push({ sql, p }); return null; },
    };
    await malzemeAra(kaydeden, { metin, sayfa: 1 });
    assert.equal(yakalanan.length, 2);
    return vt().tx(async (db) => {
      const sonuc: string[] = [];
      for (const { sql, p } of yakalanan) {
        const satirlar = await db.sorgu<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, p);
        sonuc.push(satirlar.map((s) => s['QUERY PLAN']).join('\n'));
      }
      return sonuc;
    });
  }

  test('kodda ya da adda geçen metin araması (liste ve sayım) dört trigram indeksini kullanır', async () => {
    for (const plan of await planlar('çubuk 1234')) {
      for (const ad of INDEKSLER) assert.ok(plan.includes(ad), `${ad}\n${plan}`);
      assert.doesNotMatch(plan, /Seq Scan on malzeme_katalog_karti/, plan);
    }
  });

  test('seçici rakamlı arama kart no ile birlikte yine indekse düşer', async () => {
    for (const plan of await planlar('987654')) {
      for (const ad of INDEKSLER) assert.ok(plan.includes(ad), `${ad}\n${plan}`);
      assert.match(plan, /malzeme_katalog_karti_no_tek/, plan);
      assert.doesNotMatch(plan, /Seq Scan on malzeme_katalog_karti/, plan);
    }
  });
});
