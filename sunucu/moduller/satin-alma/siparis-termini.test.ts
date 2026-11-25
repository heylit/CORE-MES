import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { emirTedarikDurumlari, malzemeGelisTarihleri } from './disari.ts';
import { kalemSiparisTerminleri } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3711: siparişin teslim günü iki yerde durur (satırın kendi tarihi, siparişin başlık tarihi). Satır başına okuyan her okuma aynı geçerli günü görür:
// satırın tarihi, yoksa başlığınki. "Siparişi değiştir" yalnız satırı yazar; başlığı okuyan sorgu eski günü gösterirdi.
describe('satin-alma sipariş termini tek kaynak (3711, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  after(async () => { await ortam?.kaldir(); });

  test('satır tarihi başlığın önüne geçer; plan, emir tedariki, termin takibi, karne, pano ve takvim aynı günü okur', async () => {
    ortam = await testVeritabaniKur('satin_alma_siparis_termini');
    const o = ortam.sahip;
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const im = (await o.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('STM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await o.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('STI', 'Deneme istasyon', $1) RETURNING id", [im]))!.id;
    await o.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ST-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number) => (await o.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ST-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`st-dnm-${sira}`, sira, JSON.stringify({ id: `st-dnm-${sira}`, com: { ad: 'Deneme çubuk' } }), kisiId]))!.no;
    const [m1, m2] = [await kart(1), await kart(2)];
    const emir = (await o.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('P-ST', 'Deneme parça', 5, $1, $2, 'planli') RETURNING id", [ist, kisiId]))!.id;
    const ted = (await o.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, aktif, olusturan_id) VALUES ('Deneme Tedarik', 'tedarikci', true, $1) RETURNING id", [kisiId]))!.id;
    await o.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [ted]);

    const [t, k1, k2, tk] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await o.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, iptal_nedeni, uretim_emri_id)
                   VALUES ($1, 2099, 90001, 'Deneme talep', $2, $2, 'siparis_verildi', '', $3)`, [t, kisiId, emir]);
    const kalem = async (id: string, sira: number, malzeme: number) => {
      const katalog = randomUUID();
      await o.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, malzeme]);
      await o.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim) VALUES ($1, $2, $3, 'Deneme kalem', $4, 10, 'adet')", [t, id, sira, katalog]);
    };
    await kalem(k1, 1, m1);
    await kalem(k2, 2, m2);
    await o.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, para_birimi, teklif_tarihi, termin_gun) VALUES ($1, $2, $3, 'TRY', current_date, 7)", [t, tk, ted]);
    await o.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    // Başlık geçmişte (gecikmiş görünür); K1'in satırı ileri bir güne alınmış ("Siparişi değiştir"), K2'nin satırında kendi tarihi yok.
    await o.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, beklenen_teslim) VALUES ($1, $2, 'SP-2099-900', '2020-01-10')", [t, tk]);
    await o.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim, beklenen_teslim) VALUES ($1, $2, $3, 10, 'adet', '2099-03-20')", [t, tk, k1]);
    await o.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet')", [t, tk, k2]);
    const satirlar = await o.sorgu<{ id: number; kalem_id: string }>('SELECT id, kalem_id FROM satin_alma_siparis_satiri WHERE talep_id = $1', [t]);
    const satirK1 = satirlar.find((x) => x.kalem_id === k1)!.id;

    // Plan (malzeme gelişi) ve emir tedariki: satır günü.
    const gelis = await ortam.vt.okumaTx((db) => malzemeGelisTarihleri(db, [m1, m2]));
    assert.equal(gelis.get(m1)![0]!.tarih, '2099-03-20');
    assert.equal(gelis.get(m2)![0]!.tarih, '2020-01-10', 'satırın tarihi yoksa başlığın günü');
    const tedarik = await ortam.vt.okumaTx((db) => emirTedarikDurumlari(db, [emir], []));
    assert.deepEqual(tedarik.map((x) => [x.malzemeNo, x.termin]).sort(), [[m1, '2099-03-20'], [m2, '2020-01-10']].sort());
    // Termin takibi.
    const takip = await ortam.vt.okumaTx((db) => s.terminKalemleriOku(db));
    assert.deepEqual(takip.filter((x) => x.kaynak === 'siparis').map((x) => [x.kalemId === k1 ? 'k1' : 'k2', x.beklenenTeslim]).sort(), [['k1', '2099-03-20'], ['k2', '2020-01-10']]);
    // Tedarikçi karnesi ilk söz verilen güne göre ölçülür (Risk, öneriyle): değişiklik yokken geçerli gün; "Siparişi değiştir" kaydı varsa
    // ilk değişikliğin "önce" değeri (boşsa başlığın günü); reddedilen ve geri alınan kayıt sayılmaz.
    const karne = () => ortam!.vt.okumaTx((db) => s.karneTeslimBilgisi(db, satirK1));
    assert.equal((await karne())!.termin, '2099-03-20');
    const degisiklik = (no: number | null, sonuc: string, once: string | null, sonra: string, gecikme: number) => o.sorgu(
      `INSERT INTO satin_alma_siparis_degisikligi (id, talep_id, teklif_id, degisiklik_no, sonuc, ozet, gerekce, yapan_kisi_id, olusturma)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'ORN', $7, now() + make_interval(secs => $8))`,
      [randomUUID(), t, tk, no, sonuc, JSON.stringify([{ alan: 'termin', kalemId: k1, kalemAdi: 'x', once, sonra, onayaDusurur: false }]), kisiId, gecikme]);
    await degisiklik(null, 'reddedildi', '2019-01-01', '2020-01-01', 1);
    assert.equal((await karne())!.termin, '2099-03-20', 'reddedilen kayıt ilk söz sayılmaz');
    await degisiklik(1, 'onaysiz', null, '2099-03-20', 2);
    assert.equal((await karne())!.termin, '2020-01-10', 'satırın kendi tarihi yoktu: ilk söz başlığın günü');
    await degisiklik(2, 'onaysiz', '2099-03-20', '2099-05-01', 3);
    assert.equal((await karne())!.termin, '2020-01-10', 'sonraki değişiklik ilk sözü değiştirmez');
    // Pano: açık satırlardan biri (K2) başlık gününde gecikmiş; sipariş gecikmiş sayılır. K2 de ileri güne alınınca gecikme kalkar.
    assert.equal((await ortam.vt.okumaTx((db) => s.panoSayilari(db))).gecikenTeslim, 1);
    await o.sorgu("UPDATE satin_alma_siparis_satiri SET beklenen_teslim = '2099-04-01' WHERE talep_id = $1 AND kalem_id = $2", [t, k2]);
    const pano = await ortam.vt.okumaTx((db) => s.panoSayilari(db));
    assert.equal(pano.gecikenTeslim, 0, 'başlık eski kalsa da iki satırın günü ileridir');
    // Takvim: sipariş açık satırların en erken gününde durur; başlığın eski gününde değil.
    assert.deepEqual(await ortam.vt.okumaTx((db) => s.takvimSiparisleri(db, '2020-01-01', '2020-01-31')), []);
    assert.deepEqual((await ortam.vt.okumaTx((db) => s.takvimSiparisleri(db, '2099-03-01', '2099-03-31'))).map((x) => [x.no, x.beklenenTeslim]), [['SP-2099-900', '2099-03-20']]);
    // Açık satır kalmayınca sipariş en geç satır gününde durur (en erkeninde değil).
    for (const x of satirlar) await o.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id, stok_miktar) VALUES ($1, $1 + 900000, 10, $2, 10)', [x.id, kisiId]);
    assert.deepEqual(await ortam.vt.okumaTx((db) => s.takvimSiparisleri(db, '2099-03-01', '2099-03-31')), []);
    assert.deepEqual((await ortam.vt.okumaTx((db) => s.takvimSiparisleri(db, '2099-04-01', '2099-04-30'))).map((x) => [x.no, x.beklenenTeslim]), [['SP-2099-900', '2099-04-01']]);
  });

  test('Taleplerim: kalemin sipariş termini satırın günüdür, yoksa başlığınki; bölünmüş kalemde en geç pay; siparişsiz kalem yok', () => {
    const sip = (satirlar: { kalemId: string; beklenenTeslim?: string | null }[], beklenenTeslim: string | null) => ({ beklenenTeslim, satirlar });
    const m = kalemSiparisTerminleri([
      { karar: { siparisler: [sip([{ kalemId: 'a', beklenenTeslim: '2026-12-20' }, { kalemId: 'b' }], '2026-12-05'), sip([{ kalemId: 'b', beklenenTeslim: '2026-12-09' }], '2026-12-01')] } },
      { karar: null },
    ] as never);
    assert.deepEqual([...m], [['a', { gun: '2026-12-20', pay: 1 }], ['b', { gun: '2026-12-09', pay: 2 }]]);
  });
});
