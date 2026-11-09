import { describe, expect, it } from 'vitest';
import { icerikKimligi, sha256Yazilim } from './ozet.ts';

describe('içerik özeti', () => {
  it('yazılım SHA-256 bilinen değeri verir (FIPS 180-2 "abc")', () => {
    expect(sha256Yazilim(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('kimlik UUID biçimindedir ve içerikten türer', async () => {
    const a = await icerikKimligi(new TextEncoder().encode('abc'));
    expect(a).toBe('ba7816bf-8f01-8fea-8141-40de5dae2223');
    expect(await icerikKimligi(new TextEncoder().encode('abd'))).not.toBe(a);
  });
});
