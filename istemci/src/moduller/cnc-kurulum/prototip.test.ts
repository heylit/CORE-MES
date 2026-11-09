import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stepOkuyucuYukle } from './prototip.ts';

const sha256 = (metin: string): string => createHash('sha256').update(metin, 'utf8').digest('hex');

// Kabuğun sunduğu STEP okuyucusu WASM metni onaysız değişirse yakalanır; değer onayla yenilenir.
const WASM_SHA256 = 'a3842f57deb86a1351d4c1bcdaec642bded355c8fc56bd0586d917344ab5f610';

describe('STEP okuyucusu', () => {
  it('PRT-03: kabuğun sunduğu WASM metni onaylı sürümle aynıdır', async () => {
    expect(sha256(await stepOkuyucuYukle())).toBe(WASM_SHA256);
  });
});
