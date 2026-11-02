import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  FirmaSecenekleriCevabi, Proje, ProjeListesiCevabi, ProjeYonetimiCevabi, SiparisSecenekleriCevabi, StatuListesiCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import type { AdimliEmirOzeti, AdimliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { Projeler } from './Projeler.tsx';

const YAZAR: Kullanici = { id: 1, ad: 'Deneme Planlama', islemler: ['sayfa.projeler', 'projeler.yaz'] };
const OKUR: Kullanici = { id: 2, ad: 'Deneme Müdür', islemler: ['sayfa.projeler'] };

const proje = (ek: Partial<Proje> & Pick<Proje, 'id' | 'kod' | 'ad'>): Proje => ({
  durum: 'aktif', firmaId: null, firmaAd: null, siparisId: null, baslangic: null, bitis: null, aciklama: null,
  olusturma: '2026-10-12T09:00:00+03:00', guncelleme: null, surum: 1, statu: null, ilerleme: null, ...ek,
});
const P1 = proje({ id: 1, kod: 'PRJ.01', ad: 'Deneme projesi', firmaId: 7, firmaAd: 'Deneme Müşteri', baslangic: '2026-10-01', bitis: '2026-12-31', surum: 3 });
const P2 = proje({ id: 2, kod: 'PRJ.02', ad: 'İkinci proje' });
const LISTE = { satirlar: [P1, P2], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies ProjeListesiCevabi;
const MALIYETCI: Kullanici = { id: 4, ad: 'Deneme Yönetici', islemler: ['sayfa.projeler', 'projeler.yaz', 'finans.maliyet-oku'] };
const PLANLAMA: Kullanici = { id: 3, ad: 'Deneme Planlamacı', islemler: ['sayfa.projeler', 'sayfa.rota'] };
const emir = (id: number, emirNo: string, projeId: number | null | undefined): AdimliEmirOzeti => ({
  id, emirNo, urun: { id: 5, kod: 'MM-DNM-1', ad: 'Deneme mamul' }, adet: 10, oncelik: 2, baslangic: null, teslim: '2026-11-20',
  durum: 'planli', arsiv: false, kaynakRotaRevizyonId: null, adimSayisi: 3, tamamAdim: 1, siradaki: null, aciklama: null, surum: 1, acilma: '2026-10-12T09:00:00+03:00',
  ...(projeId === undefined ? {} : { projeId }),
});
const EMIRLER = { emirler: [emir(11, 'EMR-11', 1), emir(12, 'EMR-12', 2), emir(13, 'EMR-13', undefined)] } satisfies AdimliListeCevabi;
const FIRMALAR = { firmalar: [{ id: 8, ad: 'Başka Müşteri', kod: 'BM' }] } satisfies FirmaSecenekleriCevabi;
const SIPARISLER = { siparisler: [{ id: 21, no: 'SIP-2026-0021', firmaAd: 'Deneme Müşteri', termin: '2026-11-15' }] } satisfies SiparisSecenekleriCevabi;

const YONETIM = { statu: null, statuGecmisi: [], kilometreTaslari: [], gorevler: [], ilerleme: null, statuler: [], serbestStatu: true } satisfies ProjeYonetimiCevabi;
const STATULER = { statuler: [], serbestStatu: true, ayarSurum: 1 } satisfies StatuListesiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, yazmaCevabi: () => Response = () => json(200, P2)) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol.startsWith('/projeler/firma-secenekleri')) return json(200, FIRMALAR);
    if (yontem === 'GET' && yol.startsWith('/projeler/siparis-secenekleri')) return json(200, SIPARISLER);
    if (yontem === 'GET' && yol === '/projeler/1') return json(200, P1);
    if (yontem === 'GET' && yol === '/projeler/1/yonetim') return json(200, YONETIM);
    if (yontem === 'GET' && yol === '/projeler/2') return json(200, P2);
    if (yontem === 'GET' && yol === '/projeler/2/yonetim') return json(200, YONETIM);
    if (yontem === 'GET' && yol === '/projeler/statuler') return json(200, STATULER);
    if (yontem === 'GET' && yol === '/adimli-emirler?projeId=1') return json(200, EMIRLER);
    if (yontem === 'GET' && yol.startsWith('/projeler')) return json(200, LISTE);
    if (yontem === 'POST') return yazmaCevabi();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(adres = '/projeler') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes>
            <Route path="/projeler" element={<Projeler />} />
            <Route path="/projeler/:id" element={<ProjeAyrinti />} />
          </Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });


describe('Projeler', () => {
  it('listeyi gösterir; varsayılan süzgeç aktif projelerdir; okuyan ekleyemez, satırdan ayrıntıya gider ve düzenleyemez', async () => {
    const cagrilar = sunucuKur(OKUR);
    ac();
    await screen.findByText('PRJ.01');
    expect(screen.getByText('Deneme Müşteri')).toBeTruthy();
    expect(screen.getByText('01.10.2026')).toBeTruthy();
    expect(cagrilar.some((c) => c.yol.startsWith('/projeler?') && c.yol.includes('durum=aktif'))).toBe(true);
    expect(screen.queryByRole('button', { name: /Proje ekle/ })).toBeNull();
    fireEvent.click(screen.getByText('PRJ.01'));
    expect(await screen.findByRole('heading', { name: 'PRJ.01 · Deneme projesi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
  });

  it('yazan yeni proje açar: sipariş seçmeden kaydetmez (224); kod büyük harfle, sipariş ile gider, firma gitmez; kayıttan sonra ayrıntıya geçer', async () => {
    const cagrilar = sunucuKur(YAZAR);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Proje ekle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Proje no/), { target: { value: 'yeni.1' } });
    fireEvent.change(within(pencere).getByLabelText(/^Ad/), { target: { value: 'Yeni proje' } });
    expect(within(pencere).queryByLabelText(/^Müşteri$/)).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect((await within(pencere).findByRole('alert')).textContent).toContain('Sipariş seçimi zorunlu');
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    await within(pencere).findByRole('option', { name: /SIP-2026-0021/ });
    fireEvent.change(within(pencere).getByLabelText(/^Sipariş\s*\*?$/), { target: { value: '21' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/projeler');
    expect(yazma?.govde).toEqual({ kod: 'YENI.1', ad: 'Yeni proje', siparisId: 21, baslangic: null, bitis: null, aciklama: '' });
    expect(await screen.findByRole('heading', { name: 'PRJ.02 · İkinci proje' })).toBeTruthy();
  });

  it('düzenlemede kod kilitlidir; sürüm ve durum gider; sunucu hatası pencerede görünür', async () => {
    const cagrilar = sunucuKur(YAZAR, () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değiştirildi.' }));
    ac('/projeler/1');
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Proje no/) as HTMLInputElement).disabled).toBe(true);
    await within(pencere).findByRole('option', { name: 'Deneme Müşteri' });
    fireEvent.change(within(pencere).getByLabelText(/^Durum/), { target: { value: 'tamamlandi' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect((await within(pencere).findByRole('alert')).textContent).toContain('değiştirildi');
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/projeler/1/guncelle');
    expect(yazma?.govde).toMatchObject({ durum: 'tamamlandi', surum: 3, firmaId: 7, baslangic: '2026-10-01' });
  });

  it('proje ayrıntısında yalnız o projenin üretim emirleri listelenir; emir yetkisi olmayana bölüm yok', async () => {
    const cagrilar = sunucuKur(PLANLAMA);
    ac('/projeler/1');
    fireEvent.click(await screen.findByRole('tab', { name: /Üretim emirleri/ }));
    const tablo = await screen.findByRole('table', { name: 'Projenin üretim emirleri' });
    await within(tablo).findByText('EMR-11');
    expect(within(tablo).queryByText('EMR-12')).toBeNull();
    expect(within(tablo).queryByText('EMR-13')).toBeNull();
    expect(within(tablo).getByRole('link', { name: 'EMR-11' }).getAttribute('href')).toBe('/uretim-emirleri?ara=EMR-11');
    expect(cagrilar.some((c) => c.yol === '/adimli-emirler?projeId=1')).toBe(true);
    cleanup();
    const okurCagrilari = sunucuKur(OKUR);
    ac('/projeler/1');
    await screen.findByRole('heading', { name: 'PRJ.01 · Deneme projesi' });
    expect(screen.queryByRole('table', { name: 'Projenin üretim emirleri' })).toBeNull();
    expect(okurCagrilari.some((c) => c.yol.startsWith('/adimli-emirler'))).toBe(false);
    expect(screen.queryByRole('tab', { name: /Üretim emirleri/ })).toBeNull();
  });

  it('Maliyet sekmesi yalnız maliyet okuyana görünür; açılınca projenin maliyeti istenir', async () => {
    sunucuKur(YAZAR);
    ac('/projeler/1');
    await screen.findByRole('heading', { name: 'PRJ.01 · Deneme projesi' });
    expect(screen.queryByRole('tab', { name: /Maliyet/ })).toBeNull();
    cleanup();
    const cagrilar = sunucuKur(MALIYETCI);
    ac('/projeler/1');
    await screen.findByRole('heading', { name: 'PRJ.01 · Deneme projesi' });
    expect(cagrilar.some((c) => c.yol.startsWith('/proje-maliyet'))).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: /Maliyet/ }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/proje-maliyet/1')).toBe(true); });
    expect(screen.queryByText('Proje bilgisi')).toBeNull();
  });

  it('bütçe yalnız maliyet görene görünür; girilen tutar virgülle yazılsa da noktayla gider, para birimi büyük harfle', async () => {
    const yazarCagrilari = sunucuKur(YAZAR);
    ac('/projeler/1');
    fireEvent.click(await screen.findByRole('tab', { name: /Genel/ }));
    await screen.findByText('Proje bilgisi');
    expect(screen.queryByText('Bütçe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Düzenle/ }));
    const yazarPenceresi = await screen.findByRole('dialog');
    expect(within(yazarPenceresi).queryByLabelText(/Bütçe/)).toBeNull();
    fireEvent.click(within(yazarPenceresi).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazarCagrilari.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(yazarCagrilari.find((c) => c.yontem === 'POST')?.govde).not.toHaveProperty('butceTutari');
    cleanup();
    const cagrilar = sunucuKur(MALIYETCI);
    ac('/projeler/1');
    fireEvent.click(await screen.findByRole('tab', { name: /Genel/ }));
    expect(await screen.findByText('Girilmedi (hedef plan maliyeti)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Düzenle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Bütçe/), { target: { value: '250000,50' } });
    fireEvent.change(within(pencere).getByLabelText(/Para birimi/), { target: { value: 'usd' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toMatchObject({ butceTutari: '250000.50', butceParaBirimi: 'USD' });
  });
});
