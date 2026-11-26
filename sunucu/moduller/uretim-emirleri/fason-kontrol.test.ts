import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { FasonKontrol } from '#paylasilan/fason-kontrol.ts';
import { fasonYolu } from '#paylasilan/fason-kontrol.ts';
import {
  AKTARIM_HEDEFI_YOK, AKTARIM_YOLU_DEGIL, DONUS_YOLU_DEGIL, FASON_DONUS_ASIMI, MUAYENE_BELGESI_EKSIK, aktarilanSaglam, aktarimIhlali, donusYoluIhlali,
  fasonDonusPayiMs, muayeneOnayIhlali, muayeneSonucu, oncekiBitmediIhlali, OTOMATIK_MUAYENE, otomatikGkkYerleri, otomatikMuayeneYerleri,
} from './kurallar.ts';
import type { FasonDurumu, IsEmriDurumu } from './kurallar.ts';

const GKK = 7;
const MUAYENE = 8;
const adim = (sira: number, opNo: number, ek: { firma?: number; kontrol?: FasonKontrol; durum?: IsEmriDurumu; tip?: number } = {}) => ({
  sira, opNo, operasyonTipiId: ek.tip ?? 1, fasonFirmaId: ek.firma ?? null, durum: ek.durum ?? ('bekliyor' as IsEmriDurumu), ...(ek.kontrol === undefined ? {} : { kontrolTuru: ek.kontrol }),
});
const fason = (ek: Partial<FasonDurumu> = {}): FasonDurumu => ({
  durum: 'calisiyor', fason: true, siradaki: true, gonderilen: 10, donenSaglam: 0, donenHurda: 0, gonderilebilir: 10, ...ek,
});

describe('uretim-emirleri fason kontrol türü kuralları (3708)', () => {
  test('GKK seçimi (ya da seçimsiz eski satır) bugünkü yeri verir; muayene yeri açılmaz', () => {
    const adimlar = [adim(1, 10, { firma: 3 }), adim(2, 30)];
    assert.deepEqual(otomatikGkkYerleri(adimlar, GKK), [{ oncekiOpNo: 10, opNo: 20 }]);
    assert.deepEqual(otomatikGkkYerleri([adim(1, 10, { firma: 3, kontrol: 'gkk' }), adim(2, 30)], GKK), [{ oncekiOpNo: 10, opNo: 20 }]);
    assert.deepEqual(otomatikMuayeneYerleri(adimlar, MUAYENE), []);
  });

  test('kaynağında muayene seçimi muayene adımı koyar, GKK koymaz', () => {
    const adimlar = [adim(1, 10, { firma: 3, kontrol: 'kaynakta' }), adim(2, 20, { firma: 4 })];
    assert.deepEqual(otomatikMuayeneYerleri(adimlar, MUAYENE), [{ oncekiOpNo: 10, opNo: 15 }]);
    assert.deepEqual(otomatikGkkYerleri(adimlar, GKK), [{ oncekiOpNo: 20, opNo: 25 }]);
    assert.deepEqual(otomatikMuayeneYerleri([adim(1, 10, { firma: 3, kontrol: 'kaynakta' }), adim(2, 15, { tip: MUAYENE })], MUAYENE), []);
  });

  test('kontrolsüz seçimde kontrol adımı konmaz', () => {
    const adimlar = [adim(1, 10, { firma: 3, kontrol: 'kontrolsuz' }), adim(2, 20, { firma: 4, kontrol: 'gkk' })];
    assert.deepEqual(otomatikGkkYerleri(adimlar, GKK), [{ oncekiOpNo: 20, opNo: 25 }]);
    assert.deepEqual(otomatikMuayeneYerleri(adimlar, MUAYENE), []);
  });

  test('kaynağında muayene + sonraki fason: aktarım kaydı, stok hareketi ve mal kabul yok; ikinci fasonun adedi aktarılan sağlam adet', () => {
    const sonuc = muayeneSonucu('kaynakta', true);
    assert.deepEqual(sonuc, { kayit: 'aktarim', stokHareketi: false, malKabulBekler: false, karantina: false, gkk: false });
    const yol = fasonYolu('kaynakta', true);
    assert.equal(aktarimIhlali(fason(), yol, 8, 2, 4), null);
    assert.equal(aktarimIhlali(fason(), yol, 9, 2, 4), FASON_DONUS_ASIMI);
    assert.equal(aktarimIhlali(fason(), yol, 8, 2, null), AKTARIM_HEDEFI_YOK);
    assert.equal(donusYoluIhlali(yol), DONUS_YOLU_DEGIL);
    assert.equal(aktarilanSaglam([{ saglam: 5 }, { saglam: 3 }]), 8);
  });

  test('kaynağında muayene + sonraki fason değil: dönüş mal kabulden gelir, karantina ve GKK yok', () => {
    const sonuc = muayeneSonucu('kaynakta', false);
    assert.deepEqual(sonuc, { kayit: 'donus', stokHareketi: false, malKabulBekler: true, karantina: false, gkk: false });
    const yol = fasonYolu('kaynakta', false);
    assert.equal(donusYoluIhlali(yol), null);
    assert.equal(aktarimIhlali(fason(), yol, 8, 2, 4), AKTARIM_YOLU_DEGIL);
    assert.equal(muayeneSonucu('gkk', false), null);
  });

  test('kontrolsüz geçiş: aktarım kaydı fason adımını kapatır, stok hareketi yok', () => {
    const yol = fasonYolu('kontrolsuz', true);
    assert.equal(yol.konanAdim, null);
    assert.equal(aktarimIhlali(fason(), yol, 7, 3, 4), null);
    assert.equal(aktarilanSaglam([{ saglam: 7 }]), 7);
    assert.equal(muayeneSonucu('kontrolsuz', true), null);
  });

  test('zorunlu belge eksikken kaynağında muayene onaylanamaz', () => {
    assert.equal(muayeneOnayIhlali(['sertifika', 'test-raporu'], ['sertifika']), MUAYENE_BELGESI_EKSIK);
    assert.equal(muayeneOnayIhlali(['sertifika'], ['sertifika', 'test-raporu']), null);
    assert.equal(muayeneOnayIhlali([], []), null);
  });

  test('plan: kaynağında muayene ve kontrolsüzde (sonraki fason) dönüş payı eklenmez, GKK\'da eklenir', () => {
    const pay = 8 * 60 * 60_000;
    assert.equal(fasonDonusPayiMs('gkk', true, pay), pay);
    assert.equal(fasonDonusPayiMs('kaynakta', true, pay), 0);
    assert.equal(fasonDonusPayiMs('kontrolsuz', true, pay), 0);
    assert.equal(fasonDonusPayiMs('kaynakta', false, pay), pay);
  });

  test('kaynağında muayene kendi fason öncülü açıkken bitirilir; başka öncül ve GKK beklemeye devam eder', () => {
    const s = (id: number, ek: Record<string, unknown>) => ({
      id, sira: id, opNo: id * 10, durum: 'bekliyor' as IsEmriDurumu, bagimlilik: 'bekleyen' as const, devirAdedi: null, onculler: null, ...ek,
    });
    const muayene = s(3, { tur: 'ek', ekAciklama: OTOMATIK_MUAYENE, durum: 'calisiyor', fasonFirmaId: null });
    const kaynakta = [s(1, { durum: 'tamam' }), s(2, { durum: 'calisiyor', fasonFirmaId: 5, kontrolTuru: 'kaynakta' }), muayene];
    assert.equal(oncekiBitmediIhlali(kaynakta, muayene), null);
    const gkk = [s(1, { durum: 'tamam' }), s(2, { durum: 'calisiyor', fasonFirmaId: 5, kontrolTuru: 'gkk' }), muayene];
    assert.match(oncekiBitmediIhlali(gkk, muayene) ?? '', /OP 20 bitmeden OP 30/);
    // Risk R3: firması seçilmemiş fason da muayenenin fasonudur.
    const firmasiz = [s(1, { durum: 'tamam' }), s(2, { durum: 'calisiyor', fasonFirmaId: null, fasonFirmasiz: true, kontrolTuru: 'kaynakta' }), muayene];
    assert.equal(oncekiBitmediIhlali(firmasiz, muayene), null);
    // Risk R1: muayeneden sonraki adım, muayene bitse de parça firmadayken (fason açık) bitmez.
    const ic = s(4, { durum: 'calisiyor' });
    const bitti = { ...muayene, durum: 'tamam' as IsEmriDurumu };
    assert.match(oncekiBitmediIhlali([kaynakta[0]!, kaynakta[1]!, bitti, ic], ic) ?? '', /OP 20 bitmeden OP 40/);
    assert.equal(oncekiBitmediIhlali([kaynakta[0]!, { ...kaynakta[1]!, durum: 'tamam' as IsEmriDurumu }, bitti, ic], ic), null);
    assert.match(oncekiBitmediIhlali([firmasiz[0]!, firmasiz[1]!, bitti, ic], ic) ?? '', /OP 20 bitmeden OP 40/);
    const elle = s(3, { tur: 'ek', ekAciklama: 'Elle ek adım', durum: 'calisiyor' });
    assert.match(oncekiBitmediIhlali([kaynakta[0]!, kaynakta[1]!, elle], elle) ?? '', /OP 20 bitmeden/);
  });
});
