import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aylikHarcama, harcamaDagilimi, tedarikciAnahtari, tekKaynak, teklifOzeti, yogunlasma, type DokumSatiri, type KimlikliSatir, type SiparisBagi,
} from './analiz-kurallar.ts';

// 2477: Raporlar'dan Analiz'e taşınan dağılımların saf hesapları. Veriler uydurmadır.
const K = '00000000-0000-4000-8000-000000000001';
const satir = (id: number, o: Partial<KimlikliSatir>): KimlikliSatir => ({
  id, siparisTarihi: '2026-03-01', firmaId: 1, paraBirimi: 'TRY', kur: null, genelIskonto: '0', birimFiyat: '10', satirIskonto: null,
  terminGun: null, miktar: '10', birim: 'adet', katalogId: K, ad: 'Deneme çubuk', malzemeNo: null, teslimMiktari: null, sonTeslimGunu: null, ...o,
});
const dokum = (o: Partial<DokumSatiri>): DokumSatiri => ({
  siparisTarihi: '2026-03-01', talepId: 't1', kalemId: 'k1', kategori: 'Hammadde', ad: 'Deneme çubuk', katalogId: K, firmaId: 1, tedarikciAdi: 'Deneme A',
  paraBirimi: 'TRY', kur: null, genelIskonto: '0', birimFiyat: '10', satirIskonto: null, miktar: '10', ...o,
});
const bag = (id: number, talepId: string, teklifSayisi: number): SiparisBagi => ({ id, talepId, teklifId: 'q', kalemId: 'k', talepAcilis: '2026-01-01', teklifSayisi });
const B = '2026-01-01', S = '2026-12-31';

describe('satın alma harcama dağılımı ve tedarik riski (2477)', () => {
  test('SA-2477-1 izinli: aylık tutar sipariş günü kuruyla, iskonto dahil; siparişsiz ay 0', () => {
    const l = [satir(1, { siparisTarihi: '2026-02-10' }), satir(2, { siparisTarihi: '2026-04-01', paraBirimi: 'EUR', kur: '30', satirIskonto: '10' })];
    assert.deepEqual(aylikHarcama(l, ['2026-02', '2026-03', '2026-04']), [
      { ay: '2026-02', tutarTl: 100 }, { ay: '2026-03', tutarTl: 0 }, { ay: '2026-04', tutarTl: 2700 },
    ]);
  });

  test('SA-2477-1 yasak: ilk siparişten önceki ay 0 değil null; kuru girilmemiş döviz satırı tutara girmez', () => {
    const l = [satir(1, { siparisTarihi: '2026-03-05' }), satir(2, { siparisTarihi: '2026-03-06', paraBirimi: 'USD', kur: null })];
    assert.deepEqual(aylikHarcama(l, ['2026-02', '2026-03']), [{ ay: '2026-02', tutarTl: null }, { ay: '2026-03', tutarTl: 100 }]);
    assert.deepEqual(aylikHarcama([], ['2026-03']), [{ ay: '2026-03', tutarTl: null }]);
  });

  test('SA-2477-2 izinli: kategoriye göre dağılım büyükten küçüğe, pay toplamın yüzdesi', () => {
    const l = [dokum({ kategori: 'Hammadde', miktar: '30' }), dokum({ kategori: 'Hizmet', miktar: '10' })];
    assert.deepEqual(harcamaDagilimi(l, (d) => d.kategori, (d) => d.kategori, B, S), [
      { anahtar: 'Hammadde', ad: 'Hammadde', tutarTl: 300, pay: 75 }, { anahtar: 'Hizmet', ad: 'Hizmet', tutarTl: 100, pay: 25 },
    ]);
  });

  test('SA-2477-2 yasak: dönem dışı ve kursuz satır dağılıma girmez', () => {
    const l = [dokum({ siparisTarihi: '2025-12-31' }), dokum({ paraBirimi: 'EUR', kur: null }), dokum({ kategori: 'Hizmet' })];
    assert.deepEqual(harcamaDagilimi(l, (d) => d.kategori, (d) => d.kategori, B, S).map((x) => x.anahtar), ['Hizmet']);
  });

  test('SA-2477-3 izinli: ilk bir ve ilk üç tedarikçinin payı', () => {
    assert.deepEqual(yogunlasma([{ tutarTl: 50 }, { tutarTl: 10 }, { tutarTl: 30 }, { tutarTl: 10 }]), { ilkBirPay: 50, ilkUcPay: 90 });
  });

  test('SA-2477-3 yasak: harcama yoksa pay 0 değil null', () => {
    assert.deepEqual(yogunlasma([]), { ilkBirPay: null, ilkUcPay: null });
  });

  test('SA-2477-4 izinli: talep başına bir kez sayılır; ortanca ve en az teklifin altı', () => {
    const l = [satir(1, {}), satir(2, {}), satir(3, {}), satir(4, {})];
    const b = new Map([[1, bag(1, 'a', 1)], [2, bag(2, 'a', 1)], [3, bag(3, 'b', 3)], [4, bag(4, 'c', 4)]]);
    assert.deepEqual(teklifOzeti(l, b, 3, B, S), { talep: 3, ortanca: 3, hedefAlti: 1 });
  });

  test('SA-2477-4 yasak: dönem dışı sipariş sayılmaz; talep yoksa ortanca null', () => {
    const b = new Map([[1, bag(1, 'a', 1)]]);
    assert.deepEqual(teklifOzeti([satir(1, { siparisTarihi: '2025-06-01' })], b, 3, B, S), { talep: 0, ortanca: null, hedefAlti: 0 });
  });

  test('SA-2477-5 izinli: her talepte fiyatı tek tedarikçi veren kalem tek kaynaktır', () => {
    const l = [dokum({ talepId: 't1' }), dokum({ talepId: 't2', siparisTarihi: '2026-05-01' })];
    const v = [{ talepId: 't1', kalemId: 'k1', tedarikci: 'f:1' }, { talepId: 't2', kalemId: 'k1', tedarikci: 'f:1' }];
    assert.deepEqual(tekKaynak(l, v, () => 'Deneme A', B, S), {
      kalemSayisi: 1, kalemler: [{ anahtar: K, ad: 'Deneme çubuk', tedarikci: 'Deneme A', siparisSatiri: 2, tutarTl: 200 }],
    });
  });

  test('SA-2477-5 yasak: başka talepte ikinci tedarikçi fiyat verdiyse kalem tek kaynak değildir', () => {
    const l = [dokum({ talepId: 't1' }), dokum({ talepId: 't2' })];
    const v = [{ talepId: 't1', kalemId: 'k1', tedarikci: 'f:1' }, { talepId: 't2', kalemId: 'k1', tedarikci: 'f:2' }];
    assert.equal(tekKaynak(l, v, () => '', B, S).kalemSayisi, 0);
    // Firmasız teklif adıyla ayrılır.
    assert.equal(tedarikciAnahtari({ firmaId: null, tedarikciAdi: ' Deneme B ' }), 'ad:deneme b');
  });
});
