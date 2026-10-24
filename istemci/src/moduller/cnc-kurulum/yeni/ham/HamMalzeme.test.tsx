import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { durumKur, state } from '../depo.ts';
import { S } from '../parca-durumu.ts';
import { CncYetkiBaglami, type CncYetkisi } from '../veri.ts';
import { HamMalzeme } from './HamMalzeme.tsx';

const YETKI: CncYetkisi = {
  kisi: { id: 1, ad: 'Deneme' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false,
};

function ac(yetki: CncYetkisi = YETKI) {
  render(<MemoryRouter initialEntries={['/cnc-kurulum/yeni/hammadde']}><CncYetkiBaglami.Provider value={yetki}><HamMalzeme /></CncYetkiBaglami.Provider></MemoryRouter>);
}

beforeEach(() => {
  durumKur(null, null);
  Object.assign(S, { P: null, I: null, name: '', bodies: null, res: null, alt: null, geo: null, msg: '', busy: null });
  S.q.identity();
});
afterEach(cleanup);

describe('Ham Malzeme gorunumu', () => {
  it('model yokken bilgi ve not gorunur', () => {
    ac();
    expect(screen.getByText('Model yok')).toBeTruthy();
    expect(screen.getByText(/STEP \/ STL yükleyin/)).toBeTruthy();
  });

  it('ornek parca hesaplanir; kurulum kartina aktarilir', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Örnek parça' }));
    expect(screen.getAllByText('Örnek: flanşlı mil (Ø80 × 120)').length).toBeGreaterThan(0);
    expect(S.res?.type).toBe('bar');
    fireEvent.click(screen.getByRole('button', { name: /Kurulum kartına aktar/ }));
    expect(state.meta.stock).toContain(S.res!.label);
    expect(screen.getByText(/Kurulum kartına yazıldı/)).toBeTruthy();
  });

  it('yazma yetkisi yoksa kurulum kartina aktarma gizlidir', () => {
    ac({ ...YETKI, yazabilir: false });
    fireEvent.click(screen.getByRole('button', { name: 'Örnek parça' }));
    expect(screen.queryByRole('button', { name: /Kurulum kartına aktar/ })).toBeNull();
  });
});
