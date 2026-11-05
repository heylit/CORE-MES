import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR, ORNEK_KARTLAR } from './ornek-veri.ts';
import { metinListesi } from './katalog/liste.ts';
import { kuralBaglami, metinAyristir } from './kurallar/index.ts';
import {
  TABAN_STANDART_ADLARI, aramaMetinleri, ayardakiStandartAdlari, esliAdlariCoz, standartAdiYaz, standartAdlari, standartEtiketi, standartlaEslesir,
} from './standart-adlari.ts';
import type { KartKaydi, KatalogKarti } from './tipler.ts';
import { ortamKur } from './veri.ts';
import { malzemeYetkisi } from './yetki.ts';

// Adlar sentetiktir: gerçek EN-ASTM listesi kullanıcıdan gelir (2117-2).
const ADLAR = { 'Islah (+QT)': { astm: 'QT-A', en: 'QT-E' }, 'Yalnız ASTM': { astm: 'X1' }, 'Aynı ad': { astm: 'T6', en: 'T6' } };

describe('2117 standart adları', () => {
  test('taban tablo boştur; eşleşme uydurulmaz', () => {
    expect(TABAN_STANDART_ADLARI).toEqual({});
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
    expect(standartAdlari(null)).toEqual({});
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
