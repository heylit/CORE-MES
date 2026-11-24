import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR, ORNEK_KARTLAR } from './ornek-veri.ts';
import { FAMS } from './sabitler/index.ts';
import { metinListesi } from './katalog/liste.ts';
import { autoKod, finalAd, finalStd, kartAnahtari, kartOzeti, kuralBaglami, metinAyristir, newDraft } from './kurallar/index.ts';
import {
  STANDART_AD_SINIRI, TABAN_STANDART_ADLARI, aramaMetinleri, kartStandardi, ayardakiStandartAdlari, esliAdlariCoz, standartAdiYaz, standartAdlari, anaNorm, kaliteAdi, secenekEtiketleri, standartTercihi, standartEtiketi, esdegerSirala, standartTarafi, tarafSirala, standartlaEslesir,
} from './standart-adlari.ts';
import type { KartKaydi, KatalogKarti } from './tipler.ts';
import { ortamKur } from './veri.ts';
import { malzemeYetkisi } from './yetki.ts';

// Adlar sentetiktir: gerçek EN-ASTM listesi kullanıcıdan gelir (2117-2).
const ADLAR = { 'Islah (+QT)': { astm: 'QT-A', en: 'QT-E' }, 'Yalnız ASTM': { astm: 'X1' }, 'Aynı ad': { astm: 'T6', en: 'T6' } };

describe('2117 standart adları', () => {
  test('taban tablo: 17-4PH koşulları EN 10088-3 karşılığıyla, karşılığı olmayan taraf boş; adlar sınırı aşmaz', () => {
    expect(TABAN_STANDART_ADLARI['Çökelme sertleştirilmiş (H900)']).toEqual({ astm: 'H900' });
    expect(TABAN_STANDART_ADLARI['Çökelme sertleştirilmiş (H1025)']).toEqual({ astm: 'H1025', en: '+P1070' });
    expect(TABAN_STANDART_ADLARI['Çökelme sertleştirilmiş (H1150)']).toEqual({ astm: 'H1150', en: '+P930' });
    expect(TABAN_STANDART_ADLARI['T651']).toEqual({ astm: 'T651', en: 'T651' });
    for (const [d, a] of Object.entries(TABAN_STANDART_ADLARI)) {
      expect(a.astm ?? a.en, d).toBeTruthy();
      for (const x of [a.astm, a.en]) if (x !== undefined) expect(x.length, d).toBeLessThanOrEqual(STANDART_AD_SINIRI);
    }
  });

  test('yalnız seçili standardın adı; o taraf boşsa öteki ad, hiç yoksa değerin kendisi', () => {
    expect(standartEtiketi('Islah (+QT)', ADLAR, 'astm')).toBe('QT-A');
    expect(standartEtiketi('Islah (+QT)', ADLAR, 'en')).toBe('QT-E');
    expect(standartEtiketi('Yalnız ASTM', ADLAR, 'en')).toBe('X1');
    expect(standartEtiketi('Aynı ad', ADLAR, 'en')).toBe('T6');
    expect(standartEtiketi('Normalize (+N)', ADLAR, 'astm')).toBe('Normalize (+N)');
  });

  test('arama değerde, ASTM ve EN adında bakar; büyük küçük harf ayrımı yok', () => {
    expect(standartlaEslesir('Islah (+QT)', ADLAR, 'qt-e')).toBe(true);
    expect(standartlaEslesir('Islah (+QT)', ADLAR, 'ıslah')).toBe(true);
    expect(standartlaEslesir('Islah (+QT)', ADLAR, '  ')).toBe(true);
    expect(standartlaEslesir('Normalize (+N)', ADLAR, 'qt-e')).toBe(false);
    expect(aramaMetinleri(['Islah (+QT)', 5, ''], ADLAR)).toEqual(['Islah (+QT)', 'QT-A', 'QT-E']);
  });

  test('ayar: bozuk satır ve boş ad atlanır, 40 karakterden uzun ad kabul edilmez; ayar tabanın üstüne yazar', () => {
    const ayar = { standartAdlari: { a: { astm: ' A1 ', en: '' }, b: 'bozuk', c: { astm: 'x'.repeat(41) }, d: null } };
    expect(ayardakiStandartAdlari(ayar)).toEqual({ a: { astm: 'A1' } });
    expect(ayardakiStandartAdlari({ standartAdlari: [] })).toEqual({});
    expect(standartAdlari(null)).toEqual(TABAN_STANDART_ADLARI);
    expect(standartAdlari({ standartAdlari: { 'Islah (+QT)': { en: 'X' } } })['Islah (+QT)']).toEqual({ en: 'X' });
  });

  test('yazma: yeni nesne döner, iki ad boşsa satır silinir, öteki alanlar korunur', () => {
    const ayar = { surum: 1, listeler: { x: {} } };
    const y = standartAdiYaz(ayar, 'Islah (+QT)', { astm: 'QT-A', en: ' ' });
    expect(y).toEqual({ surum: 1, listeler: { x: {} }, standartAdlari: { 'Islah (+QT)': { astm: 'QT-A' } } });
    expect(ayar).toEqual({ surum: 1, listeler: { x: {} } });
    expect(standartAdiYaz(y, 'Islah (+QT)', {})).toEqual({ surum: 1, listeler: { x: {} }, standartAdlari: {} });
  });

  test('hızlı arama dönüşümü: eşli ad parantezdeki koda çevrilir; belirsiz ve boşluklu ad çevrilmez', () => {
    expect(esliAdlariCoz('C45 cubuk 50 qt-e', ADLAR)).toBe('C45 cubuk 50 +QT');
    expect(esliAdlariCoz('C45 QT-A', ADLAR)).toBe('C45 +QT');
    expect(esliAdlariCoz('C45 x1', ADLAR)).toBe('C45 Yalnız ASTM');
    expect(esliAdlariCoz('C45 T6', ADLAR)).toBe('C45 Aynı ad');
    const belirsiz = { 'Durum A (KA)': { en: 'ORTAK' }, 'Durum B (KB)': { en: 'ORTAK' }, 'Durum C (KC)': { astm: 'iki kelime' } };
    expect(esliAdlariCoz('C45 ortak iki kelime', belirsiz)).toBe('C45 ortak iki kelime');
    expect(esliAdlariCoz('C45 QT-E', {})).toBe('C45 QT-E');
  });
});

describe('2117 taban tablo ve listeler', () => {
  test('bir sınıfın durum listesinde ve bir ailenin işlem listesinde iki değer aynı etiketi almaz (iki standartta da)', () => {
    const cakisan: string[] = [];
    const bak = (yer: string, l: readonly unknown[]) => {
      for (const st of ['astm', 'en'] as const) {
        const gor = new Map<string, string>();
        for (const v of l.map(String)) {
          const e = secenekEtiketleri(l.map(String), TABAN_STANDART_ADLARI, st).get(v)!;
          if (gor.has(e)) cakisan.push(`${yer} ${st}: ${gor.get(e)!} / ${v}`);
          gor.set(e, v);
        }
      }
    };
    for (const [fk, f] of Object.entries(FAMS)) {
      for (const o of f.opts) {
        if (o.k !== 'durum' && o.k !== 'islem') continue;
        if (o.from) for (const [ck, c] of Object.entries(f.classes)) bak(`${fk}.${ck}.${o.k}`, (c[o.from] as unknown[] | undefined) ?? []);
        else bak(`${fk}.${o.k}`, o.opts ?? []);
      }
    }
    expect(cakisan).toEqual([]);
  });
});

describe('2117-1 b kartın standardı', () => {
  test('alanı olmayan ya da bozuk kartta ASTM; kart adı ve kodu standarttan bağımsızdır (Logo ad güncellemesi tetiklenmez)', () => {
    expect(kartStandardi({})).toBe('astm');
    expect(kartStandardi({ standart: 'xx' })).toBe('astm');
    expect(kartStandardi({ standart: 'en' })).toBe('en');
    const ortam = ortamKur(ORNEK_AYAR);
    const b = kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
    const d = { ...newDraft(b), fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, opts: { durum: 'Islah (+QT)', islem: ['Pasivasyon'] } } as KartKaydi;
    const en = { ...d, standart: 'en' } as KartKaydi;
    expect(finalAd(en, b)).toBe(finalAd(d, b));
    expect(autoKod(en, b)).toBe(autoKod(d, b));
    expect(finalAd(d, b)).toContain('Islah (+QT)');
  });

  test('3633 kalite adı: ASTM karşılığı varsa seçili ASTM ile o yazılır; EN, karşılığı olmayan kalite ve standardı seçilmemiş eski kart kendi adıyla kalır; kod ve mükerrer anahtarı değişmez', () => {
    const ortam = ortamKur(ORNEK_AYAR);
    const b = kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
    const taban = { ...newDraft(b), fam: 'metal', cls: 'karbon', grade: 'S235', form: 'levha', dims: { t: 10, w: 1000, l: 2000 } } as KartKaydi;
    const astm = { ...taban, standart: 'astm' } as KartKaydi;
    const en = { ...taban, standart: 'en' } as KartKaydi;
    const eski = { ...taban } as Record<string, unknown>;
    delete eski['standart'];
    const e = eski as unknown as KartKaydi;
    expect(finalAd(astm, b)).toContain('ASTM A36');
    expect(finalAd(astm, b)).not.toContain('S235JR');
    expect(finalAd(en, b)).toContain('S235JR');
    // Eski kartın adı bugünkü hâliyle kalır: Logo ad güncellemesi kendiliğinden tetiklenmez.
    expect(finalAd(e, b)).toBe(finalAd(en, b));
    expect(finalAd(e, b)).not.toContain('ASTM');
    expect(autoKod(astm, b)).toBe(autoKod(en, b));
    expect(autoKod(e, b)).toBe(autoKod(en, b));
    expect(kartAnahtari(astm, b)).toBe(kartAnahtari(en, b));
    expect(kartAnahtari(e, b)).toBe(kartAnahtari(en, b));
  });

  test('kaliteAdi ve standartTercihi', () => {
    const g = { ad: 'S235JR', eq: { ASTM: '≈ A36', 'W.Nr': '1.0038' } };
    expect(kaliteAdi(g, 'astm')).toBe('ASTM A36');
    expect(kaliteAdi(g, 'en')).toBe('S235JR');
    expect(kaliteAdi(g, null)).toBe('S235JR');
    expect(kaliteAdi({ ad: 'C45', eq: { 'AISI/SAE': '1045' } }, 'astm')).toBe('C45');
    expect(kaliteAdi({ ad: 'X' }, 'astm')).toBe('X');
    expect(standartTercihi({})).toBeNull();
    expect(standartTercihi({ standart: 'xx' })).toBeNull();
    expect(standartTercihi({ standart: 'astm' })).toBe('astm');
    expect(standartTercihi({ standart: 'en' })).toBe('en');
    expect(standartEtiketi('Islah (+QT)', ADLAR, null)).toBe('QT-A (QT-E)');
    expect(standartEtiketi('Yalnız ASTM', ADLAR, null)).toBe('X1');
  });

  test('standardı seçilmemiş eski kartta açıklama ham değeri, Standart satırı özgün sırayı yazar; seçilmiş kartta seçili ad ve taraf sırası', () => {
    const ortam = ortamKur(ORNEK_AYAR);
    const b = kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
    const taban = { ...newDraft(b), fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, opts: { durum: 'Islah (+QT)' }, stds: ['ASTM A29/A29M', 'EN 10083-2'] } as KartKaydi;
    const eski = { ...taban } as Record<string, unknown>;
    delete eski['standart'];
    const ac = (x: unknown) => kartOzeti(x as KartKaydi, b);
    expect(ac(eski).aciklama_2).toContain('Islah (+QT)');
    const sirali = (x: unknown) => finalStd(x as KartKaydi, b);
    expect(sirali(eski)).toBe('EN 10083-2 / ASTM A29/A29M');
    expect(sirali({ ...taban, standart: 'astm' }).startsWith('ASTM')).toBe(true);
    expect(sirali({ ...taban, standart: 'en' }).startsWith('EN')).toBe(true);
    expect(ac({ ...taban, standart: 'astm' }).aciklama_2).toContain('Quenched and tempered');
    expect(ac({ ...taban, standart: 'en' }).aciklama_2).toContain('+QT');
  });
});

describe('2117 arama yerleri', () => {
  const KARTLAR: KatalogKarti[] = ORNEK_KARTLAR.satirlar.flatMap((s) => (s.kayit ? [{ kimlik: s.kimlik, no: s.no, surum: s.surum, kayit: s.kayit as unknown as KartKaydi }] : []));
  const kart = (opts: Record<string, unknown>): KatalogKarti => ({ ...KARTLAR[0]!, kimlik: 'k-durum', kayit: { ...KARTLAR[0]!.kayit, opts } });

  test('katalog araması kartın durum ve işlem değerini ve eşli adlarını bulur (izinli); eşleşmeyen ad bulmaz (reddedilen)', () => {
    const k = kart({ durum: 'Islah (+QT)', islem: ['Yalnız ASTM'] });
    expect(metinListesi([k], 'qt-e', ADLAR).map((x) => x.kimlik)).toEqual(['k-durum']);
    expect(metinListesi([k], 'x1', ADLAR).map((x) => x.kimlik)).toEqual(['k-durum']);
    expect(metinListesi([k], 'Islah', ADLAR).map((x) => x.kimlik)).toEqual(['k-durum']);
    expect(metinListesi([k], 'qt-e')).toEqual([]);
    expect(metinListesi([k], 'zz-yok', ADLAR)).toEqual([]);
  });

  test('hızlı arama ayrıştırması ayardaki eşli adla durumu seçer; ayarsız aynı metin seçmez', () => {
    const b = (malzeme: Record<string, unknown>) => {
      const ortam = ortamKur({ ...ORNEK_AYAR, malzeme: { surum: 1, ...malzeme } });
      return kuralBaglami({ ortam, kartlar: KARTLAR, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
    };
    const esli = metinAyristir('C45 cubuk 50 QT-E', b({ standartAdlari: { 'Islah (+QT)': { en: 'QT-E' } } }));
    expect(esli.opts).toMatchObject({ durum: 'Islah (+QT)' });
    const ayarsiz = metinAyristir('C45 cubuk 50 QT-E', b({}));
    expect(ayarsiz.opts.durum).toBeUndefined();
  });
});

describe('3633 kalite ve norm karşılıkları seçili standarda göre sıralanır', () => {
  test('taraf tanıma: ASTM ailesi, EN ailesi, öteki tarafsız', () => {
    for (const x of ['ASTM A29', 'AISI/SAE', 'UNS', 'AMS 6370', 'AA', 'ASTM D1418']) expect(standartTarafi(x), x).toBe('astm');
    for (const x of ['EN 10083-3', 'EN kısa ad', 'EN numara', 'W.Nr']) expect(standartTarafi(x), x).toBe('en');
    for (const x of ['DIN (eski)', 'JIS', 'GB', 'ISO', 'Ticari adlar']) expect(standartTarafi(x), x).toBeNull();
  });
  test('seçili taraf önce, tarafsız sonra, öteki taraf en sonda; hiçbir karşılık düşmez', () => {
    const eq = { 'W.Nr': '1.0503', UNS: 'G10450', JIS: 'S45C', 'AISI/SAE': '1045', 'EN kısa ad': 'C45' };
    expect(Object.keys(esdegerSirala(eq, 'astm'))).toEqual(['UNS', 'AISI/SAE', 'JIS', 'W.Nr', 'EN kısa ad']);
    expect(Object.keys(esdegerSirala(eq, 'en'))).toEqual(['W.Nr', 'EN kısa ad', 'JIS', 'UNS', 'AISI/SAE']);
    expect(tarafSirala(['EN 10083-3', 'ASTM A29', 'ISO 683'], 'astm', (x) => x)).toEqual(['ASTM A29', 'ISO 683', 'EN 10083-3']);
  });
  test('ana norm: seçili tarafın normu, yoksa kalitenin ana normu', () => {
    const g = { std: 'EN 10083-2', stds: ['EN 10083-2', 'ASTM A29/A29M', 'SAE J403'] };
    expect(anaNorm(g, 'astm')).toBe('ASTM A29/A29M');
    expect(anaNorm(g, 'en')).toBe('EN 10083-2');
    expect(anaNorm({ std: 'MIL-DTL-12560', stds: ['MIL-DTL-12560'] }, 'en')).toBe('MIL-DTL-12560');
    expect(anaNorm({ std: 'X 1' }, 'astm')).toBe('X 1');
    expect(anaNorm({}, 'astm')).toBe('');
  });
  test('sınıflandırma gerçek norm listesiyle: her norm bilinen bir tarafa ya da tarafsıza düşer, ASTM ve EN ile başlayanlar yanlış tarafa düşmez', async () => {
    const tum = new Set<string>();
    for (const f of Object.values(FAMS as Record<string, { classes: Record<string, { std?: string; grades: { std?: string; stds?: string[] }[] }> }>)) {
      for (const c of Object.values(f.classes)) {
        if (c.std) tum.add(c.std);
        for (const g of c.grades) { if (g.std) tum.add(g.std); for (const x of g.stds ?? []) tum.add(x); }
      }
    }
    expect(tum.size).toBeGreaterThan(50);
    for (const n of tum) {
      const t = standartTarafi(n);
      if (/^ASTM\b/.test(n)) expect(t, n).toBe('astm');
      if (/^EN\b/.test(n)) expect(t, n).toBe('en');
      if (t === 'en') expect(/^(EN\b|W\.Nr)/.test(n), n).toBe(true);
      if (t === null) expect(/\b(ASTM|EN|AMS|SAE|AISI|UNS)\b/.test(n), `tarafsız norm iki tarafı da anıyor: ${n}`).toBe(false);
    }
  });
});
