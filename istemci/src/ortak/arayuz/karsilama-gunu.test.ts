import { describe, expect, test } from 'vitest';
import { karsilamaGunu, gununSozu, type KarsilamaGunuAyari } from './karsilama-gunu.ts';
import { KARSILAMA_SOZLERI } from './karsilama-sozleri.ts';

const ACIK: KarsilamaGunuAyari = { sozAcik: true, gunNotuAcik: true, ramazanBayrami: null, kurbanBayrami: null };

describe('karşılama günü', () => {
  test('sıradan gün: not yok, söz var, bayrak yok', () => {
    const g = karsilamaGunu('2026-11-17', ACIK);
    expect(g).toEqual({ not: null, soz: gununSozu('2026-11-17'), sade: false, bayrak: false });
    expect(g.soz).not.toBe('');
  });

  test('366 söz yılda bir kez: 2028 (artık yıl) boyunca her gün farklı söz', () => {
    expect(KARSILAMA_SOZLERI.flat()).toHaveLength(366);
    const sozler = new Set<string>();
    for (let i = 0; i < 366; i += 1) sozler.add(gununSozu(new Date(Date.UTC(2028, 0, 1 + i)).toISOString().slice(0, 10)));
    expect(sozler.size).toBe(366);
  });

  test('milli bayramda not ve bayrak; 1 Ocak ve 1 Mayıs bayraksız; söz yine çıkar', () => {
    expect(karsilamaGunu('2026-10-29', ACIK)).toMatchObject({ not: 'Cumhuriyet Bayramımız kutlu olsun.', bayrak: true, sade: false });
    expect(karsilamaGunu('2026-04-23', ACIK).bayrak).toBe(true);
    expect(karsilamaGunu('2027-01-01', ACIK)).toMatchObject({ bayrak: false });
    expect(karsilamaGunu('2026-05-01', ACIK).bayrak).toBe(false);
    expect(karsilamaGunu('2026-10-29', ACIK).soz).not.toBeNull();
  });

  test('10 Kasım sade: anma notu, söz yok, bayrak yok', () => {
    expect(karsilamaGunu('2026-11-10', ACIK)).toEqual({ not: 'Saygıyla anıyoruz.', soz: null, sade: true, bayrak: false });
  });

  test('dini bayram: bayram günleri, önceki son iş günü (hafta sonu atlanır) ve sonraki ilk iş günü', () => {
    const ayar = { ...ACIK, ramazanBayrami: { bas: '2027-03-09', bit: '2027-03-11' } };
    expect(karsilamaGunu('2027-03-10', ayar).not).toBe('Ramazan Bayramınız kutlu olsun.');
    expect(karsilamaGunu('2027-03-08', ayar).not).toMatch(/şimdiden kutlu/);
    expect(karsilamaGunu('2027-03-12', ayar).not).toMatch(/Tekrar hoş geldiniz/);
    // Pazartesi başlayan bayramın öncesi cumadır.
    const kurban = { ...ACIK, kurbanBayrami: { bas: '2026-06-01', bit: '2026-06-03' } };
    expect(karsilamaGunu('2026-05-29', kurban).not).toMatch(/şimdiden kutlu/);
    expect(karsilamaGunu('2026-05-31', kurban).not).toBe('Hafta sonu gelenlerin emeği çok değerli.');
  });

  test('sıra: dini bayram > sabit gün > yıl sonu > ay başı > pazartesi > cuma > hafta sonu', () => {
    expect(karsilamaGunu('2026-12-28', ACIK).not).toMatch(/Yılın son günlerinde/);
    expect(karsilamaGunu('2026-06-01', ACIK).not).toBe('Yeni ay, yeni hedefler.');
    expect(karsilamaGunu('2026-11-16', ACIK).not).toBe('Yeni hafta, temiz bir sayfa.');
    expect(karsilamaGunu('2026-11-20', ACIK).not).toMatch(/son düzlüğü/);
    expect(karsilamaGunu('2026-11-21', ACIK).not).toMatch(/Hafta sonu/);
  });

  test('ayarlar kapalıyken not, söz, bayrak ve 10 Kasım sadeliği çıkmaz', () => {
    const kapali = { ...ACIK, sozAcik: false, gunNotuAcik: false };
    expect(karsilamaGunu('2026-10-29', kapali)).toEqual({ not: null, soz: null, sade: false, bayrak: false });
    expect(karsilamaGunu('2026-11-10', kapali)).toEqual({ not: null, soz: null, sade: false, bayrak: false });
    expect(karsilamaGunu('2026-11-10', { ...ACIK, sozAcik: false }).sade).toBe(true);
  });
});
