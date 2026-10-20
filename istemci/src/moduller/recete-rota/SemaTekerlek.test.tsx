import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// 290 b: şemada tekerlek her zaman imlecin yerine yakınlaştırır. Windows ekran ölçeğinde fare tekerleğinin adımı kesirli,
// dokunmatik yüzeyin adımı küçük gelir; ikisi de şemayı kaydırmaz. Veriler uydurmadır.
function depo() {
  const adim = { id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, ins: [HAM_GIRDISI], outs: [], dep: 'bagimli', depQty: 1, outItem: '', outStatus: '', rejectPct: 0 };
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'A1', name: 'Adım 1', stationId: 's1', setup: 10, cycle: 4 }],
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim] } },
    settings: { orderItem: 'i1', orderQty: 10, start: '2030-03-04', due: '2030-03-29' },
  };
}

async function sema() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota/schema');
  const html = (await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '';
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown; WheelEvent: typeof WheelEvent };
  pencere.eval('ui.root = "i1"; ui.tab = "schema"; ui.schMode = "flow"; render(); ui.zoom = 1; ui.pan = {x: 0, y: 0};');
  const vp = belge.querySelector('#vp');
  if (!vp) throw new Error('şema alanı çizilmedi');
  return {
    tekerlek: (deltaY: number, deltaMode = 0) => {
      vp.dispatchEvent(new pencere.WheelEvent('wheel', { deltaY, deltaMode, bubbles: true, cancelable: true }));
      return { zoom: Number(pencere.eval('ui.zoom')) };
    },
    sifirla: () => { pencere.eval('ui.zoom = 1; ui.pan = {x: 0, y: 0};'); },
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Şema tekerleği (290 b)', () => {
  it('kesirli ya da küçük adımlı tekerlek de yakınlaştırır, şemayı kaydırmaz; geri tekerlek uzaklaştırır', async () => {
    const s = await sema();
    for (const adim of [-66.6667, -30, -100]) {
      s.sifirla();
      const sonra = s.tekerlek(adim);
      expect(sonra.zoom, `adım ${String(adim)}`).toBeGreaterThan(1);
    }
    s.sifirla();
    expect(s.tekerlek(30).zoom).toBeLessThan(1);
    s.sifirla();
    expect(s.tekerlek(-3, 1).zoom).toBeGreaterThan(1);
  }, 40000);
});
