import { describe, expect, it } from 'vitest';
import { sistemKisayoluMu } from './gorunum.ts';

describe('görünüm tuşları', () => {
  it('Alt ya da Cmd ile basılan tuş tarayıcının geri ve ilerisine kalır', () => {
    expect(sistemKisayoluMu({ altKey: true, metaKey: false })).toBe(true);
    expect(sistemKisayoluMu({ altKey: false, metaKey: true })).toBe(true);
  });

  it('yalın tuş görünümündür', () => {
    expect(sistemKisayoluMu({ altKey: false, metaKey: false })).toBe(false);
  });
});
