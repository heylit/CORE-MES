import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Ayrinti, SaglikCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { ULASILAMADI_ILETISI } from '../../ortak/veri/api.ts';
import { SistemDurumu } from './SistemDurumu.tsx';
import { anahtarlar } from './anahtarlar.ts';

// Operatörün başka işlemleri vardır: ayrıntıyı açan yalnız kendi işlemidir, herhangi bir yetki değil.
const OPERATOR: Kullanici = { id: 7, ad: 'Deneme Operatör', islemler: ['sayfa.terminal', 'kisiler.oku'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['saglik.ayrinti-oku'] };

const AYRINTI = {
  veritabaniGecikmeMs: 12,
  sonGoc: '20260101000000_ornek',
  commit: 'abcdef1234567890',
  calismaSuresiSn: 7500,
  ortam: 'test',
  isler: [],
  uyarilar: [],
} satisfies Ayrinti;

interface Secenek {
  kullanici: Kullanici;
  saglik?: () => Response | Promise<Response>;
  ayrinti?: () => Response;
}

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const OK = () => json(200, { durum: 'ok' } satisfies SaglikCevabi);
const HATA = () => json(503, { durum: 'hata' } satisfies SaglikCevabi);
const ayrintiVer = (ayrinti: Ayrinti) => () => json(200, ayrinti);
const KIMLIK_YOK = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.' } satisfies HataGovdesi;

function sunucuKur({ kullanici, saglik = OK, ayrinti = ayrintiVer(AYRINTI) }: Secenek) {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/saglik') return saglik();
    if (yol === '/saglik/ayrinti') return ayrinti();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function ac(istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={istemci}><SistemDurumu /></QueryClientProvider>);
}

const sayac = (yollar: string[], yol: string) => yollar.filter((y) => y === yol).length;
const durumMetni = () => screen.getByRole('status').textContent;
const durumBekle = (beklenen: string) => waitFor(() => expect(durumMetni()).toBe(beklenen));
const yenile = () => { fireEvent.click(screen.getByRole('button', { name: 'Yenile' })); };
const komsu = (etiket: string) => screen.getByText(etiket).nextElementSibling?.textContent;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SistemDurumu durum', () => {
  it('saglik ok iken "Sistem calisiyor" yazar', async () => {
    sunucuKur({ kullanici: OPERATOR });
    ac();
    await durumBekle('Sistem çalışıyor');
  });

  it('saglik 503 donunce "Sistemde sorun var" yazar', async () => {
    sunucuKur({ kullanici: OPERATOR, saglik: HATA });
    ac();
    await durumBekle('Sistemde sorun var');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ag hatasinda kart cokmez, "Sistemde sorun var" yazar', async () => {
    sunucuKur({ kullanici: OPERATOR, saglik: () => Promise.reject(new TypeError('Failed to fetch')) });
    ac();
    await durumBekle('Sistemde sorun var');
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('ilk yukleme basarili olsa da yenilemede 503 gelirse "Sistemde sorun var" yazar', async () => {
    let cevap: () => Response = OK;
    sunucuKur({ kullanici: OPERATOR, saglik: () => cevap() });
    ac();
    await durumBekle('Sistem çalışıyor');

    cevap = () => json(503, { durum: 'hata' } satisfies SaglikCevabi);
    yenile();
    await durumBekle('Sistemde sorun var');

    cevap = OK;
    await waitFor(() => expect((screen.getByRole('button', { name: 'Yenile' }) as HTMLButtonElement).disabled).toBe(false));
    yenile();
    await durumBekle('Sistem çalışıyor');
  });

  it('ilk yukleme basarili olsa da yenilemede ag hatasi gelirse "Sistemde sorun var" yazar', async () => {
    let coktu = false;
    sunucuKur({ kullanici: OPERATOR, saglik: () => { if (coktu) throw new TypeError('Failed to fetch'); return OK(); } });
    ac();
    await durumBekle('Sistem çalışıyor');

    coktu = true;
    yenile();
    await durumBekle('Sistemde sorun var');
  });

  it('yenileme surerken dugme mesgul gosterir', async () => {
    let birak: () => void = () => {};
    let bekle = false;
    sunucuKur({
      kullanici: OPERATOR,
      saglik: () => (bekle ? new Promise<Response>((coz) => { birak = () => coz(OK()); }) : OK()),
    });
    ac();
    await durumBekle('Sistem çalışıyor');

    bekle = true;
    yenile();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yenile' }).getAttribute('aria-busy')).toBe('true'));
    birak();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yenile' }).getAttribute('aria-busy')).toBeNull());
  });
});

describe('SistemDurumu ayrinti', () => {
  it('yonetici ayrintiyi gorur; commit ilk 7 hane, bos alanlar "yok"', async () => {
    const yollar = sunucuKur({ kullanici: YONETICI });
    ac();
    await durumBekle('Sistem çalışıyor');
    await screen.findByText('abcdef1');
    expect(screen.getByText(/12 ms/)).toBeTruthy();
    expect(screen.getByText('20260101000000_ornek')).toBeTruthy();
    expect(screen.getByText('2 sa 5 dk')).toBeTruthy();
    expect(screen.getByText('test')).toBeTruthy();
    expect(yollar).toContain('/saglik/ayrinti');
    cleanup();

    sunucuKur({
      kullanici: YONETICI,
      ayrinti: ayrintiVer({ ...AYRINTI, veritabaniGecikmeMs: null, sonGoc: null, commit: null }),
    });
    ac();
    await screen.findByText('Veritabanı');
    expect(komsu('Son göç')).toBe('yok');
    expect(komsu('Commit')).toBe('yok');
    expect(komsu('Veritabanı')).toContain('yok');
    expect(komsu('Veritabanı')).not.toContain('ms');
  });

  it('veritabani durumu saglik cevabindan gelir: ok "Calisiyor"; saglik hata iken ayrinti gelse de "Sorun var"', async () => {
    sunucuKur({ kullanici: YONETICI });
    ac();
    await screen.findByText('Veritabanı');
    expect(komsu('Veritabanı')).toContain('Çalışıyor');
    expect(komsu('Veritabanı')).toContain('12 ms');
    expect(komsu('Veritabanı')).not.toContain('Sorun var');
    cleanup();

    sunucuKur({ kullanici: YONETICI, saglik: HATA });
    ac();
    await screen.findByText('Veritabanı');
    expect(komsu('Veritabanı')).toContain('Sorun var');
    expect(komsu('Veritabanı')).not.toContain('Çalışıyor');
    expect(komsu('Veritabanı')).not.toContain('ms');
  });

  it('saglik cevabi beklenirken ayrinti gelse de veritabani satiri yazilmaz; cevap gelince "Calisiyor" yazar', async () => {
    let birak: () => void = () => {};
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    sunucuKur({ kullanici: YONETICI, saglik: () => new Promise<Response>((coz) => { birak = () => coz(OK()); }) });
    ac(istemci);
    await waitFor(() => expect(istemci.getQueryData(anahtarlar.sistemAyrinti)).toEqual(AYRINTI));
    expect(screen.queryByText('Veritabanı')).toBeNull();
    expect(screen.queryByText('Sorun var')).toBeNull();

    birak();
    await screen.findByText('Veritabanı');
    expect(komsu('Veritabanı')).toContain('Çalışıyor');
  });

  it('veritabani yenilemede giderse satir "Sorun var" olur, sunucunun kimlik iletisi gosterilir', async () => {
    let ayakta = true;
    sunucuKur({
      kullanici: YONETICI,
      saglik: () => (ayakta ? OK() : HATA()),
      ayrinti: () => (ayakta ? json(200, AYRINTI) : json(503, KIMLIK_YOK)),
    });
    ac();
    await screen.findByText('abcdef1');
    await waitFor(() => expect(komsu('Veritabanı')).toContain('Çalışıyor'));
    expect(screen.queryByRole('alert')).toBeNull();

    ayakta = false;
    await waitFor(() => expect((screen.getByRole('button', { name: 'Yenile' }) as HTMLButtonElement).disabled).toBe(false));
    yenile();
    expect((await screen.findByRole('alert')).textContent).toBe(KIMLIK_YOK.mesaj);
    await durumBekle('Sistemde sorun var');
    expect(komsu('Veritabanı')).toContain('Sorun var');
    expect(komsu('Veritabanı')).not.toContain('Çalışıyor');
  });

  it('yonetici olmayan icin ayrinti istegi atilmaz; yoneticide atilir', async () => {
    const operatorYollari = sunucuKur({ kullanici: OPERATOR });
    ac();
    await durumBekle('Sistem çalışıyor');
    expect(operatorYollari).toContain('/oturum');
    expect(operatorYollari).not.toContain('/saglik/ayrinti');
    expect(screen.queryByText('Veritabanı')).toBeNull();
    cleanup();

    const yoneticiYollari = sunucuKur({ kullanici: YONETICI });
    ac();
    await screen.findByText('Veritabanı');
    expect(yoneticiYollari).toContain('/saglik/ayrinti');
  });

  it('onbellekte ayrinti olsa bile yonetici olmayan onu gormez', async () => {
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    istemci.setQueryData(anahtarlar.sistemAyrinti, AYRINTI);
    const yollar = sunucuKur({ kullanici: OPERATOR });
    ac(istemci);
    await durumBekle('Sistem çalışıyor');
    await waitFor(() => expect(yollar).toContain('/oturum'));
    await new Promise((coz) => setTimeout(coz, 20));

    expect(screen.queryByText('Veritabanı')).toBeNull();
    expect(screen.queryByText('abcdef1')).toBeNull();
    expect(screen.queryByText('20260101000000_ornek')).toBeNull();
    expect(screen.queryByText('test')).toBeNull();
  });

  it('yenile dugmesi operatorde ayrintiyi cagirmaz, yoneticide yeniden cagirir', async () => {
    const operatorYollari = sunucuKur({ kullanici: OPERATOR });
    ac();
    await durumBekle('Sistem çalışıyor');
    yenile();
    await waitFor(() => expect(sayac(operatorYollari, '/saglik')).toBe(2));
    expect(operatorYollari).not.toContain('/saglik/ayrinti');
    cleanup();

    const yoneticiYollari = sunucuKur({ kullanici: YONETICI });
    ac();
    await screen.findByText('Veritabanı');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Yenile' }) as HTMLButtonElement).disabled).toBe(false));
    yenile();
    await waitFor(() => expect(sayac(yoneticiYollari, '/saglik/ayrinti')).toBe(2));
  });

  // Sunucunun gerçek iletileri; kart hangi durum kodu olursa olsun sunucunun yazdığını gösterir.
  const ILETILI = [
    { durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Aynı bilgilerle bir kayıt zaten var.' } satisfies HataGovdesi },
    { durum: 422, govde: { kod: 'GECERSIZ', mesaj: 'Girilen değerler kabul edilmedi. Bilgileri kontrol edip yeniden deneyin.' } satisfies HataGovdesi },
    { durum: 503, govde: KIMLIK_YOK },
    { durum: 500, govde: { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' } satisfies HataGovdesi },
  ];

  for (const { durum, govde } of ILETILI) {
    it(`ayrinti ucu ${durum} verirse durum kalir, sunucunun iletisi yazar`, async () => {
      sunucuKur({ kullanici: YONETICI, ayrinti: () => json(durum, govde) });
      ac();
      expect((await screen.findByRole('alert')).textContent).toBe(govde.mesaj);
      await durumBekle('Sistem çalışıyor');
    });
  }

  it('ayrinti ucuna ulasilamazsa nedeni, cevap ileti tasimazsa kartin kendi iletisi yazar', async () => {
    sunucuKur({ kullanici: YONETICI, ayrinti: () => { throw new TypeError('Failed to fetch'); } });
    ac();
    expect((await screen.findByRole('alert')).textContent).toBe(ULASILAMADI_ILETISI);
    await durumBekle('Sistem çalışıyor');
    cleanup();

    sunucuKur({ kullanici: YONETICI, ayrinti: () => new Response('{}', { status: 500 }) });
    ac();
    expect((await screen.findByRole('alert')).textContent).toBe('Ayrıntı alınamadı');
  });
});

describe('SistemDurumu zamanlanmis isler', () => {
  it('yonetici is tablosunu gorur: son calisma, sonuc, hata ozeti ya da bekleme nedeni; hic kosmamis iste "yok"', async () => {
    const BASLAMA = '2026-10-08T09:00:00.000Z';
    sunucuKur({
      kullanici: YONETICI,
      ayrinti: ayrintiVer({
        ...AYRINTI,
        isler: [
          { ad: 'arkon-yansima-yineleyici', sonBaslama: BASLAMA, sonBitis: '2026-10-08T09:00:01.000Z', sonSonuc: 'hata', sonHata: 'Veritabanı hatası 23514', sonNeden: null },
          { ad: 'logo-gonderim', sonBaslama: BASLAMA, sonBitis: BASLAMA, sonSonuc: 'bekliyor', sonHata: null, sonNeden: 'Logo bağlantısı kapalı' },
          { ad: 'yeni-is', sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null },
        ],
      }),
    });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Zamanlanmış işler' });
    const satirlar = within(tablo).getAllByRole('row').slice(1).map((r) => [...r.querySelectorAll('td')].map((h) => h.textContent));
    expect(satirlar).toEqual([
      ['arkon-yansima-yineleyici', new Date(BASLAMA).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'medium' }), 'Hata', 'Veritabanı hatası 23514'],
      ['logo-gonderim', new Date(BASLAMA).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'medium' }), 'Bekliyor', 'Logo bağlantısı kapalı'],
      ['yeni-is', 'yok', 'yok', 'yok'],
    ]);
  });

  it('is listesi bossa "Is yok" yazar; yonetici olmayan is bolumunu gormez', async () => {
    sunucuKur({ kullanici: YONETICI });
    ac();
    expect(await screen.findByText('İş yok')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Zamanlanmış işler' })).toBeTruthy();
    cleanup();

    sunucuKur({ kullanici: OPERATOR });
    ac();
    await durumBekle('Sistem çalışıyor');
    expect(screen.queryByRole('heading', { name: 'Zamanlanmış işler' })).toBeNull();
    expect(screen.queryByText('İş yok')).toBeNull();
  });
});

describe('SistemDurumu uyarilar', () => {
  it('yonetici sunucunun uyarilarini durumun altinda liste olarak gorur; uyari yoksa bolum yoktur', async () => {
    sunucuKur({
      kullanici: YONETICI,
      ayrinti: ayrintiVer({
        ...AYRINTI,
        uyarilar: [
          { tur: 'yedek', ileti: 'Son yedek 30 saat önce alındı.' },
          { tur: 'disk', ileti: 'Yedek diskinde 2,0 GB boş yer kaldı.' },
        ],
      }),
    });
    ac();
    const bolum = await screen.findByRole('region', { name: 'Uyarılar' });
    expect(within(bolum).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Son yedek 30 saat önce alındı.', 'Yedek diskinde 2,0 GB boş yer kaldı.',
    ]);
    cleanup();
    sunucuKur({ kullanici: YONETICI });
    ac();
    await screen.findByRole('table', { name: 'Zamanlanmış işler' }).catch(() => screen.findByText('İş yok'));
    expect(screen.queryByRole('region', { name: 'Uyarılar' })).toBeNull();
  });
});
