import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

// 1968 a: sipariş teslimi, satır miktarı ve tedarik termini (göç 20261103090700) ortak defter işlevine bağlıdır; değişiklik akışı
// (1962) okur. Logo eşitleme sütunları deftere girmez.
describe('satın alma teslim ve termin değişiklik defteri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let malzeme = 0;
  const talep = randomUUID();
  const teklif = randomUUID();
  const kalem = randomUUID();

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
    ortam = await testVeritabaniKur('satin_alma_defter');
    yonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Defter Yazan', kullaniciAdi: 'satin-alma-defter', parola: 'dogru-parola-1' }));
    const s = o().sahip;
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme tedarik', 'tedarikci', $1) RETURNING id", [yonetici]))!.id;
    await s.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, 1, 'Deneme talep', $2, $2, 'siparis_verildi')", [talep, yonetici]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar) VALUES ($1, $2, 1, 'Deneme kalem', 1)", [talep, kalem]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-01-01', 'TRY')", [talep, teklif, firma]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-01-01')", [talep, teklif]);
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SD-', 0)");
    malzeme = (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sd-1', 'hammadde', 'SD-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'sd-1', com: { ad: 'Deneme hammadde' } }), yonetici]))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('sipariş açılışı ve beklenen teslim değişikliği yazan kişiyle düşer; yalnız Logo durumu değişirse satır yazılmaz', async () => {
    await kisiyle((db) => db.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, beklenen_teslim) VALUES ($1, $2, 'SP-D-1', 'L-1', '2026-11-06')", [talep, teklif]));
    await kisiyle((db) => db.sorgu("UPDATE satin_alma_siparis SET beklenen_teslim = '2026-11-10' WHERE talep_id = $1", [talep]));
    await kisiyle((db) => db.sorgu("UPDATE satin_alma_siparis SET logo_gonderim_durumu = 'hata', logo_hata = 'Deneme', logo_gonderim_zamani = now() WHERE talep_id = $1", [talep]));
    const d = await defter('satin_alma_siparis');
    assert.deepEqual(d.map((x) => [x.islem, x.kisi_id]), [['ekle', yonetici], ['guncelle', yonetici]]);
    assert.deepEqual(d[0]?.anahtar, { talep_id: talep, teklif_id: teklif });
    assert.deepEqual(d[1]?.alanlar, { beklenen_teslim: { eski: '2026-11-06', yeni: '2026-11-10' } });
    for (const x of d) assert.ok(!Object.keys(x.alanlar).some((a) => a.startsWith('logo_')));
  });

  test('sipariş satırının miktarı değişir ve satır silinir; Logo satır başvurusu girmez', async () => {
    const satir = await kisiyle(async (db) => (await db.tek<{ id: number }>(
      "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 5, 'adet') RETURNING id", [talep, teklif, kalem]))!.id);
    await kisiyle((db) => db.sorgu("UPDATE satin_alma_siparis_satiri SET miktar = 8, logo_satir_ref = 'Deneme-1' WHERE id = $1", [satir]));
    await kisiyle((db) => db.sorgu("UPDATE satin_alma_siparis_satiri SET logo_satir_ref = 'Deneme-2' WHERE id = $1", [satir]));
    await kisiyle((db) => db.sorgu('DELETE FROM satin_alma_siparis_satiri WHERE id = $1', [satir]));
    const d = await defter('satin_alma_siparis_satiri');
    assert.deepEqual(d.map((x) => x.islem), ['ekle', 'guncelle', 'sil']);
    assert.deepEqual(d[1]?.alanlar, { miktar: { eski: 5, yeni: 8 } });
    for (const x of d) assert.ok(!Object.keys(x.alanlar).some((a) => a.startsWith('logo_')));
  });

  test('tedarik termini girilir ve değişir; kişi ve zaman sütunu deftere girmez', async () => {
    await kisiyle((db) => db.sorgu("INSERT INTO satin_alma_tedarik_termini (malzeme_no, termin, kisi_id) VALUES ($1, '2026-11-12', $2)", [malzeme, yonetici]));
    await kisiyle((db) => db.sorgu("UPDATE satin_alma_tedarik_termini SET termin = '2026-11-20', guncelleme = now() + interval '1 minute', surum = surum + 1 WHERE malzeme_no = $1", [malzeme]));
    const d = await defter('satin_alma_tedarik_termini');
    assert.deepEqual(d.map((x) => [x.islem, x.kisi_id, x.anahtar]), [['ekle', yonetici, { malzeme_no: malzeme }], ['guncelle', yonetici, { malzeme_no: malzeme }]]);
    assert.deepEqual(d[1]?.alanlar, { termin: { eski: '2026-11-12', yeni: '2026-11-20' } });
    for (const alan of ['kisi_id', 'guncelleme', 'surum']) assert.ok(!(alan in (d[0]?.alanlar ?? {})), alan);
  });
});
