import { describe, expect, it } from 'vitest';
import { kmYetkisiKur } from './yetki.ts';

const yonetici = kmYetkisiKur({ oku: true, yaz: true, onayla: true, geriYukle: true }, true);
const muhendis = kmYetkisiKur({ oku: true, yaz: true, onayla: true, geriYukle: false }, false);
const muayeneci = kmYetkisiKur({ oku: true, yaz: true, onayla: false, geriYukle: false }, false);
const okuyan = kmYetkisiKur({ oku: true, yaz: false, onayla: false, geriYukle: false }, false);

describe('kmYetkisiKur', () => {
  it('rolü TMI yetkisinden çıkarır', () => {
    expect([yonetici.rol, muhendis.rol, muayeneci.rol]).toEqual(['Kalite yöneticisi', 'Kalite mühendisi', 'Muayeneci']);
  });

  it('silme ve arşiv yöneticide; onaylayan yalnız belge, bayrak ve şablonu siler (229 a, 260 a, 261 a)', () => {
    expect(yonetici.silebilir('ncr') && yonetici.arsiv && yonetici.ayar).toBe(true);
    expect(['belge', 'bayrak', 'tpl'].every((k) => muhendis.silebilir(k as 'belge'))).toBe(true);
    expect(muhendis.silebilir('ncr') || muhendis.arsiv || muhendis.ayar).toBe(false);
    expect(muayeneci.silebilir('belge') || muayeneci.silebilir('ncr') || muayeneci.arsiv).toBe(false);
  });

  it('tedarikçi ve şablon yazma onay ister, cihaz hiç yazılmaz', () => {
    expect(muhendis.kaynak('sup') && muhendis.kaynak('tpl')).toBe(true);
    expect(muayeneci.kaynak('sup') || muayeneci.kaynak('tpl')).toBe(false);
    expect(muayeneci.kaynak('ncr')).toBe(true);
    expect(yonetici.kaynak('dev')).toBe(false);
  });

  it('yazma yetkisi olmayan hiçbir şey yapamaz; geri yükleme yalnız yöneticide', () => {
    expect(okuyan.kaynak('ncr') || okuyan.silebilir('belge') || okuyan.arsiv || okuyan.kapat || okuyan.geriYukle).toBe(false);
    expect(muhendis.kapat && muhendis.kilitAc).toBe(true);
    expect(muayeneci.kapat || muayeneci.kilitAc).toBe(false);
    expect(yonetici.geriYukle).toBe(true);
    expect(kmYetkisiKur({ oku: true, yaz: true, onayla: true, geriYukle: true }, false).geriYukle).toBe(false);
  });
});
