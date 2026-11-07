import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { hataliAdimToplamlari, hataliKayitlari } from '../uretim-emirleri/disari.ts';

// 2216 İP-1: Arkon paket listesi adımların hatalı toplamını emir başına liste okumasıyla değil toplu okumayla alır. Toplu sonuç liste
// okumasından kurulan toplamla aynıdır (kendi emrinin kaydı sayılır, hedef emir olarak gelen kayıt sayılmaz, sınıra ulaşan emir bilinmez)
// ve sorgu sayısı emir sayısıyla büyümez. Veriler uydurmadır.
describe('arkon paket listesi hatalı toplamı toplu okunur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const emir = new Map<string, number>();
  const adim = new Map<string, number>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('arkon_paket_sorgu');
    const s = o().sahip;
    const kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Paket Deneme', kullaniciAdi: 'paket-sorgu', parola: 'dogru-parola-1' }));
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PS-', 0)");
    const kart = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ps-1', 'mamul', 'PS-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ps-1', com: { ad: 'Deneme' } }), kisi]))!.no;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('PS-T', 'Deneme', 'TAL') RETURNING id"))!.id;
    const neden = (await s.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('PS-H', 'Deneme', 1) RETURNING id"))!.id;
    for (const ad of ['a', 'b', 'c', 'kayitsiz']) {
      const id = (await s.tek<{ id: number }>(
        "INSERT INTO uretim_emri (emir_no, parca_no, parca_ad, adet, malzeme_no, acan_id) VALUES ($1, 'P', 'Parca', 10, $2, $3) RETURNING id",
        [`PS-${ad}`, kart, kisi]))!.id;
      emir.set(ad, id);
      for (const op of [10, 20]) {
        adim.set(`${ad}${String(op)}`, (await s.tek<{ id: number }>(
          "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, 'Adim') RETURNING id",
          [id, op / 10, op, tip]))!.id);
      }
    }
    // Her kaydın kendi kalite adımı vardır (kalite adımı kayıt başına tektir); adım hedef emirde açılır.
    let sira = 100;
    const kayit = async (e: string, a: string, hedef: string, adet: number, sayi = 1): Promise<void> => {
      await s.sorgu(
        `WITH k AS (
           INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad)
           SELECT $3, $8 + g, $8 + g, $9, 'Kalite' FROM generate_series(1, $7) g RETURNING id)
         INSERT INTO uretim_emirleri_hatali_kaydi (uretim_emri_id, is_emri_id, hedef_emir_id, kalite_is_emri_id, hurda_nedeni_id, adet, kisi_id)
         SELECT $1, $2, $3, k.id, $4, $5, $6 FROM k`,
        [emir.get(e), adim.get(a), emir.get(hedef), neden, adet, kisi, sayi, sira, tip]);
      sira += sayi;
    };
    await kayit('a', 'a10', 'a', 2);
    await kayit('a', 'a10', 'a', 3);
    await kayit('a', 'a20', 'b', 1);
    await kayit('b', 'b20', 'b', 4);
    // c sınıra ulaşır: hedefi c olan 499 kayıt b'den, 1 kayıt c'nin kendisinden.
    await kayit('b', 'b10', 'c', 1, 499);
    await kayit('c', 'c10', 'c', 7);
  });
  after(async () => { await ortam?.kaldir(); });

  const listedenToplam = async (db: Db, emirId: number): Promise<Map<number, number> | undefined> => {
    const kayitlar = await hataliKayitlari(db, { acik: false, emirId });
    if (kayitlar.length >= 500) return undefined;
    const t = new Map<number, number>();
    for (const k of kayitlar) if (k.uretimEmri.id === emirId) t.set(k.isEmri.id, (t.get(k.isEmri.id) ?? 0) + k.adet);
    return t;
  };

  test('toplu toplam liste okumasından kurulanla aynıdır', async () => {
    await o().vt.okumaTx(async (db) => {
      const idler = [...emir.values()];
      const toplu = await hataliAdimToplamlari(db, idler);
      for (const [ad, id] of emir) assert.deepEqual(toplu.get(id), await listedenToplam(db, id), ad);
      assert.equal(toplu.get(emir.get('c')!), undefined, 'sınıra ulaşan emir bilinmez');
      assert.deepEqual(toplu.get(emir.get('kayitsiz')!), new Map(), 'kaydı olmayan emirde toplam sıfırdır');
      assert.deepEqual(toplu.get(emir.get('a')!), new Map([[adim.get('a10')!, 5], [adim.get('a20')!, 1]]));
    });
  });

  test('sorgu sayısı emir sayısıyla büyümez', async () => {
    const say = async (idler: number[]): Promise<number> => o().vt.okumaTx(async (db) => {
      let n = 0;
      const d: Db = { sorgu: (q, p) => { n += 1; return db.sorgu(q, p); }, tek: (q, p) => { n += 1; return db.tek(q, p); } };
      await hataliAdimToplamlari(d, idler);
      return n;
    });
    assert.equal(await say([emir.get('a')!]), await say([...emir.values()]));
  });
});
