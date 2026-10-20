import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { EmirDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  BASLATMA_DURUMU, BITIRME_DURUMU, IPTAL_DURUMU, DURAKLI_DURDUR, MAKINEDE_AYNI_IS, MAKINE_DOLU, ISTASYON_PASIF_ACMA, ISTASYON_PASIF_BASLATMA, ISTASYON_YOK,
  AYAR_PLANLI_DEGIL, AYAR_YINELENDI, REFAKAT_IPTAL, adimliOzetSay, ayarIhlali, isEmriSureOzeti, refakatIhlali, refakatQrMetni,
  acmaIstasyonIhlali, adimDegisiyorMu, adimIhlali, baslatmaIhlali, baslatmaIstasyonIhlali, bitirmeIhlali, calismaDurumu, devamIhlali, duraklatmaIhlali,
  durdurmaIhlali, durusNedeniIhlali, hurdaNedeniIhlali, iptalIhlali, calisilacakMakineler, makineDoluIhlali, saglamToplamIhlali, sayimIhlali, toplamAsimiIhlali,
  KAYIT_ANI_ESKI, KAYIT_ANI_GECERSIZ, KAYIT_ANI_ILERI, kayitAniIhlali, ADIM_GIRDI_ASIMI, adimGirdiAsimiIhlali,
} from './kurallar.ts';
import type { SureGirdisi, SureSayimi } from './kurallar.ts';

const digerleri = (haric: EmirDurumu): EmirDurumu[] => EMIR_DURUMLARI.filter((d) => d !== haric);

describe('üretim emri kuralları', () => {
  test('yalnız planlı emir başlar', () => {
    assert.equal(baslatmaIhlali('planli'), null);
    for (const d of digerleri('planli')) assert.equal(baslatmaIhlali(d), BASLATMA_DURUMU, d);
  });

  test('yalnız başlamış emir biter', () => {
    assert.equal(bitirmeIhlali('basladi'), null);
    for (const d of digerleri('basladi')) assert.equal(bitirmeIhlali(d), BITIRME_DURUMU, d);
  });

  test('yalnız planlı emir iptal edilir', () => {
    assert.equal(iptalIhlali('planli'), null);
    for (const d of digerleri('planli')) assert.equal(iptalIhlali(d), IPTAL_DURUMU, d);
  });

  test('emir yalnız aktif istasyona açılır', () => {
    assert.equal(acmaIstasyonIhlali('aktif'), null);
    assert.equal(acmaIstasyonIhlali('pasif'), ISTASYON_PASIF_ACMA);
    assert.equal(acmaIstasyonIhlali('yok'), ISTASYON_YOK);
  });

  test('emir yalnız aktif istasyonda başlar', () => {
    assert.equal(baslatmaIstasyonIhlali('aktif'), null);
    assert.equal(baslatmaIstasyonIhlali('pasif'), ISTASYON_PASIF_BASLATMA);
    assert.equal(baslatmaIstasyonIhlali('yok'), ISTASYON_YOK);
  });

  test('makinede aynı anda tek iş: açık kullanım başka işse dolu, aynı işse zaten çalışıyor; seçim yoksa atanmış makine', () => {
    assert.equal(makineDoluIhlali(null, 5), null);
    assert.equal(makineDoluIhlali(7, 5), MAKINE_DOLU);
    assert.equal(makineDoluIhlali(5, 5), MAKINEDE_AYNI_IS);
    assert.deepEqual(calisilacakMakineler([3, 4], 9), [3, 4]);
    assert.deepEqual(calisilacakMakineler(undefined, 9), [9]);
    assert.deepEqual(calisilacakMakineler(undefined, null), []);
  });

  test('çalışma durumu son olaydan türer', () => {
    assert.equal(calismaDurumu(null), 'calisiyor');
    assert.equal(calismaDurumu('devam'), 'calisiyor');
    assert.equal(calismaDurumu('duraklat'), 'durakli');
    assert.equal(calismaDurumu('durdur'), 'durdu');
  });

  test('sayım çalışırken ve duraklıyken serbest, durmuşken kapalı; başlamamış emirde hiçbir komut yok', () => {
    assert.equal(sayimIhlali('basladi', 'calisiyor'), null);
    assert.equal(sayimIhlali('basladi', 'durakli'), null);
    assert.notEqual(sayimIhlali('basladi', 'durdu'), null);
    for (const d of digerleri('basladi')) {
      for (const k of [sayimIhlali, duraklatmaIhlali, durdurmaIhlali, devamIhlali]) assert.notEqual(k(d, 'calisiyor'), null, d);
    }
  });

  test('duraklat ve durdur yalnız çalışırken, devam duraklı ya da durmuşken', () => {
    assert.equal(duraklatmaIhlali('basladi', 'calisiyor'), null);
    assert.notEqual(duraklatmaIhlali('basladi', 'durakli'), null);
    assert.notEqual(duraklatmaIhlali('basladi', 'durdu'), null);
    assert.equal(durdurmaIhlali('basladi', 'calisiyor'), null);
    assert.equal(durdurmaIhlali('basladi', 'durakli'), DURAKLI_DURDUR);
    assert.notEqual(durdurmaIhlali('basladi', 'durdu'), null);
    assert.notEqual(devamIhlali('basladi', 'calisiyor'), null);
    assert.equal(devamIhlali('basladi', 'durakli'), null);
    assert.equal(devamIhlali('basladi', 'durdu'), null);
  });

  test('sağlam toplam sıfırın altına inemez ama emir adedini aşabilir; sayaç int4 sınırını aşamaz', () => {
    assert.equal(saglamToplamIhlali(3, -3), null);
    assert.notEqual(saglamToplamIhlali(3, -4), null);
    assert.equal(saglamToplamIhlali(1000, 1000), null);
    assert.equal(toplamAsimiIhlali(2147483646, 1), null);
    assert.notEqual(toplamAsimiIhlali(2147483647, 1), null);
  });

  test('neden yoksa ya da pasifse reddedilir', () => {
    for (const k of [durusNedeniIhlali, hurdaNedeniIhlali]) {
      assert.equal(k({ aktif: true }), null);
      assert.notEqual(k({ aktif: false }), null);
      assert.notEqual(k(null), null);
    }
  });

  test('adım yalnız başlamış emirde işaretlenir; aynı duruma ayarlama değişiklik sayılmaz', () => {
    assert.equal(adimIhlali('basladi'), null);
    for (const d of digerleri('basladi')) assert.notEqual(adimIhlali(d), null, d);
    assert.equal(adimDegisiyorMu(false, true), true);
    assert.equal(adimDegisiyorMu(true, false), true);
    assert.equal(adimDegisiyorMu(true, true), false);
    assert.equal(adimDegisiyorMu(false, false), false);
  });
});

describe('ayar ve birim süre özeti', () => {
  const an = (dk: number): string => new Date(Date.UTC(2026, 0, 1, 8, 0) + dk * 60_000).toISOString();
  const tek = (dk: number, ek: Partial<SureSayimi> = {}): SureSayimi => ({ tur: 'saglam', adet: 1, duzeltme: false, zaman: an(dk), ...ek });
  const girdi = (ek: Partial<SureGirdisi> = {}): SureGirdisi => ({
    baslama: an(0), bitis: null, simdi: an(60), ayarlar: [], olaylar: [], sayimlar: [], ...ek,
  });

  test('ayar yalnız planlı işte ve bir kez başlar', () => {
    assert.equal(ayarIhlali('planli', false), null);
    assert.equal(ayarIhlali('planli', true), AYAR_YINELENDI);
    for (const d of digerleri('planli')) assert.equal(ayarIhlali(d, false), AYAR_PLANLI_DEGIL, d);
  });

  test('brüt birim süre başlattan beri geçen süre ÷ (sağlam + hurda); bitmiş işte bitişe kadar', () => {
    const o = isEmriSureOzeti(girdi({ sayimlar: [tek(10, { adet: 8 }), tek(20, { tur: 'hurda', adet: 2 })] }));
    assert.deepEqual([o.saglam, o.hurda, o.brutBirimDk], [8, 2, 6]);
    assert.equal(isEmriSureOzeti(girdi({ bitis: an(30), sayimlar: [tek(10, { adet: 10 })] })).brutBirimDk, 3, 'pencere bitişte kapanır');
  });

  test('sayım yoksa ya da iş başlamadıysa birim süre yoktur (sıfır uydurulmaz)', () => {
    const bos = isEmriSureOzeti(girdi());
    assert.deepEqual([bos.brutBirimDk, bos.netBirimDk, bos.tekliOrtalamaDk], [null, null, null]);
    const sifir = isEmriSureOzeti(girdi({ sayimlar: [tek(5), tek(6, { adet: -1, duzeltme: true })] }));
    assert.deepEqual([sifir.saglam, sifir.brutBirimDk], [0, null], 'düzeltme toplamı sıfırlarsa da yoktur');
    const baslamamis = isEmriSureOzeti(girdi({ baslama: null, ayarlar: [an(-10)], sayimlar: [tek(5)] }));
    assert.deepEqual([baslamamis.hazirlikDk, baslamamis.brutBirimDk, baslamamis.tekliAraliklarDk], [null, null, []]);
  });

  test('net birim süreden duraklama ve duruş düşülür; kapanmamış duruş pencere sonuna kadar sürer', () => {
    const o = isEmriSureOzeti(girdi({
      olaylar: [
        { olay: 'duraklat', zaman: an(10) }, { olay: 'devam', zaman: an(20) },
        { olay: 'durdur', zaman: an(40) }, { olay: 'devam', zaman: an(45) },
        { olay: 'duraklat', zaman: an(50) },
      ],
      sayimlar: [tek(5, { adet: 5 })],
    }));
    assert.deepEqual([o.brutBirimDk, o.netBirimDk], [12, 7], '60 dk brüt; 10 + 5 + 10 dk duruş düşülünce 35 dk');
    assert.equal(isEmriSureOzeti(girdi({ sayimlar: [tek(5, { adet: 5 })] })).netBirimDk, 12, 'duruş yoksa net brüte eşittir');
  });

  test('hazırlık başlatmadan önceki son ayardan ölçülür; ayar yoksa ya da başlatmadan sonraysa yoktur', () => {
    assert.equal(isEmriSureOzeti(girdi({ ayarlar: [an(-45), an(-20)] })).hazirlikDk, 20);
    assert.equal(isEmriSureOzeti(girdi()).hazirlikDk, null);
    assert.equal(isEmriSureOzeti(girdi({ ayarlar: [an(5)] })).hazirlikDk, null);
  });

  test('tekli dizi art arda 1\'er girilen sayımlardır; toplu ve düzeltme diziyi keser, aralıktan duruş düşülür', () => {
    const o = isEmriSureOzeti(girdi({
      olaylar: [{ olay: 'duraklat', zaman: an(12) }, { olay: 'devam', zaman: an(14) }],
      sayimlar: [tek(4), tek(15), tek(20, { adet: 3 }), tek(26), tek(30), tek(31, { adet: 1, duzeltme: true }), tek(35), tek(37, { tur: 'hurda' })],
    }));
    assert.deepEqual(o.tekliAraliklarDk, [4, 9, 4, 2], 'ilk aralık başlattan; toplu ve düzeltmeden sonraki ilk aralık sayılmaz; 1\'lik hurda da parçadır');
    assert.equal(o.tekliOrtalamaDk, 4.75);
    const toplu = isEmriSureOzeti(girdi({ sayimlar: [tek(5, { adet: 4 }), tek(9, { adet: 2 })] }));
    assert.deepEqual([toplu.tekliAraliklarDk, toplu.tekliOrtalamaDk], [[], null], 'yalnız toplu girişte dizi ve ortalama yoktur');
  });
});

describe('refakat kartı', () => {
  test('iptal edilmiş emir dışında her emirde basılır', () => {
    assert.equal(refakatIhlali('iptal'), REFAKAT_IPTAL);
    for (const d of digerleri('iptal')) assert.equal(refakatIhlali(d), null, d);
  });

  test('QR yalnız emir kimliğini taşır', () => {
    assert.equal(refakatQrMetni(4512), 'UE:4512');
    assert.deepEqual(kodTuru(refakatQrMetni(4512)), { tur: 'uretim-emri', deger: '4512', bicim: 'kimlik' }, 'okutan kod sözlüğü emir kimliği olarak tanır');
  });
});

describe('adimliOzetSay (ana sayfa özeti)', () => {
  test('iş emri başlamış planlı emir başladı sayılır; geciken yalnız açık emirde; biten ayrı, iptal hiçbir sayıya girmez', () => {
    const g = (durum: EmirDurumu, baslamis: boolean, gecikmis: boolean, sayi: number) => ({ durum, baslamis, gecikmis, sayi });
    assert.deepEqual(adimliOzetSay([
      g('taslak', false, true, 1), g('planli', false, false, 2), g('planli', true, true, 3), g('basladi', true, false, 4),
      g('bitti', true, true, 5), g('iptal', false, true, 6),
    ]), { taslak: 1, planli: 2, basladi: 7, acik: 10, geciken: 4, biten: 5 });
    assert.deepEqual(adimliOzetSay([]), { taslak: 0, planli: 0, basladi: 0, acik: 0, geciken: 0, biten: 0 });
  });
});

describe('kayıt anı (denetim #25)', () => {
  const simdi = '2026-10-19T12:00:00.000Z';
  test('son olaydan önce, ileride ya da geçersiz an reddedilir; son olayla aynı an geçer', () => {
    assert.equal(kayitAniIhlali('2026-10-19T11:00:00.000Z', '2026-10-19T11:30:00.000Z', simdi), KAYIT_ANI_ESKI);
    assert.equal(kayitAniIhlali('2026-10-19T12:00:01.000Z', null, simdi), KAYIT_ANI_ILERI);
    assert.equal(kayitAniIhlali('dün', null, simdi), KAYIT_ANI_GECERSIZ);
    assert.equal(kayitAniIhlali('2026-10-19T11:30:00.000Z', '2026-10-19T11:30:00.000Z', simdi), null);
    assert.equal(kayitAniIhlali('2026-10-19T09:00:00.000Z', null, simdi), null);
  });
});

describe('adım girdisi (denetim #31)', () => {
  test('artış giren adedi aşamaz; düşüş ve ilk adım serbest', () => {
    assert.equal(adimGirdiAsimiIhlali(4, 3, 2), ADIM_GIRDI_ASIMI);
    assert.equal(adimGirdiAsimiIhlali(4, 3, 1), null);
    assert.equal(adimGirdiAsimiIhlali(4, 6, -1), null);
    assert.equal(adimGirdiAsimiIhlali(null, 1000, 5), null);
  });
});
