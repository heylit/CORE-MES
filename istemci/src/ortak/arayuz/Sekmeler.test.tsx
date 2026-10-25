import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sekmeler } from './Sekmeler.tsx';

afterEach(cleanup);

const SEKMELER = [
  { anahtar: 'a', baslik: 'Birinci' }, { anahtar: 'b', baslik: 'İkinci' }, { anahtar: 'c', baslik: 'Üçüncü' },
] as const;

function ciz() {
  render(<Sekmeler etiket="Örnek" sekmeler={SEKMELER} secili="a" sec={() => undefined} />);
  return screen.getByRole('tablist', { name: 'Örnek' });
}

// jsdom yerleşim yapmaz: şeridin ölçüleri elle verilir, kaydırma olayı elle yollanır.
function olcu(el: HTMLElement, { kap, icerik, kaydirma }: { kap: number; icerik: number; kaydirma: number }) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: kap });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: icerik });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: kaydirma });
  act(() => { fireEvent.scroll(el); });
}
const kenarlar = (el: HTMLElement) => ({ sol: el.hasAttribute('data-sol'), sag: el.hasAttribute('data-sag') });

describe('Sekmeler sayı rozeti', () => {
  it('sayısı sıfırdan büyük sekmede rozet çizilir, ad sayıyı taşır; sayısız ve sıfırda rozet yok', () => {
    render(<Sekmeler etiket="Sayılı" sekmeler={[{ anahtar: 'a', baslik: 'Gelen', sayi: 3 }, { anahtar: 'b', baslik: 'Boş', sayi: 0 }, { anahtar: 'c', baslik: 'Düz' }]} secili="a" sec={() => undefined} />);
    expect(screen.getByRole('tab', { name: 'Gelen (3)' }).querySelector('.tc-sekme-sayi')?.textContent).toBe('3');
    expect(screen.getByRole('tab', { name: 'Boş' }).querySelector('.tc-sekme-sayi')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Düz' }).querySelector('.tc-sekme-sayi')).toBeNull();
  });
});

describe('Sekmeler kaydırma işareti', () => {
  it('taşmayan şeritte işaret yok; gizli sekme olan kenar işaretlenir', () => {
    const serit = ciz();
    olcu(serit, { kap: 300, icerik: 300, kaydirma: 0 });
    expect(kenarlar(serit)).toEqual({ sol: false, sag: false });
    olcu(serit, { kap: 300, icerik: 700, kaydirma: 0 });
    expect(kenarlar(serit)).toEqual({ sol: false, sag: true });
    olcu(serit, { kap: 300, icerik: 700, kaydirma: 400 });
    expect(kenarlar(serit)).toEqual({ sol: true, sag: false });
  });

  it('işaret ekran okuyucuya gizli, sekme sayılmaz ve sekme sırasına girmez', () => {
    const serit = ciz();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    const oklar = serit.querySelectorAll('.tc-sekmeler-ok');
    expect(oklar).toHaveLength(2);
    for (const ok of oklar) {
      expect(ok.getAttribute('aria-hidden')).toBe('true');
      expect(ok.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('oka tıklamak bir sayfa atlatır; kalan kısa ise uca gider, öbür yöne geçmez', () => {
    const serit = ciz();
    olcu(serit, { kap: 400, icerik: 1300, kaydirma: 0 });
    fireEvent.click(serit.querySelector('.tc-sekmeler-ok-sag') as HTMLElement);
    expect(serit.scrollLeft).toBe(300);
    fireEvent.click(serit.querySelector('.tc-sekmeler-ok-sag') as HTMLElement);
    expect(serit.scrollLeft).toBe(600);
    fireEvent.click(serit.querySelector('.tc-sekmeler-ok-sag') as HTMLElement);
    expect(serit.scrollLeft).toBe(900);
    fireEvent.click(serit.querySelector('.tc-sekmeler-ok-sol') as HTMLElement);
    expect(serit.scrollLeft).toBe(600);
  });

  it('dikey tekerlek şeridi yana kaydırır; uçta sayfaya bırakır', () => {
    const serit = ciz();
    olcu(serit, { kap: 300, icerik: 500, kaydirma: 0 });
    const ileri = new WheelEvent('wheel', { deltaY: 120, cancelable: true });
    serit.dispatchEvent(ileri);
    expect(serit.scrollLeft).toBe(120);
    expect(ileri.defaultPrevented).toBe(true);
    olcu(serit, { kap: 300, icerik: 500, kaydirma: 200 });
    const uc = new WheelEvent('wheel', { deltaY: 120, cancelable: true });
    serit.dispatchEvent(uc);
    expect(uc.defaultPrevented).toBe(false);
  });
});
