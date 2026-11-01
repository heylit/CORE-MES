import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { OKUYAN, rrAc, sunucuKur } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 1527: dal adımı bir mamul için çarpan kadar parça işler (1257 a); adım süresi şemada ve tabloda çarpanla, sunucunun teorik süresiyle aynı.
// Dal A (çarpan 3) ve dal B aynı istasyonda, ayarsız, 60 dk/parça: A'nın süresi B'ninkinin üç katı. Veriler uydurmadır.
const saat = (metin: string | null | undefined): number => Number((/^([\d,.]+) sa/.exec(metin?.trim() ?? '')?.[1] ?? 'NaN').replace(',', '.'));

describe('1527 adım süresi dal çarpanıyla', () => {
  it('akış şemasında ve akış tablosunda dal adımının süresi çarpanla büyür; çarpansız dal ve ana hat değişmez', async () => {
    const sure = { setup: 0, proc: 60, chg: null, cycle: 60 };
    const adimlar = [
      adimOrnegi({ dal: 'A', adetCarpani: 3, ...sure }),
      adimOrnegi({ id: 'o20', seq: 20, opNo: 20, dal: 'B', ins: [], ...sure }),
      adimOrnegi({ id: 'o30', seq: 30, opNo: 30, birlesen: ['A', 'B'], ins: [], ...sure }),
    ];
    sunucuKur(OKUYAN, { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, adimlar)]) });
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
    const kutu = async (op: number) => (await within(bolge).findByRole('button', { name: `OP ${String(op)} Tornalama` })).querySelector('.tc-rr1-otime')?.textContent;
    const [a, b, m] = [saat(await kutu(10)), saat(await kutu(20)), saat(await kutu(30))];
    expect(b).toBeGreaterThan(0);
    expect([a, m]).toEqual([3 * b, b]);

    fireEvent.click(await within(bolge).findByRole('button', { name: /Akış tablosu/ }));
    const tablo = await within(bolge).findByRole('region', { name: 'MM-0001 rotası' });
    const satir = (op: number) => within(tablo).getByRole('button', { name: `OP ${String(op)} Tornalama` }).parentElement?.querySelector('.tc-rr1-fst')?.textContent;
    const [ta, tb, tm] = [saat(satir(10)), saat(satir(20)), saat(satir(30))];
    expect(tb).toBeGreaterThan(0);
    expect([ta, tm]).toEqual([3 * tb, tb]);
  });
});
