import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Örnek Modül',
  simge: 'cube',
  gruplar: [{ maddeler: [
    { anahtar: 'ana', baslik: 'Genel', yol: '/stok', simge: 'list', islem: 'ornek.oku' },
    { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok/is', simge: 'box', islem: 'ornek.oku' },
  ] }],
};

function ciz() {
  render(
    <MemoryRouter initialEntries={['/stok']}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[MENU]}>
        <p>icerik</p>
      </Kabuk>
    </MemoryRouter>,
  );
}

const ikinci = () => screen.getByRole('navigation', { name: 'Örnek Modül menüsü' });
const kap = () => ikinci().parentElement as HTMLElement;
const kenarlar = () => ({ sol: kap().hasAttribute('data-sol'), sag: kap().hasAttribute('data-sag') });

// jsdom yerleşim yapmaz: şeridin ölçüleri elle verilir, kaydırma olayı elle yollanır.
function olcu(el: HTMLElement, { kap: genislik, icerik, kaydirma }: { kap: number; icerik: number; kaydirma: number }) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: genislik });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: icerik });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: kaydirma });
  act(() => { fireEvent.scroll(el); });
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

const solOk = () => kap().querySelector('.tc-ikinci-ok-sol') as HTMLElement;
const diger = () => kap().querySelector('.tc-ikinci-diger') as HTMLButtonElement | null;
const fare = { pointerType: 'mouse' };

// jsdom işaretçi olayını tanımaz; olayın türü (fare ya da dokunma) taşınabilsin diye en küçük karşılık verilir.
class SahteIsaretciOlayi extends MouseEvent {
  readonly pointerType: string;
  constructor(tur: string, secenek: PointerEventInit = {}) {
    super(tur, secenek);
    this.pointerType = secenek.pointerType ?? '';
  }
}
const asilIsaretci = globalThis.PointerEvent;
beforeAll(() => { if (!asilIsaretci) vi.stubGlobal('PointerEvent', SahteIsaretciOlayi); });
afterAll(() => { vi.unstubAllGlobals(); });

// Kare zamanlayıcısı sahtedir: kenarda bekleme süresi elle ilerletilir.
function sahteKareler() {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
}


describe('Şerit kaydırma işareti', () => {
  it('gizli madde olan kenar işaretlenir: başta sağ, ortada iki kenar, sonda sol', () => {
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 0 });
    expect(kenarlar()).toEqual({ sol: false, sag: true });
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 200 });
    expect(kenarlar()).toEqual({ sol: true, sag: true });
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 400 });
    expect(kenarlar()).toEqual({ sol: true, sag: false });
  });

  it('sol işaret ekran okuyucuya gizlidir ve sekme sırasına girmez', () => {
    ciz();
    const oklar = kap().querySelectorAll('.tc-ikinci-ok');
    expect(oklar).toHaveLength(1);
    for (const ok of oklar) expect(ok.getAttribute('aria-hidden')).toBe('true');
    expect(kap().querySelectorAll('.tc-ikinci-ok button, .tc-ikinci-ok a, .tc-ikinci-ok [tabindex]')).toHaveLength(0);
  });

  it('reddedilen: şerit sığıyorsa hiçbir kenar işaretlenmez', () => {
    ciz();
    olcu(ikinci(), { kap: 700, icerik: 700, kaydirma: 0 });
    expect(kenarlar()).toEqual({ sol: false, sag: false });
  });
});

describe('Diğer listesi (karar 2155-7, 2155-12)', () => {
  // jsdom yerleşim yapmaz: şerit 0-300 arası, ilk madde içeride, ikincisi sağda dışarıdadır.
  function yerlesim() {
    const kutu = { left: 0, right: 300, top: 0, bottom: 40, width: 300, height: 40, x: 0, y: 0, toJSON: () => ({}) };
    ikinci().getBoundingClientRect = () => kutu as DOMRect;
    const [ilk, ikincisi] = [...ikinci().querySelectorAll<HTMLElement>('a')];
    if (ilk) ilk.getBoundingClientRect = () => ({ ...kutu, left: 10, right: 120 }) as DOMRect;
    if (ikincisi) ikincisi.getBoundingClientRect = () => ({ ...kutu, left: 280, right: 420 }) as DOMRect;
  }

  it('sağda gizli madde varken "Diğer N" çıkar; sığan şeritte çıkmaz', () => {
    ciz();
    olcu(ikinci(), { kap: 700, icerik: 700, kaydirma: 0 });
    expect(diger()).toBeNull();
    yerlesim();
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 0 });
    const d = screen.getByRole('button', { name: 'Diğer sekmeler: 1' });
    expect(d.textContent).toContain('Diğer 1');
    expect(d.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('tıklanınca yalnız görünmeyen sekmeler liste olarak açılır; şerit satırlara açılmaz', () => {
    ciz();
    yerlesim();
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Diğer sekmeler: 1' }));
    const liste = screen.getByRole('menu', { name: 'Diğer sekmeler: 1' });
    expect([...liste.querySelectorAll('[role="menuitem"]')].map((o) => o.textContent)).toEqual(['İş kutusu']);
    expect(kap().hasAttribute('data-acik')).toBe(false);
  });

  it('listeden seçilen sekmeye gidilir ve liste kapanır', () => {
    ciz();
    yerlesim();
    olcu(ikinci(), { kap: 300, icerik: 700, kaydirma: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Diğer sekmeler: 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'İş kutusu' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('link', { name: /İş kutusu/ }).getAttribute('aria-current')).toBe('page');
  });
});

describe('Fareyle kaydırma', () => {
  it('fare sol okta bekledikçe şerit sola kayar, çıkınca durur', () => {
    sahteKareler();
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 1000, kaydirma: 700 });
    fireEvent.pointerEnter(solOk(), fare);
    act(() => { vi.advanceTimersByTime(200); });
    const bekledi = ikinci().scrollLeft;
    expect(bekledi).toBeLessThan(700);
    act(() => { vi.advanceTimersByTime(200); });
    expect(ikinci().scrollLeft).toBeLessThan(bekledi);
    fireEvent.pointerLeave(solOk(), fare);
    const cikti = ikinci().scrollLeft;
    act(() => { vi.advanceTimersByTime(500); });
    expect(ikinci().scrollLeft).toBe(cikti);
  });

  it('sol okta sola kayar ve uçta durur, sınırı aşmaz', () => {
    sahteKareler();
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 1000, kaydirma: 100 });
    fireEvent.pointerEnter(solOk(), fare);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(ikinci().scrollLeft).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reddedilen: dokunmada okun üstüne gelmek sürekli kaydırmaz', () => {
    sahteKareler();
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 1000, kaydirma: 300 });
    fireEvent.pointerEnter(solOk(), { pointerType: 'touch' });
    act(() => { vi.advanceTimersByTime(500); });
    expect(ikinci().scrollLeft).toBe(300);
  });

  it('sol oka tıklamak görünen genişliğin dörtte üçü kadar atlatır', () => {
    ciz();
    olcu(ikinci(), { kap: 400, icerik: 2000, kaydirma: 1600 });
    fireEvent.click(solOk());
    expect(ikinci().scrollLeft).toBe(1300);
    fireEvent.click(solOk());
    expect(ikinci().scrollLeft).toBe(1000);
  });

  it('uca atlayış payından az yer kalınca tek tıkta uca gider', () => {
    ciz();
    olcu(ikinci(), { kap: 1080, icerik: 1901, kaydirma: 821 });
    fireEvent.click(solOk());
    expect(ikinci().scrollLeft).toBe(0);
  });

  it('reddedilen: uca bir atlayıştan çok yer varken uca sıçranmaz', () => {
    ciz();
    olcu(ikinci(), { kap: 400, icerik: 2000, kaydirma: 1600 });
    fireEvent.click(solOk());
    expect(ikinci().scrollLeft).toBe(1300);
  });

  it('dikey tekerlek şeridi yana kaydırır ve sayfanın kaymasını tutar', () => {
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 1000, kaydirma: 0 });
    const olay = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => { ikinci().dispatchEvent(olay); });
    expect(ikinci().scrollLeft).toBe(120);
    expect(olay.defaultPrevented).toBe(true);
  });

  it('reddedilen: şerit uçtaysa ya da sığıyorsa tekerlek sayfaya kalır', () => {
    ciz();
    olcu(ikinci(), { kap: 300, icerik: 1000, kaydirma: 700 });
    const uctaki = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => { ikinci().dispatchEvent(uctaki); });
    expect(ikinci().scrollLeft).toBe(700);
    expect(uctaki.defaultPrevented).toBe(false);
    olcu(ikinci(), { kap: 700, icerik: 700, kaydirma: 0 });
    const sigan = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => { ikinci().dispatchEvent(sigan); });
    expect(sigan.defaultPrevented).toBe(false);
  });
});
