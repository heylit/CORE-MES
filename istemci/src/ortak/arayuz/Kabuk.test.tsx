import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR, menudeGorunur, type Sayfa } from '#paylasilan/sayfalar.ts';
import { Kabuk } from './Kabuk.tsx';
import { TEMA_ANAHTARI } from '../veri/tema.ts';
import { YENI_EKRAN_ISLEMI } from '../rota/yeni-ekran.tsx';

function ciz(sayfalar: readonly Sayfa[] = SAYFALAR, cikis: () => void = () => undefined, yol = '/') {
  return render(
    <MemoryRouter initialEntries={[yol]}>
      <Kabuk sayfalar={sayfalar} kullaniciAdi="Deneme Kişi" cikis={cikis}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
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
    fireEvent.click(screen.getByRole('button', { name: 'Ne oldu? Kayıt gir' }));
    const panel = within(screen.getByRole('dialog', { name: 'Ne oldu?' }));
    expect(panel.getByRole('heading', { name: 'Stok' })).toBeTruthy();
    fireEvent.click(panel.getByRole('button', { name: /Malzeme geldi/ }));
    expect(screen.queryByRole('dialog', { name: 'Ne oldu?' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stok Merkezi');
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
    expect(bekletilen.map((s) => s.yol)).toEqual(['/emirler', '/terminal', '/cizelge', '/matris', '/mesai', '/rota', '/smartes']);
    // Yalnız bekletilen ve bir görünür sayfa verilir: alt gezinmenin ilk dört yeri bekletileni dışarıda bırakamaz.
    ciz(SAYFALAR.filter((s) => s.yol === '/terminal' || s.yol === '/kuyruk'), undefined, '/terminal');
    const adresler = (kutu: HTMLElement) => within(kutu).getAllByRole('link').map((b) => b.getAttribute('href'));
    expect(adresler(screen.getByRole('navigation', { name: 'Ana menü' }))).toEqual(['/', '/profil', '/kuyruk']);
    expect(adresler(screen.getByRole('navigation', { name: 'Alt gezinme' }))).toEqual(['/', '/kuyruk']);
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    expect(adresler(screen.getByRole('dialog', { name: 'Tüm sayfalar' }))).toEqual(['/', '/profil', '/kuyruk']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terminal');
  });

  it('sayfalar grup basliginin altinda liste sirasiyla durur; gruplar ilk gorunus sirasindadir', () => {
    // Araya giren başka grup sayfası grubu ikiye bölmez.
    const karisik = ['/recete-rota', '/kalibrasyon', '/durus-nedenleri', '/arkon']
      .flatMap((yol) => SAYFALAR.filter((s) => s.yol === yol));
    ciz(karisik);
    const menu = screen.getByRole('navigation', { name: 'Ana menü' });
    const altindakiler = (grup: string) =>
      within(within(menu).getByText(grup).parentElement as HTMLElement).getAllByRole('link').map((b) => b.getAttribute('href'));
    expect(altindakiler('Tanımlar')).toEqual(['/recete-rota', '/durus-nedenleri']);
    expect(altindakiler('Kalite')).toEqual(['/kalibrasyon']);
    expect(altindakiler('Üretim')).toEqual(['/arkon']);
    expect(within(menu).getAllByRole('link').map((b) => b.getAttribute('href')))
      .toEqual(['/', '/profil', '/recete-rota', '/durus-nedenleri', '/kalibrasyon', '/arkon']);
  });

  it('Sistem Ayarlari kendi Yonetim grubundadir ve menude en sonda durur', () => {
    ciz();
    const baglantilar = within(screen.getByRole('navigation', { name: 'Ana menü' })).getAllByRole('link');
    expect(baglantilar.length).toBeGreaterThan(2);
    const son = baglantilar.at(-1) as HTMLElement;
    expect(son.getAttribute('href')).toBe('/ayarlar');
    // Grup adı kullanıcı kararıdır; bağlantı o başlığın altındadır.
    const grup = within(screen.getByRole('navigation', { name: 'Ana menü' })).getByText('Yönetim').parentElement as HTMLElement;
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

  it('baslik sayfanin kendi yolunda da alt yolunda da sayfanin basligidir; sayfaya ait olmayan yolda TMI CORE', () => {
    const baslik = () => screen.getByRole('heading', { level: 1 }).textContent;
    const { unmount: stokKapat } = ciz(SAYFALAR, undefined, '/stok');
    expect(baslik()).toBe('Stok Merkezi');
    stokKapat();
    const { unmount: altKapat } = ciz(SAYFALAR, undefined, '/stok/alt');
    expect(baslik()).toBe('Stok Merkezi');
    altKapat();
    // Önek yetmez: '/stoklar' stok sayfasının alt yolu değildir.
    const { unmount: benzerKapat } = ciz(SAYFALAR, undefined, '/stoklar');
    expect(baslik()).toBe('TMI CORE');
    benzerKapat();
    ciz(SAYFALAR, undefined, '/bilinmeyen/alt');
    expect(baslik()).toBe('TMI CORE');
  });

  it('yeni ekranin basligi ve menu secimi bagli oldugu sayfadandir, adres onekinden degil', () => {
    const yeniCiz = (yol: string) => render(
      <MemoryRouter initialEntries={[yol]}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme" cikis={() => {}} islemler={[YENI_EKRAN_ISLEMI]}><p>icerik</p></Kabuk>
      </MemoryRouter>,
    );
    const baslik = () => screen.getByRole('heading', { level: 1 }).textContent;
    const secili = (ad: string) => within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: ad }).getAttribute('aria-current');
    const { unmount: planlamaKapat } = yeniCiz('/recete-rota/planlama-yeni/plan');
    expect(baslik()).toBe('Reçete ve Rota');
    expect(secili('Planlama (yeni)')).toBe('page');
    expect(secili('Reçete ve Rota')).toBeNull();
    planlamaKapat();
    // Eski adresine geçen yeni ekran (541) kendi ana menü satırını seçili tutar.
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
    // Alt yolda önek kuralı sürer: yeni ve eski görünüm aynı satırdadır.
    for (const yol of ['/arkon/pano', '/arkon/eski/pano']) {
      const { unmount } = yeniCiz(yol);
      expect(baslik()).toBe('Üretim Hazırlık');
      expect(secili('Üretim Hazırlık')).toBe('page');
      unmount();
    }
  });

  it('yetkisi olmayan sayfanin adresinde baslik o sayfanin adini vermez', () => {
    ciz(SAYFALAR.filter((s) => s.yol !== '/finans'), undefined, '/finans');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TMI CORE');
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
    expect(menu.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/profil', '/arkon', '/kuyruk']);
    expect(screen.getByText('Deneme Kişi')).toBeTruthy();
    // Seyrek kullanılanlar üst çubukta ayrı simge değildir, Hesap menüsündedir.
    const ust = within(screen.getByRole('banner'));
    for (const ad of ['Çıkış yap', 'Koyu temaya geç', 'Performans modunu aç']) expect(ust.queryByRole('button', { name: ad })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    expect(cikis).toHaveBeenCalledTimes(1);
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

  it('sol üstte sürüm ve derleme tarihi yazar; logo verilince TMI işaretinin yerinde durur', () => {
    const { container, unmount } = ciz();
    expect(container.querySelector('.tc-kabuk-surum')?.textContent).toMatch(/^v\d+\.\d+\.\d+ · \d{2}\.\d{2}\.\d{4}$/);
    expect(container.querySelector('.tc-kabuk-marka-logo')).toBeNull();
    unmount();
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    const ikinci = render(
      <MemoryRouter><Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} logo={logo}><p>icerik</p></Kabuk></MemoryRouter>,
    );
    expect(ikinci.container.querySelector('.tc-kabuk-marka-logo')?.getAttribute('src')).toBe(logo);
    expect(ikinci.container.querySelector('.tc-kabuk-marka-isaret')).toBeNull();
  });
});
