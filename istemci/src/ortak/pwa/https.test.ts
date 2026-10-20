import { createSecureContext } from 'node:tls';
import { describe, expect, it, vi } from 'vitest';
import { ANAHTAR_DEGISKENI, SERTIFIKA_DEGISKENI, httpsAyari } from './https.ts';
import type { DosyaIslemleri } from './https.ts';

const SERTIFIKA = '/kurulum/tmi.crt';
const ANAHTAR = '/kurulum/tmi.key';
const ikisi = { [SERTIFIKA_DEGISKENI]: SERTIFIKA, [ANAHTAR_DEGISKENI]: ANAHTAR };

// Diskteki dosyalar taklit edilir; dogrula verilmezse Node'un gerçek TLS denetimi koşar.
function dosyalar(icerik: Record<string, string>, ek: Partial<DosyaIslemleri> = {}): DosyaIslemleri {
  return {
    varMi: (yol) => yol in icerik,
    okunurMu: () => true,
    oku: (yol) => Buffer.from(icerik[yol] ?? ''),
    dogrula: () => undefined,
    ...ek,
  };
}

describe('HTTPS ayarı', () => {
  it('iki değişken de yoksa düz HTTP sürer, dosyaya bakılmaz', () => {
    const oku = vi.fn();
    expect(httpsAyari({}, dosyalar({}, { oku }))).toBeNull();
    expect(httpsAyari({ [SERTIFIKA_DEGISKENI]: ' ', [ANAHTAR_DEGISKENI]: '' }, dosyalar({}, { oku }))).toBeNull();
    expect(oku).not.toHaveBeenCalled();
  });

  it('ikisi verilmiş ve dosyalar kullanılabiliyorsa sertifika ve anahtarı döner', () => {
    const ayar = httpsAyari(ikisi, dosyalar({ [SERTIFIKA]: 'SERT', [ANAHTAR]: 'ANAH' }));
    expect(ayar?.cert.toString()).toBe('SERT');
    expect(ayar?.key.toString()).toBe('ANAH');
  });

  it('yalnız biri verilmişse eksik olanı adıyla söyleyip durur', () => {
    expect(() => httpsAyari({ [SERTIFIKA_DEGISKENI]: SERTIFIKA }, dosyalar({}))).toThrow(`${ANAHTAR_DEGISKENI} eksik`);
    expect(() => httpsAyari({ [ANAHTAR_DEGISKENI]: ANAHTAR }, dosyalar({}))).toThrow(`${SERTIFIKA_DEGISKENI} eksik`);
  });

  it('göreli yol, bulunmayan ya da okunamayan dosya açılışı durdurur', () => {
    expect(() => httpsAyari({ ...ikisi, [SERTIFIKA_DEGISKENI]: 'tmi.crt' }, dosyalar({}))).toThrow('mutlak yol olmalı');
    expect(() => httpsAyari(ikisi, dosyalar({ [SERTIFIKA]: 'S' }))).toThrow(`${ANAHTAR_DEGISKENI} dosyası bulunamadı: ${ANAHTAR}`);
    expect(() => httpsAyari(ikisi, dosyalar({ [SERTIFIKA]: 'S', [ANAHTAR]: 'A' }, { okunurMu: (y) => y !== SERTIFIKA })))
      .toThrow(`${SERTIFIKA_DEGISKENI} dosyası okunamıyor`);
  });

  it('PEM olmayan ya da birbirine ait olmayan dosyalar TLS denetiminde reddedilir', () => {
    const tlsIle = dosyalar({ [SERTIFIKA]: 'sertifika degil', [ANAHTAR]: 'anahtar degil' }, { dogrula: (a) => { createSecureContext(a); } });
    expect(() => httpsAyari(ikisi, tlsIle)).toThrow('HTTPS sertifikası ya da anahtarı kullanılamadı');
  });
});
