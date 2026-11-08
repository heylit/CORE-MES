import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BildirimSaglayici } from '../arayuz/index.ts';
import type { TeknikResimKontrolu } from './TeknikResim.tsx';

// ADR 0032: sunucunun hazır görüntüsü varken terminal sayfayı renklendirmez. PDF ve görüntü uydurmadır.
const p = vi.hoisted(() => ({ renklendir: vi.fn(), ciz: vi.fn() }));
vi.mock('./pdf.ts', () => ({
  pdfAc: async () => ({ numPages: 1, loadingTask: { destroy: async () => {} } }),
  pdfCiz: p.ciz,
  pdfGoruntu: vi.fn(),
  pdfBolge: vi.fn(),
  renklendir: p.renklendir,
  renkAyari: (koyu: boolean, _c: unknown, lo = false) => ({ koyu, look: 'net', bold: 1, lo, renk: [20, 23, 28] }),
}));

const { TeknikResim } = await import('./TeknikResim.tsx');

function sayfa() {
  const W = 40, H = 20, data = new Uint8ClampedArray(W * H * 4).fill(255);
  return { w: W, h: H, img: { data, width: W, height: H }, items: [], pages: 1, scale: 1, junk: false, ms: 1 };
}

const kontrol = (hazirGoruntu: TeknikResimKontrolu['hazirGoruntu'], ad: string): TeknikResimKontrolu => ({
  anahtar: ad, dosyalar: [{ kind: 'pdf', name: `${ad}.pdf`, bytes: new TextEncoder().encode(`%PDF-1.4 ${ad}`) }] as TeknikResimKontrolu['dosyalar'], anaResim: `${ad}.pdf`,
  balonlar: [], balonlarYaz: () => {}, olcumler: {}, olcumlerYaz: () => {}, saltOkunur: true, hazirGoruntu,
});

beforeEach(() => {
  p.renklendir.mockReset().mockResolvedValue(new Blob(['yerel']));
  p.ciz.mockReset().mockImplementation(async () => sayfa());
  URL.createObjectURL = vi.fn(() => 'blob:deneme');
  URL.revokeObjectURL = vi.fn();
});

describe('sunucunun hazır PDF görüntüsü (2339-S)', () => {
  it('hazır görüntü gelirse renklendirme çağrılmaz; istek sayfa ve renk imzasıyla gider', async () => {
    const hazir = vi.fn(async () => new Blob(['sunucu']));
    render(<BildirimSaglayici><TeknikResim kontrol={kontrol(hazir, 'hazir-var')} /></BildirimSaglayici>);
    await waitFor(() => { expect(hazir).toHaveBeenCalled(); });
    await waitFor(() => { expect(URL.createObjectURL).toHaveBeenCalled(); });
    expect(hazir).toHaveBeenCalledWith(expect.anything(), 1, expect.stringMatching(/^r1\.[ak]\.net\.b1\.hi\.14171c$/));
    expect(p.renklendir).not.toHaveBeenCalled();
  });

  it('hazır görüntü yoksa ya da istek düşerse terminal bugünkü gibi kendisi renklendirir', async () => {
    const yok = vi.fn(async () => { throw new Error('ağ yok'); });
    render(<BildirimSaglayici><TeknikResim kontrol={kontrol(yok, 'hazir-yok')} /></BildirimSaglayici>);
    await waitFor(() => { expect(p.renklendir).toHaveBeenCalledTimes(1); });
    expect(yok).toHaveBeenCalled();
  });
});
