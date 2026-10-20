import { describe, expect, it } from 'vitest';
import { ikiOndalikMetni } from './gorunum.ts';

describe('ikiOndalikMetni', () => {
  it('iki ondalık, Türkçe virgül; yoksa "–"', () => {
    expect(ikiOndalikMetni('2.3456')).toBe('2,35');
    expect(ikiOndalikMetni('30.00')).toBe('30,00');
    expect(ikiOndalikMetni('0')).toBe('0,00');
    expect(ikiOndalikMetni(null)).toBe('–');
  });
  it('sıfırdan farklı değer 0,00 görünmesin: dört ondalık', () => {
    expect(ikiOndalikMetni('0.0040')).toBe('0,0040');
    expect(ikiOndalikMetni('0.0049')).toBe('0,0049');
    expect(ikiOndalikMetni('0.0149')).toBe('0,01');
    expect(ikiOndalikMetni('0.0050')).toBe('0,01');
  });
});
