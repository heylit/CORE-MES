import { describe, expect, it } from 'vitest';
import { gorunenKomutlar, komutAra, komutlar, komutlariTopla, type Komut } from './komutlar.ts';

const SAYFALAR = [
  { yol: '/stok', grup: 'Stok', islem: 'sayfa.stok' },
  { yol: '/uretim-emirleri', grup: 'Üretim', islem: 'sayfa.uretim-emirleri' },
];
const MENULER = [{ gruplar: [{ maddeler: [
  { yol: '/stok/mal-kabul', islem: 'stok.giris' },
  { yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'] },
] }] }];
const komut = (anahtar: string, ek: Partial<Komut> = {}): Komut => ({
  anahtar, sira: 10, baslik: 'Mal kabul yap', aciklama: 'Gelen malzemeyi stoğa alın.', simge: 'truck', yol: '/stok/mal-kabul', islem: 'stok.giris', ...ek,
});
const dosya = (...liste: Komut[]) => ({ '../../moduller/a/komutlar.ts': { komutlar: liste } });
const topla = (d: Record<string, unknown>) => komutlariTopla(d, SAYFALAR, MENULER);
const yanlis = (ek: object) => () => topla(dosya(komut('e', ek as Partial<Komut>)));

describe('komutlariTopla', () => {
  it('modüllerin komutlarını toplar; sorgulu yolu kabul eder; aynı anahtar iki dosyada gelirse iki dosyayı söyler', () => {
    const b = { '../../moduller/b/komutlar.ts': { komutlar: [komut('b', { yol: '/stok/hazirlik?yeni=1' })] } };
    expect(topla({ ...dosya(komut('a')), ...b }).map((x) => x.anahtar)).toEqual(['a', 'b']);
    const ayni = { '../../moduller/b/komutlar.ts': { komutlar: [komut('a')] } };
    expect(() => topla({ ...dosya(komut('a')), ...ayni })).toThrow(/a .*moduller\/a\/komutlar\.ts.*moduller\/b\/komutlar\.ts/);
  });

  it('biçimsiz anahtarı, kayıtsız işlemi, sette olmayan simgeyi, boş başlığı ve sözcüğü, kırık ve uygulama dışı yolu reddeder', () => {
    expect(yanlis({ anahtar: 'A_b' })).toThrow(/biçime uymuyor/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ veya: ['boyle.islem-yok'] })).toThrow(/kayıtlı değil/);
    expect(yanlis({ simge: 'yok-boyle' })).toThrow(/simgesi/);
    expect(yanlis({ baslik: ' ' })).toThrow(/boş/);
    expect(yanlis({ sozcukler: [' '] })).toThrow(/sözcüğü/);
    expect(yanlis({ yol: '/stok/boyle-ekran-yok' })).toThrow(/sayfa ya da menü maddesi değil/);
    expect(yanlis({ yol: '//dis.test/stok' })).toThrow(/sayfa ya da menü maddesi değil/);
    expect(() => topla({ '../../moduller/a/komutlar.ts': {} })).toThrow(/moduller\/a\/komutlar\.ts/);
  });

  it('depodaki modül komutlarının hepsi geçerli (bildiren modül yoksa liste boştur)', () => {
    expect(Array.isArray(komutlar)).toBe(true);
  });
});

describe('gorunenKomutlar', () => {
  const liste = [
    komut('mal-kabul'),
    komut('hazirlik', { yol: '/stok/hazirlik?yeni=1', islem: 'stok.transfer', veya: ['stok.toplama'] }),
    komut('emir', { yol: '/uretim-emirleri', islem: 'sayfa.uretim-emirleri' }),
  ];
  const gor = (islemler: string[], sayfalar = SAYFALAR) => gorunenKomutlar(liste, { sayfalar, menuler: MENULER, islemler }).map((k) => k.anahtar);

  it('izinli: işlemi ve sayfası (menü maddesiyse maddesi) açık komut görünür; veya işlemi yeter', () => {
    expect(gor(['stok.giris', 'stok.transfer', 'sayfa.uretim-emirleri'])).toEqual(['mal-kabul', 'hazirlik', 'emir']);
    expect(gor(['stok.toplama'])).toEqual(['hazirlik']);
  });

  it('reddedilen: işlemi yoksa, sayfası görünmüyorsa ya da maddesi kapalıysa komut görünmez', () => {
    expect(gor([])).toEqual([]);
    expect(gor(['stok.giris'], [SAYFALAR[1]!])).toEqual([]);
    expect(gorunenKomutlar([komut('m')], { sayfalar: SAYFALAR, menuler: [], islemler: ['stok.giris'] })).toEqual([]);
  });
});

describe('komutAra', () => {
  const liste = [
    { baslik: 'Yeni satın alma talebi' },
    { baslik: 'Mal kabul yap', sozcukler: ['giriş', 'teslim'] },
    { baslik: 'Kabul edilenleri listele' },
  ];
  it('her sözcük başlıkta ya da sözcüklerde geçmeli; Türkçe harf farkı yok; başta eşleşen önce; boş sorgu boş', () => {
    expect(komutAra(liste, 'kabul').map((k) => k.baslik)).toEqual(['Mal kabul yap', 'Kabul edilenleri listele']);
    expect(komutAra(liste, 'GIRIS').map((k) => k.baslik)).toEqual(['Mal kabul yap']);
    expect(komutAra(liste, 'satin tale').map((k) => k.baslik)).toEqual(['Yeni satın alma talebi']);
    expect(komutAra(liste, 'yok')).toEqual([]);
    expect(komutAra(liste, '  ')).toEqual([]);
  });
});
