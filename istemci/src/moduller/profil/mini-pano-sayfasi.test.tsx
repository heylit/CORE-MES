import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/Bildirim.tsx';
import { MiniPanoSayfasi } from './MiniPanoSayfasi.tsx';
import { MiniPanoEylemi } from './mini-pano-tercihi.tsx';

const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });

afterEach(() => { window.name = ''; cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.querySelectorAll('iframe').forEach((f) => f.remove()); });

function ortamKur() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const ust = iframe.contentWindow as Window;
  const requestWindow = vi.fn(async () => ust);
  vi.stubGlobal('documentPictureInPicture', { requestWindow, get window() { return requestWindow.mock.calls.length > 0 ? ust : null; } });
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    if (adres.endsWith('/oturum')) return json({ kullanici: { id: 7, kullaniciAdi: 'depo', adSoyad: 'Deneme Depocu', roller: [], islemler: ['sayfa.stok'] } });
    if (adres.endsWith('/profil/mini-pano')) return json({ kapali: [], acilistaOner: false, surum: 0 });
    return new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'yok' }), { status: 404 });
  }));
  return { ust, requestWindow };
}

function ciz(icerik: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sar = (i: React.ReactNode) => <QueryClientProvider client={istemci}><MemoryRouter><BildirimSaglayici>{i}</BildirimSaglayici></MemoryRouter></QueryClientProvider>;
  const sonuc = render(sar(icerik));
  return { yeniden: (i: React.ReactNode) => { sonuc.rerender(sar(i)); } };
}

describe('Mini pano penceresi', () => {
  it('pano penceresinde düğmeyle üstte duran panoyu açar; sayfadan çıkılsa da pano kapanmaz', async () => {
    const { requestWindow, ust } = ortamKur();
    window.name = 'tmi-mini-pano';
    const kapat = vi.spyOn(ust, 'close');
    const { yeniden } = ciz(<><MiniPanoEylemi /><MiniPanoSayfasi /></>);
    fireEvent.click(await screen.findByRole('button', { name: 'Mini panoyu aç' }));
    await waitFor(() => expect(requestWindow).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Mini pano açık/)).toBeTruthy();
    expect(ust.document.body.textContent).toContain('Stok ve sevk');
    yeniden(<MiniPanoEylemi />);
    expect(screen.queryByText(/Mini pano açık/)).toBeNull();
    expect(kapat).not.toHaveBeenCalled();
    expect(ust.document.body.textContent).toContain('Stok ve sevk');
  });

  it('ana sekmede açılan sayfa panoyu kendisi açmaz, küçük pencereyi açtırır', async () => {
    const { requestWindow } = ortamKur();
    const yeni = { location: { href: 'about:blank' }, focus: vi.fn() };
    const ac = vi.spyOn(window, 'open').mockReturnValue(yeni as unknown as Window);
    ciz(<><MiniPanoEylemi /><MiniPanoSayfasi /></>);
    fireEvent.click(await screen.findByRole('button', { name: 'Mini pano penceresini aç' }));
    expect(ac).toHaveBeenCalledWith('', 'tmi-mini-pano', expect.stringContaining('popup'));
    expect(requestWindow).not.toHaveBeenCalled();
  });

  it('Hesap menüsündeki madde panoyu bu sekmede değil küçük pencerede açtırır', async () => {
    const { requestWindow } = ortamKur();
    const yeni = { location: { href: 'about:blank' }, focus: vi.fn() };
    const ac = vi.spyOn(window, 'open').mockReturnValue(yeni as unknown as Window);
    const { yeniden } = ciz(<MiniPanoEylemi acmaIstegi={0} />);
    await waitFor(() => expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([a]) => String(a).endsWith('/profil/mini-pano'))).toBe(true));
    yeniden(<MiniPanoEylemi acmaIstegi={1} />);
    await waitFor(() => expect(ac).toHaveBeenCalledWith('', 'tmi-mini-pano', expect.stringContaining('popup')));
    expect(yeni.location.href).toBe(`${window.location.origin}/profil/mini-pano`);
    expect(requestWindow).not.toHaveBeenCalled();
  });

  it('pano penceresi zaten açıksa yeniden yüklenmez, öne gelir', async () => {
    ortamKur();
    const acikPencere = { location: { href: `${window.location.origin}/profil/mini-pano` }, focus: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(acikPencere as unknown as Window);
    const { panoPenceresiniAc } = await import('./mini-pano-penceresi.ts');
    expect(panoPenceresiniAc()).toBe(true);
    expect(acikPencere.location.href).toBe(`${window.location.origin}/profil/mini-pano`);
    expect(acikPencere.focus).toHaveBeenCalled();
  });
});
