import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ACIK_DEGIL, ADIM_ACIK_DEGIL, FASON_VARSAYILAN_GUN, HATALI_ADET, HATALI_AYRILAMAZ, HATALI_KALITE_BASLAMIS, HATALI_KARAR_VERILMIS, HATALI_ROTASIZ,
  REWORK_BASLAMIS, REWORK_KARARSIZ, araOpNolari, hataliIhlali, hataliKarariIhlali, hataliYolu, kaliteIstasyonuSec, kaliteTipiSec, reworkAdimiIhlali,
  reworkTermini,
} from './kurallar.ts';
import type { BolmeDurumu } from './kurallar.ts';

const emir = (adet: number, adimlar: BolmeDurumu['isEmirleri'], islenen = 0): BolmeDurumu => ({
  durum: 'basladi', arsiv: false, adet, isEmirleri: adimlar, ayniSiradanBolunen: 0, bolunenIslenen: islenen,
});
const ucAdim = (ikinci: 'bekliyor' | 'calisiyor' | 'tamam' = 'calisiyor', ucuncu: 'bekliyor' | 'calisiyor' = 'bekliyor') => [
  { sira: 1, opNo: 10, durum: 'tamam' as const, saglamAdet: 10 },
  { sira: 2, opNo: 20, durum: ikinci, saglamAdet: null },
  { sira: 3, opNo: 30, durum: ucuncu, saglamAdet: null },
];

describe('hatalı parça kuralları (1034, 1036 a, 4 a)', () => {
  test('çalışan adımın sayılmamış parçası kola ayrılır; bütünü hatalıysa emre adım girer', () => {
    const d = emir(10, ucAdim(), 3);
    assert.equal(hataliIhlali(d, 2, 1, true), null);
    assert.equal(hataliYolu(d, 2, 1), 'kol');
    assert.equal(hataliIhlali(d, 2, 7, true), null);
    assert.equal(hataliIhlali(d, 2, 8, true), HATALI_ADET);
    const tek = emir(1, [{ sira: 1, opNo: 10, durum: 'calisiyor', saglamAdet: null }]);
    assert.equal(hataliIhlali(tek, 1, 1, true), null);
    assert.equal(hataliYolu(tek, 1, 1), 'kok');
  });

  test('reddedilen: sonraki adım başlamış, adım çalışmıyor, adet geçersiz, emir kapalı, rotasız emirde kısmi hata', () => {
    assert.equal(hataliIhlali(emir(10, ucAdim('calisiyor', 'calisiyor')), 2, 1, true), HATALI_AYRILAMAZ);
    assert.equal(hataliIhlali(emir(10, ucAdim('bekliyor')), 2, 1, true), ADIM_ACIK_DEGIL);
    for (const adet of [0, -1, 1.5, 11]) assert.equal(hataliIhlali(emir(10, ucAdim()), 2, adet, true), HATALI_ADET, String(adet));
    assert.equal(hataliIhlali({ ...emir(10, ucAdim()), durum: 'bitti' }, 2, 1, true), ACIK_DEGIL);
    assert.equal(hataliIhlali(emir(10, ucAdim()), 2, 1, false), HATALI_ROTASIZ);
    assert.equal(hataliIhlali(emir(10, ucAdim()), 2, 10, false), null);
  });

  test('op numaraları komşuların arasından, ortadan açılır', () => {
    assert.deepEqual(araOpNolari(20, 30, 2), [25, 26]);
    assert.deepEqual(araOpNolari(30, 40, 3), [35, 36, 37]);
    assert.deepEqual(araOpNolari(20, 23, 2), [21, 22]);
    assert.deepEqual(araOpNolari(0, 10, 2), [5, 6]);
    assert.deepEqual(araOpNolari(30, null, 3), [35, 36, 37]);
    assert.equal(araOpNolari(20, 22, 2), null);
    assert.equal(araOpNolari(0, 1, 2), null);
  });

  test('kalite adımının tipi ve istasyonu', () => {
    const tipler = [
      { kod: 'BM', grup: 'KAL', aktif: true, varsayilanIstasyonId: null }, { kod: 'GM', grup: 'KAL', aktif: true, varsayilanIstasyonId: 7 },
      { kod: 'TOR', grup: 'TAL', aktif: true, varsayilanIstasyonId: null },
    ];
    assert.equal(kaliteTipiSec(tipler)?.kod, 'GM');
    assert.equal(kaliteTipiSec(tipler.map((t) => (t.kod === 'GM' ? { ...t, aktif: false } : t)))?.kod, 'BM');
    assert.equal(kaliteTipiSec(tipler.filter((t) => t.grup !== 'KAL')), null);
    const istasyonlar = [{ id: 5, tip: 'kalite', aktif: true }, { id: 7, tip: 'kalite', aktif: true }, { id: 9, tip: 'uretim', aktif: true }];
    assert.equal(kaliteIstasyonuSec({ varsayilanIstasyonId: 7 }, istasyonlar, 3), 7);
    assert.equal(kaliteIstasyonuSec({ varsayilanIstasyonId: 9 }, istasyonlar, 3), 5);
    assert.equal(kaliteIstasyonuSec({ varsayilanIstasyonId: null }, istasyonlar.filter((i) => i.tip !== 'kalite'), 3), 3);
  });

  test('karar bir kez, bekleyen kalite adımına yazılır; rework adımı yalnız rework kararından sonra', () => {
    const acik = { durum: 'planli' as const, arsiv: false };
    assert.equal(hataliKarariIhlali({ karar: null }, { durum: 'bekliyor' }, acik), null);
    assert.equal(hataliKarariIhlali({ karar: 'hurda' }, { durum: 'bekliyor' }, acik), HATALI_KARAR_VERILMIS);
    assert.equal(hataliKarariIhlali({ karar: null }, { durum: 'calisiyor' }, acik), HATALI_KALITE_BASLAMIS);
    assert.equal(hataliKarariIhlali({ karar: null }, null, acik), HATALI_KALITE_BASLAMIS);
    assert.equal(hataliKarariIhlali({ karar: null }, { durum: 'bekliyor' }, { durum: 'iptal', arsiv: false }), ACIK_DEGIL);
    assert.equal(reworkAdimiIhlali({ karar: 'rework' }, { durum: 'bekliyor' }), null);
    assert.equal(reworkAdimiIhlali({ karar: null }, { durum: 'bekliyor' }), REWORK_KARARSIZ);
    assert.equal(reworkAdimiIhlali({ karar: 'hurda' }, null), REWORK_KARARSIZ);
    assert.equal(reworkAdimiIhlali({ karar: 'rework' }, { durum: 'calisiyor' }), REWORK_BASLAMIS);
  });

  test('7 a: fason rework termini girilmezse 7 gün; girilen ve iç kaynak değişmez', () => {
    assert.equal(reworkTermini({ kaynak: { tur: 'fason' as const }, terminGun: null }).terminGun, FASON_VARSAYILAN_GUN);
    assert.equal(reworkTermini({ kaynak: { tur: 'fason' as const }, terminGun: 3 }).terminGun, 3);
    assert.equal(reworkTermini({ kaynak: { tur: 'makine' as const }, terminGun: null }).terminGun, null);
    assert.equal(reworkTermini({ kaynak: null, terminGun: null }).terminGun, null);
  });
});
