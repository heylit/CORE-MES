import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bekleyenBolCevabi, bekleyenBolGovdesi, elleKalemGovdesi, gunPlaniCevabi, isCevabi, serbestBirakGovdesi } from './sevkiyat.ts';

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

test('serbest bırakma kalemi ya da adayı anahtarla alır, erken gerekçesi en az on karakterdir', () => {
  assert.deepEqual(serbestBirakGovdesi.parse({ anahtarlar: ['kalem:4', 'urun:12', 'fason:7', 'alim:3'], tasima: 'biz' }), {
    anahtarlar: ['kalem:4', 'urun:12', 'fason:7', 'alim:3'], tasima: 'biz', erkenGerekce: null,
  });
  for (const a of ['elle:1', 'kalem:0', 'kalem:-1', 'urun:', 'urun:1x', ' kalem:1']) {
    assert.equal(serbestBirakGovdesi.safeParse({ anahtarlar: [a], tasima: 'biz' }).success, false, a);
  }
  assert.equal(serbestBirakGovdesi.safeParse({ anahtarlar: [], tasima: 'biz' }).success, false);
  assert.equal(serbestBirakGovdesi.safeParse({ anahtarlar: ['kalem:1'], tasima: 'arac' }).success, false);
  assert.equal(serbestBirakGovdesi.safeParse({ anahtarlar: ['kalem:1'], tasima: 'firma', erkenGerekce: 'kisa' }).success, false);
  assert.equal(serbestBirakGovdesi.parse({ anahtarlar: ['urun:1'], tasima: 'firma', erkenGerekce: '  Müşteri hattı duruyor  ' }).erkenGerekce, 'Müşteri hattı duruyor');
});

test('elle kalem firma, açıklama ve günü ister; dönüş günü boş olabilir', () => {
  const g = { tur: 'tamir', yon: 'gidis', firmaId: 5, malzemeNo: null, adet: null, istenenTarih: '2026-10-28', aciklama: 'Kalıp tamiri', tasima: 'biz', donusTarihi: '2026-11-04' };
  assert.deepEqual(elleKalemGovdesi.parse(g), g);
  assert.equal(elleKalemGovdesi.safeParse({ ...g, aciklama: ' ' }).success, false);
  assert.equal(elleKalemGovdesi.safeParse({ ...g, tur: 'hediye' }).success, false);
  assert.equal(elleKalemGovdesi.safeParse({ ...g, donusTarihi: null }).success, true);
});
