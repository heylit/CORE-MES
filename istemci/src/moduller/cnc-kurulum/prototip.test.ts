import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WASM_YER_TUTUCU, prototipBirlestir, prototipYukle, stepOkuyucuYukle } from './prototip.ts';

const sha256 = (metin: string): string => createHash('sha256').update(metin, 'utf8').digest('hex');

// Bu iki sabit prototipin onaysız değişmesini yakalar; prototip ancak onayla değişir ve değer o onayla yenilenir (son: 352,
// tekrar eden tezgâhlar teke indi; WASM metni değişmedi).
const PROTOTIP_SHA256 = '9b4dcc28a5a5f6b094e83acddf5cd3a67bc5af5b64c8d9eb9cfdaadd2b2e81cd';
const WASM_SHA256 = 'a3842f57deb86a1351d4c1bcdaec642bded355c8fc56bd0586d917344ab5f610';

describe('CNC prototipi', () => {
  it('PRT-01: açılışta yüklenen prototipte STEP okuyucusunun WASM metni yoktur (yer tutucu boşaltılmıştır, sayfa 3 MB altındadır)', async () => {
    const prototip = await prototipYukle();
    expect(prototip).toContain('id="occtWasm"');
    expect(prototip).not.toContain(WASM_YER_TUTUCU);
    expect(prototip).not.toContain('AGFzbQ');
    expect(prototip.length).toBeLessThan(3_000_000);
  });

  it('PRT-03: açılışta yüklenen prototip metni ile kabuğun sunduğu WASM metni onaylı sürümle aynıdır', async () => {
    expect(sha256(await prototipYukle())).toBe(PROTOTIP_SHA256);
    expect(sha256(await stepOkuyucuYukle())).toBe(WASM_SHA256);
  });

  it('PRT-02: değiştirme metnindeki $ dizileri yorumlanmaz; yer tutucusu eksik ya da çift HTML reddedilir', () => {
    expect(prototipBirlestir(`a${WASM_YER_TUTUCU}b`, "$&$1$'")).toBe("a$&$1$'b");
    expect(() => prototipBirlestir('ab', 'x')).toThrow();
    expect(() => prototipBirlestir(`${WASM_YER_TUTUCU}${WASM_YER_TUTUCU}`, 'x')).toThrow();
  });
});
