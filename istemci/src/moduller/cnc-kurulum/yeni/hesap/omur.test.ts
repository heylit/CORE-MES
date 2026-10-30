import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prototipYukle } from '../../prototip-html.ts';
import { clamp, fmtN, num } from '../bicim.ts';
import { durumKur, state } from '../depo.ts';
import {
  allCons, allGauges, allLathe, allMachines, allMaterials, allMill, byId, cust, dirtyUsage, invKey, machine, material, stockOf, toolById,
  toolLib, tools, usage,
} from '../secici.ts';
import { D } from '../veri/cncdata.ts';
import { isLatheTool } from '../veri/takim-turu.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';
import { matBeh } from './malzeme-davranisi.ts';
import {
  COOLF, DEF_TP, DRILLK, LIFE_ENG, REL_TXT, ST_TXT, allShelves, catParams, cycleOf, depotCards, famOf, fmtDay, fmtDur, lifeCard, lifeKind,
  lifeMat, lifeModel, lifeOpt, lifeRefs, lwDefs, machineCards, progFor, progParams, toolsOf, tpInfo, trackCards, vbShape, wearPeek, wearRec,
  zeroPhys, type KesmeKosulu,
} from './omur.ts';

// Taşıma prototiptekiyle aynı sonucu vermeli: prototipin işlevleri eski ekranın yüklediği prototipten alınır ve aynı durum ve
// seçicilerle koşturulur. Her karşılaştırmada durum iki tarafa da baştan kurulur (işlevler eksik magazini durumda kurar).
let HTML = '';
function parca(bas: string, son: string): string {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${bas}`);
  return HTML.slice(i, HTML.indexOf(son, i) + son.length);
}
function islev(imza: string): string {
  const i = HTML.indexOf(imza);
  if (i < 0) throw new Error(`Prototipte bulunamadı: ${imza}`);
  let derinlik = 0;
  for (let j = HTML.indexOf('{', i); j < HTML.length; j += 1) {
    if (HTML[j] === '{') derinlik += 1;
    else if (HTML[j] === '}') { derinlik -= 1; if (derinlik === 0) return HTML.slice(i, j + 1); }
  }
  throw new Error('Kapanmayan işlev');
}

const ISLEVLER = ['famOf(t)', 'lifeKind(t)', 'lifeOpt(t)', 'lifeRefs(t, mat)', 'vbShape(s)', 'lifeModel(t, mat, p)', 'catParams(t, mat)',
  'progFor(m, p)', 'progParams(t, g, q)', 'lifeMat()', 'wearPeek(mid, p, id)', 'wearRec(mid, p, id)', 'trackCards()', 'fmtDur(h)', 'fmtDay(d)',
  'toolsOf(m)', 'tpInfo(m, p, t)', 'cycleOf(m, arr)', 'lifeCard(m, p, t, mat, arr, cyc)', 'machineCards(m)', 'zeroPhys()', 'allShelves()',
  'depotGroup(shKey)', 'depotCards()', 'lwDefs()'];
let KOD = '';
type Islev = (...a: unknown[]) => unknown;
// Prototip `state`'i serbest ad olarak okur; her çağrıda o anki durumla kurulur.
function prototip(): Record<string, Islev> {
  const sec = { clamp, num, fmtN, matBeh, byId, toolLib, D, material, machine, tools, toolById, stockOf, invKey, usage, cust, allMill, allLathe,
    allGauges, allCons, dirtyUsage, allMaterials, allMachines };
  const adlar = Object.keys(sec);
  return new Function('state', 'CNC3D', 'PI', ...adlar,
    `${KOD}\nreturn { ${ISLEVLER.map((a) => a.slice(0, a.indexOf('('))).join(', ')}, COOLF, DRILLK, LIFE_ENG, DEF_TP, REL_TXT, ST_TXT };`,
  )(state, { isLatheTool }, Math.PI, ...adlar.map((a) => sec[a as keyof typeof sec])) as Record<string, Islev>;
}

beforeAll(async () => {
  HTML = await prototipYukle();
  KOD = [
    parca('var COOLF = {', '\n'), parca('var DRILLK = [', '\n'), parca('var LIFE_ENG = {', '\n'), parca('var DEF_TP = {', 'lt_knurl: 0.2 };'),
    parca('var REL_TXT = {', '\n'), parca('var ST_TXT = {', '\n'), parca('var ZPHYS = [', '\n'), parca('var DEPOT_G = [', ' }];'),
    ...ISLEVLER.map((a) => islev(`function ${a}`)),
  ].join('\n');
});

// Program, aşınma, elle süre, stok ve elle eklenen takım taşıyan uydurma durum.
const DURUM = {
  machine: 'f5a', material: '1.4404', coolant: 'oil',
  gsim: { machine: 'f5a', total: 14.5, perTool: { 1: { S: 3200, F: 900, t: 2.4 }, 2: { S: 0, F: 100, t: 0 }, 4: { S: 8000, F: 2400, t: 0.7 } } },
  wear: { f5a: { 0: { id: 'x', used: 5, parts: 2, since: 1 } } },
  ptime: { tcy: { 1: { id: 'lt_ext_r08', tp: 3.5 } } },
  life: { trel: 95, perDay: 20, cal: {} },
  inv: { em10: { qty: 4, min: 2 }, dr8: { qty: 1, min: 1 }, h_hsk_er_8: { qty: 0 }, c_bez: { qty: 12 } },
  custom: [{ id: 'cu_1', name: 'Özel kaba freze', kind: 'rougher', shelf: 'tm_end', isTool: true, d: 16, z: 4, tm: 'K', vm: 1, cut: { fz: 0.08 } }],
};
function kur(ek: Record<string, unknown> = {}): void { durumKur(JSON.stringify({ ...DURUM, ...ek }), null); }
const ayni = (a: unknown, b: unknown): void => { expect(JSON.parse(JSON.stringify(a)) as unknown).toEqual(JSON.parse(JSON.stringify(b)) as unknown); };
// Aynı işlemi önce bizim, sonra prototipin işlevleriyle, her biri taze durumda koşturur.
function karsilastir(f: (x: Record<string, Islev> | null) => unknown, ek?: Record<string, unknown>): void {
  kur(ek); const a = f(null);
  kur(ek); const b = f(prototip());
  ayni(a, b);
}
const proto = (x: Record<string, Islev>, ad: string): Islev => { const f = x[ad]; if (!f) throw new Error(ad); return f; };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-04T08:00:00Z')); kur(); });
afterEach(() => { vi.useRealTimers(); });

describe('takım ömrü modeli', () => {
  it('sabitler prototiptekiyle aynı', () => {
    const x = prototip();
    ayni({ COOLF, DRILLK, LIFE_ENG, DEF_TP, REL_TXT, ST_TXT }, { COOLF: x['COOLF'], DRILLK: x['DRILLK'], LIFE_ENG: x['LIFE_ENG'], DEF_TP: x['DEF_TP'], REL_TXT: x['REL_TXT'], ST_TXT: x['ST_TXT'] });
  });

  it('famOf, lifeKind, lifeOpt, lifeRefs, catParams, lifeModel her takım ve malzemede aynı', () => {
    const x = prototip();
    const takimlar: Kalem[] = [...allMill(), ...allLathe(), ...D.LIVE, D.EMPTY, { id: 'n', name: 'Finiş 5xD', kind: 'lt_ext', cut: { fr: 0.1 } }];
    const malzemeler = allMaterials();
    for (const t of takimlar) {
      ayni(famOf(t), proto(x, 'famOf')(t)); ayni(lifeKind(t), proto(x, 'lifeKind')(t)); ayni(lifeOpt(t), proto(x, 'lifeOpt')(t));
      for (const mat of malzemeler) {
        if (t.cut) {
          ayni(lifeRefs(t, mat), proto(x, 'lifeRefs')(t, mat));
          const q = catParams(t, mat);
          ayni(q, proto(x, 'catParams')(t, mat));
          for (const p of [q, { ...q, vc: q.vc * 1.6, f: q.f * 0.5, ap: 0, ae: 3, cool: 'tsc', vb: 0, rel: 0, cal: 0, ld: 6 }, { ...q, cool: 'yok', vb: 0.5, rel: 95 }] as KesmeKosulu[]) {
            ayni(lifeModel(t, mat, p), proto(x, 'lifeModel')(t, mat, p));
          }
        }
      }
    }
    for (const s of [0, 0.3, 1, 2.5]) expect(vbShape(s)).toBe(proto(x, 'vbShape')(s));
  });

  it('progFor ve progParams programdan kesme koşulu alır', () => {
    const x = prototip(), m = machine() as Tezgah;
    for (let p = 0; p < 6; p += 1) ayni(progFor(m, p), proto(x, 'progFor')(m, p));
    const mat = material() as IsMalzemesi;
    for (const t of [...allMill().slice(0, 30), ...allLathe().slice(0, 10)]) {
      if (!t.cut) continue;
      for (const g of [null, { S: 0, F: 1, t: 1 }, { S: 3000, F: 600, t: 1 }, { S: 3000, F: 0, t: 1 }]) {
        const a = catParams(t, mat), b = catParams(t, mat);
        expect(progParams(t, g, a)).toBe(proto(x, 'progParams')(t, g, b));
        ayni(a, b);
      }
    }
    expect(lifeMat()).toEqual(proto(x, 'lifeMat')());
  });

  it('wearPeek okur, wearRec yeni kaydı kurar', () => {
    karsilastir((x) => [x ? proto(x, 'wearPeek')('f5a', 0, 'x') : wearPeek('f5a', 0, 'x'), x ? proto(x, 'wearPeek')('f5a', 1, 'y') : wearPeek('f5a', 1, 'y')]);
    karsilastir((x) => { const r = x ? proto(x, 'wearRec')('tcy', 2, 'z') : wearRec('tcy', 2, 'z'); return [r, state['wear']]; });
  });

  it('fmtDur ve fmtDay aynı', () => {
    const x = prototip();
    for (const h of [null, 0.25, 1, 12.345]) expect(fmtDur(h)).toBe(proto(x, 'fmtDur')(h));
    for (const d of [null, 0.4, 1.5, 3.25, 40]) expect(fmtDay(d)).toBe(proto(x, 'fmtDay')(d));
  });
});

describe('takım ömrü verisi', () => {
  it('trackCards seçili tezgâhta aynı (program, aşınma, güven seviyesi)', () => {
    karsilastir((x) => (x ? proto(x, 'trackCards')() : trackCards()));
    karsilastir((x) => (x ? proto(x, 'trackCards')() : trackCards()), { machine: 'tcy', gsim: null });
  });

  it('toolsOf, tpInfo, cycleOf, lifeCard, machineCards her tezgâhta aynı; eksik magazin durumda kurulur', () => {
    for (const m of allMachines()) {
      karsilastir((x) => { const arr = x ? proto(x, 'toolsOf')(m) : toolsOf(m); return [arr, state.tools]; });
      karsilastir((x) => {
        const arr = (x ? proto(x, 'toolsOf')(m) : toolsOf(m)) as string[];
        const tp = arr.map((id, p) => { const t = byId(toolLib(m), id); return t ? (x ? proto(x, 'tpInfo')(m, p, t) : tpInfo(m, p, t)) : null; });
        const cyc = x ? proto(x, 'cycleOf')(m, arr) : cycleOf(m, arr);
        const t = byId(toolLib(m), arr[1] ?? 'empty');
        const kart = t ? (x ? proto(x, 'lifeCard')(m, 1, t, material(), arr, 3) : lifeCard(m, 1, t, material(), arr, 3)) : null;
        return [tp, cyc, kart];
      });
      karsilastir((x) => (x ? proto(x, 'machineCards')(m) : machineCards(m)));
    }
  });

  it('zeroPhys, allShelves, depotCards ve lwDefs aynı; stoksuz depoda boş depo satırı', () => {
    karsilastir((x) => (x ? [proto(x, 'zeroPhys')(), proto(x, 'allShelves')()] : [zeroPhys(), allShelves()]));
    karsilastir((x) => (x ? proto(x, 'depotCards')() : depotCards()));
    karsilastir((x) => (x ? proto(x, 'lwDefs')() : lwDefs()));
    karsilastir((x) => (x ? proto(x, 'lwDefs')() : lwDefs()), { inv: {} });
  });
});
