import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { durumKur, state } from '../depo.ts';
import { gkodaGonder, SAMPLE_ISO } from '../hesap/gkod.ts';
import { CncYetkiBaglami, type CncYetkisi } from '../veri.ts';
import { GkodSim } from './GkodSim.tsx';
import { GS } from './simulasyon.ts';

const YETKI: CncYetkisi = {
  kisi: { id: 1, ad: 'Deneme' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false,
};

function ac() {
  render(<MemoryRouter initialEntries={['/cnc-kurulum/yeni/simulasyon']}><CncYetkiBaglami.Provider value={YETKI}><GkodSim /></CncYetkiBaglami.Provider></MemoryRouter>);
}

beforeEach(() => { durumKur(null, null); GS.prog = null; GS.playing = false; });
afterEach(cleanup);

describe('G-Kod Sim. gorunumu', () => {
  it('kayitli program yoksa ornek Heidenhain acilir; adimlar dolar', () => {
    ac();
    expect(GS.prog?.name).toBe('ORNEK.H (Heidenhain)');
    expect(screen.getByText('ORNEK.H (Heidenhain)')).toBeTruthy();
    expect(screen.getByText('1. değişim')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Programdaki BLK FORM/ })).toHaveProperty('checked', true);
  });

  it('baska gorunumden gonderilen program acilista yuklenir', () => {
    gkodaGonder(SAMPLE_ISO, 'GONDERILEN');
    ac();
    expect(GS.prog?.name).toBe('GONDERILEN');
    expect((state['gsimText'] as { name: string }).name).toBe('GONDERILEN');
  });

  it('bosluk tusu oynatir ve durdurur; ornek ISO dugmesi programi degistirir', () => {
    ac();
    act(() => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(GS.playing).toBe(true);
    act(() => { fireEvent.keyDown(window, { key: ' ' }); });
    expect(GS.playing).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Örnek ISO' }));
    expect(GS.prog?.name).toBe('O1001 (ISO)');
  });
});
