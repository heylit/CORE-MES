import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  AramaCevabi, FabrikaKayitGovdesi, GozKalemi, GozKalemleriCevabi, GozlerCevabi, KalemGorunumleriCevabi, KayitCevabi, MerkezModelleriCevabi, SalonlarCevabi, YerlesmemisIstasyonlarCevabi, YerlesimCevabi, YerlesimGovdesi,
} from '#paylasilan/sozlesme/atolye.ts';
import type { IstasyonlarCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { EmirlerCevabi, SonOlaylarCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { MakineDurumlariCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { SonOlaylarCevabi as ArkonSonOlaylarCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AtolyeHaritasi } from './AtolyeHaritasi.tsx';

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.atolye', 'atolye.yaz'] };
const OKUYAN: Kullanici = { id: 2, ad: 'Deneme Operatör', islemler: ['sayfa.atolye'] };

const SALON = { id: 1, kod: 'S1', ad: 'Deneme salonu', genislik: '40.00', derinlik: '24.00', hucreBoyu: '4.00', surum: 3, fabrika: { x: '0.00', z: '0.00', donus: '0.0' } };
const SALONLAR = { salonlar: [SALON] } satisfies SalonlarCevabi;

const YERLESIM = {
  salon: {
    ...SALON, giris: { x: '1.00', z: '12.00' }, kaydeden: { id: 1, ad: 'Deneme Yönetici' },
    kaydedildi: '2026-10-07T08:00:00Z', sutunlar: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], satirlar: ['1', '2', '3', '4', '5', '6'],
  },
  makineYerleri: [],
  istasyonYerleri: [
    {
      istasyonId: 5, kod: 'CNC-01', ad: 'Deneme Tezgahı', tip: 'talasli', aktif: true, x: '5.00', z: '5.00', donus: '0.0',
      genislik: '3.00', derinlik: '2.00', hucre: 'B2', makineler: [{ id: 50, kod: 'M-01', ad: 'Deneme Makine', tur: null, markaModel: 'Deneme 500' }], model: null,
      merkezModeli: { belgeId: 40, ad: 'Deneme tezgah modeli', harf: 'B', ozet: 'a'.repeat(64), dosyaTuru: 'stl' },
    },
    { istasyonId: 6, kod: 'CNC-02', ad: 'İkinci Tezgah', tip: 'talasli', aktif: true, x: '12.00', z: '5.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'D2', makineler: [], model: null, merkezModeli: null },
  ],
  raflar: [
    { id: 7, kod: 'R1', ad: 'Palet rafı', tur: 'palet', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2, bolmeGenisligi: '2.70', derinlik: '1.10', yukseklik: '5.00', x: '10.00', z: '18.00', donus: '0.0', aktif: true, genislik: '8.10', hucre: 'C5', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null },
  ],
  alanlar: [],
  duvarlar: [],
  gecisler: [],
} satisfies YerlesimCevabi;

// İkinci bölüm fabrika planında A'nın sağında, 90° dönük: yerel (x, z) -> fabrika (70 - z, x).
const YERLESIM_B = {
  salon: {
    id: 2, kod: 'S2', ad: 'İkinci bölüm', genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 6, fabrika: { x: '70.00', z: '0.00', donus: '90.0' },
    giris: null, kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z', sutunlar: ['A', 'B', 'C', 'D'], satirlar: ['1', '2'],
  },
  istasyonYerleri: [],
  makineYerleri: [],
  raflar: [
    { id: 8, kod: 'R5', ad: 'Konsol raf', tur: 'konsol', bolmeSayisi: 2, katSayisi: 3, gozSayisi: 1, bolmeGenisligi: '1.60', derinlik: '1.20', yukseklik: '3.50', x: '5.00', z: '5.00', donus: '0.0', aktif: true, genislik: '3.20', hucre: 'B1', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null },
  ],
  alanlar: [],
  duvarlar: [],
  gecisler: [],
} satisfies YerlesimCevabi;

const EMIRLER = {
  emirler: [{
    id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1', parcaAd: 'Deneme kapak', adet: 40, istasyon: { id: 5, ad: 'Deneme Tezgahı' },
    durum: 'basladi', acan: { id: 1, ad: 'Deneme Yönetici' }, acilma: '2026-10-07T08:00:00Z', baslama: '2026-10-07T08:05:00Z',
    bitis: null, iptal: null, saglamAdet: null,
    canli: { calisma: 'durdu', saglam: 12, hurda: 1, durusNedeni: { id: 3, ad: 'Takım değişimi' }, durusBaslangic: '2026-10-07T09:00:00Z' },
  }],
} satisfies EmirlerCevabi;

const ARAMA = {
  sonuclar: [{ tur: 'goz', kimlik: 101, etiket: 'R1-02-3-1', ayrinti: 'Palet rafı · bölme 2, kat 3, göz 1', salon: { id: 1, kod: 'S1', ad: 'Deneme salonu' }, hucre: 'C5', x: '10.00', z: '18.00' }],
} satisfies AramaCevabi;

const GOZLER = {
  raf: { id: 7, kod: 'R1', ad: 'Palet rafı', aktif: true },
  satirlar: [{ id: 100, adres: 'R1-01-1-1', bolme: 1, kat: 1, goz: 1 }, { id: 101, adres: 'R1-02-3-1', bolme: 2, kat: 3, goz: 1 }],
  toplam: 24,
  sayfaBoyu: 200,
} satisfies GozlerCevabi;

const gozKalemi = (id: number, kod: string, doluluk: number, bolme = 1, kat = 1, goz = 1): GozKalemi => ({
  id, gozId: bolme === 1 && kat === 1 && goz === 1 ? 100 : 101, adres: `R1-0${bolme}-${kat}-${goz}`, raf: { id: 7, kod: 'R1', ad: 'Palet rafı' },
  salon: { id: 1, kod: 'S1', ad: 'Deneme salonu' }, bolme, kat, goz, kod, ad: `${kod} adı`, malzeme: null, doluluk,
  kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z',
});
const GOZ_KALEMLERI = { kalemler: [gozKalemi(1, 'DENEME-1', 40), gozKalemi(2, 'DENEME-2', 30), gozKalemi(3, 'DENEME-3', 80, 2, 3, 1)] } satisfies GozKalemleriCevabi;
const GORUNUMLER = { kalemler: [] } satisfies KalemGorunumleriCevabi;

const ISTASYONLAR = {
  istasyonlar: [
    { id: 5, kod: 'CNC-01', ad: 'Deneme Tezgahı', isMerkeziId: 1, tip: 'talasli', aktif: true, surum: 1, sorumluKisiId: null, kapasiteKaynagi: null, uretimAlani: true, sorumluAd: null },
    { id: 8, kod: 'MON-01', ad: 'Montaj Masası', isMerkeziId: 1, tip: 'montaj', aktif: true, surum: 1, sorumluKisiId: null, kapasiteKaynagi: null, uretimAlani: true, sorumluAd: null },
  ],
} satisfies IstasyonlarCevabi;

const MERKEZ_MODELLERI = {
  belgeler: [
    { id: 40, ad: 'Deneme tezgah modeli', harf: 'B', ozet: 'a'.repeat(64), dosyaTuru: 'stl' },
    { id: 41, ad: 'Yeni tezgah modeli', harf: 'A', ozet: 'b'.repeat(64), dosyaTuru: 'step' },
  ],
  istasyonlar: [],
} satisfies MerkezModelleriCevabi;

interface Cagri { yontem: string; yol: string; govde: unknown }
interface Ek {
  bolumler?: YerlesimCevabi[];
  kayit?: { durum: number; govde: unknown };
  emirler?: EmirlerCevabi;
  makineDurumlari?: { durum: number; govde: unknown };
  sonOlaylar?: { durum: number; govde: unknown };
  arkonOlaylari?: { durum: number; govde: unknown };
  merkezModelleri?: MerkezModelleriCevabi;
  istasyonlar?: IstasyonlarCevabi;
}

function sunucuKur(kullanici: Kullanici, ek: Ek = {}): Cagri[] {
  const cagrilar: Cagri[] = [];
  const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });
  vi.stubGlobal('fetch', vi.fn((adres: string, secenek: RequestInit = {}) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof secenek.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici } satisfies OturumCevabi));
    if (yol === '/atolye/salonlar') return Promise.resolve(cevap(SALONLAR));
    if (yol === '/atolye/yerlesmemis-istasyonlar') {
      return Promise.resolve(cevap({ istasyonlar: [
        { istasyonId: 8, kod: 'MON-01', ad: 'Montaj Masası', tip: 'montaj', model: { ad: 'Taslak model', yayinda: false } },
        { istasyonId: 9, kod: 'CNC-09', ad: 'Yeni Tezgah', tip: 'talasli', model: null },
      ] } satisfies YerlesmemisIstasyonlarCevabi));
    }
    if (yol === '/atolye/fabrika') return Promise.resolve(cevap({ bolumler: ek.bolumler ?? [YERLESIM] }));
    if (yol === '/atolye/fabrika/kaydet' && yontem === 'POST') {
      const k = ek.kayit ?? { durum: 200, govde: { bolumler: ek.bolumler ?? [YERLESIM], uyarilar: [] } };
      return Promise.resolve(cevap(k.govde, k.durum));
    }
    if (yol.startsWith('/uretim-emirleri/son-olaylar')) {
      const k = ek.sonOlaylar ?? { durum: 200, govde: { olaylar: [] } };
      return Promise.resolve(cevap(k.govde, k.durum));
    }
    if (yol.startsWith('/arkon/son-olaylar')) {
      const k = ek.arkonOlaylari ?? { durum: 200, govde: { olaylar: [] } };
      return Promise.resolve(cevap(k.govde, k.durum));
    }
    if (yol === '/makine-durumlari') {
      const k = ek.makineDurumlari ?? { durum: 403, govde: { kod: 'YETKISIZ', mesaj: 'Yetki yok' } };
      return Promise.resolve(cevap(k.govde, k.durum));
    }
    if (yol.startsWith('/uretim-emirleri')) return Promise.resolve(cevap(ek.emirler ?? EMIRLER));
    if (yol.startsWith('/atolye/arama')) return Promise.resolve(cevap(ARAMA));
    if (yol.startsWith('/atolye/raflar/7/gozler')) return Promise.resolve(cevap(GOZLER));
    if (yol.startsWith('/istasyonlar')) return Promise.resolve(cevap(ek.istasyonlar ?? ISTASYONLAR));
    if (yol === '/makineler') {
      const makine = { tur: null, markaModel: null, seriNo: null, baglantiTuru: null, baglantiAdresi: null };
      return Promise.resolve(cevap({ makineler: [
        { ...makine, id: 31, kod: 'M-31', ad: 'Dik İşlem', istasyonId: 5, aktif: true, surum: 1 },
        { ...makine, id: 32, kod: 'M-32', ad: 'Eski Tezgah', istasyonId: 5, aktif: false, surum: 1 },
      ] }));
    }
    if (yol.startsWith('/atolye/goz-kalemleri/yaz')) {
      const g = JSON.parse(String(secenek.body)) as { kod: string; doluluk: number };
      return Promise.resolve(cevap({ ...gozKalemi(9, g.kod, g.doluluk) }));
    }
    if (yol.startsWith('/atolye/goz-kalemleri')) return Promise.resolve(cevap(GOZ_KALEMLERI));
    if (yol === '/atolye/kalem-gorunumleri') return Promise.resolve(cevap(GORUNUMLER));
    if (yol.endsWith('/kroki')) return Promise.resolve(cevap({ kroki: null }));
    if (yol === '/atolye/cizim-merkezi/modeller') return Promise.resolve(cevap(ek.merkezModelleri ?? MERKEZ_MODELLERI));
    if (yol === '/atolye/istasyonlar/5/merkez-modeli-bagla' && yontem === 'POST') {
      const g = JSON.parse(String(secenek.body)) as { belgeId: number | null };
      const b = MERKEZ_MODELLERI.belgeler.find((x) => x.id === g.belgeId);
      return Promise.resolve(cevap({ merkezModeli: b ? { belgeId: b.id, ad: b.ad, harf: b.harf, ozet: b.ozet, dosyaTuru: b.dosyaTuru } : null }));
    }
    if (yol === '/atolye/salonlar/1/yerlesim-kaydet' && yontem === 'POST') {
      const k = ek.kayit ?? { durum: 200, govde: { ...YERLESIM, salon: { ...YERLESIM.salon, surum: 4 }, uyarilar: [] } satisfies KayitCevabi };
      return Promise.resolve(cevap(k.govde, k.durum));
    }
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
  return cagrilar;
}

function goster(ekran: ReactElement, adres = '/atolye') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[adres]}><QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('fabrika haritası', () => {
  it('istasyon listesi canlı durumu, emri ve duruş nedenini gösterir; özet sayılar ve sağlam toplamı gelir', async () => {
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    const liste = await screen.findByRole('region', { name: 'Makineler' });
    const ilk = await within(liste).findByRole('button', { name: /CNC-01/ });
    expect(within(ilk).getByText('Durdu')).toBeTruthy();
    expect(within(ilk).getByText('Takım değişimi')).toBeTruthy();
    expect(within(ilk).getByText('12 / 40')).toBeTruthy();
    expect(within(within(liste).getByRole('button', { name: /CNC-02/ })).getByText('Bekliyor')).toBeTruthy();
    const ozet = screen.getByLabelText('Özet');
    expect(within(ozet).getByText('Durdu').closest('div')?.textContent).toBe('Durdu1');
    expect(within(ozet).getByText('Bekliyor').closest('div')?.textContent).toBe('Bekliyor1');
    expect(within(ozet).getByText('12')).toBeTruthy();
  });

  it('makine başına durum: iş emrinin makinesi kendi durumunu taşır, öbür makine bekler; arıza çalışan emrin üstündedir (K2)', async () => {
    const makine = (makineId: number, kod: string, x: string) => ({
      makineId, kod, ad: `Tezgah ${kod}`, tur: null, markaModel: null, aktif: true,
      istasyon: { id: 5, kod: 'CNC-01', ad: 'Deneme Tezgahı', tip: 'talasli' as const, aktif: true },
      x, z: '5.00', donus: '0.0', genislik: '1.50', derinlik: '2.00', hucre: 'B2', model: null,
    });
    const emirler = {
      emirler: [{
        id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1', parcaAd: 'Deneme kapak', adet: 40, istasyon: { id: 5, ad: 'Deneme Tezgahı' },
        durum: 'basladi', acan: { id: 1, ad: 'Deneme Yönetici' }, acilma: '2026-10-07T08:00:00Z', baslama: '2026-10-07T08:05:00Z',
        bitis: null, iptal: null, saglamAdet: null,
        canli: { calisma: 'calisiyor', saglam: 12, hurda: 0, durusNedeni: null, durusBaslangic: null, isEmri: { id: 300, opNo: 20, ad: 'Frezeleme', makineId: 52 } },
      }],
    } satisfies EmirlerCevabi;
    const durumlar = { durumlar: [{ makineId: 52, durum: 'ariza', aciklama: 'Mil rulmanı', degistiren: { id: 1, ad: null }, degisme: '2026-10-13T08:00:00Z', surum: 2 }] } satisfies MakineDurumlariCevabi;
    sunucuKur(OKUYAN, { bolumler: [{ ...YERLESIM, makineYerleri: [makine(51, 'M-51', '4.00'), makine(52, 'M-52', '6.00')] }], emirler, makineDurumlari: { durum: 200, govde: durumlar } });
    goster(<AtolyeHaritasi />);
    const plan = await screen.findByRole('img', { name: 'Atölye planı' });
    const ozet = screen.getByLabelText('Özet');
    expect((await within(ozet).findByText('Arıza, bakım (makine)')).closest('div')?.textContent).toBe('Arıza, bakım (makine)1');
    fireEvent.pointerDown(within(plan).getByText('M-52').closest('g') as Element);
    const kart = await screen.findByRole('region', { name: 'M-52 ayrıntısı' });
    expect(within(kart).getAllByText('Arıza').length).toBeGreaterThan(0);
    expect(within(kart).getByText('Mil rulmanı')).toBeTruthy();
    expect(within(kart).getByText('Op 20 · Frezeleme')).toBeTruthy();
    expect(within(kart).getByText('UE-000030')).toBeTruthy();
    fireEvent.pointerDown(within(plan).getByText('M-51').closest('g') as Element);
    const ikinci = await screen.findByRole('region', { name: 'M-51 ayrıntısı' });
    expect(within(ikinci).getByText('Bu makinede başlamış emir yok')).toBeTruthy();
  });

  it('arıza okuma yetkisi yoksa (403) harita arızasız açılır ve arıza göstergesi çıkmaz', async () => {
    const cagrilar = sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/makine-durumlari')).toBe(true));
    expect(within(screen.getByLabelText('Özet')).queryByText('Arıza, bakım (makine)')).toBeNull();
    expect(within(screen.getByLabelText('Özet')).getByText('Durdu').closest('div')?.textContent).toBe('Durdu1');
  });

  it('son hareketler: olaylar yeniden eskiye listelenir, olaya basınca makinesi seçilir; yetki yoksa söylenir (K3)', async () => {
    const olaylar = {
      olaylar: [
        { id: 's-2', olay: 'saglam', emir: { id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1' }, isEmri: { id: 300, opNo: 20, ad: 'Frezeleme' }, makine: null, istasyon: { id: 5, ad: 'Deneme Tezgahı' }, kisi: { id: 2, ad: 'Deneme Operatör' }, adet: 3, durusNedeni: null, zaman: '2026-10-13T09:10:00Z' },
        { id: 'k-1', olay: 'durdur', emir: { id: 30, emirNo: 'UE-000030', parcaNo: 'DENEME-1' }, isEmri: null, makine: null, istasyon: { id: 6, ad: 'İkinci Tezgah' }, kisi: { id: 2, ad: 'Deneme Operatör' }, adet: null, durusNedeni: { id: 3, ad: 'Takım değişimi' }, zaman: '2026-10-13T09:00:00Z' },
      ],
    } satisfies SonOlaylarCevabi;
    sunucuKur(OKUYAN, { sonOlaylar: { durum: 200, govde: olaylar } });
    goster(<AtolyeHaritasi />);
    await screen.findByRole('region', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('button', { name: 'Son hareketler' }));
    const liste = await screen.findByRole('region', { name: 'Son hareketler' });
    const kartlar = await within(liste).findAllByRole('button', { name: /UE-000030/ });
    expect(kartlar).toHaveLength(2);
    expect(within(kartlar[0] as HTMLElement).getByText('+3 adet')).toBeTruthy();
    expect(within(kartlar[0] as HTMLElement).getByText('Sayım')).toBeTruthy();
    expect(within(kartlar[1] as HTMLElement).getByText('Takım değişimi')).toBeTruthy();
    fireEvent.click(kartlar[1] as HTMLElement);
    expect(await screen.findByRole('region', { name: 'CNC-02 ayrıntısı' })).toBeTruthy();
    cleanup();
    const yetkisiz = { durum: 403, govde: { kod: 'YETKISIZ', mesaj: 'Yetki yok' } };
    sunucuKur(OKUYAN, { sonOlaylar: yetkisiz, arkonOlaylari: yetkisiz });
    goster(<AtolyeHaritasi />);
    await screen.findByRole('region', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('button', { name: 'Son hareketler' }));
    expect(await screen.findByText(/Son hareketleri görme yetkiniz yok/)).toBeTruthy();
  });

  it('son hareketler Arkon olaylarını da gösterir: ölçüm ve çağrı gelir, sayım ve emre bağlı durum olayı çift yazılmaz; Arkon yetkisizse liste eksik denir (ATL-40)', async () => {
    const arkon = {
      olaylar: [
        { id: 9, tur: 'calls', zaman: '2026-10-13T09:20:00Z', istasyonKodu: 'CNC-02', istasyonId: 6, emirNo: null, kisi: { id: 2, ad: 'Deneme Operatör' } },
        { id: 8, tur: 'counts', zaman: '2026-10-13T09:15:00Z', istasyonKodu: 'CNC-01', istasyonId: 5, emirNo: 'UE-000030', kisi: { id: 2, ad: 'Deneme Operatör' } },
        { id: 7, tur: 'events', zaman: '2026-10-13T09:05:00Z', istasyonKodu: 'CNC-01', istasyonId: 5, emirNo: 'UE-000030', kisi: { id: 2, ad: 'Deneme Operatör' } },
        { id: 6, tur: 'meas', zaman: '2026-10-13T08:50:00Z', istasyonKodu: 'CNC-01', istasyonId: 5, emirNo: 'UE-000030', kisi: { id: 2, ad: 'Deneme Operatör' } },
      ],
    } satisfies ArkonSonOlaylarCevabi;
    sunucuKur(OKUYAN, { sonOlaylar: { durum: 403, govde: { kod: 'YETKISIZ', mesaj: 'Yetki yok' } }, arkonOlaylari: { durum: 200, govde: arkon } });
    goster(<AtolyeHaritasi />);
    await screen.findByRole('region', { name: 'Makineler' });
    fireEvent.click(screen.getByRole('button', { name: 'Son hareketler' }));
    const liste = await screen.findByRole('region', { name: 'Son hareketler' });
    expect(await within(liste).findByText(/Üretim emri olayları okunamadı \(yetki yok\)/)).toBeTruthy();
    const kartlar = await within(liste).findAllByRole('button', { name: /Terminal/ });
    expect(kartlar).toHaveLength(2);
    expect(within(kartlar[0] as HTMLElement).getByText('Çağrı')).toBeTruthy();
    expect(within(kartlar[1] as HTMLElement).getByText('Ölçüm')).toBeTruthy();
    fireEvent.click(kartlar[0] as HTMLElement);
    expect(await screen.findByRole('region', { name: 'CNC-02 ayrıntısı' })).toBeTruthy();
  });

  it('WebGL yoksa aynı yerleşim iki boyutlu planla gösterilir; plana dokununca öğe kartı açılır', async () => {
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    const plan = await screen.findByRole('img', { name: 'Atölye planı' });
    expect(within(plan).getByText('CNC-01')).toBeTruthy();
    expect(within(plan).getByText('R1')).toBeTruthy();
    fireEvent.pointerDown(within(plan).getByText('CNC-01').closest('g') as Element);
    const kart = await screen.findByRole('region', { name: 'CNC-01 ayrıntısı' });
    expect(within(kart).getByText(/Deneme 500/)).toBeTruthy();
    expect(within(kart).getByText('UE-000030')).toBeTruthy();
    expect(within(kart).getByText('Deneme tezgah modeli (Çizim Merkezi, Rev B)')).toBeTruthy();
  });

  it('raf kartında göz içeriği göz kalemlerinden; göze basınca içi açılır, okuyan düzenleyemez', async () => {
    const cagrilar = sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    const plan = await screen.findByRole('img', { name: 'Atölye planı' });
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/atolye/goz-kalemleri?salonId=1')).toBe(true));
    fireEvent.pointerDown(within(plan).getByText('R1').closest('g') as Element);
    const kart = await screen.findByRole('region', { name: 'Raf R1 ayrıntısı' });
    expect(await within(kart).findByText('DENEME-1, DENEME-2 · %70')).toBeTruthy();
    fireEvent.click(within(kart).getByText('R1-01-1-1'));
    const panel = await within(kart).findByRole('region', { name: 'Göz R1-01-1-1' });
    expect(within(panel).getByText('DENEME-1 adı')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /Kalem koy/ })).toBeNull();
    expect(within(panel).queryByLabelText('Doluluk %')).toBeNull();
  });

  it('depo: raf cephesinde göze basınca panel açılır; yazan kalem koyar (boş yer kadar)', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    fireEvent.click(screen.getByRole('tab', { name: 'Depo' }));
    const cephe = await screen.findByRole('group', { name: 'R1 bölme 1 önden' });
    fireEvent.click(within(cephe).getByRole('button', { name: /Kat 1 göz 1: DENEME-1 %40, DENEME-2 %30/ }));
    const panel = await screen.findByRole('region', { name: 'Göz R1-01-1-1' });
    expect(cagrilar.some((c) => c.yol === '/atolye/raflar/7/gozler?sayfa=1&bolme=1')).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'Kalem koy' }));
    fireEvent.change(within(panel).getByLabelText('Kod (parça no ya da malzeme kodu)'), { target: { value: 'YENI-1' } });
    fireEvent.change(within(panel).getByLabelText('Ad'), { target: { value: 'Yeni kalem' } });
    expect(within(panel).getByText('Gözde %30 yer var.')).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText('Doluluk %'), { target: { value: '20' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Göze koy' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/atolye/goz-kalemleri/yaz')).toBe(true));
    expect(cagrilar.find((c) => c.yol === '/atolye/goz-kalemleri/yaz')?.govde).toEqual({ gozId: 100, kod: 'YENI-1', ad: 'Yeni kalem', doluluk: 20 });
  });

  it('parçalar: kod başına satır, nerede durduğu ve hangi makinede üretildiği; "Rafta göster" depoya götürür', async () => {
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    fireEvent.click(screen.getByRole('tab', { name: 'Parçalar' }));
    const tablo = await screen.findByRole('table', { name: 'Parçalar ve malzemeler' });
    const satir = within(tablo).getByText('DENEME-1').closest('tr') as HTMLElement;
    expect(within(satir).getByText('R1-01-1-1 %40')).toBeTruthy();
    expect(within(satir).getByText('Deneme Tezgahı')).toBeTruthy();
    fireEvent.click(satir);
    const ayrinti = await screen.findByRole('region', { name: 'DENEME-1 ayrıntısı' });
    expect(within(ayrinti).getByText('Üretiliyor')).toBeTruthy();
    fireEvent.click(within(ayrinti).getByRole('button', { name: 'Rafta göster' }));
    expect(await screen.findByRole('region', { name: 'Göz R1-01-1-1' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Depo' }).getAttribute('aria-selected')).toBe('true');
  });

  it('bölmeye karşıdan bakış: yalnız bölme çizilir, oklar bölme değiştirir, göz seçilir, Escape çıkar', async () => {
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    fireEvent.click(screen.getByRole('tab', { name: 'Depo' }));
    fireEvent.click(await screen.findByRole('button', { name: '3B karşıdan bak' }));
    const cubuk = await screen.findByRole('toolbar', { name: 'Bölme görünümü' });
    expect(screen.queryByRole('img', { name: 'Atölye planı' })).toBeNull();
    expect(within(cubuk).getByText('Bölme 01/03')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await within(cubuk).findByText('Bölme 02/03')).toBeTruthy();
    const cephe = screen.getByRole('group', { name: 'R1 bölme 2 önden' });
    fireEvent.click(within(cephe).getByRole('button', { name: /Kat 3 göz 1: DENEME-3 %80/ }));
    expect(await screen.findByRole('region', { name: 'Göz R1-02-3-1' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Göz R1-02-3-1' })).toBeNull());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await screen.findByRole('img', { name: 'Atölye planı' })).toBeTruthy();
  });

  it('tam ekran: harita ekranı kaplar, otomatik tur ve liste düğmesi gelir; Escape ile çıkılır', async () => {
    sunucuKur(OKUYAN);
    const { container } = goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    expect(screen.queryByRole('button', { name: /Otomatik tur/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Tam ekran/ }));
    expect(container.querySelector('.tc-atolye-tam')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Otomatik tur/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Makine listesini/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Otomatik tur/ }));
    // Tur sorunlu istasyondan başlar: duran CNC-01 seçilir, kartı açılır.
    expect(await screen.findByRole('region', { name: 'CNC-01 ayrıntısı' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('.tc-atolye-tam')).toBeNull());
  });

  it('hafif görünüm: düğme açar ve kapatır, seçim cihazda saklanır (kart 1588)', async () => {
    // Elle seçim performans modunun önüne geçer.
    localStorage.setItem('tmiv2.atolye.hafif', 'kapali');
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    const dugme = screen.getByRole('button', { name: /Hafif görünüm/ });
    expect(dugme.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(dugme);
    const acik = screen.getByRole('button', { name: /Tam görünüm/ });
    expect(acik.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('tmiv2.atolye.hafif')).toBe('acik');
    fireEvent.click(acik);
    expect(screen.getByRole('button', { name: /Hafif görünüm/ }).getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('tmiv2.atolye.hafif')).toBe('kapali');
    localStorage.removeItem('tmiv2.atolye.hafif');
  });

  it('okuma yetkisiyle düzenleme ve salon ekleme düğmesi görünmez', async () => {
    sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    expect(screen.queryByRole('button', { name: 'Bölümün yerleşimini düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bölüm' })).toBeNull();
  });

  it('bölüm yoksa boş durum; yazabilen bölüm ekleyebilir', async () => {
    sunucuKur(YAZAN, { bolumler: [] });
    goster(<AtolyeHaritasi />);
    expect(await screen.findByText('Henüz fabrika bölümü tanımlı değil.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bölüm ekle' }));
    expect(await screen.findByRole('dialog', { name: 'Yeni fabrika bölümü' })).toBeTruthy();
  });

  it('birden çok bölümde tüm fabrika birlikte görünür; bölüm seçilince yalnız o bölüm, bölüm adına basınca o bölüm açılır', async () => {
    const cagrilar = sunucuKur(OKUYAN, { bolumler: [YERLESIM, YERLESIM_B] });
    goster(<AtolyeHaritasi />);
    const plan = await screen.findByRole('img', { name: 'Fabrika planı' });
    expect(within(plan).getByText('CNC-01')).toBeTruthy();
    expect(within(plan).getByText('R5')).toBeTruthy();
    expect(within(plan).getByText('S2 · İkinci bölüm')).toBeTruthy();
    // Fabrikada da yürünür (bölümden bölüme ortak duvardaki geçişten); göz kalemleri bütün bölümlerden.
    expect(screen.getByRole('button', { name: 'Yürüyerek gez' })).toBeTruthy();
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/atolye/goz-kalemleri')).toBe(true));
    expect(within(screen.getByLabelText('Özet')).getByText('Bölüm').closest('div')?.textContent).toBe('Bölüm2');

    fireEvent.change(screen.getByLabelText('Bölüm'), { target: { value: '2' } });
    const tek = await screen.findByRole('img', { name: 'Atölye planı' });
    expect(within(tek).getByText('R5')).toBeTruthy();
    expect(within(tek).queryByText('CNC-01')).toBeNull();
    expect(screen.getByRole('button', { name: 'Yürüyerek gez' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Bölüm'), { target: { value: 'fabrika' } });
    const fabrika = await screen.findByRole('img', { name: 'Fabrika planı' });
    fireEvent.pointerDown(within(fabrika).getByText('S1 · Deneme salonu').closest('g') as Element);
    const s1 = await screen.findByRole('img', { name: 'Atölye planı' });
    expect(within(s1).getByText('CNC-01')).toBeTruthy();
    expect(within(s1).queryByText('R5')).toBeNull();
  });

  it('fabrika düzenleyici: bölüm içindekilerle taşınır, istasyon bölümden bölüme geçer; bütün bölümler tek komutla kaydedilir', async () => {
    const cagrilar = sunucuKur(YAZAN, { bolumler: [YERLESIM, YERLESIM_B] });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fabrika planını düzenle (bütün bölümler)' }));
    const duzen = await screen.findByRole('dialog', { name: 'Fabrika planını düzenle' });
    // Bölüm B'yi seç, 2 m sağa al: rafı birlikte gelir (bölüm metresinde yeri değişmez).
    fireEvent.click(within(duzen).getByRole('button', { name: 'S2 · İkinci bölüm' }));
    expect(within(duzen).getByRole('heading', { name: 'Bölüm S2' })).toBeTruthy();
    fireEvent.change(within(duzen).getByLabelText('X (m)'), { target: { value: '72' } });
    // CNC-02 (A'da) fabrika planında B'nin içine konur.
    const plan = within(duzen).getByRole('img', { name: 'Fabrika planı (düzenleniyor)' });
    fireEvent.pointerDown(within(plan).getByText('CNC-02').closest('g') as Element);
    expect(within(duzen).getByRole('heading', { name: 'CNC-02' })).toBeTruthy();
    fireEvent.change(within(duzen).getByLabelText('X (m)'), { target: { value: '66' } });
    fireEvent.change(within(duzen).getByLabelText('Z (m)'), { target: { value: '12' } });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fabrika planını düzenle' })).toBeNull());
    const govde = cagrilar.find((c) => c.yol === '/atolye/fabrika/kaydet')?.govde as FabrikaKayitGovdesi;
    const [a, b] = govde.bolumler;
    expect(a?.salonId).toBe(1);
    expect(a?.yerlesim.surum).toBe(3);
    expect(a?.yerlesim.istasyonYerleri.map((i) => i.istasyonId)).toEqual([5]);
    expect(b?.salonId).toBe(2);
    expect(b?.yerlesim.surum).toBe(6);
    expect(b?.fabrika).toEqual({ x: 72, z: 0, donus: 90 });
    expect(b?.yerlesim.raflar.map((r) => [r.id, r.x, r.z, r.donus])).toEqual([[8, 5, 5, 0]]);
    expect(b?.yerlesim.istasyonYerleri.map((i) => [i.istasyonId, i.x, i.z, i.donus])).toEqual([[6, 12, 6, 270]]);
  });

  it('raf net ölçüleri: kat kat girilir, eksik kat uyarılır, kayıtta gövdeye gider', async () => {
    const cagrilar = sunucuKur(YAZAN, { bolumler: [YERLESIM, YERLESIM_B] });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fabrika planını düzenle (bütün bölümler)' }));
    const duzen = await screen.findByRole('dialog', { name: 'Fabrika planını düzenle' });
    const plan = within(duzen).getByRole('img', { name: 'Fabrika planı (düzenleniyor)' });
    fireEvent.pointerDown(within(plan).getByText('R5').closest('g') as Element);
    expect(within(duzen).getByRole('heading', { name: 'Raf R5' })).toBeTruthy();
    fireEvent.change(within(duzen).getByLabelText('Göz net genişliği (m)'), { target: { value: '1.4' } });
    fireEvent.change(within(duzen).getByLabelText('1. kat net (m)'), { target: { value: '0.9' } });
    expect(within(duzen).getByText('3 katın hepsi girilmeli ya da hepsi boş kalmalı (1 girildi).')).toBeTruthy();
    fireEvent.change(within(duzen).getByLabelText('2. kat net (m)'), { target: { value: '0.8' } });
    fireEvent.change(within(duzen).getByLabelText('3. kat net (m)'), { target: { value: '0.7' } });
    expect(within(duzen).queryByText(/hepsi girilmeli/)).toBeNull();
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fabrika planını düzenle' })).toBeNull());
    const govde = cagrilar.find((c) => c.yol === '/atolye/fabrika/kaydet')?.govde as FabrikaKayitGovdesi;
    const raf = govde.bolumler[1]?.yerlesim.raflar[0];
    expect([raf?.katYukseklikleri, raf?.gozGenisligi, raf?.gozDerinligi]).toEqual([[0.9, 0.8, 0.7], 1.4, null]);
  });

  it('fabrika düzenleyici: hiçbir bölümün içinde olmayan öğe kaydı durdurur; sunucu bulgusu bölüm anahtarıyla eşlenir', async () => {
    const cagrilar = sunucuKur(YAZAN, {
      bolumler: [YERLESIM, YERLESIM_B],
      kayit: { durum: 422, govde: { kod: 'GECERSIZ', mesaj: 'Fabrika planı kaydedilemedi.', ayrinti: { ihlaller: [{ kural: 'ATL-31', mesaj: 'S1 ve S2 üst üste.', ogeler: ['bolum:2', 'salon:1/istasyon:5'] }] } } },
    });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fabrika planını düzenle (bütün bölümler)' }));
    const duzen = await screen.findByRole('dialog', { name: 'Fabrika planını düzenle' });
    const plan = within(duzen).getByRole('img', { name: 'Fabrika planı (düzenleniyor)' });
    fireEvent.pointerDown(within(plan).getByText('CNC-02').closest('g') as Element);
    fireEvent.change(within(duzen).getByLabelText('X (m)'), { target: { value: '50' } });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    expect(within(await within(duzen).findByRole('alert')).getByText(/hiçbir bölümün içinde değil/)).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/atolye/fabrika/kaydet')).toBe(false);

    fireEvent.change(within(duzen).getByLabelText('X (m)'), { target: { value: '20' } });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(within(duzen).getByRole('alert').textContent).toMatch(/ATL-31/));
    expect(duzen.querySelectorAll('.tc-plan-hatali')).toHaveLength(3);
  });

  it('göz adresi aranınca rafı seçilir, kartta gözler sayfalı listelenir ve aranan adres yazılır', async () => {
    const cagrilar = sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('img', { name: 'Atölye planı' });
    fireEvent.change(screen.getByLabelText('Ara'), { target: { value: 'r1-02-3-1' } });
    fireEvent.click(await screen.findByRole('option', { name: /R1-02-3-1/ }));
    const kart = await screen.findByRole('region', { name: 'Raf R1 ayrıntısı' });
    expect(await within(kart).findByRole('table', { name: 'Raf gözleri' })).toBeTruthy();
    expect(within(kart).getAllByText('R1-02-3-1').length).toBeGreaterThan(0);
    expect(cagrilar.some((c) => c.yol === '/atolye/arama?metin=r1-02-3-1')).toBe(true);
  });

  it('düzenleyici: paletten raf eklenir ve yerleşim tek komutla, açılan sürümle kaydedilir', async () => {
    const cagrilar = sunucuKur(YAZAN, { merkezModelleri: { ...MERKEZ_MODELLERI, taslaklar: [{ istasyonId: 8, belgeId: 77, ad: 'Taslak model' }] } });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Palet rafı' }));
    expect(within(duzen).getByRole('heading', { name: 'Raf R2' })).toBeTruthy();
    fireEvent.click(await within(duzen).findByRole('button', { name: /MON-01/ }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeNull());
    const kayit = cagrilar.find((c) => c.yontem === 'POST');
    const govde = kayit?.govde as YerlesimGovdesi;
    expect(govde.surum).toBe(3);
    expect(govde.raflar.map((r) => [r.id, r.kod])).toEqual([[7, 'R1'], [null, 'R2']]);
    expect(govde.istasyonYerleri.map((i) => i.istasyonId)).toEqual([5, 6, 8]);
  });

  it('düzenleyici: paletteki yerleşmemiş aktif makine plana eklenir ve kayıtta makine yeri olarak gider (ATL-37)', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(await within(duzen).findByRole('button', { name: /M-31/ }));
    expect(within(duzen).queryByRole('button', { name: /M-32/ })).toBeNull();
    expect(within(duzen).getByRole('heading', { name: 'M-31' })).toBeTruthy();
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeNull());
    const govde = cagrilar.find((c) => c.yontem === 'POST')?.govde as YerlesimGovdesi;
    expect(govde.makineYerleri?.map((m) => [m.makineId, m.genislik, m.derinlik])).toEqual([[31, 3.5, 2.6]]);
  });

  it('düzenleyici: Çizim Merkezi\'nde makineyle eşleştirilen model Ekle listesinde istasyonun yanında işaretli ve başta gelir (kart #1196)', async () => {
    const b = MERKEZ_MODELLERI.belgeler[1]!;
    const merkezModeli = { belgeId: b.id, ad: b.ad, harf: b.harf, ozet: b.ozet, dosyaTuru: b.dosyaTuru };
    sunucuKur(YAZAN, { merkezModelleri: { ...MERKEZ_MODELLERI, istasyonlar: [{ istasyonId: 8, merkezModeli }] } });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    const dugme = await within(duzen).findByRole('button', { name: /MON-01/ });
    await waitFor(() => expect(within(dugme).getByLabelText('3B modeli var')).toBeTruthy());
    expect(dugme.getAttribute('title')).toContain('3B model: Yeni tezgah modeli (Rev A)');
    // Kart #1258: eşleşmiş ama haritada olmayan istasyon "Eklenecek makineler" başlığında bekler.
    expect(within(within(duzen).getByRole('region', { name: 'Eklenecek makineler' })).getByRole('button', { name: /MON-01/ })).toBe(dugme);
    // Haritada istasyon kaydı "Eklenecek makineler", istasyonun altındaki makine kayıtları "Ekipmanlar" başlığıyla görünür.
    expect(within(duzen).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(expect.arrayContaining(['Eklenecek makineler', 'Ekipmanlar']));
  });

  it('adres ?suzgec=yerlesmemis&istasyon=9 yan listeyi "Yerleşmemiş makineler"de açar; makine modeliyle listelenir, verilen vurgulanır, seçince düzenleyici açılır (kart #1296)', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />, '/atolye?suzgec=yerlesmemis&istasyon=9');
    const liste = await screen.findByRole('region', { name: 'Yerleşmemiş makineler' });
    await within(liste).findByText('MON-01');
    expect(within(liste).getByText(/taslak, yayınlanınca görünür/)).toBeTruthy();
    expect(within(liste).getByText('Çizim Merkezi modeli yok')).toBeTruthy();
    expect(within(liste).getByText('2 makine')).toBeTruthy();
    const yeni = within(liste).getByText('CNC-09').closest('button') as HTMLElement;
    expect(yeni.getAttribute('aria-current')).toBe('true');
    fireEvent.click(yeni);
    expect(await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/atolye/yerlesmemis-istasyonlar')).toBe(true);
  });

  it('süzgeç adreste yoksa yerleşmemiş makineler sorulmaz; düğmeyle açılır (kart #1296)', async () => {
    const cagrilar = sunucuKur(OKUYAN);
    goster(<AtolyeHaritasi />);
    await screen.findByRole('region', { name: 'Makineler' });
    expect(cagrilar.some((c) => c.yol === '/atolye/yerlesmemis-istasyonlar')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Yerleşmemiş makineler' }));
    const liste = await screen.findByRole('region', { name: 'Yerleşmemiş makineler' });
    await within(liste).findByText('MON-01');
    expect(within(liste).getByText(/yetkisi olan kişi/)).toBeTruthy();
  });

  it('düzenleyici: çizimi taslakta olan eşleşme Eklenecek makinelerde "yayınlanınca görünür" notuyla durur (kart #1258)', async () => {
    sunucuKur(YAZAN, { merkezModelleri: { ...MERKEZ_MODELLERI, istasyonlar: [], taslaklar: [{ istasyonId: 8, belgeId: 77, ad: 'Taslak model' }] } });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    const grup = await within(duzen).findByRole('region', { name: 'Eklenecek makineler' });
    const dugme = within(grup).getByRole('button', { name: /MON-01/ });
    expect(dugme.textContent).toContain('Çizim yayınlanınca görünür');
    expect(dugme.getAttribute('title')).toContain('3B model: Taslak model (taslak)');
  });

  it('düzenleyici: Ekle listesine yalnız eşleşmiş makine ve "Örnek" etiketli örnek makine gelir; eşleşmeyenler sayılır', async () => {
    const ornek = { id: 20, kod: 'ORN-TORNA-1', ad: 'Örnek Torna 1', isMerkeziId: 1, tip: 'talasli' as const, aktif: true, surum: 1, sorumluKisiId: null, kapasiteKaynagi: null, uretimAlani: true, sorumluAd: null };
    sunucuKur(YAZAN, { istasyonlar: { istasyonlar: [...ISTASYONLAR.istasyonlar, ornek] } });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    const grup = within(duzen).getByRole('region', { name: 'Eklenecek makineler' });
    const dugme = await within(grup).findByRole('button', { name: /ORN-TORNA-1/ });
    expect(within(dugme).getByText('Örnek')).toBeTruthy();
    expect(within(duzen).queryByRole('button', { name: /MON-01/ })).toBeNull();
    expect(within(grup).getByRole('note').textContent).toContain('Eşleşmemiş 1 makine eklenemez');
  });

  it('düzenleyici: istasyonun Çizim Merkezi modeli seçilince hemen bağlanır; panelin gördüğü model beklenen olarak gider', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    const plan = within(duzen).getByRole('img', { name: 'Yerleşim planı (düzenleniyor)' });
    fireEvent.pointerDown(within(plan).getByText('CNC-01').closest('g') as Element);
    const secim = within(duzen).getByLabelText('Çizim Merkezi modeli') as HTMLSelectElement;
    expect(secim.value).toBe('40');
    await waitFor(() => expect(secim.disabled).toBe(false));
    fireEvent.change(secim, { target: { value: '41' } });
    await waitFor(() => expect(secim.value).toBe('41'));
    expect(cagrilar.find((c) => c.yol === '/atolye/istasyonlar/5/merkez-modeli-bagla')?.govde).toEqual({ belgeId: 41, beklenen: 40 });
    fireEvent.change(secim, { target: { value: '' } });
    await waitFor(() => expect(secim.value).toBe(''));
    expect(cagrilar.filter((c) => c.yol === '/atolye/istasyonlar/5/merkez-modeli-bagla').at(-1)?.govde).toEqual({ belgeId: null, beklenen: 41 });
    // Seçim yerleşim kaydına girmez.
    expect(cagrilar.some((c) => c.yol.endsWith('/yerlesim-kaydet'))).toBe(false);
  });

  it('düzenleyici: geçiş türüyle eklenir, türü ve duvarı değişir, kayıtta gövdeye gider', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kapı' }));
    expect(within(duzen).getByRole('heading', { name: 'Kapı' })).toBeTruthy();
    fireEvent.change(within(duzen).getByLabelText('Tür'), { target: { value: 'yangin_kapisi' } });
    fireEvent.change(within(duzen).getByLabelText('Duvar'), { target: { value: 'sol' } });
    fireEvent.change(within(duzen).getByLabelText('Duvar ortasından kayma (m)'), { target: { value: '2' } });
    expect(within(duzen).getByRole('heading', { name: 'Yangın kapısı' })).toBeTruthy();
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeNull());
    const govde = cagrilar.find((c) => c.yontem === 'POST')?.govde as YerlesimGovdesi;
    expect(govde.gecisler).toEqual([{ tur: 'yangin_kapisi', kenar: 'sol', ofset: 2, genislik: 1 }]);
  });

  it('düzenleyici: kroki paneli açılır; kroki yokken PDF seçilir, ölç aracı açılıp Escape ile bırakılır', async () => {
    const cagrilar = sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kroki' }));
    const panel = within(duzen).getByRole('complementary', { name: 'Kroki' });
    expect(await within(panel).findByRole('button', { name: 'PDF kroki seç' })).toBeTruthy();
    expect(within(panel).getByLabelText('Kroki PDF dosyası')).toBeTruthy();
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/atolye/salonlar/1/kroki')).toBe(true));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ölç' }));
    expect(within(duzen).getByRole('status').textContent).toMatch(/iki noktaya/);
    fireEvent.keyDown(duzen, { key: 'Escape' });
    expect(within(duzen).queryByRole('status')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeTruthy();
  });

  it('düzenleyici: kural ihlali (422) listelenir ve öğe işaretlenir; sürüm çakışması (409) kimin kaydettiğini söyler', async () => {
    sunucuKur(YAZAN, {
      kayit: { durum: 422, govde: { kod: 'GECERSIZ', mesaj: 'Yerleşim kaydedilemedi.', ayrinti: { ihlaller: [{ kural: 'ATL-07', mesaj: 'CNC-01 ile Raf R1 çakışıyor.', ogeler: ['istasyon:5', 'raf:0'] }] } } },
    });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Bölge' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kaydet' }));
    const liste = await within(duzen).findByRole('alert');
    expect(within(liste).getByText(/ATL-07/)).toBeTruthy();
    expect(duzen.querySelectorAll('.tc-plan-hatali')).toHaveLength(2);

    cleanup();
    sunucuKur(YAZAN, {
      kayit: { durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Yerleşimi başkası kaydetti.', ayrinti: { guncelSurum: 4, kaydeden: { id: 9, ad: 'Deneme Planlamacı' }, kaydedildi: '2026-10-07T09:30:00Z' } } },
    });
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const ikinci = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Bölge' }));
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText(/Deneme Planlamacı yerleşimi/)).toBeTruthy();
  });

  it('düzenleyicide Escape: araç seçiliyken önce aracı bırakır; değişiklik varsa onay sorar, yoksa kapanır', async () => {
    sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const duzen = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ölç' }));
    expect(within(duzen).getByText(/Ölçmek için iki noktaya tıklayın/)).toBeTruthy();
    fireEvent.keyDown(duzen, { key: 'Escape' });
    expect(within(duzen).queryByText(/Ölçmek için iki noktaya tıklayın/)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeTruthy();

    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Bölge' }));
    fireEvent.keyDown(duzen, { key: 'Escape' });
    expect(await screen.findByRole('dialog', { name: 'Değişiklikler kaydedilmedi' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeTruthy();

    cleanup();
    sunucuKur(YAZAN);
    goster(<AtolyeHaritasi />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bölümün yerleşimini düzenle' }));
    const temiz = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    fireEvent.keyDown(temiz, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Yerleşimi düzenle' })).toBeNull();
  });
});
