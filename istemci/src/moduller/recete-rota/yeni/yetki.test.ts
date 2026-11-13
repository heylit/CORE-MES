import { describe, expect, it } from 'vitest';
import { yetkiKur } from '../../../ortak/veri/yetki.ts';
import { emirAcabilir, yetkiHesapla } from './yetki.ts';

const acabilir = (islemler: string[]) => emirAcabilir(yetkiHesapla(yetkiKur(islemler)));

describe('Üretim Emirleri "Yeni üretim emri" düğmesi kimde (3003 a)', () => {
  it('Reçete ve Rota okuyan ve iki açma işleminden birine sahip olan açar', () => {
    expect(acabilir(['sayfa.recete-rota', 'rota.emre-kopyala'])).toBe(true);
    expect(acabilir(['recete-rota.oku', 'uretim-emirleri.rotasiz-ac'])).toBe(true);
  });

  it('açma işlemi olsa da Reçete ve Rota okuyamayan açamaz', () => {
    expect(acabilir(['sayfa.uretim-emirleri', 'rota.emre-kopyala', 'uretim-emirleri.rotasiz-ac'])).toBe(false);
  });

  it('okuyup açma işlemi olmayan açamaz', () => {
    expect(acabilir(['sayfa.recete-rota'])).toBe(false);
  });
});
