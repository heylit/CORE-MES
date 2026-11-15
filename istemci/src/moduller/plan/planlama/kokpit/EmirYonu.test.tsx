import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EmirYonu } from './EmirYonu.tsx';
import { sahteTaslak } from './taslak-test-yardim.ts';

// Çalışma uydurmadır; sunucu yerine taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

function kur(c: PlanlamaCalismasi, yazabilir = true) {
  const { t, yazilan } = sahteTaslak(c.dataVer, { wT: 0, late: 0, n: 2 });
  render(<EmirYonu c={c} taslak={t} yazabilir={yazabilir} emirId="S1" no="ORN-1" />);
  return { t, yazilan };
}

describe('Kokpit emrin planlama yönü (3282 1c)', () => {
  it('açılışta planınki seçilidir; Geri emrin yönünü taslağa yazar, etkisini gösterir, Uygula dizmeyi yazar', async () => {
    const { t, yazilan } = kur(ornekCalisma());
    const grup = screen.getByRole('group', { name: 'Planlama yönü' });
    expect(within(grup).getByRole('button', { name: 'Planınki' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(grup).getByRole('button', { name: 'Teslimden geriye' }));
    const etki = await screen.findByRole('region', { name: 'Yönün etkisi' });
    expect(yazilan).toEqual([{ tur: 'yon', emirId: 'S1', yon: 'geri' }]);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
  });

  it('Vazgeç değişikliği geri alır; yazamayan kişide düğmeler kapalıdır', async () => {
    const { t } = kur(ornekCalisma());
    fireEvent.click(screen.getByRole('button', { name: 'Teslimden geriye' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Yönün etkisi' })).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false); });
    cleanup();
    kur(ornekCalisma(), false);
    expect(screen.getByRole('button', { name: 'Teslimden geriye' }).hasAttribute('disabled')).toBe(true);
  });
});
