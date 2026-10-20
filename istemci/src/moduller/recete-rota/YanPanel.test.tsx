import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Rota adımı yan paneli (#insp) çerçevenin genişliğine göre yerleşir (kart #1161). Çerçeve kabuğun içerik alanını doldurur:
// 768 genişlikte simge şeridinden (72) sonra 696, 1024'te sabit menüden (200) sonra 824, 1280'de 1080 kalır. jsdom yerleşim
// hesaplamadığı için çalışan sayfanın stil sayfalarında (CSSOM) o genişlikte geçerli olan son kural okunur (aynı seçici, kaynak sırası).
// Veriler uydurmadır.
const adim = (i: number) => ({ id: `p${String(i + 1)}`, seq: (i + 1) * 10, opId: 'd1', stationId: 's1', setup: 10, cycle: 4, ins: [], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 });
const DEPO = {
  version: 7, name: 'Deneme fabrika',
  cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
  stations: [{ id: 's1', code: 'IS-1', name: 'İstasyon 1', wcId: 'w1', cost: 500, eff: 100, count: 1, opPer: 1 }],
  machines: [], people: [],
  opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'A1', name: 'Adım 1', stationId: 's1', setup: 10, cycle: 4 }],
  items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }],
  routes: { i1: { base: 1, steps: [adim(0), adim(1)] } },
  orders: [],
};

let belge: Document;
let kurallar: () => CSSRule[];
beforeAll(async () => {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: DEPO, surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  belge = await prototipiCalistir(html);
  kurallar = () => Array.from(belge.styleSheets).flatMap((s) => Array.from(s.cssRules));
}, 40000);
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(() => { cleanup(); yazmaDinleyiciKapat(); });

function ortamUyar(kosul: string, genislik: number): boolean {
  if (/prefers-/.test(kosul)) return false;
  const enCok = /max-width:\s*(\d+)px/.exec(kosul);
  const enAz = /min-width:\s*(\d+)px/.exec(kosul);
  return (enCok === null || genislik <= Number(enCok[1])) && (enAz === null || genislik >= Number(enAz[1]));
}

function deger(secici: string, ozellik: string, genislik: number): string | null {
  let sonuc: string | null = null;
  const gez = (liste: CSSRule[], uyar: boolean) => {
    for (const k of liste) {
      if (k instanceof CSSMediaRule) gez(Array.from(k.cssRules), uyar && ortamUyar(k.conditionText || k.media.mediaText, genislik));
      else if (uyar && k instanceof CSSStyleRule && k.selectorText.split(',').map((s) => s.trim()).includes(secici)) {
        const v = k.style.getPropertyValue(ozellik);
        if (v !== '') sonuc = v;
      }
    }
  };
  gez(kurallar(), true);
  return sonuc;
}

describe('rota adımı yan paneli tablet ve masaüstü genişliğinde taşmaz (kart #1161)', () => {
  it('akış tablosunda panel 768 ve 1024 genişlikte alttan açılan sayfadır, 1280 genişlikte tablonun yanında yapışık kalır', () => {
    // Adım seçilince panel akış tablosunun gövdesinde açılır: aşağıdaki kurallar bu panele uygulanır.
    (belge.defaultView as unknown as { eval: (k: string) => unknown }).eval('act("tab", {tab:"schema"}); ui.schMode = "table"; ui.sel = {kind:"step", id:"p1", itemId:"i1", nid:"root", qty:1}; render()');
    expect(belge.querySelector('.sch-body.tbl > #insp, .sch-body.tbl #insp')).not.toBeNull();
    for (const cerceve of [696, 824]) {
      expect(deger('.sch-body.tbl .insp', 'position', cerceve), String(cerceve)).toBe('fixed');
      expect(deger('.sch-body.tbl .insp', 'top', cerceve), String(cerceve)).toBe('auto');
      expect(deger('.sch-body.tbl .insp', 'max-height', cerceve), String(cerceve)).toBe('66vh');
    }
    expect(deger('.sch-body.tbl .insp', 'position', 1080)).toBe('sticky');
    // Akış şemasında da aynı sayfa düzeni (öncekiyle aynı kalır).
    expect(deger('.sch-body .insp', 'position', 824)).toBe('fixed');
    expect(deger('.sch-body .insp', 'position', 1080)).toBe('static');
  });

  it('paneldeki vardiya matrisi en az genişlik koymaz; saat alt satıra iner ve hücreler daralır', () => {
    expect(deger('.wm', 'min-width', 1080)).toBe('620px');
    expect(deger('.insp .wm.compact', 'min-width', 1080)).toBe('0');
    expect(deger('.insp .wm.compact .wm-s small', 'display', 1080)).toBe('block');
    expect(deger('.insp .wm.compact .wm-c', 'min-width', 1080)).toBe('26px');
  });
});
