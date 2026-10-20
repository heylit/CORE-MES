import { beforeEach, describe, expect, it } from 'vitest';
import { tanitimGoruldu, tanitimGorulduMu } from './tanitim.ts';

beforeEach(() => { localStorage.clear(); });

describe('tanitim', () => {
  it('kisi basina tutulur: biri gorunce oteki icin yine onerilir', () => {
    expect(tanitimGorulduMu(1)).toBe(false);
    tanitimGoruldu(1);
    expect(tanitimGorulduMu(1)).toBe(true);
    expect(tanitimGorulduMu(2)).toBe(false);
  });

  it('eski surumde gorulen tanitim yeniden onerilir', () => {
    localStorage.setItem('tmi:tanitim:1', '0');
    expect(tanitimGorulduMu(1)).toBe(false);
  });
});
