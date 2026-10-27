import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as Baglanti from '../../baglanti.ts';

const durum = vi.hoisted(() => ({ istasyonId: 7 as number | null, sayi: { gelen: 2, cikan: 1 } as { gelen: number; cikan: number } | null }));
vi.mock('../../baglanti.ts', async (asil) => ({
  ...(await asil<typeof Baglanti>()),
  useIsMalzemeDurumu: () => ({ durum: null, istasyonId: durum.istasyonId }),
  useIstasyonSepetiSayilari: () => durum.sayi,
  IstasyonSepetleri: ({ istasyonId, uretimEmriId }: { istasyonId: number; uretimEmriId: number }) => <p>sepetler {istasyonId} {uretimEmriId}</p>,
}));
const { Sepetler, cikanSepetiniAc } = await import('./Sepetler.tsx');

afterEach(() => { cleanup(); durum.istasyonId = 7; durum.sayi = { gelen: 2, cikan: 1 }; });

describe('terminalin iki sepeti (745)', () => {
  it('çip gelen ve çıkan sayısını söyler; dokununca sepetler bu istasyon ve emirle açılır', () => {
    render(<Sepetler istasyon="IST-1" emirId={42} />);
    fireEvent.click(screen.getByRole('button', { name: /Sepet.*Gelen 2 · Çıkan 1/ }));
    expect(screen.getByText('sepetler 7 42')).toBeTruthy();
  });
  it('adım bitince çıkan sepet biten emirle kendiliğinden açılır, terminal sıradaki işe geçmiş olsa da; emirsiz bitişte açılmaz', () => {
    render(<Sepetler istasyon="IST-1" emirId={43} />);
    act(() => cikanSepetiniAc(null));
    expect(screen.queryByText(/sepetler/)).toBeNull();
    act(() => cikanSepetiniAc(42));
    expect(screen.getByText('sepetler 7 42')).toBeTruthy();
  });
  it('istasyon bilinmezken, emirsiz işte ya da sepet okunamadıysa çip çıkmaz', () => {
    for (const [ist, emir, sayi] of [[null, 42, { gelen: 0, cikan: 0 }], [7, null, { gelen: 0, cikan: 0 }], [7, 42, null]] as const) {
      durum.istasyonId = ist; durum.sayi = sayi;
      render(<Sepetler istasyon="IST-1" emirId={emir} />);
      expect(screen.queryByRole('button')).toBeNull();
      cleanup();
    }
  });
});
