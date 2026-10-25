import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
    // Ayrı sayfa satırı (`/arkon/yeni/operator`) parametreli rotayla eşleşir.
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
    expect(within(menu).getByRole('link', { name: 'Üretim Terminali (yeni)' }).getAttribute('href')).toBe('/arkon/yeni/operator');
    expect(within(menu).getByRole('link', { name: 'Kuyruk (yeni)' }).getAttribute('href')).toBe('/arkon/yeni/kuyruk');
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
    expect(yollar).toContain('/arkon/yeni');
    ciz([YENI_EKRAN_ISLEMI], ['/arkon']);
    expect(within(anaMenu()).queryByRole('link', { name: 'Üretim Hazırlık (yeni)' })).toBeNull();
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
