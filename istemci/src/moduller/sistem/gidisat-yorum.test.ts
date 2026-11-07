import { describe, expect, it } from 'vitest';
import { bellekYorumu, girisYorumu, hatYorumu, islemciYorumu, mesguliyetYorumu, takilmaYorumu, yanitYorumu, yogunlukYorumu } from './gidisat-yorum.ts';
import type { Nokta } from './performans.ts';

const seri = (...d: (number | null)[]): Nokta[] => d.map((deger, i) => ({ an: new Date(Date.UTC(2026, 10, 1, 10, i)), deger }));
const etiket = (an: Date) => `${an.getUTCHours()}:${String(an.getUTCMinutes()).padStart(2, '0')}`;

describe('grafik yorumları (2231)', () => {
  it('ölçü yoksa iyi denmez', () => {
    for (const y of [yanitYorumu(seri(null)), takilmaYorumu(seri()), mesguliyetYorumu(seri(null)), hatYorumu(seri(), 10, 0), bellekYorumu(seri(), seri(), null)]) {
      expect(y.ton).toBe('pasif');
    }
  });

  it('yanıt süresi sunucunun 1 saniye eşiğiyle yorumlanır', () => {
    expect(yanitYorumu(seri(40, 900)).ton).toBe('tamam');
    expect(yanitYorumu(seri(40, 1200, 1500))).toMatchObject({ ton: 'uyari', ozet: '2 ölçüde sınır aşıldı.' });
  });

  it('yoğunluk en yoğun anı söyler; sunucu hatası varsa önce onu', () => {
    expect(yogunlukYorumu(seri(3, 9, 4), etiket, 0).ozet).toBe('En yoğun an 10:01, 9 istek.');
    expect(yogunlukYorumu(seri(3, 9), etiket, 2)).toMatchObject({ ton: 'uyari', ozet: '2 istek sunucu hatasıyla bitti.' });
    expect(yogunlukYorumu(seri(0, 0), etiket, 0).ozet).toBe('Kullanım yok.');
  });

  it('işlemci: uygulamanın payı küçükse yükün başka programdan geldiğini söyler; %90 ve üstü uyarı', () => {
    expect(islemciYorumu(seri(40), seri(5)).aciklama).toContain('başka programlar');
    expect(islemciYorumu(seri(40), seri(30)).aciklama).not.toContain('başka programlar');
    expect(islemciYorumu(seri(95), seri(5)).ton).toBe('uyari');
  });

  it('bellek eşiği yalnız biliniyorsa uygulanır; takılma 500 ms, hat bekleyen istek uyarıdır', () => {
    expect(bellekYorumu(seri(900, 700), seri(200), 800).ton).toBe('uyari');
    expect(bellekYorumu(seri(900, 700), seri(200), null).ton).toBe('tamam');
    expect(takilmaYorumu(seri(100, 499)).ton).toBe('tamam');
    expect(takilmaYorumu(seri(100, 500)).ton).toBe('uyari');
    expect(hatYorumu(seri(3, 4), 30, 0).aciklama).toBe('30 hattan en çok 4 tanesi aynı anda doldu; hat bekleyen istek olmadı.');
    expect(hatYorumu(seri(3, 4), 30, 2).ton).toBe('uyari');
    expect(mesguliyetYorumu(seri(10, 75)).ton).toBe('uyari');
  });

  it('girişler: hatalı giriş yoksa iyi, varsa sayısını söyler', () => {
    expect(girisYorumu(5, 0).ton).toBe('tamam');
    expect(girisYorumu(5, 3)).toMatchObject({ ton: 'uyari', ozet: '3 hatalı giriş.' });
  });
});
