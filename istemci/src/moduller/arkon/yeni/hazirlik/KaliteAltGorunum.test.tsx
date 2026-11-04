import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  CmmPaneli, GkkPaneli, GorselPaneli, ISTASYON_PANELLERI, KalitePaneli, istasyonPaneli, type IsDegisikligi, type IstasyonKaydi, type PanelArayuzu,
} from './IstasyonPanelleri.tsx';
import type { IstasyonAyari } from './kurallar.ts';
import type { Order, Pkg, PlanItem } from './tipler.ts';

// 2011 a, 2026: kalite istasyonunda adımın operasyon tipi (GKK, GM, KMM) alt görünümü seçer.
afterEach(cleanup);

const paket = (opTipi?: string, plan: Partial<PlanItem>[] = []) =>
  ({ id: 'p1', opType: 'kalite', plan, ...(opTipi === undefined ? {} : { tmi: { emirId: 1, isEmriId: 2, opNo: 70, opTipi } }) }) as unknown as Pkg;

function ac(Panel: typeof GorselPaneli, kayit: IstasyonKaydi, p: Pkg = paket('GM')) {
  let is = { good: 83, scrap: 3, target: 200, sr: kayit } as unknown as Order;
  const yap = vi.fn((_e: string, _s: string, _t: string, f: IsDegisikligi) => { is = { ...is, ...f(is) }; });
  const api = {
    is, paket: p, ayar: { lot: 200, n: 8, ac: 0, defects: ['Çizik', 'Ezik', 'Çapak'] } as IstasyonAyari, kayit,
    yap, sessiz: vi.fn(), soyle: vi.fn(), okut: vi.fn(),
  } as unknown as PanelArayuzu;
  render(<Panel api={api} />);
  return { yap, is: () => is };
}

describe('kalite alt görünümleri (2026)', () => {
  it('panel seçimi: kalite istasyonunda operasyon tipi, öteki istasyonlarda istasyon tipi', () => {
    expect(istasyonPaneli('kalite', paket('GKK'))).toBe(GkkPaneli);
    expect(istasyonPaneli('kalite', paket('GM'))).toBe(GorselPaneli);
    expect(istasyonPaneli('kalite', paket('KMM'))).toBe(CmmPaneli);
    expect(istasyonPaneli('kalite', paket())).toBe(KalitePaneli);
    expect(istasyonPaneli('kalite', paket('SKK'))).toBe(KalitePaneli);
    expect(istasyonPaneli('montaj', { ...paket('GM'), opType: 'montaj' } as Pkg)).toBe(ISTASYON_PANELLERI.montaj);
    expect(istasyonPaneli('cnc', null)).toBeUndefined();
  });

  it('görsel: sağlam tek dokunuşla +1; kusurlu nedene dokunarak sayılır ve Pareto ondan çıkar', () => {
    const p = ac(GorselPaneli, { gm: { Çizik: 2, Ezik: 1 } });
    expect(screen.getByText('86 / 200')).toBeTruthy();
    expect(screen.getByText('Sağlam 83 · kusurlu 3 · kalan 114')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Sağlam \+1/ }));
    expect(p.yap.mock.calls[0]![0]).toBe('Sağlam +1');
    expect(p.is().good).toBe(84);
    fireEvent.click(screen.getByRole('button', { name: /Çapak/ }));
    expect(p.yap.mock.calls[1]![0]).toBe('Kusurlu · Çapak');
    expect(p.is().scrap).toBe(4);
    expect((p.is().sr as IstasyonKaydi).gm).toEqual({ Çizik: 2, Ezik: 1, Çapak: 1 });
    const cubuklar = screen.getAllByRole('meter');
    expect(cubuklar.map((m) => m.getAttribute('aria-label'))).toEqual(['Çizik', 'Ezik', 'Çapak']);
  });

  it('GKK ve CMM bugünkü muayeneyi taşır; CMM, CMM ve elle balonları ayırır', () => {
    ac(GkkPaneli, {}, paket('GKK'));
    expect(screen.getByText('Giriş kontrolü')).toBeTruthy();
    expect(screen.getByText('Ölçüler')).toBeTruthy();
    cleanup();
    const plan = [
      { id: 1, nom: '40', tol: 'h7', tool: 'CMM', min: 39.9, max: 40 },
      { id: 2, nom: '20', tol: 'g6', tool: 'Mikrometre', min: 19.9, max: 20 },
      { id: 3, nom: '120', tol: '±0,1', tool: 'Kumpas', min: 119.9, max: 120.1, m: 'cmm' },
    ] as Partial<PlanItem>[];
    ac(CmmPaneli, {}, paket('KMM', plan));
    expect(screen.getByText("2 balon CMM'de · 1 elle · sonuç dosyası ve karar Kalite Merkezi'nde")).toBeTruthy();
    expect(screen.getByText('Ölçüler')).toBeTruthy();
  });
});
