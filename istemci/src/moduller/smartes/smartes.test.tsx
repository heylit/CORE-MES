import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { DurumCevabi, EslemelerCevabi, GidenCevabi, IsEmriDurumlariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { BaglantiDurumu } from './BaglantiDurumu.tsx';
import { Eslemeler } from './Eslemeler.tsx';
import { Giden, UretimSayilari } from './Listeler.tsx';
import { SmartesAyarlari, ayarEkranlari } from './ayar-ekranlari.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.smartes', 'smartes.esleme-yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.smartes'] };

const SAYILAR: DurumCevabi['sayilar'] = {
  isEmriDurumu: 12, durus: 3, alarm: 0, gidenGonderilen: 4, gidenHatali: 0,
};

const ESLEMELER: EslemelerCevabi = {
  tur: 'istasyon',
  satirlar: [
    { tmiId: 1, tmiKod: 'IST-01', tmiAd: 'Deneme torna', aktif: true, smartesKod: 'S-01', surum: 2 },
    { tmiId: 2, tmiKod: 'IST-02', tmiAd: 'Deneme freze', aktif: false, smartesKod: null, surum: null },
  ],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, ozel: (yol: string, yontem: string) => Response | null = () => null) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    const o = ozel(yol, yontem);
    if (o) return o;
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/smartes/eslemeler?tur=istasyon')) return json(200, ESLEMELER);
    if (yol.startsWith('/smartes/eslemeler?tur=')) return json(200, { tur: yol.split('=')[1], satirlar: [] });
    if (yol === '/smartes/eslemeler/ata') return json(200, { tmiId: 2, smartesKod: 'S-02', surum: 1 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac(ekran: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES bağlantı durumu', () => {
  it('kapalı bağlantıda nasıl açılacağını söyler; sayılar ve okuma hatası görünür', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/durum'
      ? json(200, {
        baglanti: 'kapali', sayilar: SAYILAR,
        okumalar: [{ kaynak: 'durus', sonBitis: null, sonDeneme: '2026-01-05T08:00:00.000Z', sonSonuc: 'hata', sonHata: 'SmartES yanıt vermedi.', okunan: null, kimliksiz: null }],
      } satisfies DurumCevabi)
      : null));
    ac(<BaglantiDurumu />);
    expect(await screen.findByText('Kapalı')).toBeTruthy();
    expect(screen.getByText(/SmartES bağlantısı” anahtarıyla açılır/)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('SmartES yanıt vermedi.')).toBeTruthy();
  });

  it('anahtar açık ama adres yoksa kurulum belgesini gösterir', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/durum'
      ? json(200, { baglanti: 'ortam-degiskeni-yok', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi)
      : null));
    ac(<BaglantiDurumu />);
    expect(await screen.findByText('Adres yok')).toBeTruthy();
    expect(screen.getByText(/TMIV2_SMARTES_ADRESI/)).toBeTruthy();
    expect(screen.getByText('Henüz okuma yapılmadı.')).toBeTruthy();
  });
});

describe('SmartES kod eşlemeleri', () => {
  it('yazma işlemi olmayan listeyi görür, düzenleme düğmesi görmez', async () => {
    sunucuKur(IZLEYICI);
    ac(<Eslemeler />);
    expect(await screen.findByText('Deneme torna')).toBeTruthy();
    expect(screen.getByText('S-01')).toBeTruthy();
    expect(screen.getByText('Pasif')).toBeTruthy();
    expect(screen.getByText('1 / 2 eşli')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Eşle|Değiştir/ })).toBeNull();
  });

  it('yönetici eşlenmemiş kayda kod verir: gövde null sürümle ve kırpılmamış kodla gider, sunucu kırpar', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Eslemeler />);
    fireEvent.click(await screen.findByRole('button', { name: 'Eşle' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).queryByRole('button', { name: 'Eşlemeyi kaldır' })).toBeNull();
    fireEvent.change(within(pencere).getByLabelText(/SmartES kodu/), { target: { value: 'S-02' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toEqual({
      yol: '/smartes/eslemeler/ata', yontem: 'POST', govde: { tur: 'istasyon', tmiId: 2, smartesKod: 'S-02', surum: null },
    });
  });

  it('çakışan kodda sunucunun iletisi pencerede kalır', async () => {
    sunucuKur(YONETICI, (yol) => (yol === '/smartes/eslemeler/ata'
      ? json(409, { kod: 'CAKISMA', mesaj: 'Bu SmartES kodu başka kayda verilmiş.' } satisfies HataGovdesi)
      : null));
    ac(<Eslemeler />);
    fireEvent.click(await screen.findByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByRole('alert')).toBeTruthy();
    expect(within(pencere).getByText('Bu SmartES kodu başka kayda verilmiş.')).toBeTruthy();
  });

  it('tür sekmesi değişince o türün listesi istenir', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac(<Eslemeler />);
    await screen.findByText('Deneme torna');
    fireEvent.click(screen.getByRole('tab', { name: 'Duruş nedeni' }));
    expect(await screen.findByText('Bu türde TMI kaydı yok.')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/smartes/eslemeler?tur=durus-nedeni')).toBe(true);
  });
});

describe('SmartES listeleri', () => {
  it('üretim sayılarında veri yoksa sıfır değil boşluk işareti; SmartES işareti sütunu yoktur', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol.startsWith('/smartes/is-emri-durumlari')
      ? json(200, {
        toplam: 1, sayfa: 1, sayfaBoyu: 50,
        satirlar: [{
          smartesId: 9, isEmriNo: 'E-1-10', erpId: '1', istasyonKodu: null, operasyonKodu: '10', makineKodu: 'M-1', stokNo: null,
          saglam: 5, red: null, makineSaglam: null, makineRed: null, baslangic: null, bitis: null,
          sonOkuma: '2026-01-05T08:00:00.000Z',
        }],
      } satisfies IsEmriDurumlariCevabi)
      : null));
    ac(<UretimSayilari />);
    expect(await screen.findByText('E-1-10')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('SmartES işareti')).toBeNull();
  });

  it('giden kutusu boşsa boş iletisi gösterir', async () => {
    sunucuKur(IZLEYICI, (yol) => (yol.startsWith('/smartes/giden')
      ? json(200, { toplam: 0, sayfa: 1, sayfaBoyu: 50, satirlar: [] } satisfies GidenCevabi)
      : null));
    ac(<Giden />);
    expect(await screen.findByText('Henüz gönderilen iş emri yok.')).toBeTruthy();
  });
});

describe('SmartES, Sistem Ayarları ekranı', () => {
  it('sayfa işlemiyle görünür; bölüm sekmesi değişince o bölümün ucu okunur', async () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem, e.bolum])).toEqual([['smartes', 'sayfa.smartes', 'baglanti']]);
    const cagrilar = sunucuKur(IZLEYICI, (yol) => (yol === '/smartes/durum'
      ? json(200, { baglanti: 'kapali', sayilar: SAYILAR, okumalar: [] } satisfies DurumCevabi)
      : null));
    ac(<SmartesAyarlari />);
    expect(await screen.findByText('Kapalı')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Kod eşlemeleri' }));
    expect(await screen.findByText('Deneme torna')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/smartes/eslemeler?tur=istasyon')).toBe(true);
  });
});
