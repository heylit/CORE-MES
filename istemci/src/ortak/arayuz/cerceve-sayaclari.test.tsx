import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { CERCEVE_KANALI, CERCEVE_SURUMU } from '../rota/cerceve-iletisi.ts';
import { useCerceveGorunumu, useYalitilmisGorunum } from '../rota/cerceve-gorunumu.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';
import { YalitilmisCerceve } from './YalitilmisCerceve.tsx';

// Menü var olan bir sayfaya bağlanır: kabuk menüyü yalnız kullanıcının gördüğü sayfada açar.
const KOK = '/stok';
const MENU: IkinciMenu = {
  kok: KOK,
  baslik: 'Örnek Modül',
  simge: 'cube',
  cerceveli: true,
  sayacUcu: '/ornek/menu-sayaclari',
  gruplar: [{ maddeler: [
    { anahtar: 'ana', baslik: 'Genel', yol: '/stok', simge: 'list', islem: 'ornek.oku' },
    { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok/is', simge: 'box', islem: 'ornek.oku' },
    { anahtar: 'tur', baslik: 'Türler', yol: '/stok/tur', simge: 'grid', islem: 'ornek.oku' },
  ] }],
};
const SAYFA = '<!doctype html><html><head></head><body></body></html>';
const sayacIletisi = (sayaclar: unknown) => ({ kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU, tip: 'sayaclar', sayaclar });

// `kok`: köprünün bağlandığı menü; açık menüden farklıysa sayılar o menüye ait sayılmaz.
function Cerceve({ kok }: { kok: `/${string}` }) {
  const gorunumIletisi = useYalitilmisGorunum(kok, [MENU, { ...MENU, kok }]);
  return <YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} iletiGeldi={(veri, yanitla) => { gorunumIletisi(veri, yanitla); }} />;
}

// Kendi kökeninden sunulan (yalıtılmamış) çerçeve: köprü useCerceveGorunumu ile kurulur.
function AdresliCerceve() {
  const cerceve = useRef<HTMLIFrameElement>(null);
  useCerceveGorunumu({ cerceve, kok: KOK, menuler: [MENU] });
  return <iframe ref={cerceve} title="Örnek" />;
}

function Sayfa({ kok, adresli }: { kok: `/${string}`; adresli: boolean }) {
  const [acik, acikYaz] = useState(true);
  return (
    <>
      <button type="button" onClick={() => acikYaz(false)}>cerceveyi kapat</button>
      {acik && (adresli ? <AdresliCerceve /> : <Cerceve kok={kok} />)}
    </>
  );
}

function ciz({ kok = KOK, adresli = false }: { kok?: `/${string}`; adresli?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={[KOK]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[MENU]}>
        <Link to="/kuyruk">kuyruga</Link>
        <Link to={KOK}>stoga</Link>
        <Routes>
          <Route path="/stok/*" element={<Sayfa kok={kok} adresli={adresli} />} />
          <Route path="*" element={<p>baska sayfa</p>} />
        </Routes>
      </Kabuk>
    </MemoryRouter>,
  );
}

// Yalıtılmış çerçevenin iletisi: köken opaktır, kaynak çerçevenin penceresidir.
function cercevedenIlet(veri: unknown, origin = 'null') {
  const pencere = (screen.getByTitle('Örnek') as HTMLIFrameElement).contentWindow as Window;
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: veri, origin, source: pencere })); });
}

const menu = () => screen.getByRole('navigation', { name: 'Örnek Modül menüsü' });
const sayi = (ad: string) => within(menu()).getByRole('link', { name: new RegExp(ad) }).querySelector('.tc-ikinci-sayi')?.textContent ?? null;
const tikla = (ad: string) => act(() => { screen.getByRole('link', { name: ad }).click(); });

let sunucu: IkinciMenuSayaclari;
beforeEach(() => {
  localStorage.clear();
  sunucu = { is: 7 };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sunucu), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('Kabuk: çerçeveden gelen ikinci menü sayaçları', () => {
  it('çerçevenin sayıları sunucunun sayılarının yerine menüde aynı biçimde çizilir; biçimsiz ileti sayıları değiştirmez', async () => {
    ciz();
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4, is: null }));
    expect(sayi('Türler')).toBe('4');
    expect(sayi('İş kutusu')).toBeNull();
    cercevedenIlet(sayacIletisi({ tur: -4 }));
    expect(sayi('Türler')).toBe('4');
  });

  it('başka pencereden gelen sayaç iletisi menüye geçmez', async () => {
    ciz();
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: sayacIletisi({ tur: 4 }), origin: 'null', source: window })); });
    expect(sayi('Türler')).toBeNull();
    expect(sayi('İş kutusu')).toBe('7');
  });

  it('sayfa değişince çerçevenin sayıları silinir; geri dönülünce sunucunun sayıları görünür', async () => {
    ciz();
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4 }));
    expect(sayi('Türler')).toBe('4');
    tikla('kuyruga');
    expect(screen.queryByRole('navigation', { name: 'Örnek Modül menüsü' })).toBeNull();
    sunucu = { is: 2 };
    tikla('stoga');
    await waitFor(() => expect(sayi('İş kutusu')).toBe('2'));
    expect(sayi('Türler')).toBeNull();
  });

  it('çerçeve kalkınca sayfa değişmeden de sayıları silinir; sunucunun sayıları geri gelir', async () => {
    ciz();
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4 }));
    expect(sayi('Türler')).toBe('4');
    act(() => { screen.getByRole('button', { name: 'cerceveyi kapat' }).click(); });
    expect(screen.queryByTitle('Örnek')).toBeNull();
    expect(sayi('Türler')).toBeNull();
    expect(sayi('İş kutusu')).toBe('7');
  });

  it('köprü başka menünün köküne bağlıysa sayıları açık menüye geçmez; menüde sunucunun sayıları kalır', async () => {
    ciz({ kok: '/baska' });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4 }));
    expect(sayi('Türler')).toBeNull();
    expect(sayi('İş kutusu')).toBe('7');
  });

  it('kendi kökeninden sunulan çerçevenin (useCerceveGorunumu) sayıları da menüye geçer', async () => {
    ciz({ adresli: true });
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4 }), window.location.origin);
    expect(sayi('Türler')).toBe('4');
    expect(sayi('İş kutusu')).toBeNull();
  });

  it('aynı içerikli yeni sayaç iletisi menüyü yeniden kaydırmaz; değişen sayı kaydırır', async () => {
    const kaydir = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: kaydir });
    ciz();
    await waitFor(() => expect(sayi('İş kutusu')).toBe('7'));
    cercevedenIlet(sayacIletisi({ tur: 4, is: null }));
    expect(sayi('Türler')).toBe('4');
    const once = kaydir.mock.calls.length;
    expect(once).toBeGreaterThan(0);
    cercevedenIlet(sayacIletisi({ is: null, tur: 4 }));
    expect(kaydir).toHaveBeenCalledTimes(once);
    cercevedenIlet(sayacIletisi({ tur: 5, is: null }));
    expect(sayi('Türler')).toBe('5');
    expect(kaydir.mock.calls.length).toBeGreaterThan(once);
  });
});
