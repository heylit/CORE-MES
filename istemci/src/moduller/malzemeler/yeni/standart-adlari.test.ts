import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR, ORNEK_KARTLAR } from './ornek-veri.ts';
import { FAMS } from './sabitler/index.ts';
import { metinListesi } from './katalog/liste.ts';
import { autoKod, finalAd, kuralBaglami, metinAyristir, newDraft } from './kurallar/index.ts';
import {
  STANDART_AD_SINIRI, TABAN_STANDART_ADLARI, aramaMetinleri, kartStandardi, ayardakiStandartAdlari, esliAdlariCoz, standartAdiYaz, standartAdlari, standartEtiketi, standartlaEslesir,
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

  test('seçili standart önce, diğeri parantez içinde; tek ad o ad, hiç yoksa değerin kendisi', () => {
    expect(standartEtiketi('Islah (+QT)', ADLAR, 'astm')).toBe('QT-A (QT-E)');
    expect(standartEtiketi('Islah (+QT)', ADLAR, 'en')).toBe('QT-E (QT-A)');
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
          const e = standartEtiketi(v, TABAN_STANDART_ADLARI, st);
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
