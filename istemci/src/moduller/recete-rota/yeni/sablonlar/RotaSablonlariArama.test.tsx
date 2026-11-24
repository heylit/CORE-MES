import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Sablon } from '#paylasilan/sozlesme/rota.ts';
import { json, ornekDurum, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* yok */ } });
const BEKLE = { timeout: 4000 };
const sab = (id: number, ad: string, ek: Partial<Sablon>): Sablon => ({
  id, ad, varsayilan: false, surum: 1, aciklama: null, oneriSozcukleri: [], aktif: true, kullanim: { revizyon: 0, son: null },
  adimlar: [{ sira: 1, operasyonTipi: { id: 21, kod: 'TOR', ad: 'Tornalama', aktif: true }, ad: 'Adim bir' }], ...ek,
});
const SABLONLAR = [
  sab(1, 'Alfa', { aciklama: 'ORN kalibrasyonlu' }),
  sab(2, 'Beta', { oneriSozcukleri: ['ORNSOZ'] }),
  sab(3, 'Gama', { adimlar: [{ sira: 1, operasyonTipi: { id: 22, kod: 'FRZKOD', ad: 'Frezeleme', aktif: true }, ad: 'Ozel adim' }] }),
];
const kur = () => {
  const d = ornekDurum();
  d.opdefs = [...(d.opdefs ?? []), { id: '22', code: 'FRZKOD', abbr: 'F', name: 'Frezeleme', group: 'talasli', groupName: 'Talaşlı', stationId: '32', setup: 10, cycle: 2, aktif: true }];
  d.stations = [...(d.stations ?? []), { id: '32', code: 'FZ9', name: 'Freze dokuz', wcId: '41', eff: null, opPer: null, count: 1, cost: null, aktif: true }];
  return sunucuKur(YONETICI, { durum: d, yazmalar: { 'GET /rota/sablonlar': () => json(200, { sablonlar: SABLONLAR }) } });
};
const adlar = (l: HTMLElement) => within(l).queryAllByRole('listitem').filter((x) => x.classList.contains('tc-rs-oge')).map((x) => x.querySelector('.tc-rs-ad')?.textContent);

describe('3627: şablon araması ve panel sırası', () => {
  for (const [q, beklenen] of [
    ['gama', ['Gama']], ['ornsoz', ['Beta']], ['kalibrasyon', ['Alfa']], ['ozel adim', ['Gama']],
    ['frezeleme', ['Gama']], ['freze dokuz', ['Gama']], ['fz9', ['Gama']], ['frzkod', ['Gama']], ['alfa ornsoz', []],
  ] as const) {
    it(`"${q}" -> ${beklenen.join(',') || 'bos'}`, async () => {
      kur();
      rrAc('/recete-rota/rota-sablonlari');
      const liste = await screen.findByRole('list', { name: 'Rota şablonları' }, BEKLE);
      expect(adlar(liste)).toHaveLength(3);
      fireEvent.change(screen.getByLabelText('Ara'), { target: { value: q } });
      await waitFor(() => { expect(adlar(liste)).toEqual([...beklenen]); }, BEKLE);
    });
  }
  it('panelde sola/saga/kaldir sirayi degistirir', async () => {
    kur();
    rrAc('/recete-rota/rota-sablonlari');
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Gama' }, BEKLE));
    const panel = await screen.findByRole('region', { name: 'Gama şablonunu düzenle' }, BEKLE);
    fireEvent.click(within(panel).getByRole('button', { name: 'Tornalama ekle' }));
    const ad = () => within(within(panel).getByRole('list', { name: 'Adımlar' })).getAllByRole('listitem').map((x) => x.querySelector('.tc-rr1-hk-ad')?.textContent);
    expect(ad()).toEqual(['Ozel adim', 'Tornalama']);
    fireEvent.click(within(panel).getByRole('button', { name: 'Ozel adim sağa' }));
    expect(ad()).toEqual(['Tornalama', 'Ozel adim']);
    expect((within(panel).getByRole('button', { name: 'Ozel adim sağa' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'Tornalama kaldır' }));
    expect(ad()).toEqual(['Ozel adim']);
  });
});
