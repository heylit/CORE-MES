import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResimAlani, resimliTur, SatirResmi } from './ResimAlani.tsx';

vi.mock('../../../cizimler/disari.ts', () => ({
  ResimPaneli: ({ malzemeNo }: { malzemeNo: number }) => <div data-testid="resim-paneli">{malzemeNo}</div>,
  KucukResimKutusu: ({ resim, ad }: { resim: { harf: string; revUyumu: boolean | null }; ad: string }) => (
    <span data-testid="kucuk-resim" data-uyum={String(resim.revUyumu)}>{`${ad} ${resim.harf}`}</span>
  ),
}));

afterEach(cleanup);

const resim = (hedefId: number, revUyumu: boolean | null) => ({ hedefId, belgeId: 1, revizyonId: 2, harf: 'B', kareSayisi: 1, revUyumu });

describe('Malzeme kartında çizim merkezinin resmi (688)', () => {
  test('yalnız yarı mamul ve mamul resimli türdür', () => {
    expect(['yarimamul', 'mamul'].every(resimliTur)).toBe(true);
    expect(['hammadde', 'sarf', 'demirbas', 'hizmet', 'ticari_mal', null, undefined].some(resimliTur)).toBe(false);
  });

  test('panel yarı mamul ve mamulde kart no ile açılır', () => {
    render(<><ResimAlani tur="yarimamul" no={12} /><ResimAlani tur="mamul" no={13} /></>);
    expect(screen.getAllByTestId('resim-paneli').map((e) => e.textContent)).toEqual(['12', '13']);
    expect(screen.getAllByRole('region', { name: 'Resim, PDF ve 3B model' })).toHaveLength(2);
  });

  test('kaydedilmemiş kartta (no yok) ve başka türde panel yok', () => {
    render(<><ResimAlani tur="yarimamul" no={undefined} /><ResimAlani tur="hammadde" no={5} /><ResimAlani tur="sarf" no={6} /></>);
    expect(screen.queryByTestId('resim-paneli')).toBeNull();
  });

  test('liste: resmi olan yarı mamulde küçük resim (uyuşmazlık kutuya geçer); resmi olmayan ve hammadde kartında tür simgesi', () => {
    const resimler = new Map([[1, resim(1, false)], [3, resim(3, true)]]);
    const simge = '<circle cx="16" cy="16" r="8"/>';
    const { container } = render(
      <>
        <SatirResmi tur="yarimamul" no={1} ad="YM-1 Braket" simge={simge} resimler={resimler} />
        <SatirResmi tur="mamul" no={2} ad="MM-2 Ünite" simge={simge} resimler={resimler} />
        <SatirResmi tur="hammadde" no={3} ad="HM-3 Çubuk" simge={simge} resimler={resimler} />
      </>,
    );
    const kucuk = screen.getAllByTestId('kucuk-resim');
    expect(kucuk.map((e) => [e.textContent, e.dataset['uyum']])).toEqual([['YM-1 Braket B', 'false']]);
    expect(container.querySelectorAll('svg.tc-ksimge')).toHaveLength(2);
  });
});
