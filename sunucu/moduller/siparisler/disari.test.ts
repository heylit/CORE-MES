import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { siparisListesiSorgusu, teklifListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import * as siparisler from './disari.ts';

// Portal ve başka modüller uç yerine disari'yi çağırır: aynı kurallar işler, kayıt aynı tablolara düşer, yetki çağıranın işidir.
describe('siparisler disari (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi: Kullanici;
  let firmaId = 0;
  let mamulNo = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_disari');
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yazan', kullaniciAdi: 'siparis-disari', parola: 'dogru-parola-1' }));
    kisi = { id, ad: 'Deneme Yazan', islemler: [] };
    firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'musteri', $1) RETURNING id", [id]))!.id;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SDS-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sds-dnm-1', 'mamul', 'SDS-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sds-dnm-1', com: { ad: 'Deneme mamul' } }), id],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('teklif disari ile talepten siparişe döner; sipariş listede, satır özetinde ve onayda görünür', async () => {
    const sonuc = await o().vt.tx(async (db) => {
      let t = await siparisler.teklifEkle(db, kisi, {
        firmaId, baslik: 'Deneme talebi', paraBirimi: 'TRY', istenenTarih: null, aciklama: null,
        satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça', miktar: '5' }],
      });
      t = await siparisler.teklifGuncelle(db, kisi, t.id, {
        firmaId, baslik: 'Düzeltilmiş', paraBirimi: 'TRY', istenenTarih: null, aciklama: null, surum: t.surum,
        satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça', miktar: '10' }],
      });
      t = await siparisler.surumVer(db, kisi, t.id, {
        surum: t.surum, fiyatlar: t.satirlar.map((s) => ({ satirId: s.id, birimFiyat: '20' })), iskontoOrani: '10',
        teslimGun: null, odemeKosulu: null, gecerlilik: null, aciklama: null, terminTarihi: null, planTaslagi: null,
      });
      t = await siparisler.notluGecis(db, kisi, t.id, 'revizyon', { surum: t.surum, not: 'Fiyat yüksek' });
      t = await siparisler.surumVer(db, kisi, t.id, {
        surum: t.surum, fiyatlar: t.satirlar.map((s) => ({ satirId: s.id, birimFiyat: '15' })), iskontoOrani: '0',
        teslimGun: null, odemeKosulu: null, gecerlilik: null, aciklama: null, terminTarihi: null, planTaslagi: null,
      });
      t = await siparisler.kabulEt(db, kisi, t.id, { surum: t.surum, surumNo: 2 });
      const d = await siparisler.siparisDonustur(db, kisi, t.id, {
        surum: t.surum, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', kdvOrani: '20', cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      });
      const s = await siparisler.siparisAyrintisi(db, d.siparisId);
      const onayli = await siparisler.durumDegistir(db, kisi, s.id, 'onayla', { surum: s.surum });
      const teklifler = await siparisler.teklifListesi(db, teklifListesiSorgusu.parse({}));
      const liste = await siparisler.siparisListesi(db, siparisListesiSorgusu.parse({}));
      return { d, s, onayli, teklifler, liste, ozet: await siparisler.siparisSatiriOzetleri(db, s.satirlar.map((k) => k.id)) };
    });
    assert.equal(sonuc.d.teklif.durum, 'siparis');
    assert.equal(sonuc.d.teklif.siparisId, sonuc.d.siparisId);
    assert.deepEqual(sonuc.s.satirlar.map((s) => [s.miktar, s.birimFiyat]), [['10.000', '15.0000']]);
    assert.equal(sonuc.onayli.durum, 'onayli');
    assert.ok(sonuc.teklifler.satirlar.some((t) => t.id === sonuc.d.teklif.id));
    assert.ok(sonuc.liste.satirlar.some((s) => s.id === sonuc.d.siparisId));
    assert.deepEqual([...sonuc.ozet.values()].map((k) => k.siparisDurumu), ['onayli']);
    assert.equal((await o().vt.tx((db) => siparisler.teklifAyrintisi(db, sonuc.d.teklif.id))).kabulSurumu, 2);
  });

  test('disari da kuralları işletir: onaylı sipariş düzenlenmez (422), ret işlemi geri sarar', async () => {
    const s = await o().vt.tx((db) => siparisler.siparisEkle(db, kisi, {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null, aciklama: null, cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: null, aciklama: null }],
    }));
    const o1 = await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, s.id, 'onayla', { surum: s.surum }));
    await assert.rejects(
      o().vt.tx((db) => siparisler.siparisGuncelle(db, kisi, s.id, {
        firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null,
        aciklama: 'değişmemeli', cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null, surum: o1.surum, satirlar: [{ malzemeNo: mamulNo, miktar: '2', birimFiyat: '1', termin: null, aciklama: null }],
      })),
      (h: unknown) => h instanceof UygulamaHatasi && h.kod === 'GECERSIZ',
    );
    const son = await o().vt.tx((db) => siparisler.siparisAyrintisi(db, s.id));
    assert.equal(son.aciklama, null);
    assert.equal(son.satirlar[0]?.miktar, '1.000');
  });

  test('kilitli ayrıntı: satır çağıranın işlemi boyunca kilitli kalır; olmayan sipariş 404', async () => {
    const s = await o().vt.tx((db) => siparisler.siparisEkle(db, kisi, {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-30', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: null, aciklama: null }],
    }));
    await o().vt.tx(async (db) => {
      assert.equal((await siparisler.siparisKilitliAyrinti(db, s.id)).id, s.id);
      await assert.rejects(o().sahip.sorgu('SELECT 1 FROM siparisler_siparis WHERE id = $1 FOR UPDATE NOWAIT', [s.id]), /lock/);
    });
    await o().sahip.sorgu('SELECT 1 FROM siparisler_siparis WHERE id = $1 FOR UPDATE NOWAIT', [s.id]);
    await assert.rejects(o().vt.tx((db) => siparisler.siparisKilitliAyrinti(db, 999999)), (h: unknown) => h instanceof UygulamaHatasi && h.kod === 'BULUNAMADI');
  });

  test('SIP-16 (287 b) taslak sipariş: müşteri, termin ve kalemle fiyatsız taslak açılır; tarih bugün, KDV verilmezse 20; geçersiz girdi 400, kayıt yok', async () => {
    const s = await o().vt.tx((db) => siparisler.taslakSiparisAc(db, kisi, {
      firmaId, termin: '2030-12-31', aciklama: 'Acil sipariş', satirlar: [{ malzemeNo: mamulNo, miktar: '7' }, { malzemeNo: mamulNo, miktar: '3', termin: '2030-06-30' }],
    }));
    assert.deepEqual([s.durum, s.firmaId, s.siparisTarihi, s.termin, s.kdvOrani, s.paraBirimi, s.aciklama], ['taslak', firmaId, tesisGunu(Date.now()), '2030-12-31', '20.00', 'TRY', 'Acil sipariş']);
    assert.deepEqual(s.satirlar.map((k) => [k.miktar, k.birimFiyat, k.termin]), [['7.000', null, null], ['3.000', null, '2030-06-30']]);
    const k = await o().vt.tx((db) => siparisler.taslakSiparisAc(db, kisi, { firmaId, termin: '2030-12-31', kdvOrani: '10', satirlar: [{ malzemeNo: mamulNo, miktar: '1' }] }));
    assert.equal(k.kdvOrani, '10.00');
    const once = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM siparisler_siparis');
    for (const g of [
      { firmaId, termin: '2000-01-01', satirlar: [{ malzemeNo: mamulNo, miktar: '1' }] },
      { firmaId, termin: '2030-12-31', satirlar: [] },
      { firmaId, termin: '2030-12-31', satirlar: [{ malzemeNo: mamulNo, miktar: '0' }] },
    ]) {
      await assert.rejects(o().vt.tx((db) => siparisler.taslakSiparisAc(db, kisi, g)), (h: unknown) => h instanceof UygulamaHatasi && h.kod === 'DOGRULAMA', JSON.stringify(g));
    }
    assert.deepEqual(await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM siparisler_siparis'), once);
  });

  test('SIP-17 (286 b) onay olayı: dinleyici onayla aynı işlemde siparişi ve onaylayanı alır; reddi onayı geri alır ve hatası döner; kapat ve iptal olay vermez', async () => {
    const ac = () => o().vt.tx((db) => siparisler.siparisEkle(db, kisi, {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2030-12-31', paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: null, aciklama: null }],
    }));
    const gelen: { siparisId: number; kisiId: number; durum: string | undefined }[] = [];
    const birak = siparisler.siparisOnaylandiDinle(async (db, olay) => {
      const d = await db.tek<{ durum: string }>('SELECT durum FROM siparisler_siparis WHERE id = $1', [olay.siparisId]);
      gelen.push({ siparisId: olay.siparisId, kisiId: olay.kullanici.id, durum: d?.durum });
    });
    try {
      const s = await ac();
      const onayli = await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, s.id, 'onayla', { surum: s.surum }));
      assert.deepEqual(gelen, [{ siparisId: s.id, kisiId: kisi.id, durum: 'onayli' }]);
      await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, s.id, 'kapat', { surum: onayli.surum }));
      const iptal = await ac();
      await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, iptal.id, 'iptal', { surum: iptal.surum, neden: 'Deneme' }));
      assert.equal(gelen.length, 1);
    } finally {
      birak();
    }
    const birakRet = siparisler.siparisOnaylandiDinle(async () => { throw new UygulamaHatasi('CAKISMA', 'Plan emri açamadı.'); });
    try {
      const s = await ac();
      await assert.rejects(
        o().vt.tx((db) => siparisler.durumDegistir(db, kisi, s.id, 'onayla', { surum: s.surum })),
        (h: unknown) => h instanceof UygulamaHatasi && h.kod === 'CAKISMA' && h.message === 'Plan emri açamadı.',
      );
      const son = await o().vt.tx((db) => siparisler.siparisAyrintisi(db, s.id));
      assert.deepEqual([son.durum, son.surum], ['taslak', s.surum]);
    } finally {
      birakRet();
    }
  });

  test('takvim (891): termini aralıktaki sipariş firma adıyla gelir; iptal gelmez, kapanan bitti sayılır, aralık dışı gelmez', async () => {
    const ac = (termin: string) => o().vt.tx((db) => siparisler.siparisEkle(db, kisi, {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin, paraBirimi: 'TRY', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: null, aciklama: null }],
    }));
    const taslak = await ac('2031-03-02');
    const kapanan = await ac('2031-03-10');
    const k1 = await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, kapanan.id, 'onayla', { surum: kapanan.surum }));
    await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, kapanan.id, 'kapat', { surum: k1.surum }));
    const iptal = await ac('2031-03-05');
    await o().vt.tx((db) => siparisler.durumDegistir(db, kisi, iptal.id, 'iptal', { surum: iptal.surum, neden: 'Deneme' }));
    await ac('2031-04-01');

    const kayitlar = await o().vt.tx((db) => siparisler.takvimKayitlari(db, '2031-03-01', '2031-03-31'));
    assert.deepEqual(kayitlar, [
      { kaynak: 'siparis', kimlik: String(taslak.id), tarih: '2031-03-02', no: taslak.no, baslik: `Sipariş ${taslak.no}`, ilgili: 'Deneme Firma', durum: 'Taslak', bitti: false },
      { kaynak: 'siparis', kimlik: String(kapanan.id), tarih: '2031-03-10', no: kapanan.no, baslik: `Sipariş ${kapanan.no}`, ilgili: 'Deneme Firma', durum: 'Kapandı', bitti: true },
    ]);
    assert.deepEqual(await o().vt.tx((db) => siparisler.takvimKayitlari(db, '2031-05-01', '2031-05-31')), []);
  });
});
