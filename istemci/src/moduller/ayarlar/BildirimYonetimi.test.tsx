import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CagriYonlendirmeCevabi, CagriYonlendirmeDegistirGovdesi } from '#paylasilan/sozlesme/bildirim.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { BildirimYonetimi } from './BildirimYonetimi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const BASLANGIC: CagriYonlendirmeCevabi = {
  satirlar: [
    { ekip: 'bakim', rolIdleri: [1, 2], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'malzeme', rolIdleri: [3], surum: 4, degistiren: { id: 9, ad: 'Deneme Yönetici' }, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'ayarci', rolIdleri: [], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
  ],
  roller: [{ id: 1, kod: 'bakim', ad: 'Bakım' }, { id: 2, kod: 'mudur', ad: 'Müdür' }, { id: 3, kod: 'depo', ad: 'Depo' }],
};

function sunucuKur(yazmaDurumu = 200) {
  const yazilanlar: { ekip: string; govde: CagriYonlendirmeDegistirGovdesi }[] = [];
  let saklanan = BASLANGIC;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/bildirimler/cagri-yonlendirme') return json(200, saklanan);
    const m = /^\/bildirimler\/cagri-yonlendirme\/([a-z]+)\/degistir$/.exec(yol);
    if (m?.[1]) {
      const govde = JSON.parse(secenek.body ?? '{}') as CagriYonlendirmeDegistirGovdesi;
      yazilanlar.push({ ekip: m[1], govde });
      if (yazmaDurumu !== 200) return json(yazmaDurumu, { kod: 'ESKI_SURUM', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
      saklanan = {
        ...saklanan,
        satirlar: saklanan.satirlar.map((s) => (s.ekip === m[1] ? { ...s, rolIdleri: govde.rolIdleri, surum: s.surum + 1 } : s)),
      };
      return json(200, saklanan);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><BildirimYonetimi /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('bildirim yönetimi: ekip çağrıları', () => {
  it('her ekip seçili rolleriyle görünür; boş ekip "kimseye gitmiyor" der', async () => {
    sunucuKur();
    ac();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    expect((within(bakim).getByRole('checkbox', { name: 'Bakım' }) as HTMLInputElement).checked).toBe(true);
    expect((within(bakim).getByRole('checkbox', { name: 'Depo' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Kimseye gitmiyor')).toBeTruthy();
    expect(screen.getByText(/Deneme Yönetici/)).toBeTruthy();
  });

  it('rol eklemek ekibin okunan sürümüyle yeni listeyi yazar', async () => {
    const yazilanlar = sunucuKur();
    ac();
    const malzeme = await screen.findByRole('group', { name: 'Malzeme alıcı rolleri' });
    fireEvent.click(within(malzeme).getByRole('checkbox', { name: 'Müdür' }));
    await waitFor(() => { expect(yazilanlar).toEqual([{ ekip: 'malzeme', govde: { rolIdleri: [3, 2], surum: 4 } }]); });
    expect(await screen.findByText('Çağrı alıcıları kaydedildi.')).toBeTruthy();
  });

  it('sunucu reddederse hata görünür ve seçim sunucudaki hâle döner', async () => {
    sunucuKur(409);
    ac();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    fireEvent.click(within(bakim).getByRole('checkbox', { name: 'Müdür' }));
    expect(await screen.findByText('Kayıt başkası tarafından değiştirildi.')).toBeTruthy();
    expect((within(bakim).getByRole('checkbox', { name: 'Müdür' }) as HTMLInputElement).checked).toBe(true);
  });
});
