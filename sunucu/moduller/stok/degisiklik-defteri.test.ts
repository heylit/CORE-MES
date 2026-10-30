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

// 1372 a: stok ayarı ve konum değişiklik defteri (göç 20261030169000); sözleşme denetim modülündedir.
describe('stok ayarı ve konum değişiklik defteri (göç 20261030169000) (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let kart = 0;
  let konum = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Yazma ucu kişiyi transaction başında bu değişkene yazar; test aynı yolu uygulama kullanıcısıyla izler.
  const kisiyle = (is: (db: Db) => Promise<unknown>): Promise<unknown> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });

  const defter = (tablo: string, anahtar: Record<string, unknown>): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>(
      'SELECT islem, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 AND anahtar = $2::jsonb ORDER BY id',
      [tablo, JSON.stringify(anahtar)],
    );

  before(async () => {
    ortam = await testVeritabaniKur('stok_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'stok-defter', parola: 'dogru-parola-1' }));
    const sahip = o().sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SD-', 0)");
    kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sd-1', 'hammadde', 'SD-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'sd-1', com: { ad: 'Deneme hammadde' } }), yonetici]))!.no;
    await sahip.sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id, kritik_seviye) VALUES ($1, 10)', [kart]);
    const depo = (await sahip.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('DD', 'Deneme depo') RETURNING id"))!.id;
    konum = (await sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'DD-01', 'kabul', 'Deneme kabul') RETURNING id", [depo]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kritik seviye değişimi eski, yeni değer ve yazan kişiyle düşer; yalnız sürüm değişirse satır yazılmaz', async () => {
    await kisiyle((db) => db.sorgu('UPDATE stok_malzeme_ayari SET kritik_seviye = 25, surum = surum + 1 WHERE malzeme_id = $1', [kart]));
    await kisiyle((db) => db.sorgu('UPDATE stok_malzeme_ayari SET surum = surum + 1 WHERE malzeme_id = $1', [kart]));
    const satirlar = await defter('stok_malzeme_ayari', { malzeme_id: kart });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id, Object.keys(s.alanlar)]), [['guncelle', yonetici, ['kritik_seviye']]]);
  });

  test('konum pasife alma düşer', async () => {
    await kisiyle((db) => db.sorgu('UPDATE stok_konum SET aktif = false WHERE id = $1', [konum]));
    const satirlar = await defter('stok_konum', { id: konum });
    assert.deepEqual(satirlar.map((s) => [s.islem, s.kisi_id]), [['guncelle', yonetici]]);
    assert.deepEqual(satirlar[0]?.alanlar.aktif, { eski: true, yeni: false });
  });
});
