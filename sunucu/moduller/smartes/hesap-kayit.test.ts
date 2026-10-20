import assert from 'node:assert/strict';
import { test } from 'node:test';
import { geriCekilmeMs, pencereAtlanmaliMi, smartesIsEmriNo, tanimKoduUygunMu, yasakMetotMu } from './kurallar.ts';

// Bugünkü davranışın kaydı: düzeltmeden önce çıktılar sabitlenir, değişiklik bu testleri bilerek günceller.

test('SM-HESAP: geri çekilme 60 sn ile başlar, katlanır, 60 dk ile sınırlanır', () => {
  assert.deepEqual([0, 1, 2, 5, 10].map(geriCekilmeMs), [60000, 60000, 120000, 960000, 3600000]);
});

test('SM-HESAP: iş emri numarası üretim emri no ile operasyon sırasının birleşimidir', () => {
  assert.equal(smartesIsEmriNo('UE-000004', 20), 'UE-000004-20');
});

test('SM-HESAP: tanım kodu boşluksuz başlamalı, boş ya da çok uzun olmamalı', () => {
  assert.deepEqual(['ORN-TORNA-1', ' X', '', 'A'.repeat(60)].map(tanimKoduUygunMu), [true, false, false, false]);
});

test('SM-HESAP: yalnız silme metodu yasaktır', () => {
  assert.deepEqual(['WorkOrdersCreateUpdate', 'WorkOrdersDelete', 'GetWorkorderStatus'].map(yasakMetotMu), [false, true, false]);
});

test('SM-HESAP: pencere atlama bugün hiçbir girdide atlamaz', () => {
  assert.deepEqual([pencereAtlanmaliMi(true, 0), pencereAtlanmaliMi(true, 10), pencereAtlanmaliMi(false, 10)], [false, false, false]);
});
