import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { aktifMakineler, istasyonKapasitesi, istasyondakiMakineler, kapasiteKaynaklari, makineler } from './disari.ts';

// Plan bağlamı istasyon başına makine, Arkon anomali istasyon başına kapasite okuyordu (yük testi 2026-10-18): toplu okumalar tekil
// okumalarla aynı cevabı tek sorguda verir.
describe('istasyonlar toplu okumalar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const ist: Record<'makineli' | 'insanli' | 'bos' | 'pasif', number> = { makineli: 0, insanli: 0, bos: 0, pasif: 0 };

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const kimlik = async (sql: string, p: unknown[]): Promise<number> => (await vt().tek<{ id: number }>(sql, p))!.id;

  async function sayarak<T>(is: (db: Db) => Promise<T>): Promise<{ sonuc: T; sorgu: number }> {
    let sorgu = 0;
    const sonuc = await vt().tx((db) => is({
      sorgu: (sql, p) => { sorgu += 1; return db.sorgu(sql, p); },
      tek: (sql, p) => { sorgu += 1; return db.tek(sql, p); },
    }));
    return { sonuc, sorgu };
  }

  before(async () => {
    ortam = await testVeritabaniKur('ist_toplu');
    const im = await kimlik("INSERT INTO is_merkezi (kod, ad) VALUES ('TO-IM', 'Merkez') RETURNING id", []);
    const istasyon = (kod: string, kaynak: string | null, aktif = true) =>
      kimlik('INSERT INTO istasyon (kod, ad, is_merkezi_id, kapasite_kaynagi, aktif) VALUES ($1, $1, $2, $3, $4) RETURNING id', [kod, im, kaynak, aktif]);
    ist.makineli = await istasyon('TO-S1', 'makine');
    ist.insanli = await istasyon('TO-S2', 'insan');
    ist.bos = await istasyon('TO-S3', null);
    ist.pasif = await istasyon('TO-S4', 'insan', false);
    const makine = (kod: string, istasyonId: number | null, aktif = true) =>
      kimlik('INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ($1, $1, $2, $3) RETURNING id', [kod, istasyonId, aktif]);
    await makine('TO-M2', ist.makineli);
    await makine('TO-M1', ist.makineli);
    await makine('TO-M3', ist.makineli, false);
    await makine('TO-M4', ist.insanli);
    await makine('TO-M5', null);
    await makine('TO-M6', ist.pasif, false);
  });
  after(async () => { await ortam?.kaldir(); });

  test('makineler: istasyon başına okumanın birleşimi ve istasyonsuz makineler, koda göre; pasifsiz hâli aktifMakineler; tek sorgu', async () => {
    for (const pasiflerDahil of [false, true]) {
      const { sonuc, sorgu } = await sayarak((db) => makineler(db, { pasiflerDahil }));
      assert.equal(sorgu, 1);
      const tekil = await vt().tx(async (db) => {
        const hepsi = [];
        for (const id of Object.values(ist)) hepsi.push(...(await istasyondakiMakineler(db, id, { pasiflerDahil })));
        return hepsi;
      });
      assert.deepEqual(sonuc.filter((m) => m.istasyonId !== null).sort((a, b) => a.id - b.id), tekil.sort((a, b) => a.id - b.id));
      assert.deepEqual(sonuc.map((m) => m.kod), [...sonuc.map((m) => m.kod)].sort(), 'koda göre');
      assert.ok(sonuc.some((m) => m.kod === 'TO-M5' && m.istasyonId === null), 'istasyonsuz makine gelir');
      assert.equal(sonuc.some((m) => m.kod === 'TO-M3'), pasiflerDahil);
    }
    assert.deepEqual(await vt().tx((db) => makineler(db, { pasiflerDahil: false })), await vt().tx((db) => aktifMakineler(db)));
  });

  test('kapasiteKaynaklari: istasyonKapasitesi kaynağıyla aynı; girilmemişse makine, pasif de gelir, olmayan yok; tek sorgu, boşta sorgu yok', async () => {
    const olmayan = 2147483647;
    const idler = [...Object.values(ist), ist.insanli, olmayan];
    const { sonuc, sorgu } = await sayarak((db) => kapasiteKaynaklari(db, idler));
    assert.equal(sorgu, 1);
    const tekil = new Map<number, string>();
    await vt().tx(async (db) => {
      for (const id of new Set(idler)) {
        const k = await istasyonKapasitesi(db, id);
        if (k !== null) tekil.set(id, k.kaynak);
      }
    });
    assert.deepEqual(sonuc, tekil);
    assert.deepEqual(Object.fromEntries(sonuc), {
      [ist.makineli]: 'makine', [ist.insanli]: 'insan', [ist.bos]: 'makine', [ist.pasif]: 'insan',
    });
    assert.deepEqual(await sayarak((db) => kapasiteKaynaklari(db, [])), { sonuc: new Map(), sorgu: 0 });
  });
});
