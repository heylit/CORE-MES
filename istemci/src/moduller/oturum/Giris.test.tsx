import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GirisCevabi, OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { Giris } from './Giris.tsx';

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
      if (govde.kart === '0004123456' && govde.pin === '730514') return cevap(200, { kullanici: OPERATOR } satisfies OturumCevabi);
      return cevap(401, { kod: 'OTURUM_YOK', mesaj: 'Kart ya da PIN hatalı.' });
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

  it('parola yolu secilir ve hatirlanir; PIN yoluna donulebilir', async () => {
    const cagrilar = sunucuKur();
    kur();
    fireEvent.click(screen.getByRole('button', { name: 'Parola ile gir' }));
    kullaniciAdiYaz();
    fireEvent.change(screen.getByLabelText(/Parola/), { target: { value: 'dogru' } });
    fireEvent.click(girisDugmesi());
    await waitFor(() => expect(cagrilar).toHaveLength(1));
    expect(cagrilar[0]?.govde).toEqual({ kullaniciAdi: 'operator1', parola: 'dogru' });

    cleanup();
    kur();
    expect(screen.getByLabelText(/Parola/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Rakam tuşları' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'PIN ile gir' }));
    expect(screen.getByRole('group', { name: 'Rakam tuşları' })).toBeTruthy();
  });

  it('kartla giris (1326): okuyucu karti yazip Enter basinca PIN adimi gelir; kart ve PIN birlikte gider, secim hatirlanir', async () => {
    const cagrilar = sunucuKur();
    const istemci = kur();
    fireEvent.click(screen.getByRole('button', { name: 'Kartla gir' }));
    expect(screen.queryByLabelText(/Kullanıcı adı/)).toBeNull();
    const kart = screen.getByLabelText(/^Kart/) as HTMLInputElement;
    fireEvent.change(kart, { target: { value: '0004123456' } });
    fireEvent.submit(kart.closest('form')!);
    expect(screen.getByText('Kart okundu')).toBeTruthy();
    expect(cagrilar).toHaveLength(0);
    tuslaraBas('730514');
    fireEvent.click(girisDugmesi());
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.oturum)).toEqual(OPERATOR));
    expect(cagrilar).toEqual([{ yol: '/oturum/kart-giris', govde: { kart: '0004123456', pin: '730514' } }]);
    expect(window.localStorage.getItem('tmi.giris.yontem')).toBe('kart');
  });

  it('kartla giris hatasinda ileti gorunur, kart ve PIN silinir, sira kart okutmaya doner; kullanici adi yoluna donulebilir', async () => {
    sunucuKur();
    window.localStorage.setItem('tmi.giris.yontem', 'kart');
    kur();
    const kart = screen.getByLabelText(/^Kart/) as HTMLInputElement;
    fireEvent.change(kart, { target: { value: '0004123456' } });
    fireEvent.submit(kart.closest('form')!);
    tuslaraBas('111111');
    fireEvent.click(girisDugmesi());
    expect(await screen.findByText('Kart ya da PIN hatalı.')).toBeTruthy();
    expect((screen.getByLabelText(/^Kart/) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Kullanıcı adıyla gir' }));
    expect(screen.getByLabelText(/Kullanıcı adı/)).toBeTruthy();
  });
});
