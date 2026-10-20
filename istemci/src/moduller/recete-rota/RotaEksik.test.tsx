import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Kart #1372: Terminal adımda neyi tüketip neyi üreteceğini rotadan okur; girdisi ya da çıktısı eksik rota onaya gitmez ve emri plana girmez.
// Veriler uydurmadır.
function depo(ilkGiren: boolean) {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: 's1', setup: 10, cycle: 4, ins: i === 0 && ilkGiren ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outItem: '', outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [1, 2, 3].map((n) => ({ id: `d${n}`, code: `OP-${n}`, abbr: `A${n}`, name: `Adım ${n}`, stationId: 's1', setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim(0), adim(1), adim(2)] } },
    orders: [{ id: 'o1', no: 'UE-2030-001', itemId: 'i1', qty: 10, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }],
  };
}

async function ac2(ilkGiren: boolean) {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(ilkGiren), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown };
  return {
    ifade: <T,>(k: string): T => JSON.parse(String(pencere.eval(`JSON.stringify(${k})`))) as T,
    plan: () => JSON.parse(String(pencere.eval('(function(){ invalidate(); const R = curPlan().orders.o1; return JSON.stringify({blocked:R.blocked, eksik:!!R.rotaEksik, warnings:R.warnings, sched:curPlan().sched.length}); })()'))) as { blocked: boolean; eksik: boolean; warnings: string[]; sched: number },
    calistir: (k: string) => { pencere.eval(k); },
  };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Rotada girdi ve çıktı zorunlu (#1372)', () => {
  it('ilk adımında giren olmayan rotanın emri plana alınmaz, uyarı eksik adımı söyler; giren eklenince planlanır', async () => {
    const e = await ac2(false);
    const p = e.plan();
    expect([p.blocked, p.eksik, p.sched]).toEqual([true, true, 0]);
    expect(p.warnings).toContain('MM-001: rota eksik (OP 10 Adım 1: giren (hammadde ya da yarı mamul) seçilmeli); emir plana alınmadı.');
    e.calistir('st.routes.i1.steps[0].ins = [{id:"g0", itemId:"h0", qty:0.1, scrap:0, status:""}];');
    const q = e.plan();
    expect([q.blocked, q.eksik, q.sched]).toEqual([false, false, 3]);
  }, 40000);

  it('bağımsız adım girensiz, silinmiş karta ya da statüye bağlı çıktı eksiktir; otomatik statülü çıktı ve sonraki bağımlı adım eksik değildir', async () => {
    const e = await ac2(true);
    const eksikler = () => e.ifade<string[]>('rotaEksikleri(st.routes.i1.steps).map(x=>x.metin)');
    expect(eksikler()).toEqual([]);
    e.calistir('st.routes.i1.steps[1].dep = "bagimsiz";');
    expect(eksikler()).toEqual(['OP 20 Adım 2: önceki adımı beklemediği için giren seçilmeli']);
    e.calistir('st.routes.i1.steps[1].dep = "bagimli"; st.routes.i1.steps[0].outItem = "silinmis"; st.routes.i1.steps[1].outStatus = "yok";');
    expect(eksikler()).toEqual(['OP 10 Adım 1: çıktısı silinmiş bir karta bağlı', 'OP 20 Adım 2: çıktısı silinmiş bir statüye bağlı']);
    e.calistir('st.routes.i1.steps[0].outItem = ""; st.routes.i1.steps[1].outStatus = ""; st.routes.i1.steps[0].ins[0].itemId = "silinmis";');
    expect(eksikler()).toEqual(['OP 10 Adım 1: girenlerden biri silinmiş bir karta bağlı']);
  }, 40000);
});
