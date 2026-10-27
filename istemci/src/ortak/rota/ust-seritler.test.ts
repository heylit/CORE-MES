import { describe, expect, it } from 'vitest';
import { gorunenUstSeritler, ustSeritler, ustSeritleriTopla, type UstSerit } from './ust-seritler.ts';

const Serit = () => null;
const serit = (anahtar: string, ek: Partial<UstSerit> = {}): UstSerit => ({ anahtar, sira: 10, islem: 'oturum', serit: Serit, ...ek });
const dosya = (...seritler: UstSerit[]) => ({ '../../moduller/a/ust-serit.tsx': { ustSeritler: seritler } });
const yanlis = (ek: object) => () => ustSeritleriTopla(dosya(serit('s', ek as Partial<UstSerit>)));

describe('ustSeritleriTopla', () => {
  it('modüllerin şeritlerini toplar; aynı anahtar iki dosyada gelirse iki dosyayı söyleyerek reddeder', () => {
    const b = { '../../moduller/b/ust-serit.tsx': { ustSeritler: [serit('b')] } };
    expect(ustSeritleriTopla({ ...dosya(serit('a')), ...b }).map((s) => s.anahtar)).toEqual(['a', 'b']);
    const ayni = { '../../moduller/b/ust-serit.tsx': { ustSeritler: [serit('a')] } };
    expect(() => ustSeritleriTopla({ ...dosya(serit('a')), ...ayni })).toThrow(/a .*moduller\/a\/ust-serit\.tsx.*moduller\/b\/ust-serit\.tsx/);
  });

  it('biçimsiz anahtarı, sayı olmayan sırayı, kayıtsız işlemi, bileşensiz şeridi ve dizi vermeyen dosyayı reddeder', () => {
    expect(yanlis({ anahtar: 'A_b' })).toThrow(/biçime uymuyor/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ serit: undefined })).toThrow(/bileşeni yok/);
    expect(() => ustSeritleriTopla({ '../../moduller/a/ust-serit.tsx': {} })).toThrow(/moduller\/a\/ust-serit\.tsx/);
  });
});

describe('gorunenUstSeritler', () => {
  it('oturum şeridi işlemsiz kişiye de görünür; işlemli şerit yalnız işlemi olana; sıra küçükten büyüğe', () => {
    const liste = [serit('b', { sira: 20 }), serit('a', { sira: 20 }), serit('ilk', { sira: 1, islem: 'finans.oku' })];
    expect(gorunenUstSeritler(liste, []).map((s) => s.anahtar)).toEqual(['a', 'b']);
    expect(gorunenUstSeritler(liste, ['finans.oku']).map((s) => s.anahtar)).toEqual(['ilk', 'a', 'b']);
  });

  it('952 a: uygulamanın topladığı kur ve faiz şeridi finans işlemi olmayan kişiye de görünür', () => {
    expect(gorunenUstSeritler(ustSeritler, []).map((s) => s.anahtar)).toEqual(['kur-faiz']);
  });
});
