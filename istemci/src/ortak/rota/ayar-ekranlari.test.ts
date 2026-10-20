import { describe, expect, it } from 'vitest';
import { ayarEkranlariniTopla, gorunenAyarEkranlari, type AyarEkrani } from './ayar-ekranlari.ts';

const Ekran = () => null;
const ekran = (anahtar: string, ek: Partial<AyarEkrani> = {}): AyarEkrani =>
  ({ anahtar, baslik: 'Deneme', sira: 100, islem: 'stok.tanim', ekran: Ekran, ...ek });
const dosya = (...ekranlar: AyarEkrani[]) => ({ '../../moduller/a/ayar-ekranlari.tsx': { ayarEkranlari: ekranlar } });
const yanlis = (ek: object) => () => ayarEkranlariniTopla(dosya(ekran('e', ek as Partial<AyarEkrani>)));

describe('ayarEkranlariniTopla', () => {
  it('modullerin ekranlarini toplar; ayni anahtar iki dosyada gelirse iki dosyayi soyleyerek reddeder', () => {
    const b = { '../../moduller/b/ayar-ekranlari.tsx': { ayarEkranlari: [ekran('b-ayar')] } };
    expect(ayarEkranlariniTopla({ ...dosya(ekran('a-ayar')), ...b }).map((e) => e.anahtar)).toEqual(['a-ayar', 'b-ayar']);
    const ayni = { '../../moduller/b/ayar-ekranlari.tsx': { ayarEkranlari: [ekran('a-ayar')] } };
    expect(() => ayarEkranlariniTopla({ ...dosya(ekran('a-ayar')), ...ayni }))
      .toThrow(/a-ayar .*moduller\/a\/ayar-ekranlari\.tsx.*moduller\/b\/ayar-ekranlari\.tsx/);
  });

  it('kayitli islemi, dolu veya listesini, bilinen simgeyi ve baglanti bolumunu kabul eder; kayitsiz islemi, bos veya listesini, bilinmeyen simgeyi ve bolumu reddeder', () => {
    expect(ayarEkranlariniTopla(dosya(ekran('e', { veya: ['satin-alma.ayar'], simge: 'gear' })))).toHaveLength(1);
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ islem: undefined })).toThrow(/kayıtlı değil/);
    expect(yanlis({ veya: ['boyle.islem-yok'] })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ veya: [] })).toThrow(/"veya"/);
    expect(yanlis({ simge: 'boyle-simge-yok' })).toThrow(/simgesi .*boyle-simge-yok/);
    expect(ayarEkranlariniTopla(dosya(ekran('e', { bolum: 'baglanti' })))).toHaveLength(1);
    expect(yanlis({ bolum: 'moduller' })).toThrow(/bölümü tanınmıyor: moduller/);
  });

  it('bicime uymayan anahtari, bos basligi, sayi olmayan sirayi, bilesensiz ekrani ve dizi vermeyen dosyayi dosyayi soyleyerek reddeder', () => {
    for (const anahtar of ['Ayar', 'a_b', '', '-a', 'a-']) {
      expect(() => ayarEkranlariniTopla(dosya(ekran(anahtar))), anahtar).toThrow(/biçime uymuyor/);
    }
    expect(yanlis({ baslik: ' ' })).toThrow(/başlığı boş/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ ekran: undefined })).toThrow(/bileşeni yok: e \(.*moduller\/a\/ayar-ekranlari\.tsx\)/);
    expect(() => ayarEkranlariniTopla({ '../../moduller/a/ayar-ekranlari.tsx': { ekranlar: [] } })).toThrow(/moduller\/a\/ayar-ekranlari\.tsx/);
  });
});

describe('gorunenAyarEkranlari', () => {
  const ekranlar = [
    ekran('stok', { sira: 50, islem: 'stok.tanim' }),
    ekran('satin-alma', { sira: 10, islem: 'satin-alma.ayar' }),
    ekran('ikili', { sira: 50, islem: 'finans.yonet', veya: ['stok.tanim'] }),
  ];

  it('ekrani islemi ya da veya listesinden biri olana gosterir; siraya, esitte anahtara gore dizer', () => {
    expect(gorunenAyarEkranlari(ekranlar, [])).toEqual([]);
    expect(gorunenAyarEkranlari(ekranlar, ['stok.tanim']).map((e) => e.anahtar)).toEqual(['ikili', 'stok']);
    expect(gorunenAyarEkranlari(ekranlar, ['satin-alma.ayar', 'finans.yonet']).map((e) => e.anahtar)).toEqual(['satin-alma', 'ikili']);
  });
});
