import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IslerimSatiri } from '../../../../../../arkon/web/src/data/islerim.ts';
import { IsListesi, type ListeSuzgeci } from './IsListesi.tsx';
import { bosIs } from './kurallar.ts';
import type { Is } from './tipler.ts';

afterEach(cleanup);

// 3550 D: tek iş listesi ve süzgeçleri. Değerler uydurmadır (ORN-).
const is = (no: string, state: Is['state']): Is => ({ ...bosIs({ l: 'Deneme' }), empty: false, no, part: `ORN parça ${no}`, op: 'Op 20', state, target: 10, good: 2 });
const ISLER = [is('ORN-1', 'running'), is('ORN-2', 'queued')];
const sat = (emirId: number, istasyon: string): IslerimSatiri => ({ emirId, emirNo: `ORN-E-${String(emirId)}`, isEmriId: null, opNo: 10, istasyon, istasyonAd: '', mc: 'ORN-M01', makineAd: null, giris: '2026-11-17T08:00:00Z' });
const ortam = { istasyon: 'ORN-TORNA-1', ekrandaki: { emirId: 1, isEmriId: null }, gecilebilir: [] };

const ciz = (suzgec: ListeSuzgeci, liste: IslerimSatiri[], suzgecYaz = vi.fn(), gec = vi.fn()) => render(
  <IsListesi suzgec={suzgec} suzgecYaz={suzgecYaz} benim={{ liste, ortam, gec }}
    istasyonIsleri={{ isler: ISLER, aktif: 0, sec: vi.fn(), siradaki: undefined, onde: null, kartlar: [], kartla: null }} />,
);

describe('Tek iş listesi (3550 D)', () => {
  it('çalışan tek işi ekrandaysa süzgeç çizilmez; istasyonun işleri görünür', () => {
    ciz('benim', [sat(1, 'ORN-TORNA-1')]);
    expect(screen.queryByRole('tab', { name: /Benim işlerim/ })).toBeNull();
    expect(screen.getByText('ORN-1')).toBeTruthy();
  });
  it('ekranda olmayan çalışan iş varsa süzgeç çıkar; Benim işlerim seçilince aynı yerde onların listesi açılır', () => {
    const yaz = vi.fn();
    ciz('istasyon', [sat(1, 'ORN-TORNA-1'), sat(3, 'ORN-FREZE-1')], yaz);
    fireEvent.click(screen.getByRole('tab', { name: /Benim işlerim/ }));
    expect(yaz).toHaveBeenCalledWith('benim');
    cleanup();
    ciz('benim', [sat(1, 'ORN-TORNA-1'), sat(3, 'ORN-FREZE-1')]);
    expect(screen.getByRole('navigation', { name: /Benim işlerim/ })).toBeTruthy();
    expect(screen.queryByText('ORN-1')).toBeNull();
  });
  it('bu istasyondaki işe dokunmak geçiş ister; başka istasyondaki iş yalnız görünür', () => {
    const gec = vi.fn();
    ciz('benim', [sat(2, 'ORN-TORNA-1'), sat(3, 'ORN-FREZE-1')], vi.fn(), gec);
    const dugmeler = screen.getAllByRole('button').filter((b) => b.className.includes('islerim-is'));
    expect(dugmeler).toHaveLength(2);
    expect((dugmeler[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dugmeler[0]!);
    expect(gec).toHaveBeenCalledOnce();
  });
});
