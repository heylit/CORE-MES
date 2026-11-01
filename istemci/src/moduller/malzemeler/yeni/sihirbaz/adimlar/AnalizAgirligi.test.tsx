import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AgirlikOzetiCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { json, sunucuKur, YAZAN, yeniIstemci } from '../../test-ortak.tsx';
import { SihirbazBaglami, type Sihirbaz } from '../baglam.ts';
import { AnalizAgirligi } from './AnalizAgirligi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 1710 (1704 a): net ağırlık 3B analizinden yalnız düğmeyle forma yazılır. Veriler uydurmadır.
const YOL = 'GET /geometri/malzemeler/42/agirlik-ozeti';
const OZET: AgirlikOzetiCevabi = {
  model: { belgeAdi: 'Model braket.step', harf: 'B' }, hacimMm3: 100_000, neden: null,
  kalite: { ad: 'Özel çelik', aile: null, kaliteKodu: null, yogunluk: 7.85 },
};

function ac(o: { tur?: string; yaz?: boolean; no?: number | null; cevap?: AgirlikOzetiCevabi } = {}) {
  const istekler = sunucuKur(YAZAN, { [YOL]: () => json(200, o.cevap ?? OZET) });
  const taslak = { id: 'k1', tur: o.tur ?? 'mamul', g: {} as Record<string, unknown> };
  const yazilanlar: unknown[] = [];
  const s = {
    taslak, kartlar: o.no === null ? [] : [{ kimlik: 'k1', no: o.no ?? 42 }], yetki: { yaz: o.yaz ?? true },
    degistir: (f: (t: typeof taslak) => void) => { f(taslak); yazilanlar.push(taslak.g['net']); },
  } as unknown as Sihirbaz;
  render(<QueryClientProvider client={yeniIstemci()}><SihirbazBaglami.Provider value={s}><AnalizAgirligi /></SihirbazBaglami.Provider></QueryClientProvider>);
  return { istekler, yazilanlar };
}

describe('1710 kartta 3B analizden net ağırlık', () => {
  it('hacim x önerilen kalitenin yoğunluğu gösterilir; yalnız düğmeyle forma yazılır', async () => {
    const { yazilanlar } = ac();
    expect(await screen.findByText('≈ 0,785 kg')).toBeTruthy();
    expect(screen.getByText('100 cm³')).toBeTruthy();
    expect(yazilanlar).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Net ağırlığa yaz/ }));
    expect(yazilanlar).toEqual([0.785]);
  });

  it('yazılan yoğunluk ön değerin yerine geçer', async () => {
    const { yazilanlar } = ac();
    fireEvent.change(await screen.findByLabelText(/Yoğunluk/), { target: { value: '2,7' } });
    fireEvent.blur(screen.getByLabelText(/Yoğunluk/));
    fireEvent.click(await screen.findByRole('button', { name: /Net ağırlığa yaz/ }));
    expect(yazilanlar.at(-1)).toBe(0.27);
  });

  it('kapalı olmayan modelde ağırlık hesaplanmaz, neden söylenir', async () => {
    ac({ cevap: { ...OZET, hacimMm3: null, neden: 'hacim-yok' } });
    expect(await screen.findByText(/kapalı bir katı değil/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Net ağırlığa yaz/ })).toBeNull();
  });

  it('yazma yetkisi yoksa, hammaddede ya da kaydedilmemiş kartta istek gitmez, hiçbir şey görünmez', async () => {
    for (const o of [{ yaz: false }, { tur: 'hammadde' }, { no: null }]) {
      const { istekler } = ac(o);
      await new Promise((r) => { setTimeout(r, 20); });
      expect(istekler.some((i) => i.yol.startsWith('/geometri/'))).toBe(false);
      expect(screen.queryByRole('group', { name: '3B analizden net ağırlık' })).toBeNull();
      cleanup();
    }
  });
});
