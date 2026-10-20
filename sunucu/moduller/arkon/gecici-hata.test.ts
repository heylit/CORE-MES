import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { cakisma, dogrulama, mesgul } from '#cekirdek/hata.ts';
import { geciciHataMi } from './servis.ts';

// A11: yansıma sınıflaması doğrudan ölçülür. Geçici hata satırı bekliyor tutar (sınırsız deneme); geçici olmayan HATALI_DENEME denemeden sonra "hatali" olur.
const vtHatasi = (code: string) => Object.assign(new pg.DatabaseError(`sunucu iletisi ${code}`, 0, 'error'), { code });

test('geçici: süre ve kilit aşımı, kilitlenme, serileştirme, bağlantı sınıfı, sunucu hazır değil, ağ hatası, 5xx uygulama hatası', () => {
  for (const code of ['57014', '55P03', '40P01', '40001', '08006', '57P01']) assert.equal(geciciHataMi(vtHatasi(code)), true, code);
  assert.equal(geciciHataMi(Object.assign(new Error('bağlantı reddedildi'), { code: 'ECONNREFUSED' })), true);
  assert.equal(geciciHataMi(mesgul()), true);
});

test('geçici değil: P0001, sınıf 22 ve 42, 4xx uygulama hatası, sıradan hata', () => {
  for (const code of ['P0001', '22003', '42501', '23505']) assert.equal(geciciHataMi(vtHatasi(code)), false, code);
  assert.equal(geciciHataMi(dogrulama('x')), false);
  assert.equal(geciciHataMi(cakisma('x')), false);
  assert.equal(geciciHataMi(new TypeError('x')), false);
  assert.equal(geciciHataMi(null), false);
});
