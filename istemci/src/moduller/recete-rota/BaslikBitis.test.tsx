import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Akış A provası D8: şema başlığındaki deneme hesabı ("Bitiş ..."). Planlanamayan adımı olan ürünün bitişi anlamsızdır; gecikme
// teslim gününe göre sayılır, eksi gün "geç" yazılmaz. Veriler uydurmadır.
function depo() {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: 's1', setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outItem: '', outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [1, 2].map((n) => ({ id: `d${n}`, code: `OP-${n}`, abbr: `A${n}`, name: `Adım ${n}`, stationId: 's1', setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim(0), adim(1)] } },
    settings: { orderItem: 'i1', orderQty: 10, start: '2030-03-04', due: '2030-03-29' },
  };
}

async function baslik() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown };
  return (k: string): string => {
    pencere.eval(`${k}; st.settings.orderItem = "i1"; simCache = null; invalidate();`);
    const d = belge.createElement('div');
    d.innerHTML = String(pencere.eval('runStrip()'));
    return (d.querySelector('span')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Şema başlığında bitiş (D8)', () => {
  it('istasyonu ya da girdisi eksik ürün "Planlanamıyor" der, eksi gün geç yazmaz; tam rota zamanında, geç teslim artı gün geç', async () => {
    const yazi = await baslik();
    expect(yazi('')).toMatch(/^Bitiş \d\d\.\d\d\.2030 zamanında$/);
    // Ürün ilk seçildiğinde: adımların istasyonu henüz yok.
    const istasyonsuz = yazi('st.routes.i1.steps.forEach(s => { s.stationId = null; })');
    expect(istasyonsuz).toBe('Bitiş Planlanamıyor 2 adımın makinesi ya da vardiyası yok');
    const girdisiz = yazi('st.routes.i1.steps.forEach(s => { s.stationId = "s1"; }); st.routes.i1.steps[0].ins = []');
    expect(girdisiz).toBe('Bitiş Planlanamıyor Rotada girdi ya da çıktı eksik');
    // Teslim başlangıçla aynı gün: iş sığmaz, gecikme artıdır.
    const gec = yazi('st.routes.i1.steps[0].ins = [{id:"g0", itemId:"h0", qty:0.1, scrap:0, status:""}]; st.settings.orderQty = 2000; st.settings.due = "2030-03-04"');
    expect(gec).toMatch(/^Bitiş \d\d\.\d\d\.2030 \d+(,\d)? g geç$/);
  }, 40000);
});
