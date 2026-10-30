import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MakineSecici, type SecimAramaCevabi, type SecimKaydi } from './KayitSecici.tsx';

const kayit = (id: number, kod: string, ust: number | null = 10, aktif = true): SecimKaydi =>
  ({ id, kod, ad: `Deneme ${kod}`, aktif, ust: ust === null ? null : { id: ust, kod: `IS-${ust}`, ad: 'Deneme İstasyon' } });

let adresler: string[] = [];
function sunucu(cevap: (adres: URL) => SecimAramaCevabi) {
  adresler = [];
  vi.stubGlobal('fetch', vi.fn((girdi: RequestInfo | URL) => {
    const adres = new URL(String(girdi), 'http://yerel');
    adresler.push(`${adres.pathname}${adres.search}`);
    return Promise.resolve(new Response(JSON.stringify(cevap(adres)), { status: 200 }));
  }));
}
const sar = (cocuk: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{cocuk}</QueryClientProvider>);

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('KayitSecici (#1317)', () => {
  it('açılınca sahibin ucunu süzgeçle arar, istasyona göre gruplar; yazınca yeniden arar; seçim kaydı verir', async () => {
    sunucu((a) => ({ sonuclar: a.searchParams.get('q') === 'M-2' ? [kayit(2, 'M-2')] : [kayit(1, 'M-1'), kayit(2, 'M-2'), kayit(3, 'M-3', null, false)], dahaVar: false }));
    const sec = vi.fn();
    sar(<MakineSecici etiket="Makine" deger={null} sec={sec} istasyonId={10} />);
    expect(adresler).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Makine' }));
    await screen.findByRole('option', { name: /M-1/ });
    expect(adresler[0]).toBe('/api/istasyonlar/secim-ara?tur=makine&istasyonId=10&sayfa=1');
    expect(screen.getByText('IS-10 Deneme İstasyon')).toBeTruthy();
    expect(screen.getByRole('option', { name: /M-3/ }).textContent).toContain('pasif');
    fireEvent.change(screen.getByRole('combobox', { name: 'Makine ara' }), { target: { value: 'M-2' } });
    await waitFor(() => { expect(screen.queryByRole('option', { name: /M-1/ })).toBeNull(); });
    expect(adresler.at(-1)).toBe('/api/istasyonlar/secim-ara?tur=makine&istasyonId=10&q=M-2&sayfa=1');
    fireEvent.click(screen.getByRole('option', { name: /M-2/ }));
    expect(sec).toHaveBeenCalledWith(kayit(2, 'M-2'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('daha var ise sonraki sayfa istenir; seçili kayıt yeniden seçilirse sec çağrılmaz; boşaltılabilir seçici null verir', async () => {
    sunucu((a) => (a.searchParams.get('sayfa') === '2' ? { sonuclar: [kayit(31, 'M-31')], dahaVar: false } : { sonuclar: [kayit(1, 'M-1')], dahaVar: true }));
    const sec = vi.fn();
    sar(<MakineSecici etiket="Makine" deger={{ id: 1, kod: 'M-1', ad: 'Deneme M-1' }} sec={sec} bosaltilabilir pasifler />);
    expect(screen.getByRole('button', { name: 'Makine' }).textContent).toContain('M-1 Deneme M-1');
    fireEvent.click(screen.getByRole('button', { name: 'Makine' }));
    fireEvent.click(await screen.findByRole('option', { name: /M-1/ }));
    expect(sec).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Makine' }));
    const sonraki = await screen.findByRole('button', { name: 'Sonraki sayfa' }) as HTMLButtonElement;
    await waitFor(() => { expect(sonraki.disabled).toBe(false); });
    fireEvent.click(sonraki);
    await screen.findByRole('option', { name: /M-31/ });
    expect(adresler.at(-1)).toBe('/api/istasyonlar/secim-ara?tur=makine&pasifler=true&sayfa=2');
    fireEvent.click(screen.getByRole('button', { name: /Seçimi kaldır/ }));
    expect(sec).toHaveBeenCalledWith(null);
  });

  it('arama hatası iletilir; sonuç yoksa söylenir; kapalı seçici açılmaz', async () => {
    sunucu(() => ({ sonuclar: [], dahaVar: false }));
    sar(<MakineSecici etiket="Makine" deger={null} sec={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Makine' }));
    expect(await screen.findByText('Aramaya uyan yok.')).toBeTruthy();
    cleanup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }), { status: 403 }))));
    sar(<MakineSecici etiket="Makine" deger={null} sec={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Makine' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Yetkiniz yok.');
    cleanup();
    sar(<MakineSecici etiket="Makine" deger={null} sec={() => undefined} disabled />);
    expect((screen.getByRole('button', { name: 'Makine' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
