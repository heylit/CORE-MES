import { describe, expect, it } from 'vitest';
import { studyoAcilir } from '../../../../arkon/web/src/data/studyo-yonu.ts';

// Arkon Hazırlık "Bu paketi stüdyoda aç" (arkon/web/src/app/hazirlik.ts openInLab): çizim sayfası kapalı rolde Operatör ekranına atmaz.
describe('Arkon stüdyoda aç', () => {
  it('çizim sayfasını gören rolde stüdyoya gidilir', () => {
    expect(studyoAcilir((s) => s === 'cizim')).toBe(true);
  });
  it('çizim sayfası kapalı rolde gidilmez', () => {
    expect(studyoAcilir((s) => s !== 'cizim')).toBe(false);
  });
});
