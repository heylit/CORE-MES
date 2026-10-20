import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { Ayrinti, SaglikCevabi, Uyari } from '#paylasilan/sozlesme/saglik.ts';
import { gorunenUstEylemler } from '../../ortak/rota/ust-eylemler.ts';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['saglik.ayrinti-oku'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function ac(uyarilar: Uyari[]) {
  const ayrinti = {
    veritabaniGecikmeMs: 3, sonGoc: null, commit: null, calismaSuresiSn: 60, ortam: 'test', isler: [], uyarilar,
  } satisfies Ayrinti;
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici: YONETICI } satisfies OturumCevabi);
    if (yol === '/saglik') return json(200, { durum: 'ok' } satisfies SaglikCevabi);
    if (yol === '/saglik/ayrinti') return json(200, ayrinti);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const [eylem] = gorunenUstEylemler(ustEylemler, YONETICI.islemler);
  if (!eylem) throw new Error('Sistem durumu düğmesi görünmüyor');
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><eylem.dugme /></QueryClientProvider>);
}

describe('üst çubukta sistem durumu', () => {
  it('yalnız sağlık ayrıntısını okuyana görünür', () => {
    expect(gorunenUstEylemler(ustEylemler, ['sayfa.terminal'])).toEqual([]);
    expect(gorunenUstEylemler(ustEylemler, ['saglik.ayrinti-oku']).map((e) => e.anahtar)).toEqual(['sistem-durumu']);
  });

  it('uyarı sayısını düğmede gösterir; tıklanınca uyarılar yan pencerede açılır', async () => {
    ac([
      { tur: 'yedek', ileti: 'Son yedek 30 saat önce alındı.' },
      { tur: 'disk', ileti: 'Yedek diskinde 2,0 GB boş yer kaldı.' },
    ]);
    const dugme = await screen.findByRole('button', { name: 'Sistem durumu, 2 uyarı' });
    expect(dugme.textContent).toBe('2');
    fireEvent.click(dugme);
    const pencere = await screen.findByRole('dialog', { name: 'Sistem durumu' });
    expect(await within(pencere).findByText('Son yedek 30 saat önce alındı.')).toBeTruthy();
    expect(within(pencere).getByText('Yedek diskinde 2,0 GB boş yer kaldı.')).toBeTruthy();
  });

  it('uyarı yokken sayı göstermez', async () => {
    ac([]);
    const dugme = await screen.findByRole('button', { name: 'Sistem durumu' });
    await vi.waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([a]) => a === '/api/saglik/ayrinti')).toBe(true));
    expect(dugme.textContent).toBe('');
  });
});

it('Hesap menüsünden gelen açma isteği pencereyi açar', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' })));
  const [eylem] = ustEylemler;
  if (!eylem) throw new Error('eylem yok');
  expect(eylem.hesapMaddesi).toEqual({ baslik: 'Sistem durumu', simge: 'cpu' });
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender } = render(<QueryClientProvider client={istemci}><eylem.dugme acmaIstegi={0} /></QueryClientProvider>);
  expect(screen.queryByRole('dialog')).toBeNull();
  rerender(<QueryClientProvider client={istemci}><eylem.dugme acmaIstegi={1} /></QueryClientProvider>);
  expect(await screen.findByRole('dialog', { name: 'Sistem durumu' })).toBeTruthy();
});
