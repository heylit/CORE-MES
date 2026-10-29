import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FASON_DISARIDA, FASON_DONUS_ASIMI, FASON_DONUSSUZ, FIRMA_HATALISI_ASIMI, FIRMA_HATALISI_GKK_DISI, OTOMATIK_GKK, fasonBeklemesi, fasonDonusIhlali,
  fasonTamamIhlali, firmaHatalisiIhlali, gkkFasonu, gkkTipiSec, kaliteIstasyonuSec, otomatikGkkMi, otomatikGkkYerleri,
} from './kurallar.ts';
import type { FasonDurumu, IsEmriDurumu } from './kurallar.ts';

const GKK = 7;
const fason = (ek: Partial<FasonDurumu> = {}): FasonDurumu => ({
  durum: 'calisiyor', fason: true, siradaki: true, gonderilen: 10, donenSaglam: 0, donenHurda: 0, gonderilebilir: 10, ...ek,
});
const adim = (sira: number, opNo: number, ek: { tip?: number; firma?: number; durum?: IsEmriDurumu } = {}) => ({
  sira, opNo, operasyonTipiId: ek.tip ?? 1, fasonFirmaId: ek.firma ?? null, durum: ek.durum ?? 'bekliyor',
});

describe('uretim-emirleri GKK kuralları (1205, 1207 c, 1208)', () => {
  test('GKK tipi KAL grubunda GKK kodlu aktif tiptir', () => {
    const tipler = [{ kod: 'GM', grup: 'KAL', aktif: true }, { kod: 'GKK', grup: 'KAL', aktif: true }];
    assert.equal(gkkTipiSec(tipler)?.kod, 'GKK');
    assert.equal(gkkTipiSec([{ kod: 'GKK', grup: 'KAL', aktif: false }]), null);
    assert.equal(gkkTipiSec([{ kod: 'GKK', grup: 'TOR', aktif: true }]), null);
  });

  test('arkasında GKK olmayan bitmemiş fason adımına otomatik GKK yeri açılır', () => {
    assert.deepEqual(otomatikGkkYerleri([adim(1, 10), adim(2, 20, { firma: 3 }), adim(3, 30)], GKK), [{ oncekiOpNo: 20, opNo: 25 }]);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 10), adim(2, 20, { firma: 3 })], GKK), [{ oncekiOpNo: 20, opNo: 25 }]);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 10, { firma: 3 }), adim(2, 20, { firma: 4 }), adim(3, 30)], GKK), [
      { oncekiOpNo: 10, opNo: 15 }, { oncekiOpNo: 20, opNo: 25 },
    ]);
  });

  test('GKK varsa, fason bittiyse, arkası başladıysa ya da boş op numarası yoksa yer açılmaz', () => {
    assert.deepEqual(otomatikGkkYerleri([adim(1, 20, { firma: 3 }), adim(2, 25, { tip: GKK })], GKK), []);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 20, { firma: 3, durum: 'tamam' }), adim(2, 30)], GKK), []);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 20, { firma: 3, durum: 'calisiyor' }), adim(2, 30, { durum: 'calisiyor' })], GKK), []);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 20, { firma: 3 }), adim(2, 21)], GKK), []);
  });

  test('GKK adımı fason adımının hemen arkasındaki GKK tipli adımdır', () => {
    const hepsi = [adim(1, 10), adim(2, 20, { firma: 3 }), adim(3, 25, { tip: GKK }), adim(4, 30, { tip: GKK })];
    assert.equal(gkkFasonu(hepsi, hepsi[2]!, GKK)?.opNo, 20);
    assert.equal(gkkFasonu(hepsi, hepsi[3]!, GKK), null);
    assert.equal(gkkFasonu(hepsi, hepsi[1]!, GKK), null);
    assert.equal(gkkFasonu(hepsi, hepsi[2]!, null), null);
  });

  test('otomatik GKK açıklamasıyla tanınır; öteki ek adımlar tanınmaz', () => {
    assert.equal(otomatikGkkMi({ tur: 'ek', ekAciklama: OTOMATIK_GKK }), true);
    assert.equal(otomatikGkkMi({ tur: 'ek', ekAciklama: 'OP 20: Çapak' }), false);
    assert.equal(otomatikGkkMi({ tur: 'rota', ekAciklama: OTOMATIK_GKK }), false);
  });

  test('kalite istasyonu seçimi: yoksa null döner (otomatik GKK o zaman girmez)', () => {
    assert.equal(kaliteIstasyonuSec({ varsayilanIstasyonId: null }, [{ id: 4, tip: 'uretim', aktif: true }], null), null);
    assert.equal(kaliteIstasyonuSec({ varsayilanIstasyonId: null }, [{ id: 5, tip: 'kalite', aktif: true }], null), 5);
  });

  test('firma hatalısı yalnız GKK adımında, gönderilen eksi dönen kadar girilir', () => {
    assert.equal(firmaHatalisiIhlali(null, 1), FIRMA_HATALISI_GKK_DISI);
    assert.equal(firmaHatalisiIhlali({ gonderilen: 10, donen: 8, firmadaHatali: 0 }, 2), null);
    assert.equal(firmaHatalisiIhlali({ gonderilen: 10, donen: 8, firmadaHatali: 1 }, 2), FIRMA_HATALISI_ASIMI);
    assert.equal(firmaHatalisiIhlali({ gonderilen: 10, donen: 10, firmadaHatali: 0 }, 1), FIRMA_HATALISI_ASIMI);
  });

  test('fason adımı, dönen ile GKK da firmada sayılan gönderileni karşılayınca tamamlanır', () => {
    assert.equal(fasonTamamIhlali(fason({ donenSaglam: 8, firmadaHatali: 2 })), null);
    assert.equal(fasonTamamIhlali(fason({ firmadaHatali: 10 })), null);
    assert.equal(fasonTamamIhlali(fason({ donenSaglam: 8, firmadaHatali: 1 })), FASON_DISARIDA);
    assert.equal(fasonTamamIhlali(fason()), FASON_DONUSSUZ);
  });

  test('otomatik GKK plana girmediği için fasonun beklemesi arkasındaki adıma geçer', () => {
    const adimlar = [
      { sira: 1, fasonFirmaId: 3, terminGun: 4, durum: 'bekliyor' },
      { sira: 2, fasonFirmaId: null, terminGun: null, durum: 'bekliyor', tur: 'ek', ekAciklama: OTOMATIK_GKK },
      { sira: 3, fasonFirmaId: null, terminGun: null, durum: 'bekliyor', tur: 'rota', ekAciklama: null },
    ];
    assert.equal(fasonBeklemesi(adimlar, 3), 4);
    assert.equal(fasonBeklemesi([adimlar[0]!, { ...adimlar[1]!, ekAciklama: 'OP 10: Çapak' }, adimlar[2]!], 3), 0);
  });

  test('firmada sayılan adet artık dönemez', () => {
    assert.equal(fasonDonusIhlali(fason({ donenSaglam: 8, firmadaHatali: 2 }), 1, 0), FASON_DONUS_ASIMI);
    assert.equal(fasonDonusIhlali(fason({ donenSaglam: 7, firmadaHatali: 2 }), 1, 0), null);
  });
});
