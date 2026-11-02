import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/Bildirim.tsx';
import { useKarantinaSorulari } from './KarantinaSorulari.tsx';

afterEach(() => { cleanup(); });

// KM-10 (kart 1779f): serbest bırakma penceresinde köşedeki "Kapat" vazgeçer; NCR'yi kapatan düğme adıyla ayrılır.
describe('serbest bırakılan adet penceresi', () => {
  it('tek "Kapat" düğmesi vazgeçmedir; "NCR\'yi kapat" girilen miktarı döndürür', async () => {
    const sarmal = ({ children }: { children: ReactNode }) => <BildirimSaglayici>{children}</BildirimSaglayici>;
    const { result } = renderHook(() => useKarantinaSorulari(), { wrapper: sarmal });
    let cevap: Promise<unknown> = Promise.resolve();
    act(() => { cevap = result.current.miktarSor([{ partiId: 7, lotNo: 'L-1', redMiktar: '10' }]); });
    render(<BildirimSaglayici>{result.current.pencere}</BildirimSaglayici>);
    const pencere = screen.getByRole('dialog', { name: 'Serbest bırakılan adet' });
    expect(within(pencere).getAllByRole('button', { name: 'Kapat' })).toHaveLength(1);
    fireEvent.change(within(pencere).getByRole('textbox'), { target: { value: '4' } });
    fireEvent.click(within(pencere).getByRole('button', { name: "NCR'yi kapat" }));
    await expect(cevap).resolves.toEqual([{ partiId: 7, miktar: '4' }]);
  });
});
