import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { baglantiDurumu, baglantiSifirla } from '../../../../ortak/veri/baglanti.ts';
import { ArkonBaglamiKaynagi, type ArkonBaglami } from '../veri/baglam.ts';
import type { ArkonDurumu } from '../veri/depo.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';

beforeEach(() => { baglantiSifirla(); });
afterEach(() => { baglantiSifirla(); });

function sahteDepo(ilk: Partial<ArkonDurumu>) {
  let durum = { mode: 'server', base: null, online: true, pending: 0, baskasi: 0, user: null, err: '', memory: false, kip: 'ortak', ...ilk } as ArkonDurumu;
  const dinleyiciler = new Set<(d: ArkonDurumu) => void>();
  return {
    depo: { status: () => durum, onStatus: (f: (d: ArkonDurumu) => void) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; } },
    yaz(yeni: Partial<ArkonDurumu>) { durum = { ...durum, ...yeni }; for (const f of dinleyiciler) f(durum); },
  };
}

const ac = (depo: unknown) => render(
  <ArkonBaglamiKaynagi.Provider value={{ depo } as unknown as ArkonBaglami}><BaglantiDurumu /><BaglantiDurumu /></ArkonBaglamiKaynagi.Provider>,
);

describe('BaglantiDurumu', () => {
  it('Arkon kuyruğunun bekleyen kaydını kabuk şeridine bir kez bildirir, gidince ulaşan sayar, kapanınca bırakır', () => {
    const s = sahteDepo({ online: false, pending: 2 });
    const ekran = ac(s.depo);
    expect(baglantiDurumu().kuyrukta).toBe(2);
    act(() => { s.yaz({ online: true, pending: 0 }); });
    expect(baglantiDurumu()).toMatchObject({ kuyrukta: 0, ulasan: 2 });
    ekran.unmount();
    expect(baglantiDurumu().kuyrukta).toBe(0);
  });

  it('yerel kipte kuyruk bildirilmez', () => {
    ac(sahteDepo({ mode: 'local', pending: 3 }).depo);
    expect(baglantiDurumu().kuyrukta).toBe(0);
  });
});
