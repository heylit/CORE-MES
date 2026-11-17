import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { GecikenlerimCevabi, KademeAyarlariCevabi, KademeAyarSatiri } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AcikTakipler, Gecikenlerim, KademeliUyari, KademeSeridi } from './Kademe.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(oge: React.ReactNode, cevap: (yol: string, yontem: string, govde: unknown) => Response) {
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde: unknown = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    return cevap(yol, yontem, govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{oge}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SATIR: KademeAyarSatiri = {
  kaynak: 'kalibrasyon.vade', ad: 'Kalibrasyon vadesi', grup: 'Kalibrasyon', sayac: 'son-gun', asama: 1, para: false, acik: true,
  k2Gun: 10, k3Gun: null, k4Gun: 3, k5Gun: 7, epostaKademe: 2, serit: true, kapatilamaz: true, yoneticiRolId: null, varsayilan: true,
  surum: 1, degistiren: null, degisti: null, takipte: 4, gecikti: 1,
};
const AYARLAR: KademeAyarlariCevabi = { kaynaklar: [SATIR], roller: [{ id: 3, ad: 'ORN-Müdür' }] };
const KAYIT = {
  kaynak: 'kalibrasyon.vade', kayit: '7:2026-11-10', no: 'ORN-ALET-7', baslik: 'Kumpas', yol: '/kalibrasyon/7', sonGun: '2026-11-10',
  baslangic: null, kademe: 4, gecikmeGun: 5,
} as const satisfies GecikenlerimCevabi['kayitlar'][number];

describe('Kademeli uyarı (3405)', () => {
  it('kaynak satırı yan pencerede açılır; değişen gün sürümle gönderilir', async () => {
    const c = kur(<KademeliUyari />, (yol, yontem, govde) => {
      if (yol === '/bildirim-kademe/kaynaklar') return json(200, AYARLAR);
      if (yontem === 'POST') return json(200, { ...AYARLAR, kaynaklar: [{ ...SATIR, ...(govde as object), surum: 2, varsayilan: false }] });
      return json(404, {});
    });
    fireEvent.click(await screen.findByText('Kalibrasyon vadesi'));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/K5 Devret/), { target: { value: '9' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.some((x) => x.yontem === 'POST')).toBe(true); });
    expect(c.find((x) => x.yontem === 'POST')).toEqual({
      yontem: 'POST', yol: '/bildirim-kademe/kaynaklar/kalibrasyon.vade/ayarla',
      govde: { acik: true, k2Gun: 10, k3Gun: null, k4Gun: 3, k5Gun: 9, epostaKademe: 2, serit: true, kapatilamaz: true, yoneticiRolId: null, surum: 1 },
    });
  });

  it('boş bırakılan gün kademeyi kapatır (null gider)', async () => {
    const c = kur(<KademeliUyari />, (yol, yontem) => (yontem === 'POST' ? json(200, AYARLAR) : yol === '/bildirim-kademe/kaynaklar' ? json(200, AYARLAR) : json(404, {})));
    fireEvent.click(await screen.findByText('Kalibrasyon vadesi'));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/K2 Yaklaşıyor/), { target: { value: '' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect((c.find((x) => x.yontem === 'POST')?.govde as { k2Gun: unknown } | undefined)?.k2Gun).toBeNull(); });
  });

  it('Gecikenlerim kaydı kademe adıyla ve kaydın ekranına bağlantıyla verir', async () => {
    kur(<Gecikenlerim />, (yol) => (yol === '/bildirim-kademe/gecikenlerim' ? json(200, { kayitlar: [KAYIT] }) : json(404, {})));
    const bag = await screen.findByRole('link', { name: 'ORN-ALET-7' });
    expect(bag.getAttribute('href')).toBe('/kalibrasyon/7');
    expect(screen.getAllByText(/K4 Yöneticide/).length).toBeGreaterThan(0);
  });

  it('Açık takipler işin kimde olduğunu yazar', async () => {
    kur(<AcikTakipler />, (yol) => (yol === '/bildirim-kademe/acik-takipler' ? json(200, { kayitlar: [{ ...KAYIT, kimde: ['ORN Kişi', 'ORN Yönetici'] }], kesik: false }) : json(404, {})));
    expect((await screen.findAllByText('ORN Kişi, ORN Yönetici')).length).toBeGreaterThan(0);
  });

  it('kişisel oturumda geciken iş kapanmayan şerit açar', async () => {
    kur(<KademeSeridi />, (yol) => {
      if (yol === '/oturum/cihaz') return json(200, { ortak: false, id: null, ad: null });
      if (yol === '/bildirim-kademe/seridim') return json(200, { kayitlar: [KAYIT] });
      return json(404, {});
    });
    const serit = await screen.findByTestId('kademe-seridi');
    expect(serit.textContent).toContain('5 iş günü gecikti');
    expect(screen.getByRole('link', { name: 'İşe git' }).getAttribute('href')).toBe('/kalibrasyon/7');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ortak cihazda şerit çıkmaz ve uyarı sorulmaz', async () => {
    const c = kur(<KademeSeridi />, (yol) => (yol === '/oturum/cihaz' ? json(200, { ortak: true, id: 4, ad: 'ORN-TERMINAL' }) : json(200, { kayitlar: [KAYIT] })));
    await waitFor(() => { expect(c.some((x) => x.yol === '/oturum/cihaz')).toBe(true); });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByTestId('kademe-seridi')).toBeNull();
    expect(c.some((x) => x.yol === '/bildirim-kademe/seridim')).toBe(false);
  });
});
