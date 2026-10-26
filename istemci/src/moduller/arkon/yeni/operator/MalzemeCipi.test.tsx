import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IsMalzemeDurumu } from '../../../stok/disari.ts';
import type * as Baglanti from '../../baglanti.ts';

const durum = vi.hoisted(() => ({ deger: null as IsMalzemeDurumu | null, istasyonId: 7 as number | null }));
const ac = vi.hoisted(() => vi.fn());
vi.mock('../../baglanti.ts', async (asil) => ({
  ...(await asil<typeof Baglanti>()),
  useIsMalzemeDurumu: () => ({ durum: durum.deger, istasyonId: durum.istasyonId }),
  isMalzemesiniAc: ac,
}));
const { MalzemeCipi } = await import('./MalzemeCipi.tsx');

afterEach(() => { cleanup(); ac.mockReset(); });

describe('terminalin malzeme çipi (618)', () => {
  it('eksik varsa söyler; dokununca panel bu işle (bütün malzeme) açılır', () => {
    durum.deger = { girdi: 2, eksik: 1, istendi: 0, gelen: 0 };
    durum.istasyonId = 7;
    render(<MalzemeCipi istasyon="IST-1" emirId={42} />);
    fireEvent.click(screen.getByRole('button', { name: /Malzeme.*1 eksik/ }));
    expect(ac).toHaveBeenCalledWith({ istasyonId: 7, uretimEmriId: 42, malzemeId: null });
  });
  it('girdisiz rotada, istasyon bilinmezken, emirsiz işte ve veri yokken çip çıkmaz', () => {
    for (const [d, ist, emir] of [
      [{ girdi: 0, eksik: 0, istendi: 0, gelen: 0 }, 7, 42], [{ girdi: 1, eksik: 1, istendi: 0, gelen: 0 }, null, 42],
      [{ girdi: 1, eksik: 1, istendi: 0, gelen: 0 }, 7, null], [null, 7, 42],
    ] as const) {
      durum.deger = d; durum.istasyonId = ist;
      render(<MalzemeCipi istasyon="IST-1" emirId={emir} />);
      expect(screen.queryByRole('button')).toBeNull();
      cleanup();
    }
  });
});
