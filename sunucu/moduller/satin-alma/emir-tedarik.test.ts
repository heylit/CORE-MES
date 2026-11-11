import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { emirTedarikDurumlari } from './disari.ts';
import { tedarikAsamasi } from './kurallar.ts';

// 2893 D2: Adım Durumu'nun okuduğu tedarik aşaması.
describe('satin-alma emir tedarik aşaması (2893 D2)', () => {
  const k = (talepDurumu: string, miktar: string | null, teslim = '0', kapali = false) => tedarikAsamasi({ talepDurumu, miktar, teslim, kapali });
  test('siparişsiz kalem talep aşamasındadır; teslim alınan ya da iptal talep beklenmez', () => {
    for (const d of ['taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda']) assert.equal(k(d, null), 'talep', d);
    assert.equal(k('teslim_alindi', null), null);
    assert.equal(k('iptal', null), null);
    assert.equal(k('siparis_verildi', null), null, 'sipariş verilmiş talepte siparişsiz kalem beklenmez');
  });
  test('sipariş satırı açıksa sipariş beklenir; tamamı gelen ya da kapatılan beklenmez', () => {
    assert.equal(k('siparis_verildi', '10', '0'), 'siparis');
    assert.equal(k('siparis_verildi', '10', '4.5'), 'siparis', 'kısmi teslim');
    assert.equal(k('siparis_verildi', '10', '10'), null);
    assert.equal(k('siparis_verildi', '10', '12'), null, 'fazla teslim');
    assert.equal(k('siparis_verildi', '10', '0', true), null, 'kapatılan sipariş');
  });
});

describe('satin-alma emir tedarik okuması (2893 D2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  after(async () => { await ortam?.kaldir(); });

  test('emre bağlı ve fason iş emrine bağlı açık kalemler gelir; iptal, birleşmiş kaynak, teslim alınan ve başka emir gelmez; fiyat dönmez', async () => {
    ortam = await testVeritabaniKur('satin_alma_emir_tedarik');
    const s = ortam.sahip;
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ETM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('ETI', 'Deneme istasyon', $1) RETURNING id", [im]))!.id;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('ET-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ET-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number) => (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ET-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`et-dnm-${sira}`, sira, JSON.stringify({ id: `et-dnm-${sira}`, com: { ad: 'Deneme çubuk' } }), kisiId]))!.no;
    const [m1, m2] = [await kart(1), await kart(2)];
    const emir = async () => (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('P-ET', 'Deneme parça', 5, $1, $2, 'planli') RETURNING id", [ist, kisiId]))!.id;
    const [e1, e2] = [await emir(), await emir()];
    const ie = (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 20, $2, 'Deneme fason') RETURNING id", [e1, tip]))!.id;
    let sira = 0;
    const talep = async (durum: string, o: { emir?: number | null; malzeme?: number | null; isEmri?: number | null; siparis?: { no: string; teslim: string } }) => {
      sira += 1;
      const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
      await s.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, iptal_nedeni, uretim_emri_id)
                     VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, $4, $5, $6)`, [t, 80000 + sira, kisiId, durum, durum === 'iptal' ? 'Deneme iptal' : '', o.emir ?? null]);
      let katalog: string | null = null;
      if (o.malzeme != null) {
        katalog = randomUUID();
        await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, o.malzeme]);
      }
      await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim, is_emri_id) VALUES ($1, $2, 1, 'Deneme kalem', $3, 10, 'adet', $4)",
        [t, kl, katalog, o.isEmri ?? null]);
      if (o.siparis) {
        await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
        await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
        await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, beklenen_teslim) VALUES ($1, $2, $3, $4)', [t, tk, o.siparis.no, o.siparis.teslim]);
        await s.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet')", [t, tk, kl]);
      }
      return (await s.tek<{ id: string; no: string }>('SELECT id, no FROM satin_alma_talep WHERE id = $1', [t]))!;
    };
    const acik = await talep('onayda', { emir: e1, malzeme: m1 });
    const sip = await talep('siparis_verildi', { emir: e1, malzeme: m2, siparis: { no: 'SP-2099-001', teslim: '2099-03-01' } });
    const fason = await talep('degerlendirme', { isEmri: ie });
    await talep('iptal', { emir: e1, malzeme: m1 });
    await talep('teslim_alindi', { emir: e1, malzeme: m1 });
    await talep('taslak', { emir: e2, malzeme: m1 });
    const kaynak = await talep('taslak', { emir: e1, malzeme: m1 });
    await s.sorgu('UPDATE satin_alma_talep SET birlesen_talep_id = $1 WHERE id = $2', [acik.id, kaynak.id]);

    const r = await ortam.vt.okumaTx((db) => emirTedarikDurumlari(db, [e1], [ie]));
    assert.deepEqual(r, [
      { uretimEmriId: e1, isEmriId: null, malzemeNo: m1, asama: 'talep', talepNo: acik.no, siparisNo: null, termin: null },
      { uretimEmriId: e1, isEmriId: null, malzemeNo: m2, asama: 'siparis', talepNo: sip.no, siparisNo: 'SP-2099-001', termin: '2099-03-01' },
      { uretimEmriId: null, isEmriId: ie, malzemeNo: null, asama: 'talep', talepNo: fason.no, siparisNo: null, termin: null },
    ]);
    assert.deepEqual(await ortam.vt.okumaTx((db) => emirTedarikDurumlari(db, [], [])), []);
  });
});
