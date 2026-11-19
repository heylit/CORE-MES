import { describe, expect, it } from 'vitest';
import { onaylayabilecekler } from './onaylayan.ts';

const L = [
  { max: 50000, role: 'ORN- Birim', rolId: 1, rolAdi: 'ORN- Birim sorumlusu' },
  { max: 250000, role: 'ORN- Mudur', rolId: 2, rolAdi: 'ORN- Mudur' },
  { max: null, role: 'ORN- Genel', rolId: 3, rolAdi: 'ORN- Genel mudur' },
];

describe('onaylayabilecekler', () => {
  it('basamak denetimi kapaliyken yetkisi olan herkes', () => {
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: false }, L[1]!)).toBe('Basamak denetimi kapalı: onay yetkisi olan herkes onaylayabilir');
    expect(onaylayabilecekler({ approvalLimits: L }, L[1]!)).toBe('Basamak denetimi kapalı: onay yetkisi olan herkes onaylayabilir');
  });
  it('acikken basamagin ve ust basamaklarin rolleri', () => {
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: true }, L[1]!)).toBe('Onaylayabilir: ORN- Mudur, ORN- Genel mudur');
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: true }, L[2]!)).toBe('Onaylayabilir: ORN- Genel mudur');
  });
  it('rolsuz basamak yetkiyle yetinir; basamak yoksa herkes', () => {
    const R = [{ max: 1000, role: 'ORN- Kucuk', rolId: null }, ...L];
    expect(onaylayabilecekler({ approvalLimits: R, onayKademesi: true }, R[0]!)).toBe('Bu basamakta rol yok: onay yetkisi olan herkes onaylayabilir');
    expect(onaylayabilecekler({ approvalLimits: L, onayKademesi: true }, null)).toBe('Basamak denetimi kapalı: onay yetkisi olan herkes onaylayabilir');
  });
  it('rol adi gelmemisse ic kimlik gosterilmez', () => {
    const R = [{ max: null, role: 'ORN- Tek', rolId: 7 }];
    expect(onaylayabilecekler({ approvalLimits: R, onayKademesi: true }, R[0]!)).toBe('Onaylayabilir: basamağın rolünü taşıyan');
  });
});
