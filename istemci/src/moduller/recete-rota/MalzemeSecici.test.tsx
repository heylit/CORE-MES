import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Ortak malzeme seçici prototipin kendi kaydıyla sınanır. Örnek veriler uydurmadır: tek adımlı mamul, 45 ham madde, bir yarı mamul, bir hizmet.
function depo() {
  const hamlar = Array.from({ length: 45 }, (_, i) => ({ id: `h${i + 1}`, code: `HM-${String(i + 1).padStart(3, '0')}`, name: `Sac ${i + 1}`, type: 'ham', unit: 'kg', cost: 1, stock: 0, min: 0 }));
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'TRN', name: 'Torna', stationId: 's1', setup: 10, cycle: 4 }],
    items: [
      { id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 },
      { id: 'y1', code: 'YM-001', name: 'Gövde sac', type: 'yari', unit: 'adet', cost: 0, stock: 0, min: 0 },
      { id: 'z1', code: 'HZ-001', name: 'Kaplama hizmeti', type: 'hizmet', unit: 'adet', cost: 0, stock: 0, min: 0 },
      HAM, ...hamlar,
    ],
    routes: { i1: { base: 1, steps: [{ id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, ins: [HAM_GIRDISI], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 }] } },
    orders: [],
  };
}

type Pencere = Window & { eval: (k: string) => unknown };
interface Satir { i: { id: string; code: string }; ana: boolean; altlar: unknown[] }

async function ekranAc() {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Pencere;
  const ifade = <T,>(k: string): T => JSON.parse(pencere.eval(`JSON.stringify(${k})`) as string) as T;
  const liste = (o: Record<string, unknown>) => ifade<Satir[]>(`msecListe(${JSON.stringify(o)})`).map((x) => x.i.code);
  return { belge, ifade, liste };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Ortak malzeme seçici', () => {
  it('koda ve ada göre süzer, kodu yazılanla başlayan önce gelir; tür süzgeci ve girdi kuralı uygulanır; sahibi kendini seçemez', async () => {
    const e = await ekranAc();
    expect(e.liste({ q: 'sac 4' }).slice(0, 2)).toEqual(['HM-004', 'HM-040']);
    expect(e.liste({ q: 'ym-0' })).toEqual(['YM-001']);
    expect(e.liste({ q: 'gövde' })).toEqual(['YM-001']);
    expect(e.liste({ tur: 'mamul' })).toEqual(['MM-001']);
    expect(e.liste({ tur: 'mamul', girdi: true, sahipId: 'i1' })).toEqual([]);
    expect(e.liste({ q: 'hizmet' })).toEqual(['HZ-001']);
    expect(e.liste({ q: 'hizmet', girdi: true })).toEqual([]);
  }, 30000);

  it('sonuçlar sayfalıdır: ilk sayfa 40 satır ve kalan sayısıyla "daha göster"; ikinci sayfa hepsini gösterir', async () => {
    const e = await ekranAc();
    const sayfa = (n: number) => e.ifade<string>(`msecGovde(msecListe({tur:"ham"}), ${String(n)})`);
    const satir = (h: string) => (h.match(/data-msec-id=/g) ?? []).length;
    expect(satir(sayfa(1))).toBe(40);
    expect(sayfa(1)).toContain('6 malzeme daha göster');
    expect(satir(sayfa(2))).toBe(46);
    expect(sayfa(2)).not.toContain('daha göster');
  }, 30000);

  it('giren satırındaki alan açılır listeyle seçer: yazınca süzülür, seçilen kart Ekle ile girene eklenir', async () => {
    const e = await ekranAc();
    e.ifade('(act("tab", {tab:"schema"}), ui.root = "i1", ui.sel = {kind:"step", id:"p1", itemId:"i1", nid:"", qty:1}, renderSchema(true), 1)');
    const alan = e.belge.querySelector<HTMLInputElement>('[data-msec="in"]');
    expect(alan).not.toBeNull();
    fireEvent.focusIn(alan!);
    fireEvent.input(alan!, { target: { value: 'gövde' } });
    const secenek = e.belge.querySelector<HTMLElement>(`#${alan!.id}-p [data-msec-id="y1"]`);
    expect(secenek).not.toBeNull();
    fireEvent.mouseDown(secenek!);
    expect(alan!.value).toBe('YM-001 Gövde sac');
    expect(e.belge.querySelector(`#${alan!.id}-p`)?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(e.belge.querySelector<HTMLElement>('[data-act="quickAdd"][data-kind="in"]')!);
    expect(e.ifade<Array<{ itemId: string }>>('withDrafts(() => findStep("p1").step.ins)').map((x) => x.itemId)).toEqual(['h0', 'y1']);
  }, 30000);
});
