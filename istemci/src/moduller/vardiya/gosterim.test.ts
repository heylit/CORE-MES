import { describe, expect, it } from 'vitest';
import { kisaAdlar, saatOku, tarihOku, zamanMetni, zamanOku } from './gosterim.ts';

describe('kisaAdlar', () => {
  it('baş harfi aynı vardiyalar ayrışana kadar harf ekler; tek olan tek harf kalır', () => {
    expect(kisaAdlar(['Gece', 'Gündüz', 'Akşam'])).toEqual(['Ge', 'Gü', 'A']);
    expect(kisaAdlar(['Gündüz', 'Akşam'])).toEqual(['G', 'A']);
  });

  it('küçük harfle yazılmış ad büyük harfle başlar; üç harfte ayrışmayanda son sözcük eklenir', () => {
    expect(kisaAdlar(['ikinci', 'ilk'])).toEqual(['İk', 'İl']);
    expect(kisaAdlar(['Vardiya 1', 'Vardiya 2', 'Gece'])).toEqual(['V1', 'V2', 'G']);
  });
});

describe('yerel ayardan bağımsız saat ve tarih okuma', () => {
  it('saat 24 saatlik SS:DD olarak okunur; 12 saatlik ve geçersiz metin reddedilir', () => {
    expect(saatOku('08:00')).toBe('08:00');
    expect(saatOku('8:30')).toBe('08:30');
    expect(saatOku('16.45')).toBe('16:45');
    expect(saatOku('00:00')).toBe('00:00');
    expect(saatOku('23:59')).toBe('23:59');
    for (const kotu of ['24:00', '12:60', '04:00 PM', '', 'abc', '8']) expect(saatOku(kotu)).toBeNull();
  });

  it('tarih GG.AA.YYYY olarak okunur; olmayan gün ve ay/gün/yıl sırası kabul edilmez', () => {
    expect(tarihOku('29.10.2026')).toBe('2026-10-29');
    expect(tarihOku('1.2.2026')).toBe('2026-02-01');
    expect(tarihOku('29.02.2028')).toBe('2028-02-29');
    expect(tarihOku('29.02.2026')).toBeNull();
    expect(tarihOku('01.01.1899')).toBeNull();
    expect(tarihOku('01.01.1900')).toBe('1900-01-01');
    for (const kotu of ['31.02.2026', '10/29/2026', '2026-10-29', '', '29.13.2026']) expect(tarihOku(kotu)).toBeNull();
  });

  it('zaman tarih ve saati birlikte okur ve yazar', () => {
    expect(zamanOku('29.10.2026 08:00')).toBe('2026-10-29T08:00');
    expect(zamanOku('29.10.2026')).toBeNull();
    expect(zamanMetni('2026-10-29T08:00')).toBe('29.10.2026 08:00');
    expect(zamanMetni('')).toBe('');
  });
});
