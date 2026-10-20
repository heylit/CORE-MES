import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tarihSemasi, zamanSemasi } from './zaman.ts';

const zamanMi = (deger: unknown): boolean => zamanSemasi.safeParse(deger).success;
const tarihMi = (deger: unknown): boolean => tarihSemasi.safeParse(deger).success;
const ileti = (sonuc: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined => sonuc.error?.issues[0]?.message;

test('zaman: saat dilimi bilgili ISO metni kabul edilir ve aynen kalır (saat farkı, Z, kesirli saniye)', () => {
  const gecerliler = [
    '2026-10-07T14:30:00+03:00',
    '2026-01-15T13:00:00+01:00',
    '2026-07-15T14:00:00+02:00',
    '2026-10-07T11:30:00Z',
    '2026-10-07T11:30:00.5+00:00',
    '2026-10-07T14:30:00.123456+03:00',
    '2026-10-07T06:00:00-05:30',
    '2024-02-29T23:59:59+14:00',
  ];
  for (const deger of gecerliler) assert.equal(zamanSemasi.parse(deger), deger);
});

test('zaman: saat dilimi taşımayan, tarih olmayan ve veritabanının düz metin biçimindeki değer reddedilir', () => {
  const gecersizler = [
    '2026-10-07T14:30:00', '2026-10-07 14:30:00+03', '2026-10-07T14:30:00+03', '2026-10-07T14:30+03:00', '2026-10-07',
    '2026-10-07T14:30:00.1234567+03:00', '2026-10-07T14:30:00+0300', ' 2026-10-07T14:30:00Z', '2026-10-07T14:30:00Z\n',
    'infinity', '', 'Wed Oct 07 2026',
  ];
  for (const deger of gecersizler) assert.equal(zamanMi(deger), false, JSON.stringify(deger));
  for (const deger of [null, undefined, 1791372600000, new Date()]) assert.equal(zamanMi(deger), false, String(deger));
});

test('zaman: takvimde ya da saatte olmayan değer biçime uysa da reddedilir', () => {
  assert.equal(zamanMi('2026-02-28T23:59:59Z'), true);
  for (const deger of [
    '2026-02-30T10:00:00Z', '2025-02-29T10:00:00Z', '2026-13-01T10:00:00Z', '2026-00-10T10:00:00Z', '2026-04-31T10:00:00Z',
    '2026-10-07T24:00:00Z', '2026-10-07T10:60:00Z', '2026-10-07T10:00:60Z', '2026-10-07T10:00:00+16:00', '2026-10-07T10:00:00+03:60',
  ]) assert.equal(zamanMi(deger), false, deger);
});

test('zaman: veritabanının sonlu çıktıları geçer (saniyeli saat farkı, altı basamaklı yıl, milattan önce); sonsuz değer ve 0000 yılı geçmez', () => {
  for (const deger of [
    '1900-06-01T13:56:56+01:56:56', '10000-06-01T15:00:00+03:00', '294277-01-01T02:59:59.999999+03:00',
    '0044-03-15T13:55:52+01:55:52 BC', '4713-01-01T01:55:52+01:55:52 BC', '0001-02-29T00:00:00Z BC', '0001-01-01T00:00:00Z',
  ]) assert.equal(zamanSemasi.parse(deger), deger);
  for (const deger of [
    'infinity', '-infinity', '0000-01-01T00:00:00Z', '0000-01-01T00:00:00Z BC', '0002-02-29T00:00:00Z BC', '1900-06-01T13:56:56+01:56:60',
    '1900-06-01T13:56:56+01:56:5', '2026-10-07T10:00:00+03:00 MS', '2026-10-07T10:00:00+03:00BC', '1234567-01-01T00:00:00Z',
  ]) assert.equal(zamanMi(deger), false, deger);
});

test('zaman: reddin iletisi Türkçedir; biçim ile geçersiz an ayrı söylenir', () => {
  assert.match(ileti(zamanSemasi.safeParse('2026-10-07T14:30:00')) ?? '', /saat dilimi bilgili ISO 8601/);
  assert.equal(ileti(zamanSemasi.safeParse('2026-02-30T10:00:00Z')), 'Geçerli bir tarih ve saat girin.');
});

test('tarih: GGGG-AA-GG metni kabul edilir ve aynen kalır; artık yıl günü yalnız artık yılda geçer', () => {
  for (const deger of ['2026-10-07', '2026-01-01', '2026-12-31', '2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) assert.equal(tarihSemasi.parse(deger), deger);
  // Veritabanı 0000 yılını kabul etmez; şemadan geçen tarih sorguda hata vermemeli.
  for (const deger of ['0000-01-01', '0000-12-31', '0000-02-29']) assert.equal(tarihMi(deger), false, deger);
  for (const deger of ['2025-02-29', '1900-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-01-32']) {
    assert.equal(tarihMi(deger), false, deger);
  }
});

test('tarih: saat taşıyan, başka sırada yazılan ve metin olmayan değer reddedilir', () => {
  for (const deger of ['2026-10-07T00:00:00Z', '07.10.2026', '2026-10-7', '2026/10/07', '20261007', '', ' 2026-10-07', '2026-10-07\n', 'infinity']) {
    assert.equal(tarihMi(deger), false, JSON.stringify(deger));
  }
  for (const deger of [null, undefined, 20261007, new Date('2026-10-07')]) assert.equal(tarihMi(deger), false, String(deger));
  assert.equal(ileti(tarihSemasi.safeParse('07.10.2026')), 'Tarih GGGG-AA-GG biçiminde olmalı.');
  assert.equal(ileti(tarihSemasi.safeParse('2026-02-30')), 'Geçerli bir tarih girin.');
});
