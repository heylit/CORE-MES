import { describe, expect, it } from 'vitest';
import { ONIZLEME_ADRESI_DEGISKENI, onizlemeAdresi } from './dinleme.ts';

describe('önizleme dinleme adresi', () => {
  it('değişken yoksa ya da boşsa yalnız bu makine kalır', () => {
    expect(onizlemeAdresi({})).toBeNull();
    expect(onizlemeAdresi({ [ONIZLEME_ADRESI_DEGISKENI]: '  ' })).toBeNull();
  });

  it('IP adresi verilirse o adreste dinlenir', () => {
    expect(onizlemeAdresi({ [ONIZLEME_ADRESI_DEGISKENI]: '0.0.0.0' })).toBe('0.0.0.0');
    expect(onizlemeAdresi({ [ONIZLEME_ADRESI_DEGISKENI]: ' 10.0.9.88 ' })).toBe('10.0.9.88');
    expect(onizlemeAdresi({ [ONIZLEME_ADRESI_DEGISKENI]: '::' })).toBe('::');
  });

  it('IP olmayan değer açılışı durdurur', () => {
    expect(() => onizlemeAdresi({ [ONIZLEME_ADRESI_DEGISKENI]: 'evet' })).toThrow(`${ONIZLEME_ADRESI_DEGISKENI} bir IP adresi olmalı`);
  });

  it('canlıda varsayılan yalnız bu makinedir; HTTPS ya da vekil adresi olmadan ağa açan değer açılışı durdurur', () => {
    expect(onizlemeAdresi({ TMIV2_ORTAM: 'canli' })).toBe('127.0.0.1');
    expect(onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '::1' })).toBe('::1');
    for (const ag of ['0.0.0.0', '10.0.9.88', '::']) {
      expect(() => onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: ag })).toThrow('HTTPS verilmeli');
    }
  });

  it('canlıda vekil başka bilgisayardaysa önizleme verilen adreste dinler', () => {
    expect(onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '10.0.9.88', TMIV2_VEKIL_ADRESI: '10.0.9.5' })).toBe('10.0.9.88');
    expect(() => onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '10.0.9.88', TMIV2_VEKIL_ADRESI: 'vekil' }))
      .toThrow('HTTPS verilmeli');
  });

  it('canlıda HTTPS kapının kendisindeyse önizleme ağa açılır; sertifika ya da anahtar tek başına yetmez', () => {
    const tls = { TMIV2_HTTPS_SERTIFIKA: '/s/tmi.crt', TMIV2_HTTPS_ANAHTAR: '/s/tmi.key' };
    expect(onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '0.0.0.0', ...tls })).toBe('0.0.0.0');
    expect(onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '10.0.9.88', ...tls })).toBe('10.0.9.88');
    expect(() => onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '0.0.0.0', TMIV2_HTTPS_SERTIFIKA: '/s/tmi.crt' }))
      .toThrow('HTTPS verilmeli');
    expect(() => onizlemeAdresi({ TMIV2_ORTAM: 'canli', [ONIZLEME_ADRESI_DEGISKENI]: '0.0.0.0', TMIV2_HTTPS_SERTIFIKA: ' ', TMIV2_HTTPS_ANAHTAR: '/s/tmi.key' }))
      .toThrow('HTTPS verilmeli');
  });
});
