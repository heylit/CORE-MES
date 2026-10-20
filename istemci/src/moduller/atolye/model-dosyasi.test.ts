import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MODEL_PARCA_BAYT } from '#paylasilan/atolye-sabitleri.ts';
import { base64Oku, base64Yaz, dosyaAdindanAd, dosyaBicimi, parcala, sha256Yazilim, varsayilanAyar } from './model-dosyasi.ts';

describe('model dosyası yardımcıları', () => {
  it('SHA-256 yazılım sürümü bilinen değerleri ve Node kriptosunu tutar (http kurulumda tarayıcı kriptosu yoktur)', () => {
    expect(sha256Yazilim(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Yazilim(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const boy of [55, 56, 63, 64, 65, 1000, 70000]) {
      const veri = new Uint8Array(boy).map((_, i) => (i * 31 + 7) & 255);
      expect(sha256Yazilim(veri)).toBe(createHash('sha256').update(veri).digest('hex'));
    }
  });

  it('base64 Node ile aynı yazar ve geri okur; dosya 512 KiB parçalara bölünür, son parça kalan kadardır', () => {
    for (const boy of [0, 1, 2, 3, 4, 1000]) {
      const veri = new Uint8Array(boy).map((_, i) => (i * 13) & 255);
      const metin = base64Yaz(veri);
      expect(metin).toBe(Buffer.from(veri).toString('base64'));
      expect([...base64Oku(metin)]).toEqual([...veri]);
    }
    const parcalar = parcala(new Uint8Array(MODEL_PARCA_BAYT * 2 + 10));
    expect(parcalar.map((p) => p.length)).toEqual([MODEL_PARCA_BAYT, MODEL_PARCA_BAYT, 10]);
  });

  it('dosya biçimi uzantıdan; CAD milimetre ve Z yukarı, GLB metre ve Y yukarı varsayılır', () => {
    expect(dosyaBicimi('Tezgah.STP')).toBe('step');
    expect(dosyaBicimi('a.step')).toBe('step');
    expect(dosyaBicimi('a.stl')).toBe('stl');
    expect(dosyaBicimi('a.obj')).toBeNull();
    expect(varsayilanAyar('step')).toEqual({ birim: 'mm', yukari: 'z' });
    expect(varsayilanAyar('glb')).toEqual({ birim: 'm', yukari: 'y' });
    expect(dosyaAdindanAd('dik_isleme_merkezi.stp')).toBe('dik isleme merkezi');
  });
});
