import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Atama görünürlüğü: Operasyonlar tablosu, düzenle simgesi, Kanban kartı ve Plan çubuğu aynı kart penceresini açar. Veriler uydurmadır.
const ADIMLAR = ['KES', 'TRN'] as const;

function depo() {
  const adim = (i: number) => ({ id: `p${i + 1}`, seq: (i + 1) * 10, opId: `d${i + 1}`, stationId: `s${i + 1}`, setup: 10, cycle: 4, ins: i === 0 ? [HAM_GIRDISI] : [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [1, 2].map((n) => ({ id: `s${n}`, code: `IS-${n}`, name: `İstasyon ${n}`, wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 })),
    machines: [{ id: 'm1', code: 'MK-1', name: 'Deneme tezgah', stationId: 's1', status: 'aktif' }, { id: 'm2', code: 'MK-2', name: 'Deneme tezgah 2', stationId: 's1', status: 'aktif' }],
    people: [{ id: 'k1', name: 'Deneme Operatör', skills: ['s1'], shiftId: 'v1', wcId: 'w1', active: true, cost: 100 }],
    opdefs: ADIMLAR.map((ad, i) => ({ id: `d${i + 1}`, code: `OP-${i + 1}`, abbr: ad, name: `Adım ${ad}`, stationId: `s${i + 1}`, setup: 10, cycle: 4 })),
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: ADIMLAR.map((_, i) => adim(i)) } },
    orders: [{ id: 'o1', no: 'UE-2030-001', itemId: 'i1', qty: 50, start: '2030-03-04', due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: 1, tur: 'seri' }],
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const calistir = (k: string) => { pencere.eval(k); };
  const modal = () => belge.querySelector('#modal')?.innerHTML ?? '';
  const modalKapat = () => { calistir('closeModal()'); };
  return { belge, calistir, modal, modalKapat };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Makine ve operatör atamasının görünürlüğü', () => {
  it('Operasyonlar tablosunda atanmamış hücre "Seç" yazar; hücreler ve düzenle simgesi pencereyi açar, rozet de açar', async () => {
    const { belge, calistir, modal, modalKapat } = await ekranAc();
    calistir('ui.tab = "orders"; ui.orderFilter = "tum"; ui.openOrder = "o1"; render()');
    const satirlar = () => Array.from(belge.querySelectorAll('tr')).filter((t) => t.querySelector('button.kst'));
    expect(satirlar().length).toBe(2);
    const ilk = () => satirlar()[0]!;
    const dugmeler = () => Array.from(ilk().querySelectorAll<HTMLButtonElement>('button.alnk'));
    expect(dugmeler().map((d) => d.textContent)).toEqual(['MK-1', 'Seç']);
    expect(modal()).toBe('');

    for (const sec of [() => dugmeler()[0]!, () => dugmeler()[1]!, () => ilk().querySelector<HTMLButtonElement>('button.ibtn')!, () => ilk().querySelector<HTMLButtonElement>('button.kst')!]) {
      fireEvent.click(sec());
      expect(belge.querySelector('#modal select[aria-label="Makine"]')).not.toBeNull();
      expect(belge.querySelector('#modal select[aria-label="Operatör"]')).not.toBeNull();
      modalKapat();
      expect(modal()).toBe('');
    }
  }, 40000);

  it('pencerede makine ve operatör seçilince Operasyonlar tablosunda görünür', async () => {
    const { belge, calistir } = await ekranAc();
    calistir('ui.tab = "orders"; ui.orderFilter = "tum"; ui.openOrder = "o1"; render()');
    const ilk = () => Array.from(belge.querySelectorAll('tr')).find((t) => t.querySelector('button.kst'))!;
    const secenek = (ad: string, deger: string) => { fireEvent.change(belge.querySelector<HTMLSelectElement>(`#modal select[aria-label="${ad}"]`)!, { target: { value: deger } }); };
    const hucreler = () => Array.from(ilk().querySelectorAll('button.alnk')).map((d) => d.textContent);
    fireEvent.click(ilk().querySelectorAll<HTMLButtonElement>('button.alnk')[1]!);
    secenek('Operatör', 'k1');
    expect(hucreler()).toEqual(['MK-1', 'Deneme Operatör']);
    fireEvent.click(ilk().querySelectorAll<HTMLButtonElement>('button.alnk')[0]!);
    secenek('Makine', 'm2');
    expect(hucreler()).toEqual(['MK-2', 'Deneme Operatör']);
  }, 40000);

  it('Kanban kartı ve Plan çubuğu atama ipucu taşır ve pencereyi açar', async () => {
    const { belge, calistir, modalKapat } = await ekranAc();
    calistir('act("tab", {tab:"kanban"})');
    const kart = belge.querySelector<HTMLElement>('.kcard')!;
    expect(kart.getAttribute('title')).toMatch(/ata/);
    expect(kart.querySelector('.kc-ata')?.textContent).toMatch(/ata/);
    fireEvent.click(kart);
    expect(belge.querySelector('#modal select[aria-label="Makine"]')).not.toBeNull();
    modalKapat();
    calistir('act("tab", {tab:"plan"})');
    const cubuk = belge.querySelector<HTMLElement>('.gbar[data-act="openCard"]')!;
    expect(cubuk.getAttribute('title')).toMatch(/Makine \/ operatör ata/);
    fireEvent.click(cubuk);
    expect(belge.querySelector('#modal select[aria-label="Makine"]')).not.toBeNull();
  }, 40000);
});
