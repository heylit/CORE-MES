import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Soru 520 (1 a), test raporu RR2: ilk adımın ara kartı hammaddenin statülü kartıdır (HM-001/OP 10) ama emrin adediyle sayılır;
// birimi hammaddenin birimi (kg) değil adettir. Tanımlı statü ve normal stok malzemenin birimini korur. Veriler uydurmadır.
function depo() {
  const urun = (id: string, code: string, name: string, type: string, unit = 'adet') => ({ id, code, name, type, unit, cost: 0, stock: 0, min: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'TR', name: 'Torna', stationId: 's1', setup: 10, cycle: 4 }],
    items: [urun('h1', 'HM-001', 'Deneme çubuk', 'ham', 'kg'), urun('i1', 'MM-001', 'Deneme mamul', 'mamul')],
    routes: { i1: { base: 1, steps: [
      { id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, outs: [],
        ins: [{ id: 'g1', itemId: 'h1', qty: 1, scrap: 0, status: '' }] },
      { id: 'p2', seq: 20, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, outs: [], ins: [] },
    ] } },
    orders: [],
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

async function calistirici() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const calistir = (k: string) => (belge.defaultView as unknown as Pencere).eval(k);
  return { calistir };
}

describe('Ara statülü kartın birimi adettir (520 1 a)', () => {
  it('rota adımının ara kartı adet, hammaddenin kendisi ve tanımlı statüsü kg kalır', async () => {
    const { calistir } = await calistirici();
    const sonuc = JSON.parse(String(calistir(`JSON.stringify(withDrafts(() => {
      const fc = flowCard(findStep("p1").step, "i1");
      const cip = chipHTML({ kind: "flowout", itemId: fc.itemId, reqStatus: fc.status, qty: 40, stepId: "p1", owner: "i1" });
      return { fc, ara: cardUnit("h1", fc.status), ham: cardUnit("h1", ""), tanimli: cardUnit("h1", "krn"), cip: /<span class="cq">([^<]*)<small>([^<]*)</.exec(cip).slice(1) };
    }))`))) as { fc: { itemId: string; status: string }; ara: string; ham: string; tanimli: string; cip: string[] };
    expect(sonuc.fc).toEqual({ itemId: 'h1', status: 'step:p1' });
    expect(sonuc.ara).toBe('adet');
    expect(sonuc.ham).toBe('kg');
    expect(sonuc.tanimli).toBe('kg');
    expect(sonuc.cip).toEqual(['40', 'adet']);
  });
});
