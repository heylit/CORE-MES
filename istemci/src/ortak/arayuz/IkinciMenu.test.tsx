import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { SAYAC_ARALIGI_MS } from '../veri/ikinci-menu-sayaclari.ts';
import { Kabuk } from './Kabuk.tsx';

// Menü var olan bir sayfaya bağlanır: kabuk menüyü yalnız kullanıcının gördüğü sayfada açar.
const KOK = '/stok';
const MENU: IkinciMenu = {
  kok: KOK,
  baslik: 'Örnek Modül',
  simge: 'cube',
  gruplar: [
    { maddeler: [
      { anahtar: 'ana', baslik: 'Genel', yol: '/stok', simge: 'list', islem: 'ornek.oku' },
      { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok/is', simge: 'box', islem: 'ornek.oku' },
    ] },
    { baslik: 'Tanımlar', maddeler: [{ anahtar: 'tur', baslik: 'Türler', yol: '/stok/tur', simge: 'grid', islem: 'ornek.tanim' }] },
    { baslik: 'Sistem', maddeler: [{ anahtar: 'ayar', baslik: 'Ayarlar', yol: '/stok/ayar', simge: 'wrench', islem: 'ornek.yonet' }] },
  ],
};
const SAYACLI: IkinciMenu = { ...MENU, sayacUcu: '/ornek/menu-sayaclari' };
const HEPSI = ['ornek.oku', 'ornek.tanim', 'ornek.yonet'];

interface Secenek {
  adres?: string;
  islemler?: readonly string[];
  menu?: IkinciMenu;
  sayfalar?: readonly Sayfa[];
}

function ciz({ adres = KOK, islemler = HEPSI, menu = MENU, sayfalar = SAYFALAR }: Secenek = {}) {
  return render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={sayfalar} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ikinciMenuler={[menu]}>
        <p>icerik</p>
      </Kabuk>
    </MemoryRouter>,
  );
}

const ikinci = () => screen.getByRole('navigation', { name: 'Örnek Modül menüsü' });
const ikinciYok = () => screen.queryByRole('navigation', { name: 'Örnek Modül menüsü' });
const kabuk = () => document.querySelector('.tc-kabuk') as HTMLElement;
const maddeler = () => within(ikinci()).getAllByRole('link').map((b) => b.getAttribute('href'));
const etkin = () => within(ikinci()).getAllByRole('link').filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.getAttribute('href'));

function sayacSunucusu(cevap: () => Response | Promise<Response>) {
  const cagri = vi.fn(async (_adres: string) => cevap());
  vi.stubGlobal('fetch', cagri);
  return cagri;
}
const sayilar = (govde: IkinciMenuSayaclari) => () => new Response(JSON.stringify(govde), { status: 200 });
const gorunurluk = (durum: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => durum });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('Kabuk: ikinci menü', () => {
  it('modülün sayfasında ikinci menü açılır: başlık, gruplar ve maddeler tanımdaki sırayla; içerik yanında', () => {
    ciz();
    expect(maddeler()).toEqual(['/stok', '/stok/is', '/stok/tur', '/stok/ayar']);
    // Sekme şerididir: açma, kapama ya da sabitleme düğmesi yoktur.
    expect(within(ikinci()).queryByRole('button')).toBeNull();
    expect(within(ikinci()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Tanımlar', 'Sistem']);
    expect(within(within(ikinci()).getByRole('group', { name: 'Sistem' })).getByRole('link', { name: 'Ayarlar' })).toBeTruthy();
    expect(screen.getByText('icerik')).toBeTruthy();
    // Ana menü yerinde kalır: modüller arasında geçiş oradan.
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Stok Merkezi' })).toBeTruthy();
  });

  it('kullanıcının işlemi olmayan madde ve maddesi kalmayan grup görünmez; işlemi olanlar görünür', () => {
    ciz({ islemler: ['ornek.oku', 'ornek.yonet'] });
    expect(maddeler()).toEqual(['/stok', '/stok/is', '/stok/ayar']);
    expect(within(ikinci()).queryByRole('link', { name: 'Türler' })).toBeNull();
    expect(within(ikinci()).queryByRole('group', { name: 'Tanımlar' })).toBeNull();
    expect(ikinci().textContent).not.toContain('Tanımlar');
    expect(within(ikinci()).getByRole('group', { name: 'Sistem' })).toBeTruthy();
  });

  it('hiç maddesi kalmayan menü hiç açılmaz ve ana menü daralmaz', () => {
    ciz({ islemler: ['baska.islem'] });
    expect(screen.getByText('icerik')).toBeTruthy();
    expect(ikinciYok()).toBeNull();
    expect(kabuk().hasAttribute('data-ikinci')).toBe(false);
  });

  it('menü yalnız kendi sayfasında ve kullanıcı o sayfayı görüyorsa açılır', () => {
    const { unmount: baskaKapat } = ciz({ adres: '/rota' });
    expect(ikinciYok()).toBeNull();
    expect(kabuk().hasAttribute('data-ikinci')).toBe(false);
    baskaKapat();
    const { unmount: altKapat } = ciz({ adres: '/stok/is/7' });
    expect(ikinciYok()).not.toBeNull();
    altKapat();
    ciz({ sayfalar: SAYFALAR.filter((s) => s.yol !== KOK) });
    expect(ikinciYok()).toBeNull();
  });

  it('etkin madde adresten bulunur: en uzun önek; kök maddesi başka maddeye düşmeyen alt adreste etkindir', () => {
    const { unmount: kokKapat } = ciz({ adres: '/stok' });
    expect(etkin()).toEqual(['/stok']);
    kokKapat();
    const { unmount: altKapat } = ciz({ adres: '/stok/is/7' });
    expect(etkin()).toEqual(['/stok/is']);
    altKapat();
    const { unmount: benzerKapat } = ciz({ adres: '/stok/isler' });
    expect(etkin()).toEqual(['/stok']);
    benzerKapat();
    // Etkin madde süzülmüşse onun yerine kök maddesi etkin olur, görünmeyen madde değil.
    ciz({ adres: '/stok/tur', islemler: ['ornek.oku'] });
    expect(etkin()).toEqual(['/stok']);
  });

  it('maddeye tıklanınca adres değişir ve etkin madde o olur', () => {
    ciz();
    fireEvent.click(within(ikinci()).getByRole('link', { name: 'Türler' }));
    expect(etkin()).toEqual(['/stok/tur']);
  });

  it('ikinci menü başlığın altında sekme şerididir; menüsüz sayfaya geçince kalkar ve ana menü değişmez', () => {
    ciz();
    expect(kabuk().hasAttribute('data-ikinci')).toBe(true);
    const anaMenu = screen.getByRole('navigation', { name: 'Ana menü' });
    // Ana menüde tek düğme masaüstü daraltmasıdır (682 a); ikinci menü ana menüye açılır grup eklemez.
    expect(within(anaMenu).getAllByRole('button').map((d) => d.getAttribute('aria-label'))).toEqual(['Menüyü daralt']);
    fireEvent.click(within(anaMenu).getByRole('link', { name: 'Reçete ve Rota' }));
    expect(ikinciYok()).toBeNull();
    expect(kabuk().hasAttribute('data-ikinci')).toBe(false);
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBe(anaMenu);
  });

  it('ok tuşları odağı maddeler arasında gezdirir; Home ve End uçlara götürür', () => {
    ciz();
    const baglar = within(ikinci()).getAllByRole('link');
    const odak = () => baglar.indexOf(document.activeElement as HTMLElement);
    baglar[0]?.focus();
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(odak()).toBe(1);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(odak()).toBe(2);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    expect(odak()).toBe(1);
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(odak()).toBe(3);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(odak()).toBe(0);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(odak()).toBe(3);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(odak()).toBe(0);
  });

  it('çerçeveli modülde içerik alanı boşluksuz işaretlenir; öbürlerinde işaret yok', () => {
    const { unmount } = ciz();
    expect(screen.getByRole('main').hasAttribute('data-cerceveli')).toBe(false);
    unmount();
    ciz({ menu: { ...MENU, cerceveli: true } });
    expect(screen.getByRole('main').hasAttribute('data-cerceveli')).toBe(true);
  });

  it('islemler verilmeyen kabukta ikinci menü açılmaz', () => {
    render(
      <MemoryRouter initialEntries={[KOK]}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} ikinciMenuler={[MENU]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    expect(screen.getByText('icerik')).toBeTruthy();
    expect(ikinciYok()).toBeNull();
  });
});

describe('Kabuk: ikinci menü sayaçları', () => {
  const sayi = (ad: string) => within(ikinci()).getByRole('link', { name: new RegExp(ad) }).querySelector('.tc-ikinci-sayi')?.textContent ?? null;

  it('sayaç ucu tek çağrıyla okunur; sayı maddenin yanında, null, eksik ve sıfır olan maddede sayı yok', async () => {
    const cagri = sayacSunucusu(sayilar({ is: 3, tur: null, ayar: 0 }));
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('3'));
    expect(cagri.mock.calls.map((c) => c[0])).toEqual(['/api/ornek/menu-sayaclari']);
    expect(sayi('Türler')).toBeNull();
    expect(sayi('Ayarlar')).toBeNull();
    expect(sayi('Genel')).toBeNull();
  });

  it('sayaç ucu hata verirse sayı gösterilmez, sıfır da yazılmaz; menü çalışır', async () => {
    const cagri = sayacSunucusu(() => new Response(JSON.stringify({ kod: 'SUNUCU', mesaj: 'Hata' }), { status: 500 }));
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(cagri).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(ikinci().querySelector('.tc-ikinci-sayi')).toBeNull();
    expect(maddeler()).toEqual(['/stok', '/stok/is', '/stok/tur', '/stok/ayar']);
    fireEvent.click(within(ikinci()).getByRole('link', { name: 'Türler' }));
    expect(etkin()).toEqual(['/stok/tur']);
  });

  it('önce gelen sayı sonraki okuma hata verince kalkar; sözleşmeye uymayan cevap sayı sayılmaz', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let cevap: () => Response = sayilar({ is: 3 });
    sayacSunucusu(() => cevap());
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('3'));
    cevap = () => new Response('', { status: 503 });
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('İş kutusu')).toBeNull());
    cevap = () => new Response(JSON.stringify({ is: '5', tur: -1, ayar: 2 }), { status: 200 });
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('Ayarlar')).toBe('2'));
    expect(sayi('İş kutusu')).toBeNull();
    expect(sayi('Türler')).toBeNull();
  });

  it('sayaç ucu bildirmeyen menüde sunucu çağrılmaz', async () => {
    const cagri = sayacSunucusu(sayilar({ is: 3 }));
    ciz();
    await act(async () => { await Promise.resolve(); });
    expect(ikinci()).toBeTruthy();
    expect(cagri).not.toHaveBeenCalled();
  });

  it('sayılar aralıkla yenilenir; sayfa görünmezken çağrılmaz, yeniden görününce beklemeden okunur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let n = 1;
    const cagri = sayacSunucusu(() => sayilar({ is: n })());
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('1'));
    n = 2;
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('2'));
    expect(cagri).toHaveBeenCalledTimes(2);

    gorunurluk('hidden');
    n = 3;
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS * 3); });
    expect(cagri).toHaveBeenCalledTimes(2);
    expect(sayi('İş kutusu')).toBe('2');

    gorunurluk('visible');
    await waitFor(() => expect(sayi('İş kutusu')).toBe('3'));
    expect(cagri).toHaveBeenCalledTimes(3);
  });

  it('cevap vermeyen sayaç ucu zaman aşımıyla bırakılır; sonraki aralıkta yeniden okunur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let cevapVer = false;
    const cagri = vi.fn((_adres: string, secenek?: RequestInit) => (cevapVer
      ? Promise.resolve(sayilar({ is: 4 })())
      : new Promise<Response>((_coz, red) => {
        secenek?.signal?.addEventListener('abort', () => { red(new DOMException('kesildi', 'AbortError')); });
      })));
    vi.stubGlobal('fetch', cagri);
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(cagri).toHaveBeenCalledTimes(1));
    cevapVer = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('4'));
    expect(cagri).toHaveBeenCalledTimes(2);
  });

  it('sayılar değişmeden yenilenince şerit etkin maddeye geri kaydırılmaz; değişince yer yeniden bulunur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const kaydir = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: kaydir });
    try {
      let n = 1;
      const cagri = sayacSunucusu(() => sayilar({ is: n, tur: null })());
      ciz({ menu: SAYACLI });
      await waitFor(() => expect(sayi('İş kutusu')).toBe('1'));
      const ilk = kaydir.mock.calls.length;
      expect(ilk).toBeGreaterThan(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
      await waitFor(() => expect(cagri).toHaveBeenCalledTimes(2));
      await act(async () => { await Promise.resolve(); });
      expect(kaydir.mock.calls.length).toBe(ilk);
      n = 2;
      await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
      await waitFor(() => expect(sayi('İş kutusu')).toBe('2'));
      expect(kaydir.mock.calls.length).toBe(ilk + 1);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('kullanıcı şeridi kaydırdıktan sonra sayı değişince şerit geri çekilmez; başka maddeye geçince yer yeniden bulunur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const kaydir = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: kaydir });
    try {
      let n = 1;
      sayacSunucusu(() => sayilar({ is: n, tur: null })());
      ciz({ menu: SAYACLI });
      await waitFor(() => expect(sayi('İş kutusu')).toBe('1'));
      fireEvent.wheel(ikinci(), { deltaY: 120 });
      const ilk = kaydir.mock.calls.length;
      n = 2;
      await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
      await waitFor(() => expect(sayi('İş kutusu')).toBe('2'));
      expect(kaydir.mock.calls.length).toBe(ilk);
      fireEvent.click(within(ikinci()).getByRole('link', { name: /Türler/ }));
      expect(kaydir.mock.calls.length).toBe(ilk + 1);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('yeni okumada eklenen anahtarın sayısı görünür, kalkan anahtarın sayısı kalkar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let govde: IkinciMenuSayaclari = { is: 1 };
    sayacSunucusu(() => sayilar(govde)());
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('1'));
    govde = { is: 1, tur: 5 };
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('Türler')).toBe('5'));
    govde = { tur: 5 };
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS); });
    await waitFor(() => expect(sayi('İş kutusu')).toBeNull());
    expect(sayi('Türler')).toBe('5');
  });

  it('menü kapanınca sayaç okuması durur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const cagri = sayacSunucusu(sayilar({ is: 1 }));
    ciz({ menu: SAYACLI });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('1'));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Reçete ve Rota' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(SAYAC_ARALIGI_MS * 2); });
    expect(cagri).toHaveBeenCalledTimes(1);
  });
});
