import assert from 'node:assert/strict';
import { test } from 'node:test';
import { durumNoOku, durumYaz, enBuyukKartNo, sonrakiNolar } from './kart-no.ts';

const DURUM = '| Alan | Değer | Kaynak |\n|---|---|---|\n| Sonraki serbest kart no | `3016` (2798-3015 verildi) | K: koordinatör 18:53Z |\n';

test('kart-no: DURUM satırı okunur, yoksa hata', () => {
  assert.equal(durumNoOku(DURUM), 3016);
  assert.throws(() => durumNoOku('| Başka | `1` |'), /Sonraki serbest kart no/);
});

test('kart-no: belgede DURUM\'dan büyük numara varsa ondan sonrası verilir (geri kalmış DURUM)', () => {
  const metin = '- 3018 a "Evet" | 3023 secilmedi | kart 3019';
  assert.equal(enBuyukKartNo([metin], 3016), 3023);
  assert.deepEqual(sonrakiNolar(3016, 3023, 2), [3024, 3025]);
});

test('kart-no: DURUM ileride ise DURUM verilir', () => {
  assert.deepEqual(sonrakiNolar(3016, 3010, 1), [3016]);
  assert.deepEqual(sonrakiNolar(3016, null, 3), [3016, 3017, 3018]);
});

test('kart-no: PR, saat, kayıt adı ve yıl kart sayılmaz', () => {
  const metin = 'CORE-MES #3100 birlesti; kayit-3050: 11.11.2026 30:20 UTC; main 3099abcd; 2026';
  assert.equal(enBuyukKartNo([metin], 3016), null);
});

test('kart-no: aralık dışı sayı (çok büyük ya da çok küçük) kart sayılmaz', () => {
  assert.equal(enBuyukKartNo(['tutar 9000 TL, 1795 adet, kart 3020'], 3016), 3020);
});

test('kart-no: --yaz yalnız DURUM satırının değerini ve notunu değiştirir', () => {
  const yeni = durumYaz(DURUM, 3026, '3024, 3025 verildi 20:10Z');
  assert.equal(durumNoOku(yeni), 3026);
  assert.match(yeni, /\| Sonraki serbest kart no \| `3026` \(3024, 3025 verildi 20:10Z\) \| K: araclar\/kart-no\.ts \|\n$/);
  assert.equal(yeni.split('\n').slice(0, 2).join('\n'), DURUM.split('\n').slice(0, 2).join('\n'));
});
