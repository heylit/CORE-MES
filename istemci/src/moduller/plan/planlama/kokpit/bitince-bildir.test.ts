import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBitinceBildir } from './bitince-bildir.ts';

// 3486: Planla'nın sonucu dizme sürerken söylenmez; dizme bitince bir kez söylenir.
describe('useBitinceBildir (3486)', () => {
  it('meşgulken ileti bekler, meşgul bitince bir kez bildirilir; sonraki bitişte tekrar söylenmez', () => {
    const bildir = vi.fn();
    const { result, rerender } = renderHook(({ m }) => useBitinceBildir(m, bildir), { initialProps: { m: false } });
    act(() => { result.current('ORN planlandı.'); });
    rerender({ m: true });
    expect(bildir).not.toHaveBeenCalled();
    rerender({ m: false });
    expect(bildir).toHaveBeenCalledExactlyOnceWith('bilgi', 'ORN planlandı.');
    rerender({ m: true }); rerender({ m: false });
    expect(bildir).toHaveBeenCalledTimes(1);
  });
  it('ileti yoksa meşgul bitişinde bir şey söylenmez', () => {
    const bildir = vi.fn();
    const { rerender } = renderHook(({ m }) => useBitinceBildir(m, bildir), { initialProps: { m: true } });
    rerender({ m: false });
    expect(bildir).not.toHaveBeenCalled();
  });
});
