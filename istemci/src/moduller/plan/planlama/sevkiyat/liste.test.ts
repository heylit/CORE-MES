import { describe, expect, it } from 'vitest';
import type { SevkSatiri } from './kurallar.ts';
import {
  aramaUyar, durumSayilari, sevkFarki, sevkListeDurumu, sevkListeGruplari, sevkListeSatirlari, type SevkListeDurumu,
} from './liste.ts';

// Veri uydurmadır. Taban 02.03.2026 Pazartesi 00:00; "şimdi" 10. saat (aynı hafta: 02-08.03).
const TABAN = Date.UTC(2026, 2, 2);
const SIMDI = 10;
const kayit = (C: number, kim = 'A') => ({ C, t: 1, kaynak: 'plan', kim });
function sip(id: string, o: Partial<SevkSatiri> = {}): SevkSatiri {
  return { id, ad: `Urun ${id}`, musteri: 'Deneme Musteri', adet: 10, C: 30, T: 0, termin: 100, adim: 'Son olcum', yer: 't1', gercekBitis: null, bitti: false, sevk: null, gecmis: [], ...o };
}
const d = (x: SevkSatiri): SevkListeDurumu => sevkListeDurumu(x, TABAN, SIMDI);

describe('Sevk listesi durumları', () => {
  it('geç: termin aşımı eşiğin üstünde', () => { expect(d(sip('a', { C: 30, T: 6, termin: 24 }))).toBe('gec'); });
  it('son gün: geç değil, termine 24 saatten az pay', () => { expect(d(sip('a', { C: 30, T: 0, termin: 40 }))).toBe('son-gun'); });
  it('ertelendi: ilk plana göre kaymış, geç ve son gün değil', () => {
    expect(d(sip('a', { C: 60, termin: 200, gecmis: [kayit(40), kayit(60)] }))).toBe('ertelendi');
    // Oynama eşiğin (0,5 sa) altındaysa ertelenmiş sayılmaz.
    expect(d(sip('a', { C: 60, termin: 200, gecmis: [kayit(59.8), kayit(60)] }))).toBe('hafta');
  });
  it('bu hafta: plan bitişi şimdiki takvim haftasında; haftanın dışı zamanında', () => {
    expect(d(sip('a', { C: 100, termin: 300 }))).toBe('hafta');
    expect(d(sip('a', { C: 24 * 7 + 5, termin: 300 }))).toBe('zamaninda');
  });
  it('sevk edildi her şeyden önce gelir: sevk edilmiş geç satır geç sayılmaz', () => {
    expect(d(sip('a', { C: 30, T: 6, termin: 24, sevk: { t: '2026-03-05', kim: null } }))).toBe('sevk');
  });
  it('bitişi yok: plan bitiş vermedi; sıfır ya da tarih uydurulmaz', () => {
    const x = sip('a', { C: null, T: null, termin: 50 });
    expect(d(x)).toBe('bitissiz');
    expect(sevkFarki(x)).toBeNull();
  });
  it('kural sırası: geç, son günden; son gün, ertelendiden; ertelendi, bu haftadan önce gelir', () => {
    expect(d(sip('a', { C: 30, T: 2, termin: 28, gecmis: [kayit(10), kayit(30)] }))).toBe('gec');
    expect(d(sip('a', { C: 30, T: 0, termin: 40, gecmis: [kayit(10), kayit(30)] }))).toBe('son-gun');
    expect(d(sip('a', { C: 30, T: 0, termin: 90, gecmis: [kayit(10), kayit(30)] }))).toBe('ertelendi');
  });
});

describe('Fark', () => {
  it('geç satırda planın aşımı; öbüründe bitiş eksi termin; termin yoksa null', () => {
    expect(sevkFarki(sip('a', { C: 30, T: 6, termin: 24 }))).toBe(6);
    expect(sevkFarki(sip('a', { C: 30, T: 0, termin: 46 }))).toBe(-16);
    expect(sevkFarki(sip('a', { C: 30, T: 0, termin: null }))).toBeNull();
  });
});

describe('Sıralama, sayılar, arama, gruplar', () => {
  const l = [
    sip('S-ZAM', { C: 300, termin: 500 }),
    sip('S-SEVK', { C: 5, termin: 50, sevk: { t: '2026-03-02', kim: null } }),
    sip('S-HAFTA', { C: 60, termin: 200 }),
    sip('S-GEC2', { C: 50, T: 4, termin: 46 }),
    sip('S-GEC1', { C: 20, T: 8, termin: 12 }),
    sip('S-BITISSIZ', { C: null, T: null, termin: null }),
    sip('S-SON', { C: 40, T: 0, termin: 50 }),
  ];
  const s = sevkListeSatirlari(l, TABAN, SIMDI);

  it('geç satırlar üstte (bitişe göre), sonra bitişe göre, bitişsiz sonda, sevk edilenler en altta', () => {
    expect(s.map((x) => x.x.id)).toEqual(['S-GEC1', 'S-GEC2', 'S-SON', 'S-HAFTA', 'S-ZAM', 'S-BITISSIZ', 'S-SEVK']);
  });
  it('çip sayıları satırları dışlayarak sayar; toplam satır sayısına eşit', () => {
    const say = durumSayilari(s);
    expect(say).toEqual({ gec: 2, 'son-gun': 1, hafta: 1, ertelendi: 0, zamaninda: 1, sevk: 1, bitissiz: 1 });
    expect(Object.values(say).reduce((a, b) => a + b, 0)).toBe(l.length);
  });
  it('boş liste: bütün sayılar sıfır, grup yok', () => {
    expect(Object.values(durumSayilari([])).every((n) => n === 0)).toBe(true);
    expect(sevkListeGruplari([], TABAN, 'hafta')).toEqual([]);
  });
  it('arama emir numarasında, kimlikte, üründe ve müşteride; boş arama hepsini getirir; Türkçe harf duyarsız', () => {
    const emirNo = (id: string) => `EM-${id}`;
    const gec1 = s[0]!;
    expect(aramaUyar(gec1, '', emirNo)).toBe(true);
    expect(aramaUyar(gec1, 'em-s-gec1', emirNo)).toBe(true);
    expect(aramaUyar(gec1, 'urun s-gec1', emirNo)).toBe(true);
    expect(aramaUyar(gec1, 'DENEME m', emirNo)).toBe(true);
    expect(aramaUyar(gec1, 'yok boyle', emirNo)).toBe(false);
    expect(aramaUyar({ ...gec1, x: { ...gec1.x, musteri: 'İstanbul Işık' } }, 'ıŞık', emirNo)).toBe(true);
  });
  it('gruplar: geç kalanlar, bitiş haftaları sırayla, bitişsiz, sevk edilen; boş grup çıkmaz', () => {
    const g = sevkListeGruplari(s, TABAN, 'hafta');
    expect(g.map((x) => x.anahtar)).toEqual(['gec', '2026-10', '2026-11', 'bitissiz', 'sevk']);
    expect(g.map((x) => x.satirlar.length)).toEqual([2, 2, 1, 1, 1]);
    expect(sevkListeGruplari(s, TABAN, 'ay').filter((x) => x.anahtar === '2026-03')[0]?.satirlar).toHaveLength(3);
  });
});
