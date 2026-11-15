import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import {
  adAnahtari, adOneki, arsivdeMi, duzeyCoz, enAzMi, firmaKlasorAdi, gorunurMu, projeKlasorAdi, sablonDenetle, siparisKlasorAdi, sistemAdi, yetkiKaynagi,
} from './kurallar.ts';
import type { KlasorDugumu } from './kurallar.ts';

// Ağaç: 1 Ortak (özel) > 2 Duyurular > 3 Eski duyurular; 4 Kalite (özel) > 5 Şikayetler (özel).
const agac = new Map<number, KlasorDugumu>([
  [1, { id: 1, ustId: null, ozelYetki: true }],
  [2, { id: 2, ustId: 1, ozelYetki: false }],
  [3, { id: 3, ustId: 2, ozelYetki: false }],
  [4, { id: 4, ustId: null, ozelYetki: true }],
  [5, { id: 5, ustId: 4, ozelYetki: true }],
]);
const KALITE = 10;
const OPERATOR = 11;
const yetkiler = new Map<number, Map<number, VerilenDuzey>>([
  [1, new Map<number, VerilenDuzey>([[KALITE, 'ekler'], [OPERATOR, 'gorur']])],
  [4, new Map<number, VerilenDuzey>([[KALITE, 'yonetir'], [OPERATOR, 'gorur']])],
  [5, new Map<number, VerilenDuzey>([[KALITE, 'yonetir']])],
]);
const rol = (id: number, yonetici = false) => ({ id, yonetici });

test('OD-1 düzeyler sıralıdır: üstteki alttakini içerir, alttaki üsttekini içermez', () => {
  assert.equal(enAzMi('yonetir', 'ekler'), true);
  assert.equal(enAzMi('ekler', 'gorur'), true);
  assert.equal(enAzMi('gorur', 'ekler'), false);
  assert.equal(enAzMi('yok', 'gorur'), false);
});

test('OD-2 miras: özel yetkisiz alt klasör en yakın özel üstün satırlarını alır; özel alt klasör kendi satırını', () => {
  assert.equal(yetkiKaynagi(3, agac), 1);
  assert.equal(yetkiKaynagi(5, agac), 5);
  assert.equal(duzeyCoz(3, agac, yetkiler, [rol(KALITE)]), 'ekler');
  assert.equal(duzeyCoz(5, agac, yetkiler, [rol(OPERATOR)]), 'yok');
});

test('OD-2 kopuk ya da döngülü zincir yetki vermez', () => {
  const bozuk = new Map<number, KlasorDugumu>([[7, { id: 7, ustId: 8, ozelYetki: false }], [8, { id: 8, ustId: 7, ozelYetki: false }]]);
  assert.equal(yetkiKaynagi(7, bozuk), null);
  assert.equal(duzeyCoz(7, bozuk, yetkiler, [rol(KALITE)]), 'yok');
  assert.equal(gorunurMu(7, bozuk, () => 'yonetir'), false);
});

test('OD-3 kişinin düzeyi rollerinin en yükseğidir; yönetici her klasörde yönetir', () => {
  assert.equal(duzeyCoz(4, agac, yetkiler, [rol(OPERATOR), rol(KALITE)]), 'yonetir');
  assert.equal(duzeyCoz(5, agac, yetkiler, [rol(99, true)]), 'yonetir');
  assert.equal(duzeyCoz(1, agac, yetkiler, []), 'yok');
});

test('OD-4 bilinmeyen klasörde düzey yoktur (yönetici için de)', () => {
  assert.equal(duzeyCoz(42, agac, yetkiler, [rol(99, true)]), 'yok');
});

test('OD-5 görünmezlik: üstü görünmeyen klasör, kendi düzeyi olsa da görünmez', () => {
  const duzey = (id: number) => duzeyCoz(id, agac, yetkiler, [rol(OPERATOR)]);
  assert.equal(gorunurMu(3, agac, duzey), true);
  assert.equal(gorunurMu(5, agac, duzey), false);
  const yalnizAlt = new Map<number, Map<number, VerilenDuzey>>([[5, new Map<number, VerilenDuzey>([[OPERATOR, 'gorur']])]]);
  assert.equal(gorunurMu(5, agac, (id) => duzeyCoz(id, agac, yalnizAlt, [rol(OPERATOR)])), false);
});

test('OD-6 ad anahtarı tr-TR küçük harf ve birleşik biçimdir', () => {
  assert.equal(adAnahtari('İSTASYON Iİ'), adAnahtari('istasyon ıi'));
  assert.notEqual(adAnahtari('I'), adAnahtari('i'));
  assert.equal(adAnahtari('  Rapor.pdf '), 'rapor.pdf');
  assert.equal(adAnahtari('ş'), adAnahtari('ş'));
});

describe('kayda bağlı klasör kuralları (kart 3288)', () => {
  test('KK-1 sistem adı: ayırıcı ve denetim karakteri tireye, boşluk teke, 120 karakterde kesilir; boş ad yedeğe düşer', () => {
    assert.equal(sistemAdi('  ORN A/B\\C\tD  ', 'Y'), 'ORN A-B-C-D');
    assert.equal([...sistemAdi('Ş'.repeat(200), 'Y')].length, 120);
    assert.equal(sistemAdi('   ', 'Y'), 'Y');
    assert.equal(sistemAdi('..', 'Y'), 'Y');
    assert.equal(firmaKlasorAdi({ id: 7, kod: null, ad: 'ORN Döküm' }), 'M-7 ORN Döküm');
    assert.equal(firmaKlasorAdi({ id: 7, kod: ' ORN-M7 ', ad: 'ORN Döküm' }), 'ORN-M7 ORN Döküm');
    assert.equal(siparisKlasorAdi({ id: 1, no: 'SS-2026-0001', musteriSiparisNo: ' ', iptal: false }), 'SS-2026-0001');
    assert.equal(projeKlasorAdi({ id: 1, kod: 'ORN-P-1', ad: 'Mil' }), 'ORN-P-1 Mil');
  });

  test('KK-5 ad önerisi en yakın sipariş ya da proje klasöründen; sistem dışı ağaçta yok', () => {
    const yol = [{ ad: 'Müşteriler', kaynakTur: 'kok' }, { ad: 'ORN-M1 ORN', kaynakTur: 'firma' }, { ad: 'SS-2026-0001 (PO-1)', kaynakTur: 'siparis' }];
    assert.deepEqual(adOneki(yol), { onek: 'SS-2026-0001', altKlasor: null });
    assert.deepEqual(adOneki([...yol, { ad: 'Çizim ve model', kaynakTur: null }]), { onek: 'SS-2026-0001', altKlasor: 'Çizim-ve-model' });
    assert.deepEqual(adOneki([...yol, { ad: 'ORN-P-1 Mil', kaynakTur: 'proje' }, { ad: 'Üretim', kaynakTur: null }]), { onek: 'ORN-P-1', altKlasor: 'Üretim' });
    assert.equal(adOneki([{ ad: 'Duyurular', kaynakTur: null }]), null);
  });

  test('KK-7 arşivdeki klasörün kendisi ve altı arşivde sayılır; döngü arşivde sayılır', () => {
    const k = new Map([
      [1, { id: 1, ustId: null, ozelYetki: true, arsiv: false }],
      [2, { id: 2, ustId: 1, ozelYetki: false, arsiv: true }],
      [3, { id: 3, ustId: 2, ozelYetki: false, arsiv: false }],
      [4, { id: 4, ustId: 5, ozelYetki: false, arsiv: false }],
      [5, { id: 5, ustId: 4, ozelYetki: false, arsiv: false }],
    ]);
    assert.equal(arsivdeMi(1, k), false);
    assert.equal(arsivdeMi(2, k), true);
    assert.equal(arsivdeMi(3, k), true);
    assert.equal(arsivdeMi(4, k), true);
  });

  test('KK-6 şablon adı tr-TR harf duyarsız tekil', () => {
    assert.equal(sablonDenetle(['Kalite', 'Teklif']), null);
    assert.notEqual(sablonDenetle(['İç', 'iç']), null);
  });
});
