import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BenimZiyaretcim, ZiyaretcilerimCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ustEylemler } from './ust-eylem.tsx';
import { ZiyaretcilerimPenceresi } from './Ziyaretcilerim.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const benim = (z: Partial<BenimZiyaretcim>): BenimZiyaretcim => ({
  id: 1, ziyaretNo: 'ZY-000001', ad: 'Örnek Misafir', firmaAdi: 'Örnek Firma', neden: 'toplanti', aciklama: null,
  beklenenZaman: '2026-10-20T07:00:00.000Z', ogleYemegi: false, durum: 'beklenen', giris: null, cikis: null, kartNo: null, surum: 1, ...z,
});

const LISTE: ZiyaretcilerimCevabi = {
  ziyaretler: [benim({}), benim({ id: 2, ziyaretNo: 'ZY-000002', ad: 'İçerdeki Misafir', durum: 'iceride', giris: '2026-10-19T08:00:00.000Z', kartNo: 'Z-020' })],
};

interface Gonderilen { yol: string; govde: Record<string, unknown>; kimlik: string | null }

function sunucuKur() {
  const gonderilenler: Gonderilen[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, init?: RequestInit) => {
    const yol = new URL(adres, 'http://yerel').pathname.replace('/api', '');
    if (init?.method === 'POST') {
      const basliklar = (init.headers ?? {}) as Record<string, string>;
      gonderilenler.push({ yol, govde: JSON.parse(String(init.body)) as Record<string, unknown>, kimlik: basliklar[ISTEK_KIMLIGI_BASLIGI] ?? null });
      return json(200, benim({ id: 3, ziyaretNo: 'ZY-000003', ad: 'Yeni Misafir' }));
    }
    if (yol === '/ziyaretcilerim') return json(200, LISTE);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return gonderilenler;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><ZiyaretcilerimPenceresi kapat={() => undefined} /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Ziyaretçilerim', () => {
  it('her oturuma açık, Hesap menüsünde durur (516 a); Nizamiye işlemi istemez', () => {
    expect(ustEylemler.map((e) => [e.anahtar, e.islem, e.yer, e.hesapMaddesi?.baslik])).toEqual([['ziyaretcilerim', 'oturum', 'hesap', 'Ziyaretçilerim']]);
  });

  it('yalnız gelmemiş ziyaretçi iptal edilir; içerideki kartıyla görünür', async () => {
    const gonderilen = sunucuKur();
    ac();
    await screen.findByText('İçerdeki Misafir');
    expect(screen.getByText(/kart Z-020/)).toBeTruthy();
    const iptaller = screen.getAllByRole('button', { name: 'İptal' });
    expect(iptaller).toHaveLength(1);
    fireEvent.click(iptaller[0]!);
    await waitFor(() => expect(gonderilen[0]).toMatchObject({ yol: '/ziyaretcilerim/1/iptal', govde: { surum: 1 } }));
  });

  it('ön kayıt ad ve neden olmadan gitmez; tesis saatiyle, ev sahibi alanı olmadan ve istek kimliğiyle gider', async () => {
    const gonderilen = sunucuKur();
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Ziyaretçi bekliyorum' }));
    const kaydet = screen.getByRole('button', { name: 'Kaydet' });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Eksik: ad, neden')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Ziyaretçinin adı soyadı/), { target: { value: 'Yeni Misafir' } });
    fireEvent.click(screen.getByRole('button', { name: 'Toplantı' }));
    fireEvent.change(screen.getByLabelText(/^Gün/), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText(/^Saat/), { target: { value: '14:30' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(gonderilen).toHaveLength(1));
    const g = gonderilen[0]!;
    expect(g.yol).toBe('/ziyaretcilerim/on-kayit');
    expect(g.govde).toMatchObject({ ad: 'Yeni Misafir', neden: 'toplanti', beklenenZaman: new Date(tesisGunBasi('2026-10-20') + 870 * 60_000).toISOString() });
    expect('evSahibiKisiId' in g.govde).toBe(false);
    expect(g.kimlik).not.toBeNull();
    expect(await screen.findByText(/Yeni Misafir için ön kayıt açıldı/)).toBeTruthy();
  });
});
