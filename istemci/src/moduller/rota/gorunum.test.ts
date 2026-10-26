import { describe, expect, it } from 'vitest';
import { ikiOndalikMetni, operatorMetni } from './gorunum.ts';

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

// 561 1 b: İstasyonlar'ın "1 operatör N tezgâha bakar" girişiyle aynı okuma (567 ortak anlaşma).
describe('operatorMetni', () => {
  it('1/N tezgâh sayısıyla, öteki değerler makine başına operatörle okunur', () => {
    expect([0.5, 0.33, 0.16, 0.1].map(operatorMetni)).toEqual(['1 operatör 2 tezgâha bakar', '1 operatör 3 tezgâha bakar', '1 operatör 6 tezgâha bakar', '1 operatör 10 tezgâha bakar']);
    expect([1, 2, 0.4, 0].map(operatorMetni)).toEqual(['1 operatör/makine', '2 operatör/makine', '0,4 operatör/makine', 'Operatör gerekmez']);
  });
});
