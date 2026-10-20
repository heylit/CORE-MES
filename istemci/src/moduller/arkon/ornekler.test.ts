import { describe, expect, it } from 'vitest';
import { gorunenOrnekler, ornekCizimGorunur, ornekHazir } from '../../../../arkon/web/src/data/ornekler.ts';

const ORNEKLER = [
  { id: 'demo', kind: 'demo' },
  { id: 'smp-pdf', kind: 'pdf' },
  { id: 'smp-step-fln', kind: 'step' },
];

// Örnek dosyalar depoda yok (TB2): verisi sayfada olmayan örnek düğmesi gösterilmez.
describe('Arkon örnek dosya düğmeleri (TB2)', () => {
  it('izinli: verisi sayfada olan örnek listede; dosyasız yerleşik çizim her zaman', () => {
    const veri = new Set(['smp-pdf']);
    expect(gorunenOrnekler(ORNEKLER, (id) => veri.has(id)).map((s) => s.id)).toEqual(['demo', 'smp-pdf']);
    expect(ornekHazir(['smp-pdf'], (id) => veri.has(id))).toBe(true);
  });

  it('ret: verisi olmayan örnek düğmesi yok; ikili örnek biri eksikse yok', () => {
    expect(gorunenOrnekler(ORNEKLER, () => false).map((s) => s.id)).toEqual(['demo']);
    const veri = new Set(['smp-pdf']);
    expect(ornekHazir(['smp-pdf', 'smp-step-fln'], (id) => veri.has(id))).toBe(false);
  });
});

// Demo bulgusu: boş istasyonda operatör ekranı prototipteki FLN-120 çizimini gösteriyordu.
describe('operatör ekranında örnek çizim', () => {
  it('TMI\'ye bağlı Arkon\'da iş yokken ya da doküman yokken örnek çizilmez', () => {
    expect(ornekCizimGorunur(true, false, false)).toBe(false);
    expect(ornekCizimGorunur(true, true, true)).toBe(false);
    expect(ornekCizimGorunur(false, true, true)).toBe(false);
  });
  it('yalnız TMI\'siz tanıtım kipinde, iş yokken örnek kalır', () => expect(ornekCizimGorunur(false, false, false)).toBe(true));
});
