import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Firma, FirmaAyrintiCevabi, KarneCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { FirmaAyrinti } from './FirmaAyrinti.tsx';

// Örnek değerler uydurmadır.
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['musteri-tedarikci.oku'] };
const SATINALMA: Kullanici = { id: 3, ad: 'Deneme Satın Alma', islemler: ['musteri-tedarikci.oku', 'satin-alma.yaz'] };
const KALITE: Kullanici = { id: 4, ad: 'Deneme Kalite', islemler: ['musteri-tedarikci.oku', 'kalite-merkezi.onayla'] };

const firma = (tur: Firma['tur']): Firma => ({
  id: 7, kod: 'T-7', ad: 'Ornek Tedarikci', tur, fason: false, ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, paraBirimi: 'TRY',
  vadeGunu: null, adres: null, ilce: null, il: null, postaKodu: null, enlem: null, boylam: null, telefon: null, ePosta: null, aktif: true,
  logoCariKodu: null, logoKayitNo: null, logoGonderimDurumu: null, musteriSinifi: null, olusturma: '2026-01-01T09:00:00+03:00', guncelleme: null, surum: 1,
});
const KARNE = {
  karne: {
    firmaId: 7, donemBasi: '2025-10-30', donemSonu: '2026-10-30',
    teslim: { toplam: 19, zamaninda: 16, oran: 84.2 }, kalite: { lot: 14, puan: 89.3 }, hizmet: { sayi: 3, puan: 80 },
    puan: 85.4, sinif: 'B', yetersizVeri: false,
  },
  yillikKarneler: [{
    id: 1, firmaId: 7, yil: 2025, teslimOrani: 80, kalitePuani: 76, hizmetPuani: 80, puan: 78, sinif: 'B', not: 'Termin bildirimi istendi.',
    degerlendiren: 'Deneme Kalite', olusturma: '2026-01-15T10:00:00+03:00',
  }],
  hizmetPuanlari: [{ id: 5, puan: 4, not: null, giren: 'Deneme Satın Alma', olusturma: '2026-10-01T10:00:00+03:00' }],
} satisfies KarneCevabi;
const YETERSIZ = {
  karne: { ...KARNE.karne, teslim: { toplam: 1, zamaninda: 1, oran: 100 }, kalite: { lot: 0, puan: null }, hizmet: { sayi: 0, puan: null }, puan: null, sinif: null, yetersizVeri: true },
  yillikKarneler: [], hizmetPuanlari: [],
} satisfies KarneCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici, tur: Firma['tur'] = 'tedarikci', karne: KarneCevabi = KARNE) {
  const yazilan: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (secenek?.method === 'POST') { yazilan.push({ yol, govde: JSON.parse(String(secenek.body)) }); return json(200, KARNE); }
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/musteri-tedarikci/firmalar/7') return json(200, { firma: firma(tur), adresler: [] } satisfies FirmaAyrintiCevabi);
    if (yol === '/musteri-tedarikci/firmalar/7/karne') return json(200, karne);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Yok' });
  }));
  return yazilan;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><FirmaAyrinti id={7} kapat={() => {}} /></BildirimSaglayici></QueryClientProvider>);
}
const degerlendirme = async () => fireEvent.click(await screen.findByRole('tab', { name: /Değerlendirme/ }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Firma kartı değerlendirme (1259 c, 1260 a)', () => {
  it('kayan 12 aylık karneyi ölçüt, ağırlık ve katkıyla; puanı ve sınıfı sunucudan gösterir', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await degerlendirme();
    const tablo = await screen.findByRole('table', { name: 'Karne ölçütleri' });
    expect(within(tablo).getByText('19 satırın 16\'i termin + 2 gün içinde tam')).toBeTruthy();
    expect(within(tablo).getByText('84,2')).toBeTruthy();
    expect(within(tablo).getByText('33,7')).toBeTruthy();
    expect(screen.getByText('85,4')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Kayıtlı karneler' })).getByText('Termin bildirimi istendi.')).toBeTruthy();
  });

  it('yetersiz veride puan ve sınıf yerine "Yetersiz veri" yazar; hizmetsizken ağırlık 50/50 gösterilir', async () => {
    sunucuKur(OKUYUCU, 'tedarikci', YETERSIZ);
    ac();
    await degerlendirme();
    expect(await screen.findByText('Yetersiz veri')).toBeTruthy();
    const tablo = screen.getByRole('table', { name: 'Karne ölçütleri' });
    expect(within(tablo).getAllByText('%50')).toHaveLength(2);
    expect(within(tablo).getByText('Değerlendirme yok')).toBeTruthy();
  });

  it('müşteri firmasında değerlendirme sekmesi yoktur', async () => {
    sunucuKur(OKUYUCU, 'musteri');
    ac();
    await screen.findByRole('region', { name: 'Firma kartı' });
    expect(screen.queryByRole('tab', { name: /Değerlendirme/ })).toBeNull();
  });

  it('yetki: yalnız okuyan giriş düğmesi görmez; satın alma hizmet puanı, kalite yıllık karne düğmesini görür', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await degerlendirme();
    await screen.findByRole('table', { name: 'Karne ölçütleri' });
    expect(screen.queryByRole('button', { name: 'Hizmet puanı ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yıllık karneyi kaydet' })).toBeNull();
    cleanup();
    sunucuKur(KALITE);
    ac();
    await degerlendirme();
    expect(await screen.findByRole('button', { name: 'Yıllık karneyi kaydet' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hizmet puanı ver' })).toBeNull();
  });

  it('hizmet puanı gövdesi yalnız puan ve not taşır; kişi ve zamanı sunucu yazar', async () => {
    const yazilan = sunucuKur(SATINALMA);
    ac();
    await degerlendirme();
    fireEvent.click(await screen.findByRole('button', { name: 'Hizmet puanı ver' }));
    fireEvent.change(screen.getByLabelText(/^Puan/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/^Not/), { target: { value: ' Hızlı dönüş ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]).toEqual({ yol: '/musteri-tedarikci/firmalar/7/hizmet-puani/ekle', govde: { puan: 5, not: 'Hızlı dönüş' } });
  });
});
