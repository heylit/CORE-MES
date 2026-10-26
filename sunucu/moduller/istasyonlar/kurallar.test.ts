import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SecimSatiri } from './kurallar.ts';
import { isMerkeziIzinliMi, istasyonuKalkanMakineler, kapasiteKaynagiCoz, kisiteEklenemeyenler, makineYetkinligiReddi, secimGruplari, sentYuzdeMetni, tekrarsiz, yetkinlikDegisiklikleri, yetkinlikUygula } from './kurallar.ts';

const satir = (id: number, kod: string, isMerkeziId: number, isMerkeziKod: string, aktif = true): SecimSatiri => ({
  id, kod, ad: `Ad ${kod}`, isMerkeziId, tip: 'talasli', aktif, isMerkeziKod, isMerkeziAd: `Merkez ${isMerkeziKod}`,
});

describe('kişi iş merkezi kısıtı (kural)', () => {
  test('ARK-IST-12: liste boşsa ya da kısıt yoksa her iş merkezi izinlidir; doluysa yalnız listedekiler', () => {
    assert.equal(isMerkeziIzinliMi(null, 5), true);
    assert.equal(isMerkeziIzinliMi([], 5), true);
    assert.equal(isMerkeziIzinliMi([1, 2], 2), true);
    assert.equal(isMerkeziIzinliMi([1, 2], 5), false);
  });

  test('ARK-IST-09: kısıta yalnız aktif iş merkezi eklenir; listede zaten olan pasif satır korunur', () => {
    assert.deepEqual(kisiteEklenemeyenler([1, 2, 3], [2], [1]), [3]);
    assert.deepEqual(kisiteEklenemeyenler([1, 2], [2], [1]), []);
    assert.deepEqual(kisiteEklenemeyenler([9], [], []), [9]);
  });

  test('tekrarlı kimlikler teke iner', () => {
    assert.deepEqual(tekrarsiz([3, 1, 3, 1]), [3, 1]);
  });
});

describe('seçim listesi (kural)', () => {
  const hepsi = [
    satir(1, 'B-2', 20, 'IM-B'),
    satir(2, 'A-2', 10, 'IM-A'),
    satir(3, 'A-1', 10, 'IM-A'),
    satir(4, 'A-3', 10, 'IM-A', false),
    satir(5, 'C-1', 30, 'IM-C', false),
  ];

  test('ARK-IST-16: iş merkezine göre gruplanır, sıra kodla; pasif istasyon (ARK-IST-09) ve boş grup görünmez', () => {
    const gruplar = secimGruplari(hepsi, null);
    assert.deepEqual(gruplar.map((g) => [g.isMerkeziKod, g.istasyonlar.map((i) => i.kod)]), [
      ['IM-A', ['A-1', 'A-2']],
      ['IM-B', ['B-2']],
    ]);
    assert.equal(gruplar[0]?.isMerkeziAd, 'Merkez IM-A');
  });

  test('ARK-IST-13: kısıtlı kişi yalnız kendi iş merkezlerinin istasyonlarını görür; boş liste hepsini', () => {
    assert.deepEqual(secimGruplari(hepsi, [20]).map((g) => g.isMerkeziKod), ['IM-B']);
    assert.deepEqual(secimGruplari(hepsi, []).map((g) => g.isMerkeziKod), ['IM-A', 'IM-B']);
  });
});

describe('istasyon kapasite kaynağı (kural, kart #1146)', () => {
  test('girilmemiş kaynak makine sayılır ve varsayılan diye işaretlenir; girilmiş kaynak olduğu gibi döner', () => {
    assert.deepEqual(kapasiteKaynagiCoz(null), { kaynak: 'makine', varsayilan: true });
    assert.deepEqual(kapasiteKaynagiCoz('insan'), { kaynak: 'insan', varsayilan: false });
    assert.deepEqual(kapasiteKaynagiCoz('makine'), { kaynak: 'makine', varsayilan: false });
  });

  test('yüzde toplamı iki ondalıklı metindir', () => {
    assert.equal(sentYuzdeMetni(0), '0.00');
    assert.equal(sentYuzdeMetni(15000), '150.00');
    assert.equal(sentYuzdeMetni(1205), '12.05');
  });
});

describe('toplu yetkinlik (565 a)', () => {
  test('değişiklik kişi başına toplanır, aynı istasyonda son değişiklik geçerli; mevcut listeye eklenir ve çıkarılır', () => {
    const m = yetkinlikDegisiklikleri([
      { kisiId: 1, istasyonId: 10, yetkin: true }, { kisiId: 2, istasyonId: 10, yetkin: false }, { kisiId: 1, istasyonId: 10, yetkin: false }, { kisiId: 1, istasyonId: 11, yetkin: true },
    ]);
    assert.deepEqual([...m.keys()], [1, 2]);
    assert.deepEqual(yetkinlikUygula([10, 12], m.get(1)!), [12, 11]);
    assert.deepEqual(yetkinlikUygula([10], m.get(2)!), []);
  });
});

describe('makine yetkinliği (563 c)', () => {
  test('yalnız yetkin olunan istasyonun var olan, aktif makinesi; istasyonsuz makine verilmez', () => {
    assert.equal(makineYetkinligiReddi({ istasyonId: 10, aktif: true }, [10]), null);
    assert.match(makineYetkinligiReddi({ istasyonId: 11, aktif: true }, [10]) ?? '', /önce makinenin istasyonunda/);
    assert.match(makineYetkinligiReddi({ istasyonId: null, aktif: true }, [10]) ?? '', /önce makinenin istasyonunda/);
    assert.match(makineYetkinligiReddi({ istasyonId: 10, aktif: false }, [10]) ?? '', /aktif makine/);
    assert.match(makineYetkinligiReddi(undefined, [10]) ?? '', /aktif makine/);
  });

  test('istasyon yetkinliği kalkınca yalnız o istasyondaki makine kayıtları kalkar', () => {
    assert.deepEqual(istasyonuKalkanMakineler([{ makineId: 1, istasyonId: 10 }, { makineId: 2, istasyonId: 11 }, { makineId: 3, istasyonId: null }], [10]), [1]);
  });
});
