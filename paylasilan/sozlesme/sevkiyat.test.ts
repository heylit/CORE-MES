import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bekleyenBolCevabi, bekleyenBolGovdesi, gunPlaniCevabi, isCevabi } from './sevkiyat.ts';

// Okuma cevabı uyarı taşımaz; eski istemci alanı görmezden gelir.
test('iş ve gün planı cevabı stok uyarılarını boş olabilen metin listesi olarak taşır', () => {
  for (const sema of [isCevabi, gunPlaniCevabi]) {
    const uyarilar = sema.shape.uyarilar;
    assert.equal(uyarilar.safeParse(undefined).success, true);
    assert.deepEqual(uyarilar.parse(['Red parça uyarıyla sevke çıktı']), ['Red parça uyarıyla sevke çıktı']);
    assert.equal(uyarilar.safeParse([1]).success, false);
  }
});

test('bekleyen bölme gövdesi adedi ondalık metin olarak alır, cevap iki kaydın kimliğini verir', () => {
  assert.deepEqual(bekleyenBolGovdesi.parse({ adet: '12.5' }), { adet: '12.5' });
  assert.equal(bekleyenBolGovdesi.safeParse({ adet: 12 }).success, false);
  assert.equal(bekleyenBolGovdesi.safeParse({ adet: '1,5' }).success, false);
  assert.deepEqual(bekleyenBolCevabi.parse({ id: 3, yeniId: 4 }), { id: 3, yeniId: 4 });
  assert.equal(bekleyenBolCevabi.safeParse({ id: 3 }).success, false);
});
