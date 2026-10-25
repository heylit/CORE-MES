import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { bosIs } from './kurallar.ts';
import { Konfeti, SayacKadrani, type CevrimOlcer } from './Parcalar.tsx';

// Eski kadranın dönen çevrim ışığı ve iş bitince konfeti (283.19 geri getirme).

afterEach(() => { cleanup(); });

const olcer = (gecen: number): CevrimOlcer => ({ gecen: () => gecen, son: () => 0, sayac: () => 0 });
const is = (ek: Partial<ReturnType<typeof bosIs>>) => ({ ...bosIs({ l: 'Deneme' }), target: 10, good: 2, cycle: 30, ...ek });

describe('Sayaç kadranı çevrim ışığı', () => {
  it('çalışan işte döner, çevrim süresi değişkenle verilir', () => {
    const { container } = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(5000)} />);
    expect(container.querySelector('.tc-ay1-kadran')?.hasAttribute('data-calisiyor')).toBe(true);
    const yay = container.querySelector<SVGElement>('.tc-ay1-cevrim-yay');
    expect(yay?.style.getPropertyValue('--tc-ay1-cevrim-sure')).toBe('30s');
    expect(yay?.style.getPropertyValue('--tc-ay1-cevrim-baslangic')).toBe('-5s');
    expect(yay?.hasAttribute('data-gec')).toBe(false);
  });
  it('süre aşılınca gecikme işareti alır; duraklayınca dönmez', () => {
    const gec = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(40000)} />);
    expect(gec.container.querySelector('.tc-ay1-cevrim-yay')?.hasAttribute('data-gec')).toBe(true);
    cleanup();
    const dur = render(<SayacKadrani is={is({ state: 'paused' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(5000)} />);
    expect(dur.container.querySelector('.tc-ay1-kadran')?.hasAttribute('data-calisiyor')).toBe(false);
  });
  it('çevrim süresi yoksa ışık çizilmez', () => {
    const { container } = render(<SayacKadrani is={is({ state: 'running', cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-cevrim')).toBeNull();
  });
});

describe('Konfeti', () => {
  it('70 parça, her biri kendi yeri ve süresiyle sayfanın üstüne düşer', () => {
    render(<Konfeti />);
    const parcalar = document.body.querySelectorAll<HTMLElement>('.tc-ay1-konfeti > i');
    expect(parcalar.length).toBe(70);
    expect(parcalar[0]?.style.getPropertyValue('--x')).toMatch(/%$/);
    expect(parcalar[0]?.style.getPropertyValue('--sure')).toMatch(/s$/);
  });
});
