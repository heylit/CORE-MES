import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MotorAyarlari as Ayarlar, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import * as oturum from '../../../ortak/veri/oturum.ts';
import { surumMetni } from './kurallar.ts';
import { MotorAyarlari } from './MotorAyarlari.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Kart 811: uydurma sürümler.
const MOTOR_AYARI_VARSAYILAN: Ayarlar = { amac: 'sirali', eksikStok: 'dur', kural: 'atcs' };
const BOS: MotorAyarlariCevabi = { guncel: { surumId: null, degerler: MOTOR_AYARI_VARSAYILAN, yazan: null, zaman: null }, taslak: null };
const yetki = (islemler: string[]) => vi.spyOn(oturum, 'useOturum').mockReturnValue({ data: { islemler } } as unknown as ReturnType<typeof oturum.useOturum>);
const ciz = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><MotorAyarlari /></BildirimSaglayici></QueryClientProvider>);

describe('motor ayarları', () => {
  it('sürüm metni: sürüm yoksa varsayılan, varsa yazan kişi', () => {
    expect(surumMetni(BOS.guncel)).toBe('Varsayılan ayarlar; henüz değiştirilmedi.');
    expect(surumMetni({ ...BOS.guncel, surumId: 3, yazan: 'Deneme Kişi', zaman: null })).toBe('Sürüm 3: Deneme Kişi.');
  });

  it('yetkisi olmayan ayarları yalnız görür', async () => {
    yetki(['plan.planlama-oku']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    ciz();
    expect(await screen.findByText('ATCS (öncelik, termin ve süre birlikte)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kaydet/ })).toBeNull();
  });

  it('plan.motor-ayari değişikliği gönderir; değişiklik yokken kayıt kapalı', async () => {
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ...BOS, guncel: { ...BOS.guncel, surumId: 1, degerler: { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' } } });
    ciz();
    const kaydet = await screen.findByRole('button', { name: /Kaydet/ });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sıralama kuralı'), { target: { value: 'edd' } });
    fireEvent.click(kaydet);
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' }); });
  });
});
