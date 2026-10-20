import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Örnek Modül',
  simge: 'cube',
  gruplar: [{ maddeler: [{ anahtar: 'ana', baslik: 'Genel', yol: '/stok', simge: 'list', islem: 'ornek.oku' }] }],
};
const CERCEVELI: IkinciMenu = { ...MENU, cerceveli: true };

function ciz(menu: IkinciMenu) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
  return render(
    <MemoryRouter initialEntries={['/stok']}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[menu]}>
        <p>icerik</p>
      </Kabuk>
    </MemoryRouter>,
  );
}

const kabuk = () => document.querySelector('.tc-kabuk') as HTMLElement;
const tamEkranMi = () => kabuk().hasAttribute('data-tam-ekran');
const dugme = () => screen.queryByRole('button', { name: /Tam ekran/ });

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Tam ekran', () => {
  it('çerçeveli sayfada düğme kabuğu tam ekrana alır; aynı düğme geri döndürür', () => {
    ciz(CERCEVELI);
    fireEvent.click(dugme()!);
    expect(tamEkranMi()).toBe(true);
    expect(screen.getByRole('button', { name: 'Tam ekrandan çık' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Tam ekrandan çık' }));
    expect(tamEkranMi()).toBe(false);
  });

  it('Esc tam ekrandan çıkarır', () => {
    ciz(CERCEVELI);
    fireEvent.click(dugme()!);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tamEkranMi()).toBe(false);
  });

  it('reddedilen: çerçevesiz sayfada tam ekran düğmesi yoktur', () => {
    ciz(MENU);
    expect(dugme()).toBeNull();
    expect(tamEkranMi()).toBe(false);
  });

  it('reddedilen: tercih hatırlanmaz; sayfa değişince ve yeniden açılışta tam ekran kapalıdır', () => {
    const { unmount } = ciz(CERCEVELI);
    fireEvent.click(dugme()!);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Reçete ve Rota' }));
    expect(tamEkranMi()).toBe(false);
    unmount();
    ciz(CERCEVELI);
    expect(tamEkranMi()).toBe(false);
  });

  it('reddedilen: başka çerçeveli modüle geçince tam ekran kapanır', () => {
    const ARKON: IkinciMenu = { ...CERCEVELI, kok: '/arkon', baslik: 'Arkon Modül', gruplar: [{ maddeler: [{ anahtar: 'a', baslik: 'A', yol: '/arkon', simge: 'list', islem: 'ornek.oku' }] }] };
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    render(
      <MemoryRouter initialEntries={['/stok']}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[CERCEVELI, ARKON]}>
          <p>icerik</p>
        </Kabuk>
      </MemoryRouter>,
    );
    fireEvent.click(dugme()!);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Üretim Hazırlık' }));
    expect(screen.getByRole('navigation', { name: 'Arkon Modül menüsü' })).toBeTruthy();
    expect(tamEkranMi()).toBe(false);
  });

  it('reddedilen: açık penceredeki Esc yalnız pencereyi kapatır, tam ekran kalır', () => {
    ciz(CERCEVELI);
    fireEvent.click(dugme()!);
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Parolamı değiştir' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Parolamı değiştir' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Parolamı değiştir' })).toBeNull();
    expect(tamEkranMi()).toBe(true);
  });

  // Tam ekran ana menüyü, ikinci menüyü ve alt gezinmeyi gizler; çıkış düğmesi bunların dışında, üst çubukta durmalıdır.
  // Stilin kendisi tarayıcıda ölçülür (FARK); test ortamı stil uygulamaz.
  it('çıkış düğmesi tam ekranda üst çubukta, gizlenen bölgelerin dışında ve kullanılabilir kalır', () => {
    ciz(CERCEVELI);
    fireEvent.click(dugme()!);
    const cik = within(screen.getByRole('banner')).getByRole('button', { name: 'Tam ekrandan çık' });
    expect(cik.closest('.tc-kabuk-menu, .tc-ikinci-kap, .tc-kabuk-alt, [aria-hidden="true"], [hidden], [inert]')).toBeNull();
    expect(cik.hasAttribute('disabled')).toBe(false);
    fireEvent.click(cik);
    expect(tamEkranMi()).toBe(false);
  });

  it('reddedilen: dar ekranda da düğme gizlenen bölgelere taşınmaz ve tektir', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    render(
      <MemoryRouter initialEntries={['/stok']}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[CERCEVELI]}>
          <p>icerik</p>
        </Kabuk>
      </MemoryRouter>,
    );
    expect(kabuk().hasAttribute('data-ikinci')).toBe(true);
    fireEvent.click(dugme()!);
    const cikislar = screen.getAllByRole('button', { name: 'Tam ekrandan çık' });
    expect(cikislar).toHaveLength(1);
    expect(cikislar[0]!.closest('.tc-kabuk-ust')).not.toBeNull();
    expect(cikislar[0]!.closest('.tc-kabuk-menu, .tc-ikinci-kap, .tc-kabuk-alt')).toBeNull();
  });

  // Çerçevedeki ön yüz kendi genişlik kırılımlarıyla çizilir (Arkon terminali 980 altında dar düzene geçer); 1024 ve
  // üstündeki ikinci menü sütunu ondan genişlik almasın diye çerçeveli sayfada menü şerit kalır. Seçici kabuktaki işarete bakar.
  it('çerçeveli sayfada kabuk çerçeveli işaretini taşır; çerçevesizde taşımaz', () => {
    const { unmount } = ciz(CERCEVELI);
    expect(kabuk().hasAttribute('data-cerceveli')).toBe(true);
    unmount();
    ciz(MENU);
    expect(kabuk().hasAttribute('data-cerceveli')).toBe(false);
  });
});
