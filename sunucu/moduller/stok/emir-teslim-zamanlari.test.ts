import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { isEmriTeslimleri } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Teslim alınmış durum hareket ister; kapanış zamanı ret ve iptalle aynı sütundan okunduğu için burada ret ve iptal yeter.
// Kart 764: üretim anomalisinin geç teslim ölçüsü emre ve iş emrine bağlı teslim ve istekleri zamanlarıyla okur.
describe('stok: emre bağlı teslim ve istek zamanları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  let kisi = 0;
  let malzeme = 0;
  let kabul = 0;
  let istasyonId = 0;
  let istasyonKonumu = 0;
  let emir = 0;
  let baskaEmir = 0;
  let isEmri = 0;
  let sira = 0;

  const teslim = async (g: { uretimEmriId: number | null; isEmriId: number | null; durum: 'yolda' | 'red' | 'iptal'; gonderim: string; kapanis?: string }): Promise<number> => {
    sira += 1;
    const r = await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, kaynak_konum_id, hedef_konum_id, uretim_emri_id, is_emri_id, durum,
         gonderen_kisi_id, kapatan_kisi_id, gonderim, kapanis, red_nedeni)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [`TS-ETZ-${sira}`, `etz-teslim-${sira}`, malzeme, kabul, istasyonKonumu, g.uretimEmriId, g.isEmriId, g.durum, kisi,
        g.durum === 'yolda' ? null : kisi, g.gonderim, g.kapanis ?? null, g.durum === 'red' ? 'Deneme ret' : null],
    );
    return r!.id;
  };
  const istek = async (g: { uretimEmriId: number | null; durum: 'acik' | 'iptal'; acilis: string; guncelleme: string }): Promise<number> => {
    sira += 1;
    const r = await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_malzeme_istegi (no, kaynak_kimligi, malzeme_id, miktar, istasyon_id, uretim_emri_id, durum, kisi_id, kapatan_kisi_id, acilis, guncelleme)
       VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [`MI-ETZ-${sira}`, `etz-istek-${sira}`, malzeme, istasyonId, g.uretimEmriId, g.durum, kisi, g.durum === 'iptal' ? kisi : null, g.acilis, g.guncelleme],
    );
    return r!.id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_emir_teslim');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ETZ-', 0) ON CONFLICT (onek) DO NOTHING");
    malzeme = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('etz-1', 'hammadde', 'ETZ-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'etz-1', com: { ad: 'Teslim zamanı deneme' } }), kisi]))!.no;
    kabul = (await ortam.vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ETZIM', 'Deneme merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('ETZIS', 'Deneme istasyon', $1, true) RETURNING id", [im!.id]))!.id;
    // İstasyon konumu stok servisinde istasyondan doğar; burada doğrudan açılır.
    istasyonKonumu = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, istasyon_id) SELECT depo_id, 'ETZ-IST', 'istasyon', $1 FROM stok_konum WHERE id = $2 RETURNING id",
      [istasyonId, kabul]))!.id;
    assert.equal(await ortam.vt.tx((db) => sorgular.istasyonKonumu(db, istasyonId)), istasyonKonumu);
    const ustEmir = async (parcaNo: string): Promise<number> => (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ($1, 'Deneme parça', 5, $2, $3, 'planli') RETURNING id",
      [parcaNo, istasyonId, kisi]))!.id;
    emir = await ustEmir('P-ETZ-1');
    baskaEmir = await ustEmir('P-ETZ-2');
    const tip = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    isEmri = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 1, 10, $2, 'OP10', $3) RETURNING id",
      [emir, tip, istasyonId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('boş girdi sorgusuz boş döner', async () => {
    assert.deepEqual(await o().vt.tx((db) => isEmriTeslimleri(db, {})), { teslimler: [], istekler: [] });
    assert.deepEqual(await o().vt.tx((db) => isEmriTeslimleri(db, { isEmriIdleri: [], uretimEmriIdleri: [] })), { teslimler: [], istekler: [] });
  });

  test('emre ve iş emrine bağlı teslimler zamanlarıyla gelir; başka emrin ve bağsız teslim gelmez; yolda teslimin kapanışı null', async () => {
    const kapali = await teslim({ uretimEmriId: emir, isEmriId: isEmri, durum: 'red', gonderim: '2026-10-27T05:00:00Z', kapanis: '2026-10-27T05:40:00Z' });
    const yolda = await teslim({ uretimEmriId: emir, isEmriId: null, durum: 'yolda', gonderim: '2026-10-27T06:00:00Z' });
    const ikinci = await teslim({ uretimEmriId: emir, isEmriId: isEmri, durum: 'iptal', gonderim: '2026-10-27T04:00:00Z', kapanis: '2026-10-27T04:10:00Z' });
    await teslim({ uretimEmriId: baskaEmir, isEmriId: null, durum: 'yolda', gonderim: '2026-10-27T06:30:00Z' });
    await teslim({ uretimEmriId: null, isEmriId: null, durum: 'yolda', gonderim: '2026-10-27T06:30:00Z' });

    const emirle = (await o().vt.tx((db) => isEmriTeslimleri(db, { uretimEmriIdleri: [emir] }))).teslimler;
    assert.deepEqual(emirle.map((t) => t.teslimId), [ikinci, kapali, yolda], 'gönderim sırasıyla, yalnız emrin teslimleri');
    const k = emirle[1]!;
    assert.equal(k.isEmriId, isEmri);
    assert.equal(k.uretimEmriId, emir);
    assert.equal(k.hedefIstasyonId, istasyonId, 'hedef konum istasyonun konumu');
    assert.equal(k.malzemeId, malzeme);
    assert.equal(k.durum, 'red');
    assert.equal(Date.parse(k.gonderim), Date.parse('2026-10-27T05:00:00Z'));
    assert.equal(Date.parse(k.kapanis!), Date.parse('2026-10-27T05:40:00Z'));
    assert.equal(emirle[2]!.kapanis, null, 'yoldaki teslim kapanmamış');

    // İş emri bağı emir bağı ister (stok_teslim_is_emri_emirli): iş emriyle aramada emrin iş emirsiz teslimi gelmez.
    const isEmriyle = (await o().vt.tx((db) => isEmriTeslimleri(db, { isEmriIdleri: [isEmri] }))).teslimler;
    assert.deepEqual(isEmriyle.map((t) => t.teslimId), [ikinci, kapali]);
    const ikisi = (await o().vt.tx((db) => isEmriTeslimleri(db, { isEmriIdleri: [isEmri, isEmri], uretimEmriIdleri: [emir, baskaEmir] }))).teslimler;
    assert.equal(ikisi.length, 4, 'iki bağla bulunan teslim bir kez gelir, başka emrin teslimi de gelir');
    assert.equal(new Set(ikisi.map((t) => t.teslimId)).size, 4);
  });

  test('istekler yalnız emirle bulunur; kapanmış isteğin kapanışı son güncellemesi, açık isteğinki null', async () => {
    const acik = await istek({ uretimEmriId: emir, durum: 'acik', acilis: '2026-10-27T03:00:00Z', guncelleme: '2026-10-27T03:05:00Z' });
    const iptal = await istek({ uretimEmriId: emir, durum: 'iptal', acilis: '2026-10-27T02:00:00Z', guncelleme: '2026-10-27T02:30:00Z' });
    await istek({ uretimEmriId: baskaEmir, durum: 'acik', acilis: '2026-10-27T01:00:00Z', guncelleme: '2026-10-27T01:00:00Z' });
    await istek({ uretimEmriId: null, durum: 'acik', acilis: '2026-10-27T01:00:00Z', guncelleme: '2026-10-27T01:00:00Z' });

    const { istekler } = await o().vt.tx((db) => isEmriTeslimleri(db, { uretimEmriIdleri: [emir] }));
    assert.deepEqual(istekler.map((i) => i.istekId), [iptal, acik], 'açılış sırasıyla, yalnız emrin istekleri');
    assert.equal(istekler[0]!.istasyonId, istasyonId);
    assert.equal(Date.parse(istekler[0]!.kapanis!), Date.parse('2026-10-27T02:30:00Z'));
    assert.equal(istekler[1]!.kapanis, null, 'açık istekte güncelleme kapanış sayılmaz');
    assert.deepEqual((await o().vt.tx((db) => isEmriTeslimleri(db, { isEmriIdleri: [isEmri] }))).istekler, [], 'istekte iş emri bağı yok');
  });
});
