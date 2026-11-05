import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { adAnahtari, duzeyCoz, enAzMi, gorunurMu, yetkiKaynagi } from './kurallar.ts';
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
