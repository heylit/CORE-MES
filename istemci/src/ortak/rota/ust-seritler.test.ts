import { describe, expect, it } from 'vitest';
import { gorunenUstSeritler, rolSeritleri, ustSeritler, ustSeritleriTopla, type UstSerit } from './ust-seritler.ts';

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

describe('rolSeritleri', () => {
  it('kur ve faiz şeridi yalnız finans, satın alma, müdür ve yöneticide (1394 a); rolsüz şerit herkeste', () => {
    const liste = [serit('kur-faiz'), serit('baska')];
    const anahtarlar = (roller?: string[]) => rolSeritleri(liste, roller).map((s) => s.anahtar);
    for (const rol of ['muhasebe_finans', 'satin_alma', 'mudur', 'yonetici']) expect(anahtarlar([rol])).toEqual(['kur-faiz', 'baska']);
    for (const rol of ['operator', 'kalite', 'depo', 'ozel_rol']) expect(anahtarlar([rol])).toEqual(['baska']);
    expect(anahtarlar(['operator', 'satin_alma'])).toEqual(['kur-faiz', 'baska']);
    expect(anahtarlar(undefined)).toEqual(['baska']);
  });

  it('modüllerin bildirdiği kur ve faiz şeridi rol listesindeki anahtarla aynıdır', () => {
    expect(ustSeritler.map((s) => s.anahtar)).toContain('kur-faiz');
  });
});
