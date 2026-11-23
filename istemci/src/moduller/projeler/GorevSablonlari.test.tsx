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
  madde('ozel-z', 'Eski özel', { sira: 15, sistem: false, sahip: 'Hazırlık görevi', isEmriDuzeyi: false }),
];
// 3494-2 a: sayfa operasyon başına işaretlenecekleri de çizer (Test 3494-2 T1: kart sayfadan kalkarsa kızarır).
const TALIMAT_OZETI = {
  id: 5, kod: 'TS-DNM', ad: 'Deneme talimat', sartname: null, aktif: true, surum: 1, adimSayisi: 1, kontrolSayisi: 0, resimSayisi: 0, videoSayisi: 0,
  operasyonTipi: { id: 3, kod: 'CNC', ad: 'CNC işleme' }, emreGelir: true,
} satisfies TalimatSablonlariCevabi['sablonlar'][number];
const TALIMAT_ADIMI = { sira: 1, baslik: 'Aparatı hazırla', metin: null, kontrol: { tur: 'yok' as const }, zorunlu: false, medya: [], asama: 'on_hazirlik' as const, hedefSureDk: null };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function kur(islemler: Kullanici['islemler'], duzen: { tipler?: number; sablonlar?: SablonListesiCevabi['sablonlar'] } = {}) {
  const kullanici: Kullanici = { id: 6, ad: 'Deneme Şablon', islemler };
  const yazabilir = islemler.includes('uretim-emirleri.hazirlik-ayar');
  let maddeler = ILK;
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/sablonlar/liste') return json(200, { sablonlar: duzen.sablonlar ?? [] } satisfies SablonListesiCevabi);
    if (yontem === 'GET' && yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [] });
    if (yontem === 'GET' && yol === '/projeler/rol-secenekleri') return json(200, { roller: [] });
    if (yontem === 'GET' && yol === '/rota/talimat-sablonlari') return json(200, { sablonlar: [TALIMAT_OZETI] });
    if (yontem === 'GET' && yol === '/rota/talimat-sablonlari/5') return json(200, { sablon: { ...TALIMAT_OZETI, adimlar: [TALIMAT_ADIMI] } });
    if (yontem === 'GET' && yol === '/operasyon-tipleri') return duzen.tipler === 403 ? json(403, { kod: 'YETKISIZ', mesaj: 'Yetkin yok.' }) : json(200, { operasyonTipleri: [{ id: 3, ad: 'CNC işleme', aktif: true }, { id: 4, ad: 'Tesviye', aktif: true }] });
    if (yontem === 'POST' && yol === '/projeler/sablonlar') return json(200, { sablonlar: [] } satisfies SablonListesiCevabi);
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

  // 3611-1: kalem hangi emir türlerinde ve hangi operasyonlarda görev açacağını seçer; boş seçim hepsidir.
  it('hazırlık maddesi seçilince emir türü ve (iş emri düzeyinde) operasyon seçimi çıkar; seçim kayda gider, boşken hepsi', async () => {
    const cagrilar = kur(['projeler.sablon-yaz']);
    fireEvent.click(await screen.findByRole('button', { name: /Şablon ekle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Şablon adı/), { target: { value: 'ORN şablon' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Görev ekle/ }));
    fireEvent.change(within(pencere).getByLabelText(/Görev adı/), { target: { value: 'CNC programı' } });
    expect(within(pencere).queryByText(/Hangi emir türlerinde/)).toBeNull();
    await waitFor(() => { expect((within(pencere).getByLabelText(/Kaç kez açılsın/) as HTMLSelectElement).options.length).toBeGreaterThan(1); });
    fireEvent.change(within(pencere).getByLabelText(/Kaç kez açılsın/), { target: { value: 'cnc' } });
    expect(await within(pencere).findByText(/Hiçbiri seçili değil: her emir türünde açılır/)).toBeTruthy();
    fireEvent.click(within(pencere).getByLabelText('Seri'));
    fireEvent.click(await within(pencere).findByLabelText('CNC işleme'));
    expect(within(pencere).getByText(/hiçbiri uymazsa emirde görev açılmaz/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/projeler/sablonlar')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/projeler/sablonlar' && c.yontem === 'POST')?.govde).toMatchObject({
      kalemler: [{ hazirlikMaddesi: 'cnc', emirTurleri: ['seri'], operasyonTipleri: [3] }],
    });
    // Emir düzeyindeki maddede operasyon seçimi yoktur (iş emrine bakmaz).
    cleanup();
    kur(['projeler.sablon-yaz']);
    fireEvent.click(await screen.findByRole('button', { name: /Şablon ekle/ }));
    const ikinci = await screen.findByRole('dialog');
    fireEvent.click(within(ikinci).getByRole('button', { name: /Görev ekle/ }));
    await waitFor(() => { expect((within(ikinci).getByLabelText(/Kaç kez açılsın/) as HTMLSelectElement).options.length).toBeGreaterThan(1); });
    fireEvent.change(within(ikinci).getByLabelText(/Kaç kez açılsın/), { target: { value: 'ozel-z' } });
    expect(await within(ikinci).findByText(/Hangi emir türlerinde/)).toBeTruthy();
    expect(within(ikinci).queryByText(/Hangi operasyonlarda/)).toBeNull();
  });

  // 3611-1 Arayüz Y1-Y4: yetkisizlikte kayıtlı seçim görünür ve kaldırılabilir; rozet eksenleri adıyla yazar; emir düzeyindeki maddede gizli seçim kaydedilmez.
  it('operasyon listesi 403 verince kayıtlı seçim kutu olarak görünür, kaldırılır; rozet eksenli; madde emir düzeyine dönünce gizli seçim gitmez', async () => {
    const kalem = {
      id: 1, ad: 'CNC programı', aciklama: null, asama: null, dayanak: 'baslangic' as const, gun: 0, sureGun: 2, yapanKisiId: null, yapanKisiAd: null, yapanRolId: null, yapanRolAd: null,
      kontrolKisiId: null, kontrolKisiAd: null, kontrolRolId: null, kontrolRolAd: null, yedekKontrolKisiId: null, yedekKontrolKisiAd: null, yedekKontrolRolId: null, yedekKontrolRolAd: null,
      oncekiSira: null, hazirlikMaddesi: 'cnc' as const, kontrolKosulu: 'her-zaman' as const, adimlar: [], kanitZorunlu: false, emirTurleri: ['fai' as const], operasyonTipleri: [9],
    };
    const cagrilar = kur(['projeler.sablon-yaz'], { tipler: 403, sablonlar: [{ id: 1, ad: 'ORN-Şablon', varsayilan: false, etkin: true, guncelleme: null, surum: 1, kalemler: [kalem] }] });
    fireEvent.click(await screen.findByText('ORN-Şablon'));
    const pencere = await screen.findByRole('dialog');
    expect(await within(pencere).findByText('Emir: FAI')).toBeTruthy();
    expect(within(pencere).getByText('Operasyon: Tip 9')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Düzenle' }));
    expect(await within(pencere).findByText(/görme yetkin yok/)).toBeTruthy();
    const kutu = within(pencere).getByLabelText('Tip 9 (listede yok)') as HTMLInputElement;
    expect(kutu.checked).toBe(true);
    // Madde emir düzeyindeki bir maddeden emir düzeyi olmayana geçince operasyon seçimi gizlenir ve kaydedilmez.
    await waitFor(() => { expect((within(pencere).getByLabelText(/Kaç kez açılsın/) as HTMLSelectElement).options.length).toBeGreaterThan(1); });
    fireEvent.change(within(pencere).getByLabelText(/Kaç kez açılsın/), { target: { value: 'ozel-z' } });
    expect(within(pencere).queryByText(/Hangi operasyonlarda/)).toBeNull();
    expect(within(pencere).getByText(/operasyon seçimi yok/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/projeler/sablonlar/1/guncelle')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/projeler/sablonlar/1/guncelle')?.govde).toMatchObject({ kalemler: [{ hazirlikMaddesi: 'ozel-z', emirTurleri: ['fai'], operasyonTipleri: [] }] });
  });
});
