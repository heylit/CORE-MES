import { expect, it } from 'vitest';
import { anahtarlar } from './anahtarlar.ts';

it('saglik sorgu anahtari degismez', () => {
  expect(anahtarlar.saglik).toEqual(['saglik']);
});
