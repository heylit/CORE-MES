import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { malzemelerinAcikEmirleri } from './disari.ts';

describe('uretim-emirleri malzemelerin açık emirleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => { ortam = await testVeritabaniKur('ue_etki'); });
  after(async () => { await ortam?.kaldir(); });

  test('taslak, planlı ve başlamış emir gelir; bitmiş ve iptal gelmez; başlama ve fasonda kalan adet işaretlenir', async () => {
    const { sahip, vt } = o();
    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'ee-kisi', kullaniciAdi: 'ee-kisi', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EE-', 0)");
    const kart = async (sira: number): Promise<number> => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'EE-', $2, 'aktif', $3, $4, $4) RETURNING no`, [`ee-${sira}`, sira, JSON.stringify({ id: `ee-${sira}`, com: { ad: 'Deneme mamul' } }), kisi]))!.no;
    const a = await kart(1);
    const b = await kart(2);
    const tip = (await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('EE-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const firma = (await sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [kisi]))!.id;
    const emir = async (malzeme: number, durum: 'taslak' | 'planli' | 'basladi' | 'bitti' | 'iptal', baslangic: string | null): Promise<number> => {
      const id = (await sahip.tek<{ id: number }>(
        "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no, baslangic) VALUES ('P-EE', 'Deneme', 4, $1, $2, $3) RETURNING id",
        [kisi, malzeme, baslangic]))!.id;
      const ek = { taslak: '', planli: null, basladi: null, bitti: ', baslama = now(), bitis = now(), saglam_adet = 4', iptal: ', iptal = now()' }[durum];
      if (ek !== null) await sahip.sorgu(`UPDATE uretim_emri SET durum = $2${ek} WHERE id = $1`, [id, durum]);
      return id;
    };
    const isEmri = async (emirId: number, sira: number, fason: boolean): Promise<number> => (await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id)
       VALUES ($1, $2, $2 * 10, $3, 'Adım', $4) RETURNING id`, [emirId, sira, tip, fason ? firma : null]))!.id;

    const taslak = await emir(a, 'taslak', null);
    const planli = await emir(a, 'planli', '2026-12-10');
    const adimiBaslamis = await emir(a, 'planli', null);
    await sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now() WHERE id = $1", [await isEmri(adimiBaslamis, 1, false)]);
    const fasonda = await emir(a, 'planli', null);
    const gidenIs = await isEmri(fasonda, 1, true);
    const donen = await emir(a, 'planli', null);
    const donenIs = await isEmri(donen, 1, true);
    const hareket = (isEmriId: number, yon: 'gidis' | 'donus', adet: number, hurda: number | null) => sahip.sorgu(
      'INSERT INTO uretim_emirleri_fason_hareketi (is_emri_id, yon, adet, hurda_adet, kisi_id) VALUES ($1, $2, $3, $4, $5)', [isEmriId, yon, adet, hurda, kisi]);
    await hareket(gidenIs, 'gidis', 4, null);
    await hareket(gidenIs, 'donus', 2, 1);
    await hareket(donenIs, 'gidis', 4, null);
    await hareket(donenIs, 'donus', 3, 1);
    await emir(a, 'bitti', null);
    await emir(a, 'iptal', null);
    const baska = await emir(b, 'planli', null);

    const sonuc = await vt.tx((db) => malzemelerinAcikEmirleri(db, [a, a]));
    assert.deepEqual(sonuc.map((e) => [e.id, e.durum, e.baslangic, e.basladi, e.fasonda]), [
      [taslak, 'taslak', null, false, false],
      [planli, 'planli', '2026-12-10', false, false],
      [adimiBaslamis, 'planli', null, true, false],
      [fasonda, 'planli', null, false, true],
      [donen, 'planli', null, false, false],
    ]);
    assert.ok(sonuc.every((e) => e.malzemeNo === a && e.emirNo.length > 0));
    assert.deepEqual((await vt.tx((db) => malzemelerinAcikEmirleri(db, [b]))).map((e) => e.id), [baska]);
    assert.deepEqual(await vt.tx((db) => malzemelerinAcikEmirleri(db, [])), []);
  });
});
