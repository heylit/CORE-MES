import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import {
  GECMIS_ADET_ASIMI, GECMIS_ARSIV, GECMIS_DALLI, GECMIS_EMIR_DURUMU, GECMIS_FASON, GECMIS_GERI_SONRAKI, GECMIS_GERI_YOK, GECMIS_HURDA_NEDENI,
  GECMIS_ISTASYONSUZ, GECMIS_KOLLU, GECMIS_NEDEN_FAZLA, GECMIS_SIRA, GECMIS_SON_ADIM, GECMIS_TARIH_ESKI, GECMIS_TARIH_ILERI, GECMIS_TARIH_SIRASI,
  gecmisAdetIhlali, gecmisEmirIhlali, gecmisGeriAlIhlali, gecmisSiraIhlali, gecmisTarihIhlali, gecmisZamanlari, type GecmisAdimDurumu, type GecmisEmir,
} from './gecmis-giris-kurallar.ts';

const emir: GecmisEmir = { durum: 'planli', arsiv: false, ustEmirId: null, acikKolVar: false };
const adim = (sira: number, ek: Partial<GecmisAdimDurumu> = {}): GecmisAdimDurumu => ({
  opNo: sira * 10, sira, durum: 'bekliyor', fason: false, istasyonId: sira, dalli: false, ...ek,
});
const dort = [adim(1), adim(2), adim(3), adim(4)];

describe('3455-1 geçmiş giriş kuralları', () => {
  test('emir: taslak ve planlı geçer; arşiv, başlamış, kollu ve dallı reddedilir', () => {
    assert.equal(gecmisEmirIhlali(emir, dort), null);
    assert.equal(gecmisEmirIhlali({ ...emir, durum: 'taslak' }, dort), null);
    assert.equal(gecmisEmirIhlali({ ...emir, arsiv: true }, dort), GECMIS_ARSIV);
    assert.equal(gecmisEmirIhlali({ ...emir, durum: 'basladi' }, dort), GECMIS_EMIR_DURUMU);
    assert.equal(gecmisEmirIhlali({ ...emir, ustEmirId: 5 }, dort), GECMIS_KOLLU);
    assert.equal(gecmisEmirIhlali({ ...emir, acikKolVar: true }, dort), GECMIS_KOLLU);
    assert.equal(gecmisEmirIhlali(emir, [adim(1), adim(2, { dalli: true })]), GECMIS_DALLI);
  });

  test('sıra: ilk bekleyenden ardışık; gövde sırası önemsiz; atlama, yineleme ve son adım reddedilir', () => {
    assert.equal(gecmisSiraIhlali(dort, [10, 20, 30]), null);
    assert.equal(gecmisSiraIhlali(dort, [20, 10]), null);
    assert.equal(gecmisSiraIhlali([adim(1, { durum: 'tamam' }), adim(2), adim(3)], [20]), null);
    assert.equal(gecmisSiraIhlali(dort, [20]), GECMIS_SIRA);
    assert.equal(gecmisSiraIhlali(dort, [10, 30]), GECMIS_SIRA);
    assert.equal(gecmisSiraIhlali(dort, [10, 10]), GECMIS_SIRA);
    assert.equal(gecmisSiraIhlali(dort, [10, 20, 30, 40]), GECMIS_SON_ADIM);
    assert.equal(gecmisSiraIhlali(dort.map((a) => ({ ...a, durum: 'tamam' as const })), [10]), GECMIS_SON_ADIM);
    assert.equal(gecmisSiraIhlali([adim(1, { durum: 'calisiyor' }), adim(2)], [10]), GECMIS_SIRA);
  });

  test('sıra: fason ve istasyonsuz adım geçilmez; fasondan önceki adım girilebilir', () => {
    const fasonlu = [adim(1), adim(2, { fason: true }), adim(3)];
    assert.equal(gecmisSiraIhlali(fasonlu, [10]), null);
    assert.equal(gecmisSiraIhlali(fasonlu, [10, 20]), GECMIS_FASON);
    assert.equal(gecmisSiraIhlali([adim(1, { istasyonId: null }), adim(2)], [10]), GECMIS_ISTASYONSUZ);
  });

  test('tarih: bugün ve iki yıl önce sınırdır; ileri, daha eski ve ters sıra reddedilir; boş tarih geçer', () => {
    assert.equal(gecmisTarihIhlali('2026-11-19', '2024-11-19', '2026-11-19'), null);
    assert.equal(gecmisTarihIhlali('2026-11-19', null, null), null);
    assert.equal(gecmisTarihIhlali('2026-11-19', null, '2026-11-20'), GECMIS_TARIH_ILERI);
    assert.equal(gecmisTarihIhlali('2026-11-19', '2024-11-18', null), GECMIS_TARIH_ESKI);
    assert.equal(gecmisTarihIhlali('2026-11-19', '2026-11-10', '2026-11-05'), GECMIS_TARIH_SIRASI);
  });

  test('adet: önceki sağlamı aşmaz, eşit geçer; hurda ve neden birlikte', () => {
    const a = (saglam: number, hurda = 0, hurdaNedeniId: number | null = null) => ({ saglam, hurda, hurdaNedeniId });
    assert.equal(gecmisAdetIhlali(null, [a(120), a(118, 2, 7)]), null);
    assert.deepEqual(gecmisAdetIhlali(null, [a(120), a(119, 2, 7)]), { ileti: GECMIS_ADET_ASIMI, sira: 1 });
    assert.deepEqual(gecmisAdetIhlali(100, [a(101)]), { ileti: GECMIS_ADET_ASIMI, sira: 0 });
    assert.equal(gecmisAdetIhlali(100, [a(100)]), null);
    assert.deepEqual(gecmisAdetIhlali(null, [a(10, 1)]), { ileti: GECMIS_HURDA_NEDENI, sira: 0 });
    assert.deepEqual(gecmisAdetIhlali(null, [a(10, 0, 7)]), { ileti: GECMIS_NEDEN_FAZLA, sira: 0 });
  });

  test('zaman: girilen gün öğlen; yoksa emir geneli; şimdiyi ve bitişi geçmez', () => {
    const simdi = Date.parse('2026-11-19T09:00:00Z');
    const z = gecmisZamanlari({ baslama: '2026-11-01', bitis: '2026-11-10' }, { baslama: null, bitis: '2026-11-05' }, simdi);
    assert.equal(z.baslama, new Date(tesisGunBasi('2026-11-01') + 12 * 3_600_000).toISOString());
    assert.equal(z.bitis, new Date(tesisGunBasi('2026-11-05') + 12 * 3_600_000).toISOString());
    const bugun = gecmisZamanlari({ baslama: '2026-11-19', bitis: '2026-11-19' }, { baslama: null, bitis: null }, simdi);
    assert.ok(Date.parse(bugun.bitis) <= simdi);
    assert.ok(Date.parse(bugun.baslama) <= Date.parse(bugun.bitis));
  });

  test('geri alma: giriş olmalı, sonraki adımlar başlamamış ve sayımsız olmalı', () => {
    assert.equal(gecmisGeriAlIhlali(emir, true, [{ durum: 'bekliyor', sayimVar: false }]), null);
    assert.equal(gecmisGeriAlIhlali(emir, false, []), GECMIS_GERI_YOK);
    assert.equal(gecmisGeriAlIhlali(emir, true, [{ durum: 'calisiyor', sayimVar: false }]), GECMIS_GERI_SONRAKI);
    assert.equal(gecmisGeriAlIhlali(emir, true, [{ durum: 'bekliyor', sayimVar: true }]), GECMIS_GERI_SONRAKI);
    assert.equal(gecmisGeriAlIhlali({ ...emir, durum: 'basladi' }, true, []), GECMIS_EMIR_DURUMU);
    assert.equal(gecmisGeriAlIhlali({ ...emir, arsiv: true }, true, []), GECMIS_ARSIV);
  });
});
