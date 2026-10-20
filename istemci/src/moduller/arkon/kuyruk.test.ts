import { describe, expect, it } from 'vitest';
import { kuyrukGonderilir } from '../../../../arkon/web/src/data/kuyruk.ts';

// Arkon'un gönderim kuyruğu (arkon/web/src/data/store.ts flush): ortak tablette kişi değişince öteki kişinin öğesi gönderilmez.
describe('Arkon gönderim kuyruğu sahibi', () => {
  it('öğe kuyruğa alan kişinin oturumunda gider', () => {
    expect(kuyrukGonderilir({ uid: '7' }, '7')).toBe(true);
  });
  it('başka kişinin ya da oturumsuz cihazın öğesi gönderilmez, kuyrukta bekler', () => {
    expect(kuyrukGonderilir({ uid: '7' }, '8')).toBe(false);
    expect(kuyrukGonderilir({ uid: '7' }, null)).toBe(false);
    expect(kuyrukGonderilir({ uid: '7' }, undefined)).toBe(false);
  });
  it('sahipsiz (önceki sürümde kuyruğa girmiş) öğe eskisi gibi gider', () => {
    expect(kuyrukGonderilir({}, '8')).toBe(true);
  });
});
