import { describe, expect, it } from 'vitest';
import { ROL_GORUNUMLERI } from '#paylasilan/rol-gorunumleri.ts';
import type { IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import {
  anaSayfaKaynaklari, anaSayfaKartlari, bolumlereAyir, gorunenKaynaklar, gorunenKartlar, islerSirala, kaynaklariTopla, kartlariTopla, rolKartlari,
  type AnaSayfaKaynagi, type AnaSayfaKarti,
} from './ana-sayfa.ts';

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

describe('rolKartlari', () => {
  it('rol listesi verilince yalnız listedeki kartlar kalır; null süzmez', () => {
    const liste = [kart('a'), kart('b')];
    expect(rolKartlari(liste, new Set(['b'])).map((k) => k.anahtar)).toEqual(['b']);
    expect(rolKartlari(liste, null)).toBe(liste);
  });

  it('rol listelerindeki her kart anahtarı modüllerin bildirdiği bir karttır: adı değişen kart sessizce kaybolmasın', () => {
    const var_ = new Set([...anaSayfaKartlari, ...anaSayfaKaynaklari].map((k) => k.anahtar));
    const eksik = Object.entries(ROL_GORUNUMLERI).flatMap(([rol, g]) => g.kartlar.filter((a) => !var_.has(a)).map((a) => `${rol}: ${a}`));
    expect(eksik).toEqual([]);
  });
});

const kaynak = (anahtar: string, ek: Partial<AnaSayfaKaynagi> = {}): AnaSayfaKaynagi =>
  ({ anahtar, tur: 'is', baslik: 'Plan', simge: 'list', sira: 100, kaynak: Ekran, ...ek });
const kaynakDosyasi = (ad: string, ...kaynaklar: AnaSayfaKaynagi[]) => ({ [`../../moduller/${ad}/ana-sayfa.tsx`]: { anaSayfaKartlari: [], anaSayfaKaynaklari: kaynaklar } });

describe('kaynaklariTopla', () => {
  it('kaynak dizisi isteğe bağlıdır; verilenleri toplar', () => {
    expect(kaynaklariTopla(dosya(kart('a-kart')))).toEqual([]);
    expect(kaynaklariTopla({ ...kaynakDosyasi('a', kaynak('a-is')), ...kaynakDosyasi('b', kaynak('b-olcu', { tur: 'gidisat' })) }).map((k) => k.anahtar))
      .toEqual(['a-is', 'b-olcu']);
  });

  it('reddedilen: kartla ya da başka kaynakla aynı anahtar, tanımsız tür, kayıtsız işlem, dizi olmayan liste', () => {
    expect(() => kaynaklariTopla(kaynakDosyasi('a', kaynak('ortak')), [kart('ortak')])).toThrow(/ortak \(kart, .*moduller\/a/);
    expect(() => kaynaklariTopla({ ...kaynakDosyasi('a', kaynak('x')), ...kaynakDosyasi('b', kaynak('x')) })).toThrow(/x .*moduller\/a.*moduller\/b/);
    expect(() => kaynaklariTopla(kaynakDosyasi('a', kaynak('x', { tur: 'grafik' as 'is' })))).toThrow(/türü tanımsız: grafik/);
    expect(() => kaynaklariTopla(kaynakDosyasi('a', kaynak('x', { islem: 'boyle.islem-yok' as never })))).toThrow(/kayıtlı değil/);
    expect(() => kaynaklariTopla(kaynakDosyasi('a', kaynak('X')))).toThrow(/biçime uymuyor/);
    expect(() => kaynaklariTopla({ '../../moduller/a/ana-sayfa.tsx': { anaSayfaKaynaklari: {} } })).toThrow(/dizi değil/);
  });
});

describe('gorunenKaynaklar', () => {
  it('işlemi olana gösterir, sıraya göre dizer; işlemi olmayana göstermez', () => {
    const k = [kaynak('b', { sira: 20 }), kaynak('a', { sira: 10, islem: 'satin-alma.talep-ac' })];
    expect(gorunenKaynaklar(k, ['satin-alma.talep-ac']).map((x) => x.anahtar)).toEqual(['a', 'b']);
    expect(gorunenKaynaklar(k, []).map((x) => x.anahtar)).toEqual(['b']);
  });
});

describe('islerSirala', () => {
  const kalem = (anahtar: string, aciliyet: IsKalemi['aciliyet'], sonTarih: string | null = null): IsKalemi =>
    ({ anahtar, baslik: anahtar, ayrinti: null, aciliyet, sonTarih, yol: '/x', eylem: 'Aç', neden: null });

  it('aciliyet önce; eşitte erken son tarih, tarihsiz sonda; sonra kaynak sırası', () => {
    const plan = kaynak('plan', { sira: 10 });
    const stok = kaynak('stok', { sira: 5 });
    const sirali = islerSirala([
      { kalem: kalem('hafta', 'hafta'), kaynak: stok },
      { kalem: kalem('bugun-tarihsiz', 'bugun'), kaynak: stok },
      { kalem: kalem('bugun-gec', 'bugun', '2026-11-02T15:00:00Z'), kaynak: plan },
      { kalem: kalem('bugun-erken', 'bugun', '2026-11-02T09:00:00Z'), kaynak: plan },
      { kalem: kalem('gecikmis', 'gecikmis'), kaynak: plan },
      { kalem: kalem('bekliyor-plan', 'bekliyor'), kaynak: plan },
      { kalem: kalem('bekliyor-stok', 'bekliyor'), kaynak: stok },
    ]);
    expect(sirali.map((s) => s.kalem.anahtar)).toEqual(['gecikmis', 'bekliyor-stok', 'bekliyor-plan', 'bugun-erken', 'bugun-gec', 'bugun-tarihsiz', 'hafta']);
  });
});
