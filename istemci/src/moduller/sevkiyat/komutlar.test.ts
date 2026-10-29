import { describe, expect, it } from 'vitest';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { gorunenKomutlar, komutlariTopla } from '../../ortak/rota/komutlar.ts';
import { komutlar } from './komutlar.ts';

// Kabuk gibi: kişinin görmediği sayfa listeden önce düşer.
const gor = (islemler: string[]) => gorunenKomutlar(komutlar, {
  sayfalar: SAYFALAR.filter((s) => maddeGorunurMu(s, islemler)), menuler: IKINCI_MENULER, islemler,
}).map((k) => k.anahtar);

describe('sevkiyat Ctrl K komutları', () => {
  it('kabuk denetiminden geçer: anahtar, simge, işlem ve yol (sayfa ya da menü maddesi) geçerli', () => {
    expect(komutlariTopla({ './komutlar.ts': { komutlar } }).map((k) => k.anahtar))
      .toEqual(['sevkiyat-yeni-is', 'sevkiyat-elle-is', 'sevkiyat-yeni-nokta', 'sevkiyat-yeni-arac']);
  });

  it('izinli: iş yazan iş komutlarını, tanım yazan tanım komutlarını görür', () => {
    expect(gor(['sayfa.sevkiyat', 'sevkiyat.is-yaz'])).toEqual(['sevkiyat-yeni-is', 'sevkiyat-elle-is']);
    expect(gor(['sayfa.sevkiyat', 'sevkiyat.tanim-yaz'])).toEqual(['sevkiyat-yeni-nokta', 'sevkiyat-yeni-arac']);
  });

  it('reddedilen: yalnız okuyan ya da sayfayı görmeyen hiçbir komutu görmez', () => {
    expect(gor(['sayfa.sevkiyat', 'sevkiyat.oku'])).toEqual([]);
    expect(gor(['sevkiyat.is-yaz', 'sevkiyat.tanim-yaz'])).toEqual([]);
  });
});
