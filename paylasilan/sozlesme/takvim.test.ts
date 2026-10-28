import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AZAMI_TAKVIM_GUNU, takvimKaydiSemasi, takvimSorgusu } from './takvim.ts';

test('aralık iki ucu dahil kabul edilir; ters aralık ve sınırı aşan aralık reddedilir', () => {
  assert.equal(takvimSorgusu.safeParse({ baslangic: '2026-10-01', bitis: '2026-10-01' }).success, true);
  assert.equal(takvimSorgusu.safeParse({ baslangic: '2026-10-01', bitis: '2026-12-31' }).success, true);
  assert.equal(AZAMI_TAKVIM_GUNU, 93);
  const ters = takvimSorgusu.safeParse({ baslangic: '2026-10-02', bitis: '2026-10-01' });
  assert.equal(ters.success, false);
  assert.deepEqual(ters.error?.issues.map((i) => i.path), [['bitis']]);
  assert.equal(takvimSorgusu.safeParse({ baslangic: '2026-10-01', bitis: '2027-01-02' }).success, false);
  assert.equal(takvimSorgusu.safeParse({ baslangic: '2026-02-30', bitis: '2026-03-01' }).success, false);
});

test('kayıt bilinmeyen kaynağı ve boş başlığı kabul etmez; no ve ilgili boş olabilir', () => {
  const kayit = { kaynak: 'siparis', kimlik: '12', tarih: '2026-10-28', no: null, baslik: 'Sipariş', ilgili: null, durum: 'Onaylı', bitti: false };
  assert.equal(takvimKaydiSemasi.safeParse(kayit).success, true);
  assert.equal(takvimKaydiSemasi.safeParse({ ...kayit, kaynak: 'toplanti' }).success, false);
  assert.equal(takvimKaydiSemasi.safeParse({ ...kayit, baslik: '' }).success, false);
  assert.equal(takvimKaydiSemasi.safeParse({ ...kayit, kimlik: '' }).success, false);
});
