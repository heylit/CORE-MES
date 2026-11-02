import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FIRMA_MUSTERI_DEGIL, FIRMA_PASIF, FIRMA_YOK, MALZEME_AKTIF_DEGIL, MALZEME_SATILMAZ, MALZEME_YOK, YALNIZ_TASLAK,
  duzenlemeReddi, firmaReddi, gecisHedefi, gecisReddi, malzemeReddi,
  FIYAT_EKSIK, KARTSIZ_SATIR, KART_BAGLANAMAZ, YALNIZ_YENI_TEKLIF, fiyatReddi, kartBaglamaReddi, kartsizSatirReddi, talepDuzenlemeReddi,
  dortGozReddi, surumHedefi, teklifGecisReddi, teklifHedefi, terminAraligi, terminDagilimi,
  GENEL_GIDER_YOK, denemeCevabi, denemeSuzgeci, gunFarki, adetSatirlari, carpilmisAdet, kalemMaliyeti, kilitler, motorSonucu, motorTaslaklari, planSeridi, onayHedefi, yenidenYerlesirMi,
} from './kurallar.ts';
import type { DenemeKalemi, DenemeSonucu } from './kurallar.ts';

describe('siparisler kuralları (saf)', () => {
  test('termin dağılımı (kart 1773): eksi gecikmiş, sınırlar kapalı; her aralık sırayla ve boşu sıfırla gelir', () => {
    assert.deepEqual([-1, 0, 3, 4, 7, 8, 14, 15].map(terminAraligi), ['gecikmis', '0-3', '0-3', '4-7', '4-7', '8-14', '8-14', '15+']);
    assert.deepEqual(terminDagilimi([{ kalan: -5, sayi: 2 }, { kalan: -1, sayi: 1 }, { kalan: 20, sayi: 4 }]), [
      { aralik: 'gecikmis', sayi: 3 }, { aralik: '0-3', sayi: 0 }, { aralik: '4-7', sayi: 0 }, { aralik: '8-14', sayi: 0 }, { aralik: '15+', sayi: 4 },
    ]);
  });

  test('SIP-01 müşteri ve iki yönlü firma geçer; tedarikçi, olmayan ve yeni seçilen pasif firma reddedilir', () => {
    assert.equal(firmaReddi({ tur: 'musteri', aktif: true }, 1, null), null);
    assert.equal(firmaReddi({ tur: 'ikisi', aktif: true }, 1, null), null);
    assert.equal(firmaReddi({ tur: 'tedarikci', aktif: true }, 1, null), FIRMA_MUSTERI_DEGIL);
    assert.equal(firmaReddi(null, 1, null), FIRMA_YOK);
    assert.equal(firmaReddi({ tur: 'musteri', aktif: false }, 1, null), FIRMA_PASIF);
    assert.equal(firmaReddi({ tur: 'musteri', aktif: false }, 1, 1), null);
  });

  test('SIP-02 aktif mamul, yarı mamul ve ticari mal geçer; hizmet, sarf, onaysız ve olmayan kart reddedilir', () => {
    for (const tur of ['mamul', 'yarimamul', 'ticari_mal']) assert.equal(malzemeReddi({ tur, onayDurumu: 'aktif' }), null);
    assert.equal(malzemeReddi({ tur: 'hizmet', onayDurumu: 'aktif' }), MALZEME_SATILMAZ);
    assert.equal(malzemeReddi({ tur: 'sarf', onayDurumu: 'aktif' }), MALZEME_SATILMAZ);
    assert.equal(malzemeReddi({ tur: 'mamul', onayDurumu: 'taslak' }), MALZEME_AKTIF_DEGIL);
    assert.equal(malzemeReddi(null), MALZEME_YOK);
  });

  test('SIP-03 yalnız taslak düzenlenir', () => {
    assert.equal(duzenlemeReddi('taslak'), null);
    for (const d of ['onayli', 'kapandi', 'iptal'] as const) assert.equal(duzenlemeReddi(d), YALNIZ_TASLAK);
  });

  test('SIP-04 geçişler: taslak onaylanır, onaylı kapanır, taslak ve onaylı iptal edilir; son durumlardan geçiş yok', () => {
    assert.equal(gecisReddi('taslak', 'onayla'), null);
    assert.equal(gecisReddi('onayli', 'kapat'), null);
    assert.equal(gecisReddi('taslak', 'iptal'), null);
    assert.equal(gecisReddi('onayli', 'iptal'), null);
    assert.equal(gecisReddi('onayli', 'onayla'), 'Onaylı sipariş onaylanamaz.');
    assert.equal(gecisReddi('taslak', 'kapat'), 'Taslak sipariş kapatılamaz.');
    assert.equal(gecisReddi('kapandi', 'iptal'), 'Kapanmış sipariş iptal edilemez.');
    assert.equal(gecisReddi('iptal', 'onayla'), 'İptal edilmiş sipariş onaylanamaz.');
    assert.deepEqual([gecisHedefi('onayla'), gecisHedefi('kapat'), gecisHedefi('iptal')], ['onayli', 'kapandi', 'iptal']);
  });
});

describe('teklif kuralları (saf)', () => {
  test('TKL-03 talep yalnız yeni teklifte düzenlenir', () => {
    assert.equal(talepDuzenlemeReddi('yeni'), null);
    for (const d of ['verildi', 'revizyon', 'kabul', 'red', 'siparis'] as const) assert.equal(talepDuzenlemeReddi(d), YALNIZ_YENI_TEKLIF);
  });

  test('TKL-04 her talep satırına tam bir fiyat: eksik, fazla, yinelenen ve yabancı satır reddedilir', () => {
    assert.equal(fiyatReddi([1, 2], [2, 1]), null);
    assert.equal(fiyatReddi([1, 2], [1]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 2, 3]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 1]), FIYAT_EKSIK);
    assert.equal(fiyatReddi([1, 2], [1, 3]), FIYAT_EKSIK);
  });

  test('TKL-05 geçişler', () => {
    assert.equal(teklifGecisReddi('yeni', 'surum'), null);
    assert.equal(teklifGecisReddi('revizyon', 'surum'), null);
    assert.equal(teklifGecisReddi('verildi', 'kabul'), null);
    assert.equal(teklifGecisReddi('verildi', 'revizyon'), null);
    assert.equal(teklifGecisReddi('kabul', 'siparis'), null);
    assert.equal(teklifGecisReddi('yeni', 'kabul'), 'Teklif durumu "yeni"; kabul edilemez.');
    assert.equal(teklifGecisReddi('kabul', 'red'), 'Teklif durumu "kabul edildi"; reddedilemez.');
    assert.equal(teklifGecisReddi('siparis', 'siparis'), 'Teklif durumu "siparişe dönüştü"; siparişe dönüştürülemez.');
    assert.deepEqual((['surum', 'revizyon', 'kabul', 'red', 'siparis'] as const).map(teklifHedefi), ['verildi', 'revizyon', 'kabul', 'red', 'siparis']);
  });

  test('TKL-11 (291 a) eşiği aşan iskonto onay bekler; onay yalnız bekleyen teklife, bekleyen teklif kabul edilmez', () => {
    assert.deepEqual(['0', '9.99', '10', '10.01', '99.99'].map((o) => surumHedefi(o)), ['verildi', 'verildi', 'verildi', 'onay-bekliyor', 'onay-bekliyor']);
    assert.equal(teklifGecisReddi('onay-bekliyor', 'iskonto-onay'), null);
    assert.equal(teklifHedefi('iskonto-onay'), 'verildi');
    assert.equal(teklifGecisReddi('verildi', 'iskonto-onay'), 'Teklif durumu "verildi"; onaylanacak iskonto yok.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'kabul'), 'Teklif durumu "onay bekliyor"; kabul edilemez.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'revizyon'), 'Teklif durumu "onay bekliyor"; revizyon istenemez.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'surum'), null);
    assert.equal(teklifGecisReddi('onay-bekliyor', 'red'), null);
  });

  test('TKL-12 (293) dört göz açıkken sürümü veren onaylayamaz; kapalıyken ya da başkası onaylar', () => {
    assert.equal(dortGozReddi(true, 7, 7), 'Dört göz kuralı açık: kendi verdiğiniz sürümün iskontosunu başka bir yetkili onaylamalı.');
    assert.equal(dortGozReddi(true, 7, 8), null);
    assert.equal(dortGozReddi(false, 7, 7), null);
    assert.equal(dortGozReddi(true, 7, 7, 'termin'), 'Dört göz kuralı açık: kendi verdiğiniz sürümün terminini başka bir yetkili onaylamalı.');
    assert.equal(dortGozReddi(true, 7, 8, 'termin'), null);
  });

  test('TKL-06 kartsız satır siparişe dönüşmez; reddedilmiş ve dönüşmüş teklife kart bağlanmaz', () => {
    assert.equal(kartsizSatirReddi([1, 2]), null);
    assert.equal(kartsizSatirReddi([1, null]), KARTSIZ_SATIR);
    assert.equal(kartBaglamaReddi('kabul'), null);
    assert.equal(kartBaglamaReddi('red'), KART_BAGLANAMAZ);
    assert.equal(kartBaglamaReddi('siparis'), KART_BAGLANAMAZ);
  });
});

describe('teklif termin ve fiyat denemesi kuralları (saf)', () => {
  const islem = (opId: string, d: Partial<DenemeKalemi['islemler'][number]> = {}): DenemeKalemi['islemler'][number] => ({
    opId, tezgah: 'T1', fason: false, baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-01T11:00:00+03:00',
    ayarSaat: 1, islemeSaat: 2, tl: 250, ...d,
  });
  const kalem = (satirId: number, d: Partial<DenemeKalemi> = {}): DenemeKalemi => ({
    satirId, yerlesti: true, bitis: '2099-07-10T16:00:00+03:00', planTermini: '2099-07-14', malzemeTl: 100, malzemeGelisi: null,
    satinalma: [], islemler: [islem(`${satirId}.10`)], eksikVeri: [], ...d,
  });
  const satir = (id: number, malzemeNo: number | null, miktar = '10') => ({ id, sira: id, malzemeNo, tanim: `Kalem ${id}`, miktar });
  const g = { gecerlilik: '2099-06-30', istenenTermin: null, genelGiderSaatBasi: 10 };

  test('TKL-14 maliyet aynı yerleşimden: malzeme, işlem (ayar dahil), fason ve tezgâh saatine genel gider; biri bilinmiyorsa toplam null', () => {
    const m = kalemMaliyeti(kalem(1, { islemler: [islem('1.10'), islem('1.20', { fason: true, tl: 30, ayarSaat: 0, islemeSaat: 0 })] }), 10, 10);
    assert.equal(m.toplam, 100 + 50 + 200 + 30 + 3 * 10);
    assert.equal(m.birim, 41);
    assert.deepEqual(m.dokum.map((d) => [d.tur, d.tutar]), [['malzeme', '100.00'], ['isleme', '250.00'], ['fason', '30.00'], ['genel-gider', '30.00']]);
    assert.equal(kalemMaliyeti(kalem(1, { islemler: [islem('1.10', { tl: null })] }), 10, 10).toplam, null);
    assert.equal(kalemMaliyeti(kalem(1), 10, null).toplam, null);
    assert.equal(kalemMaliyeti(kalem(1, { malzemeTl: null }), 10, 10).toplam, null);
    assert.equal(kalemMaliyeti(kalem(1, { yerlesti: false }), 10, 10).toplam, null);
  });

  test('TKL-13 kartlı kalemler tek denemede: plan termini en geç kalemin; kartsız plansız; yerleşmeyen varsa termin yok; motor yoksa cozucu-yok', () => {
    const sonuc: DenemeSonucu = { planSurumu: '412', kalemler: [kalem(1), kalem(2, { planTermini: '2099-07-20' })], kayanlar: [], plan: null };
    const c = denemeCevabi([satir(1, 11), satir(2, 12), satir(3, null)], sonuc, g);
    assert.equal(c.durum, 'hazir');
    assert.equal(c.planTermini, '2099-07-20');
    assert.equal(c.termin, '2099-07-20');
    assert.equal(c.terminGun, 20);
    assert.equal(c.yetisir, null);
    assert.equal(c.onayGerekli, false);
    assert.deepEqual(c.kalemler.map((k) => [k.plansiz, k.yerlesti]), [[false, true], [false, true], [true, false]]);
    assert.equal(c.maliyetToplami, '760.00');
    assert.equal(c.kalemler[2]?.toplamMaliyet, null);
    const yarim = denemeCevabi([satir(1, 11), satir(2, 12)], { ...sonuc, kalemler: [kalem(1), kalem(2, { yerlesti: false, planTermini: null })] }, g);
    assert.equal(yarim.planTermini, null);
    assert.equal(yarim.maliyetToplami, null);
    assert.equal(denemeCevabi([satir(1, 11)], null, g).durum, 'cozucu-yok');
    const kartsiz = denemeCevabi([satir(3, null)], null, g);
    assert.equal(kartsiz.durum, 'hazir');
    assert.equal(kartsiz.planTermini, null);
    assert.equal(kartsiz.maliyetToplami, null);
    assert.deepEqual(denemeCevabi([satir(1, 11)], sonuc, { ...g, genelGiderSaatBasi: null }).kalemler[0]?.eksikVeri, [GENEL_GIDER_YOK]);
  });

  test('TKL-13 (48 b, 63 b) istenen termin: termin odur, yetişip yetişmediği plandan; başka siparişi geciktiriyorsa plancı onayı', () => {
    const kayan = { siparis: 'S-1', once: '2099-07-01T10:00:00+03:00', sonra: '2099-07-03T10:00:00+03:00', termin: '2099-07-02', gecikir: true };
    const sonuc: DenemeSonucu = { planSurumu: null, kalemler: [kalem(1, { planTermini: '2099-07-08' })], kayanlar: [kayan], plan: null };
    const c = denemeCevabi([satir(1, 11)], sonuc, { ...g, istenenTermin: '2099-07-05' });
    assert.equal(c.termin, '2099-07-05');
    assert.equal(c.planTermini, '2099-07-08');
    assert.equal(c.yetisir, false);
    assert.equal(c.onayGerekli, true);
    assert.equal(denemeCevabi([satir(1, 11)], { ...sonuc, kayanlar: [{ ...kayan, gecikir: false }] }, { ...g, istenenTermin: '2099-07-10' }).onayGerekli, false);
    assert.equal(denemeCevabi([satir(1, 11)], { ...sonuc, kayanlar: [{ ...kayan, gecikir: false }] }, { ...g, istenenTermin: '2099-07-10' }).yetisir, true);
    // Arkaya eklemede kayma bilgidir, onay istemez.
    assert.equal(denemeCevabi([satir(1, 11)], sonuc, g).onayGerekli, false);
    assert.equal(gunFarki('2099-02-27', '2099-03-01'), 2);
  });

  test('TKL-15 (63 b) iskonto ve termin onayı ayrı; teklif ikisi bitmeden verilmez', () => {
    assert.equal(onayHedefi({ iskonto: false, termin: false }), 'verildi');
    assert.equal(onayHedefi({ iskonto: true, termin: false }), 'onay-bekliyor');
    assert.equal(onayHedefi({ iskonto: false, termin: true }), 'onay-bekliyor');
    assert.equal(surumHedefi('0', true), 'onay-bekliyor');
    assert.equal(teklifGecisReddi('verildi', 'termin-onay'), 'Teklif durumu "verildi"; onaylanacak termin yok.');
    assert.equal(teklifGecisReddi('onay-bekliyor', 'termin-onay'), null);
  });

  test('TKL-16 (180, 65 a) maliyet toplamı fiyat görene, döküm ve genel gider oranı maliyet okuyana; termin herkese', () => {
    const c = denemeCevabi([satir(1, 11)], { planSurumu: null, kalemler: [kalem(1)], kayanlar: [], plan: null }, g);
    const hic = denemeSuzgeci(c, { toplam: false, dokum: false });
    assert.equal(hic.termin, c.termin);
    assert.equal(hic.maliyetToplami, null);
    assert.equal(hic.genelGiderSaatBasi, null);
    assert.deepEqual([hic.kalemler[0]?.birimMaliyet, hic.kalemler[0]?.toplamMaliyet, hic.kalemler[0]?.dokum], [null, null, null]);
    const toplam = denemeSuzgeci(c, { toplam: true, dokum: false });
    assert.equal(toplam.maliyetToplami, '380.00');
    assert.equal(toplam.kalemler[0]?.birimMaliyet, '38.0000');
    assert.equal(toplam.kalemler[0]?.dokum, null);
    assert.equal(denemeSuzgeci(c, { toplam: true, dokum: true }).kalemler[0]?.dokum?.length, 3);
  });

  test('TKL-17 (49) yer tutan satış taslağı yalnız istenen termin değişince yeniden yerleşir; geçerliliği geçmişse yeri yoktur', () => {
    assert.equal(yenidenYerlesirMi(null, null), true);
    assert.equal(yenidenYerlesirMi({ istenenTermin: null, gecerli: true }, null), false);
    assert.equal(yenidenYerlesirMi({ istenenTermin: '2099-07-05', gecerli: true }, '2099-07-05'), false);
    assert.equal(yenidenYerlesirMi({ istenenTermin: null, gecerli: true }, '2099-07-05'), true);
    assert.equal(yenidenYerlesirMi({ istenenTermin: '2099-07-05', gecerli: true }, null), true);
    assert.equal(yenidenYerlesirMi({ istenenTermin: null, gecerli: false }, null), true);
    assert.deepEqual(kilitler({ planSurumu: null, kalemler: [kalem(1)], kayanlar: [], plan: null }).map((k) => [k.satirId, k.opId, k.tezgah]), [[1, '1.10', 'T1']]);
  });

  test('TKL-18 motor sonucu satırlara sırayla eşlenir; kayan siparişin gecikmesi anla, termini günle; taslak kilidi motora adım başına gider', () => {
    const islemM = { adim: '10', makineId: 'T1', fason: false, baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-01T11:00:00+03:00', ayarSaat: 1, islemeSaat: 2, tl: 250 };
    const kalemM = (planTermini: string | null) => ({
      tamam: planTermini !== null, bitis: null, planTermini, malzemeTl: 100, satinalma: [], islemler: [islemM], eksik: ['ucret'],
      malzeme: [{ gelis: '2099-07-03T08:00:00+03:00' }, { gelis: null }, { gelis: '2099-07-05T08:00:00+03:00' }],
    });
    const kayan = (sonra: string, termin: string | null) => ({ siparis: 'p-1', emirNo: null, once: '2099-07-01T10:00:00+03:00', sonra, termin });
    const r = motorSonucu([7, 9], {
      kalemler: [kalemM('2099-07-14'), kalemM(null)],
      kayan: [kayan('2099-07-04T10:00:00+03:00', '2099-07-02T23:00:00+03:00'), kayan('2099-07-02T10:00:00+03:00', '2099-07-02T23:00:00+03:00'), kayan('2099-07-04T10:00:00+03:00', null)],
    });
    assert.deepEqual(r.kalemler.map((k) => [k.satirId, k.yerlesti, k.planTermini, k.malzemeGelisi, k.eksikVeri]), [
      [7, true, '2099-07-14', '2099-07-05T08:00:00+03:00', ['ucret']], [9, false, null, '2099-07-05T08:00:00+03:00', ['ucret']],
    ]);
    assert.deepEqual(r.kalemler[0]?.islemler.map((i) => [i.opId, i.tezgah, i.tl]), [['10', 'T1', 250]]);
    assert.deepEqual(r.kayanlar.map((k) => [k.siparis, k.termin, k.gecikir]), [['p-1', '2099-07-02', true], ['p-1', '2099-07-02', false], ['p-1', null, false]]);
    // Motor denemeye verilenden fazla kalem dönerse fazlası eşlenmez.
    assert.equal(motorSonucu([7], { kalemler: [kalemM('2099-07-14'), kalemM('2099-07-14')], kayan: [] }).kalemler.length, 1);
    const taslak = { taslakId: 5, gecerlilik: '2099-07-31', termin: '2099-07-14', kalemler: [{ satirId: 7, malzemeNo: 11, adet: '10' }, { satirId: 8, malzemeNo: null, adet: '1' }],
      kilitler: [{ satirId: 7, opId: '10', tezgah: 'T1', baslangic: '2099-07-01T08:00:00+03:00' }, { satirId: 7, opId: '20', tezgah: 'T2', baslangic: '2099-07-02T08:00:00+03:00' }] };
    assert.deepEqual(motorTaslaklari([taslak, { ...taslak, taslakId: 6, termin: null }]), [{
      id: '5', gecerlilik: '2099-07-31', kalemler: [{ malzemeNo: 11, adet: 10, termin: '2099-07-14', yerlesim: {
        10: { makineId: 'T1', baslangic: '2099-07-01T08:00:00+03:00' }, 20: { makineId: 'T2', baslangic: '2099-07-02T08:00:00+03:00' },
      } }],
    }]);
  });

  test('TKL-19 şerit etiketi: sipariş emir noyla (yoksa kimlikle), satış taslağı teklif noyla, bu teklif adıyla; plan yoksa null', () => {
    const b = { makineId: 'T1', kalem: null, adim: '10', baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-01T10:00:00+03:00', gecikir: false };
    const p = { baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-20T00:00:00+03:00', kapaliGunler: [], hatlar: [{ makineId: 'T1', ad: 'Tezgah 1', fason: false }], bloklar: [
      { ...b, tur: 'siparis' as const, is: 'p-1', emirNo: 'E-1' }, { ...b, tur: 'siparis' as const, is: 'p-2', emirNo: null },
      { ...b, tur: 'satis-taslagi' as const, is: '5', emirNo: null }, { ...b, tur: 'teklif' as const, is: 'teklif', emirNo: null, kalem: 1 },
    ] };
    assert.deepEqual(planSeridi(p, new Map([['5', 'TK-2099-001']]))?.bloklar.map((x) => x.etiket), ['E-1', 'p-2', 'TK-2099-001', 'Bu teklif']);
    assert.equal(planSeridi(undefined, new Map()), null);
    assert.equal(planSeridi(null, new Map()), null);
  });

  test('TKL-20 adet çarpanı: 1 olduğu gibi, ötekiler tam adede yuvarlanır (en az 1); aynı adeti veren çarpan tekrarlanmaz, teklifin kendi adedi kalır', () => {
    assert.deepEqual([carpilmisAdet('10.000', '0.5'), carpilmisAdet('10.000', '1'), carpilmisAdet('3.000', '0.5'), carpilmisAdet('1.000', '0.5'), carpilmisAdet('2.500', '4')],
      ['5.000', '10.000', '2.000', '1.000', '10.000']);
    const satir = (carpan: '0.5' | '1' | '2' | '4', adet: string) => ({ carpan, termin: null, maliyetToplami: null, kalemler: [{ satirId: 1, adet, birimMaliyet: null }] });
    assert.deepEqual(adetSatirlari([satir('0.5', '1.000'), satir('1', '1.000'), satir('2', '2.000'), satir('4', '4.000')]).map((x) => x.carpan), ['1', '2', '4']);
  });
});
