import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Ürün ve rotalar: bütün ürünler ve rotaları tek tabloda, satır seçilince şemada açılır. Veriler uydurmadır.
function depo() {
  const adim = (id: string, seq: number) => ({ id, seq, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
  const urun = (id: string, code: string, name: string, type: string) => ({ id, code, name, type, unit: 'adet', cost: 0, stock: 0, min: 0 });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
    machines: [], people: [],
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'TR', name: 'Tornalama', stationId: 's1', setup: 10, cycle: 4 }],
    items: [
      urun('h1', 'HM-001', 'Deneme çubuk', 'ham'),
      urun('i1', 'MM-001', 'Deneme mamul', 'mamul'),
      urun('i2', 'YM-001', 'Deneme yarı mamul', 'yari'),
      urun('i3', 'MM-002', 'Deneme gövde', 'mamul'),
      urun('z1', 'HZ-001', 'Deneme hizmet', 'hizmet'),
      urun('z2', 'SF-001', 'Deneme sarf', 'sarf'),
    ],
    routes: { i1: { base: 1, steps: [adim('p1', 10), adim('p2', 20)] } },
    routeRevs: [{ id: 'rv1', itemId: 'i3', no: 1, status: 'taslak', data: { base: 1, steps: [adim('q1', 10)] }, note: '', created: Date.UTC(2030, 2, 4), updated: Date.UTC(2030, 2, 5) }],
    orders: [],
    settings: { orderItem: 'i1' },
  };
}

type Pencere = Window & { eval: (k: string) => unknown };

async function ekranAc(deger: unknown = depo()) {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger, surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const calistir = (k: string) => (belge.defaultView as unknown as Pencere).eval(k);
  calistir('act("tab", {tab:"schema"})');
  fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="schList"]')!);
  const gorunen = () => Array.from(belge.querySelectorAll<HTMLTableRowElement>('.ul-tablo tbody tr')).filter((r) => !r.hidden)
    .map((r) => Array.from(r.cells).map((c) => c.textContent?.replace(/\s+/g, ' ').trim()));
  return { belge, calistir, gorunen };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Rota revizyonu onayı', () => {
  it('Onaylayan kutusu salt okunur ve oturumdaki kişiyle dolu; kutuya yazılan değer onaya geçmez', async () => {
    const d = depo();
    const { belge, calistir } = await ekranAc({ ...d, routeRevs: d.routeRevs.map((r) => ({ ...r, status: 'onay' })) });
    calistir('ui.schList = false; ui.root = "i3"; ui.revItem = "i3"; ui.revPanel = "approve"; render();');
    const kutu = belge.querySelector<HTMLInputElement>('#revBy');
    expect(kutu).not.toBeNull();
    expect([kutu!.readOnly, kutu!.value]).toEqual([true, YAZAR.ad]);
    kutu!.value = 'Başka biri';
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="revApproveOnly"]')!);
    expect(calistir('JSON.stringify(st.routeRevs.find(r => r.id === "rv1"))')).toContain(`"approver":"${YAZAR.ad}"`);
    expect(calistir('st.routeRevs.find(r => r.id === "rv1").status')).toBe('onayli');
  });
});

describe('Ürün ve rotalar tablo görünümü', () => {
  it('mamul ve yarı mamuller rota durumu, adım sayısı ve son değişiklikle listelenir', async () => {
    const { gorunen } = await ekranAc();
    const satirlar = gorunen();
    // var olan rota açılışta yürürlükteki revizyona çevrilir; tarihi açılış günüdür
    expect(satirlar[0]?.slice(0, 5)).toEqual(['MM-001', 'Deneme mamul', 'MM', 'Yürürlükte Rev A', '2']);
    expect(satirlar[0]?.[5]).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(satirlar.slice(1)).toEqual([
      ['MM-002', 'Deneme gövde', 'MM', 'Taslak Rev 1', '1', '05.03.2030'],
      ['YM-001', 'Deneme yarı mamul', 'YM', 'Rota yok', '–', '–'],
    ]);
  });

  it('hizmet ve sarf kartı rota sahibi olmaz: listede ve şemanın ürün seçicisinde yalnız mamul ve yarı mamul çıkar', async () => {
    const { belge, gorunen } = await ekranAc();
    expect(gorunen().map((r) => r[0])).toEqual(['MM-001', 'MM-002', 'YM-001']);
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="schList"]')!);
    const secenekler = Array.from(belge.querySelectorAll<HTMLOptionElement>('select[aria-label="Şemadaki ürün"] option')).map((o) => o.value);
    expect(secenekler.sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('tür, durum süzgeci ve arama satırları daraltır', async () => {
    const { belge, gorunen } = await ekranAc();
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="ulTur"][data-v="yari"]')!);
    expect(gorunen().map((r) => r[0])).toEqual(['YM-001']);
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="ulTur"][data-v="all"]')!);
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="ulDurum"][data-v="acik"]')!);
    expect(gorunen().map((r) => r[0])).toEqual(['MM-002']);
    fireEvent.click(belge.querySelector<HTMLButtonElement>('[data-act="ulDurum"][data-v="all"]')!);
    const ara = belge.querySelector<HTMLInputElement>('#ulAra')!;
    fireEvent.input(ara, { target: { value: 'gövde' } });
    expect(gorunen().map((r) => r[0])).toEqual(['MM-002']);
    // arama sayfayı yeniden çizmez: kutu aynı öğedir, yazılan kaybolmaz
    expect(belge.querySelector('#ulAra')).toBe(ara);
  });

  it('satır tıklanınca ürün şemada açılır ve liste kapanır', async () => {
    const { belge, calistir } = await ekranAc();
    fireEvent.click(belge.querySelector<HTMLTableRowElement>('.ul-tablo tr[data-id="i2"]')!);
    expect(calistir('ui.root')).toBe('i2');
    expect(calistir('ui.schList')).toBe(false);
    expect(belge.querySelector('.ul-tablo')).toBeNull();
    expect(belge.querySelector<HTMLSelectElement>('.rootsel select')?.value).toBe('i2');
  });
});
