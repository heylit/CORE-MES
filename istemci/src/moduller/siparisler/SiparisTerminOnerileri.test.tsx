import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { TerminOnerisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { SiparisTerminOnerileri } from './SiparisTerminOnerileri.tsx';

// 3429-3 G: sipariş ayrıntısında emirlerin termin farkı. Cevaplar uydurmadır.
const ONERI: TerminOnerisi = { emirId: 5, emirNo: 'ORN-EMR-5', siparisSatiriId: 41, kalemSira: 2, teslim: '2027-01-20', termin: '2027-02-10', baslamis: false, surum: 4 };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function ciz(islemler: string[], yollar: Record<string, () => Response>) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 7, ad: 'Deneme Planlamaci', islemler } });
    const isle = yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <BildirimSaglayici><MemoryRouter><SiparisTerminOnerileri siparisId={9} /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istekler;
}

describe('Sipariş ayrıntısında termin farkı (3429-3 G)', () => {
  it('her emrin farkı kalem ve emir no ile listelenir; Uygula o emrin ucuna termin ve sürümle gider, liste yeniden okunur', async () => {
    let oneriler = [ONERI, { ...ONERI, emirId: 6, emirNo: 'ORN-EMR-6', kalemSira: 3, baslamis: true }];
    const istekler = ciz(['uretim-emirleri.duzenle'], {
      'GET /uretim-emirleri/termin-onerileri': () => json(200, { oneriler }),
      'POST /adimli-emirler/6/termin-onerisi/uygula': () => { oneriler = [ONERI]; return json(200, { emir: {} }); },
    });
    expect(await screen.findAllByText(/: sipariş termini 10.02\.2027, emrin teslimi 20\.01\.2027 \(teslim 21 gün erken\)/)).toHaveLength(2);
    expect(screen.getAllByRole('listitem')[0]?.textContent).toMatch(/^Erken.*Kalem 2 · ORN-EMR-5: sipariş termini/);
    expect(screen.getByText(/Emir başladı/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ORN-EMR-6' }).getAttribute('href')).toBe('/uretim-emirleri/6');
    expect(screen.getAllByText('Erken')).toHaveLength(2);
    expect(istekler.find((i) => i.yol.startsWith('/uretim-emirleri/'))?.yol).toBe('/uretim-emirleri/termin-onerileri?siparisId=9');
    fireEvent.click((await screen.findAllByRole('button', { name: /Yoksay/ }))[0]!);
    expect(await screen.findByText(/ORN-EMR-5: 10\.02\.2027 termini için öneri bir daha gösterilmez/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByText(/öneri bir daha gösterilmez/)).toBeNull());
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click((await screen.findAllByRole('button', { name: /Teslimi 10\.02\.2027 yap/ }))[1]!);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/adimli-emirler/6/termin-onerisi/uygula', govde: { surum: 4, termin: '2027-02-10' } }));
    await waitFor(() => expect(screen.queryByText(/ORN-EMR-6/)).toBeNull());
    expect(screen.getByText('1 emir')).toBeTruthy();
  });

  it('karar yetkisi yoksa yalnız görünür; okuma yetkisi yoksa (403) ya da fark yoksa bölüm yok', async () => {
    ciz([], { 'GET /uretim-emirleri/termin-onerileri': () => json(200, { oneriler: [ONERI] }) });
    expect(await screen.findByText(/sipariş termini 10\.02\.2027/)).toBeTruthy();
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByRole('button', { name: /Teslimi|Yoksay/ })).toBeNull();
    cleanup();
    const i1 = ciz(['uretim-emirleri.duzenle'], { 'GET /uretim-emirleri/termin-onerileri': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }) });
    await waitFor(() => expect(i1.some((i) => i.yol.startsWith('/uretim-emirleri/'))).toBe(true));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByText('Termin farkı')).toBeNull();
    expect(screen.queryByText(/yetki/i)).toBeNull();
    cleanup();
    ciz(['uretim-emirleri.duzenle'], { 'GET /uretim-emirleri/termin-onerileri': () => json(200, { oneriler: [] }) });
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByText('Termin farkı')).toBeNull();
  });
});
