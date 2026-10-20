import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Plan kapasitesi (kart #1324): köprünün Vardiya takviminden getirdiği onaylı izin, planlı fazla mesai ve atama payı plan motoruna girer.
// Veriler uydurmadır; 2030-03-04 pazartesidir, vardiya 8 saattir.
const GUN0 = '2030-03-04';
const GUN1 = '2030-03-05';

function depo(opPer: number, emirSayisi: number, kisiSayisi: number) {
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } },
      { id: 'w2', code: 'IM-2', name: 'Taşlama', week: { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] } }],
    stations: [{ id: 's1', code: 'IS-1', name: 'Torna', wcId: 'w1', cost: 0, eff: 100, count: 3, opPer },
      { id: 's2', code: 'IS-2', name: 'Freze', wcId: 'w1', cost: 0, eff: 100, count: 1, opPer: 1 }],
    machines: [],
    people: [{ id: 'k1', name: 'Kişi 1', code: '', role: '', wcId: 'w1', shiftId: 'v1', cost: 0, skills: ['s1', 's2'], active: true },
      { id: 'k2', name: 'Kişi 2', code: '', role: '', wcId: 'w1', shiftId: 'v1', cost: 0, skills: ['s1', 's2'], active: true }].slice(0, kisiSayisi),
    opdefs: [{ id: 'd1', code: 'OP-1', abbr: 'T', name: 'Tornalama', stationId: 's1', setup: 0, cycle: 420 }],
    items: [{ id: 'i1', code: 'MM-001', name: 'Deneme mamul', type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 }, HAM],
    routes: { i1: { base: 1, steps: [{ id: 'p1', seq: 10, opId: 'd1', stationId: 's1', setup: 0, cycle: 420, ins: [HAM_GIRDISI], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 }] } },
    orders: Array.from({ length: emirSayisi }, (_, i) => ({ id: `o${i + 1}`, no: `UE-2030-00${i + 1}`, itemId: 'i1', qty: 1, start: GUN0, due: '2030-03-29', priority: 3, status: 'serbest', note: '', created: i + 1, tur: 'seri' })),
  };
}

async function motor(opPer = 1, emirSayisi = 1, kisiSayisi = 2) {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(opPer, emirSayisi, kisiSayisi), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const pencere = (await prototipiCalistir(html)).defaultView as unknown as Window & { eval: (k: string) => unknown };
  // Köprünün kaynak okumasındaki kapasite eki (sunucu biçimi) verilir; plan yeniden hesaplanır.
  return <T,>(kapasite: unknown, ifade: string): T => JSON.parse(String(pencere.eval(
    `(function(){ KAP = kapasiteCevir(${JSON.stringify(kapasite)}); invalidate(); const P = curPlan(); const w1 = wc("w1"); return JSON.stringify(${ifade}); })()`))) as T;
}

const kisi = (id: string, ek: Record<string, unknown> = {}) => ({ id, izinli: [], fazlaMesai: [], paylar: [{ wcId: 'w1', pay: 1 }], ...ek });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('Plan kapasitesi: izin, fazla mesai, atama payı (#1324)', () => {
  it('onaylı izinli kişi o gün havuzu düşürür ve gün hücresi izni gösterir; eki olmayan plan vardiyayla hesaplar', async () => {
    const calistir = await motor();
    const once = calistir<number[]>(null, '[P.avail.w1[0], P.avail.w1[1]]');
    expect(once).toEqual([16, 16]);
    const r = calistir<{ a: number[]; n: unknown }>({ baslangic: GUN0, isMerkezleri: [], istasyonlar: [], kisiler: [kisi('k1'), kisi('k2', { izinli: [GUN1] })] },
      '{a:[P.avail.w1[0], P.avail.w1[1]], n:P.kapNot.w1}');
    expect(r.a).toEqual([16, 8]);
    expect(r.n).toEqual({ 1: { iz: 8, fm: 0 } });
  }, 40000);

  it('planlı fazla mesai günü makine saatini ve kişi-saati artırır; istasyona özel mesai yalnız o istasyona işler', async () => {
    const calistir = await motor();
    const r = calistir<{ w: number[]; s1: number; s2: number; a: number; n: unknown }>({
      baslangic: GUN0,
      isMerkezleri: [{ id: 'w1', fazlaMesai: [{ tarih: GUN1, dakika: 120 }] }],
      istasyonlar: [{ id: 's2', fazlaMesai: [{ tarih: GUN1, dakika: 240 }] }],
      kisiler: [kisi('k1', { fazlaMesai: [{ tarih: GUN1, dakika: 120 }] }), kisi('k2')],
    }, '{w:[P.capOf(w1,0), P.capOf(w1,1)], s1:P.capOf(istasyonTakvimi(station("s1")),1), s2:P.capOf(istasyonTakvimi(station("s2")),1), a:P.avail.w1[1], n:P.kapNot.w1[1]}');
    expect(r.w).toEqual([8, 10]);
    expect([r.s1, r.s2]).toEqual([10, 12]);
    expect(r.a).toBe(18);
    expect(r.n).toEqual({ iz: 0, fm: 2 });
  }, 40000);

  it('%50 atanan kişi iş merkezinde yarım sayılır; öbür iş merkezindeki payıyla orada da sayılır', async () => {
    const calistir = await motor();
    const r = calistir<number[]>({ baslangic: GUN0, isMerkezleri: [], istasyonlar: [], kisiler: [kisi('k1', { paylar: [{ wcId: 'w1', pay: 0.5 }, { wcId: 'w2', pay: 0.5 }] }), kisi('k2')] },
      '[P.avail.w1[0], P.avail.w2[0]]');
    expect(r).toEqual([12, 4]);
  }, 40000);

  it('operatör/makine 0,33 iken bir kişi üç makineyi aynı gün besler; 1 iken işler günlere yayılır', async () => {
    const son = '(function(){ const l = []; for (const id in P.orders) l.push(P.orders[id].makespan); return Math.max.apply(null, l); })()';
    const bes = { baslangic: GUN0, isMerkezleri: [], istasyonlar: [], kisiler: [kisi('k1')] };
    const uc = await (await motor(0.33, 3, 1))<number>(bes, son);
    cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat();
    expect(uc).toBeLessThanOrEqual(1 + 1e-6);
    const bir = await (await motor(1, 3, 1))<number>(bes, son);
    expect(bir).toBeGreaterThan(2);
  }, 60000);
});
