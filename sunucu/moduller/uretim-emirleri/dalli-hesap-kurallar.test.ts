import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dalBasiAdedi } from './is-emri-servis.ts';
import { adetOnculleri, eldekiAdet, fasonBeklemesi, gkkFasonu, hataliDurduMu, kartSiniri, kolAdimlari, malzemeIhtiyaci } from './kurallar.ts';
import type { BolmeDurumu } from './kurallar.ts';

// Dallı rota (1248 a): A dalı OP10 -> OP20, B dalı OP30 (dal başı), OP40 ikisini birleştirir. Sıradaki önceki adım başka dalın adımı
// olabildiği için adet, bekleme ve sınır hesapları öncülü listeden okur (kart 1402, B-1..B-3). Listesi olmayan eski emir sıra ile kalır.
const dal = (id: number, sira: number, onculler: number[] | null, ek: Record<string, unknown> = {}) => ({ id, sira, opNo: sira * 10, onculler: onculler?.map((o) => ({ id: o })) ?? null, ...ek });

describe('1402 B-1: malzemeIhtiyaci fire çarpanı öncül zinciriyle', () => {
  const bilesen = [{ isEmriId: 3, malzemeNo: 7, miktar: 1, fireYuzde: 0 }, { isEmriId: 1, malzemeNo: 8, miktar: 1, fireYuzde: 0 }];

  test('A dalının firesi B dalının ihtiyacını büyütmez; A dalı kendi ve ardıllarının firesini taşır', () => {
    const ie = [
      { ...dal(1, 1, []), firePayiYuzde: 0 }, { ...dal(2, 2, [1]), firePayiYuzde: 50 },
      { ...dal(3, 3, []), firePayiYuzde: 0 }, { ...dal(4, 4, [2, 3]), firePayiYuzde: 0 },
    ];
    const m = malzemeIhtiyaci(10, ie, bilesen);
    // Eski hesap B dalına (OP30) A'nın OP20 firesini de katıyordu: 20.
    assert.deepEqual(m.map((x) => [x.opNo, x.brut]), [[10, 20], [30, 10]]);
  });

  test('birleşme adımının firesi iki dala da geçer', () => {
    const ie = [{ ...dal(1, 1, []), firePayiYuzde: 0 }, { ...dal(3, 2, []), firePayiYuzde: 0 }, { ...dal(4, 3, [1, 3]), firePayiYuzde: 50 }];
    assert.deepEqual(malzemeIhtiyaci(10, ie, bilesen).map((x) => x.brut), [20, 20]);
  });

  test('dal çarpanı malzemeyi çarpmaz (1333 a, 1407 a): bileşen miktarı mamul başınadır', () => {
    const ie = [{ ...dal(3, 1, [], { adetCarpani: 2 }), firePayiYuzde: 0 }, { ...dal(4, 2, [3]), firePayiYuzde: 0 }];
    assert.deepEqual(malzemeIhtiyaci(10, ie, bilesen).map((x) => x.brut), [10]);
  });

  test('listesi olmayan eski emirde sonraki bütün adımların firesi (değişmedi)', () => {
    const ie = [{ ...dal(1, 1, null), firePayiYuzde: 0 }, { ...dal(2, 2, null), firePayiYuzde: 50 }, { ...dal(3, 3, null), firePayiYuzde: 0 }];
    assert.deepEqual(malzemeIhtiyaci(10, ie, bilesen).map((x) => [x.opNo, x.brut]), [[10, 20], [30, 10]]);
  });

  test('dallı emrin kolu yalnız bölünen daldan kopyalar; paralel dalın adımı alt partinin adedini de taşır', () => {
    const ie = [
      { ...dal(1, 1, []), firePayiYuzde: 0 }, { ...dal(3, 2, []), firePayiYuzde: 0 }, { ...dal(2, 3, [1]), firePayiYuzde: 0 }, { ...dal(4, 4, [2, 3]), firePayiYuzde: 0 },
    ];
    // OP10 (A) adımından 4 adet kola bölünmüş, OP40'ta birleşir: kol OP10 ve OP20'yi yapar; OP30 (B) ana partide 10 adet için yapılır.
    const m = malzemeIhtiyaci(6, ie, bilesen, [{ bolunmeSira: 1, adet: 4, birlesmeSira: 4 }]);
    assert.deepEqual(m.map((x) => [x.opNo, x.brut]), [[10, 6], [20, 10]]);
  });
});

describe('1402 B-1: dal başına giren adet çarpanla (1257 a)', () => {
  test('dalBasiAdedi', () => {
    assert.equal(dalBasiAdedi(10, { adetCarpani: 2 }), 20);
    assert.equal(dalBasiAdedi(10, { adetCarpani: null }), 10);
  });
});

describe('1402 B-2: fasonBeklemesi öncül zinciriyle', () => {
  const ie = (bitti: boolean) => [
    { ...dal(1, 1, []), fasonFirmaId: null, terminGun: null, durum: bitti ? 'tamam' : 'bekliyor' },
    { ...dal(2, 2, [1]), fasonFirmaId: 5, terminGun: 7, durum: 'bekliyor' },
    { ...dal(3, 3, [1]), fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
    { ...dal(4, 4, [2, 3]), fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
  ];

  test('paralel dal fasonu beklemez, birleşme adımı fasonu bekler (rapordaki senaryo)', () => {
    assert.equal(fasonBeklemesi(ie(true), 3), 0, 'eski hesap 7 veriyordu');
    assert.equal(fasonBeklemesi(ie(true), 4), 7, 'eski hesap 0 veriyordu');
  });

  test('zincirdeki ardışık fasonlar toplanır, iki dalda en uzunu', () => {
    const a = [
      { ...dal(1, 1, []), fasonFirmaId: 5, terminGun: 3, durum: 'bekliyor' },
      { ...dal(2, 2, [1]), fasonFirmaId: 6, terminGun: 4, durum: 'bekliyor' },
      { ...dal(3, 3, []), fasonFirmaId: 7, terminGun: 6, durum: 'bekliyor' },
      { ...dal(4, 4, [2, 3]), fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
    ];
    assert.equal(fasonBeklemesi(a, 4), 7);
  });

  test('eski emirde sıra ile (değişmedi)', () => {
    const a = [
      { ...dal(1, 1, null), fasonFirmaId: null, terminGun: null, durum: 'tamam' },
      { ...dal(2, 2, null), fasonFirmaId: 5, terminGun: 7, durum: 'bekliyor' },
      { ...dal(3, 3, null), fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
      { ...dal(4, 4, null), fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
    ];
    assert.equal(fasonBeklemesi(a, 3), 7);
    assert.equal(fasonBeklemesi(a, 4), 0);
  });
});

describe('1402 B-3: sıra varsayan hesaplar öncül listesiyle', () => {
  test('adetOnculleri: listeli adımda liste, eski adımda sırası bir küçük olan', () => {
    const a = [dal(1, 1, []), dal(3, 2, []), dal(4, 3, [1, 3])];
    assert.deepEqual(adetOnculleri(a, a[1]!), []);
    assert.deepEqual(adetOnculleri(a, a[2]!).map((x) => x.id), [1, 3]);
    assert.deepEqual(adetOnculleri([dal(1, 1, null), dal(2, 2, null)], dal(2, 2, null)).map((x) => x.id), [1]);
  });

  test('eldekiAdet: birleşmede en az gelen dal, çarpan mamule çevrilir', () => {
    const d: BolmeDurumu = {
      durum: 'basladi', arsiv: false, adet: 10, ayniSiradanBolunen: 0,
      isEmirleri: [
        { ...dal(1, 1, []), durum: 'tamam', saglamAdet: 8 },
        { ...dal(3, 2, [], { adetCarpani: 2 }), durum: 'tamam', saglamAdet: 20 },
        { ...dal(4, 3, [1, 3]), durum: 'bekliyor', saglamAdet: null },
      ],
    };
    // Eski hesap sırası bir küçük olan B dalını (20 parça) görüp 10 veriyordu.
    assert.equal(eldekiAdet(d, 3), 8);
    assert.equal(eldekiAdet(d, 2), 10, 'dal başı: emir adedi');
  });

  test('kartSiniri: dal başında sınır yok, birleşmede en az gelen', () => {
    const a = [dal(1, 1, []), dal(3, 2, [], { adetCarpani: 2 }), dal(4, 3, [1, 3])];
    const saglam = (id: number): number => (id === 1 ? 9 : 14);
    assert.equal(kartSiniri(a, 3, [], { malzemeNo: null, verilen: 0 }, saglam), null, 'eski hesap OP10 sağlamını sınır alıyordu');
    assert.equal(kartSiniri(a, 4, [], { malzemeNo: null, verilen: 0 }, saglam), 7);
  });

  test('hataliDurduMu: sağlamsız kalite adımı yalnız kendi ardılını durdurur', () => {
    const a = [
      { ...dal(1, 1, []), durum: 'tamam', saglamAdet: 0 },
      { ...dal(3, 2, []), durum: 'bekliyor', saglamAdet: null },
      { ...dal(2, 3, [1]), durum: 'bekliyor', saglamAdet: null },
    ];
    const kayit = [{ uretimEmriId: 1, hedefEmirId: 1, kaliteIsEmriId: 1, karar: 'hurda' }];
    assert.equal(hataliDurduMu(a, kayit, 3), false, 'paralel dal durmaz; eski hesap durduruyordu');
    assert.equal(hataliDurduMu(a, kayit, 2), true);
  });

  test('gkkFasonu: GKK öncülü fasonsa, arada paralel dal adımı olsa da', () => {
    const a = [
      { ...dal(1, 1, []), operasyonTipiId: 1, fasonFirmaId: 5 },
      { ...dal(3, 2, []), operasyonTipiId: 1, fasonFirmaId: null },
      { ...dal(2, 3, [1]), operasyonTipiId: 9, fasonFirmaId: null },
    ];
    assert.equal(gkkFasonu(a, a[2]!, 9)?.id, 1, 'eski hesap paralel dal adımını görüp null veriyordu');
    assert.equal(gkkFasonu(a, a[1]!, 9), null);
  });

  test('kolAdimlari: dallı emirde yalnız bölünen adımdan zincirle ulaşılanlar; eski emirde sıra aralığı', () => {
    const a = [dal(1, 1, []), dal(3, 2, []), dal(2, 3, [1]), dal(4, 4, [2, 3])];
    assert.deepEqual(kolAdimlari(a, 1, 4).map((x) => x.id), [1, 2]);
    assert.deepEqual(kolAdimlari(a, 1, null).map((x) => x.id), [1, 3, 2, 4], 'birleşmesiz bölme değişmedi');
    const eski = [dal(1, 1, null), dal(2, 2, null), dal(3, 3, null)];
    assert.deepEqual(kolAdimlari(eski, 1, 3).map((x) => x.id), [1, 2]);
  });
});
