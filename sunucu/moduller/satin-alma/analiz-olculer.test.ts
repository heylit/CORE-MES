import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  asamaKirilimlari, asamaOzeti, enCokSapanlar, fiyatFarki, hedefSapmalari, kacinilanMaliyet, kuralDisiAlim, oncekiAlislar,
  type KimlikliSatir, type SiparisBagi, type TalepAsamaSatiri, type TeklifFiyati,
} from './analiz-kurallar.ts';

// 2471: süreç ve fiyat ölçülerinin saf hesapları. Veriler uydurmadır.
const talep = (o: Partial<TalepAsamaSatiri>): TalepAsamaSatiri => ({
  talepId: 't', acilis: '2026-01-01', ilkIstek: null, sonTeklif: null, karar: null, sonOnay: null, siparis: null, ilkTeslim: null,
  tamTeslim: null, birim: null, kategoriler: [], kararVeren: null, ...o,
});
const tam = (gun: number, o: Partial<TalepAsamaSatiri> = {}): TalepAsamaSatiri => talep({
  ilkIstek: '2026-01-02', sonTeklif: '2026-01-05', karar: '2026-01-06', sonOnay: `2026-01-${String(6 + gun).padStart(2, '0')}`,
  siparis: '2026-01-20', ilkTeslim: '2026-01-25', tamTeslim: '2026-01-30', ...o,
});
const K = '00000000-0000-4000-8000-000000000001';
const satir = (id: number, o: Partial<KimlikliSatir>): KimlikliSatir => ({
  id, siparisTarihi: '2026-03-01', firmaId: 1, paraBirimi: 'EUR', kur: '30', genelIskonto: '0', birimFiyat: '10', satirIskonto: null,
  terminGun: null, miktar: '10', birim: 'adet', katalogId: K, ad: 'Deneme çubuk', malzemeNo: null, teslimMiktari: null, sonTeslimGunu: null, ...o,
});
const B = '2026-01-01', S = '2026-12-31';

describe('satın alma süreç ve fiyat ölçüleri (2471)', () => {
  test('SA-2471-1 izinli: aşamalar önceki uçtan ölçülür, darboğaz en uzun ortanca, toplam ayrı', () => {
    const l = [1, 2, 3, 4, 5].map((g) => tam(g));
    const o = asamaOzeti(l);
    const g = Object.fromEntries(o.asamalar.map((a) => [a.asama, [a.ornek, a.ortancaGun]]));
    assert.deepEqual(g['teklif-istegi'], [5, 1]);
    assert.deepEqual(g.onay, [5, 3]);
    assert.deepEqual(g.siparis, [5, 11]);
    assert.equal(o.darbogaz, 'siparis');
    assert.deepEqual(o.toplam, { ornek: 5, ortancaGun: 29, yuzde80Gun: 29 });
    assert.equal(o.hataliAralik, 0);
  });

  test('SA-2471-1 yasak: atlanan aşama sayılmaz, eksi aralık sayılmaz, eşik altında istatistik yok', () => {
    // Teklif isteği yok: teklif aşaması açılıştan ölçülür. Karar son tekliften önce: eksi aralık.
    const o = asamaOzeti([talep({ sonTeklif: '2026-01-04', karar: '2026-01-03' })], 1);
    const g = Object.fromEntries(o.asamalar.map((a) => [a.asama, [a.ornek, a.ortancaGun]]));
    assert.deepEqual(g['teklif-istegi'], [0, null]);
    assert.deepEqual(g.teklif, [1, 3]);
    assert.deepEqual(g.karar, [0, null]);
    assert.equal(o.hataliAralik, 1);
    const az = asamaOzeti([tam(1), tam(2)]);
    assert.equal(az.darbogaz, null);
    assert.deepEqual(az.toplam, { ornek: 2, ortancaGun: null, yuzde80Gun: null });
  });

  test('SA-2471-2: kırılım kategori başına bir kez, boş kategori Kategorisiz, kararsız talep alıcıya girmez', () => {
    const k = asamaKirilimlari([
      tam(1, { kategoriler: ['Hammadde', 'Hammadde', ''], birim: 'Üretim', kararVeren: 7 }),
      tam(2, { kategoriler: ['Hammadde'], birim: null, kararVeren: null }),
    ], new Map([[7, 'Deneme alıcı']]), 1);
    const g = Object.fromEntries(k.map((x) => [`${x.tur}:${x.ad}`, x.ozet.toplam.ornek]));
    assert.deepEqual(g, { 'kategori:Hammadde': 2, 'kategori:Kategorisiz': 1, 'birim:Üretim': 1, 'birim:Birimsiz': 1, 'alici:Deneme alıcı': 1 });
  });

  test('SA-2471-3 izinli: son alışa göre fiyat farkı TL ile, eksi gerçek azalma', () => {
    const l = [satir(1, { siparisTarihi: '2025-12-01', birimFiyat: '10', kur: '30' }), satir(2, { birimFiyat: '9', kur: '30' })];
    assert.deepEqual(fiyatFarki(l, oncekiAlislar(l), B, S), { tutarTl: -300, ornek: 1, kursuz: 0, kurEtkisiTl: 0 });
    // Döviz kalemde kur yükselişi tasarrufa girmez, ayrı verilir: (9 - 10) x 33 x 10 = -330; 10 x (33 - 30) x 10 = 300.
    const kur = [l[0]!, satir(2, { birimFiyat: '9', kur: '33' })];
    assert.deepEqual(fiyatFarki(kur, oncekiAlislar(kur), B, S), { tutarTl: -330, ornek: 1, kursuz: 0, kurEtkisiTl: 300 });
    // Para birimi değişince TL nominal: 9 x 33 - 10 x 30 = -3 x 10.
    const pb = [l[0]!, satir(2, { paraBirimi: 'USD', birimFiyat: '9', kur: '33' })];
    assert.deepEqual(fiyatFarki(pb, oncekiAlislar(pb), B, S), { tutarTl: -30, ornek: 1, kursuz: 0, kurEtkisiTl: 0 });
  });

  test('SA-2471-3 yasak: kursuz satır tutara girmez, birim değişince önceki yok, dönem dışı sayılmaz', () => {
    const l = [satir(1, { siparisTarihi: '2025-12-01', kur: null }), satir(2, {}), satir(3, { birim: 'kg' }), satir(4, { siparisTarihi: '2027-01-02' })];
    const o = oncekiAlislar(l);
    assert.equal(o.has(3), false);
    assert.deepEqual(fiyatFarki(l, o, B, S), { tutarTl: null, ornek: 0, kursuz: 1, kurEtkisiTl: null });
  });

  const bag = (id: number, teklifId: string, o: Partial<SiparisBagi> = {}): SiparisBagi =>
    ({ id, talepId: 'T1', teklifId, kalemId: 'K1', talepAcilis: '2026-02-01', teklifSayisi: 3, ...o });
  const teklif = (teklifId: string, birimFiyat: string, o: Partial<TeklifFiyati> = {}): TeklifFiyati => ({
    talepId: 'T1', teklifId, kalemId: 'K1', paraBirimi: 'EUR', kur: '30', genelIskonto: '0', birimFiyat, satirIskonto: null, teknikUygun: true, ...o,
  });

  test('SA-2471-4 izinli: kaçınılan maliyet en düşük öteki teklife göre; seçilen pahalıysa eksi', () => {
    const l = [satir(1, { birimFiyat: '10' })];
    const b = new Map([[1, bag(1, 'A')]]);
    assert.deepEqual(kacinilanMaliyet(l, b, [teklif('A', '10'), teklif('B', '12'), teklif('C', '11')], B, S), { tutarTl: 300, ornek: 1, kursuz: 0, kurEtkisiTl: null });
    assert.deepEqual(kacinilanMaliyet(l, b, [teklif('A', '10'), teklif('B', '9')], B, S), { tutarTl: -300, ornek: 1, kursuz: 0, kurEtkisiTl: null });
    // Aynı dövizdeki öteki teklif seçilenin kuruyla çevrilir: kendi kuru 40 olsa da (12 - 10) x 30 x 10.
    assert.deepEqual(kacinilanMaliyet(l, b, [teklif('A', '10'), teklif('B', '12', { kur: '40' })], B, S), { tutarTl: 600, ornek: 1, kursuz: 0, kurEtkisiTl: null });
  });

  test('SA-2471-4 yasak: teknik uygun olmayan ve tek teklif sayılmaz, kursuz öteki teklif tutara girmez', () => {
    const l = [satir(1, { birimFiyat: '10' })];
    const b = new Map([[1, bag(1, 'A')]]);
    assert.deepEqual(kacinilanMaliyet(l, b, [teklif('A', '10'), teklif('B', '5', { teknikUygun: false })], B, S), { tutarTl: null, ornek: 0, kursuz: 0, kurEtkisiTl: null });
    assert.deepEqual(kacinilanMaliyet(l, b, [teklif('A', '10'), teklif('B', '12', { paraBirimi: 'USD', kur: null })], B, S), { tutarTl: null, ornek: 0, kursuz: 1, kurEtkisiTl: null });
  });

  test('SA-2471-5 izinli: döviz kalemde hedef önceki döviz fiyatı, sapma ve kur etkisi ayrı, bant eşikle', () => {
    const l = [satir(1, { siparisTarihi: '2025-12-01', birimFiyat: '10', kur: '30' }), satir(2, { birimFiyat: '12', kur: '33' })];
    const r = hedefSapmalari(l, oncekiAlislar(l), 10, B, S);
    assert.deepEqual(r.donem, { satir: 1, toplamTl: 660, bantDisi: 1, endeksYok: 0 });
    assert.deepEqual([r.satirlar[0]!.hedef, r.satirlar[0]!.farkYuzde, r.satirlar[0]!.kurEtkisiTl, r.satirlar[0]!.bant], [10, 20, 300, 'ustunde']);
    const ic = hedefSapmalari([l[0]!, satir(2, { birimFiyat: '9.5', kur: '30' })], oncekiAlislar([l[0]!, satir(2, { birimFiyat: '9.5' })]), 10, B, S);
    assert.equal(ic.satirlar[0]!.bant, 'icinde');
  });

  test('SA-2471-5 yasak: TL kalemde endeks yokken hedef yok, para birimi değişince kıyas yok', () => {
    const tl = [satir(1, { siparisTarihi: '2025-12-01', paraBirimi: 'TRY', kur: null }), satir(2, { paraBirimi: 'TRY', kur: null, birimFiyat: '20' })];
    assert.deepEqual(hedefSapmalari(tl, oncekiAlislar(tl), 10, B, S).donem, { satir: 0, toplamTl: null, bantDisi: 0, endeksYok: 1 });
    const pb = [satir(1, { siparisTarihi: '2025-12-01', paraBirimi: 'USD' }), satir(2, {})];
    assert.equal(hedefSapmalari(pb, oncekiAlislar(pb), 10, B, S).donem.satir, 0);
    assert.deepEqual(enCokSapanlar([], 10), []);
  });

  test('SA-2471-6 izinli: az teklif ve talepten önce sipariş, sipariş başına bir kez, pay harcamaya göre', () => {
    const l = [satir(1, { siparisTarihi: '2026-01-15' }), satir(2, { siparisTarihi: '2026-01-15', miktar: '5' }), satir(3, { siparisTarihi: '2026-03-01' })];
    const b = new Map([
      [1, bag(1, 'A', { teklifSayisi: 1 })], [2, bag(2, 'A', { teklifSayisi: 1, kalemId: 'K2' })], [3, bag(3, 'B', { talepId: 'T2' })],
    ]);
    const r = kuralDisiAlim(l, b, 3, 9000, B, S);
    assert.deepEqual(r, { azTeklif: { siparis: 1, tutarTl: 4500 }, talepOncesi: { siparis: 1, tutarTl: 4500 }, payYuzde: 50 });
  });

  test('SA-2471-6 yasak: kurala uyan sipariş sayılmaz, harcama yoksa pay null', () => {
    const l = [satir(1, {})];
    const b = new Map([[1, bag(1, 'A')]]);
    assert.deepEqual(kuralDisiAlim(l, b, 3, null, B, S), { azTeklif: { siparis: 0, tutarTl: 0 }, talepOncesi: { siparis: 0, tutarTl: 0 }, payYuzde: null });
  });
});
