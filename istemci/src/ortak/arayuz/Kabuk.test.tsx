import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { anahtarlar } from '../veri/anahtarlar.ts';
import { SAYFALAR, menudeGorunur, type Sayfa } from '#paylasilan/sayfalar.ts';
import { Kabuk, KabukUstYuvasi } from './Kabuk.tsx';
import { ROL_GORUNUMLERI } from '#paylasilan/rol-gorunumleri.ts';
import { TEMA_ANAHTARI } from '../veri/tema.ts';
import { cihazTercihiAnahtari, cihazTercihleriniSifirla } from '../veri/cihaz-tercihi.ts';
import { YENI_EKRAN_ISLEMI } from '../rota/yeni-ekran.tsx';
import { KaliciEkranlar } from '../rota/kalici.tsx';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { useHesapMaddesiDurumu } from '../rota/ust-eylemler.ts';
import { api } from '../veri/api.ts';
import { menuTercihiAnahtari } from '../veri/menu-tercihi.ts';

function ciz(sayfalar: readonly Sayfa[] = SAYFALAR, cikis: () => void = () => undefined, yol = '/') {
  return render(
    <MemoryRouter initialEntries={[yol]}>
      <Kabuk sayfalar={sayfalar} kullaniciAdi="Deneme Kişi" cikis={cikis}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  cihazTercihleriniSifirla();
  document.documentElement.setAttribute('data-theme', 'light');
});

describe('Kabuk', () => {
  it('ust eylem dugmesini yalniz islemi olana, ust cubukta cizer', () => {
    const eylem = { anahtar: 'deneme', sira: 1, islem: 'stok.istek' as const, dugme: () => <button type="button">Teslim kutusu</button> };
    const kur = (islemler: readonly string[]) => render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ustEylemler={[eylem]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const yetkili = kur(['stok.istek']);
    expect(yetkili.container.querySelector('.tc-kabuk-ust')?.textContent).toContain('Teslim kutusu');
    yetkili.unmount();
    kur([]);
    expect(screen.queryByRole('button', { name: 'Teslim kutusu' })).toBeNull();
  });

  it('yeri sol olan ust eylemi cubugun en basina, gezinme dugmelerinden once cizer; digerleri sagda kalir', () => {
    const sol = { anahtar: 'okut', sira: 900, islem: 'oturum' as const, yer: 'sol' as const, dugme: () => <button type="button">Okut</button> };
    const sag = { anahtar: 'sag', sira: 1, islem: 'oturum' as const, dugme: () => <button type="button">Sağdaki</button> };
    const { container } = render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={[]} ustEylemler={[sag, sol]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const ust = container.querySelector('.tc-kabuk-ust')!;
    expect(ust.firstElementChild?.textContent).toBe('Okut');
    const dugmeler = [...ust.querySelectorAll('button')].map((b) => b.textContent);
    expect(dugmeler.indexOf('Okut')).toBeLessThan(dugmeler.indexOf('Sağdaki'));
  });

  it('hesap maddesi olan ust eylem Hesap menusunde de durur; secilince dugmesine acma istegi gider', () => {
    const eylem = {
      anahtar: 'durum', sira: 1, islem: 'oturum' as const, hesapMaddesi: { baslik: 'Durum paneli', simge: 'cpu' as const },
      dugme: ({ acmaIstegi = 0 }: { acmaIstegi?: number }) => <button type="button">{`Durum ${String(acmaIstegi)}`}</button>,
    };
    const { container } = render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={[]} ustEylemler={[eylem]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    // Sarmalayıcı 768-1279 arasında düğmeyi gizler (kabuk.css); düğme Hesap menüsünden açılır.
    expect(container.querySelector('.tc-kabuk-ust .tc-kabuk-hesapta')?.textContent).toBe('Durum 0');
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Durum paneli' }));
    expect(screen.getByRole('button', { name: 'Durum 1' })).toBeTruthy();
  });

  it('hesap yerindeki ust eylem cubukta yer tutmaz, yalniz Hesap menusundedir; isareti kisi dugmesinde cizilir (516 a)', () => {
    const eylem = {
      anahtar: 'ziyaret', sira: 1, islem: 'oturum' as const, yer: 'hesap' as const, hesapMaddesi: { baslik: 'Ziyaretçilerim', simge: 'users' as const },
      dugme: ({ acmaIstegi = 0 }: { acmaIstegi?: number }) => <button type="button">{`Ziyaret ${String(acmaIstegi)}`}</button>,
      isaret: () => <span role="img" aria-label="Uyarı var" />,
    };
    const { container } = render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={[]} ustEylemler={[eylem]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    // Sarmalayıcı her genişlikte gizlidir (kabuk.css); düğmenin penceresi gövdeye açılır.
    expect(container.querySelector('.tc-kabuk-ust .tc-kabuk-yalniz-hesapta')?.textContent).toBe('Ziyaret 0');
    expect(container.querySelector('.tc-kabuk-ust .tc-kabuk-hesapta')).toBeNull();
    expect(container.querySelector('.tc-kabuk-kisi-avatar [role="img"]')?.getAttribute('aria-label')).toBe('Uyarı var');
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent).slice(0, 4)).toEqual(['Profilim', 'Ziyaretçilerim', 'Yardım ve rehber', 'Koyu temaya geç']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ziyaretçilerim' }));
    expect(screen.getByRole('button', { name: 'Ziyaret 1' })).toBeTruthy();
  });

  it('dugmenin bildirdigi duruma gore Hesap menusu maddesi gizlenir ya da basligi degisir', () => {
    function Durumlu() {
      const [hal, halYaz] = useState<'gizli' | 'acik' | 'kapali'>('gizli');
      useHesapMaddesiDurumu('pano', hal === 'gizli', hal === 'acik' ? 'Pano (açık)' : undefined);
      return <button type="button" onClick={() => halYaz((h) => (h === 'gizli' ? 'kapali' : 'acik'))}>ilerlet</button>;
    }
    const eylem = { anahtar: 'pano', sira: 1, islem: 'oturum' as const, yer: 'hesap' as const, hesapMaddesi: { baslik: 'Pano', simge: 'grid' as const }, dugme: Durumlu };
    render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={[]} ustEylemler={[eylem]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const maddeler = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
      const adlar = screen.getAllByRole('menuitem').map((m) => m.textContent).slice(0, 2);
      fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
      return adlar;
    };
    expect(maddeler()).toEqual(['Profilim', 'Yardım ve rehber']);
    fireEvent.click(screen.getByRole('button', { name: 'ilerlet', hidden: true }));
    expect(maddeler()).toEqual(['Profilim', 'Pano']);
    fireEvent.click(screen.getByRole('button', { name: 'ilerlet', hidden: true }));
    expect(maddeler()).toEqual(['Profilim', 'Pano (açık)']);
  });

  it('Yardim ust cubukta ayri dugme degildir; F1 ve Hesap menusu acar (516 a)', () => {
    ciz();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Yardım ve rehber' })).toBeNull();
    fireEvent.keyDown(document, { key: 'F1' });
    expect(screen.getByRole('dialog', { name: 'Yardım ve rehber' })).toBeTruthy();
  });

  it('"Ne oldu?" paneli kisiye acik olaylari gosterir, secilen olayin ekranina goturur; olaysiz kiside dugme yoktur', () => {
    const olay = {
      anahtar: 'mal-kabul', sira: 1, baslik: 'Malzeme geldi', aciklama: 'Mal kabul', simge: 'truck' as const, yol: '/stok/mal-kabul', islem: 'stok.giris' as const,
    };
    const kur = (islemler: readonly string[]) => render(
      <MemoryRouter>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} hizliIsler={[olay]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const yetkisiz = kur(['sayfa.stok']);
    expect(screen.queryByRole('button', { name: 'Ne oldu? Kayıt gir' })).toBeNull();
    yetkisiz.unmount();
    kur(['sayfa.stok', 'stok.giris']);
    // Telefonda aynı düğme alt çubuğun ortasındadır; iki yerde de bir tane vardır.
    expect(within(screen.getByRole('navigation', { name: 'Alt gezinme' })).getAllByRole('button', { name: 'Ne oldu? Kayıt gir' })).toHaveLength(1);
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Ne oldu? Kayıt gir' }));
    const panel = within(screen.getByRole('dialog', { name: 'Ne oldu?' }));
    expect(panel.getByRole('heading', { name: 'Stok' })).toBeTruthy();
    fireEvent.click(panel.getByRole('button', { name: /Malzeme geldi/ }));
    expect(screen.queryByRole('dialog', { name: 'Ne oldu?' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stok Merkezi');
  });

  it('telefonun Tumu penceresinde ad yazilinca yalniz eslesen sayfalar kalir; eslesme yoksa bunu soyler', () => {
    ciz();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Alt gezinme' })).getByRole('button', { name: 'Tümü' }));
    const pencere = within(screen.getByRole('dialog', { name: 'Tüm sayfalar' }));
    fireEvent.change(pencere.getByRole('searchbox', { name: 'Sayfa ara' }), { target: { value: 'STOK' } });
    const bulunan = within(pencere.getByRole('group', { name: 'Bulunan sayfalar' }));
    expect(bulunan.getByRole('link', { name: 'Stok Merkezi' })).toBeTruthy();
    const stokGrubu = new Set<string>(SAYFALAR.filter((x) => (x.grup ?? '').toLocaleLowerCase('tr').includes('stok')).map((x) => x.baslik));
    expect(bulunan.getAllByRole('link').every((a) => (a.textContent ?? '').toLocaleLowerCase('tr').includes('stok') || stokGrubu.has(a.getAttribute('aria-label') ?? a.textContent ?? ''))).toBe(true);
    fireEvent.change(pencere.getByRole('searchbox', { name: 'Sayfa ara' }), { target: { value: 'yokboylebirsayfa' } });
    expect(pencere.getByText('Bu adla sayfa yok')).toBeTruthy();
  });

  it('telefonun Tumu aramasi grup adini da eslestirir: grubun butun sayfalari cikar', () => {
    const gruplar = [...new Set(SAYFALAR.filter(menudeGorunur).map((x) => x.grup as string | undefined).filter((g): g is string => g !== undefined))];
    const grup = gruplar.find((g) => SAYFALAR.some((x) => x.grup === g && menudeGorunur(x) && !x.baslik.toLocaleLowerCase('tr').includes(g.toLocaleLowerCase('tr'))));
    expect(grup).toBeDefined();
    if (grup === undefined) return;
    ciz();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Alt gezinme' })).getByRole('button', { name: 'Tümü' }));
    const pencere = within(screen.getByRole('dialog', { name: 'Tüm sayfalar' }));
    fireEvent.change(pencere.getByRole('searchbox', { name: 'Sayfa ara' }), { target: { value: grup } });
    const bulunan = within(pencere.getByRole('group', { name: 'Bulunan sayfalar' }));
    for (const x of SAYFALAR.filter((y) => y.grup === grup && menudeGorunur(y))) expect(bulunan.getByRole('link', { name: x.baslik })).toBeTruthy();
  });

  it('SAYFALAR listesindeki her sayfanin ana menude baglantisi var', () => {
    ciz();
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    for (const s of SAYFALAR.filter(menudeGorunur)) {
      expect(menu.getByRole('link', { name: s.baslik }).getAttribute('href')).toBe(s.yol);
    }
  });

  it('bekletilen sayfanin ana menude, alt gezinmede ve Tumu listesinde baglantisi yoktur; adresinde basligi gorunur', () => {
    const bekletilen = SAYFALAR.filter((s) => !menudeGorunur(s));
    expect(bekletilen.map((s) => s.yol)).toEqual(['/emirler', '/terminal', '/cizelge', '/matris', '/mesai', '/rota']);
    // Yalnız bekletilen ve bir görünür sayfa verilir: alt gezinmenin ilk dört yeri bekletileni dışarıda bırakamaz.
    ciz(SAYFALAR.filter((s) => s.yol === '/terminal' || s.yol === '/kuyruk'), undefined, '/terminal');
    const adresler = (kutu: HTMLElement) => within(kutu).getAllByRole('link').map((b) => b.getAttribute('href'));
    expect(adresler(screen.getByRole('navigation', { name: 'Ana menü' }))).toEqual(['/', '/kuyruk']);
    expect(adresler(screen.getByRole('navigation', { name: 'Alt gezinme' }))).toEqual(['/', '/kuyruk']);
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    expect(adresler(screen.getByRole('dialog', { name: 'Tüm sayfalar' }))).toEqual(['/', '/kuyruk']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terminal');
  });

  it('sayfalar grup basliginin altinda liste sirasiyla durur; gruplar ilk gorunus sirasindadir', () => {
    // Araya giren başka grup sayfası grubu ikiye bölmez.
    const karisik = ['/recete-rota', '/kalibrasyon', '/durus-nedenleri', '/arkon']
      .flatMap((yol) => SAYFALAR.filter((s) => s.yol === yol));
    ciz(karisik);
    const menu = screen.getByRole('navigation', { name: 'Ana menü' });
    const altindakiler = (grup: string) =>
      within(within(menu).getByRole('button', { name: grup }).parentElement as HTMLElement).getAllByRole('link').map((b) => b.getAttribute('href'));
    expect(altindakiler('Tanımlar')).toEqual(['/recete-rota', '/durus-nedenleri']);
    expect(altindakiler('Kalite')).toEqual(['/kalibrasyon']);
    expect(altindakiler('Üretim')).toEqual(['/arkon']);
    expect(within(menu).getAllByRole('link').map((b) => b.getAttribute('href')))
      .toEqual(['/', '/recete-rota', '/durus-nedenleri', '/kalibrasyon', '/arkon']);
  });

  it('Sistem Ayarlari kendi Yonetim grubundadir ve menude en sonda durur', () => {
    ciz();
    const baglantilar = within(screen.getByRole('navigation', { name: 'Ana menü' })).getAllByRole('link');
    expect(baglantilar.length).toBeGreaterThan(2);
    const son = baglantilar.at(-1) as HTMLElement;
    expect(son.getAttribute('href')).toBe('/ayarlar');
    // Grup adı kullanıcı kararıdır; bağlantı o başlığın altındadır.
    const grup = within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('button', { name: 'Yönetim' }).parentElement as HTMLElement;
    expect(grup.contains(son)).toBe(true);
  });

  it('ana sayfa ana menude, alt gezinmede ve Tumu listesinde ilk maddedir; ana sayfadayken secili gorunur', () => {
    ciz(SAYFALAR.filter((s) => s.yol === '/arkon'));
    for (const kutu of [screen.getByRole('navigation', { name: 'Ana menü' }), screen.getByRole('navigation', { name: 'Alt gezinme' })]) {
      const ilk = within(kutu).getAllByRole('link')[0] as HTMLElement;
      expect(ilk.getAttribute('href')).toBe('/');
      expect(ilk.getAttribute('aria-label')).toBe('Ana sayfa');
      expect(ilk.getAttribute('aria-current')).toBe('page');
    }
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ana sayfa');
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    expect(within(screen.getByRole('dialog', { name: 'Tüm sayfalar' })).getAllByRole('link')[0]?.getAttribute('href')).toBe('/');
  });

  it('rolun panosu verilince Ana sayfa ve logo oraya gider; pano sayfasinin alt yolunda Ana sayfa secili gorunmez', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/arkon']}>
        <Kabuk sayfalar={SAYFALAR.filter((s) => s.yol === '/arkon')} kullaniciAdi="Deneme" cikis={() => {}} anaSayfa="/arkon">
          <p>içerik</p>
        </Kabuk>
      </MemoryRouter>,
    );
    for (const kutu of [screen.getByRole('navigation', { name: 'Ana menü' }), screen.getByRole('navigation', { name: 'Alt gezinme' })]) {
      const ana = within(kutu).getByRole('link', { name: 'Ana sayfa' });
      expect(ana.getAttribute('href')).toBe('/arkon');
      expect(ana.getAttribute('aria-current')).toBe('page');
    }
    expect(document.querySelector('.tc-kabuk-marka')?.getAttribute('href')).toBe('/arkon');
    unmount();
    render(
      <MemoryRouter initialEntries={['/arkon/pano']}>
        <Kabuk sayfalar={SAYFALAR.filter((s) => s.yol === '/arkon')} kullaniciAdi="Deneme" cikis={() => {}} anaSayfa="/arkon">
          <p>içerik</p>
        </Kabuk>
      </MemoryRouter>,
    );
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Ana sayfa' }).getAttribute('aria-current')).toBeNull();
  });

  it('ana sayfa baglantisi alt yollarda secili gorunmez', () => {
    ciz(SAYFALAR.filter((s) => s.yol === '/arkon'), undefined, '/arkon');
    const ana = within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Ana sayfa' });
    expect(ana.getAttribute('aria-current')).toBeNull();
  });

  it('baslik sayfanin kendi yolunda da alt yolunda da sayfanin basligidir; sayfaya ait olmayan yolda uygulama adi', () => {
    const baslik = () => screen.getByRole('heading', { level: 1 }).textContent;
    const { unmount: stokKapat } = ciz(SAYFALAR, undefined, '/stok');
    expect(baslik()).toBe('Stok Merkezi');
    stokKapat();
    const { unmount: altKapat } = ciz(SAYFALAR, undefined, '/stok/alt');
    expect(baslik()).toBe('Stok Merkezi');
    altKapat();
    // Önek yetmez: '/stoklar' stok sayfasının alt yolu değildir.
    const { unmount: benzerKapat } = ciz(SAYFALAR, undefined, '/stoklar');
    expect(baslik()).toBe('CORE');
    benzerKapat();
    ciz(SAYFALAR, undefined, '/bilinmeyen/alt');
    expect(baslik()).toBe('CORE');
  });

  it('yeni ekranin basligi ve menu secimi bagli oldugu sayfadandir, adres onekinden degil', () => {
    const yeniCiz = (yol: string) => render(
      <MemoryRouter initialEntries={[yol]}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme" cikis={() => {}} islemler={[YENI_EKRAN_ISLEMI]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const baslik = () => screen.getByRole('heading', { level: 1 }).textContent;
    const secili = (ad: string) => within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: ad }).getAttribute('aria-current');
    // Planlama Reçete ve Rota'dan ayrı sayfadır (658 b).
    for (const yol of ['/plan/studio']) {
      const { unmount } = yeniCiz(yol);
      expect(baslik()).toBe('Planlama');
      expect(secili('Planlama')).toBe('page');
      expect(secili('Reçete ve Rota')).toBeNull();
      unmount();
    }
    // Kuyruk ve Üretim Terminali'nin yeni ekranı (541) kendi ana menü satırını seçili tutar.
    const { unmount: kuyrukKapat } = yeniCiz('/kuyruk');
    expect(baslik()).toBe('Kuyruk');
    expect(secili('Kuyruk')).toBe('page');
    expect(secili('Üretim Hazırlık')).toBeNull();
    kuyrukKapat();
    const { unmount: terminalKapat } = yeniCiz('/uretim-terminali');
    expect(baslik()).toBe('Üretim Terminali');
    expect(secili('Üretim Terminali')).toBe('page');
    expect(secili('Üretim Hazırlık')).toBeNull();
    terminalKapat();
    // Alt yolda önek kuralı sürer.
    yeniCiz('/arkon/pano');
    expect(baslik()).toBe('Üretim Hazırlık');
    expect(secili('Üretim Hazırlık')).toBe('page');
  });

  it('yetkisi olmayan sayfanin adresinde baslik o sayfanin adini vermez', () => {
    ciz(SAYFALAR.filter((s) => s.yol !== '/finans'), undefined, '/finans');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('CORE');
  });

  it('Tumu dugmesi butun sayfalari tam ekran listede acar', () => {
    ciz();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    const liste = within(screen.getByRole('dialog', { name: 'Tüm sayfalar' }));
    for (const s of SAYFALAR.filter(menudeGorunur)) expect(liste.getByRole('link', { name: s.baslik })).toBeTruthy();
  });

  it('menu yalniz verilen sayfalari gosterir; kullanici adi ve cikis ust cubuktadir', () => {
    const cikis = vi.fn();
    const gorunen = SAYFALAR.filter((s) => s.yol === '/arkon' || s.yol === '/kuyruk');
    ciz(gorunen, cikis);
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    expect(menu.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/arkon', '/kuyruk']);
    expect(screen.getByText('Deneme Kişi')).toBeTruthy();
    // Seyrek kullanılanlar üst çubukta ayrı simge değildir, Hesap menüsündedir.
    const ust = within(screen.getByRole('banner'));
    for (const ad of ['Çıkış yap', 'Koyu temaya geç', 'Performans modunu aç']) expect(ust.queryByRole('button', { name: ad })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    expect(cikis).toHaveBeenCalledTimes(1);
  });

  it('rol listesi menude ayri durmaz: butun sayfalar acilir gruplardadir; sik kullanilan yoksa alt cubuk rol sirasini kullanir (1390 a, 2951)', () => {
    const gorunen = SAYFALAR.filter((s) => ['/arkon', '/kuyruk', '/stok', '/plan'].includes(s.yol));
    render(
      <MemoryRouter>
        <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={['/stok', '/kuyruk', '/cnc-kurulum']}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    expect(menu.queryByRole('button', { name: 'Tüm sayfalar' })).toBeNull();
    for (const s of gorunen) {
      const grup = menu.getByRole('button', { name: s.grup });
      expect(grup.getAttribute('aria-expanded')).toBe('false');
      expect(within(grup.parentElement as HTMLElement).getByRole('link', { name: s.baslik })).toBeTruthy();
      fireEvent.click(grup);
      expect(grup.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(grup);
      expect(grup.getAttribute('aria-expanded')).toBe('false');
    }
    // Görünmeyen sayfa rol listesinde olsa da çıkmaz.
    const alt = within(screen.getByRole('navigation', { name: 'Alt gezinme' }));
    expect(alt.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/stok', '/kuyruk']);
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    const liste = within(screen.getByRole('dialog', { name: 'Tüm sayfalar' }));
    for (const s of gorunen) expect(liste.getByRole('link', { name: s.baslik })).toBeTruthy();
  });

  it('sik kullanilanlar menunun ustunde kisinin sirasiyla durur, gruplarda da kalir; acamadigi sayfa cikmaz; Kayit gir olmayan kiside alt cubuk ilk ucunu alir (2951)', () => {
    const gorunen = SAYFALAR.filter((s) => ['/arkon', '/kuyruk', '/stok', '/plan'].includes(s.yol));
    const istemci = new QueryClient();
    istemci.setQueryData(menuTercihiAnahtari, { sayfalar: ['/plan', '/cnc-kurulum', '/kuyruk', '/arkon', '/stok'], surum: 3 });
    render(
      <QueryClientProvider client={istemci}>
        <MemoryRouter>
          <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={['/stok']}><p>icerik</p></Kabuk>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const sik = within(screen.getByRole('group', { name: 'Sık kullanılanlar' }));
    expect(sik.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/plan', '/kuyruk', '/arkon', '/stok']);
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    for (const s of gorunen) expect(menu.getAllByRole('link', { name: s.baslik })).toHaveLength(2);
    const alt = within(screen.getByRole('navigation', { name: 'Alt gezinme' }));
    expect(alt.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/plan', '/kuyruk', '/arkon']);
  });

  it('Menuyu duzenle: secim, siralama ve rol onerisi; Kaydet secimi surumuyle gonderir; yalniz kisinin sayfalari listelenir (2951)', async () => {
    const gorunen = SAYFALAR.filter((s) => ['/arkon', '/kuyruk', '/stok', '/plan'].includes(s.yol));
    const istemci = new QueryClient();
    istemci.setQueryData(menuTercihiAnahtari, { sayfalar: [], surum: 2 });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ sayfalar: ['/kuyruk', '/stok', '/plan'], surum: 3 });
    render(
      <QueryClientProvider client={istemci}>
        <MemoryRouter>
          <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={['/stok', '/kuyruk', '/cnc-kurulum']}><p>icerik</p></Kabuk>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Seçim yokken bölüm çizilmez; Menüyü düzenle Ana sayfa'nın hemen altında bir menü satırıdır (2952-1).
    expect(screen.queryByRole('group', { name: 'Sık kullanılanlar' })).toBeNull();
    const anaMenu = screen.getByRole('navigation', { name: 'Ana menü' });
    const ana = within(anaMenu).getByRole('link', { name: 'Ana sayfa' });
    expect(ana.nextElementSibling).toBe(within(anaMenu).getByRole('button', { name: 'Menüyü düzenle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Menüyü düzenle' }));
    const pencere = within(screen.getByRole('dialog', { name: 'Menüyü düzenle' }));
    expect(pencere.getAllByRole('checkbox')).toHaveLength(gorunen.length);
    fireEvent.click(pencere.getByRole('button', { name: 'Rolümün önerisi' }));
    const sira = () => within(pencere.getByRole('list')).getAllByRole('listitem').map((l) => l.textContent);
    const ad = (yol: string) => gorunen.find((s) => s.yol === yol)?.baslik ?? '';
    expect(sira()).toEqual([ad('/stok'), ad('/kuyruk')]);
    fireEvent.click(pencere.getByRole('checkbox', { name: ad('/plan') }));
    fireEvent.click(pencere.getByRole('button', { name: `${ad('/kuyruk')} yukarı` }));
    expect(sira()).toEqual([ad('/kuyruk'), ad('/stok'), ad('/plan')]);
    expect(pencere.queryByRole('status')).toBeNull();
    await act(async () => { fireEvent.click(pencere.getByRole('button', { name: 'Kaydet' })); });
    expect(post).toHaveBeenCalledWith('/profil/menu-sec', { sayfalar: ['/kuyruk', '/stok', '/plan'], surum: 2 }, expect.objectContaining({ istekKimligi: expect.any(String) }));
    expect(screen.queryByRole('dialog', { name: 'Menüyü düzenle' })).toBeNull();
    const sik = within(screen.getByRole('group', { name: 'Sık kullanılanlar' }));
    expect(sik.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/kuyruk', '/stok', '/plan']);
    post.mockRestore();
  });

  it('telefonda Menuyu duzenle Tumu listesindedir; secilince liste kapanir, duzenleme penceresi acilir (2951)', () => {
    const istemci = new QueryClient();
    istemci.setQueryData(menuTercihiAnahtari, { sayfalar: [], surum: 0 });
    render(
      <QueryClientProvider client={istemci}>
        <MemoryRouter>
          <Kabuk sayfalar={SAYFALAR.filter((s) => s.yol === '/stok')} kullaniciAdi="Deneme Kişi" cikis={() => undefined}><p>icerik</p></Kabuk>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Tüm sayfalar' })).getByRole('button', { name: 'Menüyü düzenle' }));
    expect(screen.queryByRole('dialog', { name: 'Tüm sayfalar' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Menüyü düzenle' })).toBeTruthy();
  });

  it('her rol gorunumunde kisinin acabildigi her sayfa gruplarda tam bir kez durur (2946, 2951)', () => {
    const gorunen = SAYFALAR.filter(menudeGorunur);
    for (const [rol, g] of Object.entries(ROL_GORUNUMLERI)) {
      const { unmount } = render(
        <MemoryRouter>
          <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={g.sayfalar}><p>icerik</p></Kabuk>
        </MemoryRouter>,
      );
      const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
      const yollar = menu.getAllByRole('link').map((b) => b.getAttribute('href'));
      for (const s of gorunen) expect(yollar.filter((y) => y === s.yol), `${rol} ${s.yol}`).toHaveLength(1);
      unmount();
    }
  });

  it('acik sayfanin grubu acik gelir (2946)', () => {
    const gorunen = SAYFALAR.filter((s) => ['/kuyruk', '/stok', '/plan'].includes(s.yol));
    const plan = gorunen.find((s) => s.yol === '/plan');
    render(
      <MemoryRouter initialEntries={['/plan']}>
        <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={['/stok', '/kuyruk']}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    const grup = menu.getByRole('button', { name: plan?.grup ?? '' });
    expect(grup.getAttribute('aria-expanded')).toBe('true');
    // Kişi açık sayfanın grubunu da kapatabilir; başlık ölü düğme değildir.
    fireEvent.click(grup);
    expect(grup.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(grup);
    expect(grup.getAttribute('aria-expanded')).toBe('true');
  });

  it('grup basligi simgeli seritte de dugmedir: adi ipucu ve erisilebilir ad, grubun simgesiyle cizilir (2946)', () => {
    const gorunen = SAYFALAR.filter((s) => ['/kuyruk', '/stok', '/plan'].includes(s.yol));
    const plan = gorunen.find((s) => s.yol === '/plan');
    render(
      <MemoryRouter>
        <Kabuk sayfalar={gorunen} kullaniciAdi="Deneme Kişi" cikis={() => undefined} menuSirasi={['/stok', '/kuyruk']}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const grup = within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('button', { name: plan?.grup ?? '' });
    expect(grup.getAttribute('title')).toBe(plan?.grup);
    // Görünen sayı ekran okuyucuya açıklama olarak gider; ad grup adıdır.
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('button', { name: plan?.grup ?? '', description: '1 sayfa' })).toBe(grup);
    expect(grup.querySelector('.tc-kabuk-acilir-simge svg')).not.toBeNull();
  });

  it('Tumu listesi Esc ile kapanir ve odagi Tumu dugmesine geri verir', () => {
    ciz();
    const tumu = screen.getByRole('button', { name: 'Tümü' });
    tumu.focus();
    fireEvent.click(tumu);
    const liste = screen.getByRole('dialog', { name: 'Tüm sayfalar' });
    expect(liste.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(liste, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tumu);
  });

  it('tema dugmesi data-theme degistirir ve localStorage a yazar', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Koyu temaya geç' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(TEMA_ANAHTARI)).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Açık temaya geç' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(TEMA_ANAHTARI)).toBe('light');
  });

  it('kapalı sayfa menüden kalkar; adresle açılınca içerik yerine "kapalı" yazar; altındaki adres de kapalıdır', () => {
    const finans = SAYFALAR.find((s) => s.yol === '/finans');
    expect(finans).toBeTruthy();
    const kur = (yol: string) => render(
      <MemoryRouter initialEntries={[yol]}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} kapali={['/finans']}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const ana = kur('/');
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).queryByRole('link', { name: finans?.baslik })).toBeNull();
    expect(screen.getByText('icerik')).toBeTruthy();
    ana.unmount();
    const alt = kur('/finans/deneme');
    expect(screen.getByText('Bu sayfa şu an kapalı')).toBeTruthy();
    expect(screen.queryByText('icerik')).toBeNull();
    alt.unmount();
  });

  it('sol üstte sürüm ve derleme tarihi yazar; logo verilince firma işaretinin yerinde durur', () => {
    const { container, unmount } = ciz();
    // Güncelleyicinin kurduğu derlemede yayın adı (2026.11.01-1), elle kurulumda package.json yer tutucusu yerine "geliştirme".
    expect(container.querySelector('.tc-kabuk-surum')?.textContent).toMatch(/^(geliştirme|\d{4}\.\d{2}\.\d{2}-\d+) · \d{2}\.\d{2}\.\d{4}$/);
    expect(container.querySelector('.tc-kabuk-marka-logo')).toBeNull();
    unmount();
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const ikinci = render(
      <MemoryRouter><Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} logo={logo}><p>icerik</p></Kabuk></MemoryRouter>,
    );
    expect(ikinci.container.querySelector('.tc-kabuk-marka-logo')?.getAttribute('src')).toBe(logo);
    expect(ikinci.container.querySelector('.tc-kabuk-marka-isaret')).toBeNull();
  });

  it('logo yokken marka isaretinde firma adi durur; firma adi bossa isaret cizilmez, yalniz CORE kalir', () => {
    const kur = (ad: string | null) => {
      const istemci = new QueryClient();
      istemci.setQueryData(anahtarlar.kurum, { ad });
      return render(
        <QueryClientProvider client={istemci}>
          <MemoryRouter><Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined}><p>icerik</p></Kabuk></MemoryRouter>
        </QueryClientProvider>,
      );
    };
    const dolu = kur('Ornek Atolye');
    expect(dolu.container.querySelector('.tc-kabuk-marka-isaret')?.textContent).toBe('Ornek Atolye');
    expect(dolu.container.querySelector('.tc-kabuk-marka-metin')?.textContent).toBe('CORE');
    expect(document.title).toBe('Ornek Atolye CORE');
    dolu.unmount();
    const bos = kur('  ');
    expect(bos.container.querySelector('.tc-kabuk-marka-isaret')).toBeNull();
    expect(bos.container.querySelector('.tc-kabuk-marka-metin')?.textContent).toBe('CORE');
    expect(document.title).toBe('CORE');
    bos.unmount();
    // Sözleşme ad'ı metin der; eski ya da eksik bir cevap null getirse de kabuk çökmez.
    const yok = kur(null);
    expect(yok.container.querySelector('.tc-kabuk-marka-isaret')).toBeNull();
    expect(yok.container.querySelector('.tc-kabuk-marka-metin')?.textContent).toBe('CORE');
    yok.unmount();
  });

  it('Üretim Terminali ve Kuyruk şeridi tek maddeye düşünce kabuk data-ikinci-tek taşır (telefonda şerit çizilmez); başka sayfada ve çok maddede taşımaz', async () => {
    const madde = (anahtar: string, yol: `/${string}`, islem: string) => ({ anahtar, baslik: anahtar, yol, simge: 'list' as const, islem });
    const menu = (kok: `/${string}`): IkinciMenu => ({ kok, baslik: 'Örnek Modül', simge: 'cube', gruplar: [{ maddeler: [madde('ana', kok, 'ornek.oku'), madde('ek', `${kok}/ek`, 'ornek.ek')] }] });
    const tekMi = (kok: `/${string}`, islemler: string[]) => {
      const r = render(
        <MemoryRouter initialEntries={[kok]}>
          <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ikinciMenuler={[menu(kok)]}><p>icerik</p></Kabuk>
        </MemoryRouter>,
      );
      const k = r.container.querySelector('.tc-kabuk');
      const sonuc = [k?.hasAttribute('data-ikinci'), k?.hasAttribute('data-ikinci-tek')];
      r.unmount();
      return sonuc;
    };
    expect(tekMi('/kuyruk', ['ornek.oku'])).toEqual([true, true]);
    expect(tekMi('/kuyruk', ['ornek.oku', 'ornek.ek'])).toEqual([true, false]);
    expect(tekMi('/stok', ['ornek.oku'])).toEqual([true, false]);
  });
  it('menuyu daralt dugmesi ve Ctrl+B ana menuyu simge seridine daraltir, geri acar; tercih tarayicida kalir (682 a)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(min-width: 1024px)', media: q }));
    try {
      const { container, unmount } = ciz();
      const kabuk = container.querySelector('.tc-kabuk')!;
      const dugme = screen.getByRole('button', { name: 'Menüyü daralt' });
      expect(dugme.getAttribute('aria-expanded')).toBe('true');
      expect(kabuk.hasAttribute('data-menu-dar')).toBe(false);
      fireEvent.click(dugme);
      expect(kabuk.hasAttribute('data-menu-dar')).toBe(true);
      expect(screen.getByRole('button', { name: 'Menüyü genişlet' }).getAttribute('aria-expanded')).toBe('false');
      expect(localStorage.getItem(cihazTercihiAnahtari('ana-menu-dar'))).toBe('acik');
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
      expect(kabuk.hasAttribute('data-menu-dar')).toBe(false);
      fireEvent.keyDown(document, { key: 'b' });
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true, shiftKey: true });
      expect(kabuk.hasAttribute('data-menu-dar')).toBe(false);
      fireEvent.keyDown(document, { key: 'B', ctrlKey: true });
      expect(kabuk.hasAttribute('data-menu-dar')).toBe(true);
      unmount();
      cihazTercihleriniSifirla();
      const yeniden = ciz();
      expect(yeniden.container.querySelector('.tc-kabuk')!.hasAttribute('data-menu-dar')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Ctrl+B masaustu genisligi altinda menuyu degistirmez', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q }));
    try {
      const { container } = ciz();
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
      expect(container.querySelector('.tc-kabuk')!.hasAttribute('data-menu-dar')).toBe(false);
      expect(localStorage.getItem(cihazTercihiAnahtari('ana-menu-dar'))).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('2052-1 a: üst yuvaya konan şerit üst çubukta çizilir, kabuk data-ust-yuva taşır; yuva kalkınca işaret de kalkar', () => {
    const kur = (yuvada: boolean) => (
      <MemoryRouter initialEntries={['/']}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined}>
          {yuvada ? <KabukUstYuvasi><span>terminal şeridi</span></KabukUstYuvasi> : <p>icerik</p>}
        </Kabuk>
      </MemoryRouter>
    );
    const { container, rerender } = render(kur(true));
    const serit = screen.getByText('terminal şeridi');
    expect(serit.closest('.tc-kabuk-ust')).not.toBeNull();
    expect(serit.closest('main')).toBeNull();
    expect(container.querySelector('.tc-kabuk')?.hasAttribute('data-ust-yuva')).toBe(true);
    expect(screen.getByRole('button', { name: /Hesap/ })).toBeTruthy();
    rerender(kur(false));
    expect(container.querySelector('.tc-kabuk')?.hasAttribute('data-ust-yuva')).toBe(false);
  });

  it('2097: kalıcı terminal görünürken şeridi üst çubukta; başka sayfada gizlenince üst çubuk normale döner', () => {
    function Terminal() { return <KabukUstYuvasi><span>terminal şeridi</span></KabukUstYuvasi>; }
    let git: NavigateFunction = () => undefined;
    function Gezgin() { git = useNavigate(); return null; }
    const { container } = render(
      <MemoryRouter initialEntries={['/uretim-terminali']}>
        <Gezgin />
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined}>
          <KaliciEkranlar rotalar={[{ yol: '/uretim-terminali', ekran: Terminal, kalici: true }]} />
        </Kabuk>
      </MemoryRouter>,
    );
    const kabuk = () => container.querySelector('.tc-kabuk');
    expect(screen.getByText('terminal şeridi').closest('.tc-kabuk-ust')).not.toBeNull();
    expect(kabuk()?.hasAttribute('data-ust-yuva')).toBe(true);
    // Ret: terminal gizliyken şeridi üst çubukta kalmaz, yuva dolu sayılmaz.
    act(() => { void git('/etiket-merkezi'); });
    expect(screen.queryByText('terminal şeridi')).toBeNull();
    expect(kabuk()?.hasAttribute('data-ust-yuva')).toBe(false);
    expect(container.querySelector('.tc-kalici-ekran')?.hasAttribute('hidden')).toBe(true);
    act(() => { void git('/uretim-terminali'); });
    expect(screen.getByText('terminal şeridi').closest('.tc-kabuk-ust')).not.toBeNull();
    expect(kabuk()?.hasAttribute('data-ust-yuva')).toBe(true);
  });

  it('2137-1 a: seritte isaretli eylem uste yuva doluyken gorunur sarmalayicida, isaretsiz eylem sarmalayicisiz cizilir', () => {
    const okut = { anahtar: 'okut', sira: 1, islem: 'oturum' as const, seritte: true, dugme: () => <button type="button">Okut</button> };
    const arama = { anahtar: 'diger', sira: 2, islem: 'oturum' as const, dugme: () => <button type="button">Diğer</button> };
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={[]} ustEylemler={[okut, arama]}>
          <KabukUstYuvasi><span>terminal şeridi</span></KabukUstYuvasi>
        </Kabuk>
      </MemoryRouter>,
    );
    expect(container.querySelector('.tc-kabuk')?.hasAttribute('data-ust-yuva')).toBe(true);
    // kabuk.css: yuvanın ardındaki öğeler gizlenir, .tc-kabuk-seritte gizlenmez (jsdom stil uygulamaz, sınıf denetlenir).
    expect(screen.getByRole('button', { name: 'Okut' }).parentElement?.classList.contains('tc-kabuk-seritte')).toBe(true);
    // Ret: işaretsiz eylem sarmalanmaz, şeritli sayfada gizli kalır.
    expect(screen.getByRole('button', { name: 'Diğer' }).closest('.tc-kabuk-seritte')).toBeNull();
  });

  it('2052-1 a: kabuk dışında üst yuva içeriği yerinde çizer', () => {
    render(<div data-testid="yer"><KabukUstYuvasi><span>yerinde</span></KabukUstYuvasi></div>);
    expect(screen.getByText('yerinde').closest('[data-testid="yer"]')).not.toBeNull();
  });
});
