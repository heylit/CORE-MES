import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AdimPaylariCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// 1979 (2003 c): planda bölünmüş adımın payları terminalde. Adlar uydurmadır.
const veri = vi.hoisted(() => ({ paylar: [] as AdimPaylariCevabi['paylar'], yol: [] as string[] }));
vi.mock('../../../../ortak/veri/api.ts', async (asil) => {
  const a = await asil<Record<string, unknown>>();
  return { ...a, api: { ...(a['api'] as object), get: (yol: string) => { veri.yol.push(yol); return Promise.resolve({ paylar: veri.paylar }); } } };
});
vi.mock('../../../../ortak/veri/oturum.ts', async (asil) => ({ ...(await asil<Record<string, unknown>>()), useOturum: () => ({ data: { id: 8 } }) }));
const { PayCipi } = await import('./Operator.tsx');

afterEach(() => { cleanup(); veri.yol = []; });

describe('terminalin pay çipi (1979)', () => {
  it('kişinin kendi payı önde, aşan fazla; öteki paylar adla, makine payında yalnız adet', async () => {
    veri.paylar = [
      { no: 1, adet: 4, makine: null, kisi: { id: 7, ad: 'Kisi A' }, sayilan: 1, fazla: 0 },
      { no: 2, adet: 2, makine: null, kisi: { id: 8, ad: 'Kisi B' }, sayilan: 3, fazla: 1 },
      { no: 3, adet: 3, makine: { id: 100, ad: 'Tezgah 1' }, kisi: null, sayilan: null, fazla: null },
    ];
    render(<PayCipi emirId={42} isEmriId={5} />);
    expect(await screen.findByText('Payın 2, saydığın 3 (+1 fazla)')).toBeTruthy();
    expect(screen.getByText('Kisi A 1/4 · Tezgah 1 3')).toBeTruthy();
    expect(veri.yol).toEqual(['/adimli-emirler/42/is-emirleri/5/paylar']);
  });
  it('bölünmemiş adımda ya da adım bilinmezken çip çıkmaz', async () => {
    veri.paylar = [];
    render(<PayCipi emirId={42} isEmriId={5} />);
    await Promise.resolve();
    expect(screen.queryByRole('status', { name: 'Plandaki paylar' })).toBeNull();
    cleanup();
    render(<PayCipi emirId={42} isEmriId={null} />);
    expect(veri.yol).toEqual(['/adimli-emirler/42/is-emirleri/5/paylar']);
  });
});
