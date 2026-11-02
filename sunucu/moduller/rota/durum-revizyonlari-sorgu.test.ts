import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { durumRevizyonlari } from './servis.ts';

// 1859: planlama çalışması her açılışta bütün revizyonları okur; içerik revizyon başına okununca istek başına binden çok sorgu çıkıyordu.
// Sorgu sayısı revizyon sayısından bağımsız olmalı, çıktı ürün başına okumayla aynı kalmalı. Veriler uydurmadır.
describe('rota - durum revizyonları toplu okunur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let tip = 0;
  let sira = 0;
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).'); return ortam.vt; };

  // Taslak revizyon, verilen OP'lerle (boş liste: adımsız revizyon). İçerik yalnız taslakta yazılabilir; kurulum doğrudan yazar.
  const rotaAc = async (oplar: number[]): Promise<number> => {
    sira += 1;
    const kart = (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'DRS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`drs-${String(sira)}`, sira, JSON.stringify({ id: `drs-${String(sira)}`, com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const rev = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [kart, kisi]))!.id;
    for (const [i, op] of oplar.entries()) {
      await ortam!.sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3)', [kart, op, rev]);
      await ortam!.sahip.sorgu(
        `INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad, ayar_suresi_dk, birim_sure_dk)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`, [rev, kart, op, i + 1, tip, `Adım ${String(op)}`, i + 1]);
    }
    return kart;
  };

  const sorguSay = <T>(f: (db: Db) => Promise<T>): Promise<[T, number]> => vt().tx(async (db) => {
    let n = 0;
    const sayan = new Proxy(db, {
      get: (h, ad, al) => {
        const d = Reflect.get(h, ad, al) as unknown;
        if (typeof d !== 'function') return d;
        return (...x: unknown[]) => { if (ad === 'sorgu' || ad === 'tek') n += 1; return (d as (...y: unknown[]) => unknown).apply(h, x); };
      },
    });
    return [await f(sayan), n];
  });

  before(async () => {
    ortam = await testVeritabaniKur('rotadurumsorgu');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'drs-kisi', kullaniciAdi: 'drs-kisi', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DRS-', 0)");
    tip = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('DRS-T', 'Torna', 'TAL') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('sorgu sayısı revizyon sayısıyla büyümez; çıktı ürün başına okumayla aynıdır', async () => {
    const [bos, bosSorgu] = await sorguSay((db) => durumRevizyonlari(db));
    assert.deepEqual(bos, []);
    assert.equal(bosSorgu, 1, 'revizyon yokken içerik okunmaz');

    const ilk = await rotaAc([10, 20]);
    const [, tekli] = await sorguSay((db) => durumRevizyonlari(db));
    const urunler = [ilk, await rotaAc([10]), await rotaAc([]), await rotaAc([10, 20, 30]), await rotaAc([10, 20])];
    const [hepsi, coklu] = await sorguSay((db) => durumRevizyonlari(db));
    assert.equal(coklu, tekli, `1 revizyonda ${String(tekli)}, 5 revizyonda ${String(coklu)} sorgu`);

    assert.equal(hepsi.length, urunler.length);
    for (const urun of urunler) {
      assert.deepEqual(hepsi.filter((r) => r.malzemeId === urun), await vt().tx((db) => durumRevizyonlari(db, urun)), `ürün ${String(urun)}`);
    }
    assert.deepEqual(hepsi.map((r) => r.adimlar.map((a) => a.opNo)).sort((a, b) => a.length - b.length), [[], [10], [10, 20], [10, 20], [10, 20, 30]]);
  });
});
