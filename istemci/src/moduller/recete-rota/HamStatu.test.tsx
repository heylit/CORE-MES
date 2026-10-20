import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Statü adımın taşıdığı malzemenindir: HM girerse HM statüsü, karta dönüşmeyen adım boyunca sürer. Veriler uydurmadır.
function depo() {
  const adim = (id: string, seq: number, opId: string, ek: Record<string, unknown> = {}) => ({ id, seq, opId, stationId: 's1', setup: 10, cycle: 4, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, ...ek });
  const urun = (id: string, code: string, name: string, type: string) => ({ id, code, name, type, unit: 'adet', cost: 0, stock: 0, min: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'TR', name: 'Torna', stationId: 's1', setup: 10, cycle: 4 }, { id: 'd2', code: 'OP-2', abbr: 'FR', name: 'Freze', stationId: 's1', setup: 10, cycle: 4 }],
    items: [urun('h1', 'HM-001', 'Deneme çubuk', 'ham'), urun('y1', 'YM-001', 'Deneme ara parça', 'yari'), urun('i1', 'MM-001', 'Deneme mamul', 'mamul')],
    routes: { i1: { base: 1, steps: [
      adim('p1', 10, 'd1', { ins: [{ id: 'g1', itemId: 'h1', qty: 1 }] }),
      adim('p2', 20, 'd2'),
      adim('p3', 30, 'd1', { outItem: 'y1' }),
      adim('p4', 40, 'd2'),
      adim('p5', 50, 'd1'),
    ] } },
    orders: [],
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Rota adımı statüsü taşınan malzemenin', () => {
  it('HM giren adımın çıktısı HM statüsüdür; karta dönüşen adımdan sonra o kartın statüsü; mamulde ara statü kalmaz', async () => {
    sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
    ac('/recete-rota');
    const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
    const belge = await prototipiCalistir(html);
    const calistir = (k: string) => (belge.defaultView as unknown as Pencere).eval(k);
    const kartlar = (id: string) => JSON.parse(String(calistir(`JSON.stringify(withDrafts(() => statusCardsOf("${id}").map(c => cardCode("${id}", c.status) + " " + statusLabel(c.status))))`))) as string[];
    expect(kartlar('h1')).toEqual(['HM-001/OP 10 OP 10 Torna', 'HM-001/OP 20 OP 20 Freze']);
    expect(kartlar('y1')).toEqual(['YM-001/OP 40 OP 40 Freze']);
    expect(kartlar('i1')).toEqual([]);
    expect(calistir('JSON.stringify(withDrafts(() => flowCard(findStep("p1").step, "i1")))')).toBe(JSON.stringify({ itemId: 'h1', status: 'step:p1' }));
  });
});
