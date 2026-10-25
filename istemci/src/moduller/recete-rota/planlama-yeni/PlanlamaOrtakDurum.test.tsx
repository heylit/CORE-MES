import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { PlanlamaEkranOzellikleri } from './gorunumler.ts';
import { YONETICI, ac, sunucuKur } from './test-ortak.tsx';

// Görünümler arası ortak ölçek ve seçim: iki sınama görünümü aynı değerleri okur, biri değiştirince öteki görür.
const Sinama = ({ olcek, olcekSec, kaydir, secim, sec, git }: PlanlamaEkranOzellikleri) => (
  <div>
    <output data-testid="olcek">{`${olcek.olcek} ${olcek.kayma}`}</output>
    <output data-testid="secim">{`${secim.siparis ?? '-'} ${secim.adim ?? '-'} ${secim.tezgah ?? '-'} ${secim.zaman ?? '-'}`}</output>
    <button type="button" onClick={() => { olcekSec('ay'); }}>Ay</button>
    <button type="button" onClick={() => { kaydir(1); }}>İleri</button>
    <button type="button" onClick={() => { kaydir(0); }}>Bugün</button>
    <button type="button" onClick={() => { sec({ siparis: 'S1', zaman: 12 }); }}>Seç</button>
    <button type="button" onClick={() => { sec({ tezgah: 'T1' }); }}>Tezgâh</button>
    <button type="button" onClick={() => { git('studio'); }}>Atölyeye</button>
  </div>
);
vi.mock('./motor/index.tsx', () => ({ PlanlamaMotoru: Sinama, PlanlamaAtolyesi: Sinama }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Görünümler arası ölçek ve seçim', () => {
  it('açılışta Hafta ve boş seçim; ölçek kaymayı sıfırlar, seçim alan alan değişir, görünüm değişince korunur, yazma gitmez', async () => {
    const istekler = sunucuKur(YONETICI);
    ac('/recete-rota/planlama-yeni/plan');
    const olcek = await screen.findByTestId('olcek', {}, { timeout: 10000 });
    expect(olcek.textContent).toBe('hafta 0');
    expect(screen.getByTestId('secim').textContent).toBe('- - - -');
    fireEvent.click(screen.getByRole('button', { name: 'İleri' }));
    fireEvent.click(screen.getByRole('button', { name: 'İleri' }));
    expect(screen.getByTestId('olcek').textContent).toBe('hafta 2');
    fireEvent.click(screen.getByRole('button', { name: 'Ay' }));
    expect(screen.getByTestId('olcek').textContent).toBe('ay 0');
    fireEvent.click(screen.getByRole('button', { name: 'İleri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tezgâh' }));
    expect(screen.getByTestId('secim').textContent).toBe('S1 - T1 12');
    fireEvent.click(screen.getByRole('button', { name: 'Atölyeye' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/recete-rota/planlama-yeni/studio'); });
    expect(screen.getByTestId('olcek').textContent).toBe('ay 1');
    expect(screen.getByTestId('secim').textContent).toBe('S1 - T1 12');
    fireEvent.click(screen.getByRole('button', { name: 'Bugün' }));
    expect(screen.getByTestId('olcek').textContent).toBe('ay 0');
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 20000);
});
