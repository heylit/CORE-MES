import { describe, expect, it } from 'vitest';
import { planlamaParcasi } from './planlama-derle.ts';

// 741 a: tezgâh panosu (zz36) "şimdi"yi sayfanın kaydettiği gerçek saatten alır; donuk bölge ve sürükleme alt sınırı başlangıç günü 07:00'ye
// sabit değildir. Pano bütün sayfayla koşar; burada kaynağı denetlenir.
describe('tezgâh panosunun şimdisi (741 a)', () => {
  const kaynak = planlamaParcasi('zz36-tezgah-panosu');
  it('donuk bölge ve şimdi çizgisi sayfanın şimdisinden sayılır', () => {
    expect(kaynak).not.toMatch(/\b7 \+ S\.frz\b/);
    expect(kaynak).not.toMatch(/\bnow = 7\b/);
    expect(kaynak).toMatch(/Object\.defineProperty\(S, 'now'/);
  });
  it('şimdi yoksa başlangıç günü 07:00, varsa gece de dahil kaydedilen saattir', () => {
    const tanim = /Object\.defineProperty\(S, 'now', \{ get: \(\) => (\{[^\n]*\}) \}\);/.exec(kaynak)?.[1];
    expect(tanim).toBeTruthy();
    const now = (simdi: unknown) => new Function('dis', `return (() => ${tanim!})();`)({ G: () => ({ simdi }) }) as number;
    expect([now(undefined), now(null), now(0.5), now(58.5), now(-3)]).toEqual([7, 7, 0.5, 58.5, 7]);
  });
});
