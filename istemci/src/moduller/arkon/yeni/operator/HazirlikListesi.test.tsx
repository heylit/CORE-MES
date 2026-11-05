import { describe, expect, it } from 'vitest';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { hazirlikOzeti, hazirlikSatirlari } from './HazirlikListesi.tsx';

// 2146-1 a: Üretim Terminali hazırlık listesinde uyaran madde (rota, malzeme, takım ömrü, makine) eksikken iş başlar; çip kırmızı
// "eksik" demez, sarı "uyarı" der. Durduran madde eksikse çip eksik sayar. Veriler uydurmadır.
const cevap = (cnc: 'eksik' | 'tamam', makine: 'eksik' | 'tamam'): HazirlikCevabi => ({
  maddeler: [
    { madde: 'cnc', durum: cnc, muafTutulur: true, isEmriDuzeyi: true },
    { madde: 'cizim', durum: 'gerekmez', muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'malzeme', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: true },
    { madde: 'makine', durum: makine, muafTutulur: false, isEmriDuzeyi: true },
  ],
  muafiyetler: [],
  isEmirleri: [
    { isEmriId: 90, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: cnc }, { madde: 'malzeme', durum: 'tamam' }, { madde: 'makine', durum: makine }] },
  ],
});

describe('Üretim Terminali hazırlık listesi, uyaran maddeler (2146-1 a)', () => {
  it('yalnız uyaran madde eksikse çip uyarı der, eksik saymaz; satır eksikten sonra, tamamdan önce gelir', () => {
    const l = hazirlikSatirlari(cevap('tamam', 'eksik'), 90);
    expect(hazirlikOzeti(l)).toEqual({ ton: 'uyari', simge: 'alert', metin: 'Hazır · 1 uyarı', eksik: 0 });
    expect(l.map((x) => [x.madde, x.hal, x.uyarir])).toEqual([
      ['makine', 'eksik', true], ['cnc', 'tamam', false], ['malzeme', 'tamam', true], ['cizim', 'gerekmez', false],
    ]);
  });

  it('durduran madde eksikse çip eksik sayar; uyarı ondan sonra gelir', () => {
    const l = hazirlikSatirlari(cevap('eksik', 'eksik'), 90);
    expect(hazirlikOzeti(l)).toEqual({ ton: 'hata', simge: 'x', metin: 'Hazırlık · 1 eksik', eksik: 1 });
    expect(l.slice(0, 2).map((x) => x.madde)).toEqual(['cnc', 'makine']);
  });

  it('hepsi tamamsa çip hazır der', () => {
    expect(hazirlikOzeti(hazirlikSatirlari(cevap('tamam', 'tamam'), 90)).metin).toBe('Hazır');
  });
});
