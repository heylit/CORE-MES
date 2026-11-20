import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { SablonListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { TalimatSablonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { HazirlikMaddeleriCevabi, HazirlikMaddeTanimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GorevSablonlari } from './GorevSablonlari.tsx';

const madde = (kod: string, ad: string, ek: Partial<HazirlikMaddeTanimi> = {}): HazirlikMaddeTanimi => ({
  kod, ad, kisa: ad, sira: 10, acik: true, sistem: true, durduran: false, sahip: 'Stok Merkezi', isEmriDuzeyi: true, surum: 1, ...ek,
});
// Önceden var olan özel sütun: satırdan eklenen sütunu bulan süzgeç onu seçmemeli (Test 3494-1 T2).
const ILK = [
  madde('cnc', 'CNC kurulumu', { durduran: true, sahip: 'CNC Kurulum' }), madde('malzeme', 'Malzeme'),
  madde('ozel-z', 'Eski özel', { sira: 15, sistem: false, sahip: 'Hazırlık görevi' }),
];
// 3494-2 a: sayfa operasyon başına işaretlenecekleri de çizer (Test 3494-2 T1: kart sayfadan kalkarsa kızarır).
const TALIMAT_OZETI = {
  id: 5, kod: 'TS-DNM', ad: 'Deneme talimat', sartname: null, aktif: true, surum: 1, adimSayisi: 1, kontrolSayisi: 0, resimSayisi: 0, videoSayisi: 0,
  operasyonTipi: { id: 3, kod: 'CNC', ad: 'CNC işleme' }, emreGelir: true,
} satisfies TalimatSablonlariCevabi['sablonlar'][number];
const TALIMAT_ADIMI = { sira: 1, baslik: 'Aparatı hazırla', metin: null, kontrol: { tur: 'yok' as const }, zorunlu: false, medya: [], asama: 'on_hazirlik' as const, hedefSureDk: null };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function kur(islemler: Kullanici['islemler']) {
  const kullanici: Kullanici = { id: 6, ad: 'Deneme Şablon', islemler };
  const yazabilir = islemler.includes('uretim-emirleri.hazirlik-ayar');
  let maddeler = ILK;
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/sablonlar/liste') return json(200, { sablonlar: [] } satisfies SablonListesiCevabi);
    if (yontem === 'GET' && yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [] });
    if (yontem === 'GET' && yol === '/projeler/rol-secenekleri') return json(200, { roller: [] });
    if (yontem === 'GET' && yol === '/rota/talimat-sablonlari') return json(200, { sablonlar: [TALIMAT_OZETI] });
    if (yontem === 'GET' && yol === '/rota/talimat-sablonlari/5') return json(200, { sablon: { ...TALIMAT_OZETI, adimlar: [TALIMAT_ADIMI] } });
    if (yontem === 'GET' && yol === '/hazirlik-maddeleri') return json(200, { yazabilir, maddeler } satisfies HazirlikMaddeleriCevabi);
    if (yontem === 'POST' && yol === '/hazirlik-maddeleri/ozel-ekle') {
      maddeler = [...ILK, madde('ozel-a', 'Fikstür hazırlığı', { sira: 25, sistem: false, sahip: 'Hazırlık görevi' })];
      return json(200, { yazabilir, maddeler } satisfies HazirlikMaddeleriCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter><GorevSablonlari /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3494-1 a: şablonlar ve matris sütunları tek ekranda', () => {
  it('iki yetkisi olan şablonları ve sütunları birlikte görür; sütunda nasıl kapandığı yazar', async () => {
    kur(['projeler.sablon-yaz', 'uretim-emirleri.hazirlik-ayar']);
    expect(await screen.findByRole('button', { name: /Şablon ekle/ })).toBeTruthy();
    const sutunlar = await screen.findByRole('table', { name: 'Matris sütunları' });
    expect(within(sutunlar).getByText('CNC kurulumu')).toBeTruthy();
    expect(within(sutunlar).getAllByText('Sistem').length).toBe(2);
    expect(within(sutunlar).getByText('Durdurur')).toBeTruthy();
    const isaretlenecekler = await screen.findByRole('table', { name: 'Operasyon başına işaretlenecekler' });
    expect(await within(isaretlenecekler).findByText('Aparatı hazırla')).toBeTruthy();
  });

  it('yalnız sütun yöneten şablon listesini görmez, sütunları yönetir; yalnız şablon yazan sütun ekleyemez', async () => {
    kur(['uretim-emirleri.hazirlik-ayar']);
    expect(await screen.findByRole('button', { name: /Yeni sütun/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Şablon ekle/ })).toBeNull();
    cleanup();
    kur(['projeler.sablon-yaz']);
    await screen.findByRole('table', { name: 'Matris sütunları' });
    expect(screen.getByRole('button', { name: /Şablon ekle/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Yeni sütun/ })).toBeNull();
  });

  it('görev satırından yeni sütun açılır: ad görevden gelir, sütun seçili kalır, şablon kendiliğinden kaydedilmez', async () => {
    const cagrilar = kur(['projeler.sablon-yaz', 'uretim-emirleri.hazirlik-ayar']);
    fireEvent.click(await screen.findByRole('button', { name: /Şablon ekle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Görev ekle/ }));
    fireEvent.change(within(pencere).getByLabelText(/Görev adı/), { target: { value: 'Fikstür hazırlığı' } });
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Yeni sütun' }));
    const pencereler = await screen.findAllByRole('dialog');
    const sutun = pencereler.at(-1);
    if (sutun === undefined) throw new Error('sütun penceresi yok');
    expect((within(sutun).getByLabelText(/Sütun adı/) as HTMLInputElement).value).toBe('Fikstür hazırlığı');
    fireEvent.change(within(sutun).getByLabelText(/Kısa ad/), { target: { value: 'Fikstür' } });
    fireEvent.click(within(sutun).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect((within(pencere).getByLabelText(/Kaç kez açılsın/) as HTMLSelectElement).value).toBe('ozel-a'); });
    expect(cagrilar.filter((c) => c.yontem === 'POST').map((c) => c.yol)).toEqual(['/hazirlik-maddeleri/ozel-ekle']);
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toMatchObject({ ad: 'Fikstür hazırlığı', kisa: 'Fikstür', sira: 25, acik: true });
  });
});
