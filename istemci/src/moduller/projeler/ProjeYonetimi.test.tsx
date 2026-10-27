import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Gorev, KilometreTasi, Proje, ProjeYonetimiCevabi, StatuListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ProjeAyrinti } from './ProjeAyrinti.tsx';
import { StatuListesi } from './StatuListesi.tsx';
import { gorevSapmasi } from './ProjeGorevleri.tsx';

const PLANLAMACI: Kullanici = { id: 3, ad: 'Deneme Planlamacı', islemler: ['sayfa.projeler', 'projeler.gorev-yaz', 'projeler.statu-yaz'] };
const MUDUR: Kullanici = { id: 4, ad: 'Deneme Müdür', islemler: ['sayfa.projeler', 'projeler.gorev-yaz', 'projeler.statu-yaz', 'projeler.statu-ayar'] };
const OKUR: Kullanici = { id: 2, ad: 'Deneme Okur', islemler: ['sayfa.projeler'] };

const proje = (durum: Proje['durum']): Proje => ({
  id: 1, kod: 'PRJ.01', ad: 'Deneme projesi', durum, firmaId: null, firmaAd: null, siparisId: null, baslangic: null, bitis: null,
  aciklama: null, olusturma: '2026-10-12T09:00:00+03:00', guncelleme: null, surum: 1, statu: null, ilerleme: null,
});
const TAS: KilometreTasi = {
  id: 5, ad: 'Ham malzeme kabul', sira: 1, tabanTarih: '2026-11-01', gercekTarih: null, etkin: true, surum: 2,
  tabanGecmisi: [{ eskiTarih: '2026-10-25', yeniTarih: '2026-11-01', gerekce: 'Tedarik kaydı', kisiAd: 'Deneme Planlamacı', an: '2026-10-20T10:00:00+03:00' }],
};
const gorev = (ek: Partial<Gorev>): Gorev => ({
  id: 7, kilometreTasiId: 5, ad: 'Fikstür tasarımı', aciklama: null, sorumluKisiId: null, sorumluAd: null,
  planBaslangic: '2026-10-01', planBitis: '2026-10-10', gercekBaslangic: null, gercekBitis: null, ilerleme: 40, durum: 'suruyor',
  oncekiGorevId: null, surum: 1, ...ek,
});
const YONETIM: ProjeYonetimiCevabi = {
  statu: { statuId: 1, ad: 'Yolunda', ton: 'tamam', serbest: false, an: '2026-10-20T10:00:00+03:00' },
  statuGecmisi: [{ id: 9, statuId: 1, ad: 'Yolunda', ton: 'tamam', serbest: false, an: '2026-10-20T10:00:00+03:00', not: 'Açılış', kisiAd: 'Deneme Müdür' }],
  kilometreTaslari: [TAS],
  gorevler: [gorev({})],
  ilerleme: 40,
  statuler: [{ id: 1, ad: 'Yolunda', ton: 'tamam', sira: 1, etkin: true, surum: 1 }, { id: 2, ad: 'Riskli', ton: 'uyari', sira: 2, etkin: true, surum: 1 }],
  serbestStatu: true,
};
const STATULER: StatuListesiCevabi = { statuler: YONETIM.statuler, serbestStatu: false, ayarSurum: 4 };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yontem: string; yol: string; govde: unknown; kimlik: string | undefined }

function sunucuKur(kullanici: Kullanici, durum: Proje['durum'] = 'aktif') {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const basliklar = (ayar?.headers ?? {}) as Record<string, string>;
    cagrilar.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined, kimlik: basliklar['istek-kimligi'] });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/projeler/1') return json(200, proje(durum));
    if (yontem === 'GET' && yol === '/projeler/1/yonetim') return json(200, YONETIM);
    if (yontem === 'GET' && yol === '/projeler/statuler') return json(200, STATULER);
    if (yontem === 'GET' && yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [{ id: 3, ad: 'Deneme Planlamacı' }] });
    if (yontem === 'POST' && yol.startsWith('/projeler/statu')) return json(200, STATULER);
    if (yontem === 'POST') return json(200, YONETIM);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}

function ac(adres = '/projeler/1') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[adres]}>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <Routes>
            <Route path="/projeler/statuler" element={<StatuListesi />} />
            <Route path="/projeler/:id" element={<ProjeAyrinti />} />
          </Routes>
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje yönetimi (890 c)', () => {
  it('statü listeden ya da elle yazılır; komut istek kimliğiyle gider', async () => {
    const cagrilar = sunucuKur(PLANLAMACI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Statü: Yolunda/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/^Statü/), { target: { value: 'yaz' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await within(pencere).findByText('Statüyü yazın.')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Statü metni/), { target: { value: 'Müşteri onayı bekleniyor' } });
    fireEvent.change(within(pencere).getByLabelText(/Not/), { target: { value: 'Çizim revizyonu' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/projeler/1/statu');
    expect(yazma?.govde).toEqual({ statuId: null, metin: 'Müşteri onayı bekleniyor', not: 'Çizim revizyonu' });
    expect(yazma?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('okuyan statü ve görev yazamaz; kapanmış projede görev ve kilometre taşı eklenmez', async () => {
    sunucuKur(OKUR);
    ac();
    await screen.findByRole('heading', { name: 'PRJ.01 · Deneme projesi' });
    await screen.findByText('Açık görev');
    expect(screen.queryByRole('button', { name: /Statü: / })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Görevler/ }));
    await screen.findByRole('table', { name: 'Projenin görevleri' });
    expect(screen.queryByRole('button', { name: /Görev ekle/ })).toBeNull();
    cleanup();
    sunucuKur(PLANLAMACI, 'tamamlandi');
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Kilometre taşları/ }));
    await screen.findByRole('table', { name: 'Projenin kilometre taşları' });
    expect(screen.queryByRole('button', { name: /Kilometre taşı ekle/ })).toBeNull();
  });

  it('görev eklenir; plan alanları ve kilometre taşı gövdeye girer', async () => {
    const cagrilar = sunucuKur(PLANLAMACI);
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Görevler/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Görev ekle/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Görev adı/), { target: { value: 'Numune ölçümü' } });
    fireEvent.change(within(pencere).getByLabelText(/Kilometre taşı/), { target: { value: '5' } });
    await within(pencere).findByRole('option', { name: 'Deneme Planlamacı' });
    fireEvent.change(within(pencere).getByLabelText(/Sorumlu/), { target: { value: '3' } });
    fireEvent.change(within(pencere).getByLabelText(/Plan başlangıç/), { target: { value: '2026-11-02' } });
    fireEvent.change(within(pencere).getByLabelText(/Plan bitiş/), { target: { value: '2026-11-05' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/projeler/1/gorevler');
    expect(yazma?.govde).toEqual({
      kilometreTasiId: 5, ad: 'Numune ölçümü', aciklama: null, sorumluKisiId: 3, planBaslangic: '2026-11-02', planBitis: '2026-11-05', oncekiGorevId: null,
    });
    expect(yazma?.kimlik).toBeDefined();
  });

  it('taban tarih gerekçe ve sürümle yenilenir; geçmiş düzenleme penceresinde görünür', async () => {
    const cagrilar = sunucuKur(PLANLAMACI);
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Kilometre taşları/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Ham malzeme kabul: düzenle/ }));
    expect(await within(await screen.findByRole('dialog')).findByText('Tedarik kaydı')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: /Ham malzeme kabul: taban tarihi yenile/ }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Yeni taban/), { target: { value: '2026-11-08' } });
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Tedarikçi gecikmesi' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yenile' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    const yazma = cagrilar.find((c) => c.yontem === 'POST');
    expect(yazma?.yol).toBe('/projeler/kilometre-taslari/5/taban-yenile');
    expect(yazma?.govde).toEqual({ yeniTarih: '2026-11-08', gerekce: 'Tedarikçi gecikmesi', surum: 2 });
  });

  it('statü listesini yalnız ayar yetkisi olan değiştirir; serbest yazı izni sürümle gider', async () => {
    sunucuKur(PLANLAMACI);
    ac('/projeler/statuler');
    const izin = await screen.findByRole('checkbox', { name: /elle yazılabilsin/ });
    expect((izin as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Statü ekle/ })).toBeNull();
    cleanup();
    const cagrilar = sunucuKur(MUDUR);
    ac('/projeler/statuler');
    await screen.findByText('Riskli');
    await waitFor(() => { expect((screen.getByRole('checkbox', { name: /elle yazılabilsin/ }) as HTMLInputElement).disabled).toBe(false); });
    fireEvent.click(screen.getByRole('checkbox', { name: /elle yazılabilsin/ }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toMatchObject({ yol: '/projeler/statu-ayari/guncelle', govde: { serbestStatu: true, surum: 4 } });
  });

  it('görev sapması: biten görevde gerçek bitişe, açık görevde geçmişse bugüne göre; iptalde yok', () => {
    expect(gorevSapmasi(gorev({ durum: 'bitti', gercekBitis: '2026-10-12' }), '2026-10-20')).toBe(2);
    expect(gorevSapmasi(gorev({}), '2026-10-13')).toBe(3);
    expect(gorevSapmasi(gorev({}), '2026-10-05')).toBeNull();
    expect(gorevSapmasi(gorev({ durum: 'iptal' }), '2026-10-20')).toBeNull();
  });
});
