import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PlanCanliOzeti } from '#paylasilan/sozlesme/plan.ts';
import { ONAYA_GONDER_PASIF, PlanSeridi } from './PlanSeridi.tsx';
import { json, ornekDurum, type Istek } from './test-ortak.tsx';
import type { EkranYerlesimi, RrDurumu } from './veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CANLI: PlanCanliOzeti = { planSurumu: 3, sonCanliyaAlma: null, planlanacak: ['UE-0001|10', 'UE-0002|10'], kuyruklar: [{ makineId: 51, isler: [{ anahtar: 'UE-0001|10', dondurulmus: false, sabit: false }] }] };
const durum = (yerlesim: EkranYerlesimi | null): RrDurumu => ({ ...ornekDurum(), planCanli: CANLI, planYerlesim: yerlesim });
const ac = (d: RrDurumu, surum = 3) => {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    istekler.push({ yontem: secenek?.method ?? 'GET', yol: adres.replace('/api', ''), govde: undefined });
    return json(200, { planSurumu: surum, sonCanliyaAlma: null });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><PlanSeridi durum={d} yerlesimOkunamadi={d.planYerlesim === null} /></QueryClientProvider>);
  return istekler;
};
const yer = (makineId: number, saat: string) => [{ makineId, baslangic: `2026-10-26T${saat}:00.000Z` }];

describe('plan şeridi', () => {
  it('canlıyla aynıysa PLAN CANLI ve son canlıya alma; onaya gönder düğmesi yok', async () => {
    ac(durum({ 'UE-0001|10': yer(51, '08:00') }));
    const s = screen.getByRole('status', { name: 'Plan durumu' });
    expect(s.textContent).toContain('PLAN CANLI');
    expect(s.textContent).toContain('Plan henüz hiç canlıya alınmadı');
    expect(screen.queryByRole('button', { name: 'Onaya gönder' })).toBeNull();
  });

  it('fark varsa değişiklik sayısı ve görünür ama pasif Onaya gönder (357 b); yazma isteği gitmez', async () => {
    const istekler = ac(durum({ 'UE-0001|10': yer(51, '08:00'), 'UE-0002|10': yer(51, '09:00') }));
    expect(screen.getByText('1 değişiklik bekliyor')).toBeTruthy();
    const d = screen.getByRole('button', { name: 'Onaya gönder' }) as HTMLButtonElement;
    expect(d.disabled).toBe(true);
    expect(d.title).toBe(ONAYA_GONDER_PASIF);
    fireEvent.click(d);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/plan/surum')).toBe(true));
    expect(istekler.every((i) => i.yontem === 'GET')).toBe(true);
  });

  it('canlı plan sürümü değişince PLAN DEĞİŞTİ ve Yenile (yalnız okuma)', async () => {
    const istekler = ac(durum({ 'UE-0001|10': yer(51, '08:00') }), 4);
    await screen.findByText(/PLAN DEĞİŞTİ/);
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/plan/surum').length).toBeGreaterThanOrEqual(2));
    expect(istekler.every((i) => i.yontem === 'GET')).toBe(true);
  });

  it('canlı plan özeti yoksa şerit çizilmez ve sürüm sorulmaz', () => {
    const istekler = ac({ ...ornekDurum(), planYerlesim: {} });
    expect(screen.queryByRole('status', { name: 'Plan durumu' })).toBeNull();
    expect(istekler).toHaveLength(0);
  });
});
