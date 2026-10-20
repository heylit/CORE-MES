import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  kolEmirNo,
  ACIK_DEGIL, ADIMLI_IPTAL_DURUMU, DEVIR_TUTARSIZ, FASON_BITTI, FASON_DEGIL, FASON_DISARIDA, FASON_DONUSSUZ, FASON_DONUS_ASIMI, FASON_GIDIS_ASIMI,
  FASON_KAYNAGI_SABIT, FASON_SIRASI_DEGIL, FASON_TERMINSIZ, IS_EMIRSIZ, KAYNAK_BEKLEYENDE, OP_YINELENDI, PLANA_AL_DURUMU, SIRA_YINELENDI,
  TERMIN_FASON_DISI, TESLIM_ONCE, acikEmirIhlali, adimliIptalIhlali, fasonDonusIhlali, fasonGidisIhlali, fasonTamamIhlali, gorunenDurum,
  guvenliUygula, oneDusenYeniAdimlar, isEmirleriIhlali, kaynakDegisimIhlali, kisininIstasyonu, malzemeIhtiyaci, planaAlIhlali, siradakiIsEmri, teslimIhlali,
  BIRLESTIRME_ADIM, BIRLESTIRME_ADIMLAR_FARKLI, BIRLESTIRME_AKRABA_DEGIL, BIRLESTIRME_ALT_PARTILI, BIRLESTIRME_KENDISI, BIRLESTIRME_KOK,
  BIRLESTIRME_TASLAK, BOLME_ADET, BOLME_ADIM_YOK, BOLME_BASLAMIS, birlestirmeIhlali, bolmeIhlali, eldekiAdet,
  BIRLESME_ADIMI_BASLAMIS, BIRLESME_ADIMI_YOK, BIRLESME_BEKLENIYOR, BIRLESME_GELMEDI, BIRLESME_KOL_ILERLEDI, BIRLESME_PLANI_KOLDA,
  BIRLESME_PLANI_VAR, BIRLESME_PLANI_YOK, BIRLESTIRME_EK_ADIM, BOLME_BIRLESME_ADIMI, EK_ADIM_BASLAMIS, EK_ADIM_KALDIR_BASLAMIS, EK_ADIM_KOLDA,
  EK_ADIM_OP, EK_ADIM_ROTA, EK_ADIM_YERI_YOK, KOL_ALT_PARTILI, KOL_ONCEKI_BITMEDI, birlesmeBeklemeIhlali, birlesmePlaniIhlali,
  birlesmePlaniKaldirIhlali, ekAdimIhlali, ekAdimKaldirIhlali, kolBaslamaIhlali,
  IS_EMRI_YOK, ROTALI_EMIR_ADIMI, ROTASIZ_ADIM_BASLAMIS, adimAdetleri, bilesenOlabilirMi, rotasizAdimDegisimIhlali, rotasizAdimEkleIhlali,
} from './kurallar.ts';
import type { BirlestirmeTarafi, BolmeDurumu, FasonDurumu, IsEmriGirdisiOzeti, KolDurumu } from './kurallar.ts';

const ie = (ek: Partial<IsEmriGirdisiOzeti> = {}): IsEmriGirdisiOzeti => ({
  sira: 1, opNo: 10, kaynakTuru: 'makine', ayarSuresiDk: '5', birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, ...ek,
});
const fason = (ek: Partial<FasonDurumu> = {}): FasonDurumu => ({
  durum: 'calisiyor', fason: true, siradaki: true, gonderilen: 0, donenSaglam: 0, donenHurda: 0, gonderilebilir: 10, ...ek,
});

describe('uretim-emirleri iş emri kuralları', () => {
  test('sıradaki iş emri sıraca bitmemiş ilk iş emridir; hepsi bittiyse yok', () => {
    const liste = [{ sira: 3, durum: 'bekliyor' as const }, { sira: 1, durum: 'tamam' as const }, { sira: 2, durum: 'calisiyor' as const }];
    assert.equal(siradakiIsEmri(liste)?.sira, 2);
    assert.equal(siradakiIsEmri([{ sira: 1, durum: 'tamam' as const }]), null);
    assert.equal(siradakiIsEmri([]), null);
  });

  test('görünen durum: planlı emir bir iş emri başladıysa üretimdedir; öbür durumlar değişmez', () => {
    assert.equal(gorunenDurum('planli', true), 'basladi');
    assert.equal(gorunenDurum('planli', false), 'planli');
    for (const d of EMIR_DURUMLARI.filter((x) => x !== 'planli')) assert.equal(gorunenDurum(d, true), d);
  });

  test('iş emirleri: boş, yinelenen op ya da sıra, fasonda süre ya da terminsizlik, fason dışında termin, tutarsız devir reddedilir', () => {
    assert.equal(isEmirleriIhlali([ie()]), null);
    assert.equal(isEmirleriIhlali([ie({ kaynakTuru: 'fason', ayarSuresiDk: null, birimSureDk: null, terminGun: 3 })]), null);
    assert.equal(isEmirleriIhlali([ie({ kaynakTuru: null })]), null, 'atanmamış iş emri geçerlidir');
    assert.equal(isEmirleriIhlali([ie({ bagimlilik: 'akisli', devirAdedi: 5 })]), null);
    assert.equal(isEmirleriIhlali([]), IS_EMIRSIZ);
    assert.equal(isEmirleriIhlali([ie(), ie({ sira: 2 })]), OP_YINELENDI);
    assert.equal(isEmirleriIhlali([ie(), ie({ opNo: 20 })]), SIRA_YINELENDI);
    assert.equal(isEmirleriIhlali([ie({ kaynakTuru: 'fason', terminGun: null, ayarSuresiDk: null, birimSureDk: null })]), FASON_TERMINSIZ);
    assert.equal(isEmirleriIhlali([ie({ kaynakTuru: 'fason', terminGun: 3 })]), FASON_TERMINSIZ, 'fasonda süre olmaz');
    assert.equal(isEmirleriIhlali([ie({ terminGun: 3 })]), TERMIN_FASON_DISI);
    assert.equal(isEmirleriIhlali([ie({ bagimlilik: 'akisli' })]), DEVIR_TUTARSIZ);
    assert.equal(isEmirleriIhlali([ie({ devirAdedi: 5 })]), DEVIR_TUTARSIZ);
    assert.equal(isEmirleriIhlali([ie({ bagimlilik: 'akisli', devirAdedi: 0 })]), DEVIR_TUTARSIZ);
  });

  test('teslim başlangıçtan önce olamaz; eşit ya da boş geçer', () => {
    assert.equal(teslimIhlali('2026-11-02', '2026-11-01'), TESLIM_ONCE);
    assert.equal(teslimIhlali('2026-11-01', '2026-11-01'), null);
    assert.equal(teslimIhlali(null, '2026-11-01'), null);
    assert.equal(teslimIhlali('2026-11-01', null), null);
  });

  test('plana al yalnız arşivde olmayan taslakta', () => {
    assert.equal(planaAlIhlali('taslak', false), null);
    assert.equal(planaAlIhlali('taslak', true), PLANA_AL_DURUMU);
    for (const d of EMIR_DURUMLARI.filter((x) => x !== 'taslak')) assert.equal(planaAlIhlali(d, false), PLANA_AL_DURUMU, d);
  });

  test('iptal yalnız hiç iş emri başlamamış taslak ya da planlı emirde', () => {
    assert.equal(adimliIptalIhlali('taslak', false, false), null);
    assert.equal(adimliIptalIhlali('planli', false, false), null);
    assert.equal(adimliIptalIhlali('planli', false, true), ADIMLI_IPTAL_DURUMU);
    assert.equal(adimliIptalIhlali('planli', true, false), ADIMLI_IPTAL_DURUMU);
    for (const d of ['basladi', 'bitti', 'iptal'] as const) assert.equal(adimliIptalIhlali(d, false, false), ADIMLI_IPTAL_DURUMU, d);
  });

  test('açık emir: taslak, planlı ve başlamış; bitmiş, iptal ve arşiv değil', () => {
    for (const d of ['taslak', 'planli', 'basladi'] as const) assert.equal(acikEmirIhlali(d, false), null, d);
    for (const d of ['bitti', 'iptal'] as const) assert.equal(acikEmirIhlali(d, false), ACIK_DEGIL, d);
    assert.equal(acikEmirIhlali('planli', true), ACIK_DEGIL);
  });

  test('kaynak yalnız bekleyen, fason olmayan iş emrinde değişir', () => {
    assert.equal(kaynakDegisimIhlali({ durum: 'bekliyor', kaynakTuru: null }), null);
    assert.equal(kaynakDegisimIhlali({ durum: 'bekliyor', kaynakTuru: 'kisi' }), null);
    assert.equal(kaynakDegisimIhlali({ durum: 'calisiyor', kaynakTuru: 'makine' }), KAYNAK_BEKLEYENDE);
    assert.equal(kaynakDegisimIhlali({ durum: 'tamam', kaynakTuru: 'makine' }), KAYNAK_BEKLEYENDE);
    assert.equal(kaynakDegisimIhlali({ durum: 'bekliyor', kaynakTuru: 'fason' }), FASON_KAYNAGI_SABIT);
  });

  test('kişinin istasyonu en büyük yüzdeli atamadır; eşitlikte küçük istasyon; ataması yoksa yok', () => {
    const atamalar = [
      { kisiId: 1, istasyonId: 9, yuzde: '40' }, { kisiId: 1, istasyonId: 7, yuzde: '60' }, { kisiId: 2, istasyonId: 5, yuzde: '50' },
      { kisiId: 2, istasyonId: 3, yuzde: '50.00' },
    ];
    assert.equal(kisininIstasyonu(atamalar, 1), 7);
    assert.equal(kisininIstasyonu(atamalar, 2), 3);
    assert.equal(kisininIstasyonu(atamalar, 4), null);
  });

  test('fason gidiş: sıradaki fason iş emrine, gönderilebilecek adede kadar; kısmi gönderim serbest', () => {
    assert.equal(fasonGidisIhlali(fason({ durum: 'bekliyor' }), 10), null);
    assert.equal(fasonGidisIhlali(fason({ gonderilen: 4 }), 6), null);
    assert.equal(fasonGidisIhlali(fason({ gonderilen: 4 }), 7), FASON_GIDIS_ASIMI);
    assert.equal(fasonGidisIhlali(fason({ fason: false }), 1), FASON_DEGIL);
    assert.equal(fasonGidisIhlali(fason({ siradaki: false }), 1), FASON_SIRASI_DEGIL);
    assert.equal(fasonGidisIhlali(fason({ durum: 'tamam' }), 1), FASON_BITTI);
  });

  test('fason dönüş: dönen (sağlam + hurda) gönderileni aşamaz', () => {
    assert.equal(fasonDonusIhlali(fason({ gonderilen: 5 }), 4, 1), null);
    assert.equal(fasonDonusIhlali(fason({ gonderilen: 5, donenSaglam: 3 }), 2, 1), FASON_DONUS_ASIMI);
    assert.equal(fasonDonusIhlali(fason({ fason: false, gonderilen: 5 }), 1, 0), FASON_DEGIL);
  });

  test('fason tamamlama: en az bir dönüş ve dışarıda parça kalmamış olmalı', () => {
    assert.equal(fasonTamamIhlali(fason({ gonderilen: 5, donenSaglam: 4, donenHurda: 1 })), null);
    assert.equal(fasonTamamIhlali(fason({ gonderilen: 5 })), FASON_DONUSSUZ);
    assert.equal(fasonTamamIhlali(fason({ gonderilen: 5, donenSaglam: 4 })), FASON_DISARIDA);
    assert.equal(fasonTamamIhlali(fason({ durum: 'tamam', gonderilen: 5, donenSaglam: 5 })), FASON_BITTI);
  });

  test('güvenli uygulama: başlamış korunur ve önde kalır; bekleyen güncellenir ya da çıkar; yeni eklenir', () => {
    const p = guvenliUygula(
      [{ opNo: 10, sira: 1, durum: 'tamam' }, { opNo: 20, sira: 2, durum: 'calisiyor' }, { opNo: 30, sira: 3, durum: 'bekliyor' }, { opNo: 40, sira: 4, durum: 'bekliyor' }],
      [{ opNo: 40 }, { opNo: 10 }, { opNo: 50 }],
    );
    assert.deepEqual(p, { koru: [10, 20], guncelle: [40], sil: [30], ekle: [50], sira: [10, 20, 40, 50] });
  });

  test('güvenli uygulama: yeni adım başlamış ya da bitmiş adımın önüne düşüyorsa eklenmez; arasına ya da sona düşen eklenir', () => {
    const emir = [{ opNo: 10, sira: 1, durum: 'tamam' as const }, { opNo: 20, sira: 2, durum: 'bekliyor' as const }, { opNo: 30, sira: 3, durum: 'bekliyor' as const }];
    const rota = (...oplar: number[]) => oplar.map((opNo) => ({ opNo }));
    const onde = (r: { opNo: number }[], e: Parameters<typeof guvenliUygula>[0] = emir) => oneDusenYeniAdimlar(guvenliUygula(e, r), r);
    assert.deepEqual(onde(rota(10, 20, 30, 40)), [], 'sona');
    assert.deepEqual(onde(rota(10, 15, 20, 30)), [], 'başlamamış bölgeye');
    assert.deepEqual(onde(rota(5, 10, 20, 30)), [5], 'bitmiş adımın önüne');
    const calisan = [{ opNo: 10, sira: 1, durum: 'tamam' as const }, { opNo: 20, sira: 2, durum: 'calisiyor' as const }, { opNo: 30, sira: 3, durum: 'bekliyor' as const }];
    assert.deepEqual(onde(rota(10, 15, 20, 30, 40), calisan), [15], 'çalışan adımın önüne');
    assert.deepEqual(onde(rota(10, 20, 25, 30), calisan), []);
  });

  test('malzeme ihtiyacı: adım miktarı sonraki fire paylarıyla büyür, bileşen firesi eklenir; iş emri olmayan bileşen sayılmaz', () => {
    const ie = [{ id: 7, sira: 2, opNo: 20, firePayiYuzde: 20 }, { id: 5, sira: 1, opNo: 10, firePayiYuzde: 0 }];
    const b = [
      { isEmriId: 5, malzemeNo: 300, miktar: 2, fireYuzde: 10 },
      { isEmriId: 7, malzemeNo: 100, miktar: 0.5, fireYuzde: 0 },
      { isEmriId: 99, malzemeNo: 1, miktar: 1, fireYuzde: 0 },
    ];
    const m = malzemeIhtiyaci(8, ie, b);
    assert.deepEqual(m.map((x) => [x.opNo, x.malzemeNo]), [[10, 300], [20, 100]]);
    assert.ok(Math.abs((m[0]?.brut ?? 0) - 22) < 1e-9, 'op 10: 8 / 0.8 = 10 adım; 10 x 2 x 1.1 = 22');
    assert.ok(Math.abs((m[1]?.brut ?? 0) - 5) < 1e-9, 'op 20: 8 / 0.8 = 10 adım; 10 x 0.5 = 5');
    assert.deepEqual(malzemeIhtiyaci(5, [], b), []);
  });

  test('malzeme ihtiyacı: alt partinin adedi bölündüğü sıradan önceki adımlara eklenir; bölmeden önce ve sonra toplam aynıdır', () => {
    const ie = [{ id: 1, sira: 1, opNo: 10, firePayiYuzde: 0 }, { id: 2, sira: 2, opNo: 20, firePayiYuzde: 0 }];
    const b = [{ isEmriId: 1, malzemeNo: 100, miktar: 2, fireYuzde: 0 }, { isEmriId: 2, malzemeNo: 200, miktar: 1, fireYuzde: 0 }];
    const once = malzemeIhtiyaci(10, ie, b);
    // 4 adet sıra 2'den bölündü: üst 6 adet, op 10'u 10 adet için yapmıştır; alt parti yalnız op 20'yi taşır.
    const ust = malzemeIhtiyaci(6, ie, b, [{ bolunmeSira: 2, adet: 4 }]);
    const alt = malzemeIhtiyaci(4, [ie[1]!], b);
    assert.deepEqual(ust.map((x) => [x.opNo, x.brut]), [[10, 20], [20, 6]]);
    assert.deepEqual(alt.map((x) => [x.opNo, x.brut]), [[20, 4]]);
    const toplam = (l: { brut: number }[]) => l.reduce((t, x) => t + x.brut, 0);
    assert.equal(toplam(ust) + toplam(alt), toplam(once));
    assert.deepEqual(malzemeIhtiyaci(6, ie, b, [{ bolunmeSira: 1, adet: 4 }]).map((x) => x.brut), [12, 6], 'ilk adımdan bölünen üstte sayılmaz');
  });

  test('UE-PB9 malzeme: planlı birleşmeli kol birleşme adımını taşımaz, üst o adımı kol için de yapar; toplam değişmez', () => {
    const ie = [1, 2, 3].map((n) => ({ id: n, sira: n, opNo: n * 10, firePayiYuzde: 0 }));
    const b = ie.map((i) => ({ isEmriId: i.id, malzemeNo: 100 + i.id, miktar: 1, fireYuzde: 0 }));
    const toplam = (l: { brut: number }[]) => l.reduce((t, x) => t + x.brut, 0);
    // 10 adet, 4'ü sıra 2'den bölündü ve sıra 3'te (op 30) birleşecek: kol yalnız op 20'yi taşır.
    const ust = malzemeIhtiyaci(6, ie, b, [{ bolunmeSira: 2, adet: 4, birlesmeSira: 3 }]);
    const kol = malzemeIhtiyaci(4, [ie[1]!], b);
    assert.deepEqual(ust.map((x) => [x.opNo, x.brut]), [[10, 10], [20, 6], [30, 10]]);
    assert.equal(toplam(ust) + toplam(kol), toplam(malzemeIhtiyaci(10, ie, b)));
    // Ret ayağı: birleşme sırası yok sayılsaydı op 30 yalnız 6 adet sayardı.
    assert.notDeepEqual(malzemeIhtiyaci(6, ie, b, [{ bolunmeSira: 2, adet: 4 }]).map((x) => x.brut), ust.map((x) => x.brut));
  });

  test('parti bölme (UE-PB1, UE-PB3): bölünen ve sonrakiler başlamamış; önceki adımın bitmesi gerekmez; adet elde kalandan az', () => {
    const d = (ek: Partial<BolmeDurumu> = {}): BolmeDurumu => ({
      durum: 'planli', arsiv: false, adet: 10, ayniSiradanBolunen: 0,
      isEmirleri: [{ sira: 1, opNo: 10, durum: 'tamam', saglamAdet: 9 }, { sira: 2, opNo: 20, durum: 'bekliyor', saglamAdet: null }, { sira: 3, opNo: 30, durum: 'bekliyor', saglamAdet: null }],
      ...ek,
    });
    assert.equal(bolmeIhlali(d(), 2, 4), null);
    assert.equal(eldekiAdet(d(), 2), 9, 'fireyle önceki adımın sağlamı');
    assert.equal(eldekiAdet(d({ ayniSiradanBolunen: 3 }), 2), 6, 'aynı sıradan bölünmüş olan düşülür');
    assert.equal(eldekiAdet(d(), 1), 10, 'ilk adımda emir adedi');
    assert.equal(bolmeIhlali(d(), 2, 9), BOLME_ADET, 'üstte en az bir adet kalır');
    assert.equal(bolmeIhlali(d(), 2, 8), null);
    assert.equal(bolmeIhlali(d(), 2, 0), BOLME_ADET);
    assert.equal(bolmeIhlali(d(), 2, 1.5), BOLME_ADET);
    assert.equal(bolmeIhlali(d({ ayniSiradanBolunen: 5 }), 2, 4), BOLME_ADET);
    assert.equal(bolmeIhlali(d(), 4, 1), BOLME_ADIM_YOK);
    assert.equal(bolmeIhlali(d(), 3, 1), null, 'ileri adımdan bölme: önceki adım bitmemiş olabilir (PB-K2)');
    assert.equal(eldekiAdet(d(), 3), 10, 'önceki adım bitmemişse elde kalan emir adedidir');
    assert.equal(bolmeIhlali(d(), 3, 9), null);
    assert.equal(bolmeIhlali(d(), 3, 10), BOLME_ADET);
    const calisan = d({ isEmirleri: [{ sira: 1, opNo: 10, durum: 'calisiyor', saglamAdet: null }, { sira: 2, opNo: 20, durum: 'bekliyor', saglamAdet: null }] });
    assert.equal(bolmeIhlali(calisan, 1, 2), BOLME_BASLAMIS);
    assert.equal(bolmeIhlali(calisan, 2, 2), null, 'çalışan adımın arkasındaki adımdan bölünür');
    assert.equal(bolmeIhlali(d(), 2, 2, 30), null, 'planlı birleşme adımı bölünen adımdan sonra');
    assert.equal(bolmeIhlali(d(), 2, 2, 20), BOLME_BIRLESME_ADIMI, 'bölünen adımın kendisi birleşme adımı olamaz');
    assert.equal(bolmeIhlali(d(), 2, 2, 10), BOLME_BIRLESME_ADIMI);
    assert.equal(bolmeIhlali(d(), 2, 2, 99), BOLME_BIRLESME_ADIMI);
    // UE-PB7: bu adımda katılmış kolun sağlamı elde kalana girer.
    assert.equal(eldekiAdet(d({ adet: 14, birlesenGelen: 3 }), 2), 12);
    assert.equal(bolmeIhlali(d({ durum: 'bitti' }), 2, 2), ACIK_DEGIL);
    assert.equal(bolmeIhlali(d({ durum: 'taslak' }), 2, 2), null, 'taslak emir de bölünür');
  });

  test('parti birleştirme: alt parti üst emrine ya da aynı adımdan bölünmüş kardeşine, ikisi aynı adımda beklerken', () => {
    const adimlar = [{ sira: 2, opNo: 20, durum: 'bekliyor' as const }, { sira: 3, opNo: 30, durum: 'bekliyor' as const }];
    const ust: BirlestirmeTarafi = {
      id: 1, durum: 'planli', arsiv: false, ustEmirId: null, bolunmeSira: null, acikAltPartiVar: true,
      isEmirleri: [{ sira: 1, opNo: 10, durum: 'tamam' }, ...adimlar],
    };
    const alt: BirlestirmeTarafi = { id: 2, durum: 'planli', arsiv: false, ustEmirId: 1, bolunmeSira: 2, acikAltPartiVar: false, isEmirleri: adimlar };
    const kardes: BirlestirmeTarafi = { ...alt, id: 3 };
    assert.equal(birlestirmeIhlali(alt, ust), null);
    assert.equal(birlestirmeIhlali(alt, kardes), null);
    assert.equal(birlestirmeIhlali(alt, alt), BIRLESTIRME_KENDISI);
    assert.equal(birlestirmeIhlali(ust, alt), BIRLESTIRME_KOK);
    assert.equal(birlestirmeIhlali({ ...alt, acikAltPartiVar: true }, ust), BIRLESTIRME_ALT_PARTILI);
    assert.equal(birlestirmeIhlali(alt, { ...kardes, bolunmeSira: 3 }), BIRLESTIRME_AKRABA_DEGIL, 'başka adımdan bölünmüş kardeş');
    assert.equal(birlestirmeIhlali(alt, { ...kardes, ustEmirId: 9 }), BIRLESTIRME_AKRABA_DEGIL);
    assert.equal(birlestirmeIhlali(alt, { ...kardes, durum: 'taslak' }), BIRLESTIRME_TASLAK);
    const ilerlemis = { ...kardes, isEmirleri: [{ sira: 2, opNo: 20, durum: 'tamam' as const }, { sira: 3, opNo: 30, durum: 'bekliyor' as const }] };
    assert.equal(birlestirmeIhlali(alt, ilerlemis), BIRLESTIRME_ADIM, 'farklı adımda');
    const calisan = { ...kardes, isEmirleri: [{ sira: 2, opNo: 20, durum: 'calisiyor' as const }, { sira: 3, opNo: 30, durum: 'bekliyor' as const }] };
    assert.equal(birlestirmeIhlali(alt, calisan), BIRLESTIRME_ADIM, 'adım başlamış');
    assert.equal(birlestirmeIhlali(alt, { ...kardes, isEmirleri: [adimlar[0]!, { sira: 3, opNo: 40, durum: 'bekliyor' }] }), BIRLESTIRME_ADIMLAR_FARKLI);
    assert.equal(birlestirmeIhlali(alt, { ...ust, durum: 'bitti' }), ACIK_DEGIL);
    // UE-PB5: kolda bitmiş rework sıraları kaydırır, op aynı adımı gösterir; bitmemiş ek adım birleşmeyi tutar.
    const reworklu: BirlestirmeTarafi = {
      ...alt, isEmirleri: [{ sira: 1, opNo: 15, durum: 'tamam', tur: 'rework' }, { sira: 2, opNo: 20, durum: 'bekliyor' }, { sira: 3, opNo: 30, durum: 'bekliyor' }],
    };
    assert.equal(birlestirmeIhlali(reworklu, ust), null);
    const bekleyenRework: BirlestirmeTarafi = {
      ...alt, isEmirleri: [{ sira: 1, opNo: 20, durum: 'bekliyor' }, { sira: 2, opNo: 25, durum: 'bekliyor', tur: 'tamir' }, { sira: 3, opNo: 30, durum: 'bekliyor' }],
    };
    assert.equal(birlestirmeIhlali(bekleyenRework, ust), BIRLESTIRME_EK_ADIM);
  });

  const kol = (ek: Partial<KolDurumu> = {}): KolDurumu => ({
    ustEmirId: 1, birlesmeOpNo: null, durum: 'planli', arsiv: false, acikAltPartiVar: false,
    isEmirleri: [{ sira: 1, opNo: 20, durum: 'tamam' }, { sira: 2, opNo: 30, durum: 'bekliyor' }, { sira: 3, opNo: 40, durum: 'bekliyor' }],
    ...ek,
  });

  test('UE-PB4 ek adım: yalnız kola, başlamamış bölgeye, komşu op numaraları arasına; ek adım çıkarılır, rota adımı çıkmaz', () => {
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 20, opNo: 25 }), null, 'bitmiş adımla bekleyen adımın arasına');
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 40, opNo: 45 }), null, 'kolun sonuna');
    assert.equal(ekAdimIhlali(kol({ ustEmirId: null }), { oncekiOpNo: 20, opNo: 25 }), EK_ADIM_KOLDA);
    assert.equal(ekAdimIhlali(kol({ acikAltPartiVar: true }), { oncekiOpNo: 20, opNo: 25 }), KOL_ALT_PARTILI);
    assert.equal(ekAdimIhlali(kol({ durum: 'bitti' }), { oncekiOpNo: 20, opNo: 25 }), ACIK_DEGIL);
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 99, opNo: 25 }), EK_ADIM_YERI_YOK);
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: null, opNo: 15 }), EK_ADIM_BASLAMIS, 'bitmiş adımın önüne girmez');
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 20, opNo: 30 }), EK_ADIM_OP, 'op tekil');
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 20, opNo: 35 }), EK_ADIM_OP, 'sonraki adımın op numarasından küçük');
    assert.equal(ekAdimIhlali(kol(), { oncekiOpNo: 30, opNo: 25 }), EK_ADIM_OP, 'önceki adımın op numarasından büyük');
    assert.equal(ekAdimIhlali(kol({ birlesmeOpNo: 50 }), { oncekiOpNo: 40, opNo: 45 }), null);
    assert.equal(ekAdimIhlali(kol({ birlesmeOpNo: 50 }), { oncekiOpNo: 40, opNo: 55 }), EK_ADIM_OP, 'birleşme adımından önce yapılır');
    const calisan = kol({ isEmirleri: [{ sira: 1, opNo: 20, durum: 'calisiyor' }, { sira: 2, opNo: 30, durum: 'calisiyor' }] });
    assert.equal(ekAdimIhlali(calisan, { oncekiOpNo: 20, opNo: 25 }), EK_ADIM_BASLAMIS, 'başlamış adımın önüne girmez');

    const ekli = kol({ isEmirleri: [{ sira: 1, opNo: 20, durum: 'tamam' }, { sira: 2, opNo: 25, durum: 'bekliyor', tur: 'rework' }, { sira: 3, opNo: 30, durum: 'bekliyor' }] });
    assert.equal(ekAdimKaldirIhlali(ekli, 25), null);
    assert.equal(ekAdimKaldirIhlali(ekli, 30), EK_ADIM_ROTA);
    assert.equal(ekAdimKaldirIhlali(ekli, 99), 'İş emri bulunamadı.');
    assert.equal(ekAdimKaldirIhlali({ ...ekli, isEmirleri: [{ sira: 1, opNo: 25, durum: 'calisiyor', tur: 'tamir' }] }, 25), EK_ADIM_KALDIR_BASLAMIS);
    assert.equal(ekAdimKaldirIhlali({ ...ekli, isEmirleri: [{ sira: 1, opNo: 25, durum: 'bekliyor', tur: 'ek' }] }, 25), IS_EMIRSIZ, 'kolda en az bir adım kalır');
    assert.equal(ekAdimKaldirIhlali({ ...ekli, ustEmirId: null }, 25), EK_ADIM_KOLDA);
  });

  test('UE-PB8 birleşme planı: kolda, üstte bölünme adımından sonra gelen başlamamış adıma; kolun önünde bitmemiş adım kalır', () => {
    const ust = { durum: 'planli' as const, arsiv: false, isEmirleri: [1, 2, 3, 4].map((n) => ({ sira: n, opNo: n * 10, durum: n === 1 ? 'tamam' as const : 'bekliyor' as const })) };
    const k = { ...kol({ isEmirleri: [{ sira: 2, opNo: 20, durum: 'bekliyor' }, { sira: 3, opNo: 30, durum: 'bekliyor' }, { sira: 4, opNo: 40, durum: 'bekliyor' }] }), bolunmeSira: 2 };
    assert.equal(birlesmePlaniIhlali(k, ust, 40), null);
    assert.equal(birlesmePlaniIhlali(k, ust, 30), null);
    assert.equal(birlesmePlaniIhlali({ ...k, ustEmirId: null }, ust, 40), BIRLESME_PLANI_KOLDA);
    assert.equal(birlesmePlaniIhlali({ ...k, birlesmeOpNo: 40 }, ust, 30), BIRLESME_PLANI_VAR);
    assert.equal(birlesmePlaniIhlali(k, ust, 20), BIRLESME_ADIMI_YOK, 'bölünme adımının kendisi');
    assert.equal(birlesmePlaniIhlali(k, ust, 99), BIRLESME_ADIMI_YOK);
    const ustBaslamis = { ...ust, isEmirleri: ust.isEmirleri.map((i) => (i.opNo === 40 ? { ...i, durum: 'calisiyor' as const } : i)) };
    assert.equal(birlesmePlaniIhlali(k, ustBaslamis, 40), BIRLESME_ADIMI_BASLAMIS);
    const ilerlemis = { ...k, isEmirleri: [{ sira: 2, opNo: 20, durum: 'tamam' as const }, { sira: 3, opNo: 30, durum: 'tamam' as const }, { sira: 4, opNo: 40, durum: 'bekliyor' as const }] };
    assert.equal(birlesmePlaniIhlali(ilerlemis, ust, 40), BIRLESME_KOL_ILERLEDI, 'önünde bitmemiş adım kalmadı');
    const birlesmeyeGelmis = { ...k, isEmirleri: [{ sira: 2, opNo: 20, durum: 'tamam' as const }, { sira: 3, opNo: 30, durum: 'calisiyor' as const }] };
    assert.equal(birlesmePlaniIhlali(birlesmeyeGelmis, ust, 30), BIRLESME_KOL_ILERLEDI, 'kol o adımı başlatmış');
    assert.equal(birlesmePlaniKaldirIhlali({ ...k, birlesmeOpNo: 40 }), null);
    assert.equal(birlesmePlaniKaldirIhlali(k), BIRLESME_PLANI_YOK);
    assert.equal(birlesmePlaniKaldirIhlali({ ...k, birlesmeOpNo: 40, acikAltPartiVar: true }), KOL_ALT_PARTILI);
  });

  test('UE-PB6, 6a, UE-PB2: birleşme adımı kol gelmeden bitmez, bekleyende başlamaz, akışlıda başlar; kol üstün önceki adımını bekler', () => {
    const bekleyen = { opNo: 40, bagimlilik: 'bekleyen' as const };
    const akisli = { opNo: 40, bagimlilik: 'akisli' as const };
    assert.equal(birlesmeBeklemeIhlali(bekleyen, [40], 'baslat'), BIRLESME_BEKLENIYOR);
    assert.equal(birlesmeBeklemeIhlali(akisli, [40], 'baslat'), null, 'akışlı adım gelen adet kadar başlar (PB-K3)');
    assert.equal(birlesmeBeklemeIhlali(akisli, [40], 'bitir'), BIRLESME_GELMEDI);
    assert.equal(birlesmeBeklemeIhlali(bekleyen, [], 'baslat'), null, 'kol katıldıktan sonra');
    assert.equal(birlesmeBeklemeIhlali(bekleyen, [30], 'bitir'), null, 'başka adıma katılacak kol bu adımı tutmaz');
    const ustAdimlari = [{ sira: 1, opNo: 10, durum: 'calisiyor' as const }, { sira: 2, opNo: 20, durum: 'bekliyor' as const }];
    assert.equal(kolBaslamaIhlali(2, ustAdimlari), KOL_ONCEKI_BITMEDI);
    assert.equal(kolBaslamaIhlali(2, [{ ...ustAdimlari[0]!, durum: 'tamam' }, ustAdimlari[1]!]), null);
    assert.equal(kolBaslamaIhlali(1, ustAdimlari), null, 'ilk adımdan bölünen kol beklemez');
    assert.equal(kolBaslamaIhlali(null, ustAdimlari), null, 'kol değil');
  });
});

test('UE-N1 kol numarası: üstün numarası ve kaçıncı kol olduğu', () => {
  assert.equal(kolEmirNo('ABC-P12-PARCA-1-26-10-007', 2), 'ABC-P12-PARCA-1-26-10-007/2');
  assert.equal(kolEmirNo(kolEmirNo('UE-000004', 1), 1), 'UE-000004/1/1');
});

test('UE-RA-1..3 rotasız emrin adımı: rotalı ve kapalı emirde değişmez; yer kuralı ek adımınki, birleşme sınırı yok; yalnız bekleyen adım değişir, son adım da silinir', () => {
  const adimlar = [
    { id: 1, sira: 1, opNo: 10, durum: 'tamam' as const },
    { id: 2, sira: 2, opNo: 20, durum: 'bekliyor' as const },
  ];
  const e = (ek: Partial<Parameters<typeof rotasizAdimEkleIhlali>[0]> = {}) => ({ durum: 'basladi' as const, arsiv: false, kaynakRotaRevizyonId: null, isEmirleri: adimlar, ...ek });
  assert.equal(rotasizAdimEkleIhlali(e(), { oncekiOpNo: 10, opNo: 15 }), null);
  assert.equal(rotasizAdimEkleIhlali(e(), { oncekiOpNo: 20, opNo: 900 }), null, 'sona, üst sınır yok');
  assert.equal(rotasizAdimEkleIhlali(e(), { oncekiOpNo: null, opNo: 5 }), EK_ADIM_BASLAMIS, 'bitmiş adımın önüne girmez');
  assert.equal(rotasizAdimEkleIhlali(e(), { oncekiOpNo: 10, opNo: 20 }), EK_ADIM_OP);
  assert.equal(rotasizAdimEkleIhlali(e(), { oncekiOpNo: 30, opNo: 35 }), EK_ADIM_YERI_YOK);
  assert.equal(rotasizAdimEkleIhlali(e({ isEmirleri: [] }), { oncekiOpNo: null, opNo: 10 }), null, 'adımsız emre ilk adım');
  assert.equal(rotasizAdimEkleIhlali(e({ kaynakRotaRevizyonId: 7 }), { oncekiOpNo: 10, opNo: 15 }), ROTALI_EMIR_ADIMI);
  assert.equal(rotasizAdimEkleIhlali(e({ durum: 'bitti' }), { oncekiOpNo: 10, opNo: 15 }), ACIK_DEGIL);
  assert.equal(rotasizAdimEkleIhlali(e({ arsiv: true }), { oncekiOpNo: 10, opNo: 15 }), ACIK_DEGIL);
  assert.equal(rotasizAdimDegisimIhlali(e(), 20), null);
  assert.equal(rotasizAdimDegisimIhlali(e(), 10), ROTASIZ_ADIM_BASLAMIS);
  assert.equal(rotasizAdimDegisimIhlali(e(), 30), IS_EMRI_YOK);
  assert.equal(rotasizAdimDegisimIhlali(e({ isEmirleri: [adimlar[1]!] }), 20), null, 'son adım da silinir');
  assert.equal(rotasizAdimDegisimIhlali(e({ kaynakRotaRevizyonId: 7 }), 20), ROTALI_EMIR_ADIMI);
});

test('UE-RA-1 bileşen: aktif ve girdi olabilen malzeme; ticari mal ve hizmet olmaz', () => {
  assert.equal(bilesenOlabilirMi({ tur: 'hammadde', onayDurumu: 'aktif' }), true);
  assert.equal(bilesenOlabilirMi({ tur: 'yarimamul', onayDurumu: 'aktif' }), true);
  assert.equal(bilesenOlabilirMi({ tur: 'ticari_mal', onayDurumu: 'aktif' }), false);
  assert.equal(bilesenOlabilirMi({ tur: 'hizmet', onayDurumu: 'aktif' }), false);
  assert.equal(bilesenOlabilirMi({ tur: 'hammadde', onayDurumu: 'taslak' }), false);
  assert.equal(bilesenOlabilirMi(undefined), false);
});

test('adım adedi: bitmiş adımın kaybı sonraki adımlara düşer, bitmemiş adımdan geçer, taban aşılmaz', () => {
  const a = (sira: number, durum: string, saglamAdet: number | null = null) => ({ sira, durum, saglamAdet });
  const sabit = () => 40;
  assert.deepEqual([...adimAdetleri([a(1, 'bekliyor'), a(2, 'bekliyor')], sabit)], [[1, 40], [2, 40]]);
  assert.deepEqual([...adimAdetleri([a(2, 'bekliyor'), a(1, 'tamam', 39)], sabit)], [[1, 40], [2, 39]]);
  // OP20 çalışırken kayıp OP30'a da taşınır; OP20 bitince yeni kayıp onun sağlamından.
  assert.deepEqual([...adimAdetleri([a(1, 'tamam', 39), a(2, 'calisiyor'), a(3, 'bekliyor')], sabit)], [[1, 40], [2, 39], [3, 39]]);
  assert.deepEqual([...adimAdetleri([a(1, 'tamam', 39), a(2, 'tamam', 37), a(3, 'bekliyor')], sabit)], [[1, 40], [2, 39], [3, 37]]);
  // Fazla sağlam tabanı aşmaz; sağlamı yazılmamış bitmiş adım kaybı değiştirmez.
  assert.deepEqual([...adimAdetleri([a(1, 'tamam', 42), a(2, 'bekliyor')], sabit)], [[1, 40], [2, 40]]);
  assert.deepEqual([...adimAdetleri([a(1, 'tamam', 38), a(2, 'tamam', null), a(3, 'bekliyor')], sabit)], [[1, 40], [2, 38], [3, 38]]);
  // Kol ikinci adımdan sonra ayrılıyor (taban 50 -> 40): birinci adımdaki 2 kayıp ikinci adımdan, kol ayrılınca kalan 40'tan düşer.
  const kollu = (sira: number) => (sira <= 2 ? 50 : 40);
  assert.deepEqual([...adimAdetleri([a(1, 'tamam', 48), a(2, 'bekliyor'), a(3, 'bekliyor')], kollu)], [[1, 50], [2, 48], [3, 38]]);
});
