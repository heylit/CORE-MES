import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

interface Defter {
  islem: string;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 1702 a: stok bakiyesi değişiklik defteri (göç 20261101200500). Veriler uydurmadır.
describe('stok bakiyesi değişiklik defteri (göç 20261101200500) (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let kart = 0;
  let konum = 0;
  let ikinciKonum = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });
  const defter = (anahtar: Record<string, unknown>): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      "SELECT islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = 'stok_bakiye' AND anahtar = $1::jsonb ORDER BY id",
      [JSON.stringify(anahtar)],
    );
  const bakiyeAc = async (konumId: number, miktar: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
    'INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, $3, now()) RETURNING id', [kart, konumId, miktar]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('stok_bakiye_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'bakiye-defter', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('BD-', 0)");
    kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('bd-1', 'sarf', 'BD-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'bd-1', com: { ad: 'Deneme sarf' } }), yonetici]))!.no;
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('BD', 'Deneme depo') RETURNING id"))!.id;
    konum = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'BD-01', 'kabul', 'Deneme kabul') RETURNING id", [depo]))!.id;
    ikinciKonum = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'BD-02', 'depo_zemini', 'Deneme zemin') RETURNING id", [depo]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('miktar değişimi eski, yeni değer ve yazan kişiyle düşer; aynı değerle güncelleme satır yazmaz; ekleme yazılmaz', async () => {
    const id = await bakiyeAc(konum, '10.000');
    assert.deepEqual(await defter({ id }), []);
    await kisiyle((db) => db.sorgu('UPDATE stok_bakiye SET miktar = 7.5 WHERE id = $1', [id]));
    await kisiyle((db) => db.sorgu('UPDATE stok_bakiye SET miktar = miktar WHERE id = $1', [id]));
    const satirlar = await defter({ id });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]), [['guncelle', yonetici, ['miktar']]]);
    assert.deepEqual(satirlar[0]?.alanlar.miktar, { eski: 10, yeni: 7.5 });
  });

  test('silinen bakiye satırı eski değerleriyle düşer', async () => {
    const id = await bakiyeAc(ikinciKonum, '3.000');
    await kisiyle((db) => db.sorgu('DELETE FROM stok_bakiye WHERE id = $1', [id]));
    const satirlar = await defter({ id });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id]), [['sil', yonetici]]);
    assert.deepEqual(satirlar[0]?.alanlar.miktar, { eski: 3, yeni: null });
  });
});
