import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

interface Defter {
  islem: string;
  anahtar: Record<string, unknown>;
  alanlar: Record<string, { eski: unknown; yeni: unknown }>;
  kisi_id: number | null;
}

// 1968 a: vardiya tabloları (göç 20261103090400) ortak defter işlevine bağlıdır; ekleme de girer, çünkü yeni tatil ya da
// fazla mesai planın takvimini değiştirir. Sözleşme denetim modülündedir.
describe('vardiya takvimi değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let merkez = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Yazma ucu kişiyi transaction başında bu değişkene yazar; test aynı yolu uygulama kullanıcısıyla izler.
  const kisiyle = <T>(is: (db: Db) => Promise<T>): Promise<T> =>
    o().vt.tx(async (db) => {
      await db.sorgu("SELECT set_config('tmiv2.kisi_id', $1, true)", [String(yonetici)]);
      return is(db);
    });

  const defter = (tablo: string): Promise<Defter[]> =>
    o().sahip.sorgu<Defter>('SELECT islem, anahtar, alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = $1 ORDER BY id', [tablo]);

  before(async () => {
    ortam = await testVeritabaniKur('vardiya_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'vardiya-defter', parola: 'dogru-parola-1' }));
    merkez = (await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('VDM', 'Deneme') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('vardiya ve molası eklenir, saati değişir, silinir: ekleme, değişiklik ve silme yazan kişiyle düşer; sürüm deftere girmez', async () => {
    const vardiya = await kisiyle(async (db) =>
      (await db.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Gündüz', '08:00', '16:00') RETURNING id"))!.id);
    await kisiyle((db) => db.sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '12:00', '12:30')", [vardiya]));
    await kisiyle((db) => db.sorgu("UPDATE vardiya SET bitis = '17:00', surum = surum + 1 WHERE id = $1", [vardiya]));
    await kisiyle((db) => db.sorgu('DELETE FROM vardiya_molasi WHERE vardiya_id = $1', [vardiya]));

    const v = await defter('vardiya');
    assert.deepEqual(v.map((d) => [d.islem, d.kisi_id]), [['ekle', yonetici], ['guncelle', yonetici]]);
    assert.deepEqual(v[1]?.alanlar, { bitis: { eski: '16:00:00', yeni: '17:00:00' } });
    assert.ok(!('surum' in (v[0]?.alanlar ?? {})));
    assert.deepEqual((await defter('vardiya_molasi')).map((d) => d.islem), ['ekle', 'sil']);
  });

  test('tatil günü eklenmesi ve kaldırılması tarih anahtarıyla düşer', async () => {
    await kisiyle((db) => db.sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2026-11-05', 'tatil', 'Deneme tatili')"));
    await kisiyle((db) => db.sorgu("DELETE FROM vardiya_takvim_gunu WHERE tarih = '2026-11-05'"));
    const t = await defter('vardiya_takvim_gunu');
    assert.deepEqual(t.map((d) => [d.islem, d.anahtar]), [['ekle', { tarih: '2026-11-05' }], ['sil', { tarih: '2026-11-05' }]]);
    assert.deepEqual(t[0]?.alanlar.tur, { eski: null, yeni: 'tatil' });
  });

  test('hafta düzeni ve kişi vardiyası bileşik ya da kişi anahtarıyla düşer', async () => {
    const vardiya = (await o().sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Gece', '00:00', '08:00') RETURNING id"))!.id;
    await kisiyle((db) => db.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, 1, $2)', [merkez, vardiya]));
    await kisiyle((db) => db.sorgu('INSERT INTO vardiya_kisi (kisi_id, vardiya_id) VALUES ($1, $2)', [yonetici, vardiya]));
    assert.deepEqual((await defter('vardiya_matrisi')).map((d) => d.anahtar), [{ is_merkezi_id: merkez, gun: 1, vardiya_id: vardiya }]);
    assert.deepEqual((await defter('vardiya_kisi')).map((d) => d.anahtar), [{ kisi_id: yonetici }]);
  });

  test('planlı duruş ve fazla mesai yazanı ve yazılma zamanı deftere girmez; kişi oturumdandır', async () => {
    const durus = await kisiyle(async (db) => (await db.tek<{ id: number }>(
      `INSERT INTO vardiya_planli_durus (baslik, kapsam, is_merkezi_id, baslangic, bitis, yazan_id)
       VALUES ('Bakım', 'is-merkezi', $1, '2026-11-06T08:00:00Z', '2026-11-06T10:00:00Z', $2) RETURNING id`, [merkez, yonetici]))!.id);
    await kisiyle((db) => db.sorgu('UPDATE vardiya_planli_durus SET aktif = false, surum = surum + 1 WHERE id = $1', [durus]));
    const mesai = await kisiyle(async (db) => (await db.tek<{ id: number }>(
      `INSERT INTO vardiya_fazla_mesai (tarih, baslangic, bitis, kapsam, is_merkezi_id, yazan_id)
       VALUES ('2026-11-07', '17:00', '20:00', 'is-merkezi', $1, $2) RETURNING id`, [merkez, yonetici]))!.id);
    await kisiyle((db) => db.sorgu('INSERT INTO vardiya_fazla_mesai_kisi (fazla_mesai_id, kisi_id) VALUES ($1, $2)', [mesai, yonetici]));

    const d = await defter('vardiya_planli_durus');
    assert.deepEqual(d.map((x) => x.islem), ['ekle', 'guncelle']);
    for (const x of d) for (const alan of ['yazan_id', 'yazildi', 'surum']) assert.ok(!(alan in x.alanlar), alan);
    assert.deepEqual(d[1]?.alanlar, { aktif: { eski: true, yeni: false } });
    const m = await defter('vardiya_fazla_mesai');
    assert.equal(m.length, 1);
    assert.ok(!('yazan_id' in (m[0]?.alanlar ?? {})));
    assert.deepEqual((await defter('vardiya_fazla_mesai_kisi')).map((x) => x.anahtar), [{ fazla_mesai_id: mesai, kisi_id: yonetici }]);
  });

  test('uygulama kullanıcısı defter satırını değiştiremez', async () => {
    await assert.rejects(o().vt.sorgu("UPDATE denetim_degisiklik SET kisi_id = NULL WHERE tablo = 'vardiya'"));
    await assert.rejects(o().vt.sorgu("DELETE FROM denetim_degisiklik WHERE tablo = 'vardiya'"));
  });
});
