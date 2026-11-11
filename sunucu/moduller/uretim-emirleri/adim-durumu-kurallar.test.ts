import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  GEREKCE_GEREK, ONAY_GEREKSIZ, acikElleStatu, acikOnaylar, adimSistemStatusu, hazirlikOnayiReddi, onayGecerliMi, oncekiBekleniyor,
} from './kurallar.ts';
import type { AdimStatuGirdisi, HazirlikHali } from './kurallar.ts';

const g = (ek: Partial<AdimStatuGirdisi> = {}, hal: [HazirlikMaddesi, HazirlikHali][] = []): AdimStatuGirdisi => ({
  durum: 'bekliyor', calisma: null, fasonda: false, hal: new Map(hal), oncekiBekleniyor: false, ...ek,
});

describe('uretim-emirleri adım durumu kuralları (2893)', () => {
  test('sistem statüsü öncelik sırasıyla: bitti, çalışma, fason, durduran eksik, uyaran eksik, önceki adım', () => {
    assert.deepEqual(adimSistemStatusu(g({ durum: 'tamam' }, [['cnc', 'eksik']])), { statu: 'bitti', nedenler: [] });
    assert.equal(adimSistemStatusu(g({ durum: 'calisiyor', calisma: 'calisiyor' })).statu, 'uretimde');
    assert.equal(adimSistemStatusu(g({ durum: 'calisiyor', calisma: 'durakli' })).statu, 'duraklatildi');
    assert.equal(adimSistemStatusu(g({ durum: 'calisiyor', calisma: 'durdu' })).statu, 'durdu');
    assert.equal(adimSistemStatusu(g({ fasonda: true }, [['cnc', 'eksik']])).statu, 'fasonda');
    assert.equal(adimSistemStatusu(g({ durum: 'calisiyor', calisma: 'calisiyor', fasonda: true })).statu, 'uretimde', 'çalışma fasondan önce gelir');
    assert.equal(adimSistemStatusu(g({ durum: 'calisiyor', calisma: 'durakli', fasonda: true })).statu, 'duraklatildi');
    assert.equal(adimSistemStatusu(g({ durum: 'tamam', fasonda: true })).statu, 'bitti');
    assert.deepEqual(adimSistemStatusu(g({ oncekiBekleniyor: true }, [['malzeme', 'eksik'], ['cnc', 'eksik']])),
      { statu: 'program', nedenler: ['CNC kurulumu (NC) eksik', 'Malzeme eksik', 'Önceki adım bitmedi'] });
    assert.equal(adimSistemStatusu(g({}, [['cizim', 'eksik'], ['makine', 'eksik']])).statu, 'cizim');
    assert.equal(adimSistemStatusu(g({}, [['malzeme', 'eksik']])).statu, 'malzeme');
    assert.equal(adimSistemStatusu(g({}, [['cnc', 'muaf'], ['rota', 'eksik']])).statu, 'baslayabilir', 'muaf ve elle onaylı madde eksik değil; rota statü vermez');
    assert.equal(adimSistemStatusu(g({ oncekiBekleniyor: true })).statu, 'onceki');
  });

  test('önceki adım: bekleyen bağımlılıkta öncül bitmeli, akışlıda başlamış olmalı, bağımsız beklemez; dal öncülleri sıradan önce gelir', () => {
    const hepsi = [{ id: 1, sira: 1, durum: 'calisiyor' as const }, { id: 2, sira: 2, durum: 'bekliyor' as const }, { id: 3, sira: 3, durum: 'bekliyor' as const }];
    assert.equal(oncekiBekleniyor({ sira: 2, bagimlilik: 'bekleyen', oncul: null }, hepsi), true);
    assert.equal(oncekiBekleniyor({ sira: 2, bagimlilik: 'akisli', oncul: null }, hepsi), false);
    assert.equal(oncekiBekleniyor({ sira: 3, bagimlilik: 'akisli', oncul: null }, hepsi), true, 'sıradaki ikinci adım başlamadı');
    assert.equal(oncekiBekleniyor({ sira: 3, bagimlilik: 'bagimsiz', oncul: null }, hepsi), false);
    assert.equal(oncekiBekleniyor({ sira: 3, bagimlilik: 'akisli', oncul: [1] }, hepsi), false, 'dal öncülü başlamış');
    assert.equal(oncekiBekleniyor({ sira: 1, bagimlilik: 'bekleyen', oncul: [] }, hepsi), false, 'dal başı');
  });

  test('elle statü sistem statüsü değişince düşer; kaldırma son satırdır', () => {
    const yaz = { olay: 'yaz' as const, sistemStatusu: 'program' };
    assert.equal(acikElleStatu([yaz], 'program'), yaz);
    assert.equal(acikElleStatu([yaz], 'baslayabilir'), null, 'sistem statüsü değişti');
    assert.equal(acikElleStatu([yaz, { olay: 'kaldir' as const, sistemStatusu: null }], 'program'), null);
    assert.equal(acikElleStatu([], 'program'), null);
  });

  test('açık onay madde başına son satırdır; onaylanan sürüm değişince geçmez, sürüm bilinmiyorsa geçer', () => {
    const d = [
      { madde: 'cnc', olay: 'onay' as const }, { madde: 'cizim', olay: 'onay' as const }, { madde: 'cnc', olay: 'kaldir' as const },
    ];
    assert.deepEqual([...acikOnaylar(d).keys()], ['cizim']);
    assert.equal(onayGecerliMi(null, 'r2'), true);
    assert.equal(onayGecerliMi('r1', null), false, 'onaylanan revizyon yayından kalktı');
    assert.equal(onayGecerliMi('r1', undefined), false, 'çizim çıkarıldı, sürüm okunmuyor');
    assert.equal(onayGecerliMi(null, null), true);
    assert.equal(onayGecerliMi('r1', 'r1'), true);
    assert.equal(onayGecerliMi('r1', 'r2'), false);
  });

  test('2893-2 b: durduran maddede gerekçe zorunlu, uyaranda değil; tamam, muaf ve gerekmeyen madde onaylanmaz', () => {
    assert.equal(hazirlikOnayiReddi('cnc', 'eksik', null), GEREKCE_GEREK);
    assert.equal(hazirlikOnayiReddi('yayin', 'eksik', ''), GEREKCE_GEREK);
    assert.equal(hazirlikOnayiReddi('cizim', 'eksik', ' ok  '), GEREKCE_GEREK, 'beş karakterden kısa');
    assert.equal(hazirlikOnayiReddi('cizim', 'eksik', 'Rev onaylı'), null);
    assert.equal(hazirlikOnayiReddi('cizim', 'eksik', 'Müşteri onayı geldi'), null);
    assert.equal(hazirlikOnayiReddi('malzeme', 'eksik', null), null);
    assert.equal(hazirlikOnayiReddi('malzeme', 'bilinmiyor', null), null);
    for (const h of ['tamam', 'muaf', 'gerekmez'] as const) assert.equal(hazirlikOnayiReddi('cnc', h, 'x'), ONAY_GEREKSIZ, h);
  });
});
