import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Rota şemasında çöp kutusu, geri al sayacı ve soldaki adım ekleme paneli. Veriler uydurmadır.
function depo() {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${i + 1}`, setup: 10, cycle: 4, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 2, 3].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    machines: [],
    people: [],
    opdefs: [
      { id: 'd1', code: 'OP-1', abbr: 'TR', name: 'Tornalama', stationId: 's1', setup: 10, cycle: 4, group: 'talasli', groupName: 'Talaşlı imalat' },
      { id: 'd2', code: 'OP-2', abbr: 'FR', name: 'Frezeleme', stationId: 's2', setup: 10, cycle: 4, group: 'talasli', groupName: 'Talaşlı imalat' },
      { id: 'd3', code: 'OP-3', abbr: 'KK', name: 'Son kontrol', stationId: 's3', setup: 0, cycle: 2, group: 'kalite', groupName: 'Kalite' },
    ],
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }],
    routes: { i1: { base: 1, steps: [adim(0), adim(1)] } },
    orders: [],
    settings: { orderItem: 'i1' },
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const calistir = (k: string) => pencere.eval(k);
  calistir('act("tab", {tab:"schema"}); ui.root = "i1"; render()');
  // rota düzenlemeleri taslak revizyona yazılır; yoksa yürürlükteki rota okunur
  const adimlar = () => JSON.parse(String(calistir('JSON.stringify(withDrafts(() => stepsOf("i1").map(s => s.opId + ":" + s.seq)))'))) as string[];
  return { belge, calistir, adimlar };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Rota şemasında çöp kutusu ve adım ekleme paneli', () => {
  it('çöpe atılan adım silinir, geri al sayacı 5 saniyeden başlar ve geri al adımı yerine koyar', async () => {
    const { belge, calistir, adimlar } = await ekranAc();
    expect(belge.querySelector('[data-cop]')).not.toBeNull();
    calistir('adimCopeAt("p1", "i1")');
    expect(adimlar()).toEqual(['d2:10']);
    const bant = belge.querySelector('#copGeri');
    expect(bant?.textContent).toContain('OP 10 Tornalama silindi.');
    expect(belge.querySelector('#copSn')?.textContent).toBe('5');
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="copGeriAl"]')!);
    expect(adimlar()).toEqual(['d1:10', 'd2:20']);
    expect(belge.querySelector('#copGeri')).toBeNull();
  });

  it('süre dolunca geri al bandı kalkar, adım silinmiş kalır', async () => {
    const { belge, calistir, adimlar } = await ekranAc();
    calistir('adimCopeAt("p2", "i1"); ui.copGeri.kalan = 1');
    await vi.waitFor(() => { expect(belge.querySelector('#copGeri')).toBeNull(); }, { timeout: 3000 });
    expect(calistir('ui.copGeri')).toBeNull();
    expect(adimlar()).toEqual(['d1:10']);
  });

  it('silinen adımın statüsü "rotadan kalktı" diye görünür', async () => {
    const { calistir } = await ekranAc();
    calistir('adimCopeAt("p1", "i1")');
    expect(calistir('withDrafts(() => statusLabel("step:p1"))')).toBe('rotadan kalktı');
  });

  it('panel operasyonları kategoriye göre gruplar; tıklanan operasyon rotanın sonuna eklenir', async () => {
    const { belge, adimlar } = await ekranAc();
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="adimPaneli"]')!);
    const panel = belge.querySelector('#adimPaneli');
    expect(panel).not.toBeNull();
    const basliklar = Array.from(panel!.querySelectorAll('section')).map((s) => s.querySelector('h4')?.textContent?.trim());
    expect(basliklar.join(' ')).toContain('Talaşlı imalat');
    expect(basliklar.join(' ')).toContain('Kalite');
    fireEvent.click(belge.querySelector<HTMLButtonElement>('#adimPaneli [data-act="apEkle"][data-id="d3"]')!);
    expect(adimlar()).toEqual(['d1:10', 'd2:20', 'd3:30']);
  });
});
