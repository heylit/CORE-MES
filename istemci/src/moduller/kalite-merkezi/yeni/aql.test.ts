import { describe, expect, it } from 'vitest';
import { aqlPlani, butunAnahtarlar, c0Numune, DURDURULDU, gecisDurumu, kabulOlasiligi, kodHarfi, lotAnahtari, oranBul, planSatirlari, SIKI, varsayilanAql } from './aql.ts';
import type { Lot } from './tipler.ts';

describe('AQL planı (ISO 2859-1)', () => {
  it('kod harfi parti ve seviyeden', () => {
    expect(kodHarfi(500, 'II')).toBe('H');
    expect(kodHarfi(10, 'S-1')).toBe('A');
    expect(kodHarfi(1, 'II')).toBeNull();
  });

  it('normal plan: 500 adet, II, AQL 1,0 -> n 50, Ac 1, Re 2; AQL 2,5 -> Ac 3, Re 4', () => {
    expect(aqlPlani(500, 'II', '1.0', 'Normal')).toMatchObject({ kod: 'H', kodK: 'H', n: 50, ac: 1, re: 2 });
    expect(aqlPlani(500, 'II', '2.5', 'Normal')).toMatchObject({ n: 50, ac: 3, re: 4 });
  });

  it('ok kuralı harfi değiştirir ve notu yazar; numune partiyi aşarsa %100', () => {
    const p = aqlPlani(500, 'II', '0.10', 'Normal');
    expect(p?.kodK).not.toBe('H');
    expect(p?.not).toContain('Ok kuralı');
    expect(aqlPlani(10, 'II', '0.010', 'Normal')?.yuzde100).toBe(true);
  });

  it('%100 kritik sıfır kabul; geçersiz parti null', () => {
    expect(aqlPlani(40, 'II', '%100', 'Normal')).toMatchObject({ n: 40, ac: 0, re: 1, yuzde100: true });
    expect(aqlPlani(1, 'II', '1.0', 'Normal')).toBeNull();
    expect(aqlPlani(500, 'II', '7', 'Normal')).toBeNull();
  });

  it('kabul olasılığı ve oran bulma tutarlı', () => {
    expect(kabulOlasiligi(50, 1, 0)).toBe(1);
    const p = oranBul(50, 1, 0.5);
    expect(kabulOlasiligi(50, 1, p)).toBeCloseTo(0.5, 3);
    expect(c0Numune(null, 5, 95)).toBe(59);
  });

  it('varsayılan AQL ayardan, plan satırları üç sınıf', () => {
    expect(varsayilanAql({})).toEqual({ seviye: 'II', kr: '%100', mj: '1.0', mn: '2.5' });
    expect(planSatirlari(500, 'II', { kr: '%100', mj: '1.0', mn: '2.5' }, 'Normal').map((r) => r.plan?.ac)).toEqual([0, 1, 3]);
  });
});

describe('sıkılık geçişi', () => {
  const lot = (i: number, karar: string, ek: Partial<Lot> = {}): Lot => ({ _id: `l${i}`, no: `L${i}`, tarih: `2026-01-${String(i).padStart(2, '0')}`, anahtar: 'P|IC', karar, ...ek });

  it('5 lotta 2 ret sıkılaştırır, 5 ardışık kabul normale döndürür', () => {
    const L = [lot(1, 'Ret'), lot(2, 'Ret')];
    expect(gecisDurumu(L, 'P|IC').st).toBe(SIKI);
    const geri = [...L, ...[3, 4, 5, 6, 7].map((i) => lot(i, 'Kabul'))];
    expect(gecisDurumu(geri, 'P|IC').st).toBe('Normal');
  });

  it('sıkılaştırılmışta 5 ret durdurur; yeniden başlatma sıkılaştırılmıştan başlar', () => {
    const L = [lot(1, 'Ret'), lot(2, 'Ret'), ...[3, 4, 5, 6, 7].map((i) => lot(i, 'Ret'))];
    expect(gecisDurumu(L, 'P|IC').st).toBe(DURDURULDU);
    expect(gecisDurumu([...L, lot(8, '', { tip: 'reset' })], 'P|IC').st).toBe(SIKI);
  });

  it('yeniden sunum sayılmaz; anahtar parça ve tedarikçiden', () => {
    expect(gecisDurumu([lot(1, 'Ret'), lot(2, 'Ret', { yenidenSunum: true })], 'P|IC').st).toBe('Normal');
    expect(lotAnahtari(' ab-1 ', '')).toBe('AB-1|IC');
    expect(butunAnahtarlar([lot(1, 'Kabul'), lot(2, 'Kabul')])).toHaveLength(1);
  });
});
