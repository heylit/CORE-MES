import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BoxGeometry } from 'three';
import { durumKur, state } from '../depo.ts';
import { S, sSetMesh } from '../parca.ts';
import { CncYetkiBaglami, type CncYetkisi } from '../veri.ts';
import { CS } from './is.ts';
import { OtoCam } from './OtoCam.tsx';

const YETKI: CncYetkisi = {
  kisi: { id: 1, ad: 'Deneme' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false,
};

function ac(yetki = YETKI) {
  render(<MemoryRouter initialEntries={['/cnc-kurulum/yeni/oto-cam']}><CncYetkiBaglami.Provider value={yetki}><OtoCam /></CncYetkiBaglami.Provider></MemoryRouter>);
}
const planSil = (): void => { CS.job = null; CS.lathe = null; CS.mt = null; CS.progs = {}; CS.tlife = null; CS.routes = null; CS.msg = ''; CS.busy = null; };

beforeEach(() => { durumKur(null, null); S.P = null; S.res = null; S.geo = null; S.alt = null; S.name = ''; planSil(); });
afterEach(cleanup);

describe('Oto-CAM görünümü', () => {
  it('parça yokken yükleme yolu gösterilir, üretim kapalıdır', () => {
    ac();
    expect(screen.getByText('Otomatik program')).toBeTruthy();
    expect(screen.getByText(/Parça yüklü değil/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Analiz et ve program üret' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'STEP / STL yükle' })).toBeTruthy();
  });

  it('örnek burç yüklenir, plan üretilir; sonuç ve programlar listelenir', async () => {
    ac();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Örnek burç (boru)' })); });
    await waitFor(() => { expect(S.res?.ok).toBe(true); });
    const uret = await screen.findByRole('button', { name: /üret$/ });
    expect(uret).toHaveProperty('disabled', false);
    act(() => { fireEvent.click(uret); });
    await waitFor(() => { expect(CS.mt || CS.lathe || CS.job).toBeTruthy(); }, { timeout: 60000 });
    await waitFor(() => { expect(screen.getByText(/3 · (Plan|Sonuç)/)).toBeTruthy(); });
    expect(screen.getByText('Süre kalibrasyonu')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Hazırlı/ }).length).toBeGreaterThan(0);
  }, 90000);

  it('bloktan freze: bağlama kartları ve işlem görünürlüğü', async () => {
    ac();
    const g = new BoxGeometry(60, 40, 20).toNonIndexed(), P = new Float32Array(g.attributes['position']!.array), I = new Uint32Array(P.length / 3).map((_v, i) => i);
    g.dispose();
    act(() => { state.stock.type = 'block'; sSetMesh({ P, I, solids: 1 }, 'deneme_blok'); });
    await waitFor(() => { expect(S.res?.ok).toBe(true); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /üret$/ })); });
    await waitFor(() => { expect(CS.job).toBeTruthy(); }, { timeout: 60000 });
    expect((await screen.findAllByText(/^OP10 · /)).length).toBeGreaterThan(1);
    const kutu = screen.getAllByRole('checkbox').find((x) => (x as HTMLInputElement).checked && x.closest('.tc-cc-islemler'))!;
    act(() => { fireEvent.click(kutu); });
    expect((kutu as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/deneme_blok · \d+ bağlama/)).toBeTruthy();
  }, 90000);

  it('yazma yetkisi yoksa hazırlığa aktarma görünmez, kalibrasyon kapalıdır', async () => {
    ac({ ...YETKI, yazabilir: false });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Örnek burç (boru)' })); });
    await waitFor(() => { expect(S.res?.ok).toBe(true); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /üret$/ })); });
    await waitFor(() => { expect(screen.getByText('Süre kalibrasyonu')).toBeTruthy(); }, { timeout: 60000 });
    expect(screen.queryAllByRole('button', { name: /Hazırlı/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveProperty('disabled', true);
  }, 90000);
});
