import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { bosIs } from './kurallar.ts';
import { DurumDugmeleri, Konfeti, NumuneSeridi, SayacKadrani, type CevrimOlcer } from './Parcalar.tsx';

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

// T2 ve T5 (526): kalan yalnız sağlamla düşer; işi olmayan istasyonda hedef ve kalan yoktur, durum düğmeleri kapalıdır.
describe('Sayaç kadranı kalan ve boş istasyon', () => {
  it('kalan hedef eksi sağlamdır; hurda kalanı düşürmez', () => {
    const { container } = render(<SayacKadrani is={is({ empty: false, target: 40, good: 38, scrap: 2, cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-kadran-yuzde')?.textContent).toBe('%95 · 2 kaldı');
  });
  it('işi olmayan istasyonda hedef ve kalan "—" görünür', () => {
    const { container } = render(<SayacKadrani is={bosIs({ l: 'Boş' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-kadran-hedef')?.textContent).toBe('/ — adet');
    expect(container.querySelector('.tc-ay1-kadran-yuzde')?.textContent).toBe('—');
    expect(container.textContent).not.toContain('kaldı');
  });
  it('pasifken durum düğmeleri kapalıdır ve eylem çağrılmaz', () => {
    const eylemler: string[] = [];
    const { container } = render(<DurumDugmeleri durum="idle" pasif eylem={(d) => eylemler.push(d.key)} erken={() => {}} />);
    const dugmeler = [...container.querySelectorAll('button')];
    expect(dugmeler.length).toBeGreaterThan(0);
    dugmeler.forEach((b) => { expect(b.disabled).toBe(true); fireEvent.click(b); });
    expect(eylemler).toEqual([]);
  });
  it('iş atanmışken durum düğmeleri açıktır ve eylemi çağırır', () => {
    const eylemler: string[] = [];
    const { container } = render(<DurumDugmeleri durum="idle" eylem={(d) => eylemler.push(d.key)} erken={() => {}} />);
    const b = container.querySelector('button');
    expect(b?.disabled).toBe(false);
    fireEvent.click(b!);
    expect(eylemler.length).toBe(1);
  });
});

describe('Numune planı şeridi (566)', () => {
  const kurallar = [
    { id: 'ilk', etiket: 'İlk parça', olcen: 'Kalite', ilk: true, olculer: [1] },
    { id: 'her', etiket: 'Her 50 parça', olcen: 'Operatör', ilk: false, olculer: [2, 3] },
  ];
  it('kural başına bir satır; durum metinle ve renk adıyla yazılır', () => {
    const { container, getByRole } = render(<NumuneSeridi girdi={{ kurallar, meas: { 2: { ok: true } }, bekleyen: [1], zamani: [], siradaki: { olcu: 2, v: 30, u: 'parça' }, ilkKarar: null }} />);
    expect(getByRole('list', { name: 'Numune planı' })).toBeTruthy();
    const satirlar = Array.from(container.querySelectorAll('.tc-ay1-numune-serit-parca'));
    expect(satirlar.map((x) => x.getAttribute('data-durum'))).toEqual(['bitti', 'sirada']);
    expect(satirlar[0]?.textContent).toContain('Numune kalitede');
    expect(satirlar[1]?.textContent).toContain('Operatör · 1/2 ölçü');
    expect(satirlar[1]?.textContent).toContain('30 parça sonra');
  });
  it('numune planı yoksa çizilmez', () => {
    const { container } = render(<NumuneSeridi girdi={{ kurallar: [], meas: {}, bekleyen: [], zamani: [], siradaki: null, ilkKarar: null }} />);
    expect(container.firstChild).toBeNull();
  });
});
