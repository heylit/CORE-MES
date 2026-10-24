import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { state } from '../depo.ts';
import { defaults } from '../durum.ts';
import { allMachines, dirtyUsage } from '../secici.ts';

vi.mock('../sahne/gl.ts', () => ({ onbellekSil: () => undefined }));
vi.mock('../cam/disari.tsx', () => ({ AyarSuresiProfili: () => <p>Ayar süresi profili</p> }));
vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));
const yetki = vi.hoisted(() => ({ yazabilir: true }));
vi.mock('../veri.ts', () => ({ useCncYetkisi: () => yetki }));

const { TanimlarPenceresi } = await import('./TanimlarPenceresi.tsx');

function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  dirtyUsage();
}
afterEach(cleanup);
beforeEach(() => { sifirla(); yetki.yazabilir = true; });

describe('Tanımlar penceresi', () => {
  it('yazabilen kişi yeni tezgâh ekler; tezgâh listede görünür', () => {
    const once = allMachines().length;
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni tezgâh' }));
    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'Deneme freze' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(allMachines().length).toBe(once + 1);
    expect(screen.getAllByText('Deneme freze').length).toBeGreaterThan(0);
  });

  it('yazamayan kişide ekleme, düzenleme ve silme gizli; numara alanı salt okunur', () => {
    yetki.yazabilir = false;
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Yeni tezgâh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    const no = screen.getAllByLabelText(/tezgâh no$/)[0] as HTMLInputElement;
    expect(no.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'İş Malzemeleri' }));
    expect(screen.queryByRole('button', { name: 'Yeni malzeme' })).toBeNull();
  });

  it('özel tezgâh silinmeden önce prototipin metniyle sorulur', () => {
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yeni tezgâh' }));
    fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'Silinecek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(screen.getByText(/“Silinecek” silinsin mi\? Bu tezgâhın kurulum ve atama kayıtları da silinir\./)).toBeTruthy();
    expect(state.customMachines).toHaveLength(1);
  });

  it('Hazırlık süreleri sekmesi Oto-CAM parçasının profilini gösterir', () => {
    render(<TanimlarPenceresi sekme="su" kapat={() => undefined} />);
    expect(screen.getByText('Ayar süresi profili')).toBeTruthy();
  });
});
