import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Rota adımında isteğe bağlı makine seçimi. Veriler uydurmadır.
function depo(adimaMakine?: string, ek: Record<string, unknown> = {}) {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${i + 1}`, setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0, ...(i === 0 && adimaMakine ? { machineId: adimaMakine } : {}), ...(i === 0 ? ek : {}) });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 2].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    machines: [
      { id: 'm1', code: 'MK-1', name: 'Deneme tezgah', stationId: 's1', status: 'aktif' },
      { id: 'm2', code: 'MK-2', name: 'Deneme tezgah 2', stationId: 's1', status: 'aktif' },
      { id: 'm3', code: 'MK-3', name: 'Bakımdaki tezgah', stationId: 's1', status: 'bakim' },
      { id: 'm4', code: 'MK-4', name: 'Öteki istasyon tezgahı', stationId: 's2', status: 'aktif' },
    ],
    people: [],
    opdefs: [1, 2].map((n) => ({ id: `d${n}`, code: `OP-${n}`, abbr: `A${n}`, name: `Adım ${n}`, stationId: `s${n}`, setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [adim(0), adim(1)] } },
    orders: [{ id: 'o1', no: 'UE-2030-001', itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }],
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc(adimaMakine?: string, ek: Record<string, unknown> = {}) {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(adimaMakine, ek), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const calistir = (k: string) => pencere.eval(k);
  const secenekler = (s: HTMLSelectElement) => Array.from(s.options).map((o) => o.textContent?.trim());
  const yerlesim = () => {
    calistir('act("tab", {tab:"schema"})');
    calistir('ui.schMode = "table"; ui.sel = {kind:"step", id:"p1", itemId:"i1", nid:"root", qty:50}; render()');
  };
  const plan = () => JSON.parse(String(calistir('JSON.stringify(curPlan().sched.filter(e=>e.stepId==="p1").map(e=>({res:e.resId, forced:e.forced, stepPin:e.stepPin})))'))) as Array<{ res: string; forced: boolean; stepPin: boolean }>;
  // rota düzenlemeleri taslak revizyona yazılır; yoksa yürürlükteki rota okunur
  const adimMakine = () => calistir('(function(){ const d = openDrafts().i1; return (d ? d.data : st.routes.i1).steps[0].machineId; })()');
  return { belge, calistir, secenekler, yerlesim, plan, adimMakine };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Rota adımında makine seçimi', () => {
  it('seçici rota tablosunda, akış tablosunda ve adım panelinde; seçenekler yalnız istasyonun aktif makineleri', async () => {
    const { belge, calistir, secenekler, yerlesim } = await ekranAc();
    yerlesim();
    const rota = belge.createElement('div');
    rota.innerHTML = String(calistir('routeTables("i1")'));
    const rotaSecici = rota.querySelectorAll<HTMLSelectElement>('table.rt select[aria-label="Makine"]');
    expect(rotaSecici.length).toBe(2);
    expect(secenekler(rotaSecici[0]!)).toEqual(['Planlayıcı seçer', 'MK-1 Deneme tezgah', 'MK-2 Deneme tezgah 2']);
    expect(secenekler(rotaSecici[1]!)).toEqual(['Planlayıcı seçer', 'MK-4 Öteki istasyon tezgahı']);
    const panel = belge.querySelector<HTMLSelectElement>('#insp select[aria-label="Makine"]');
    expect(panel).not.toBeNull();
    expect(secenekler(panel!)).toEqual(['Planlayıcı seçer', 'MK-1 Deneme tezgah', 'MK-2 Deneme tezgah 2']);
    const akis = belge.querySelectorAll<HTMLSelectElement>('.fstep select[aria-label="Makine"]');
    expect(akis.length).toBeGreaterThanOrEqual(2);
    expect(secenekler(akis[0]!)).toEqual(['Planlayıcı seçer', 'MK-1 Deneme tezgah', 'MK-2 Deneme tezgah 2']);
  }, 40000);

  it('makine seçilince adımda kalır; istasyon değişince silinir', async () => {
    const { belge, adimMakine, yerlesim } = await ekranAc();
    yerlesim();
    const sec = () => belge.querySelector<HTMLSelectElement>('.fstep select[aria-label="Makine"]')!;
    fireEvent.change(sec(), { target: { value: 'm2' } });
    expect(adimMakine()).toBe('m2');
    expect(sec().value).toBe('m2');
    const ist = belge.querySelector<HTMLSelectElement>('.fstep select[aria-label="İstasyon"]')!;
    fireEvent.change(ist, { target: { value: 's2' } });
    expect(adimMakine()).toBeUndefined();
    expect(sec().value).toBe('');
    fireEvent.change(sec(), { target: { value: 'm4' } });
    expect(adimMakine()).toBe('m4');
    fireEvent.change(sec(), { target: { value: '' } });
    expect(adimMakine()).toBeUndefined();
  }, 40000);

  it('makine seçili adım planda o makineye atanır; kart penceresinden değiştirilebilir', async () => {
    const { belge, calistir, plan } = await ekranAc('m2');
    expect(plan()).toEqual([{ res: 'm2', forced: true, stepPin: true }]);
    calistir('openCard(curPlan().sched.find(e=>e.stepId==="p1").key)');
    const makine = belge.querySelector<HTMLSelectElement>('#modal select[aria-label="Makine"]')!;
    expect(makine.value).toBe('m2');
    fireEvent.change(makine, { target: { value: 'm1' } });
    expect(plan()).toEqual([{ res: 'm1', forced: true, stepPin: false }]);
  }, 40000);

  it('makinesiz adımda planlayıcı seçer; bakımdaki ya da başka istasyonun makinesi yok sayılır; eski belge açılır', async () => {
    const bos = await ekranAc();
    expect(bos.plan()).toEqual([{ res: 'm1', forced: false, stepPin: false }]);
    expect(bos.calistir('st.routes.i1.steps.every(s=>s.machineId===undefined)')).toBe(true);
    cleanup(); yazmaDinleyiciKapat();
    const bakim = await ekranAc('m3');
    expect(bakim.adimMakine()).toBe('m3');
    expect(bakim.plan()).toEqual([{ res: 'm1', forced: false, stepPin: false }]);
    cleanup(); yazmaDinleyiciKapat();
    const baska = await ekranAc('m4');
    expect(baska.adimMakine()).toBeUndefined();
    expect(baska.plan()).toEqual([{ res: 'm1', forced: false, stepPin: false }]);
  }, 60000);

  it('makine sabitlenmiş adımda alternatif istasyon varsa seçici görünür uyarı verir; plan o makineye dizilir', async () => {
    const uyari = 'Makine seçili: alternatif istasyonlar bu adımda kullanılmaz';
    const adimUyarilari = (belge: Document) => Array.from(belge.querySelectorAll('.fstep .mk-warn')).map((u) => u.textContent?.trim());
    const alt = await ekranAc('m2', { alts: ['s2'] });
    alt.yerlesim();
    expect(alt.plan()).toEqual([{ res: 'm2', forced: true, stepPin: true }]);
    expect(adimUyarilari(alt.belge)).toEqual([uyari]);
    expect(alt.belge.querySelector('#insp .mk-warn')?.textContent?.trim()).toBe(uyari);
    cleanup(); yazmaDinleyiciKapat();
    // Eski kayıttaki "paralel böl" artık etkisizdir (184 a): uyarı da çıkmaz.
    const bol = await ekranAc('m2', { split: 'bol' });
    bol.yerlesim();
    expect(bol.plan()).toEqual([{ res: 'm2', forced: true, stepPin: true }]);
    expect(adimUyarilari(bol.belge)).toEqual([]);
    cleanup(); yazmaDinleyiciKapat();
    const duz = await ekranAc('m2');
    duz.yerlesim();
    expect(duz.plan()).toEqual([{ res: 'm2', forced: true, stepPin: true }]);
    expect(adimUyarilari(duz.belge)).toEqual([]);
    cleanup(); yazmaDinleyiciKapat();
    const secilmemis = await ekranAc(undefined, { alts: ['s2'] });
    secilmemis.yerlesim();
    expect(adimUyarilari(secilmemis.belge)).toEqual([]);
  }, 60000);

  it('plan partiyi kendiliğinden makinelere bölmez: "paralel böl" adımı da tek makineye yerleşir, seçenek ekranda yok; yalnız elle bölme kalır (kullanıcı kararları 157 b, 184 a)', async () => {
    const bol = await ekranAc(undefined, { split: 'bol' });
    bol.yerlesim();
    const p = bol.plan();
    expect(p).toHaveLength(1);
    expect(['m1', 'm2']).toContain(p[0]?.res);
    // Seçenek ve "Paralel böl" yazısı ekrandan kalktı (184 a); kayıtlı alan durur.
    expect(bol.belge.querySelector('select[aria-label="İstasyon kullanımı"]')).toBeNull();
    expect(bol.belge.body.textContent).not.toContain('Paralel böl');
    expect(bol.calistir('st.routes.i1.steps[0].split')).toBe('bol');
  }, 60000);

  it('operasyon değişip istasyon farklılaşınca adımın makinesi silinir', async () => {
    const { belge, adimMakine, yerlesim } = await ekranAc('m2');
    yerlesim();
    expect(adimMakine()).toBe('m2');
    fireEvent.change(belge.querySelector<HTMLSelectElement>('.fstep select[aria-label="Operasyon"]')!, { target: { value: 'd2' } });
    expect(adimMakine()).toBeUndefined();
  }, 40000);

  it('adım katalog değerlerine dönünce istasyon farklılaşıyorsa makine silinir', async () => {
    const { calistir, adimMakine, yerlesim } = await ekranAc('m2');
    yerlesim();
    calistir('opdef("d1").stationId = "s2"');
    calistir('act("resetStep", {id:"p1"})');
    expect(adimMakine()).toBeUndefined();
  }, 40000);

  it('katalog değerleri adımlara uygulanınca istasyon farklılaşıyorsa makine silinir', async () => {
    const { calistir, adimMakine, yerlesim } = await ekranAc('m2');
    yerlesim();
    calistir('opdef("d1").stationId = "s2"');
    calistir('act("applyOpDef", {id:"d1"})');
    calistir('act("applyOpDef", {id:"d1"})');
    expect(adimMakine()).toBeUndefined();
  }, 40000);
});
