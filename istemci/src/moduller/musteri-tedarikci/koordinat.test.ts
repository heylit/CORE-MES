import { describe, expect, it } from 'vitest';
import { koordinatMetni, koordinatiDenetle, konumuAyristir, sayiOku } from './koordinat.ts';

describe('konumuAyristir', () => {
  it.each([
    ['41.0123, 29.0456', 41.0123, 29.0456],
    ['41.0123,29.0456', 41.0123, 29.0456],
    ['  -33.8688 151.2093 ', -33.8688, 151.2093],
    ['41,0123; 29,0456', 41.0123, 29.0456],
    ['https://www.google.com/maps/place/Ornek/@41.0123,29.0456,15z/data=x', 41.0123, 29.0456],
    ['https://www.google.com/maps?q=41.0123,29.0456', 41.0123, 29.0456],
    ['https://www.google.com/maps?q=41.0123%2C29.0456&z=10', 41.0123, 29.0456],
    ['https://maps.google.com/?ll=41.0123,29.0456', 41.0123, 29.0456],
    ['https://www.google.com/maps/place/x/data=!3d41.0123!4d29.0456', 41.0123, 29.0456],
    ['https://www.openstreetmap.org/?mlat=41.0123&mlon=29.0456#map=15/41.0/29.0', 41.0123, 29.0456],
    ['https://www.openstreetmap.org/#map=16/41.0123/29.0456', 41.0123, 29.0456],
  ])('%s -> okunur', (girdi, enlem, boylam) => {
    expect(konumuAyristir(girdi)).toEqual({ enlem, boylam });
  });

  it.each([
    [''],
    ['   '],
    ['Ornek yer'],
    ['41.0123'],
    ['91.0, 29.0'],
    ['41.0, 181.0'],
    ['https://www.google.com/maps/place/Ornek'],
    ['https://maps.app.goo.gl/abcdef'],
  ])('%j -> null', (girdi) => {
    expect(konumuAyristir(girdi)).toBeNull();
  });
});

describe('sayiOku ve koordinatiDenetle', () => {
  it('boş kutu null, virgül ondalık sayılır, harf hatadır', () => {
    expect(sayiOku('', 'Enlem')).toEqual({ deger: null });
    expect(sayiOku('41,5', 'Enlem')).toEqual({ deger: 41.5 });
    expect(sayiOku('abc', 'Enlem')).toEqual({ hata: 'Enlem sayı olmalıdır.' });
  });

  it('ikisi birlikte verilir ya da hiçbiri', () => {
    expect(koordinatiDenetle('', '')).toEqual({ deger: null });
    expect(koordinatiDenetle('41', '29')).toEqual({ deger: { enlem: 41, boylam: 29 } });
    expect(koordinatiDenetle('41', '').boylam).toMatch(/birlikte/);
    expect(koordinatiDenetle('', '29').enlem).toMatch(/birlikte/);
  });

  it('aralık dışı reddedilir', () => {
    expect(koordinatiDenetle('95', '29').enlem).toMatch(/-90/);
    expect(koordinatiDenetle('41', '200').boylam).toMatch(/-180/);
  });

  it('koordinat metni ikisi de varsa yazılır, yoksa null', () => {
    expect(koordinatMetni(41.0123, 29.0456)).toBe('41.012300, 29.045600');
    expect(koordinatMetni(null, 29)).toBeNull();
  });
});
