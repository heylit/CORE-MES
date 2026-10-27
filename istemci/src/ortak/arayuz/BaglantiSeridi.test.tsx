import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { baglantiDurumu, baglantiSifirla, cevapGeldi, kuyrukKaynagi, ulasilamadi, YOKLAMA_ARALIGI_MS } from '../veri/baglanti.ts';
import { BaglantiSeridi, GERI_GELDI_SURESI_MS } from './BaglantiSeridi.tsx';

beforeEach(() => { baglantiSifirla(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('BaglantiSeridi', () => {
  it('baglanti varken hicbir sey cizmez', () => {
    const { container } = render(<BaglantiSeridi />);
    expect(container.innerHTML).toBe('');
  });

  it('kopuklugu kapatilamaz uyari olarak gosterir', () => {
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi(null); });
    expect(screen.getByRole('alert').textContent).toContain('Sunucuya ulaşılamıyor');
    expect(screen.queryByRole('button', { name: 'Bağlantı uyarısını kapat' })).toBeNull();
  });

  it('belirsiz kayit varken donuste kendiliginden kapanmaz, kapatilinca gider', () => {
    vi.useFakeTimers();
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi({}); });
    expect(screen.getByRole('alert').textContent).toContain('1 kaydın');
    act(() => { cevapGeldi(); });
    act(() => { vi.advanceTimersByTime(GERI_GELDI_SURESI_MS * 2); });
    expect(screen.getByRole('status').textContent).toContain('yeniden girmeden önce');
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı uyarısını kapat' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('belirsiz kayit yoksa donus iletisi kisa surede kapanir', () => {
    vi.useFakeTimers();
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi(null); });
    act(() => { cevapGeldi(); });
    expect(screen.getByRole('status').textContent).toContain('geri geldi');
    act(() => { vi.advanceTimersByTime(GERI_GELDI_SURESI_MS); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('kopukken vekil cevabi (sunucu kapali) donus sayilmaz', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi(null); });
    await act(async () => { await vi.advanceTimersByTimeAsync(YOKLAMA_ARALIGI_MS); });
    expect(baglantiDurumu().kopuk).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('güncelleme ya da bağlantı kesintisi');
  });

  it('kopukken sunucuyu yoklar, cevap gelince doner', async () => {
    vi.useFakeTimers();
    const getir = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', getir);
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi(null); });
    await act(async () => { await vi.advanceTimersByTimeAsync(YOKLAMA_ARALIGI_MS); });
    expect(getir).toHaveBeenCalledWith('/api/saglik', expect.objectContaining({ cache: 'no-store' }));
    expect(baglantiDurumu().kopuk).toBe(false);
  });

  it('kopukken kuyrukta bekleyen kaydi yeniden girmemesini soyler', () => {
    render(<BaglantiSeridi />);
    act(() => { ulasilamadi(null); kuyrukKaynagi('arkon').bildir(2); });
    const metin = screen.getByRole('alert').textContent;
    expect(metin).toContain('2 kayıt bu cihazda bekliyor');
    expect(metin).toContain('yeniden girmeyin');
    expect(metin).not.toContain('bilinmiyor');
  });

  it('kuyruk bosalmadan kapanmaz; bosalinca ulasan sayiyi soyler ve kendiliginden kapanir', () => {
    vi.useFakeTimers();
    render(<BaglantiSeridi />);
    const k = kuyrukKaynagi('arkon');
    act(() => { ulasilamadi(null); k.bildir(1); });
    act(() => { cevapGeldi(); });
    act(() => { vi.advanceTimersByTime(GERI_GELDI_SURESI_MS * 2); });
    expect(screen.getByRole('status').textContent).toContain('Bekleyen 1 kayıt gönderiliyor');
    expect(screen.queryByRole('button', { name: 'Bağlantı uyarısını kapat' })).toBeNull();
    act(() => { k.bildir(0); });
    expect(screen.getByRole('status').textContent).toContain('1 kayıt sunucuya ulaştı');
    act(() => { vi.advanceTimersByTime(GERI_GELDI_SURESI_MS); });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
