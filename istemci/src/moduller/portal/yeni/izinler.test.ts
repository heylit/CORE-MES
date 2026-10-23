import { describe, expect, it } from 'vitest';
import { altAcik, gorunurBolumler, izinKur } from './izinler.ts';
import { GENEL_MUDUR_KULLANICISI, KALITECI, SATINALMACI } from './ornek-veri.ts';

describe('portal izinleri', () => {
  it('kalite izni satış ve satın alma siparişlerini açmaz; kalite kayıtlarını açar', () => {
    const iz = izinKur(KALITECI);
    expect(iz.gorunumAcik('sorders')).toBe(false);
    expect(iz.gorunumAcik('porders')).toBe(false);
    expect(iz.gorunumAcik('quality')).toBe(true);
    expect(iz.eylemAcik('ncrclose')).toBe(true);
    expect(iz.eylemAcik('paynow')).toBe(false);
  });

  it('tam yetki her görünümü açar; kullanıcı kaydı yoksa hiçbir izinli görünüm açılmaz', () => {
    const tam = izinKur(GENEL_MUDUR_KULLANICISI);
    expect(tam.gorunumAcik('users')).toBe(true);
    expect(tam.gonderimAcik('neworder', { type: 'sales' })).toBe(true);
    const yok = izinKur(null);
    expect(yok.gorunumAcik('payments')).toBe(false);
    expect(altAcik(yok, 'home')).toBe(true);
  });

  it('yeni sipariş gönderimi türüne göre izin ister', () => {
    const iz = izinKur(SATINALMACI);
    expect(iz.gonderimAcik('neworder', { type: 'purchase' })).toBe(true);
    expect(iz.gonderimAcik('neworder', { type: 'sales' })).toBe(false);
  });

  it('onay bölümü onay izni olana ya da kendi onayını izleyene görünür', () => {
    const kalite = izinKur(KALITECI);
    expect(gorunurBolumler(kalite, false).map((b) => b.anahtar)).toEqual(['home', 'partners']);
    expect(gorunurBolumler(kalite, true).map((b) => b.anahtar)).toEqual(['home', 'approvals', 'partners']);
    // 231 a: satın alma bölümü taşınmaz; satınalmacı yalnız ana sayfa ve onayları görür.
    expect(gorunurBolumler(izinKur(SATINALMACI), false).map((b) => b.anahtar)).toEqual(['home', 'approvals']);
    expect(gorunurBolumler(izinKur(GENEL_MUDUR_KULLANICISI), false).map((b) => b.anahtar)).toEqual(['home', 'approvals', 'sales', 'partners']);
  });
});
