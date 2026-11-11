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
  test('her tür resimlidir (2872-1 a); türü olmayan kayıt değildir', () => {
    expect(['yarimamul', 'mamul', 'hammadde', 'sarf', 'demirbas', 'hizmet', 'ticari_mal'].every(resimliTur)).toBe(true);
    expect([null, undefined, ''].some(resimliTur)).toBe(false);
  });

  test('panel her türde kart no ile açılır', () => {
    render(<><ResimAlani tur="yarimamul" no={12} /><ResimAlani tur="hammadde" no={13} /><ResimAlani tur="sarf" no={14} /></>);
    expect(screen.getAllByTestId('resim-paneli').map((e) => e.textContent)).toEqual(['12', '13', '14']);
    expect(screen.getAllByRole('region', { name: 'Resim, PDF ve 3B model' })).toHaveLength(3);
  });

  test('kaydedilmemiş kartta (no yok) ve türü olmayan kayıtta panel yok', () => {
    render(<><ResimAlani tur="yarimamul" no={undefined} /><ResimAlani tur={null} no={5} /></>);
    expect(screen.queryByTestId('resim-paneli')).toBeNull();
  });

  test('liste: resmi olan kartta küçük resim (uyuşmazlık kutuya geçer, hammadde dahil); resmi olmayanda tür simgesi', () => {
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
    expect(kucuk.map((e) => [e.textContent, e.dataset['uyum']])).toEqual([['YM-1 Braket B', 'false'], ['HM-3 Çubuk B', 'true']]);
    expect(container.querySelectorAll('svg.tc-ksimge')).toHaveLength(1);
  });
});
