import { describe, expect, it } from 'vitest';
import { kullaniciAdiOner } from './kullanici-adi.ts';

describe('kullaniciAdiOner', () => {
  it('Türkçe harfler dönüşür, küçük harf ve noktalı yazılır', () => {
    expect(kullaniciAdiOner('Ayşe Çağlar Yılmaz')).toBe('ayse.caglar.yilmaz');
    expect(kullaniciAdiOner('İSMAİL ÖZGÜR')).toBe('ismail.ozgur');
    expect(kullaniciAdiOner('  Şükrü   Işık  ')).toBe('sukru.isik');
  });

  it('şapkalı harf ve izin verilmeyen işaretler temizlenir', () => {
    expect(kullaniciAdiOner('Âdem Kâhya-Öz')).toBe('adem.kahya.oz');
  });

  it('sonuç sunucu desenine uyar; kısa kalırsa öneri boştur', () => {
    const uzun = kullaniciAdiOner(`${'a'.repeat(39)} b`);
    expect(uzun).toMatch(/^[a-z0-9._-]{3,40}$/);
    expect(uzun.endsWith('.')).toBe(false);
    expect(kullaniciAdiOner('Al')).toBe('');
    expect(kullaniciAdiOner('--')).toBe('');
  });
});
