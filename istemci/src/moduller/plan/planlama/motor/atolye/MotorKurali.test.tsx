import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { api } from '../../../../../ortak/veri/api.ts';
import type { SunucuSenaryosu } from './kurallar.ts';
import { MotorKurali } from './MotorKurali.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Kart 811 (833 a, 830 a): uydurma taslak ve sürüm.
const DEGERLER = { amac: 'sirali', eksikStok: 'dur', kural: 'atcs' } as const;
const cevap = (farkli: boolean, kural: 'edd' | null): MotorAyarlariCevabi => ({
  guncel: { surumId: 2, degerler: DEGERLER, yazan: 'Deneme Kişi', zaman: null },
  taslak: { id: 7, surum: { surumId: 1, degerler: DEGERLER, yazan: 'Deneme Kişi', zaman: null }, farkli, kural },
});
const S = { id: 7, surum: 3, durum: 'acik' } as unknown as SunucuSenaryosu;
const ciz = (yazabilir: boolean, degisti = vi.fn()) => {
  render(<BildirimSaglayici><MotorKurali s={S} yazabilir={yazabilir} degisti={degisti} /></BildirimSaglayici>);
  return degisti;
};

describe('atölye: taslağın motor ayarı', () => {
  it('açan kişi kuralı seçer ve farklı sürümde güncel ayarları uygular', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(cevap(true, null));
    const post = vi.spyOn(api, 'post').mockResolvedValue({});
    const degisti = ciz(true);
    const secim = await screen.findByLabelText('Sıralama kuralı');
    expect((secim as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'Ayardaki kural: ATCS (öncelik, termin ve süre birlikte)' })).toBeTruthy();
    fireEvent.change(secim, { target: { value: 'edd' } });
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/senaryolar/7/motor-kurali', { surum: 3, kural: 'edd' }, expect.anything()); });
    await vi.waitFor(() => { expect(degisti).toHaveBeenCalled(); });
    fireEvent.click(screen.getByRole('button', { name: /Güncel ayarları uygula/ }));
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/senaryolar/7/motor-ayari-guncelle', { surum: 3 }, expect.anything()); });
  });

  it('başkasının taslağında yalnız görünür; güncelse düğme yok', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(cevap(false, 'edd'));
    ciz(false);
    expect(await screen.findByText('Sıralama kuralı: En erken teslim (EDD)')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Güncel ayarları uygula/ })).toBeNull();
  });
});
