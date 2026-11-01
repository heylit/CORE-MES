import { lazy } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { VERI_ISLEMLERI } from '#paylasilan/islemler.ts';
import { SAYFALAR, SAYFA_ISLEMLERI, menudeGorunur } from '#paylasilan/sayfalar.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KarsilamaCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { CikisCevabi, GirisGovdesi, OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { SaglikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { App } from './App.tsx';
import { anaSayfaKaynaklari, anaSayfaKartlari } from './ortak/rota/ana-sayfa.ts';
import { modulRotalari, type ModulRotasi } from './ortak/rota/kesif.ts';
import { OTURUM_BITTI, ULASILAMADI_ILETISI, api } from './ortak/veri/api.ts';
import { baglantiSifirla } from './ortak/veri/baglanti.ts';

const OPERATOR: Kullanici = { id: 7, ad: 'Deneme Operatör', islemler: ['sayfa.kuyruk'] };

interface Cagri { yontem: string; yol: string; govde: unknown }

// Sunucunun oturum uçlarını taklit eder; oturum durumu testin elindedir.
// Sunucunun gerçek cevabı: aynı kullanıcı adı ve cihazdan süren başka bir giriş denemesi varken.
const SURUYOR: HataGovdesi = { kod: 'COK_ISTEK', mesaj: 'Aynı anda başka bir giriş denemesi sürüyor. Birazdan yeniden deneyin.' };

// Sunucunun gerçek cevabı: çerezli istekte veritabanına ulaşılamayınca kimlik çözülemez.
const KIMLIK_YOK = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.' } satisfies HataGovdesi;
const MESGUL = { kod: 'MESGUL', mesaj: 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.' } satisfies HataGovdesi;
const hataCevabi = (durum: number, govde: HataGovdesi) => () => new Response(JSON.stringify(govde), { status: durum });
const agYok = (): Response => { throw new TypeError('Failed to fetch'); };

// oturum, cikis: verilirse o ucun cevabını test belirler (hata cevabı ya da ağ hatası).
function sunucuKur(baslangic: Kullanici | null, ozel: { oturum?: () => Response; cikis?: () => Response; karsilama?: () => Response } = {}) {
  let kullanici = baslangic;
  const cagrilar: Cagri[] = [];
  const cevap = (durum: number, govde: unknown) =>
    new Response(govde === undefined ? null : JSON.stringify(govde), { status: durum });

  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: RequestInit = {}) => {
    const yontem = secenek.method ?? 'GET';
    const yol = adres.replace('/api', '');
    const govde = typeof secenek.body === 'string' ? JSON.parse(secenek.body) as Partial<GirisGovdesi> : undefined;
    cagrilar.push({ yontem, yol, govde });

    if (yol === '/oturum' && yontem === 'GET' && ozel.oturum) return ozel.oturum();
    if (yol === '/oturum/cikis' && ozel.cikis) return ozel.cikis();
    if (yol === '/oturum' && yontem === 'GET') return cevap(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/oturum/giris') {
      if (govde?.parola === 'ayni-anda') return cevap(429, SURUYOR);
      if (govde?.parola === 'ag-yok') throw new TypeError('Failed to fetch');
      if (govde?.parola !== 'dogru') return cevap(401, { kod: 'OTURUM_YOK', mesaj: 'Kullanıcı adı ya da parola hatalı.' });
      kullanici = OPERATOR;
      return cevap(200, { kullanici } satisfies OturumCevabi);
    }
    if (yol === '/oturum/cikis') { kullanici = null; return cevap(204, undefined satisfies CikisCevabi); }
    if (yol === '/karsilama' && ozel.karsilama) return ozel.karsilama();
    if (yol === '/saglik') return cevap(200, { durum: 'ok' } satisfies SaglikCevabi);
    return cevap(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

// Giriş ekranı PIN ile açılır; bu testler parola yolunu kullanır.
function girisYap(parola: string) {
  const parolaYolu = screen.queryByRole('button', { name: 'Parola ile gir' });
  if (parolaYolu) fireEvent.click(parolaYolu);
  fireEvent.change(screen.getByLabelText(/Kullanıcı adı/), { target: { value: 'operator1' } });
  fireEvent.change(screen.getByLabelText(/Parola/), { target: { value: parola } });
  fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
}

beforeEach(() => { window.history.replaceState(null, '', '/'); window.localStorage.clear(); baglantiSifirla(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('App oturum akisi', () => {
  it('oturum yokken giris ekrani gelir; hatali parola mesaji gosterir ve parolayi bosaltir', async () => {
    const cagrilar = sunucuKur(null);
    const oturumBitti = vi.fn();
    window.addEventListener(OTURUM_BITTI, oturumBitti);
    render(<App />);
    await screen.findByRole('button', { name: 'Giriş yap' });
    expect(screen.queryByRole('navigation')).toBeNull();

    girisYap('yanlis');
    expect((await screen.findByRole('alert')).textContent).toBe('Kullanıcı adı ya da parola hatalı.');
    expect((screen.getByLabelText(/Parola/) as HTMLInputElement).value).toBe('');
    window.removeEventListener(OTURUM_BITTI, oturumBitti);
    // Reddedilen giriş biten bir oturum değildir: olay yayılmaz, oturum yeniden sorulmaz.
    expect(cagrilar.some((c) => c.yol === '/oturum/giris')).toBe(true);
    expect(oturumBitti).not.toHaveBeenCalled();
    expect(cagrilar.filter((c) => c.yol === '/oturum' && c.yontem === 'GET')).toHaveLength(1);
  });

  it('ayni anda suren giris denemesi yuzunden reddedilen giris (429) sunucunun iletisini gosterir; oturum bitmis sayilmaz', async () => {
    sunucuKur(null);
    const oturumBitti = vi.fn();
    window.addEventListener(OTURUM_BITTI, oturumBitti);
    render(<App />);
    await screen.findByRole('button', { name: 'Giriş yap' });

    girisYap('ayni-anda');
    expect((await screen.findByRole('alert')).textContent).toBe(SURUYOR.mesaj);
    window.removeEventListener(OTURUM_BITTI, oturumBitti);
    expect(oturumBitti).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeTruthy();
  });

  it('giris isteginde sunucuya ulasilamazsa nedeni yazar, tarayicinin hata metni yazmaz', async () => {
    sunucuKur(null);
    render(<App />);
    await screen.findByRole('button', { name: 'Giriş yap' });

    girisYap('ag-yok');
    expect((await screen.findByRole('alert')).textContent).toBe(ULASILAMADI_ILETISI);
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('giristen sonra menu yalniz yetkili sayfalari gosterir; cikis giris ekranina doner', async () => {
    const cagrilar = sunucuKur(null);
    render(<App />);
    await screen.findByRole('button', { name: 'Giriş yap' });
    girisYap('dogru');

    const menu = within(await screen.findByRole('navigation', { name: 'Ana menü' }));
    expect(menu.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/profil', '/kuyruk']);
    expect(cagrilar.find((c) => c.yol === '/oturum/giris')?.govde).toEqual({ kullaniciAdi: 'operator1', parola: 'dogru' });

    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    await screen.findByRole('button', { name: 'Giriş yap' });
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('giristen sonra karsilama adiyla bir kez cikar; cikip yeniden giren yeniden karsilanir', async () => {
    window.sessionStorage.clear();
    const metin = 'Deneme karşılama';
    sunucuKur(null, { karsilama: () => new Response(JSON.stringify({ acik: true, metin, geceMetni: metin, gunduzBaslangic: 6, geceBaslangic: 18 } satisfies KarsilamaCevabi), { status: 200 }) });
    render(<App />);
    await screen.findByRole('button', { name: 'Giriş yap' });
    girisYap('dogru');
    const karsilama = await screen.findByRole('dialog', { name: metin });
    expect(karsilama.textContent).toContain(OPERATOR.ad);
    fireEvent.click(within(karsilama).getByRole('button', { name: 'Başlayalım' }));
    expect(screen.queryByRole('dialog', { name: metin })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    await screen.findByRole('button', { name: 'Giriş yap' });
    girisYap('dogru');
    expect((await screen.findByRole('dialog', { name: metin })).textContent).toContain(OPERATOR.ad);
  });

  it('oturum sorgusu hata cevabi alirsa sunucunun iletisi yazar (503 kimlik, 503 mesgul)', async () => {
    for (const govde of [KIMLIK_YOK, MESGUL]) {
      sunucuKur(OPERATOR, { oturum: hataCevabi(503, govde) });
      render(<App />);
      expect((await screen.findByRole('alert')).textContent).toContain(govde.mesaj);
      expect(screen.queryByText(/Sunucuya ulaşılamadı/)).toBeNull();
      expect(screen.queryByRole('navigation')).toBeNull();
      cleanup();
    }
  });

  it('oturum sorgusunda sunucuya ulasilamazsa nedeni yazar, tarayicinin hata metni yazmaz', async () => {
    sunucuKur(OPERATOR, { oturum: agYok });
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain(ULASILAMADI_ILETISI);
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('acik oturumda sunucu kapanirsa (guncelleme) ekran kapanmaz, ustte durum yazar; sunucu donunce uyari kalkar', async () => {
    sunucuKur(OPERATOR);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Ana menü' });
    // Sunucu kapalıyken önizleme vekili JSON olmayan 5xx döner; oturum yeniden okunur ve okunamaz.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));
    act(() => { window.dispatchEvent(new CustomEvent(OTURUM_BITTI)); });
    expect((await screen.findByText(/güncelleme ya da bağlantı kesintisi/)).closest('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hesap' })).toBeTruthy();

    sunucuKur(OPERATOR);
    await act(async () => { await api.get('/saglik'); });
    expect(screen.queryByText(/güncelleme ya da bağlantı kesintisi/)).toBeNull();
    expect(await screen.findByText(/Bağlantı geri geldi/)).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
  });

  it('cikis hata cevabi alirsa sunucunun iletisi bildirilir, oturum acik kalir; ulasilamazsa nedeni bildirilir', async () => {
    sunucuKur(OPERATOR, { cikis: hataCevabi(503, MESGUL) });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Ana menü' });
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    expect((await screen.findByRole('alert')).textContent).toContain(MESGUL.mesaj);
    expect(screen.queryByText(/Çıkış yapılamadı/)).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
    cleanup();

    sunucuKur(OPERATOR, { cikis: agYok });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Ana menü' });
    fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));
    expect((await within(screen.getByRole('region', { name: 'Bildirimler' })).findByRole('alert')).textContent).toContain(ULASILAMADI_ILETISI);
    // Ulaşılamayan çıkış bağlantı şeridini de açar: çıkışın sunucuya varıp varmadığı bilinmez.
    expect(screen.getByText(/Sunucuya ulaşılamıyor, yeniden deneniyor/)).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
  });

  it('acik oturumla dogrudan kabuk gelir; yetkisiz sayfa adresi icerik gostermez', async () => {
    sunucuKur(OPERATOR);
    window.history.replaceState(null, '', '/stok');
    render(<App />);
    await screen.findByRole('navigation', { name: 'Ana menü' });
    expect(screen.getByRole('status').textContent).toContain('yetkiniz yok');
  });
});

describe('App modul rotalari', () => {
  const TerminalEkrani = () => <p>Terminal ekranı</p>;
  const StokEkrani = () => <p>Stok ekranı</p>;
  const StokKaydi = () => <p>Stok kaydı</p>;
  const rotalar = [
    { yol: '/terminal', ekran: TerminalEkrani },
    { yol: '/stok', ekran: StokEkrani },
    { yol: '/stok/:id', ekran: StokKaydi },
  ];
  const IKI_SAYFA: Kullanici = { ...OPERATOR, islemler: ['sayfa.terminal', 'sayfa.kuyruk'] };
  const STOK_GOREN: Kullanici = { ...OPERATOR, islemler: ['sayfa.stok'] };
  // Sayfa işlemi dışında bütün veri işlemleri: veri yetkisi menüye sayfa getirmez.
  const YALNIZ_VERI: Kullanici = { ...OPERATOR, islemler: ['sayfa.kuyruk', ...VERI_ISLEMLERI] };
  const HER_SAYFA: Kullanici = { ...OPERATOR, islemler: [...SAYFA_ISLEMLERI] };

  async function ac(kullanici: Kullanici, yol: string, verilen?: readonly ModulRotasi[]) {
    sunucuKur(kullanici);
    window.history.replaceState(null, '', yol);
    render(verilen ? <App rotalar={verilen} /> : <App />);
    await screen.findByRole('navigation', { name: 'Ana menü' });
  }

  it('ana sayfa kabugundur: modul klasorunden kesfedilen kartlar ve kaynaklar gelir, modul "/" rotasi vermez', async () => {
    // Kartın metnine bakılmaz: metin modüle aittir, burada ölçülen keşfin kendisidir.
    expect(modulRotalari.some((r) => r.yol === '/')).toBe(false);
    expect(anaSayfaKartlari.length).toBeGreaterThan(0);
    expect(anaSayfaKaynaklari.length).toBeGreaterThan(0);

    // Operatörün günü (Arkon kaynağı) her kurulumda vardır; kişiseldir, operatör rolünü rol panosuna geçirir (kart 1585).
    await ac({ ...OPERATOR, roller: ['operator'], islemler: [...OPERATOR.islemler, 'sayfa.uretim-terminali'] }, '/');
    expect(screen.getByRole('region', { name: /İşlerim/ })).toBeTruthy();
    expect(screen.queryByText('Sayfa bulunamadı')).toBeNull();
  });

  it('modulun rota verdigi sayfada yer tutucunun yerine modulun ekrani gelir', async () => {
    await ac(IKI_SAYFA, '/terminal', rotalar);
    expect(screen.getByText('Terminal ekranı')).toBeTruthy();
    expect(screen.queryByText(/yapım aşamasında/)).toBeNull();
    // Bekletilen sayfa: adresi açılır, menüde bağlantısı yoktur.
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    expect(menu.getAllByRole('link').map((b) => b.getAttribute('href'))).toEqual(['/', '/profil', '/kuyruk']);
  });

  it('rota verilmeyen gorunur sayfa yer tutucuda kalir', async () => {
    await ac(IKI_SAYFA, '/kuyruk', rotalar);
    expect(screen.getByRole('status').textContent).toContain('yapım aşamasında');
  });

  it('menudeki her baglanti acilir: rotasi henuz olmayan sayfa da kendi basligiyla gelir, bulunamadi cikmaz', async () => {
    await ac(HER_SAYFA, '/');
    const menu = within(screen.getByRole('navigation', { name: 'Ana menü' }));
    for (const s of SAYFALAR.filter(menudeGorunur)) {
      fireEvent.click(menu.getByRole('link', { name: s.baslik }));
      expect(window.location.pathname).toBe(s.yol);
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(s.baslik);
      expect(screen.getByRole('main').childElementCount, s.yol).toBeGreaterThan(0);
      expect(screen.queryByText('Sayfa bulunamadı'), s.yol).toBeNull();
    }
    // Karşı örnek: sayfa listesinde olmayan adres bulunamadı ekranına düşer.
    cleanup();
    await ac(HER_SAYFA, '/boyle-sayfa-yok');
    expect(screen.getByText('Sayfa bulunamadı')).toBeTruthy();
  });

  it('modul rota verse de kullanicinin goremedigi sayfa acilmaz; gorebilen icin acilir', async () => {
    await ac(IKI_SAYFA, '/stok', rotalar);
    expect(screen.getByRole('status').textContent).toContain('yetkiniz yok');
    expect(screen.queryByText('Stok ekranı')).toBeNull();
    cleanup();

    await ac(STOK_GOREN, '/stok', rotalar);
    expect(screen.getByText('Stok ekranı')).toBeTruthy();
  });

  it('menu yalniz sayfa islemlerinden suzulur: veri islemi sayfayi menuye getirmez, sayfa islemi getirir', async () => {
    await ac(YALNIZ_VERI, '/');
    const menu = () => within(screen.getByRole('navigation', { name: 'Ana menü' }));
    const adresler = () => menu().getAllByRole('link').map((b) => b.getAttribute('href'));
    // Veri işlemleri yeni ekran kapısını da (kisiler.rol-yonet) taşır; Kuyruk'un deneme satırı yoktur, ana menüdeki satırı yeni ekranı açar (541).
    expect(adresler()).toEqual(['/', '/profil', '/kuyruk']);
    cleanup();

    await ac({ ...YALNIZ_VERI, islemler: [...VERI_ISLEMLERI] }, '/');
    expect(adresler()).toEqual(['/', '/profil']);
    cleanup();

    await ac({ ...YALNIZ_VERI, islemler: ['sayfa.personel'] }, '/');
    expect(adresler()).toEqual(['/', '/profil', '/personel']);
  });

  it('rolun acilis sayfasi ana sayfadan bir kez acilir ve Ana sayfa baglantisi oraya gider; ekrani kurulmamis hedefte ana sayfa kalir', async () => {
    const TERMINALCI: Kullanici = { ...IKI_SAYFA, acilisSayfasi: '/terminal' };
    await ac(TERMINALCI, '/', rotalar);
    expect(await screen.findByText('Terminal ekranı')).toBeTruthy();
    expect(window.location.pathname).toBe('/terminal');
    const anaBaglanti = within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Ana sayfa' });
    expect(anaBaglanti.getAttribute('href')).toBe('/terminal');
    cleanup();

    // Başka adresle açılan uygulama oraya gider; açılış sayfası yalnız ana sayfadan açılışta uygulanır.
    await ac(TERMINALCI, '/kuyruk', rotalar);
    expect(window.location.pathname).toBe('/kuyruk');
    cleanup();

    // Rotası henüz olmayan ya da görünmeyen hedef: ana sayfada kalınır, bulunamadı çıkmaz.
    await ac({ ...IKI_SAYFA, acilisSayfasi: '/uretim-terminali' }, '/', rotalar);
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText('Sayfa bulunamadı')).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Ana menü' })).getByRole('link', { name: 'Ana sayfa' }).getAttribute('href')).toBe('/');
    cleanup();
    await ac({ ...STOK_GOREN, acilisSayfasi: '/terminal' }, '/', rotalar);
    expect(window.location.pathname).toBe('/');
  });

  // 195 a: menüde göremediği alt maddeyi adresle açan kişi ekranı değil yetki iletisini görür; maddeyi gören açar.
  it('alt maddenin islemi olmayan kisi o maddeyi adresle acamaz; islemi olan acar', async () => {
    const StokAyarlari = () => <p>Stok ayarları</p>;
    const ayarli = [...rotalar, { yol: '/stok/ayarlar', ekran: StokAyarlari }];
    await ac(STOK_GOREN, '/stok/ayarlar', ayarli);
    expect(screen.getByRole('status').textContent).toContain('Bu bölümü görme yetkiniz yok');
    expect(screen.queryByText('Stok ayarları')).toBeNull();
    cleanup();

    await ac({ ...STOK_GOREN, islemler: ['sayfa.stok', 'stok.tanim'] }, '/stok/ayarlar', ayarli);
    expect(screen.getByText('Stok ayarları')).toBeTruthy();
  });

  it('rotasi olmayan kayitli sayfanin adresi gormeyene yetki iletisi verir, bulunamadi demez', async () => {
    await ac(IKI_SAYFA, '/uretim-terminali', rotalar);
    expect(screen.getByRole('status').textContent).toContain('Bu sayfayı görme yetkiniz yok');
    expect(screen.queryByText('Sayfa bulunamadı')).toBeNull();
  });

  it('sayfanin alt yolu da yalniz o sayfayi gorene acilir', async () => {
    await ac(STOK_GOREN, '/stok/5', rotalar);
    expect(screen.getByText('Stok kaydı')).toBeTruthy();
    cleanup();

    await ac(IKI_SAYFA, '/stok/5', rotalar);
    expect(screen.getByRole('status').textContent).toContain('yetkiniz yok');
    expect(screen.queryByText('Stok kaydı')).toBeNull();
  });

  it('tembel yuklenen ekran yuklenirken kabuk durur, yuklenince ekran gelir', async () => {
    let coz: (m: { default: () => JSX.Element }) => void = () => {};
    const Tembel = lazy(() => new Promise<{ default: () => JSX.Element }>((r) => { coz = r; }));
    await ac(STOK_GOREN, '/stok', [{ yol: '/stok', ekran: Tembel }]);
    expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
    await act(async () => { coz({ default: () => <p>Tembel ekran</p> }); });
    expect(await screen.findByText('Tembel ekran')).toBeTruthy();
  });

  it('bir ekranin hatasi yalniz o ekrani dusurur: kabuk kalir, Yeniden dene ekrani yeniden kurar', async () => {
    let bozuk = true;
    const Bozuk = () => { if (bozuk) throw new Error('ekran bozuldu'); return <p>Onarilmis ekran</p>; };
    const konsol = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await ac(STOK_GOREN, '/stok', [{ yol: '/stok', ekran: Bozuk }]);
      expect(screen.getByRole('alert').textContent).toContain('Bu ekran açılırken bir hata oluştu');
      expect(screen.getByRole('navigation', { name: 'Ana menü' })).toBeTruthy();
      bozuk = false;
      fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
      expect(await screen.findByText('Onarilmis ekran')).toBeTruthy();
    } finally {
      konsol.mockRestore();
    }
  });

  it('oturum sunucuda bitince (401) onceki kullanicinin sorgu onbellegi temizlenir', async () => {
    let istemci: QueryClient | undefined;
    const Kayitlar = () => {
      istemci = useQueryClient();
      const sorgu = useQuery({ queryKey: ['deneme-kayitlari'], queryFn: () => Promise.resolve(['gizli kayit']) });
      return <p>{sorgu.data?.join(',') ?? 'yok'}</p>;
    };
    await ac(STOK_GOREN, '/stok', [{ yol: '/stok', ekran: Kayitlar }]);
    await screen.findByText('gizli kayit');

    sunucuKur(null);
    act(() => { window.dispatchEvent(new CustomEvent(OTURUM_BITTI)); });
    await screen.findByRole('button', { name: 'Giriş yap' });
    expect(istemci?.getQueryData(['deneme-kayitlari'])).toBeUndefined();
  });
});
