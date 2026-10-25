import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';

// T5: istasyonda iş yokken sayaç hedef uydurmaz ve iş düğmeleri basılamaz. Gerçek bileşenler; yalnız veri kaynağı sahte.
vi.mock('../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: async () => null, all: async () => [] }, Auth: { current: () => null }, Log: { on: () => () => {}, query: async () => [] }, Bus: { on: () => () => {} } },
}));
vi.mock('../../../../arkon/web/src/app/baslat.ts', () => ({ Brand: () => null }));

interface Bilesenler { Dial: ComponentType<Record<string, unknown>>; Orbs: ComponentType<Record<string, unknown>> }
let b: Bilesenler;
let bosIs: (m?: string) => Record<string, unknown>;
// Yol değişkenle kurulur: Arkon ekran dosyaları istemcinin sıkı tip denetimine girmez (vardiya-rapor.test.ts ile aynı).
const yol = (ad: string) => `../../../../arkon/web/src/app/${ad}.ts`;
beforeAll(async () => {
  b = (await import(/* @vite-ignore */ yol('bilesenler'))) as Bilesenler;
  bosIs = ((await import(/* @vite-ignore */ yol('istasyonlar'))) as { EMPTY_ORDER: (m?: string) => Record<string, unknown> }).EMPTY_ORDER;
});
afterEach(cleanup);

describe('Üretim Terminali: iş olmayan istasyon (T5)', () => {
  it('reddedilen: iş yokken sayaç "0 / 1 · 1 kaldı" demez, hedef ve kalan "—"; iş düğmeleri kapalı ve basılınca eylem çalışmaz', () => {
    const o = bosIs('ST-1');
    expect(o['target']).toBe(0);
    const kadran = render(createElement(b.Dial, { o, onEdit: () => {} }));
    expect(kadran.container.querySelector('.of')?.textContent).toBe('/ — adet');
    expect(kadran.container.querySelector('.pct')?.textContent).toBe('—');
    expect(kadran.container.textContent).not.toMatch(/kaldı/);
    cleanup();
    const act = vi.fn();
    const dugmeler = render(createElement(b.Orbs, { state: 'queued', act, disabled: true }));
    const liste = [...dugmeler.container.querySelectorAll('button')];
    expect(liste.map((d) => d.textContent?.replace(/\s+/g, ' ').trim().split(' ')[0])).toEqual(['Hazırlık', 'İşi', 'Resim']);
    expect(liste.every((d) => d.disabled)).toBe(true);
    for (const d of liste) d.click();
    expect(act).not.toHaveBeenCalled();
  });

  it('izinli: atanmış işte hedef ve kalan işten gelir, İşi Başlat basılabilir', () => {
    const o = { no: 'E-1', state: 'queued', good: 0, scrap: 0, target: 40, cycle: 60 };
    const kadran = render(createElement(b.Dial, { o, onEdit: () => {} }));
    expect(kadran.container.querySelector('.of')?.textContent).toBe('/ 40 adet');
    expect(kadran.container.querySelector('.pct')?.textContent).toBe('%0 · 40 kaldı');
    cleanup();
    // 521 2 b: hurda halkada görünür ama ilerlemeye ve kalana girmez (38 iyi 2 hurda: %95, 2 kaldı).
    const sayilan = render(createElement(b.Dial, { o: { ...o, state: 'running', good: 38, scrap: 2 }, onEdit: () => {} }));
    expect(sayilan.container.querySelector('.pct')?.textContent).toBe('%95 · 2 kaldı');
    expect(sayilan.container.querySelector('circle.scr')).not.toBeNull();
    cleanup();
    const act = vi.fn();
    const dugmeler = render(createElement(b.Orbs, { state: 'queued', act }));
    const baslat = [...dugmeler.container.querySelectorAll('button')].find((d) => d.textContent?.includes('İşi Başlat'));
    expect(baslat?.disabled).toBe(false);
    baslat?.click();
    expect(act).toHaveBeenCalledWith('start');
  });
});
