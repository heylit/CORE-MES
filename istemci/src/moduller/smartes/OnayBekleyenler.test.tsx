import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { AdetKarariCevabi, AdetOnaylariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { OnayBekleyenler } from './OnayBekleyenler.tsx';

const ONAYCI: Kullanici = { id: 1, ad: 'Deneme Müdür', islemler: ['sayfa.smartes', 'smartes.adet-onayla'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: ['sayfa.smartes'] };
const AN = '2026-11-13T10:00:00.000Z';

type Satir = AdetOnaylariCevabi['satirlar'][number];
const satir = (ek: Partial<Satir>): Satir => ({
  id: 1, smartesId: 11, tur: 'saglam', adet: 40, duzeltme: false, durum: 'bekliyor', olusma: AN,
  isEmriNo: 'ORN-IE-1', emirId: 7, emirNo: 'ORN-UE-1', opNo: 20, smartesSaglam: 40, makineSaglam: 40,
  istasyonKodu: 'ORN-IST-1', makineKodu: 'ORN-M01', baslangic: AN, kararVeren: null, kararZamani: null, redNedeni: null, ...ek,
});
const BEKLEYEN: AdetOnaylariCevabi = { satirlar: [
  satir({}),
  satir({ id: 2, smartesId: 12, isEmriNo: 'ORN-IE-2', emirId: null, emirNo: null, opNo: null, makineSaglam: 45 }),
], toplam: 2, sayfa: 1 } as AdetOnaylariCevabi;
const KARARLAR: AdetOnaylariCevabi = { satirlar: [
  satir({ id: 9, durum: 'reddedildi', kararVeren: 'Deneme Müdür', kararZamani: AN, redNedeni: 'ORN neden' }),
], toplam: 1, sayfa: 1 } as AdetOnaylariCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yol: string; yontem: string; govde: unknown }

function ac(kullanici: Kullanici) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/smartes/adet-onaylari?gorunum=bekliyor')) return json(200, BEKLEYEN);
    if (yol.startsWith('/smartes/adet-onaylari?gorunum=karar')) return json(200, KARARLAR);
    if (yol === '/smartes/adet-onaylari/onayla') return json(200, { islenen: 1, hatalar: [] } satisfies AdetKarariCevabi);
    if (yol === '/smartes/adet-onaylari/reddet') return json(200, { islenen: 1, hatalar: [] } satisfies AdetKarariCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><OnayBekleyenler /></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES Onay bekliyor (3173 b)', () => {
  it('onaylayan tek kaydı onaylar; eşleşmeyen emir onaylanamaz; makine sayacı farkı görünür', async () => {
    const cagrilar = ac(ONAYCI);
    const tablo = await screen.findByRole('table', { name: 'Onay bekleyen SmartES kayıtları' });
    await waitFor(() => { expect(within(tablo).getAllByRole('button', { name: 'Onayla' })).toHaveLength(2); });
    const [birinci, ikinci] = within(tablo).getAllByRole('button', { name: 'Onayla' });
    expect((ikinci as HTMLButtonElement).disabled).toBe(true);
    expect(within(tablo).getByText(/CORE iş emriyle eşleşmedi/)).toBeTruthy();
    expect(within(tablo).getByText('Makine sayacı 45')).toBeTruthy();
    fireEvent.click(birinci!);
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/smartes/adet-onaylari/onayla')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/smartes/adet-onaylari/onayla')?.govde).toEqual({ idler: [1] });
    expect(await screen.findByText(/1 kayıt onaylandı ve üretim emrine işlendi/)).toBeTruthy();
  });

  it('red nedeni yazılmadan reddedilmez; nedenle reddedilir; son kararlar görünür', async () => {
    const cagrilar = ac(ONAYCI);
    expect(await screen.findByText('ORN neden', { exact: false })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-UE-1 · Op 20 40 sağlam kaydını reddet' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    expect(cagrilar.some((c) => c.yol === '/smartes/adet-onaylari/reddet')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText(/Red nedeni/), { target: { value: '  ORN sayım hatalı ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => { expect(cagrilar.find((c) => c.yol === '/smartes/adet-onaylari/reddet')?.govde).toEqual({ idler: [1], neden: 'ORN sayım hatalı' }); });
  });

  it('yetkisi olmayan listeyi görür, karar düğmesi görmez', async () => {
    ac(IZLEYICI);
    await screen.findByRole('table', { name: 'Onay bekleyen SmartES kayıtları' });
    expect(await screen.findByText(/Onaylamak için “SmartES adetlerini onaylama” yetkisi gerekir/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });
});
