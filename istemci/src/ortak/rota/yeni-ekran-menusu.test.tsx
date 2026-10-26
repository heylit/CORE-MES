import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { matchPath, MemoryRouter } from 'react-router-dom';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { Kabuk } from '../arayuz/Kabuk.tsx';
import { modulRotalari } from './kesif.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';
import { eskiGorunumAdresiMi, gorunumGecisi, seritAdresi, TASINAN_EKRANLAR, YENI_EKRAN_GRUBU, YENI_EKRAN_YOLLARI, yeniEkranAdresiMi, yeniEkranBaglantilari } from './yeni-ekran-menusu.ts';

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
    expect(within(menu).getByRole('link', { name: 'Finans ve Muhasebe (yeni)' }).getAttribute('href')).toBe('/finans/yeni');
    // Eski adresine geçenlerin (541) deneme satırı yoktur, ana menüdeki satır yeni ekranı açar.
    for (const ad of ['Kuyruk (yeni)', 'Reçete ve Rota (yeni)', 'Planlama (yeni)', 'Üretim Terminali (yeni)', 'Üretim Hazırlık (yeni)']) {
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
    expect(yeniEkranAdresiMi('/ik')).toBe(false);
    expect(yeniEkranAdresiMi('/ik/yenilik')).toBe(false);
    expect(yeniEkranAdresiMi('/recete-rota/plan')).toBe(false);
    expect(yeniEkranAdresiMi('/plan/studio')).toBe(false);
    expect(yeniEkranAdresiMi('/malzemeler/yeni')).toBe(false);
  });

  it('yeni ekranda şerit çizilmez, çerçeveli düzen ve tam ekran kalır', () => {
    const { container } = adreste('/ik/yeni/izinler');
    expect(serit('İnsan Kaynakları')).toBeNull();
    const kabuk = container.querySelector('.tc-kabuk');
    expect(kabuk?.hasAttribute('data-cerceveli')).toBe(true);
    expect(screen.getByRole('button', { name: 'Tam ekran' })).toBeTruthy();
  });

  it('Planlama ayrı sayfadır (658 b): şeridi kendi menüsüdür, Reçete ve Rota şeridi çizilmez', () => {
    adreste('/plan/studio');
    expect(serit('Reçete ve Rota')).toBeNull();
    const menu = serit('Planlama');
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).getByRole('link', { name: /^Planlama atölyesi/ }).getAttribute('aria-current')).toBe('page');
  });

  it('eski ekranda şerit durur', () => {
    adreste('/ik');
    expect(serit('İnsan Kaynakları')).not.toBeNull();
    cleanup();
    adreste('/plan/eski/terminler');
    const menu = serit('Planlama');
    expect(menu).not.toBeNull();
    expect(within(menu as HTMLElement).getByRole('link', { name: /^Terminler/ }).getAttribute('aria-current')).toBe('page');
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
  // Yeni ekran kapısını geçen kişi; geçiş yalnız ondadır (681 a).
  const yonetici = ['sayfa.kuyruk', YENI_EKRAN_ISLEMI];

  it('yeni ve eski adres kayıtlı modül rotasıdır; eski adres sayfanın alt yoludur', () => {
    for (const t of TASINAN_EKRANLAR) {
      for (const yol of [t.yol, t.eski]) expect(modulRotalari.some((r) => matchPath(r.yol, yol) !== null), yol).toBe(true);
      expect(t.eski.startsWith(`${t.yol}/`) || t.eski.startsWith('/recete-rota/eski')).toBe(true);
    }
  });

  it('Planlama (659 a): eski çerçeve /plan/eski altındadır; geçiş yalnız yöneticide görünür', () => {
    const yonetici = [YENI_EKRAN_ISLEMI];
    expect(gorunumGecisi('/plan', yonetici)).toEqual({ baslik: 'Eski görünüm', yol: '/plan/eski' });
    expect(gorunumGecisi('/plan/terminler', yonetici)).toEqual({ baslik: 'Eski görünüm', yol: '/plan/eski/terminler' });
    expect(gorunumGecisi('/plan/eski/terminler', yonetici)).toEqual({ baslik: 'Yeni görünüm', yol: '/plan/terminler' });
    expect(gorunumGecisi('/plan/terminler', ['plan.planlama-oku'])).toBeNull();
    expect(gorunumGecisi('/plan/eski', ['plan.planlama-oku'])).toBeNull();
    expect(gorunumGecisi('/planx', yonetici)).toBeNull();
    expect(seritAdresi('/plan/eski/denge')).toBe('/plan/denge');
    adreste('/plan/sevkiyat', ['sayfa.plan', 'plan.planlama-oku']);
    expect(hesapMaddeleri()).not.toContain('Eski görünüm');
    cleanup();
    adreste('/plan/sevkiyat', ['sayfa.plan', 'plan.planlama-oku', YENI_EKRAN_ISLEMI]);
    expect(hesapMaddeleri()).toContain('Eski görünüm');
  });

  it('kabuğun şeridi yeni ekranda da eski adreste de durur (553 1 a; eski sayfa tek maddelik şeridi de çizer)', () => {
    for (const yol of ['/kuyruk', '/kuyruk/eski', '/uretim-terminali', '/uretim-terminali/eski', '/arkon', '/arkon/pano', '/arkon/eski/pano',
      '/kalite-merkezi', '/kalite-merkezi/dof', '/kalite-merkezi/eski/dof', '/kalite-merkezi/resimler']) {
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

  it('Kalite Merkezi: görünüm eski adreste aynı görünümdür; stüdyo (217 b) yalnız çerçevededir', () => {
    expect(gorunumGecisi('/kalite-merkezi')).toEqual({ baslik: 'Eski görünüm', yol: '/kalite-merkezi/eski' });
    expect(gorunumGecisi('/kalite-merkezi/dof')).toEqual({ baslik: 'Eski görünüm', yol: '/kalite-merkezi/eski/dof' });
    expect(gorunumGecisi('/kalite-merkezi/eski/dof')).toEqual({ baslik: 'Yeni görünüm', yol: '/kalite-merkezi/dof' });
    expect(gorunumGecisi('/kalite-merkezi/resimler')).toBeNull();
    expect(gorunumGecisi('/kalite-merkezi/analiz')).toBeNull();
    expect(seritAdresi('/kalite-merkezi/eski/dof')).toBe('/kalite-merkezi/dof');
    expect(seritAdresi('/kalite-merkezi/eski')).toBe('/kalite-merkezi');
  });

  it('kişi menüsü yeni ekranda eskisini, eski ekranda yenisini açar; başka sayfada madde yoktur', () => {
    expect(gorunumGecisi('/kuyruk')).toEqual({ baslik: 'Eski görünüm', yol: '/kuyruk/eski' });
    expect(gorunumGecisi('/kuyruk/eski')).toEqual({ baslik: 'Yeni görünüm', yol: '/kuyruk' });
    expect(gorunumGecisi('/ik')).toBeNull();
    adreste('/kuyruk', yonetici);
    expect(hesapMaddeleri()).toContain('Eski görünüm');
    cleanup();
    adreste('/kuyruk/eski', yonetici);
    expect(hesapMaddeleri()).toContain('Yeni görünüm');
    cleanup();
    adreste('/ik', yonetici);
    const maddeler = hesapMaddeleri();
    expect(maddeler).not.toContain('Eski görünüm');
    expect(maddeler).not.toContain('Yeni görünüm');
  });

  // 681 a: operatör yalnız yeni ekranı görür; geçiş maddesi yönetici kapısını geçmeyende hiçbir taşınan ekranda yoktur.
  it('eski ve yeni gorunum gecisi yonetici kapisi olmayanin kisi menusunde yoktur', () => {
    for (const adres of ['/kuyruk', '/kuyruk/eski', '/uretim-terminali', '/uretim-terminali/eski', '/arkon/pano', '/malzemeler', '/kalite-merkezi/dof', '/recete-rota/stock']) {
      adreste(adres, ISLEMLER.filter((i) => i !== YENI_EKRAN_ISLEMI));
      const maddeler = hesapMaddeleri();
      expect(maddeler, adres).not.toContain('Eski görünüm');
      expect(maddeler, adres).not.toContain('Yeni görünüm');
      cleanup();
    }
  });

  it('eski gorunum adresi yalniz eski ekranlarin adresidir', () => {
    for (const t of TASINAN_EKRANLAR) {
      expect(eskiGorunumAdresiMi(t.eski), t.eski).toBe(true);
      expect(eskiGorunumAdresiMi(`${t.eski}/`), t.eski).toBe(true);
      expect(eskiGorunumAdresiMi(t.yol), t.yol).toBe(false);
    }
    expect(eskiGorunumAdresiMi('/arkon/eski/pano/5')).toBe(true);
    expect(eskiGorunumAdresiMi('/recete-rota/eski/plan')).toBe(false);
    expect(eskiGorunumAdresiMi('/kuyruk/eskisi')).toBe(false);
    expect(eskiGorunumAdresiMi('/ik')).toBe(false);
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

  it('yalnız yedi bölüm adresi taşınmıştır; eski planlama adresleri Planlama sayfasına yönlenir', () => {
    expect(gorunumGecisi('/recete-rota')).toEqual({ baslik: 'Eski görünüm', yol: '/recete-rota/eski' });
    expect(gorunumGecisi('/recete-rota/stock/')).toEqual({ baslik: 'Eski görünüm', yol: '/recete-rota/eski/stock' });
    expect(gorunumGecisi('/recete-rota/eski/res')).toEqual({ baslik: 'Yeni görünüm', yol: '/recete-rota/res' });
    expect(gorunumGecisi('/recete-rota/plan')).toBeNull();
    expect(gorunumGecisi('/recete-rota/stockx')).toBeNull();
  });

  it('kabuk şeridi yeni ekranda durur; eski görünümde bölümün maddesi seçili görünür', () => {
    expect(yeniEkranAdresiMi('/recete-rota')).toBe(false);
    expect(seritAdresi('/recete-rota/eski/stock')).toBe('/recete-rota/stock');
    adreste('/recete-rota/schema');
    expect(secili()).toEqual(['Ürün ve rotalar']);
    expect(within(serit()).queryByRole('link', { name: /^Planlama motoru/ })).toBeNull();
    cleanup();
    adreste('/recete-rota/eski/stock');
    expect(secili()).toEqual(['Stok']);
  });
});
