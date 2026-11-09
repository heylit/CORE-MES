import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Firma, FirmaAyrintiCevabi, KarneBileseni, KarneCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
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
const BILESENLER = (d: Partial<Record<KarneBileseni, number | null>>, toplam: number) => (
  [['lot', 25], ['ppm', 15], ['zamaninda', 25], ['tam', 10], ['teklif', 5], ['satinAlma', 10], ['kalite', 10]] as const
).map(([anahtar, agirlik]) => {
  const deger = d[anahtar] ?? null;
  return { anahtar, deger, agirlik, etkinAgirlik: deger === null ? null : Math.round((agirlik / toplam) * 1000) / 10 };
});
const KARNE = {
  karne: {
    firmaId: 7, donemBasi: '2025-10-30', donemSonu: '2026-10-30',
    teslim: { toplam: 19, zamaninda: 16, tam: 17, oran: 84.2 }, kalite: { lot: 14, kararlar: { kabul: 11, sartli_kabul: 3 }, puan: 89.3 },
    hizmet: { sayi: 3, ortalama: 4, puan: 75 }, kaliteDegerlendirmesi: { sayi: 0, ortalama: null, puan: null },
    bilesenler: BILESENLER({ lot: 89.3, zamaninda: 84.2, tam: 89.5, satinAlma: 75 }, 70), gruplar: { kalite: 89.3, teslim: 85.6, elle: 75 }, hesapSurumu: 2,
    puan: 85.4, sinif: 'B', yetersizVeri: false,
  },
  yillikKarneler: [{
    id: 1, firmaId: 7, yil: 2025, teslimOrani: 80, kalitePuani: 76, hizmetPuani: 80, puan: 78, sinif: 'B', not: 'Termin bildirimi istendi.',
    degerlendiren: 'Deneme Kalite', olusturma: '2026-01-15T10:00:00+03:00', hesapSurumu: null, bilesenler: null,
  }],
  hizmetPuanlari: [{ id: 5, puan: 4, tur: 'satin-alma', not: null, giren: 'Deneme Satın Alma', olusturma: '2026-10-01T10:00:00+03:00' }],
} satisfies KarneCevabi;
const YETERSIZ = {
  karne: {
    ...KARNE.karne, teslim: { toplam: 1, zamaninda: 1, tam: 1, oran: 100 }, kalite: { lot: 0, kararlar: {}, puan: null },
    hizmet: { sayi: 0, ortalama: null, puan: null }, bilesenler: BILESENLER({ zamaninda: 100, tam: 100 }, 35), gruplar: { kalite: null, teslim: 100, elle: null }, puan: 100, sinif: null, yetersizVeri: true,
  },
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
  it('kayan 12 aylık karneyi ölçüt, ağırlık, bu firmadaki ağırlık ve katkıyla; puanı ve sınıfı sunucudan gösterir', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await degerlendirme();
    const tablo = await screen.findByRole('table', { name: 'Karne ölçütleri' });
    expect(within(tablo).getByText('19 teslimin 16\'i termin + 2 gün içinde')).toBeTruthy();
    expect(within(tablo).getByText('14 lot: 11 kabul, 3 şartlı')).toBeTruthy();
    expect(within(tablo).getAllByText('Henüz ölçülmüyor')).toHaveLength(2);
    expect(within(tablo).getByText('84,2')).toBeTruthy();
    expect(within(tablo).getAllByText('%35,7')).toHaveLength(2);
    expect(within(tablo).getByText('30,1')).toBeTruthy();
    expect(screen.getByText('85,4')).toBeTruthy();
    expect(screen.getByText(/Hesap sürümü 2/)).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Kayıtlı karneler' })).getByText('sürüm 1')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Kayıtlı karneler' })).getByText('Termin bildirimi istendi.')).toBeTruthy();
  });

  it('az veride puan gösterilir ama sınıf yerine "Az veri" yazar; verisi olmayan ölçüt "—"', async () => {
    sunucuKur(OKUYUCU, 'tedarikci', YETERSIZ);
    ac();
    await degerlendirme();
    expect(await screen.findByText('Az veri')).toBeTruthy();
    expect(screen.getByText(/en az 3 teslim ve 3 lot olmadan sınıf verilmez/)).toBeTruthy();
    const tablo = screen.getByRole('table', { name: 'Karne ölçütleri' });
    expect(within(tablo).getAllByText('Değerlendirme yok')).toHaveLength(2);
    expect(within(tablo).getAllByText('%71,4')).toHaveLength(1);
  });

  it('müşteri firmasında değerlendirme sekmesi yoktur', async () => {
    sunucuKur(OKUYUCU, 'musteri');
    ac();
    await screen.findByRole('region', { name: 'Firma kartı' });
    expect(screen.queryByRole('tab', { name: /Değerlendirme/ })).toBeNull();
  });

  it('yetki: yalnız okuyan giriş düğmesi görmez; satın alma kendi, kalite kendi değerlendirmesini ve yıllık karneyi görür', async () => {
    sunucuKur(OKUYUCU);
    ac();
    await degerlendirme();
    await screen.findByRole('table', { name: 'Karne ölçütleri' });
    expect(screen.queryByRole('button', { name: 'Satın alma değerlendirmesi ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kalite değerlendirmesi ver' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yıllık karneyi kaydet' })).toBeNull();
    cleanup();
    sunucuKur(KALITE);
    ac();
    await degerlendirme();
    expect(await screen.findByRole('button', { name: 'Yıllık karneyi kaydet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kalite değerlendirmesi ver' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Satın alma değerlendirmesi ver' })).toBeNull();
  });

  it('değerlendirme gövdesi yalnız puan ve not taşır; tür uçtan, kişi ve zaman sunucudan', async () => {
    const yazilan = sunucuKur(SATINALMA);
    ac();
    await degerlendirme();
    fireEvent.click(await screen.findByRole('button', { name: 'Satın alma değerlendirmesi ver' }));
    fireEvent.change(screen.getByLabelText(/^Puan/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/^Not/), { target: { value: ' Hızlı dönüş ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilan).toHaveLength(1));
    expect(yazilan[0]).toEqual({ yol: '/musteri-tedarikci/firmalar/7/hizmet-puani/ekle', govde: { puan: 5, not: 'Hızlı dönüş' } });
    cleanup();
    const kalite = sunucuKur(KALITE);
    ac();
    await degerlendirme();
    fireEvent.click(await screen.findByRole('button', { name: 'Kalite değerlendirmesi ver' }));
    fireEvent.change(screen.getByLabelText(/^Puan/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kalite).toHaveLength(1));
    expect(kalite[0]).toEqual({ yol: '/musteri-tedarikci/firmalar/7/kalite-degerlendirmesi/ekle', govde: { puan: 2, not: null } });
  });
});
