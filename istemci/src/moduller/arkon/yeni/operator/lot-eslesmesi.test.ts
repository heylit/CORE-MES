import { describe, expect, it } from 'vitest';
import type { OkutCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { lotEslesmesi } from './lot-eslesmesi.ts';

// 1908 a: okutulan etiket ile işin rota girdisi. Değerler uydurmadır.
const GIRDILER = [{ malzemeId: 901, kod: 'HM-01', ad: 'Deneme çubuk' }];
const yer = (istasyonId: number | null, partiId: number | null) => ({ konumId: 1, kod: 'K', ad: null, tur: 'istasyon' as const, istasyonId, partiId, partiEtiketi: null, statuId: null, miktar: '5' });
const etiket = (malzemeId: number, ad: string, parti: { id: number; etiket: string } | null, yerler: ReturnType<typeof yer>[] = []): OkutCozCevabi =>
  ({ tur: 'malzeme', malzeme: { id: malzemeId, kod: null, ad, birim: 'adet' }, parti, yerler }) as OkutCozCevabi;

describe('terminalde lot eslesmesi', () => {
  it('rota girdisinin istasyondaki lotu dogrudur', () => {
    expect(lotEslesmesi(GIRDILER, etiket(901, 'Deneme çubuk', { id: 4, etiket: 'LT-000123' }, [yer(7, 4)]), 7))
      .toEqual({ ton: 'run', metin: 'Doğru malzeme: Deneme çubuk · lot LT-000123', malzemeId: 901 });
  });
  it('dogru malzemenin lotu bu istasyonda degilse uyaridir', () => {
    const e = lotEslesmesi(GIRDILER, etiket(901, 'Deneme çubuk', { id: 4, etiket: 'LT-000123' }, [yer(8, 4), yer(7, 5)]), 7);
    expect(e.ton).toBe('hold');
    expect(e.metin).toContain('bu istasyonda görünmüyor');
  });
  it('baska malzeme yanlistir ve isin istedigini soyler', () => {
    expect(lotEslesmesi(GIRDILER, etiket(902, 'Deneme flanş', { id: 9, etiket: 'LT-000777' }), 7))
      .toEqual({ ton: 'stop', metin: 'Yanlış malzeme: Deneme flanş · bu iş Deneme çubuk istiyor', malzemeId: null });
  });
  it('malzeme etiketi lotu bilmez, uyaridir; taninmayan kod yanlistir', () => {
    expect(lotEslesmesi(GIRDILER, etiket(901, 'Deneme çubuk', null), 7).ton).toBe('hold');
    expect(lotEslesmesi(GIRDILER, { tur: 'bilinmiyor', kod: 'LOT:X' }, 7)).toEqual({ ton: 'stop', metin: 'Kod tanınmadı: LOT:X', malzemeId: null });
  });
});
