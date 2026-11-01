import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { koliKalemleri, takvimKayitlari } from './disari.ts';

describe('sevkiyat disari (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => { ortam = await testVeritabaniKur('sevkiyat_disari'); });
  after(async () => { await ortam?.kaldir(); });

  test('891 takvim: günü aralıktaki işler sınırlar dahil gelir; iptal ve aralık dışı gelmez; alımda alış noktası, firma adıyla', async () => {
    const kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sevk-disari', parola: 'dogru-parola-1' }));
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Alıcı', 'musteri', $1) RETURNING id", [kisiId]))!.id;
    const musteri = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Alıcı Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]))!.id;
    const tedarikci = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Tedarik Noktası', 'tedarikci', 39.96, 32.76) RETURNING id"))!.id;
    const is = async (tarih: string, tur: 'teslimat' | 'alim', nokta: number, iptal = false) => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, alis_noktasi_id, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, belge_no, iptal_edildi)
       VALUES ($1, $1, $2, $3, $4, 10, 1, 'DNM-1', $5) RETURNING id`,
      [tarih, tur, tur === 'alim' ? nokta : null, tur === 'teslimat' ? nokta : null, iptal ? new Date() : null]))!.id;
    const ilk = await is('2031-03-01', 'teslimat', musteri);
    const alim = await is('2031-03-31', 'alim', tedarikci);
    await is('2031-04-01', 'teslimat', musteri);
    await is('2031-03-15', 'teslimat', musteri, true);

    assert.deepEqual(await o().vt.tx((db) => takvimKayitlari(db, '2031-03-01', '2031-03-31')), [
      { kaynak: 'sevk', kimlik: String(ilk), tarih: '2031-03-01', no: 'DNM-1', baslik: 'Teslimat DNM-1', ilgili: 'Deneme Alıcı', durum: 'Havuzda', bitti: false },
      { kaynak: 'sevk', kimlik: String(alim), tarih: '2031-03-31', no: 'DNM-1', baslik: 'Alım DNM-1', ilgili: 'Tedarik Noktası', durum: 'Havuzda', bitti: false },
    ]);
  });

  test('1525 koli: müşteriye giden elle kalem işin belge no, tarih ve firma adıyla gelir; geliş, kaldırılmış ve iptal işin kalemi gelmez', async () => {
    const kisiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sevk-koli', parola: 'dogru-parola-1' }));
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Koli Alıcı', 'musteri', $1) RETURNING id", [kisiId]))!.id;
    const nokta = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Koli Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]))!.id;
    const is = async (iptal: boolean) => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, belge_no, iptal_edildi)
       VALUES ('2031-05-02', '2031-05-02', 'teslimat', $1, 10, 1, 'KOLI-1', $2) RETURNING id`, [nokta, iptal ? new Date() : null]))!.id;
    const kalem = async (yon: 'gidis' | 'gelis', isId: number | null, kaldirildi = false) => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO sevkiyat_bekleyen (kaynak, yon, firma_id, aciklama, elle_turu, adet, is_id, kaldirildi, kaldiran_kisi_id)
       VALUES ('elle', $1, $2, 'Deneme gönderi', 'numune', 24, $3, CASE WHEN $4 THEN now() END, CASE WHEN $4 THEN $5::int END) RETURNING id`,
      [yon, firmaId, isId, kaldirildi, kisiId]))!.id;
    const giden = await kalem('gidis', await is(false));
    const gelen = await kalem('gelis', null);
    const kaldirilan = await kalem('gidis', null, true);
    const iptalde = await kalem('gidis', await is(true));

    const sonuc = await o().vt.tx((db) => koliKalemleri(db, [giden, gelen, kaldirilan, iptalde, 2147483006]));
    assert.equal(sonuc.length, 1);
    assert.deepEqual({ ...sonuc[0], isId: null }, {
      kalemId: giden, isId: null, belgeNo: 'KOLI-1', tarih: '2031-05-02', firmaId, uretimEmriId: null, malzemeNo: null, adet: '24.0000', aciklama: 'Deneme gönderi', firmaAdi: 'Deneme Koli Alıcı',
    });
    assert.deepEqual(await o().vt.tx((db) => koliKalemleri(db, [])), []);
  });
});
