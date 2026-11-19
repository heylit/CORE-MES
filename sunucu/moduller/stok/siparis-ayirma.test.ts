import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { binde } from './kurallar.ts';
import { siparisAyirmalariniEsitle } from './disari.ts';
import { SIPARIS_AYIRMA_NEDENI, type SiparisAyirmaKalemi } from './servis/kontrol.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 3429-3 F2: satış siparişinin "Stoktan" kalemi için depoya ayırma isteği, gerçek PostgreSQL ile. Kartlar ORN- uydurma.
describe('stok: sipariş kaleminden ayırma isteği (3429-3 F2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let raf = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  async function kart(birim = 'adet'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ORN-TM-']);
    const kimlik = `orn-tm-${sira}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ORN-TM-', $2, 'aktif', $3, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [kimlik, sira, JSON.stringify({ id: kimlik, com: { ad: `ORN Mamul ${sira}`, birim } })],
    ))!.no;
  }
  async function giris(m: number, miktar: string): Promise<void> {
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, raf, miktar, kisi]);
      await bakiyeDegistir(db, { malzemeId: m, konumId: raf, partiId: null, kaliteDurumu: 'serbest', fark: binde(miktar) });
    });
  }
  const esitle = (siparisId: number, onayli: boolean, kalemler: SiparisAyirmaKalemi[]) =>
    o().vt.tx((db) => siparisAyirmalariniEsitle(db, kisi, { siparisId, siparisNo: `SS-ORN-${String(siparisId)}`, onayli, kalemler }));
  const istekler = (siparisId: number) => o().sahip.sorgu<{ satir: number; miktar: string; durum: string; neden: string | null; talep: string | null }>(
    `SELECT siparis_satiri_id AS satir, miktar::text AS miktar, durum, iptal_nedeni AS neden, talep_no AS talep
       FROM stok_ayirma_istegi WHERE kaynak = 'siparis' AND siparis_id = $1 ORDER BY id`, [siparisId]);
  const kalem = (id: number, malzemeNo: number, miktar: string, stoktan = true): SiparisAyirmaKalemi => ({ id, malzemeNo, ad: 'ORN kalem', miktar, birim: 'adet', stoktan });

  before(async () => {
    ortam = await testVeritabaniKur('stok_siparis_ayirma');
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    kisi = (await ortam.vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    raf = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-R1', 'depo_zemini', 'Deneme zemini') RETURNING id",
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('onayda stoktan kalem eldeki kadar istek açar; uret kalemi ve stoksuz kart açmaz; tekrar onay çiftlemez; ikinci sipariş kalanı alır', async () => {
    const m = await kart();
    const yok = await kart();
    await giris(m, '10');
    await esitle(1, true, [kalem(11, m, '4'), kalem(12, m, '3', false), kalem(13, yok, '2')]);
    assert.deepEqual(await istekler(1), [{ satir: 11, miktar: '4.0000', durum: 'bekliyor', neden: null, talep: 'SS-ORN-1' }]);
    await esitle(1, true, [kalem(11, m, '4'), kalem(12, m, '3', false), kalem(13, yok, '2')]);
    assert.equal((await istekler(1)).length, 1, 'aynı onay ikinci istek açmaz');
    // Açık istek 4'ü tutar: ikinci sipariş 10 isterse eldeki 6 kadar açılır.
    await esitle(2, true, [kalem(21, m, '10')]);
    assert.deepEqual((await istekler(2)).map((r) => r.miktar), ['6.0000']);
  });

  test('onay geri alınınca açık istek iptal olur; yeni sürümde miktar azalırsa bekleyen istek kalan kadar yeniden açılır, artarsa kalır; yol değişirse kapanır', async () => {
    const m = await kart();
    await giris(m, '20');
    await esitle(3, true, [kalem(31, m, '5'), kalem(32, m, '2')]);
    await esitle(3, true, [kalem(31, m, '7'), kalem(32, m, '2', false)]);
    assert.deepEqual((await istekler(3)).map((r) => [r.satir, r.miktar, r.durum, r.neden]), [
      [31, '5.0000', 'bekliyor', null], [32, '2.0000', 'iptal', SIPARIS_AYIRMA_NEDENI.yolDegisti],
    ], 'Risk D2: kısmi ya da artan kalemde istek iptal edilmez');
    await esitle(3, true, [kalem(31, m, '3')]);
    assert.deepEqual((await istekler(3)).filter((r) => r.satir === 31).map((r) => [r.miktar, r.durum, r.neden]), [
      ['5.0000', 'iptal', SIPARIS_AYIRMA_NEDENI.miktarDegisti], ['3.0000', 'bekliyor', null],
    ]);
    await esitle(3, false, [kalem(31, m, '3')]);
    assert.deepEqual((await istekler(3)).map((r) => [r.durum, r.neden]).at(-1), ['iptal', SIPARIS_AYIRMA_NEDENI.kapandi]);
    await esitle(3, true, [kalem(31, m, '3')]);
    assert.deepEqual((await istekler(3)).map((r) => [r.miktar, r.durum]).at(-1), ['3.0000', 'bekliyor'], 'yeniden onayda sistem iptali yeniden açılır');
  });

  test('Risk D1: teslim edilen düşülür, depo iptal ettiyse yeniden açılmaz', async () => {
    const m = await kart();
    await giris(m, '30');
    await esitle(5, true, [kalem(51, m, '4'), kalem(52, m, '2')]);
    await o().sahip.sorgu("UPDATE stok_ayirma_istegi SET durum = 'teslim', karar_kisi_id = $1, karar_zamani = now() WHERE siparis_satiri_id = 51", [kisi]);
    await o().sahip.sorgu("UPDATE stok_ayirma_istegi SET durum = 'iptal', iptal_nedeni = 'ORN depo vazgeçti', geri_eklendi = false, karar_kisi_id = $1, karar_zamani = now() WHERE siparis_satiri_id = 52", [kisi]);
    await esitle(5, true, [kalem(51, m, '4'), kalem(52, m, '2')]);
    assert.equal((await istekler(5)).length, 2, 'teslim edilen ve depoca iptal edilen kalemde yeni istek yok');
    await esitle(5, true, [kalem(51, m, '6'), kalem(52, m, '2')]);
    assert.deepEqual((await istekler(5)).map((r) => [r.satir, r.miktar, r.durum]).at(-1), [51, '2.0000', 'bekliyor'], 'artan miktarda yalnız teslim edilmeyen kalan');
  });

  test('depo ayırdıysa (ayrildi) miktar değişse de istek kalır; kısıt: sipariş kaynağında talep alanı olmaz, kalem başına tek açık istek', async () => {
    const m = await kart();
    await giris(m, '9');
    await esitle(4, true, [kalem(41, m, '3')]);
    await o().sahip.sorgu("UPDATE stok_ayirma_istegi SET durum = 'ayrildi', karar_kisi_id = $1, karar_zamani = now() WHERE siparis_id = 4", [kisi]);
    await esitle(4, true, [kalem(41, m, '5')]);
    assert.deepEqual((await istekler(4)).map((r) => [r.miktar, r.durum]), [['3.0000', 'ayrildi']]);
    const ekle = (alanlar: string, degerler: string) => o().sahip.sorgu(
      `INSERT INTO stok_ayirma_istegi (kaynak, ${alanlar}, talep_no, kalem_ad, malzeme_id, miktar, birim, kaynaklar, isteyen_kisi_id)
       VALUES ('siparis', ${degerler}, 'SS-ORN-4', 'ORN kalem', $1, 1, 'adet', '[{"malzemeNo":1}]', $2)`, [m, kisi]);
    await assert.rejects(ekle('talep_id, kalem_id, siparis_id, siparis_satiri_id', `gen_random_uuid(), gen_random_uuid(), 4, 42`), /stok_ayirma_istegi_kaynak_butun/);
    await assert.rejects(ekle('siparis_id, siparis_satiri_id', '4, 41'), /stok_ayirma_istegi_siparis_satiri_acik/);
  });
});
