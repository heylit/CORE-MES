import { afterEach, describe, expect, it, vi } from 'vitest';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { csvHucresi, csvIndir, formulKoru, csvMetni, ondalik } from './csv.ts';

describe('ortak CSV metni', () => {
  it('başlık ve satırlar noktalı virgülle, BOM ile; sayı ondalık virgülle, boş değer boş alan', () => {
    const m = csvMetni(['Kod', 'Hazırlık dk', 'Not'], [['OP1', ondalik('2.5000'), null], ['OP2', 10, 'a"b;c']]);
    expect(m.startsWith('﻿')).toBe(true);
    expect(m.slice(1).split('\r\n')).toEqual(['"Kod";"Hazırlık dk";"Not"', '"OP1";"2,5";""', '"OP2";"10";"a""b;c"']);
  });

  it('satırsız liste yalnız başlık satırıdır; boş ondalık boş kalır', () => {
    expect(csvMetni(['Kod'], []).slice(1)).toBe('"Kod"');
    expect(ondalik(null)).toBeNull();
  });

  it('formül gibi başlayan metin \' ile başlar; sayı, eksi sayı ve sıradan metin değişmez', () => {
    for (const k of ['=HYPERLINK("http://x","t")', '+1', '-1+2', '@SUM(A1)', '\tx', '\rx']) expect(csvHucresi(k)).toBe(`"'${k.replace(/"/g, '""')}"`);
    expect(csvHucresi(-2.5)).toBe('"-2,5"');
    expect(csvHucresi('a=b')).toBe('"a=b"');
    expect(csvHucresi(null)).toBe('""');
    expect(formulKoru('=1+1')).toBe("'=1+1");
    expect(formulKoru('Ali')).toBe('Ali');
    expect(formulKoru('-0,02')).toBe("'-0,02");
    expect(formulKoru('-0,02', { sayiSerbest: true })).toBe('-0,02');
    expect(formulKoru('-1+2', { sayiSerbest: true })).toBe("'-1+2");
    expect(csvMetni(['=Baslik'], [['=cmd|\' /C calc\'!A0']]).slice(1)).toBe(`"'=Baslik"\r\n"'=cmd|' /C calc'!A0"`);
  });
});

describe('ortak CSV indirme', () => {
  const asil = { olustur: URL.createObjectURL, birak: URL.revokeObjectURL };
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.assign(URL, { createObjectURL: asil.olustur, revokeObjectURL: asil.birak });
  });

  it('dosya adı tesis gününü taşır; adres bir saniye sonra bırakılır', () => {
    vi.useFakeTimers();
    const olustur = vi.fn(() => 'blob:csv');
    const birak = vi.fn();
    Object.assign(URL, { createObjectURL: olustur, revokeObjectURL: birak });
    let ad = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { ad = this.download; });

    csvIndir('operasyonlar', ['Kod'], [['OP1']]);

    expect(olustur).toHaveBeenCalledOnce();
    expect(ad).toBe(`operasyonlar-${tesisGunu(Date.now())}.csv`);
    expect(birak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(birak).toHaveBeenCalledWith('blob:csv');
  });
});
