import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { durumKur, state } from '../depo.ts';
import { allMachines } from '../secici.ts';
import { CncYetkiBaglami, type CncYetkisi } from '../veri.ts';
import { AyarSuresiProfili } from './disari.tsx';

const YETKI: CncYetkisi = {
  kisi: { id: 1, ad: 'Deneme' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: true, saltOnay: false,
};
const profil = () => (state as Record<string, unknown>)['suProf'] as Record<string, Record<string, unknown> | undefined>;

function ac(yetki: CncYetkisi) {
  const yazilan: string[] = [];
  durumKur(null, (_a, metin) => { yazilan.push(metin() ?? ''); });
  render(<CncYetkiBaglami.Provider value={yetki}><AyarSuresiProfili /></CncYetkiBaglami.Provider>);
  return yazilan;
}
afterEach(() => { cleanup(); });

describe('AyarSuresiProfili (Hazırlık süreleri)', () => {
  it('her tezgâh için satır ve aralık çubuğu; profil kutusu kayda yazar, boşaltınca siler; sıfırlama hepsini kaldırır', () => {
    const yazilan = ac(YETKI), M = allMachines(), m0 = M[0]!;
    const govde = () => within(screen.getAllByRole('table')[1]!).getAllByRole('rowgroup')[1]!;
    const kutuAl = (ad: string) => within(within(govde()).getAllByRole('row')[0]!).getByRole('spinbutton', { name: ad });
    expect(within(govde()).getAllByRole('row')).toHaveLength(M.length * 2);
    const kutu = kutuAl('swap');
    fireEvent.change(kutu, { target: { value: '2.4' } }); fireEvent.blur(kutu);
    expect(profil()[String(m0.id)]?.['swap']).toBe(2.4);
    expect(yazilan.length).toBe(1);
    const kutu2 = kutuAl('swap');
    fireEvent.blur(kutu2);
    expect(yazilan.length).toBe(1);
    expect(kutu2).not.toBe(kutu); expect((kutu2 as HTMLInputElement).value).toBe('2.4');
    expect(kutu2.className).toContain('tc-cc-kendi');
    fireEvent.change(kutu2, { target: { value: '' } }); fireEvent.blur(kutu2);
    expect(profil()[String(m0.id)]?.['swap']).toBeUndefined();
    fireEvent.change(kutuAl('kg'), { target: { value: '-3' } }); fireEvent.blur(kutuAl('kg'));
    expect(profil()[String(m0.id)]?.['kg']).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Profilleri varsayılana döndür' }));
    expect(profil()).toEqual({});
  }, 60000);

  it('yazma yetkisi yoksa kutular kilitli, sıfırlama düğmesi gizli', () => {
    const yazilan = ac({ ...YETKI, yazabilir: false });
    expect(screen.queryByRole('button', { name: 'Profilleri varsayılana döndür' })).toBeNull();
    for (const k of screen.getAllByRole('spinbutton')) expect((k as HTMLInputElement).disabled).toBe(true);
    expect(yazilan).toHaveLength(0);
  }, 60000);
});
