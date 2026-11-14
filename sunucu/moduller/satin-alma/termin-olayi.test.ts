import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { terminDinle } from './disari.ts';
import { siparisKapat, tedarikTerminiKaydet } from './servis.ts';
import { talepGelisleriOku } from './sorgular.ts';
import { degisenMalzemeler } from './termin-olayi.ts';

// 3256-1: satın almanın plana giden gelişi değişince olay yayılır; plan canlı planı "eskidi" işaretler. Veriler uydurmadır.
describe('satin-alma termin olayı kuralı (3256-1)', () => {
  const g = (satirId: number, malzemeNo: number, tarih: string | null, miktar = '10') => ({ satirId, malzemeNo, tarih, miktar });
  test('günü ya da kalanı değişen, eklenen ve çıkan satırın malzemesi; aynı kalan ve biçim farkı sayılmaz', () => {
    assert.deepEqual(degisenMalzemeler([g(1, 7, '2099-03-01')], [g(1, 7, '2099-03-05')]), [7]);
    assert.deepEqual(degisenMalzemeler([g(1, 7, '2099-03-01')], [g(1, 7, '2099-03-01', '4')]), [7]);
    assert.deepEqual(degisenMalzemeler([], [g(2, 8, null)]), [8]);
    assert.deepEqual(degisenMalzemeler([g(2, 8, null), g(3, 9, '2099-01-01')], [g(3, 9, '2099-01-01')]), [8]);
    assert.deepEqual(degisenMalzemeler([g(1, 7, '2099-03-01', '10.0000')], [g(1, 7, '2099-03-01', '10')]), []);
    assert.deepEqual(degisenMalzemeler([], []), []);
  });
});

describe('satin-alma termin olayı (3256-1, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  after(async () => { await ortam?.kaldir(); });

  test('talebin açık gelişi okunur; sipariş kapatma ve tedarik termini (yalnız gün değişince) olay yayar', async () => {
    ortam = await testVeritabaniKur('satin_alma_termin_olayi');
    const s = ortam.sahip;
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TO-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number) => (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'TO-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`to-dnm-${String(sira)}`, sira, JSON.stringify({ id: `to-dnm-${String(sira)}`, com: { ad: 'Deneme çubuk' } }), kisiId]))!.no;
    const [m1, m2] = [await kart(1), await kart(2)];
    const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await s.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum)
                   VALUES ($1, 2099, 81001, 'Deneme talep', $2, $2, 'siparis_verildi')`, [t, kisiId]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, m1]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim) VALUES ($1, $2, 1, 'Deneme kalem', $3, 10, 'adet')", [t, kl, katalog]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu(`INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, beklenen_teslim, logo_kayit_no, logo_gonderim_durumu, logo_gonderim_zamani)
                   VALUES ($1, $2, 'SP-2099-TO1', '2099-03-01', '9001', 'gonderildi', now())`, [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet')", [t, tk, kl]);

    const once = await ortam.vt.okumaTx((db) => talepGelisleriOku(db, t));
    assert.deepEqual(once.map((x) => [x.malzemeNo, x.tarih, Number(x.miktar)]), [[m1, '2099-03-01', 10]]);
    await s.sorgu("UPDATE satin_alma_siparis SET beklenen_teslim = '2099-03-09' WHERE talep_id = $1", [t]);
    assert.deepEqual(degisenMalzemeler(once, await ortam.vt.okumaTx((db) => talepGelisleriOku(db, t))), [m1], 'termin değişti');

    const olaylar: number[][] = [];
    const birak = terminDinle(async (_db, o) => { olaylar.push(o.malzemeNolar); });
    try {
      const k = (await ortam.vt.okumaTx((db) => kullaniciYukle(db, kisiId)))!;
      await ortam.vt.tx((db) => siparisKapat(db, k, t, { teklifId: tk, gerekce: 'Deneme kapatma', surum: 1 }));
      assert.deepEqual(olaylar, [[m1]], 'kalanı kapatılan sipariş plandan çıkar');
      assert.deepEqual(await ortam.vt.okumaTx((db) => talepGelisleriOku(db, t)), []);

      olaylar.length = 0;
      const yeni = await ortam.vt.tx((db) => tedarikTerminiKaydet(db, k, { malzemeNo: m2, termin: '2099-04-01', aciklama: '', surum: null }));
      assert.deepEqual(olaylar, [[m2]], 'yeni termin');
      const aciklama = await ortam.vt.tx((db) => tedarikTerminiKaydet(db, k, { malzemeNo: m2, termin: '2099-04-01', aciklama: 'Deneme not', surum: yeni.termin.surum }));
      assert.deepEqual(olaylar, [[m2]], 'yalnız açıklama değişti: olay yok');
      await ortam.vt.tx((db) => tedarikTerminiKaydet(db, k, { malzemeNo: m2, termin: '2099-04-08', aciklama: 'Deneme not', surum: aciklama.termin.surum }));
      assert.deepEqual(olaylar, [[m2], [m2]], 'termin günü değişti');
    } finally {
      birak();
    }
  });
});
