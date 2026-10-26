import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { matchPath, MemoryRouter } from 'react-router-dom';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { Kabuk } from '../arayuz/Kabuk.tsx';
import { modulRotalari } from './kesif.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';
import { gorunumGecisi, seritAdresi, TASINAN_EKRANLAR, YENI_EKRAN_GRUBU, YENI_EKRAN_YOLLARI, yeniEkranAdresiMi, yeniEkranBaglantilari } from './yeni-ekran-menusu.ts';

function ciz(islemler: readonly string[], kapali: readonly string[] = []) {
  return render(
    <MemoryRouter>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} kapali={kapali}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
}

const anaMenu = () => screen.getByRole('navigation', { name: 'Ana menü' });

afterEach(cleanup);

describe('yeni ekran menü satırları', () => {
  it('her satırın adresi kayıtlı bir modül rotasıdır', () => {
    for (const yol of YENI_EKRAN_YOLLARI) expect(modulRotalari.some((r) => matchPath(r.yol, yol) !== null), yol).toBe(true);
  });

  it('yönetici her yeni ekran için ayrı satır görür', () => {
    ciz([YENI_EKRAN_ISLEMI]);
    const menu = anaMenu();
    expect(within(menu).getByText(YENI_EKRAN_GRUBU)).toBeTruthy();
    const adresler = within(menu).getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const yol of YENI_EKRAN_YOLLARI) expect(adresler, yol).toContain(yol);
    expect(within(menu).getByRole('link', { name: 'Planlama (yeni)' }).getAttribute('href')).toBe('/recete-rota/planlama-yeni');
    expect(within(menu).getByRole('link', { name: 'Finans ve Muhasebe (yeni)' }).getAttribute('href')).toBe('/finans/yeni');
    // Eski adresine geçenlerin (541) deneme satırı yoktur, ana menüdeki satır yeni ekranı açar.
    for (const ad of ['Kuyruk (yeni)', 'Reçete ve Rota (yeni)', 'Üretim Terminali (yeni)', 'Üretim Hazırlık (yeni)']) {
      expect(within(menu).queryByRole('link', { name: ad }), ad).toBeNull();
    }
    expect(within(menu).getByRole('link', { name: 'Kuyruk' }).getAttribute('href')).toBe('/kuyruk');
  });

  it('yönetici olmayan kişi, modül sayfalarının işlemleri olsa da satırları görmez', () => {
    ciz(SAYFALAR.map((s) => s.islem));
    const menu = anaMenu();
    expect(within(menu).queryByText(YENI_EKRAN_GRUBU)).toBeNull();
    const adresler = within(menu).getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const yol of YENI_EKRAN_YOLLARI) expect(adresler).not.toContain(yol);
  });

  it('kişiye görünmeyen ya da kapatılan sayfanın yeni ekranı listelenmez', () => {
    const finanssiz = SAYFALAR.filter((s) => s.yol !== '/finans');
    const yollar = yeniEkranBaglantilari(finanssiz, [YENI_EKRAN_ISLEMI]).map((b) => b.yol);
    expect(yollar).not.toContain('/finans/yeni');
    expect(yollar).toContain('/ik/yeni');
    ciz([YENI_EKRAN_ISLEMI], ['/ik']);
    expect(within(anaMenu()).queryByRole('link', { name: 'İnsan Kaynakları (yeni)' })).toBeNull();
  });
});

describe('yeni ekranda kabuğun ikinci menü şeridi (soru 315 a)', () => {
  const adreste = (adres: string) => render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={ISLEMLER}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
  const serit = (baslik: string) => screen.queryByRole('navigation', { name: `${baslik} menüsü` });

  it('yeni ekran adresi ve alt yolları sayılır; benzer adlı ya da eski adres sayılmaz', () => {
    for (const yol of YENI_EKRAN_YOLLARI) expect(yeniEkranAdresiMi(yol), yol).toBe(true);
    expect(yeniEkranAdresiMi('/ik/yeni/izinler')).toBe(true);
    expect(yeniEkranAdresiMi('/recete-rota/planlama-yeni/plan')).toBe(true);
    expect(yeniEkranAdresiMi('/ik')).toBe(false);
    expect(yeniEkranAdresiMi('/ik/yenilik')).toBe(false);
    expect(yeniEkranAdresiMi('/recete-rota/plan')).toBe(false);
    expect(yeniEkranAdresiMi('/malzemeler/yeni')).toBe(false);
  });

  it('yeni ekranda şerit çizilmez, çerçeveli düzen ve tam ekran kalır', () => {
    const { container } = adreste('/ik/yeni/izinler');
    expect(serit('İnsan Kaynakları')).toBeNull();
    const kabuk = container.querySelector('.tc-kabuk');
    expect(kabuk?.hasAttribute('data-cerceveli')).toBe(true);
    expect(screen.getByRole('button', { name: 'Tam ekran' })).toBeTruthy();
  });

  it('Planlama yeni ekranında başka maddeyi seçili gösteren şerit yoktur', () => {
    adreste('/recete-rota/planlama-yeni/plan');
    expect(serit('Reçete ve Rota')).toBeNull();
    expect(document.querySelector('.tc-ikinci-madde-etkin')).toBeNull();
  });

  it('eski ekranda şerit durur', () => {
    adreste('/ik');
    expect(serit('İnsan Kaynakları')).not.toBeNull();
    cleanup();
    adreste('/recete-rota/plan');
    const menu = serit('Reçete ve Rota');
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).getByRole('link', { name: /^Planlama motoru/ }).getAttribute('aria-current')).toBe('page');
  });
});

describe('eski adresine geçen yeni ekran (541, 527 1 a)', () => {
  const adreste = (adres: string, islemler: readonly string[]) => render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
  const hesapMaddeleri = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    return screen.getAllByRole('menuitem').map((m) => m.textContent);
  };
  // Yönetici kapısı olmayan kişi: yalnız Kuyruk sayfasının işlemi.
  const kuyrukcu = ['sayfa.kuyruk'];

  it('yeni ve eski adres kayıtlı modül rotasıdır; eski adres sayfanın alt yoludur', () => {
    for (const t of TASINAN_EKRANLAR) {
      for (const yol of [t.yol, t.eski]) expect(modulRotalari.some((r) => matchPath(r.yol, yol) !== null), yol).toBe(true);
      expect(t.eski.startsWith(`${t.yol}/`) || t.eski.startsWith('/recete-rota/eski')).toBe(true);
    }
  });

  it('kabuğun şeridi yeni ekranda da eski adreste de durur (553 1 a; eski sayfa tek maddelik şeridi de çizer)', () => {
    for (const yol of ['/kuyruk', '/kuyruk/eski', '/uretim-terminali', '/uretim-terminali/eski', '/arkon', '/arkon/pano', '/arkon/eski/pano']) {
      expect(yeniEkranAdresiMi(yol), yol).toBe(false);
    }
  });

  it('Arkon: alt yol eski adreste aynı alt yoldur; TMI ekranı olan madde taşınmadı', () => {
    expect(gorunumGecisi('/arkon/kalite')).toEqual({ baslik: 'Eski görünüm', yol: '/arkon/eski/kalite' });
    expect(gorunumGecisi('/arkon/eski/kalite')).toEqual({ baslik: 'Yeni görünüm', yol: '/arkon/kalite' });
    expect(gorunumGecisi('/arkon')).toEqual({ baslik: 'Eski görünüm', yol: '/arkon/eski' });
    expect(gorunumGecisi('/uretim-terminali')).toEqual({ baslik: 'Eski görünüm', yol: '/uretim-terminali/eski' });
    expect(gorunumGecisi('/uretim-terminali/eski')).toEqual({ baslik: 'Yeni görünüm', yol: '/uretim-terminali' });
    expect(gorunumGecisi('/arkon/tmi-yansimalari')).toBeNull();
    expect(gorunumGecisi('/arkonx')).toBeNull();
    expect(seritAdresi('/arkon/eski/kalite')).toBe('/arkon/kalite');
  });

  it('Malzemeler (572): bölüm eski adreste aynı alt yoldur; şerit durur; Logo gönderiminin eskisi yoktur', () => {
    expect(gorunumGecisi('/malzemeler')).toEqual({ baslik: 'Eski görünüm', yol: '/malzemeler/eski' });
    expect(gorunumGecisi('/malzemeler/sablonlar')).toEqual({ baslik: 'Eski görünüm', yol: '/malzemeler/eski/sablonlar' });
    expect(gorunumGecisi('/malzemeler/eski/yeni')).toEqual({ baslik: 'Yeni görünüm', yol: '/malzemeler/yeni' });
    expect(gorunumGecisi('/malzemeler/logo')).toBeNull();
    expect(seritAdresi('/malzemeler/eski/ayarlar')).toBe('/malzemeler/ayarlar');
    for (const yol of ['/malzemeler', '/malzemeler/yeni', '/malzemeler/eski']) expect(yeniEkranAdresiMi(yol), yol).toBe(false);
  });

  it('kişi menüsü yeni ekranda eskisini, eski ekranda yenisini açar; başka sayfada madde yoktur', () => {
    expect(gorunumGecisi('/kuyruk')).toEqual({ baslik: 'Eski görünüm', yol: '/kuyruk/eski' });
    expect(gorunumGecisi('/kuyruk/eski')).toEqual({ baslik: 'Yeni görünüm', yol: '/kuyruk' });
    expect(gorunumGecisi('/ik')).toBeNull();
    adreste('/kuyruk', kuyrukcu);
    expect(hesapMaddeleri()).toContain('Eski görünüm');
    cleanup();
    adreste('/kuyruk/eski', kuyrukcu);
    expect(hesapMaddeleri()).toContain('Yeni görünüm');
    cleanup();
    adreste('/ik', kuyrukcu);
    const maddeler = hesapMaddeleri();
    expect(maddeler).not.toContain('Eski görünüm');
    expect(maddeler).not.toContain('Yeni görünüm');
  });
});

describe('Reçete ve Rota eski adresinde yeni ekran (541b, 553 1 a)', () => {
  const adreste = (adres: string) => render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={ISLEMLER}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
  const serit = () => screen.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  const secili = () => within(serit()).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent);

  it('yalnız yedi bölüm adresi taşınmıştır; Planlama ve alt yollar eski adreste kalır', () => {
    expect(gorunumGecisi('/recete-rota')).toEqual({ baslik: 'Eski görünüm', yol: '/recete-rota/eski' });
    expect(gorunumGecisi('/recete-rota/stock/')).toEqual({ baslik: 'Eski görünüm', yol: '/recete-rota/eski/stock' });
    expect(gorunumGecisi('/recete-rota/eski/res')).toEqual({ baslik: 'Yeni görünüm', yol: '/recete-rota/res' });
    expect(gorunumGecisi('/recete-rota/plan')).toBeNull();
    expect(gorunumGecisi('/recete-rota/planlama-yeni')).toBeNull();
    expect(gorunumGecisi('/recete-rota/stockx')).toBeNull();
  });

  it('kabuk şeridi yeni ekranda durur; eski görünümde bölümün maddesi seçili görünür', () => {
    expect(yeniEkranAdresiMi('/recete-rota')).toBe(false);
    expect(seritAdresi('/recete-rota/eski/stock')).toBe('/recete-rota/stock');
    expect(seritAdresi('/recete-rota/plan')).toBe('/recete-rota/plan');
    adreste('/recete-rota/schema');
    expect(secili()).toEqual(['Ürün ve rotalar']);
    expect(within(serit()).getByRole('link', { name: /^Planlama motoru/ }).getAttribute('href')).toBe('/recete-rota/plan');
    cleanup();
    adreste('/recete-rota/eski/stock');
    expect(secili()).toEqual(['Stok']);
  });
});
