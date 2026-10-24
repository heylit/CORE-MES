import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { Kabuk } from '../arayuz/Kabuk.tsx';
import { modulRotalari } from './kesif.ts';
import { YENI_EKRAN_ISLEMI } from './yeni-ekran.tsx';
import { YENI_EKRAN_GRUBU, YENI_EKRAN_YOLLARI, yeniEkranBaglantilari } from './yeni-ekran-menusu.ts';

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
    const rotaYollari = new Set(modulRotalari.map((r) => r.yol));
    for (const yol of YENI_EKRAN_YOLLARI) expect(rotaYollari.has(yol), yol).toBe(true);
  });

  it('yönetici her yeni ekran için ayrı satır görür', () => {
    ciz([YENI_EKRAN_ISLEMI]);
    const menu = anaMenu();
    expect(within(menu).getByText(YENI_EKRAN_GRUBU)).toBeTruthy();
    const adresler = within(menu).getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const yol of YENI_EKRAN_YOLLARI) expect(adresler, yol).toContain(yol);
    expect(within(menu).getByRole('link', { name: 'Planlama (yeni)' }).getAttribute('href')).toBe('/recete-rota/planlama-yeni');
    expect(within(menu).getByRole('link', { name: 'Finans ve Muhasebe (yeni)' }).getAttribute('href')).toBe('/finans/yeni');
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
