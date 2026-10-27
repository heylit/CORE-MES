import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur, type TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { isEmriZamanlari } from './disari.ts';

// Kart 764 (üretim anomalisi) ve 782 (plan sapması): iş emrinin gerçek zamanları ve çalıştığı makineler tek okumayla gelir.
describe('uretim-emirleri: iş emri zamanları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  let kisi = 0;
  let istasyon = 0;
  let m1 = 0;
  let m2 = 0;
  let emir = 0;
  let tip = 0;

  const isEmri = async (g: { opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; baslama?: string; bitis?: string; akisli?: number }): Promise<number> =>
    (await o().sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id, durum, baslama, bitis, saglam_adet, bagimlilik, devir_adedi)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [emir, g.opNo, tip, `OP${g.opNo}`, istasyon, g.durum, g.baslama ?? null, g.bitis ?? null, g.durum === 'tamam' ? 5 : null,
        g.akisli === undefined ? 'bekleyen' : 'akisli', g.akisli ?? null]))!.id;
  const olay = (isEmriId: number | null, tur: 'ayar' | 'duraklat', zaman: string) => o().sahip.sorgu(
    'INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, zaman, is_emri_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [emir, kisi, istasyon, tur, zaman, isEmriId]);
  const kullanim = (isEmriId: number | null, makineId: number | null, baslama: string, bitis: string | null) => o().sahip.sorgu(
    `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [emir, isEmriId, istasyon, makineId, kisi, baslama, bitis, bitis === null ? null : kisi]);

  before(async () => {
    ortam = await testVeritabaniKur('ue_is_emri_zaman');
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('IEZIM', 'Deneme merkezi') RETURNING id");
    istasyon = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('IEZIS', 'Deneme istasyon', $1, true) RETURNING id", [im!.id]))!.id;
    m1 = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('IEZ-M1', 'Tezgah 1', $1) RETURNING id", [istasyon]))!.id;
    m2 = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('IEZ-M2', 'Tezgah 2', $1) RETURNING id", [istasyon]))!.id;
    emir = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, teslim) VALUES ('P-IEZ', 'Deneme parça', 5, $1, $2, 'planli', '2026-11-03') RETURNING id",
      [istasyon, kisi]))!.id;
    tip = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('boş girdi sorgusuz boş, olmayan kimlik haritada yok', async () => {
    assert.equal((await o().vt.tx((db) => isEmriZamanlari(db, []))).size, 0);
    assert.equal((await o().vt.tx((db) => isEmriZamanlari(db, [2147483000]))).size, 0);
  });

  test('biten iş: ilk ayar başı, başlama, bitiş, emrin teslimi ve makineler başlama sırasıyla; başka adımın olayı ve kullanımı karışmaz', async () => {
    const op10 = await isEmri({ opNo: 10, durum: 'tamam', baslama: '2026-10-27T06:30:00Z', bitis: '2026-10-27T09:00:00Z' });
    const op20 = await isEmri({ opNo: 20, durum: 'bekliyor', akisli: 3 });
    await olay(op10, 'ayar', '2026-10-27T06:10:00Z');
    await olay(op10, 'ayar', '2026-10-27T06:00:00Z');
    await olay(op10, 'duraklat', '2026-10-27T05:00:00Z');
    await olay(op20, 'ayar', '2026-10-27T05:30:00Z');
    // İş emri bağı boş eski olay ve kullanım hangi adımın olduğu bilinmediği için sayılmaz.
    await olay(null, 'ayar', '2026-10-27T05:45:00Z');
    await kullanim(op10, m2, '2026-10-27T07:30:00Z', '2026-10-27T09:00:00Z');
    await kullanim(op10, m1, '2026-10-27T06:30:00Z', '2026-10-27T07:30:00Z');
    await kullanim(null, m1, '2026-10-27T05:00:00Z', '2026-10-27T05:10:00Z');

    const z = await o().vt.tx((db) => isEmriZamanlari(db, [op10, op20, op10]));
    assert.equal(z.size, 2);
    const a = z.get(op10)!;
    assert.deepEqual([a.uretimEmriId, a.opNo, a.durum, a.bagimlilik, a.devirAdedi, a.emirTeslim], [emir, 10, 'tamam', 'bekleyen', null, '2026-11-03']);
    assert.equal(Date.parse(a.ayarBasi!), Date.parse('2026-10-27T06:00:00Z'), 'ilk ayar olayı; duraklatma ayar sayılmaz');
    assert.equal(Date.parse(a.baslama!), Date.parse('2026-10-27T06:30:00Z'));
    assert.equal(Date.parse(a.bitis!), Date.parse('2026-10-27T09:00:00Z'));
    assert.deepEqual(a.makineler.map((m) => [m.makineId, Date.parse(m.baslama), m.bitis === null ? null : Date.parse(m.bitis)]), [
      [m1, Date.parse('2026-10-27T06:30:00Z'), Date.parse('2026-10-27T07:30:00Z')],
      [m2, Date.parse('2026-10-27T07:30:00Z'), Date.parse('2026-10-27T09:00:00Z')],
    ]);

    const b = z.get(op20)!;
    assert.deepEqual([b.durum, b.baslama, b.bitis, b.bagimlilik, b.devirAdedi, b.makineler], ['bekliyor', null, null, 'akisli', 3, []]);
    assert.equal(Date.parse(b.ayarBasi!), Date.parse('2026-10-27T05:30:00Z'), 'başlamamış işte de ayar başı okunur');
  });

  test('çalışan iş: ayarı yoksa ayar başı null; açık kullanımın bitişi ve makinesiz kullanımın makinesi null; teslimsiz emirde teslim null', async () => {
    const op30 = await isEmri({ opNo: 30, durum: 'calisiyor', baslama: '2026-10-27T10:00:00Z' });
    await kullanim(op30, null, '2026-10-27T10:00:00Z', '2026-10-27T10:20:00Z');
    await kullanim(op30, m1, '2026-10-27T10:20:00Z', null);
    await o().sahip.sorgu('UPDATE uretim_emri SET teslim = NULL WHERE id = $1', [emir]);
    const c = (await o().vt.tx((db) => isEmriZamanlari(db, [op30]))).get(op30)!;
    assert.deepEqual([c.durum, c.ayarBasi, c.bitis, c.emirTeslim], ['calisiyor', null, null, null]);
    assert.deepEqual(c.makineler.map((m) => [m.makineId, m.bitis]), [[null, c.makineler[0]!.bitis], [m1, null]]);
    assert.equal(Date.parse(c.makineler[0]!.bitis!), Date.parse('2026-10-27T10:20:00Z'));
  });
});
