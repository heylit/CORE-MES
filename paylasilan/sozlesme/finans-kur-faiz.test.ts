import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kurFaizTopluGovdesi } from './finans.ts';

// Oranlar uydurmadır.
const mesajlar = (satirlar: unknown[]) => {
  const r = kurFaizTopluGovdesi.safeParse({ satirlar });
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

test('1699: aynı gün ve para biriminde aylık ve günlük faiz çakışır, metin para birimi ve günü söyler', () => {
  assert.deepEqual(mesajlar([
    { tur: 'faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 3.2 },
    { tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 0.1 },
  ]), ['2. satır aynı para birimi ve tarihte ikinci faiz; aylık ve günlük faiz aynı oranın iki yazılışıdır, biri kalmalı.']);
});

test('1699: kur tekrarının metni aynı kalır; farklı gün ya da para birimi çakışmaz', () => {
  assert.deepEqual(mesajlar([
    { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-01', deger: 41 },
    { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-01', deger: 41 },
  ]), ['2. satır aynı tür, para birimi ve tarihle ikinci kez var.']);
  assert.deepEqual(mesajlar([
    { tur: 'faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 3.2 },
    { tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-02', deger: 0.1 },
    { tur: 'gunluk_faiz', paraBirimi: 'USD', tarih: '2026-10-01', deger: 0.02 },
  ]), []);
});
