import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AMORTISMAN_HARIC, GenelGiderOrani, satirlariHazirla } from './GenelGiderOrani.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// Tutarlar uydurmadır.
const satir = (id: number, gun: string, gider: string, saat: string, saatBasi: string, amortismanDahil = true, aciklama: string | null = null) =>
  ({ id, gecerlilikBaslangic: gun, aylikGenelGider: gider, aylikMakineSaati: saat, saatBasi, amortismanDahil, aciklama, olusturma: '2026-01-01T08:00:00.000Z' });
const SATIRLAR = [
  satir(1, '2026-01-01', '300000.00', '720.00', '416.6667'),
  satir(2, '2026-01-01', '360000.00', '720.00', '500.0000', false, 'Düzeltme'),
  satir(3, '2099-01-01', '400000.00', '800.00', '500.0000'),
];

function sunucuKur(islemler: string[], satirlar: unknown[] = SATIRLAR) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol.startsWith('/finans/genel-gider-oranlari?')) return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 500 });
    if (yol === '/finans/genel-gider-oranlari/ekle') return json(200, { id: 4 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><GenelGiderOrani /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Genel gider oranı (206 a)', () => {
  it('satirlariHazirla: aynı güne sonraki giriş öncekini düzeltir; bugüne kadar başlamış son satır geçerlidir; yeniden eskiye', () => {
    const g = satirlariHazirla(SATIRLAR, '2026-10-19');
    expect(g.map((s) => [s.id, s.durum, s.duzeltme])).toEqual([[3, 'ileri', false], [2, 'gecerli', true], [1, 'duzeltildi', false]]);
    expect(satirlariHazirla(SATIRLAR, '2025-12-31').map((s) => s.durum)).toEqual(['ileri', 'ileri', 'duzeltildi']);
  });

  it('finans.maliyet-oku listeyi görür, giriş formu yoktur; boş açıklama "—"', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku']);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Genel gider oranları' });
    expect(within(tablo).getByText('416,6667 TL')).toBeTruthy();
    expect(within(tablo).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(tablo).getByText('Geçerli')).toBeTruthy();
    expect(within(tablo).getByText('Düzeltildi')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Genel gider oranı gir' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('finans.yonet oranı kaydeder; amortisman seçimi gövdeye boolean gider; "Dahil değil" hesaba girmediğini yazar (E-9)', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.yonet'], []);
    ac();
    await screen.findByText(/Henüz genel gider oranı girilmedi/);
    fireEvent.change(screen.getByLabelText(/Geçerlilik başlangıcı/), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText(/Aylık genel gider/), { target: { value: '250000,50' } });
    fireEvent.change(screen.getByLabelText(/Aylık makine saati/), { target: { value: '600' } });
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Amortisman/), { target: { value: 'haric' } });
    expect(screen.getByRole('note').textContent).toBe(AMORTISMAN_HARIC);
    fireEvent.change(screen.getByLabelText(/^Amortisman/), { target: { value: 'dahil' } });
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.submit(screen.getByRole('form', { name: 'Genel gider oranı gir' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/genel-gider-oranlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/genel-gider-oranlari/ekle')?.govde).toEqual({
      gecerlilikBaslangic: '2026-11-01', aylikGenelGider: 250000.5, aylikMakineSaati: 600, amortismanDahil: true, aciklama: '',
    });
  });

  it('finans.maliyet-oku yoksa liste istenmez, yetki iletisi görünür', async () => {
    const istekler = sunucuKur(['finans.oku', 'finans.yaz']);
    ac();
    await screen.findByText('Genel gider oranını görme yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/finans/genel-gider-oranlari'))).toBe(false);
  });
});
