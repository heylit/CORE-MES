import { describe, expect, it } from 'vitest';
import { bolmeOku } from './RafOdagi.tsx';

const tus = (key: string, ek: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
  ({ key, altKey: false, ctrlKey: false, metaKey: false, ...ek });

describe('bölme okları', () => {
  it('yalın ok bölme değiştirir', () => {
    expect(bolmeOku(tus('ArrowRight'))).toBe('ileri');
    expect(bolmeOku(tus('ArrowLeft'))).toBe('geri');
    expect(bolmeOku(tus('ArrowUp'))).toBeNull();
  });

  it('Alt+ok tarayıcının geri ve ilerisine kalır', () => {
    expect(bolmeOku(tus('ArrowLeft', { altKey: true }))).toBeNull();
    expect(bolmeOku(tus('ArrowRight', { altKey: true }))).toBeNull();
    expect(bolmeOku(tus('ArrowLeft', { metaKey: true }))).toBeNull();
  });
});
