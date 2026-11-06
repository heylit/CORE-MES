import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GirisCevabi, OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { Giris, MODULLER, SLOGAN } from './Giris.tsx';

const OPERATOR: Kullanici = { id: 7, ad: 'Deneme Operatör', islemler: ['sayfa.kuyruk'] };

interface Cagri { yol: string; govde: Record<string, unknown> }

// Sunucunun giriş uçlarını taklit eder: geçici PIN 482913, kişinin kendi PIN'i 730514, parola "dogru".
function sunucuKur() {
  const cagrilar: Cagri[] = [];
  const cevap = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: RequestInit = {}) => {
    const yol = adres.replace('/api', '');
    const govde = JSON.parse(String(secenek.body)) as Record<string, unknown>;
    cagrilar.push({ yol, govde });
    if (yol === '/oturum/giris') {
      if (govde.pin === '482913') return cevap(200, { kullanici: null, pinBelirlenecek: true } satisfies GirisCevabi);
      if (govde.pin === '730514' || govde.parola === 'dogru') return cevap(200, { kullanici: OPERATOR } satisfies GirisCevabi);
      return cevap(401, { kod: 'OTURUM_YOK', mesaj: 'Kullanıcı adı, PIN ya da parola hatalı.' });
    }
    if (yol === '/oturum/pin-belirle') return cevap(200, { kullanici: OPERATOR } satisfies OturumCevabi);
    if (yol === '/oturum/kart-giris') {
      if (govde.kart === '0004123456') return cevap(200, { kullanici: OPERATOR } satisfies OturumCevabi);
      return cevap(401, { kod: 'OTURUM_YOK', mesaj: 'Kart tanınmadı ya da bu kartla giriş kapalı.' });
    }
    return cevap(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function kur() {
  const istemci = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><Giris /></QueryClientProvider>);
  return istemci;
}

const tuslaraBas = (rakamlar: string) => {
  for (const r of rakamlar) fireEvent.click(screen.getByRole('button', { name: r }));
};
const kullaniciAdiYaz = () => fireEvent.change(screen.getByLabelText(/Kullanıcı adı/), { target: { value: 'operator1' } });
const okut = (hedef: Element, metin: string) => { for (const c of [...metin, 'Enter']) fireEvent.keyDown(hedef, { key: c }); };
const girisDugmesi = () => screen.getByRole('button', { name: 'Giriş yap' }) as HTMLButtonElement;

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Giris', () => {
  it('giris logosu oturumsuz adresten okunur; yuklenince gorunur, yoksa (hata) gizli kalir', () => {
    sunucuKur();
    kur();
    const resim = screen.getByAltText('Kurum logosu') as HTMLImageElement;
    expect(resim.getAttribute('src')).toBe('/api/giris-logosu');
    expect(resim.hidden).toBe(true);
    fireEvent.load(resim);
    expect(resim.hidden).toBe(false);
    fireEvent.error(resim);
    expect(resim.hidden).toBe(true);
  });

  it('surum notu yayin adini ya da "geliştirme"yi derleme tarihiyle yazar; v oneki yok', () => {
    sunucuKur();
    kur();
    expect(document.querySelector('.tc-giris-surum')?.textContent).toMatch(/^(geliştirme|[^v\s][^\s]*) · \d{2}\.\d{2}\.\d{4}$/);
  });

  it('PIN ile acilir; tuslarla girilen alti hane gonderilir ve oturum yazilir', async () => {
    const cagrilar = sunucuKur();
    const istemci = kur();
    expect(screen.queryByLabelText(/Parola/)).toBeNull();
    kullaniciAdiYaz();
    tuslaraBas('73051');
    expect(girisDugmesi().disabled).toBe(true);
    tuslaraBas('49');
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect((screen.getByLabelText(/^PIN/) as HTMLInputElement).value).toBe('73051');
    tuslaraBas('4');
    fireEvent.click(girisDugmesi());

    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar).toEqual([{ yol: '/oturum/giris', govde: { kullaniciAdi: 'operator1', pin: '730514' } }]);
  });

  it('klavyeden rakam disi karakter PIN alanina girmez', () => {
    sunucuKur();
    kur();
    fireEvent.change(screen.getByLabelText(/^PIN/), { target: { value: '7a3-0514 9' } });
    expect((screen.getByLabelText(/^PIN/) as HTMLInputElement).value).toBe('730514');
  });

  it('hatali PIN sunucunun iletisini gosterir ve PIN alanini bosaltir', async () => {
    sunucuKur();
    kur();
    kullaniciAdiYaz();
    tuslaraBas('111222');
    fireEvent.click(girisDugmesi());
    expect((await screen.findByRole('alert')).textContent).toBe('Kullanıcı adı, PIN ya da parola hatalı.');
    expect((screen.getByLabelText(/^PIN/) as HTMLInputElement).value).toBe('');
  });

  it('gecici PIN kisiyi PIN belirleme adimina getirir; iki PIN uyusmazsa gonderilmez, uyusunca kaydedilip oturum acilir', async () => {
    const cagrilar = sunucuKur();
    const istemci = kur();
    kullaniciAdiYaz();
    tuslaraBas('482913');
    fireEvent.click(girisDugmesi());

    await screen.findByRole('heading', { name: 'PIN belirleyin' });
    expect(istemci.getQueryData(anahtarlar.oturum)).toBeUndefined();
    // Tuşlar önce yeni PIN'i, altı hane dolunca tekrarını yazar.
    tuslaraBas('730514');
    tuslaraBas('730515');
    fireEvent.click(screen.getByRole('button', { name: 'PIN\'i kaydet ve gir' }));
    expect((await screen.findByRole('alert')).textContent).toBe('İki PIN aynı değil.');
    expect(cagrilar.filter((c) => c.yol === '/oturum/pin-belirle')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/Yeni PIN \(tekrar\)/), { target: { value: '730514' } });
    fireEvent.click(screen.getByRole('button', { name: 'PIN\'i kaydet ve gir' }));
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar.at(-1)).toEqual({
      yol: '/oturum/pin-belirle', govde: { kullaniciAdi: 'operator1', geciciPin: '482913', yeniPin: '730514' },
    });
  });

  it('parola yolu herkese secilebilir ama hatirlanmaz (1832): sonraki acilis yine PIN ile karsilar; PIN yoluna donulebilir', async () => {
    const cagrilar = sunucuKur();
    kur();
    fireEvent.click(screen.getByRole('button', { name: 'Parola ile gir' }));
    expect(screen.getByText(/Parola yöneticiler ve henüz PIN'i olmayanlar içindir; PIN'i olan PIN ile girer\./)).toBeTruthy();
    kullaniciAdiYaz();
    fireEvent.change(screen.getByLabelText(/Parola/), { target: { value: 'dogru' } });
    fireEvent.click(girisDugmesi());
    await waitFor(() => expect(cagrilar).toHaveLength(1));
    expect(cagrilar[0]?.govde).toEqual({ kullaniciAdi: 'operator1', parola: 'dogru' });

    fireEvent.click(screen.getByRole('button', { name: 'PIN ile gir' }));
    expect(screen.getByRole('group', { name: 'Rakam tuşları' })).toBeTruthy();

    cleanup();
    kur();
    expect(screen.getByRole('group', { name: 'Rakam tuşları' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Parola/)).toBeNull();
    expect(window.localStorage.getItem('tmi.giris.yontem')).not.toBe('parola');
  });

  it('eski tarayicida saklanmis parola secimi yok sayilir: ekran PIN ile acilir, Parola ile gir baglantisi gorunur', () => {
    sunucuKur();
    window.localStorage.setItem('tmi.giris.yontem', 'parola');
    kur();
    expect(screen.getByRole('group', { name: 'Rakam tuşları' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parola ile gir' })).toBeTruthy();
  });

  // 1930: istasyonda ilk ekran kartlı giriştir; okutma alanı görünmez, kart arka planda okunur, öteki yollar seçenektir.
  const okutGorseli = () => screen.getByRole('status');
  it('1930: istasyon tarayicisinda ekran kartla acilir; kart alani ve giris dugmesi yok, okutulan kart PIN sorulmadan girer', async () => {
    const cagrilar = sunucuKur();
    window.localStorage.setItem('tmi.giris.yontem', 'kart');
    const istemci = kur();
    expect(okutGorseli().textContent).toMatch(/Kartınızı okutun/);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByLabelText(/^Kart/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Giriş yap' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Rakam tuşları' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kullanıcı adıyla gir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parola ile gir' })).toBeTruthy();
    okut(document.body, '0004123456');
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar).toEqual([{ yol: '/oturum/kart-giris', govde: { kart: '0004123456' } }]);
  });

  it('1930: okuyucunun ikinci Enter i karti ikinci kez gondermez', async () => {
    const cagrilar = sunucuKur();
    window.localStorage.setItem('tmi.giris.yontem', 'kart');
    const istemci = kur();
    okut(document.body, '0004123456');
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar).toHaveLength(1);
  });

  it('1930 reddedilen: taninmayan kartta ileti okutma gorselinde gorunur, sira kart okutmaya doner; kullanici adi yoluna donulebilir', async () => {
    sunucuKur();
    window.localStorage.setItem('tmi.giris.yontem', 'kart');
    kur();
    okut(document.body, '99999999');
    expect(await screen.findByText('Kart tanınmadı ya da bu kartla giriş kapalı.')).toBeTruthy();
    expect(okutGorseli().textContent).toMatch(/Kartınızı okutun/);
    fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı adıyla gir' }));
    expect(screen.getByLabelText(/Kullanıcı adı/)).toBeTruthy();
    expect(window.localStorage.getItem('tmi.giris.yontem')).toBe('kart');
  });

  it('1930: istasyon profilli oturum tarayiciyi kartli girise cevirir; baska profilde kart secimi unutulur', async () => {
    const istasyonda = { ...OPERATOR, cihazProfili: 'istasyon' as const };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici: istasyonda }), { status: 200 })));
    const istemci = kur();
    kullaniciAdiYaz();
    tuslaraBas('730514');
    fireEvent.click(girisDugmesi());
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(istasyonda));
    expect(window.localStorage.getItem('tmi.giris.yontem')).toBe('kart');

    cleanup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kullanici: { ...OPERATOR, cihazProfili: 'tam' } }), { status: 200 })));
    const ikinci = kur();
    fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı adıyla gir' }));
    kullaniciAdiYaz();
    tuslaraBas('730514');
    fireEvent.click(girisDugmesi());
    await waitFor(() => expect(ikinci.getQueryData(anahtarlar.oturum)).toBeTruthy());
    expect(window.localStorage.getItem('tmi.giris.yontem')).toBeNull();
  });

  it('PIN ekranindan Kartla gir secilebilir ve hatirlanir', () => {
    sunucuKur();
    kur();
    fireEvent.click(screen.getByRole('button', { name: 'Kartla gir' }));
    expect(okutGorseli()).toBeTruthy();
    expect(window.localStorage.getItem('tmi.giris.yontem')).toBe('kart');
  });

  // 1917: istasyonda kart yöntem ya da alan seçmeden okutulur; okuyucu klavye gibi hızlı yazar ve Enter'a basar.

  it('1917: PIN ekranindayken okutulan kart arka planda yakalanir; PIN formu gonderilmez, alana dusen kart silinir', async () => {
    const cagrilar = sunucuKur();
    const istemci = kur();
    const ad = screen.getByLabelText(/Kullanıcı adı/) as HTMLInputElement;
    fireEvent.change(ad, { target: { value: 'operator1' } });
    fireEvent.change(ad, { target: { value: 'operator10004123456' } });
    okut(ad, '0004123456');
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar).toEqual([{ yol: '/oturum/kart-giris', govde: { kart: '0004123456' } }]);
    expect(ad.value).toBe('operator1');
  });

  it('1917: odak hicbir alanda degilken de kart girer; kucuk harfli onaltilik kart buyuk harfle gider', async () => {
    const cagrilar = sunucuKur();
    kur();
    okut(document.body, '00041234ab');
    await waitFor(() => expect(cagrilar).toEqual([{ yol: '/oturum/kart-giris', govde: { kart: '00041234AB' } }]));
  });

  it('1917 reddedilen: kayitsiz cihazda sunucu reddeder, ileti PIN ekraninda gorunur, PIN girisi gonderilmez', async () => {
    const cagrilar = sunucuKur();
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: RequestInit = {}) => {
      cagrilar.push({ yol: adres.replace('/api', ''), govde: JSON.parse(String(secenek.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ kod: 'YETKI_YOK', mesaj: 'Kartla giriş yalnız istasyon olarak kayıtlı cihazda açıktır.' }), { status: 403 });
    }));
    kur();
    kullaniciAdiYaz();
    okut(screen.getByLabelText(/^PIN/), '0004123456');
    expect(await screen.findByText(/yalnız istasyon olarak kayıtlı cihazda/)).toBeTruthy();
    expect(cagrilar.map((c) => c.yol)).toEqual(['/oturum/kart-giris']);
  });

  it('1917 reddedilen: elle yavas yazilan kullanici adi ve PIN kart sanilmaz; kart deseni olmayan hizli girdi de gonderilmez', async () => {
    const cagrilar = sunucuKur();
    kur();
    const ad = screen.getByLabelText(/Kullanıcı adı/);
    let zaman = 1000;
    for (const c of ['1', '2', '3', '4', '5', '6', 'Enter']) {
      zaman += 300;
      const olay = new KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true });
      Object.defineProperty(olay, 'timeStamp', { value: zaman });
      fireEvent(ad, olay);
    }
    okut(ad, 'RP:12');
    okut(ad, '4006381333931');
    await new Promise((r) => { setTimeout(r, 20); });
    expect(cagrilar).toEqual([]);
  });

  it('1917: PIN belirleme adiminda arka plan dinleyicisi kapalidir', async () => {
    const cagrilar = sunucuKur();
    kur();
    kullaniciAdiYaz();
    tuslaraBas('482913');
    fireEvent.click(girisDugmesi());
    await screen.findByLabelText(/^Yeni PIN \(tekrar\)/);
    okut(document.body, '0004123456');
    await new Promise((r) => { setTimeout(r, 20); });
    expect(cagrilar.map((c) => c.yol)).toEqual(['/oturum/giris']);
  });
});

describe('giriş ekranı marka adı (karar 2002)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('WebGL2 olmayan tarayicida sahne yuklenmez; CORE harfleri duz cizim olarak gorunur', () => {
    sunucuKur();
    kur();
    const sahne = document.querySelector('.tc-giris-sahne');
    expect(sahne?.getAttribute('data-durum')).toBe('yok');
    expect(sahne?.getAttribute('aria-hidden')).toBe('true');
    expect(sahne?.querySelectorAll('svg path')).toHaveLength(4);
    expect(sahne?.querySelector('canvas')).toBeNull();
  });

  it('firma adi formun ustunde kucuk etiket olur, bolum adi "<Firma> CORE"; ad okunamazsa etiket yok, bolum adi CORE (2170)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => (adres.endsWith('/giris-kurum-adi')
      ? new Response(JSON.stringify({ ad: 'Deneme Atolye' }), { status: 200 })
      : new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'yok' }), { status: 404 }))));
    kur();
    expect((await screen.findByText('Deneme Atolye')).className).toBe('tc-giris-firma');
    expect(screen.getByRole('region', { name: 'Deneme Atolye CORE' })).toBeTruthy();
    cleanup();
    sunucuKur();
    kur();
    expect(await screen.findByRole('region', { name: 'CORE' })).toBeTruthy();
    expect(document.querySelector('.tc-giris-firma')).toBeNull();
  });
});

describe('giriş ekranı tanıtımı (2170)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

  it('slogan firma adi tasimaz; CORE altinda "Atölyenin işletim sistemi"; modul seridi her modulu bir kez okutur', () => {
    sunucuKur();
    kur();
    expect(screen.getByText(SLOGAN)).toBeTruthy();
    expect(SLOGAN).toBe('Talaşı tezgâh kaldırır, tartışmayı CORE. Sıfır tahmin.');
    expect(document.querySelector('.tc-giris-sahne .tc-giris-sahne-alti')?.textContent).toBe('Atölyenin işletim sistemi');
    const serit = screen.getByRole('list', { name: 'Modüller' });
    const okunan = [...serit.querySelectorAll('li')].filter((li) => li.getAttribute('aria-hidden') !== 'true').map((li) => li.textContent);
    expect(okunan).toEqual([...MODULLER]);
  });

  it('acilis sesi varsayilan kapali; dugme yalniz bu cihazda acar ve kapatir', () => {
    sunucuKur();
    kur();
    const dugme = screen.getByRole('button', { name: 'Ses kapalı' });
    expect(dugme.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dugme);
    expect(screen.getByRole('button', { name: 'Ses açık' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('core.giris.ses')).toBe('acik');
    fireEvent.click(screen.getByRole('button', { name: 'Ses açık' }));
    expect(window.localStorage.getItem('core.giris.ses')).toBe('kapali');
  });
});
