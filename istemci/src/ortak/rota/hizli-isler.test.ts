import { describe, expect, it } from 'vitest';
import { gorunenHizliIsler, hizliIsler, hizliIsleriTopla, type HizliIs } from './hizli-isler.ts';

const SAYFALAR = [
  { yol: '/stok', grup: 'Stok', islem: 'sayfa.stok' },
  { yol: '/uretim-emirleri', grup: 'Üretim', islem: 'sayfa.uretim-emirleri' },
];
const MENULER = [{ gruplar: [{ maddeler: [
  { yol: '/stok/mal-kabul', islem: 'stok.giris' },
  { yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'] },
] }] }];
const is = (anahtar: string, ek: Partial<HizliIs> = {}): HizliIs => ({
  anahtar, sira: 10, baslik: 'Olay', aciklama: 'Açıklama', simge: 'box', yol: '/stok/mal-kabul', islem: 'stok.giris', ...ek,
});
const dosya = (...isler: HizliIs[]) => ({ '../../moduller/a/hizli-isler.ts': { hizliIsler: isler } });
const topla = (d: Record<string, unknown>) => hizliIsleriTopla(d, SAYFALAR, MENULER);
const yanlis = (ek: object) => () => topla(dosya(is('e', ek as Partial<HizliIs>)));

describe('hizliIsleriTopla', () => {
  it('modullerin olaylarini toplar; ayni anahtar iki dosyada gelirse iki dosyayi soyleyerek reddeder', () => {
    const b = { '../../moduller/b/hizli-isler.ts': { hizliIsler: [is('b')] } };
    expect(topla({ ...dosya(is('a')), ...b }).map((x) => x.anahtar)).toEqual(['a', 'b']);
    const ayni = { '../../moduller/b/hizli-isler.ts': { hizliIsler: [is('a')] } };
    expect(() => topla({ ...dosya(is('a')), ...ayni })).toThrow(/a .*moduller\/a\/hizli-isler\.ts.*moduller\/b\/hizli-isler\.ts/);
  });

  it('bicimsiz anahtari, kayitsiz islemi, sette olmayan simgeyi, bos basligi ve kirik yolu reddeder', () => {
    expect(yanlis({ anahtar: 'A_b' })).toThrow(/biçime uymuyor/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ islem: 'boyle.islem-yok' })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ veya: ['boyle.islem-yok'] })).toThrow(/kayıtlı değil/);
    expect(yanlis({ simge: 'yok-boyle' })).toThrow(/simgesi/);
    expect(yanlis({ baslik: ' ' })).toThrow(/boş/);
    // Sayfanın altında ama menü maddesi olmayan yol açılmayabilir: kabul edilmez.
    expect(yanlis({ yol: '/stok/boyle-ekran-yok' })).toThrow(/sayfa ya da menü maddesi değil/);
    expect(() => topla({ '../../moduller/a/hizli-isler.ts': {} })).toThrow(/moduller\/a\/hizli-isler\.ts/);
  });

  it('depodaki modul olaylarinin hepsi gecerli bir sayfaya ya da menu maddesine gider', () => {
    expect(hizliIsler.length).toBeGreaterThan(0);
  });
});

describe('gorunenHizliIsler', () => {
  const liste = [
    is('mal-kabul'),
    is('hazirlik', { yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'], sira: 5 }),
    is('emir', { yol: '/uretim-emirleri', islem: 'uretim-emirleri.yaz' }),
  ];

  it('olayi yalniz kendi islemi, sayfasi ve menu maddesi aciksa gosterir; gruplari ana menu sirasiyla verir', () => {
    const tumu = gorunenHizliIsler(liste, { sayfalar: SAYFALAR, menuler: MENULER, islemler: ['stok.giris', 'stok.toplama', 'uretim-emirleri.yaz'] });
    expect(tumu.map((g) => [g.grup, g.isler.map((x) => x.anahtar)])).toEqual([
      ['Üretim', ['emir']],
      ['Stok', ['hazirlik', 'mal-kabul']],
    ]);
  });

  it('islemi olmayana, sayfasini gormeyene ve kapali maddeye olay gostermez', () => {
    expect(gorunenHizliIsler(liste, { sayfalar: SAYFALAR, menuler: MENULER, islemler: [] })).toEqual([]);
    // Sayfa kişiye görünmüyor (ya da kapalı): sayfa listesinde yok.
    expect(gorunenHizliIsler(liste, { sayfalar: [SAYFALAR[1]!], menuler: MENULER, islemler: ['stok.giris'] })).toEqual([]);
    // Madde kapalı ya da maddenin işlemi yok: madde menüden düşmüş.
    const maddesiz = [{ gruplar: [{ maddeler: [{ yol: '/stok/hazirlik', islem: 'stok.transfer' }] }] }];
    expect(gorunenHizliIsler([is('mal-kabul')], { sayfalar: SAYFALAR, menuler: maddesiz, islemler: ['stok.giris'] })).toEqual([]);
    // Olayın işlemi var ama gittiği maddenin işlemi yok.
    const dar = [{ gruplar: [{ maddeler: [{ yol: '/stok/mal-kabul', islem: 'stok.tanim' }] }] }];
    expect(gorunenHizliIsler([is('mal-kabul')], { sayfalar: SAYFALAR, menuler: dar, islemler: ['stok.giris'] })).toEqual([]);
  });
});
