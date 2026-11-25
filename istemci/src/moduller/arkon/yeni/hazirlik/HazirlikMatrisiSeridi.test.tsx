import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { HazirlikMatrisiSeridi, MADDE_SIRASI } from './HazirlikTakibi.tsx';
import type { HazirlikSatiri } from '../operator/HazirlikListesi.tsx';

afterEach(cleanup);

const satir = (madde: HazirlikMaddesi, hal: HazirlikSatiri['hal'], uyarir = false): HazirlikSatiri => ({ madde, hal, isEmriDuzeyi: false, muafTutulur: false, uyarir, muaf: null });

describe('3688: hazırlık matrisi şeridi', () => {
  it('sıra kaydı madde bilgisindeki bütün maddeleri kapsar; durduranlar önce', () => {
    expect(Object.keys(MADDE_SIRASI).sort()).toEqual(Object.keys(HAZIRLIK_MADDE_BILGISI).sort());
    const sirali = Object.entries(MADDE_SIRASI).sort((a, b) => a[1] - b[1]).map(([m]) => m);
    expect(sirali.slice(0, 3)).toEqual(['cnc', 'cizim', 'yayin']);
    expect(new Set(Object.values(MADDE_SIRASI)).size).toBe(sirali.length);
  });

  it('karışık gelen satırlar sabit sırada çizilir; durumlar adıyla okunur', () => {
    const girdi = [satir('olcu-aleti', 'bilinmiyor'), satir('rota', 'muaf'), satir('cnc', 'eksik'), satir('malzeme', 'gerekmez'), satir('cizim', 'tamam')];
    render(<HazirlikMatrisiSeridi satirlar={girdi} />);
    const g = screen.getByRole('group', { name: /^Hazırlık matrisi: 1 eksik$/ });
    const adlar = within(g).getAllByRole('img').map((e) => e.getAttribute('aria-label'));
    expect(adlar[1]).toMatch(/^Çizim revizyonu/);
    expect(adlar[4]).toMatch(/^Ölçü/i);
    expect(adlar[0]).toMatch(/^CNC kurulumu: Eksik$/);
    expect(adlar.length).toBe(5);
    expect(adlar.some((a) => /Muaf/i.test(a!))).toBe(true);
    expect(adlar.some((a) => /Gerekmez/i.test(a!))).toBe(true);
    expect(adlar.some((a) => /Denetlenmiyor/i.test(a!))).toBe(true);
    expect(g.textContent).toMatch(/Eksik: CNC/);
  });

  it('uyaran madde eksikse uyarı sayılır; kısa adıyla görünür yazılır', () => {
    render(<HazirlikMatrisiSeridi satirlar={[satir('cnc', 'tamam'), satir('takim-omru', 'eksik', true)]} />);
    const g = screen.getByRole('group', { name: /1 uyarı/ });
    expect(g.textContent).toMatch(/Uyarı: /);
  });

  it('hepsi tamamsa özet "hepsi tamam" der ve eksik yazısı çıkmaz', () => {
    render(<HazirlikMatrisiSeridi satirlar={[satir('cnc', 'tamam'), satir('cizim', 'tamam')]} />);
    const g = screen.getByRole('group', { name: 'Hazırlık matrisi: hepsi tamam' });
    expect(g.textContent).not.toMatch(/Eksik|Uyarı/);
  });
});
