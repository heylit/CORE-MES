import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Hareket } from '#paylasilan/sozlesme/stok.ts';
import { ANAHTAR_BICIMI } from '#paylasilan/sozlesme/recete-rota.ts';
import {
  degerBicimeUyarMi, dugumleriCevir, emirleriCevir, hareketleriCevir, isMerkeziCevir, istasyonCevir, kisiCevir, makineCevir, malzemeCevir, metindenSayi, degerCokBuyukMu, nulKarakteriVarMi, operasyonCevir,
  rotaAramaSonuclari, rotasizAdimlariCevir, surumUyarMi, tatilTarihleri, vardiyaCevir,
} from './kurallar.ts';
import type { EmirKaydi } from './kurallar.ts';

describe('recete-rota kuralları (saf)', () => {
  test('RR-K1: yazma yalnız beklenen sürümde geçer; null yalnız kayıt yokken', () => {
    assert.equal(surumUyarMi(null, null), true);
    assert.equal(surumUyarMi(5, 5), true);
    assert.equal(surumUyarMi(5, null), false);
    assert.equal(surumUyarMi(null, 5), false);
    assert.equal(surumUyarMi(6, 5), false);
  });

  test('RR-K2: metin biçimi yalnız dize alır; json her JSON değerini alır', () => {
    assert.equal(degerBicimeUyarMi('metin', 'abc'), true);
    assert.equal(degerBicimeUyarMi('metin', { a: 1 }), false);
    assert.equal(degerBicimeUyarMi('json', { a: [1, 'x', null] }), true);
    assert.equal(degerBicimeUyarMi('json', 3), true);
  });

  test('RR-K3: U+0000 içeren değer yakalanır, öteki denetim karakterleri geçer', () => {
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\u0000' }), true);
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\n\tY1' }), false);
  });

  test('RR-K3b: değer JSON metninin UTF-8 baytıyla sınırlanır; 1 MB geçer, bir bayt fazlası ve çok baytlı karakterle aşan reddedilir', () => {
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 8) }), false);
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 7) }), true);
    assert.equal(degerCokBuyukMu('ş'.repeat(499_999)), false);
    assert.equal(degerCokBuyukMu('ş'.repeat(500_000)), true);
  });

  test('RR-K4: anahtar prototipin önekiyle başlar; başka anahtar ve yol karakteri reddedilir', () => {
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1'), true);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:studio:scab12cd3'), true);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:'), false);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru.'), false);
    assert.equal(ANAHTAR_BICIMI.test('mesai:tercih'), false);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:a/b'), false);
  });
});

describe('recete-rota durum çevirisi (saf)', () => {
  test('RR-D1: malzeme kartı prototipin türüne, stok ve kritik seviye sayıya çevrilir', () => {
    const ozet = { id: 12, kimlik: 'k', kod: 'HM-00012', tur: 'hammadde', ad: 'Çubuk', birim: 'KG', onayDurumu: 'aktif', kategori: null, kategoriAdi: null, hizmetYonu: null } as const;
    assert.deepEqual(malzemeCevir(ozet, { serbest: '12.500', kritikSeviye: '5' }), {
      id: '12', kayitNo: 12, code: 'HM-00012', name: 'Çubuk', type: 'ham', unit: 'KG', cost: null, stock: 12.5, min: 5, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true,
    });
    assert.equal(malzemeCevir({ ...ozet, tur: 'yarimamul' }, undefined).type, 'yari');
    // Ticari mal ve hizmet reçetede girdi olmaz (kart #1218).
    assert.deepEqual((['ticari_mal', 'hizmet', 'sarf'] as const).map((tur) => malzemeCevir({ ...ozet, tur }, undefined).girdiOlabilir), [false, false, true]);
  });

  test('RR-D2: boş girdi uydurulmaz: stok, kritik seviye ve birim yoksa null; adı olmayan kart koduyla', () => {
    const c = malzemeCevir({ id: 3, kimlik: 'k', kod: 'MM-3', tur: 'mamul', ad: null, birim: null, onayDurumu: 'taslak', kategori: null, kategoriAdi: null, hizmetYonu: null }, undefined);
    assert.deepEqual({ ad: c.name, birim: c.unit, stok: c.stock, min: c.min, aktif: c.aktif }, { ad: 'MM-3', birim: null, stok: null, min: null, aktif: false });
    assert.equal(metindenSayi(null), null);
    assert.equal(metindenSayi(''), null);
    assert.equal(metindenSayi('x'), null);
    assert.equal(metindenSayi('0'), 0);
    assert.equal(malzemeCevir({ id: 3, kimlik: 'k', kod: 'MM-3', tur: 'mamul', ad: 'A', birim: null, onayDurumu: 'aktif', kategori: null, kategoriAdi: null, hizmetYonu: null }, { serbest: '0', kritikSeviye: null }).stock, 0);
  });

  test('RR-D3: operasyon tipi grup adıyla gelir; süre yoksa null', () => {
    const tip = { id: 4, kod: 'KES-1', ad: 'Testere', grup: 'KES', aktif: true, kisaltma: 'TST', varsayilanAyarDk: '10.5', varsayilanBirimDk: null, varsayilanIstasyonId: 7 } as const;
    assert.deepEqual(operasyonCevir(tip), {
      id: '4', code: 'KES-1', abbr: 'TST', name: 'Testere', group: 'KES', groupName: 'Kesim', stationId: '7', setup: 10.5, cycle: null, aktif: true,
    });
    assert.equal(operasyonCevir({ ...tip, varsayilanIstasyonId: null, kisaltma: null }).stationId, null);
  });

  test('RR-D4: iş merkezinin haftası, istasyonun maliyeti ve kişinin vardiyası ile maliyeti karşılıksız olduğu için null', () => {
    assert.deepEqual(isMerkeziCevir({ id: 1, kod: 'IM-1', ad: 'Torna', aciklama: null, aktif: true }), { id: '1', code: 'IM-1', name: 'Torna', week: null, aktif: true });
    const i = istasyonCevir({ id: 5, kod: 'IS-5', ad: 'Tezgah', isMerkeziId: 1, tip: 'talasli', aktif: true }, { verimYuzde: '85.00', operatorIhtiyaci: '0.50' }, 2);
    assert.deepEqual(i, { id: '5', code: 'IS-5', name: 'Tezgah', wcId: '1', eff: 85, opPer: 0.5, count: 2, cost: null, aktif: true });
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: '100' }, 5, new Map([[5, 1]]), [5, 6]);
    assert.deepEqual(k, { id: '9', name: 'Ali', code: '100', role: null, stationId: '5', stationAtama: true, wcId: '1', shiftId: null, skills: ['5', '6'], cost: null, active: true, machines: [], maxMachines: null });
    const makineli = kisiCevir({ id: 9, ad: 'Ali', sicilNo: '100' }, 5, new Map([[5, 1]]), [5], { makineler: [20, 21], enCok: 2 });
    assert.deepEqual([makineli.machines, makineli.maxMachines], [['20', '21'], 2]);
  });

  test('RR-D5: plan ayarı olmayan istasyon %100 verim ve 1 operatör; ataması olmayan kişinin iş merkezi null', () => {
    const i = istasyonCevir({ id: 5, kod: 'IS-5', ad: 'Tezgah', isMerkeziId: 1, tip: 'talasli', aktif: true }, undefined, 0);
    assert.deepEqual({ eff: i.eff, opPer: i.opPer, count: i.count }, { eff: 100, opPer: 1, count: 0 });
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, undefined, new Map(), []);
    assert.deepEqual({ wcId: k.wcId, code: k.code, skills: k.skills }, { wcId: null, code: null, skills: [] });
  });

  test('RR-D7: ataması olmayan kişinin istasyonu yetkin olduğu ilk aktif istasyon, iş merkezi onunki; pasif istasyon atlanır', () => {
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, undefined, new Map([[6, 2], [7, 3]]), [5, 7, 6]);
    assert.deepEqual({ stationId: k.stationId, stationAtama: k.stationAtama, wcId: k.wcId }, { stationId: '7', stationAtama: false, wcId: '3' });
    const atamali = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, 6, new Map([[6, 2], [7, 3]]), [7]);
    assert.deepEqual({ stationId: atamali.stationId, stationAtama: atamali.stationAtama, wcId: atamali.wcId }, { stationId: '6', stationAtama: true, wcId: '2' });
  });

  test('RR-D6: makine durumu prototipin adına çevrilir; satırı olmayan çalışır sayılır', () => {
    const m = { id: 2, kod: 'MK-2', ad: 'Torna', tur: null, markaModel: null, seriNo: null, istasyonId: 5, baglantiTuru: null, baglantiAdresi: null, aktif: true };
    assert.equal(makineCevir(m, undefined).status, 'aktif');
    assert.equal(makineCevir(m, 'calisir').status, 'aktif');
    assert.equal(makineCevir(m, 'bakim').status, 'bakim');
    assert.equal(makineCevir(m, 'ariza').status, 'ariza');
    assert.equal(makineCevir({ ...m, istasyonId: null }, undefined).stationId, null);
  });

  test('RR-D7, 677 a: vardiya molalarıyla çevrilir; takvimden tatil ve kapalı günler alınır', () => {
    const v = { id: 1, ad: '1. vardiya', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 };
    assert.deepEqual(vardiyaCevir(v), { id: '1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }], netDakika: 450 });
    assert.deepEqual(tatilTarihleri([{ tarih: '2026-05-01', tur: 'tatil' }, { tarih: '2026-05-02', tur: 'kapali' }]), ['2026-05-01', '2026-05-02']);
    assert.deepEqual(tatilTarihleri([]), []);
  });

  test('RR-K21: stok hareketi prototipin moves satırına çevrilir; işaret yöne göre, statü atlatma iki satır, net etkisi olmayan hareket listede yok', () => {
    const h = (id: number, ek: Partial<Hareket>): Hareket => ({
      id, zaman: `2026-10-14T0${String(id % 10)}:00:00.000Z`, tur: 'giris', malzemeId: 7, malzemeAd: null, partiId: null, partiEtiketi: null, kaynakKonumKod: null,
      hedefKonumKod: null, miktar: '2.500', onayliEksi: false, girisKaynagi: 'mal_kabul', cikisNedeni: null, uretimEmriId: null, geriAlinanId: null, geriAlindi: false,
      fisId: null, fisNo: null, kisiAd: null, aciklama: null, kaynakStatuId: null, hedefStatuId: null, ...ek,
    });
    const satirlar = hareketleriCevir([
      h(1, {}),
      h(2, { tur: 'giris', girisKaynagi: 'uretim', uretimEmriId: 9, miktar: '4' }),
      h(3, { tur: 'cikis', cikisNedeni: 'fire', miktar: '1', aciklama: ' kırık ' }),
      h(4, { tur: 'sayim_eksik', miktar: '0.5' }),
      h(5, { tur: 'sayim_fazla', miktar: '2' }),
      h(6, { tur: 'transfer', kaynakKonumKod: 'A', hedefKonumKod: 'B' }),
      h(7, { tur: 'transfer', miktar: '3', kaynakStatuId: null, hedefStatuId: 11 }),
      h(8, { tur: 'cikis', cikisNedeni: 'sevk', geriAlindi: true }),
      h(9, { tur: 'geri_alma', geriAlinanId: 8 }),
    ], new Map([[11, 'step:p1']]));
    assert.deepEqual(satirlar.map((x) => [x.id, x.qty, x.note, x.status]), [
      ['h1', 2.5, 'Mal kabul girişi', ''], ['h2', 4, 'Üretim girişi (emir 9)', ''], ['h3', -1, 'Fire: kırık', ''], ['h4', -0.5, 'Sayım düzeltmesi', ''],
      ['h5', 2, 'Sayım düzeltmesi', ''], ['h7-k', -3, 'Statü atlatma', ''], ['h7-h', 3, 'Statü atlatma', 'step:p1'],
    ]);
    assert.equal(satirlar.every((x) => x.itemId === '7' && x.batch === null && Number.isFinite(x.t)), true);
    assert.deepEqual(hareketleriCevir([h(1, { tur: 'transfer', kaynakStatuId: 4, hedefStatuId: null })], new Map()).map((x) => x.status), ['statu:4', ''], 'tanımsız statü kimliği korunur');
  });

  test('RR-K-RE: rotasız emrin iş emirleri sıraya dizilir; okunamayan süre null kalır, sıfır uydurulmaz', () => {
    const a = rotasizAdimlariCevir([
      { sira: 2, opNo: 20, ad: 'Frezeleme', operasyonTipiId: 4, istasyonId: 9, ayarSuresiDk: '15.5', birimSureDk: null, durum: 'bekliyor' },
      { sira: 1, opNo: 10, ad: 'Kesim', operasyonTipiId: null, istasyonId: null, ayarSuresiDk: 'x', birimSureDk: '2', durum: 'tamam' },
    ]);
    assert.deepEqual(a, [
      { seq: 1, opNo: 10, ad: 'Kesim', opId: null, stationId: null, setup: null, cycle: 2, durum: 'tamam' },
      { seq: 2, opNo: 20, ad: 'Frezeleme', opId: '4', stationId: '9', setup: 15.5, cycle: null, durum: 'bekliyor' },
    ]);
  });
});

describe('recete-rota genel arama sonuçları (saf, kart #1241)', () => {
  const adaylar = [
    { id: 1, kod: 'MIL-0010A', ad: 'Mil uzun' },
    { id: 2, kod: 'XMIL-0010', ad: null },
    { id: 3, kod: 'MIL-0010', ad: 'Mil' },
    { id: 4, kod: 'MIL-0099', ad: '  ' },
  ];
  const harf = new Map([[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']]);

  test('RR-A1: tam kod önce, sonra koddan başlayan, sonra öteki gelen sırayla; sınır uygulanır', () => {
    assert.deepEqual(rotaAramaSonuclari(adaylar, harf, 'mil-0010', 10).map((s) => s.anahtar), ['3', '1', '2', '4']);
    assert.deepEqual(rotaAramaSonuclari(adaylar, harf, ' mil-0010 ', 2).map((s) => s.anahtar), ['3', '1']);
    const isik = [{ id: 9, kod: 'XIŞIK-01', ad: null }, { id: 8, kod: 'IŞIK-01', ad: null }];
    assert.deepEqual(rotaAramaSonuclari(isik, new Map([[8, 'A'], [9, 'A']]), 'ışık-01', 5).map((s) => s.anahtar), ['8', '9']);
  });

  test('RR-A2: yürürlükte rotası olmayan aday düşer; boş ad açıklamaya girmez; yol Ürün ve rotalar bölümüdür', () => {
    assert.deepEqual(rotaAramaSonuclari(adaylar, new Map([[4, 'D'], [2, 'B']]), 'mil', 5), [
      { anahtar: '4', baslik: 'MIL-0099', aciklama: 'Rota D · yürürlükte', yol: '/recete-rota/schema?kayit=4' },
      { anahtar: '2', baslik: 'XMIL-0010', aciklama: 'Rota B · yürürlükte', yol: '/recete-rota/schema?kayit=2' },
    ]);
    assert.equal(rotaAramaSonuclari(adaylar, harf, 'mil', 5)[0]?.aciklama, 'Mil uzun · Rota A · yürürlükte');
  });
});

describe('recete-rota çok katmanlı emrin düğümleri (saf, 1476-D)', () => {
  // 1476-D: emir 7, kök ürün 1 (OP10, OP20), alt düğüm 0.1 ürün 2 (OP10 -> 1010, OP20 -> 1020; kök başına 2), onun altı 0.1.1 ürün 3
  // (OP10 -> 1030; kök başına 6). Sıra alt katmandan başlar (rota cokKatmanaCevir); tüketen adım öncülünden okunur.
  const katmanliEmir = (): EmirKaydi => {
    const adim = (sira: number, opNo: number, dugum: [string, number, number, string], onculler: number[], durum: 'bekliyor' | 'tamam' = 'bekliyor') => ({
      sira, opNo, durum, saglamAdet: null, canliAdet: null, ad: 'A', operasyonTipiId: 1, istasyonId: 4, ayarSuresiDk: '5', birimSureDk: '2', tur: 'rota' as const,
      dugum: { ad: dugum[0], malzemeNo: dugum[1], kaynakOpNo: dugum[2], birimCarpani: dugum[3] }, onculler: onculler.map((opNo) => ({ opNo })),
    });
    return {
      id: 7, emirNo: 'E7', malzemeNo: 1, adet: 5, baslangic: null, teslim: null, oncelik: 3, aciklama: null, kaynakRotaRevizyonId: 8, durum: 'taslak',
      emirTuru: 'seri', acilma: '2030-01-01T00:00:00Z', bitis: null, ustEmirId: null, bolunmeSira: null, birlestigiEmirId: null, birlesmeOpNo: null, surum: 1,
      isEmirleri: [
        adim(1, 1030, ['0.1.1', 3, 10, '6.0000'], [], 'tamam'),
        adim(2, 1010, ['0.1', 2, 10, '2.0000'], []),
        adim(3, 1020, ['0.1', 2, 20, '2.0000'], [1010, 1030]),
        adim(4, 10, ['0', 1, 10, '1.0000'], [], 'tamam'),
        adim(5, 20, ['0', 1, 20, '1.0000'], [10, 1020]),
      ],
    };
  };

  test('1476-D: çok katmanlı emirde kök adımın yeri kökün rota adımları arasındaki sırasıdır; alt düğüm adımı kök anahtarı almaz', () => {
    const c = emirleriCevir([katmanliEmir()]);
    assert.deepEqual(c.opStatus, { '7|root|1': 'tamam' }, 'kökün OP10\'u rotanın 1. adımı; biten alt düğüm adımı kök anahtarına girmez');
    assert.deepEqual(Object.keys(c.opYer ?? {}), ['7|root|2']);
  });

  test('1476-D: alt düğümler ürün, kök ve üst başına adet, tüketen üst adım ve adım eşlemesiyle gider', () => {
    assert.deepEqual(dugumleriCevir(katmanliEmir()), [
      { dugum: '0.1.1', itemId: '3', carpan: 6, birim: 3, ust: '0.1', ustOpNo: 20, adimlar: [{ opNo: 1030, kaynakOpNo: 10, durum: 'tamam' }] },
      { dugum: '0.1', itemId: '2', carpan: 2, birim: 2, ust: '0', ustOpNo: 20,
        adimlar: [{ opNo: 1010, kaynakOpNo: 10, durum: 'bekliyor' }, { opNo: 1020, kaynakOpNo: 20, durum: 'bekliyor' }] },
    ]);
    assert.deepEqual(emirleriCevir([katmanliEmir()]).orders[0]!.dugumler?.map((d) => d.dugum), ['0.1.1', '0.1']);
  });

  test('1476-D reddedilen: tüketen adım bulunamazsa ustOpNo, okunamayan çarpanda adet null; tek katmanlı ve rotasız emirde alan yok', () => {
    const e = katmanliEmir();
    const bagsiz = { ...e, isEmirleri: e.isEmirleri.map((i) => (i.sira === 5 ? { ...i, onculler: [{ opNo: 10 }] } : i.sira === 1 ? { ...i, dugum: { ...i.dugum!, birimCarpani: 'x' } } : i)) };
    const d = dugumleriCevir(bagsiz)!;
    assert.equal(d.find((x) => x.dugum === '0.1')!.ustOpNo, null, 'öncül yoksa bağ uydurulmaz');
    assert.deepEqual([d[0]!.carpan, d[0]!.birim], [null, null]);
    const tek = { ...e, isEmirleri: e.isEmirleri.filter((i) => i.dugum!.ad === '0').map(({ dugum: _d, onculler: _o, ...i }) => i) };
    assert.equal(dugumleriCevir(tek), undefined);
    assert.equal('dugumler' in emirleriCevir([tek]).orders[0]!, false);
    assert.equal('dugumler' in emirleriCevir([{ ...e, kaynakRotaRevizyonId: null }]).orders[0]!, false);
  });
});
