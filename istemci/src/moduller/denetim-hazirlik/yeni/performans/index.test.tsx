import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ornekProfil } from '../kurallar/profil.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { Performans } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const dolu = (): Depo => {
  const d = ornekDepo();
  d.data[d.active] = ornekProfil();
  return d;
};

describe('Performans', () => {
  it('veri yoksa boş durum; yazar iç denetim kaydı ekleyebilir, okuyucu ekleyemez', async () => {
    sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<Performans />, 'perf');
    expect(await screen.findByText('Henüz karşılaştırılacak değerlendirme yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'İç denetim kaydı ekle' }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByLabelText(/Denetim türü/) as HTMLSelectElement).value).toMatch(/İç denetim/);
    cleanup();
    sahteSunucu({ depo: ornekDepo(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Performans />, 'perf');
    await screen.findByText('Henüz karşılaştırılacak değerlendirme yok');
    expect(screen.queryByRole('button', { name: 'İç denetim kaydı ekle' })).toBeNull();
  });

  it('grafik, madde matrisi ve değerlendirme listesi; süzgeç ve EYDEP matrisi', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<Performans />, 'perf');
    expect(await screen.findByRole('img', { name: /ortak zaman grafiği/ })).toBeTruthy();
    const matris = screen.getByRole('table', { name: 'Madde bazında karşılaştırma' });
    expect(within(matris).getAllByRole('row')).toHaveLength(8);
    expect(screen.getAllByRole('button', { name: 'Sonucu düzenle' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Öz değerlendirme' }));
    expect(screen.queryAllByRole('button', { name: 'Aç' })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'EYDEP alanları' }));
    expect(within(screen.getByRole('table', { name: 'Madde bazında karşılaştırma' })).getByText('EYDEP resmi')).toBeTruthy();
  });

  it('okuyucuda sonuç düzenleme yok', async () => {
    sahteSunucu({ depo: dolu(), yazabilir: false, yonetici: false });
    await baglamlaAc(<Performans />, 'perf');
    await screen.findByRole('img', { name: /ortak zaman grafiği/ });
    expect(screen.queryByRole('button', { name: 'Sonucu düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İç denetim kaydı ekle' })).toBeNull();
  });
});
