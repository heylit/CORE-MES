import { afterEach, describe, expect, it } from 'vitest';
import { gercekBoyutOku, gercekBoyutYaz, mmOzniteligi, olcekOku, olcekSinirla, olcekYaz } from './gercek-boyut.ts';

afterEach(() => { localStorage.clear(); });

describe('gercek-boyut', () => {
  it('ölçek 0,5 ile 2 arasına sıkışır; sayı olmayan 1 olur', () => {
    expect(olcekSinirla(0.1)).toBe(0.5);
    expect(olcekSinirla(5)).toBe(2);
    expect(olcekSinirla(Number.NaN)).toBe(1);
    expect(olcekSinirla(1.23456)).toBe(1.235);
  });

  it('ayarlanmamış ekran null okur; kaydedilen ölçek ve gerçek boyut seçimi geri okunur, silinince null', () => {
    expect(olcekOku()).toBeNull();
    expect(gercekBoyutOku()).toBe(false);
    olcekYaz(1.1);
    gercekBoyutYaz(true);
    expect(olcekOku()).toBe(1.1);
    expect(gercekBoyutOku()).toBe(true);
    olcekYaz(null);
    expect(olcekOku()).toBeNull();
  });

  it('mm özniteliği ölçekle çarpılır, ayarsız ekranda ölçek 1', () => {
    expect(mmOzniteligi(100, null)).toBe('100mm');
    expect(mmOzniteligi(50, 1.1)).toBe('55mm');
    expect(mmOzniteligi(85.6, 1.125)).toBe('96.3mm');
  });
});
