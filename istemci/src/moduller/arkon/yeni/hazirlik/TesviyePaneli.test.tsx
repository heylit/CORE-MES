import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ISTASYON_PANELLERI, TesviyePaneli, type IsDegisikligi, type IstasyonKaydi, type PanelArayuzu } from './IstasyonPanelleri.tsx';
import type { IstasyonAyari } from './kurallar.ts';
import type { Order, Pkg } from './tipler.ts';

// 2012 a, 2026: tesviye paneli işin kontrol listesini tutar; sayım ve kişi payı terminalin ortak sayacındadır (2003 c).
afterEach(cleanup);

function ac(kayit: IstasyonKaydi, checks: string[] = ['Çapak yok', 'Diş temiz']) {
  let is = { good: 52, target: 120, scrap: 1, sr: kayit } as unknown as Order;
  const yap = vi.fn((_e: string, _s: string, _t: string, f: IsDegisikligi) => { is = { ...is, ...f(is) }; });
  const api = {
    is, paket: { id: 'p1', opType: 'tesviye' } as unknown as Pkg, ayar: { checks } as IstasyonAyari, kayit,
    yap, sessiz: vi.fn(), soyle: vi.fn(), okut: vi.fn(),
  } as unknown as PanelArayuzu;
  render(<TesviyePaneli api={api} />);
  return { yap, sr: () => is.sr as IstasyonKaydi };
}

describe('tesviye paneli (2026)', () => {
  it('tesviye iş türünün paneli kayıtlıdır', () => {
    expect(ISTASYON_PANELLERI.tesviye).toBe(TesviyePaneli);
  });

  it('kontrol işaretlenir ve geri alınır; iş kaydına yazılır, sayıma dokunmaz', () => {
    const p = ac({});
    expect(screen.getByText('0 / 2')).toBeTruthy();
    expect(screen.getByText(/İş toplamı 52 \/ 120/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Çapak yok' }));
    expect(p.yap).toHaveBeenCalledTimes(1);
    expect(p.yap.mock.calls[0]![0]).toBe('Kontrol tamam · Çapak yok');
    expect(Object.keys(p.sr().tes ?? {})).toEqual(['Çapak yok']);
    cleanup();
    const q = ac({ tes: { 'Çapak yok': 1 } });
    expect(screen.getByRole('button', { name: 'Çapak yok' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Çapak yok' }));
    expect(q.yap.mock.calls[0]![0]).toBe('Kontrol geri alındı · Çapak yok');
    expect(q.sr().tes).toEqual({});
  });

  it('liste boşsa hazırlığa yönlendirir', () => {
    ac({}, []);
    expect(screen.getByText('Kontrol listesi boş · hazırlıkta kontrol ekle.')).toBeTruthy();
  });
});
