import { describe, expect, it } from 'vitest';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { MADDE_SIRASI } from './HazirlikTakibi.tsx';
import { eksikMaddeler } from './TakipTablosu.tsx';
import type { HazirlikSatiri } from '../operator/HazirlikListesi.tsx';

const satir = (madde: HazirlikMaddesi, hal: HazirlikSatiri['hal'], uyarir = false): HazirlikSatiri => ({ madde, hal, isEmriDuzeyi: false, muafTutulur: false, uyarir, muaf: null });

describe('3606-2: listede eksik madde çipleri', () => {
  it('sıra kaydı madde bilgisindeki bütün maddeleri kapsar; durduranlar önce', () => {
    expect(Object.keys(MADDE_SIRASI).sort()).toEqual(Object.keys(HAZIRLIK_MADDE_BILGISI).sort());
    const sirali = Object.entries(MADDE_SIRASI).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    expect(sirali.slice(0, 3)).toEqual(['cnc', 'cizim', 'yayin']);
    expect(new Set(Object.values(MADDE_SIRASI)).size).toBe(sirali.length);
  });

  it('yalnız eksik maddeler gelir; durduranlar uyarılılardan önce, kendi içinde sabit sırayla', () => {
    const l = eksikMaddeler([
      satir('aparat', 'eksik', true), satir('olcu-aleti', 'eksik'), satir('cizim', 'eksik'), satir('rota', 'muaf'),
      satir('cnc', 'tamam'), satir('malzeme', 'bilinmiyor'), satir('makine', 'gerekmez'),
    ]);
    expect(l).toEqual([{ madde: 'cizim', durdurur: true }, { madde: 'olcu-aleti', durdurur: true }, { madde: 'aparat', durdurur: false }]);
  });

  it('hepsi tamamsa boş', () => {
    expect(eksikMaddeler([satir('cnc', 'tamam'), satir('cizim', 'tamam')])).toEqual([]);
  });
});
