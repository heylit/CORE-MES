import { describe, expect, it } from 'vitest';
import { bolumlereAyir, gorunenKartlar, kartlariTopla, type AnaSayfaKarti } from './ana-sayfa.ts';

const Ekran = () => null;
const kart = (anahtar: string, ek: Partial<AnaSayfaKarti> = {}): AnaSayfaKarti => ({ anahtar, sira: 100, ekran: Ekran, ...ek });
const dosya = (...kartlar: AnaSayfaKarti[]) => ({ '../../moduller/a/ana-sayfa.tsx': { anaSayfaKartlari: kartlar } });

describe('kartlariTopla', () => {
  it('modullerin kartlarini toplar; ayni anahtar iki dosyada gelirse iki dosyayi soyleyerek reddeder', () => {
    const b = { '../../moduller/b/ana-sayfa.tsx': { anaSayfaKartlari: [kart('b-kart')] } };
    expect(kartlariTopla({ ...dosya(kart('a-kart')), ...b }).map((k) => k.anahtar)).toEqual(['a-kart', 'b-kart']);
    const ayni = { '../../moduller/b/ana-sayfa.tsx': { anaSayfaKartlari: [kart('a-kart')] } };
    expect(() => kartlariTopla({ ...dosya(kart('a-kart')), ...ayni })).toThrow(/a-kart .*moduller\/a\/ana-sayfa\.tsx.*moduller\/b\/ana-sayfa\.tsx/);
  });

  it('kayitli islemi ve dolu veya listesini kabul eder; kayitsiz islemi, bos ya da islemsiz veya listesini reddeder', () => {
    expect(kartlariTopla(dosya(kart('k', { islem: 'satin-alma.talep-ac', veya: ['saglik.ayrinti-oku'] })))).toHaveLength(1);
    const yanlis = (ek: object) => () => kartlariTopla(dosya(kart('k', ek as Partial<AnaSayfaKarti>)));
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ islem: 'satin-alma.talep-ac', veya: ['boyle.islem-yok'] })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ islem: 'satin-alma.talep-ac', veya: [] })).toThrow(/"veya"/);
    expect(yanlis({ veya: ['satin-alma.talep-ac'] })).toThrow(/"veya"/);
  });

  it('bicime uymayan anahtari, sayi olmayan sirayi ve dizi vermeyen dosyayi reddeder', () => {
    for (const anahtar of ['Kart', 'a_b', '', '-a', 'a-']) {
      expect(() => kartlariTopla(dosya(kart(anahtar))), anahtar).toThrow(/biçime uymuyor/);
    }
    expect(() => kartlariTopla(dosya(kart('k', { sira: Number.NaN })))).toThrow(/sırası/);
    expect(() => kartlariTopla({ '../../moduller/a/ana-sayfa.tsx': { kartlar: [] } })).toThrow(/moduller\/a\/ana-sayfa\.tsx/);
  });

  it('bilinen bolumu kabul eder; tanimsiz bolumu karti ve dosyayi soyleyerek reddeder', () => {
    expect(kartlariTopla(dosya(kart('k', { bolum: 'uyari' })))).toHaveLength(1);
    const yanlis = { bolum: 'panel' } as unknown as Partial<AnaSayfaKarti>;
    expect(() => kartlariTopla(dosya(kart('k', yanlis)))).toThrow(/bölümü tanımsız: panel \(k, .*moduller\/a\/ana-sayfa\.tsx\)/);
  });
});

describe('gorunenKartlar', () => {
  const kartlar = [
    kart('sistem', { sira: 900 }),
    kart('talep', { sira: 100, islem: 'satin-alma.talep-ac' }),
    kart('ikili', { sira: 500, islem: 'saglik.ayrinti-oku', veya: ['satin-alma.talep-ac'] }),
    kart('esit-b', { sira: 900 }),
  ];

  it('islemsiz karti herkese, islemli karti islemi ya da veya listesinden biri olana gosterir; siraya, esitte anahtara gore dizer', () => {
    expect(gorunenKartlar(kartlar, []).map((k) => k.anahtar)).toEqual(['esit-b', 'sistem']);
    expect(gorunenKartlar(kartlar, ['satin-alma.talep-ac']).map((k) => k.anahtar)).toEqual(['talep', 'ikili', 'esit-b', 'sistem']);
    expect(gorunenKartlar(kartlar, ['saglik.ayrinti-oku']).map((k) => k.anahtar)).toEqual(['ikili', 'esit-b', 'sistem']);
  });

  it('sirket ozeti karti bolum islemi ve kendi islemi birlikte olana gorunur; biri eksikse gorunmez (73 b)', () => {
    const ozet = [kart('ozet-kart', { bolum: 'yonetim', islem: 'satin-alma.talep-ac' }), kart('is-kart', { bolum: 'is', islem: 'satin-alma.talep-ac' })];
    expect(gorunenKartlar(ozet, ['satin-alma.talep-ac']).map((k) => k.anahtar)).toEqual(['is-kart']);
    expect(gorunenKartlar(ozet, ['pano.sirket-ozeti']).map((k) => k.anahtar)).toEqual([]);
    expect(gorunenKartlar(ozet, ['pano.sirket-ozeti', 'satin-alma.talep-ac']).map((k) => k.anahtar)).toEqual(['is-kart', 'ozet-kart']);
    expect(gorunenKartlar([kart('islemsiz', { bolum: 'yonetim' })], []).map((k) => k.anahtar)).toEqual([]);
  });
});

describe('bolumlereAyir', () => {
  const anahtarlar = (k: readonly AnaSayfaKarti[]) => bolumlereAyir(k).map((g) => [g.bolum?.anahtar ?? null, g.kartlar.map((x) => x.anahtar)]);

  it('bolumleri yonetim, is, uyari, ozet sirasiyla verir; bolumsuz kartlar en sonda, bolum icinde gelen sira korunur', () => {
    const kartlar = [kart('genel'), kart('ozet-1', { bolum: 'ozet' }), kart('is-1', { bolum: 'is' }), kart('uyari-1', { bolum: 'uyari' }), kart('is-2', { bolum: 'is' }), kart('yonetim-1', { bolum: 'yonetim' })];
    expect(anahtarlar(kartlar)).toEqual([['yonetim', ['yonetim-1']], ['is', ['is-1', 'is-2']], ['uyari', ['uyari-1']], ['ozet', ['ozet-1']], [null, ['genel']]]);
  });

  it('reddedilen: karti olmayan bolum verilmez; hic kart yoksa grup yoktur', () => {
    expect(anahtarlar([kart('u', { bolum: 'uyari' }), kart('genel')])).toEqual([['uyari', ['u']], [null, ['genel']]]);
    expect(bolumlereAyir([])).toEqual([]);
  });
});
