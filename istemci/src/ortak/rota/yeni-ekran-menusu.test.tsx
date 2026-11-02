import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { matchPath, MemoryRouter } from 'react-router-dom';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { Kabuk } from '../arayuz/Kabuk.tsx';
import { modulRotalari } from './kesif.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';
import { YENI_EKRAN_GRUBU, YENI_EKRAN_YOLLARI, yeniEkranAdresiMi, yeniEkranBaglantilari } from './yeni-ekran-menusu.ts';

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

  it('açık modülde deneme satırı kalmadı: İK de alındı (1614), Mesaj ve Portal kapalı', () => {
    expect(YENI_EKRAN_YOLLARI).toEqual([]);
    expect(yeniEkranBaglantilari(SAYFALAR, [YENI_EKRAN_ISLEMI])).toEqual([]);
    ciz([YENI_EKRAN_ISLEMI]);
    const menu = anaMenu();
    expect(within(menu).queryByText(YENI_EKRAN_GRUBU)).toBeNull();
    for (const ad of ['İnsan Kaynakları (yeni)', 'İK İşlemlerim (yeni)']) expect(within(menu).queryByRole('link', { name: ad }), ad).toBeNull();
    // Eski ekranı kalkanların (1392 a) deneme satırı yoktur.
    for (const ad of ['Finans ve Muhasebe (yeni)', 'Denetim Hazırlığı (yeni)']) expect(within(menu).queryByRole('link', { name: ad }), ad).toBeNull();
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
    // İK ve İK İşlemlerim eski çerçevesi kalkınca kendi kökünde açılır (1614); PDKS aktarımı Nizamiye ekranıdır, şerit durur.
    for (const yol of ['/ik', '/ik/izinler', '/ik/calisan/emp_b', '/ik-islemlerim', '/ik-islemlerim/onaylar']) expect(yeniEkranAdresiMi(yol), yol).toBe(true);
    expect(yeniEkranAdresiMi('/ik/pdks')).toBe(false);
    expect(yeniEkranAdresiMi('/iklim')).toBe(false);
    expect(yeniEkranAdresiMi('/recete-rota/plan')).toBe(false);
    expect(yeniEkranAdresiMi('/plan/studio')).toBe(false);
    expect(yeniEkranAdresiMi('/malzemeler/yeni')).toBe(false);
    // Eski ekranı kalkan CNC Kurulum'un deneme satırı yoktur, şeridi yine çizilmez (1272 a).
    expect(YENI_EKRAN_YOLLARI).not.toContain('/cnc-kurulum/yeni');
    expect(yeniEkranAdresiMi('/cnc-kurulum/yeni/kutuphane')).toBe(true);
    expect(yeniEkranAdresiMi('/cnc-kurulum')).toBe(true);
    expect(yeniEkranAdresiMi('/cnc-kurulumlar')).toBe(false);
    // Finans ve Denetim Hazırlığı da eski çerçevesi kalkınca kendi kökünde açılır (1392 a).
    for (const yol of ['/finans', '/finans/kayitlar', '/denetim-hazirlik', '/denetim-hazirlik/yeni/takvim']) expect(yeniEkranAdresiMi(yol), yol).toBe(true);
    expect(YENI_EKRAN_YOLLARI).not.toContain('/finans/yeni');
    expect(YENI_EKRAN_YOLLARI).not.toContain('/denetim-hazirlik/yeni');
    expect(yeniEkranAdresiMi('/finansal')).toBe(false);
  });

  it('yeni ekranda şerit çizilmez, çerçeveli düzen ve tam ekran kalır', () => {
    const { container } = adreste('/ik/izinler');
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

  it('kökün altındaki başka modül ekranında (PDKS aktar) şerit durur', () => {
    adreste('/ik/pdks');
    expect(serit('İnsan Kaynakları')).not.toBeNull();
  });
});

describe('eski görünümü kalkan yeni ekran (541, 1392 a)', () => {
  const adreste = (adres: string, islemler: readonly string[]) => render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
  const hesapMaddeleri = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    return screen.getAllByRole('menuitem').map((m) => m.textContent);
  };

  it('kabuğun şeridi Kuyruk, Üretim Terminali ve Üretim Hazırlık ekranlarında durur (553 1 a; tek maddelik şerit de çizilir)', () => {
    for (const yol of ['/kuyruk', '/uretim-terminali', '/arkon', '/arkon/pano', '/arkon/tmi-yansimalari']) {
      expect(yeniEkranAdresiMi(yol), yol).toBe(false);
    }
  });

  it('Malzemeler ve Kalite Merkezi: şerit durur (979 a)', () => {
    for (const yol of ['/malzemeler', '/malzemeler/sablonlar', '/malzemeler/eski/yeni', '/kalite-merkezi', '/kalite-merkezi/dof']) {
      expect(yeniEkranAdresiMi(yol), yol).toBe(false);
    }
  });

  it('kişi menüsünde eski ya da yeni görünüm geçişi yoktur, yöneticide de', () => {
    for (const islemler of [ISLEMLER, ISLEMLER.filter((i) => i !== YENI_EKRAN_ISLEMI)]) {
      for (const adres of ['/kuyruk', '/uretim-terminali', '/arkon/pano', '/plan/sevkiyat', '/recete-rota/stock']) {
        adreste(adres, islemler);
        const maddeler = hesapMaddeleri();
        expect(maddeler, adres).not.toContain('Eski görünüm');
        expect(maddeler, adres).not.toContain('Yeni görünüm');
        cleanup();
      }
    }
  });
});

describe('Reçete ve Rota yeni ekranı; eski çerçeve kalktı (805)', () => {
  const adreste = (adres: string) => render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={ISLEMLER}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
  const serit = () => screen.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  const secili = () => within(serit()).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent);

  it('kabuk şeridi yeni ekranda durur, bölümün maddesi seçili görünür', () => {
    expect(yeniEkranAdresiMi('/recete-rota')).toBe(false);
    adreste('/recete-rota/schema');
    expect(secili()).toEqual(['Ürün ve rotalar']);
    expect(within(serit()).queryByRole('link', { name: /^Planlama motoru/ })).toBeNull();
  });
});
