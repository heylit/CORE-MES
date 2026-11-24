import { describe, expect, test, vi } from 'vitest';
import { AgHatasi, ApiHatasi } from './api.ts';
import { EKRAN_HATASI_ARALIGI_MS, EKRAN_HATASI_UCU_HAZIR, ekranHatasiBildiriciKur, ekranHatasiDinleyicisiniKur, ekranHatasiGovdesi } from './ekran-hatasi.ts';

describe('ekran hatası bildirimi', () => {
  test('aynı hata dakikada bir kez gider; süre geçince yeniden, farklı hata hemen', () => {
    const gonder = vi.fn(() => Promise.resolve());
    let an = 0;
    const b = ekranHatasiBildiriciKur(gonder, () => an, () => '/ornek');
    const e = new Error('Çizim düştü');
    expect(b.bildir(e)).toBe(true);
    expect(b.bildir(e)).toBe(false);
    expect(b.bildir(new Error('Başka'))).toBe(true);
    an = EKRAN_HATASI_ARALIGI_MS;
    expect(b.bildir(e)).toBe(true);
    expect(gonder.mock.calls).toHaveLength(3);
  });

  test('sunucu ve ağ hataları ekran hatası sayılmaz; gönderim hatası fırlamaz', () => {
    const gonder = vi.fn(() => Promise.reject(new Error('uç yok')));
    const b = ekranHatasiBildiriciKur(gonder, () => 0, () => '/x');
    expect(b.bildir(new AgHatasi('ağ'))).toBe(false);
    expect(b.bildir(new ApiHatasi(500, null))).toBe(false);
    expect(b.bildir(new Error('gerçek'))).toBe(true);
  });

  test('tarayıcının ResizeObserver bildirimi hata sayılmaz', () => {
    const gonder = vi.fn(() => Promise.resolve());
    const b = ekranHatasiBildiriciKur(gonder, () => 0, () => '/x');
    expect(b.bildir('ResizeObserver loop completed with undelivered notifications.')).toBe(false);
    expect(b.bildir(new Error('ResizeObserver loop limit exceeded'))).toBe(false);
    expect(gonder).not.toHaveBeenCalled();
  });

  test('uç gelene kadar (dilim C) varsayılan gönderim kapalıdır', () => {
    expect(EKRAN_HATASI_UCU_HAZIR).toBe(false);
  });

  test('gövde sorgusuz sayfa, kısaltılmış iletiyi ve kişisiz alanları taşır', () => {
    const g = ekranHatasiGovdesi(new TypeError('x'.repeat(1000)), '/uretim?ara=gizli#a');
    expect(g.sayfa).toBe('/uretim');
    expect(g.hata.length).toBeLessThanOrEqual(300);
    expect(Object.keys(g).sort()).toEqual(['hata', 'sayfa', 'surum', 'yigin']);
    expect(ekranHatasiGovdesi('düz metin', '/a').yigin).toBeNull();
  });

  test('pencere hatası ve söz reddi dinlenir, durdurulunca dinlenmez', () => {
    const bildir = vi.fn(() => true);
    const hedef = new EventTarget();
    const durdur = ekranHatasiDinleyicisiniKur({ bildir }, hedef as unknown as Window);
    const hata = new Event('error') as Event & { error: unknown };
    hata.error = new Error('a');
    hedef.dispatchEvent(hata);
    const ret = new Event('unhandledrejection') as Event & { reason: unknown };
    ret.reason = new Error('b');
    hedef.dispatchEvent(ret);
    expect(bildir).toHaveBeenCalledTimes(2);
    durdur();
    hedef.dispatchEvent(hata);
    expect(bildir).toHaveBeenCalledTimes(2);
  });
});
