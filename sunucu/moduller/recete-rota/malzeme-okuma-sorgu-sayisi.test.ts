import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { aktifMalzemelerSinirli, malzemeAra } from '../malzemeler/disari.ts';

// 2216 İP-10 G2: bağlı durumun aktif kart listesi sayfa sayfa değil tek okumayla gelir. Sonuç sayfalı okumayla aynıdır (aynı sıra, aynı
// kesilme), sorgu sayısı sınırla büyümez. Veriler uydurmadır.
describe('reçete-rota aktif kart listesi tek okuma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const sayan = (db: Db, sayac: { n: number }): Db => ({
    sorgu: (q, p) => { sayac.n += 1; return db.sorgu(q, p); },
    tek: (q, p) => { sayac.n += 1; return db.tek(q, p); },
  });
  // Eski yol: sayfa sayfa malzemeAra; kısa sayfa ya da toplama ulaşınca biter, sınırda kesilir.
  const sayfali = async (db: Db, boy: number, azami: number) => {
    const kartlar = [];
    for (let sayfa = 1; sayfa <= azami; sayfa += 1) {
      const s = await malzemeAra(db, { metin: null, yalnizAktif: true, sayfa, sayfaBoyu: boy });
      kartlar.push(...s.satirlar);
      if (s.satirlar.length < boy || (s.toplam !== null && kartlar.length >= s.toplam)) return { kartlar, kesildi: false };
    }
    return { kartlar, kesildi: true };
  };

  before(async () => {
    ortam = await testVeritabaniKur('rr_malzeme_okuma');
    const s = o().sahip;
    const kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Katalog Deneme', kullaniciAdi: 'katalog-okuma', parola: 'dogru-parola-1' }));
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MO-', 0)");
    // 23 aktif, 4 taslak kart; stok kodu sırası no sırasından farklı olsun diye sıra numaraları terstir.
    for (let i = 1; i <= 27; i += 1) {
      await s.sorgu(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'mamul', 'MO-', $2, $3, $4, $5, $5)`,
        [`mo-${String(i)}`, 100 - i, i % 7 === 0 ? 'taslak' : 'aktif', JSON.stringify({ id: `mo-${String(i)}`, com: { ad: `Deneme ${String(i)}` } }), kisi]);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('tek okuma sayfalı okumayla aynı kartları ve kesilmeyi verir; sorgu sayısı sınırla büyümez', async () => {
    await o().vt.okumaTx(async (db) => {
      for (const [boy, azami] of [[5, 2], [5, 4], [5, 5], [23, 1], [200, 10], [1, 23], [1, 22]] as const) {
        const sayac = { n: 0 };
        const tek = await aktifMalzemelerSinirli(sayan(db, sayac), boy * azami);
        assert.deepEqual(tek, await sayfali(db, boy, azami), `${String(boy)}x${String(azami)}`);
        assert.equal(sayac.n, 2);
      }
      const toplam = (await malzemeAra(db, { metin: null, yalnizAktif: true, sayfa: 1, sayfaBoyu: 1 })).toplam!;
      assert.ok(toplam >= 23);
      assert.deepEqual([(await aktifMalzemelerSinirli(db, toplam)).kesildi, (await aktifMalzemelerSinirli(db, toplam)).kartlar.length], [false, toplam], 'tam sınırda kesilmez');
      assert.deepEqual([(await aktifMalzemelerSinirli(db, toplam - 1)).kesildi, (await aktifMalzemelerSinirli(db, toplam - 1)).kartlar.length], [true, toplam - 1]);
    });
  });
});
