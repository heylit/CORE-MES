import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { KaliciEkranlar, useEkranGorunur } from './kalici.tsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('kalıcı ekran', () => {
  it('ilk açılışta kurulur, başka sayfada gizlenir ve silinmez, dönüşte yeniden kurulmaz', () => {
    let kurulum = 0;
    const gorunurluk: boolean[] = [];
    function Agir() {
      const gorunur = useEkranGorunur();
      useEffect(() => { kurulum += 1; }, []);
      gorunurluk.push(gorunur);
      return <p>ağır</p>;
    }
    let git: NavigateFunction = () => undefined;
    function Gezgin() { git = useNavigate(); return null; }
    const ekran = render(
      <MemoryRouter initialEntries={['/baska']}>
        <Gezgin />
        <KaliciEkranlar rotalar={[{ yol: '/agir', ekran: Agir, kalici: true }]} />
      </MemoryRouter>,
    );
    // Ret: hiç açılmamış kalıcı ekran kurulmaz.
    expect(ekran.container.querySelector('.tc-kalici-ekran')).toBeNull();
    act(() => { void git('/agir'); });
    const kutu = () => ekran.container.querySelector('.tc-kalici-ekran');
    expect(kutu()?.hasAttribute('hidden')).toBe(false);
    act(() => { void git('/baska'); });
    expect(kutu()?.hasAttribute('hidden')).toBe(true);
    expect(gorunurluk.at(-1)).toBe(false);
    act(() => { void git('/agir'); });
    expect(kutu()?.hasAttribute('hidden')).toBe(false);
    expect(gorunurluk.at(-1)).toBe(true);
    expect(kurulum).toBe(1);
  });

  it('listeden çıkan (yetkisi düşen ya da kapatılan) ekran kalkar', () => {
    function Agir() { return <p>ağır</p>; }
    const rota = { yol: '/agir', ekran: Agir, kalici: true };
    const ekran = render(<MemoryRouter initialEntries={['/agir']}><KaliciEkranlar rotalar={[rota]} /></MemoryRouter>);
    expect(ekran.container.querySelector('.tc-kalici-ekran')).not.toBeNull();
    ekran.rerender(<MemoryRouter initialEntries={['/agir']}><KaliciEkranlar rotalar={[]} /></MemoryRouter>);
    expect(ekran.container.querySelector('.tc-kalici-ekran')).toBeNull();
  });

  it('ön yükleme: listedeki (görebildiği) her ekranın ön yüklemesi boşta bir kez çağrılır; hata ekranı bozmaz', async () => {
    vi.useFakeTimers();
    function Agir() { return <p>ağır</p>; }
    const yukle = vi.fn(() => Promise.resolve());
    const hatali = vi.fn(() => Promise.reject(new Error('ağ yok')));
    const rotalar = [{ yol: '/agir', ekran: Agir, kalici: true, onYukle: yukle }, { yol: '/hatali', ekran: Agir, kalici: true, onYukle: hatali }];
    const ekran = render(<MemoryRouter initialEntries={['/baska']}><KaliciEkranlar rotalar={rotalar} /></MemoryRouter>);
    expect(yukle).not.toHaveBeenCalled();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(yukle).toHaveBeenCalledTimes(1);
    expect(hatali).toHaveBeenCalledTimes(1);
    // Ön yükleme ekranı kurmaz: açılmamış ekran yine yoktur.
    expect(ekran.container.querySelector('.tc-kalici-ekran')).toBeNull();
    ekran.rerender(<MemoryRouter initialEntries={['/baska']}><KaliciEkranlar rotalar={[...rotalar]} /></MemoryRouter>);
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(yukle).toHaveBeenCalledTimes(1);
  });
});
