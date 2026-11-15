import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { HesapMaddesiBaglami, gorunenUstEylemler, type HesapMaddesiDurumu } from '../../ortak/rota/ust-eylemler.ts';
import { ustEylemler } from './ust-eylem.tsx';
import { vardiyaOzetiAcicisiKaydet } from './yeni/operator/vardiya-ozeti-istegi.ts';

afterEach(cleanup);

// 3298: Vardiya özeti ve devir Hesap menüsündedir; madde yalnız Üretim Terminali görünürken durur, seçilince terminal açar.
function kur() {
  const [eylem] = gorunenUstEylemler(ustEylemler, ['sayfa.uretim-terminali']);
  if (!eylem) throw new Error('Vardiya özeti maddesi görünmüyor');
  const durumlar = new Map<string, HesapMaddesiDurumu | null>();
  const yaz = (anahtar: string, durum: HesapMaddesiDurumu | null) => { durumlar.set(anahtar, durum); };
  const ciz = (acmaIstegi: number) => <HesapMaddesiBaglami.Provider value={yaz}><eylem.dugme acmaIstegi={acmaIstegi} /></HesapMaddesiBaglami.Provider>;
  const r = render(ciz(0));
  return { gizli: () => durumlar.get('vardiya-ozeti')?.gizli, sec: (n: number) => { r.rerender(ciz(n)); } };
}

describe('Hesap menüsünde Vardiya özeti ve devir (3298)', () => {
  it('yalnız terminal sayfasını açabilene bildirilir (reddedilen: sayfa.terminal)', () => {
    expect(gorunenUstEylemler(ustEylemler, ['sayfa.terminal'])).toEqual([]);
    expect(gorunenUstEylemler(ustEylemler, ['sayfa.uretim-terminali']).map((e) => e.anahtar)).toEqual(['vardiya-ozeti']);
  });

  it('görünür terminal yokken madde gizli (reddedilen)', () => {
    expect(kur().gizli()).toBe(true);
  });

  it('terminal kayıtlıyken madde görünür; her seçiş terminalin penceresini bir kez açar; terminal kalkınca yine gizli', () => {
    const ac = vi.fn();
    const m = kur();
    let birak = () => {};
    act(() => { birak = vardiyaOzetiAcicisiKaydet(ac); });
    expect(m.gizli()).toBe(false);
    expect(ac).not.toHaveBeenCalled();
    m.sec(1);
    expect(ac).toHaveBeenCalledTimes(1);
    m.sec(2);
    expect(ac).toHaveBeenCalledTimes(2);
    act(() => { birak(); });
    expect(m.gizli()).toBe(true);
  });
});
