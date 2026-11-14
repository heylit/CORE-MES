import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { durumKur, state } from '../depo.ts';
import { S } from '../parca-durumu.ts';
import type { HamAnaliziCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { KayitYazici } from '../kayit.ts';
import { baglantiKur, CncYetkiBaglami, type CncYetkisi } from '../veri.ts';
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
afterEach(() => { cleanup(); baglantiKur(null); });

// Köprü yalnız ham-analizi isteğini yanıtlar; istekler sayılır.
function analizKopru(cevap: HamAnaliziCevabi): string[] {
  const istekler: string[] = [];
  baglantiKur({ yetki: YETKI, yazici: {} as KayitYazici, isle: (tip) => { istekler.push(tip); return Promise.resolve(cevap); } });
  return istekler;
}
const OLCU: HamAnaliziCevabi = { neden: null, model: { belgeAdi: 'Model kup.step', harf: 'A', revKodu: '02' }, olcu: { a: 120, b: 40, c: 30, hacimMm3: 90000 } };

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

  it('pay virgullu ondalikla yazilir: "0,5" 0,5 mm hesaplanir, 5 mm degil', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Örnek parça' }));
    const pay = screen.getByLabelText('Çap payı (mm / yüz)');
    fireEvent.change(pay, { target: { value: '0.5' } });
    const nokta = S.res?.label;
    fireEvent.change(pay, { target: { value: '5' } });
    const bes = S.res?.label;
    fireEvent.change(pay, { target: { value: '0,5' } });
    expect((pay as HTMLInputElement).value).toBe('0,5');
    expect(S.res?.label).toBe(nokta);
    expect(S.res?.label).not.toBe(bes);
  });

  it('yazma yetkisi yoksa kurulum kartina aktarma gizlidir', () => {
    ac({ ...YETKI, yazabilir: false });
    fireEvent.click(screen.getByRole('button', { name: 'Örnek parça' }));
    expect(screen.queryByRole('button', { name: /Kurulum kartına aktar/ })).toBeNull();
  });

  it('analizden al: model yokken olcu dogrudan forma yazilir, uzun kenar Z olur', async () => {
    const istekler = analizKopru(OLCU);
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Analizden al' }));
    await waitFor(() => { expect(state.stock.mz).toBe(120); });
    expect(istekler).toEqual(['ham-analizi']);
    expect([state.stock.mx, state.stock.my, state.stock.mvol]).toEqual([40, 30, 90]);
    expect(S.res).not.toBeNull();
    expect(screen.getByText(/Ölçü analizden alındı: Model kup.step \(Rev 02\)/)).toBeTruthy();
  });

  it('analizden al: kodsuz modelde kaynak yalniz model adidir, harf yazilmaz (2138-2)', async () => {
    analizKopru({ ...OLCU, model: { ...OLCU.model!, revKodu: null } });
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Analizden al' }));
    await waitFor(() => { expect(state.stock.mz).toBe(120); });
    const ileti = screen.getByText(/Ölçü analizden alındı: Model kup.step/);
    expect(ileti.textContent).not.toMatch(/\(A\)|Rev/);
  });

  it('analizden al: yuklu model onaysiz kaldirilmaz; vazgecince model kalir, onaylaninca olcu gelir', async () => {
    analizKopru(OLCU);
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Örnek parça' }));
    const model = S.P;
    fireEvent.click(screen.getByRole('button', { name: 'Analizden al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));
    expect(S.P).toBe(model);
    expect(state.stock.mz).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Analizden al' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Modeli kaldır ve al' }));
    expect(S.P).toBeNull();
    expect(state.stock.mz).toBe(120);
  });

  it('analiz yoksa nedeni soylenir, form degismez', async () => {
    analizKopru({ neden: 'emir-yok', model: null, olcu: null });
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Analizden al' }));
    expect(await screen.findByText(/Önce Kurulum'da iş emri seçin/)).toBeTruthy();
    expect(state.stock.mz).toBe('');
  });
});
