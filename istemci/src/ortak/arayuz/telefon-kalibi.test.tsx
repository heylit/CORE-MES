import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SabitEylem } from './SabitEylem.tsx';
import { Tablo, type Sutun } from './Tablo.tsx';
import { BildirimSaglayici, GERI_AL_SURESI_MS, useBildirim } from './Bildirim.tsx';
import { MemoryRouter } from 'react-router-dom';

interface Satir { no: number; ad: string; not: string }
const SUTUNLAR: readonly Sutun<Satir>[] = [
  { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
  { anahtar: 'not', baslik: 'Not', kartta: false, hucre: (s) => s.not },
];
const SATIRLAR: Satir[] = [{ no: 1, ad: 'ORN-A', not: 'ORN-not' }];

function telefonOlsun(telefon: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: telefon && q.includes('max-width: 767px'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('telefon kalıbı (kart 3676)', () => {
  it('kayıt listesi telefonda karttır, sütun gizlenebilir', () => {
    telefonOlsun(true);
    const { container } = render(<Tablo etiket="Liste" kip="kayit" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    const kap = container.querySelector('.tc-tablo-kap');
    expect(kap?.getAttribute('data-kip')).toBe('kart');
    expect(kap?.hasAttribute('data-kaydir')).toBe(false);
    expect(container.querySelector('td[data-baslik="Not"]')?.hasAttribute('data-kart-gizli')).toBe(true);
    expect(container.querySelector('td[data-baslik="Ad"]')?.hasAttribute('data-kart-gizli')).toBe(false);
  });

  it('kayıt listesi geniş ekranda kayan tablodur', () => {
    telefonOlsun(false);
    const { container } = render(<Tablo etiket="Liste" kip="kayit" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    const kap = container.querySelector('.tc-tablo-kap');
    expect(kap?.hasAttribute('data-kaydir')).toBe(true);
    expect(kap?.getAttribute('data-kip')).toBeNull();
  });

  it('kaydir kipi telefonda da kayar (matris ve rapor tabloları)', () => {
    telefonOlsun(true);
    const { container } = render(<Tablo etiket="Rapor" kip="kaydir" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    expect(container.querySelector('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
  });

  it('kompakt kayıt kartı: başlık, rozet ve işaretli alanlar görünür, ötekiler gizlenir', () => {
    telefonOlsun(true);
    interface K { no: number; ad: string; durum: string; tutar: number; yer: string; not: string }
    const sutunlar: Sutun<K>[] = [
      { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
      { anahtar: 'tutar', baslik: 'Tutar', kartta: true, hucre: (s) => s.tutar },
      { anahtar: 'yer', baslik: 'Yer', hucre: (s) => s.yer },
      { anahtar: 'durum', baslik: 'Durum', hucre: (s) => s.durum },
      { anahtar: 'not', baslik: 'Not', hucre: (s) => s.not },
    ];
    const { container } = render(<Tablo etiket="K" kip="kayit" sutunlar={sutunlar} satirlar={[{ no: 1, ad: 'ORN-A', durum: 'Açık', tutar: 5, yer: 'Y', not: 'N' }]} satirAnahtari={(s) => s.no} />);
    const gizli = (b: string) => container.querySelector(`td[data-baslik="${b}"]`)?.hasAttribute('data-kart-gizli');
    expect([gizli('Ad'), gizli('Tutar'), gizli('Durum'), gizli('Yer'), gizli('Not')]).toEqual([false, false, false, true, true]);
    expect(container.querySelector('td[data-baslik="Durum"]')?.hasAttribute('data-kart-rozet')).toBe(true);
    expect(container.querySelector('td[data-baslik="Ad"]')?.classList.contains('tc-tablo-kart-baslik')).toBe(true);
    expect(container.querySelector('.tc-tablo-kap')?.hasAttribute('data-kompakt')).toBe(true);
  });

  it('hiçbir sütun işaretli değilse ilk üç başlıklı sütun görünür', () => {
    telefonOlsun(true);
    const sutunlar: Sutun<Satir>[] = [
      { anahtar: 'a', baslik: 'A', hucre: () => 'a' }, { anahtar: 'b', baslik: 'B', hucre: () => 'b' },
      { anahtar: 'c', baslik: 'C', hucre: () => 'c' }, { anahtar: 'd', baslik: 'D', hucre: () => 'd' },
    ];
    const { container } = render(<Tablo etiket="K" kip="kayit" sutunlar={sutunlar} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    const gizli = ['A', 'B', 'C', 'D'].map((b) => container.querySelector(`td[data-baslik="${b}"]`)?.hasAttribute('data-kart-gizli'));
    expect(gizli).toEqual([false, false, false, true]);
  });

  it('sabit eylem etkinken kabuğa işaret koyar, etkin değilken koymaz', () => {
    const { container, rerender } = render(<div className="tc-kabuk"><SabitEylem><button type="button">Teslim al</button></SabitEylem></div>);
    expect(screen.getByRole('button', { name: 'Teslim al' }).closest('.tc-sabit-eylem-kutu')).not.toBeNull();
    expect(container.querySelector('.tc-kabuk')?.hasAttribute('data-sabit-eylem')).toBe(true);
    rerender(<div className="tc-kabuk"><SabitEylem etkin={false}><button type="button">Teslim al</button></SabitEylem></div>);
    expect(container.querySelector('.tc-kabuk')?.hasAttribute('data-sabit-eylem')).toBe(false);
    expect(container.querySelector('.tc-sabit-eylem')?.hasAttribute('data-sabit')).toBe(false);
  });

  it('Geri al şeridi 6 sn sonra kapanır', () => {
    vi.useFakeTimers();
    function Deneme() {
      const { bildir } = useBildirim();
      return <button type="button" onClick={() => { bildir('tamam', 'Kabul edildi.', { eylem: { etiket: 'Geri al', yap: vi.fn() }, sure: GERI_AL_SURESI_MS }); }}>Bildir</button>;
    }
    render(<MemoryRouter><BildirimSaglayici><Deneme /></BildirimSaglayici></MemoryRouter>);
    act(() => { screen.getByRole('button', { name: 'Bildir' }).click(); });
    expect(screen.getByRole('button', { name: 'Geri al' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(GERI_AL_SURESI_MS - 100); });
    expect(screen.queryByRole('button', { name: 'Geri al' })).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
  });
});
