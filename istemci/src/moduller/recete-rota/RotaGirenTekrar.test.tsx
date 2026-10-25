import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Test raporu RR1: rota modülü aynı malzemeyi bir adımda iki kez bileşen olarak reddeder; ekran eklemeden önce engeller ve var olan
// gireni seçer. Veriler uydurmadır.
function depo() {
  const urun = (id: string, code: string, name: string, type: string) => ({ id, code, name, type, unit: 'adet', cost: 0, stock: 0, min: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'TR', name: 'Torna', stationId: 's1', setup: 10, cycle: 4 }],
    items: [urun('h1', 'HM-001', 'Deneme çubuk', 'ham'), urun('h2', 'HM-002', 'Deneme boru', 'ham'), urun('i1', 'MM-001', 'Deneme mamul', 'mamul')],
    routes: { i1: { base: 1, steps: [
      { id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, outs: [],
        ins: [{ id: 'g1', itemId: 'h1', qty: 1, scrap: 0, status: '' }] },
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
  const girenler = () => JSON.parse(String(calistir('JSON.stringify(findStep("p1").step.ins.map(x => x.id + ":" + x.itemId))'))) as string[];
  return { belge, calistir, girenler };
}

describe('Rota adımına aynı giren iki kez eklenmez (RR1)', () => {
  it('izinli: başka malzeme giren olarak eklenir', async () => {
    const { calistir, girenler } = await calistirici();
    calistir('ui.sel = { kind: "addIn", stepId: "p1", itemId: "i1" }; addPicked("h2");');
    expect(girenler()).toHaveLength(2);
    expect(girenler()[1]).toMatch(/:h2$/);
  });

  it('reddedilen: aynı malzeme ikinci kez eklenmez, var olan giren seçilir ve neden söylenir', async () => {
    const { belge, calistir, girenler } = await calistirici();
    calistir('ui.sel = { kind: "addIn", stepId: "p1", itemId: "i1" }; addPicked("h1", "step:p1");');
    expect(girenler()).toEqual(['g1:h1']);
    expect(calistir('JSON.stringify([ui.sel.kind, ui.sel.id])')).toBe(JSON.stringify(['in', 'g1']));
    expect(belge.body.textContent).toContain('bu adımda zaten giren');
  });

  it('reddedilen: başka bir gireni var olan malzemeyle değiştirmek de engellenir; kendisiyle değiştirmek serbesttir', async () => {
    const { calistir, girenler } = await calistirici();
    calistir('ui.sel = { kind: "addIn", stepId: "p1", itemId: "i1" }; addPicked("h2");');
    const ikinci = girenler()[1]!.split(':')[0]!;
    calistir(`ui.sel = { kind: "addIn", stepId: "p1", itemId: "i1", replaceId: "${ikinci}" }; addPicked("h1");`);
    expect(girenler()).toEqual(['g1:h1', `${ikinci}:h2`]);
    calistir('ui.sel = { kind: "addIn", stepId: "p1", itemId: "i1", replaceId: "g1" }; addPicked("h1");');
    expect(girenler()).toEqual(['g1:h1', `${ikinci}:h2`]);
  });
});
