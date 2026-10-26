import { describe, expect, it } from 'vitest';
import { operatorMetni, operatorOrani, operatorSecenekleri, tezgahSayisi } from './tesis.ts';

// 561 1 b: "bir operatör en çok N tezgâh" ile makine başına operatör ihtiyacı arasındaki çeviri (ORTAK-ANLASMA 567).
describe('operatör oranı', () => {
  it('1/N aşağı yuvarlanır, N tezgâhın toplamı 1i geçmez; okurken aynı N bulunur', () => {
    for (let n = 1; n <= 10; n++) {
      expect(operatorOrani(n) * n).toBeLessThanOrEqual(1);
      if (n > 1) expect(tezgahSayisi(operatorOrani(n))).toBe(n);
    }
    expect([operatorOrani(2), operatorOrani(3), operatorOrani(6)]).toEqual([0.5, 0.33, 0.16]);
  });

  it('kesirli olmayan ya da 1/N olmayan değer sayı olarak yazılır', () => {
    expect(tezgahSayisi(1)).toBeNull();
    expect(tezgahSayisi(0.4)).toBeNull();
    expect(operatorMetni(0.25)).toBe('1 operatör 4 tezgâha bakar');
    expect(operatorMetni(1.5)).toBe('1,5 operatör/makine');
    expect(operatorMetni(0)).toBe('Operatör gerekmez');
  });

  it('kayıtlı değer listede yoksa seçeneklere eklenir', () => {
    expect(operatorSecenekleri(1).map((x) => x.deger)).toEqual(['0', '0.1', '0.11', '0.12', '0.14', '0.16', '0.2', '0.25', '0.33', '0.5', '1', '2', '3']);
    expect(operatorSecenekleri(0.4).some((x) => x.deger === '0.4' && x.baslik === '0,4 operatör/makine')).toBe(true);
  });
});
