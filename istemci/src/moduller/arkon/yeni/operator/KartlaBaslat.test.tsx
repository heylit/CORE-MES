import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { baslatmaKartAlani } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { KartlaBaslat, kartGirdisiCoz } from './KartlaBaslat.tsx';

const kartlar = [{ id: 120, etiket: 'UE-000120-P1' }];
afterEach(cleanup);

describe('3337-2 a: iş refakat kartıyla başlar', () => {
  it('karekod, ekrandaki etiket ya da kart numarası çözülür; başka kod çözülmez', () => {
    expect(kartGirdisiCoz('RP:120', kartlar)).toBe(120);
    expect(kartGirdisiCoz(' ue-000120-p1 ', kartlar)).toBe(120);
    expect(kartGirdisiCoz('45', kartlar)).toBe(45);
    expect(kartGirdisiCoz('LOT:ORN-1', kartlar)).toBeNull();
    expect(kartGirdisiCoz('  ', kartlar)).toBeNull();
  });
  it('başlatma kaydı kartı, yoksa gerekçeyi taşır; ikisi de yoksa alan yazılmaz', () => {
    expect(baslatmaKartAlani({ kart: 7, kartsizGerekce: 'x' })).toEqual({ refakatPartisiId: 7 });
    expect(baslatmaKartAlani({ kart: null, kartsizGerekce: 'Kart basılamadı' })).toEqual({ kartsizGerekce: 'Kart basılamadı' });
    expect(baslatmaKartAlani({ kart: null, kartsizGerekce: ' ' })).toEqual({});
  });
  it('kart yazılınca o kartla başlar, kart listesi yalnız bilgidir; kartsız başlatma yalnız yetkilide görünür', () => {
    const giden: unknown[] = [];
    const ac = (yetkili: boolean) => render(<KartlaBaslat is="ORN-UE-1" kartlar={kartlar} yetkili={yetkili} kartla={(k) => giden.push(k)} kartsiz={(g) => giden.push(g)} kamera={() => {}} kapat={() => {}} />);
    ac(false);
    expect(screen.queryByRole('button', { name: /Kartsız başlat/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Kart/), { target: { value: 'RP:120' } });
    fireEvent.click(screen.getByRole('button', { name: /Kartla başlat/ }));
    expect(screen.queryByRole('button', { name: /UE-000120-P1/ })).toBeNull();
    expect(screen.getByText(/Bu işin kartları: UE-000120-P1/)).toBeTruthy();
    expect(screen.getByText('Kart okutulmadan iş başlamaz.')).toBeTruthy();
    cleanup();
    ac(true);
    const kartsiz = screen.getByRole('button', { name: /Kartsız başlat/ });
    expect((kartsiz as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Kartsız başlatma gerekçesi/), { target: { value: 'Kart basılamadı' } });
    fireEvent.click(kartsiz);
    expect(giden).toEqual([120, 'Kart basılamadı']);
  });
});
