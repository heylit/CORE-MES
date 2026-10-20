import { describe, expect, it } from 'vitest';
import { gorunenUstEylemler, ustEylemleriTopla, type UstEylem } from './ust-eylemler.ts';

const Dugme = () => null;
const eylem = (anahtar: string, ek: Partial<UstEylem> = {}): UstEylem => ({ anahtar, sira: 100, islem: 'stok.istek', dugme: Dugme, ...ek });
const dosya = (...eylemler: UstEylem[]) => ({ '../../moduller/a/ust-eylem.tsx': { ustEylemler: eylemler } });
const yanlis = (ek: object) => () => ustEylemleriTopla(dosya(eylem('e', ek as Partial<UstEylem>)));

describe('ustEylemleriTopla', () => {
  it('modullerin dugmelerini toplar; ayni anahtar iki dosyada gelirse iki dosyayi soyleyerek reddeder', () => {
    const b = { '../../moduller/b/ust-eylem.tsx': { ustEylemler: [eylem('b')] } };
    expect(ustEylemleriTopla({ ...dosya(eylem('a')), ...b }).map((e) => e.anahtar)).toEqual(['a', 'b']);
    const ayni = { '../../moduller/b/ust-eylem.tsx': { ustEylemler: [eylem('a')] } };
    expect(() => ustEylemleriTopla({ ...dosya(eylem('a')), ...ayni })).toThrow(/a .*moduller\/a\/ust-eylem\.tsx.*moduller\/b\/ust-eylem\.tsx/);
  });

  it('bicimsiz anahtari, sayi olmayan sirayi, kayitsiz islemi, bilesensiz dugmeyi ve dizi vermeyen dosyayi reddeder', () => {
    expect(yanlis({ anahtar: 'A_b' })).toThrow(/biçime uymuyor/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ dugme: undefined })).toThrow(/bileşeni yok/);
    expect(yanlis({ yer: 'ust' })).toThrow(/yeri bilinmiyor: ust/);
    expect(ustEylemleriTopla(dosya(eylem('e', { yer: 'sol' })))[0]?.yer).toBe('sol');
    expect(yanlis({ hesapMaddesi: { baslik: '', simge: 'cpu' } })).toThrow(/Hesap menüsü maddesi/);
    expect(yanlis({ hesapMaddesi: { baslik: 'Durum', simge: 'boyle-simge-yok' } })).toThrow(/Hesap menüsü maddesi/);
    expect(() => ustEylemleriTopla({ '../../moduller/a/ust-eylem.tsx': {} })).toThrow(/moduller\/a\/ust-eylem\.tsx/);
  });
});

describe('gorunenUstEylemler', () => {
  it('yalniz islemi olana gosterir, siraya gore dizer', () => {
    const liste = [eylem('b', { sira: 2 }), eylem('a', { sira: 1 }), eylem('c', { islem: 'stok.transfer' })];
    expect(gorunenUstEylemler(liste, ['stok.istek']).map((e) => e.anahtar)).toEqual(['a', 'b']);
    expect(gorunenUstEylemler(liste, [])).toEqual([]);
  });
});
