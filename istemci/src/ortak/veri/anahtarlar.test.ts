import { expect, it } from 'vitest';
import { anahtarlar } from './anahtarlar.ts';

// Anahtar değeri önbellek sözleşmesidir: değişirse oturum önbelleği başka anahtarda kalır.
it('oturum sorgu anahtari degismez', () => {
  expect(anahtarlar.oturum).toEqual(['oturum']);
});
