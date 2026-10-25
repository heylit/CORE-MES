import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLAN, calismaKaydi } from './test-verisi.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const BEKLE = { timeout: 10000 };

describe('Ufuk', () => {
  it('plan yoksa ufuk kurulmaz', async () => {
    sunucuKur(YONETICI, calismaKaydi());
    ac('/recete-rota/planlama-yeni/ufuk');
    expect(await screen.findByText('Önce plan kurulmalı.', {}, BEKLE)).toBeTruthy();
  }, 20000);

  it('yük ızgarası grup ve hafta; hücre o haftanın işlerini açar; malzeme görünümü netleştirmeyi ve TL\'yi gösterir', async () => {
    sunucuKur(YONETICI, calismaKaydi({}, { plan: PLAN }));
    ac('/recete-rota/planlama-yeni/ufuk');
    const hucre = await screen.findByRole('button', { name: /^torna, 05\.10 haftası: plan 8 sa/ }, BEKLE);
    fireEvent.click(hucre);
    const kart = screen.getByRole('heading', { name: 'torna · 05.10 haftası' }).closest('section') as HTMLElement;
    expect(within(kart).getAllByText('S1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Planda olmayan 1 sipariş/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Malzeme' }));
    expect(screen.getByText('M1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'M1' }));
    expect(screen.getByText('Hafta sonu eldeki')).toBeTruthy();
    expect(screen.getAllByText('Yeni alım')[0]?.closest('.tc-pyu-kpi-kutu')?.textContent).toMatch(/TL/);
  }, 20000);

  it('plan.yaz olan kişi ufku 26 haftaya çevirir: yalnız ufuk ayarı yazılır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi({}, { plan: PLAN }), { govdeler });
    ac('/recete-rota/planlama-yeni/ufuk');
    fireEvent.click(within(await screen.findByRole('group', { name: 'Ufuk' }, BEKLE)).getByRole('button', { name: '26 hafta' }));
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ beklenenSurum: 4, deger: { D: { ufuk: { hafta: 26, kuyruk: 1 } }, plan: { dataVer: 4 } } });
  }, 20000);

  it('plan.yaz ve maliyet okuması olmayan kişi: ayarlar kapalı, malzemede TL yok (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, calismaKaydi({}, { plan: PLAN }));
    ac('/recete-rota/planlama-yeni/ufuk');
    const grup = await screen.findByRole('group', { name: 'Ufuk' }, BEKLE);
    expect((within(grup).getByRole('button', { name: '26 hafta' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Adım başı bekleme, iş günü') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Malzeme' }));
    expect(screen.getAllByText('Yeni alım')[0]?.closest('.tc-pyu-kpi-kutu')?.textContent).not.toMatch(/TL/);
  }, 20000);
});
