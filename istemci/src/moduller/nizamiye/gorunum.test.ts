import { describe, expect, it } from 'vitest';
import type { Ziyaret } from '#paylasilan/sozlesme/nizamiye.ts';
import { kapiZamani, sureMetni, uyari } from './gorunum.ts';

const simdi = Date.parse('2031-05-20T10:00:00+03:00');
const beklenen = (zaman: string) => ({ durum: 'beklenen', beklenenZaman: zaman, dizustu: false }) as Ziyaret;

describe('kapı süre ve zaman yazısı', () => {
  it('gecikme gün aşınca günle yazılır', () => {
    expect(uyari(beklenen('2031-05-20T09:40:00+03:00'), simdi)).toBe('20 dk gecikti');
    expect(uyari(beklenen('2031-05-20T07:30:00+03:00'), simdi)).toBe('2 sa 30 dk gecikti');
    expect(uyari(beklenen('2031-05-15T08:00:00+03:00'), simdi)).toBe('5 gün 2 sa gecikti');
    expect(uyari(beklenen('2031-05-20T09:50:00+03:00'), simdi)).toBeNull();
  });

  it('içeride kalma süresi gün aşınca günle yazılır', () => {
    expect(sureMetni('2031-05-19T08:00:00+03:00', simdi)).toBe('1 gün 2 sa');
  });

  it('beklenen saat bugünün değilse günüyle yazılır', () => {
    expect(kapiZamani('2031-05-20T08:15:00+03:00', simdi)).toBe('08:15');
    expect(kapiZamani('2031-05-19T23:30:00+03:00', simdi)).toBe('19.05 23:30');
    expect(kapiZamani(null, simdi)).toBe('—');
  });
});
