import { afterEach, describe, expect, it, vi } from 'vitest';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { csvIndir, csvMetni, ondalik } from './csv.ts';

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
