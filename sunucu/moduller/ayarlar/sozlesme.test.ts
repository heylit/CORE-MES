import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayarSemasi } from '#paylasilan/sozlesme/ayarlar.ts';

const ortak = { anahtar: 'deneme.ayar', baslik: 'B', aciklama: 'A' };

test('açık-kapalı ayar yalnız işaretliyken (kayıtlı değer okunamıyor) değersiz gelir', () => {
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'boolean', deger: null, gecersiz: true }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'boolean', deger: null }).success, false);
  // İşaret yalnız doğru değeriyle taşınır; yokluğu geçerli değer demektir.
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'boolean', deger: true }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'boolean', deger: true, gecersiz: false }).success, false);
});
