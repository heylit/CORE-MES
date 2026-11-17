import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { KademeAyariCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { HazirlikKademeAyari } from './HazirlikKademeAyari.tsx';
import { HazirlikSeridi } from './HazirlikSeridi.tsx';

const AYAR = (yazabilir: boolean): KademeAyariCevabi => ({
  hatirlatGun: 1, yoneticiGun: 1, devretGun: 2, yoneticiRolId: null, surum: 3, degistiren: null, degisti: null, yazabilir,
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(ogeler: React.ReactNode, cevap: (yol: string, yontem: string, govde: unknown) => Response) {
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde: unknown = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    return cevap(yol, yontem, govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{ogeler}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Hazırlık kademesi (3396 a)', () => {
  it('ayar kaydı gün ve sürümü gönderir; yalnız yazabilen kaydeder', async () => {
    const c = kur(<HazirlikKademeAyari />, (yol, yontem, govde) => {
      if (yol === '/projeler/hazirlik-kademe-ayari') return json(200, yontem === 'POST' ? { ...AYAR(true), ...(govde as object), surum: 4 } : AYAR(true));
      if (yol === '/projeler/rol-secenekleri') return json(200, { roller: [{ id: 3, ad: 'Üretim müdürü' }] });
      return json(404, { kod: 'yok', mesaj: 'yok' });
    });
    fireEvent.change(await screen.findByLabelText(/gecikince devredilir/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(c.some((x) => x.yontem === 'POST')).toBe(true); });
    expect(c.find((x) => x.yontem === 'POST')?.govde).toEqual({ hatirlatGun: 1, yoneticiGun: 1, devretGun: 4, yoneticiRolId: null, surum: 3 });
  });

  it('okuyan kişi ayarı değiştiremez', async () => {
    kur(<HazirlikKademeAyari />, (yol) => (yol === '/projeler/hazirlik-kademe-ayari' ? json(200, AYAR(false)) : json(404, {})));
    const girdi = await screen.findByLabelText(/kala hatırlatılır/);
    expect((girdi as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
  });

  it('kişisel oturumda geciken görev kapanmayan şerit açar', async () => {
    kur(<HazirlikSeridi />, (yol) => {
      if (yol === '/oturum/cihaz') return json(200, { ortak: false, id: null, ad: null });
      if (yol === '/projeler/hazirlik-uyarim') return json(200, { gorevler: [{ id: 1, ad: 'CNC kurulumu · ORN-UE-1', planBitis: '2026-11-10', gecikmeGun: 3, kademe: 4 }] });
      return json(404, {});
    });
    const serit = await screen.findByTestId('hazirlik-seridi');
    expect(serit.textContent).toContain('3 gün gecikti');
    expect(screen.getByRole('link', { name: 'Görevlere git' }).getAttribute('href')).toBe('/proje-gorevlerim');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ortak cihazda şerit çıkmaz ve uyarı sorulmaz', async () => {
    const c = kur(<HazirlikSeridi />, (yol) => (yol === '/oturum/cihaz' ? json(200, { ortak: true, id: 4, ad: 'ORN-TERMINAL' }) : json(200, { gorevler: [{ id: 1, ad: 'x', planBitis: '2026-11-10', gecikmeGun: 3, kademe: 4 }] })));
    await waitFor(() => { expect(c.some((x) => x.yol === '/oturum/cihaz')).toBe(true); });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(screen.queryByTestId('hazirlik-seridi')).toBeNull();
    expect(c.some((x) => x.yol === '/projeler/hazirlik-uyarim')).toBe(false);
  });
});
