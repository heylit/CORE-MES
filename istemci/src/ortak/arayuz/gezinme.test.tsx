import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [
    { maddeler: [
      { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'ornek.oku' },
      { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'ornek.oku' },
    ] },
    { baslik: 'Sistem', maddeler: [{ anahtar: 'ayar', baslik: 'Ayarlar', yol: '/stok/ayar', simge: 'gear', islem: 'ornek.yonet' }] },
  ],
};

// Kayıt araması `kayit-aramasi.test.tsx`'te ölçülür; burada yalnız sayfa ve menü araması vardır.
const SAYFALAR_ARAMASIZ = SAYFALAR.map((s) => {
  const { aramaUcu: _uc, ...kalan } = s as Sayfa & { aramaUcu?: string };
  return kalan;
}) as readonly Sayfa[];

function Adres() {
  return <output data-testid="adres">{useLocation().pathname}</output>;
}

// Kendi Ctrl K'sı olan modül sayfası (stokun araması gibi).
function KendiAramasi({ acildi }: { acildi: () => void }) {
  useEffect(() => {
    const tus = (o: KeyboardEvent) => { if (o.ctrlKey && o.key === 'k') { o.preventDefault(); acildi(); } };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, [acildi]);
  return null;
}

function ciz(adres = '/', islemler: readonly string[] = ['ornek.oku'], ek: React.ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR_ARAMASIZ} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ikinciMenuler={[MENU]}>
        <Adres />
        {ek}
      </Kabuk>
    </MemoryRouter>,
  );
}

const ust = () => within(screen.getByRole('banner'));
const geri = () => ust().getByRole('button', { name: /^Geri/ });
const ileri = () => ust().getByRole('button', { name: /^İleri/ });
const adres = () => screen.getByTestId('adres').textContent;
const anaMenudenAc = (ad: string) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: ad })); };
const kutu = () => ust().getByRole('combobox', { name: 'Sayfa ya da menü ara' });
const yaz = (metin: string) => { fireEvent.change(kutu(), { target: { value: metin } }); };
const sonuclar = () => screen.queryAllByRole('option').map((s) => s.textContent);

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Geri ve İleri', () => {
  it('ilk sayfada ikisi de pasif; uygulamanın dışına geri gidilmez', () => {
    ciz();
    expect(geri().hasAttribute('disabled')).toBe(true);
    expect(ileri().hasAttribute('disabled')).toBe(true);
  });

  it('gezinince geri hedefin adını söyler; geri ve ileri tarayıcı geçmişinde yürür', () => {
    ciz();
    anaMenudenAc('Reçete ve Rota');
    anaMenudenAc('Stok Merkezi');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Stok Merkezi menüsü' })).getByRole('link', { name: 'Okut' }));
    expect(adres()).toBe('/stok/okut');
    expect(geri().getAttribute('aria-label')).toBe('Geri: Stok Merkezi › İş kutusu');
    fireEvent.click(geri());
    expect(adres()).toBe('/stok');
    fireEvent.click(geri());
    expect(adres()).toBe('/recete-rota');
    expect(ileri().getAttribute('aria-label')).toBe('İleri: Stok Merkezi › İş kutusu');
    fireEvent.click(ileri());
    expect(adres()).toBe('/stok');
  });

  it('geri dönülmüşken yeni sayfa açılırsa ileri pasif olur', () => {
    ciz();
    anaMenudenAc('Reçete ve Rota');
    fireEvent.click(geri());
    expect(ileri().hasAttribute('disabled')).toBe(false);
    anaMenudenAc('Stok Merkezi');
    expect(ileri().hasAttribute('disabled')).toBe(true);
  });

  it('son yerler aramanın boş halinde en yakını başta listelenir ve seçilen yere doğrudan gidilir (516 a)', () => {
    ciz();
    anaMenudenAc('Reçete ve Rota');
    anaMenudenAc('Stok Merkezi');
    expect(ust().queryByRole('button', { name: 'Son yerler' })).toBeNull();
    fireEvent.focus(kutu());
    const yerler = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-label')?.endsWith('Son yerler'));
    expect(yerler.map((y) => y.getAttribute('aria-label'))).toEqual(['Reçete ve Rota Son yerler', 'Ana sayfa Son yerler']);
    fireEvent.click(yerler[1]!);
    expect(adres()).toBe('/');
    expect(ileri().getAttribute('aria-label')).toBe('İleri: Reçete ve Rota');
  });

  it('reddedilen: geri gidilecek yer yokken boş aramada son yer listelenmez; yazınca son yerler çekilir', () => {
    ciz();
    fireEvent.focus(kutu());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    anaMenudenAc('Reçete ve Rota');
    yaz('rota');
    expect(screen.queryAllByRole('option').some((o) => o.getAttribute('aria-label')?.endsWith('Son yerler'))).toBe(false);
  });
});

describe('Genel arama', () => {
  it('sayfa ve menü maddesi adla bulunur; Enter ilk sonuca gider ve kutu boşalır', () => {
    ciz();
    yaz('okut');
    expect(sonuclar()).toEqual(['Stok Merkezi › Okut']);
    fireEvent.keyDown(kutu(), { key: 'Enter' });
    expect(adres()).toBe('/stok/okut');
    expect((kutu() as HTMLInputElement).value).toBe('');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('oklarla seçilen sonuca gidilir; tıklanan sonuca da gidilir', () => {
    ciz();
    yaz('stok');
    expect(sonuclar()[0]).toBe('Stok Merkezi');
    fireEvent.keyDown(kutu(), { key: 'ArrowDown' });
    expect(kutu().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]!.id);
    fireEvent.keyDown(kutu(), { key: 'Enter' });
    expect(adres()).toBe('/stok/okut');
    yaz('rota');
    fireEvent.click(screen.getByRole('option', { name: 'Reçete ve Rota' }));
    expect(adres()).toBe('/recete-rota');
  });

  it('reddedilen: yetkisi olmayan madde sonuçta çıkmaz; eşleşme yoksa kayıt araması bitince "Sonuç yok" yazar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sonuclar: [], eksik: [] }), { status: 200 })));
    ciz('/', ['ornek.oku']);
    yaz('ayarlar');
    expect(sonuclar()).not.toContain('Stok Merkezi › Ayarlar');
    yaz('olmayan sey');
    expect(screen.getByText('Kayıtlar aranıyor')).toBeTruthy();
    expect(screen.queryByText('Sonuç yok')).toBeNull();
    expect(await screen.findByText('Sonuç yok')).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('Ctrl K kutuya odaklanır; Esc kutuyu boşaltır ve listeyi kapatır', () => {
    vi.useFakeTimers();
    ciz();
    const olay = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(olay); vi.runAllTimers(); });
    // Tarayıcının kendi Ctrl K'sı (adres çubuğunda arama) durdurulur.
    expect(olay.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(kutu());
    yaz('rota');
    // Eski Rota menüde gizlidir; aramada yalnız Reçete ve Rota çıkar.
    expect(sonuclar()).toEqual(['Reçete ve Rota']);
    fireEvent.keyDown(kutu(), { key: 'Escape' });
    expect((kutu() as HTMLInputElement).value).toBe('');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('reddedilen: modülün kendi Ctrl K aramasi olan sayfada kısayol modülde kalır, kabuk kutusu odak almaz', () => {
    vi.useFakeTimers();
    let acilan = 0;
    ciz('/', ['ornek.oku'], <KendiAramasi acildi={() => { acilan += 1; }} />);
    act(() => { fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true }); vi.runAllTimers(); });
    expect(acilan).toBe(1);
    expect(document.activeElement).not.toBe(kutu());
  });
});
