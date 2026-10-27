import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { state } from '../depo.ts';
import { defaults } from '../durum.ts';
import { dirtyUsage, invKey } from '../secici.ts';
import { allShelves } from './raf.ts';

// WebGL testte yok: sahne ve dokular boş gövdeyle gelir; görünüm testi yalnız düğme ve alanlara bakar.
vi.mock('../sahne/Sahne.tsx', () => ({ Sahne: () => <div data-testid="sahne" /> }));
vi.mock('../sahne/gl.ts', () => ({ thumb: () => null, onbellekSil: () => undefined }));
vi.mock('./raf-sahnesi.ts', () => ({
  LSP: 2.3, LSH: 3.3, renk: () => '',
  RafSahnesi: class { cx = 0; px = 60; mx = 0; my = 0; kur(_r: unknown, _a: unknown, r: number) { return r; } kare() {} etiketleriYenile() {} sec() { return null; } birakHepsi() {} },
}));
vi.mock('./onizleme.ts', () => ({ Onizleme: class { yaw = 0; autoT = 0; surukle = null; goster() {} unut() {} kare() {} birak() {} } }));
vi.mock('../gorunum.ts', () => ({ useTuslar: () => undefined }));
vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));

const yetki = vi.hoisted(() => ({
  deger: { yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false, stokKartiBaglayabilir: false, emirGorebilir: false, saltOnay: false },
}));
const veri = vi.hoisted(() => ({
  stokKartlari: vi.fn(async () => ({ kartlar: [{ malzemeId: 3, kod: 'SF-1', ad: 'Deneme kart' }], toplam: 1 })),
  stokKartiBagla: vi.fn(async () => undefined),
}));
vi.mock('../veri.ts', () => ({ useCncYetkisi: () => yetki.deger, ...veri }));

const { Kutuphane } = await import('./Kutuphane.tsx');

function ac() {
  return render(<MemoryRouter><BildirimSaglayici><Kutuphane /></BildirimSaglayici></MemoryRouter>);
}
function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  dirtyUsage();
}
const ilkAnahtar = (): string => invKey(allShelves().find((s) => s.items.length)!.items[0]!);

afterEach(cleanup);
beforeEach(() => {
  sifirla();
  yetki.deger = { ...yetki.deger, yazabilir: true, stokDusebilir: false, stokKartiBaglayabilir: false };
  veri.stokKartlari.mockClear(); veri.stokKartiBagla.mockClear();
});

describe('Kütüphane yazma düğmeleri', () => {
  it('yazabilen kişi adet, atama ve yeni kalem düğmelerini görür', async () => {
    ac();
    await screen.findByText('Hangi tezgâhta aktif');
    expect(screen.getByRole('button', { name: 'Artır' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeni kalem' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bundan yeni malzeme' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Artır' }));
    expect(state.inv[ilkAnahtar()]!.qty).toBe(1);
  });

  it('yazamayan kişide yazma düğmeleri gizli, alanlar salt okunur', async () => {
    yetki.deger = { ...yetki.deger, yazabilir: false };
    ac();
    await screen.findByText('Hangi tezgâhta aktif');
    expect(screen.queryByRole('button', { name: 'Artır' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Azalt' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni kalem' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bundan yeni malzeme' })).toBeNull();
    expect((screen.getByLabelText('Toplam adet') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Stok CSV' })).toBeTruthy();
  });
});

describe('stok kartı bölümü', () => {
  it('bağlı kalemde adet stoktan gelir: artırma gizli, azaltma yalnız stoktan düşebilende', async () => {
    const key = ilkAnahtar();
    state.inv[key] = { qty: 5, min: 0, loc: '', tmiStok: { malzemeId: 3, kod: 'SF-1', ad: 'Deneme kart' } };
    ac();
    await screen.findByText('Deneme kart');
    expect(screen.queryByRole('button', { name: 'Artır' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Azalt' })).toBeNull();
    cleanup();
    yetki.deger = { ...yetki.deger, stokDusebilir: true };
    ac();
    await screen.findByText('Deneme kart');
    expect(screen.getByRole('button', { name: 'Azalt' })).toBeTruthy();
  });

  it('kartı bağlayabilen kişi arar ve bağlar; bağlayamayan bağsız kalemde bölümü görmez', async () => {
    ac();
    await screen.findByText('Hangi tezgâhta aktif');
    expect(screen.queryByText('Stok kartı')).toBeNull();
    cleanup();
    yetki.deger = { ...yetki.deger, stokKartiBaglayabilir: true };
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Stok kartına bağla' }));
    fireEvent.click(await screen.findByRole('button', { name: /SF-1/ }));
    await waitFor(() => { expect(veri.stokKartiBagla).toHaveBeenCalledWith(ilkAnahtar(), 3); });
  });
});
