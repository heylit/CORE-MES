import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { KisayolYardimi } from './KisayolYardimi.tsx';
import { YuklemeCizgisi, bekleyisVar } from './YuklemeCizgisi.tsx';

afterEach(() => { cleanup(); document.documentElement.removeAttribute('data-etki-kapali'); });

describe('kısayol yardımı (kart 2092, karar 2081-26)', () => {
  it('? tuşu listeyi açar, Esc kapatır; yazı alanında ? yazıdır', async () => {
    render(<><input aria-label="Ara" /><KisayolYardimi /></>);
    fireEvent.keyDown(screen.getByLabelText('Ara'), { key: '?' });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Liste zamanlayıcıyla açılır; act içinde beklenir ki pencerenin Esc dinleyicisi (katman, useEffect) Esc'ten önce takılsın.
    await act(async () => { fireEvent.keyDown(document.body, { key: '?' }); await new Promise((r) => { setTimeout(r, 0); }); });
    const pencere = screen.getByRole('dialog', { name: 'Klavye kısayolları' });
    expect(pencere.textContent).toContain('Ara ve git');
    fireEvent.keyDown(pencere, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('etki kapatıldıysa açılmaz', async () => {
    document.documentElement.setAttribute('data-etki-kapali', 'kisayol-yardimi');
    render(<KisayolYardimi />);
    fireEvent.keyDown(document.body, { key: '?' });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ekranın kendi ? yardımı varsa o açılır; kabuk listesi açılmaz (sonra takılan ekran da öncelikli)', async () => {
    let ekranActi = 0;
    const ekran = (o: KeyboardEvent) => { if (o.key === '?') { o.preventDefault(); ekranActi += 1; } };
    render(<KisayolYardimi />);
    window.addEventListener('keydown', ekran);
    try {
      fireEvent.keyDown(document.body, { key: '?' });
      await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
      expect(ekranActi).toBe(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally { window.removeEventListener('keydown', ekran); }
    await act(async () => { fireEvent.keyDown(document.body, { key: '?' }); await new Promise((r) => { setTimeout(r, 0); }); });
    expect(screen.getByRole('dialog', { name: 'Klavye kısayolları' })).toBeTruthy();
  });
});

describe('yükleme çizgisi (kart 2092, karar 2081-22)', () => {
  it('verisi gelmemiş sorgu bekleyiştir; verisi olan sorgunun tazelenmesi değildir', async () => {
    const istemci = new QueryClient();
    let bitir: (v: number) => void = () => undefined;
    const ilk = istemci.fetchQuery({ queryKey: ['a'], queryFn: () => new Promise<number>((r) => { bitir = r; }) });
    expect(bekleyisVar(istemci)).toBe(true);
    bitir(1);
    await ilk;
    expect(bekleyisVar(istemci)).toBe(false);
    void istemci.refetchQueries({ queryKey: ['a'] });
    expect(bekleyisVar(istemci)).toBe(false);
  });

  it('bekleyiş kısa sürede biterse çizgi görünmez; uzarsa görünür; sorgu istemcisi yoksa çizilmez', async () => {
    const { container: bos } = render(<YuklemeCizgisi />);
    expect(bos.querySelector('.tc-yukleme-cizgisi')).toBeNull();
    cleanup();
    const istemci = new QueryClient();
    const { container } = render(<QueryClientProvider client={istemci}><YuklemeCizgisi /></QueryClientProvider>);
    let bitir: (v: number) => void = () => undefined;
    let bekleyen: Promise<number> = Promise.resolve(0);
    act(() => { bekleyen = istemci.fetchQuery({ queryKey: ['b'], queryFn: () => new Promise<number>((r) => { bitir = r; }) }); });
    expect(container.querySelector('.tc-yukleme-cizgisi')).toBeNull();
    await act(async () => { await new Promise((r) => { setTimeout(r, 300); }); });
    expect(container.querySelector('.tc-yukleme-cizgisi')?.getAttribute('data-durum')).toBe('suruyor');
    await act(async () => { bitir(1); await bekleyen; });
    expect(container.querySelector('.tc-yukleme-cizgisi')?.getAttribute('data-durum')).toBe('bitti');
  });
});
