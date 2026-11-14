import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as planaAl from './plana-al.ts';
import { AdimAdim } from './AdimAdim.tsx';
import { adimSecimleri, baslamaSaatleri, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma örnek: üç adımlı plansız emir; ikinci adımın iki aday tezgâhı var, üçüncü adım fason.
const E: KokpitEmri = {
  id: 'a', no: 'ORN-a', urun: 'Deneme', adet: 1, termin: 30, bitis: null, durum: 'plansiz', gecikme: null,
  adimlar: [{ id: 'a.1', ad: 'Torna', adaylar: ['T1', 'T2'] }, { id: 'a.2', ad: 'Freze', adaylar: ['T2', 'T3'] }, { id: 'a.3', ad: 'Kaplama', adaylar: ['@F'] }],
};
const M: KokpitModeli = {
  simdi: 9, tezgahlar: ['T1', 'T2', 'T3'].map((id) => ({ id, kod: `K-${id}`, ad: '', fason: false })), isler: {}, emirler: [E], bas: 0, son: 336, acik: {}, durus: {},
};
const zaman = (t: number): string => `00.00 ${String(t)}`;
type Istek = Parameters<typeof planaAl.planaAlOnizle>[0];
// T1 ilk adımı 10-12'de, T2 14-16'da yapar; ikinci adım seçilen tezgâhta ilk adımın arkasına oturur.
function onizlemeKur(red: string | null = null) {
  return vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g: Istek) => {
    if (red !== null && g.adimlar?.some((a) => a.tezgah === 'T3')) return Promise.resolve({ calismaSurumu: 4, gecerli: false, ileti: red, isler: [], bitis: null });
    const S = Math.max(g.baslangic, g.tezgah === 'T1' ? 10 : 14), s2 = g.adimlar?.find((a) => a.isId === 'a.2');
    const S2 = Math.max(S + 2, s2?.baslangic ?? 0);
    return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: S2 + 3, isler: [{ isId: 'a.1', tezgah: g.tezgah, S, C: S + 2 }, { isId: 'a.2', tezgah: s2?.tezgah ?? 'T2', S: S2, C: S2 + 3 }] });
  });
}

describe('AdimAdim (3229 a)', () => {
  it('seçim yokken ilk adımın adaylarını dener, emri en erken bitireni gösterir; rota dışı tezgâh düğmesi yoktur', async () => {
    const oz = onizlemeKur(), uygula = vi.fn();
    render(<AdimAdim m={M} e={E} zaman={zaman} uygula={uygula} surum={4} />);
    expect(await screen.findByText(/Biter 15 · termine yetişir/)).toBeTruthy();
    expect(oz).toHaveBeenCalledTimes(2);
    expect(oz.mock.calls[0]?.[0]).toEqual({ emirId: 'a', tezgah: 'T1', baslangic: 9 });
    const iki = screen.getByRole('group', { name: '2. adımın tezgâhı' });
    expect(within(iki).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sistem seçsin', 'K-T2', 'K-T3']);
    expect(screen.getByText(/Fason adım; sistem yerleştirir/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: '3. adımın tezgâhı' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Plana al' }));
    expect(uygula).toHaveBeenCalledWith({ isId: 'a.1', tezgah: 'T1', baslangic: 9, planaAl: 'a' }, false);
  });

  it('seçilen tezgâh ve saat önizlemeye ve komuta gider; terminden sonra biterse onay istenir; "Hepsini sistem seçsin" seçimi siler', async () => {
    const oz = onizlemeKur(), uygula = vi.fn();
    render(<AdimAdim m={M} e={E} zaman={zaman} uygula={uygula} surum={4} />);
    await screen.findByText(/Biter 15/);
    fireEvent.click(within(screen.getByRole('group', { name: '2. adımın tezgâhı' })).getByRole('button', { name: 'K-T3' }));
    fireEvent.change(screen.getByLabelText('2. adımın başlama saati'), { target: { value: '30' } });
    expect(await screen.findByText(/Biter 33 · termini 3 sa geçer/)).toBeTruthy();
    expect(oz.mock.calls.at(-1)?.[0]).toMatchObject({ adimlar: [{ isId: 'a.2', tezgah: 'T3', baslangic: 30 }] });
    expect(document.querySelector('[data-adim="a.2"] [data-sonuc]')?.textContent).toMatch(/^K-T3 30 – .*33 tezgâhı ve saati siz seçtiniz/);
    fireEvent.click(screen.getByRole('button', { name: 'Plana al' }));
    expect(uygula).toHaveBeenCalledWith({ isId: 'a.1', tezgah: 'T1', baslangic: 9, planaAl: 'a', adimlar: [{ isId: 'a.2', tezgah: 'T3', baslangic: 30 }] }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini sistem seçsin' }));
    expect(await screen.findByText(/Biter 15/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hepsini sistem seçsin' })).toBeNull();
  });

  it('adımdaki "Sistem seçsin" yalnız o adımın tezgâh seçimini kaldırır: saat kalır, ikisi de boşsa adım önizlemeden düşer', async () => {
    const oz = onizlemeKur();
    render(<AdimAdim m={M} e={E} zaman={zaman} uygula={vi.fn()} surum={4} />);
    await screen.findByText(/Biter 15/);
    const iki = within(screen.getByRole('group', { name: '2. adımın tezgâhı' }));
    fireEvent.click(iki.getByRole('button', { name: 'K-T3' }));
    fireEvent.change(screen.getByLabelText('2. adımın başlama saati'), { target: { value: '30' } });
    await screen.findByText(/Biter 33/);
    fireEvent.click(iki.getByRole('button', { name: 'Sistem seçsin' }));
    await waitFor(() => { expect(oz.mock.calls.at(-1)?.[0].adimlar).toEqual([{ isId: 'a.2', baslangic: 30 }]); });
    expect(iki.getByRole('button', { name: 'Sistem seçsin' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByLabelText('2. adımın başlama saati'), { target: { value: '' } });
    await waitFor(() => { expect(oz.mock.calls.at(-1)?.[0]).toEqual({ emirId: 'a', tezgah: 'T2', baslangic: 9 }); });
    expect(document.querySelector('[data-adim="a.2"] [data-sonuc]')?.textContent).toMatch(/sistem seçti/);
  });

  it('sunucu seçimi reddederse neden yazılır ve "Plana al" kapanır', async () => {
    onizlemeKur('K-T3 bu emrin 2. adımını yapamaz.');
    render(<AdimAdim m={M} e={E} zaman={zaman} uygula={vi.fn()} surum={4} />);
    await screen.findByText(/Biter 15/);
    fireEvent.click(within(screen.getByRole('group', { name: '2. adımın tezgâhı' })).getByRole('button', { name: 'K-T3' }));
    expect(await screen.findByText('K-T3 bu emrin 2. adımını yapamaz.')).toBeTruthy();
    await waitFor(() => { expect((screen.getByRole('button', { name: 'Plana al' }) as HTMLButtonElement).disabled).toBe(true); });
  });

  it('kurallar: ilk adımın seçimi listeye girmez, boş seçim gitmez; saat seçenekleri geçmişi içermez', () => {
    expect(adimSecimleri(E, { 'a.1': { tezgah: 'T2' }, 'a.2': { baslangic: 12 }, 'a.3': {}, 'x.9': { tezgah: 'T1' } })).toEqual([{ isId: 'a.2', baslangic: 12 }]);
    const s = baslamaSaatleri({ bas: 0, simdi: 9 }, 2);
    expect(s[0]).toBe(10);
    expect(s.at(-1)).toBe(46);
    expect(s.every((t) => t >= 9)).toBe(true);
  });
});
