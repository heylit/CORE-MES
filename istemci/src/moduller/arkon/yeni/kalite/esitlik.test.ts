import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogCall, LogCount, LogEvent, Maint, Pkg, PlanItem } from '../../../../../../arkon/shared/model.ts';
import { ayarlariOku, type ArkonAyarlari } from '../cekirdek/ayarlar.ts';
import type { Plant, Shift } from '../cekirdek/tipler.ts';
import {
  aletDurumu, aralik, cmmOku, cpkRengi, dortHane, kaliteKurali, katla, kenaraYakin, raporHesapla, satirBol, spcOzeti,
} from './kurallar.ts';

// A4 hesapları eski ekranın hesaplarıyla aynı sonucu vermeli. Eski modüller (kalite.ts, giris-ayarlar-spc.ts, bakim-raporlar.ts, kurallar.ts,
// pdf-okuma.ts) gerçek haliyle yüklenir; yalnız arayüz ve veri katmanı bağımlılıkları sahtedir. Adlar ve ölçüler uydurmadır.

const kv: Record<string, unknown> = {};
const depolar: Record<string, unknown[]> = {};
const ESKI = '../../../../../../arkon/web/src/app';

vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: {
    status: () => ({ mode: 'server' }), onStatus: () => () => {},
    DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] },
    Auth: { current: () => null }, Log: { add: () => {}, query: async () => [] },
  },
}));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: () => null, set: () => {} }, download: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/operator-parcalar.ts', () => ({ beep: () => {}, VardiyaTanimsiz: () => null, pctS: String, PreviewOv: () => null }));
vi.mock('../../../../../../arkon/web/src/app/hazirlik.ts', () => ({ Bus: { send: () => {}, on: () => () => {} }, PSTAT: {}, PlanChip: () => null, apPending: () => false, uidg: () => 'x', DB: {} }));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({ Brand: () => null, useTheme: () => ['dark', () => {}], navGo: () => {}, useMob: () => false }));
vi.mock('../../../../../../arkon/web/src/app/istasyonlar.ts', () => ({ OPTYPES: {}, StationSelect: () => null, opOf: () => 'cnc' }));
vi.mock('../../../../../../arkon/web/src/app/teknik-resim.ts', () => ({ methOf: (b: { m?: string; tool?: string }) => b.m || (b.tool === 'CMM' ? 'cmm' : 'man'), BlueprintM: () => null, METH: {} }));
vi.mock('../../../../../../arkon/web/src/app/olcum-aleti-secimi.ts', () => ({ AletSecimi: () => null, olcumAletiBul: () => null, useOlcumAletleri: () => [] }));
vi.mock('../../../../../../arkon/web/src/app/ayarlar-uretim.ts', () => ({}));

interface Eski {
  loadCfg(): Promise<void>;
  parseCmm(t: string, items: PlanItem[]): unknown;
  splitCsv(l: string, d: string): string[];
  fold(s: string): string;
  spcStats(v: number[], lsl: number, usl: number): unknown;
  cpkTone(c: number | null | undefined): string;
  f4(v: number | null | undefined): string;
  nearEdge(b: unknown, v: unknown, band: number): number;
  rulesOf(p: unknown): { q: { band: number; critTwice: boolean } };
  rangeOf(k: string, now: number): [number, number];
  gaugeTone(g: unknown, now: number): [string, string];
  reportCalc(D: unknown, f: unknown): unknown;
}
let eski: Eski;
beforeAll(async () => {
  const yukle = async (ad: string) => (await import(/* @vite-ignore */ `${ESKI}/${ad}`)) as Partial<Eski>;
  eski = Object.assign({}, ...(await Promise.all(['ortak-ayarlar.ts', 'kalite.ts', 'giris-ayarlar-spc.ts', 'bakim-raporlar.ts', 'kurallar.ts', 'pdf-okuma.ts'].map(yukle)))) as Eski;
}, 30000);

const SA = 3_600_000;
const GUN = 24 * SA;
const gun0 = new Date(2026, 2, 9).getTime();
let tohum = 23;
const rastgele = (): number => { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; };
const sec = <T,>(l: readonly T[]): T => l[Math.floor(rastgele() * l.length)]!;

const VARDIYALAR: Shift[] = [
  { name: 'A', start: '07:00', end: '15:00', breaks: [{ at: '10:00', min: 15 }] },
  { name: 'B', start: '15:00', end: '23:00', breaks: [{ at: '19:00', min: 30 }] },
];
const TESIS: Plant = {
  wcs: [{ id: 'W1', name: 'Talaşlı' }, { id: 'W2', name: 'Montaj' }],
  sts: [{ id: 'S1', name: 'Torna', wc: 'W1', t: 'cnc' }, { id: 'S2', name: 'Freze', wc: 'W1', t: 'cnc' }, { id: 'S3', name: 'Hat', wc: 'W2', t: 'montaj' }],
  mcs: [{ id: 'M1', name: 'Tezgah', st: 'S1' }, { id: 'M2', name: 'Tezgah 2', st: 'S2' }],
};
const NEDENLER = [{ code: 'U-01', l: 'Arıza', cat: 'u' }, { code: 'U-02', l: 'Malzeme yok', cat: 'u' }, { code: 'D-07', l: 'Bakım', cat: 'p' }];
const HURDALAR = [{ code: 'H-1', l: 'Ölçü dışı' }, { code: 'H-2', l: 'Çapak' }];
const kaynak = { DB: { get: async (_s: string, k: string) => kv[k], all: async (s: string) => depolar[s] ?? [] }, status: () => ({ mode: 'server' as const }) };
let a: ArkonAyarlari;

beforeEach(async () => {
  Object.assign(kv, { shifts: VARDIYALAR, mode: {}, plant: TESIS, policy: {}, reasons: NEDENLER, scraps: HURDALAR, perms: null, holidays: {} });
  depolar['downs'] = [{ id: 'd1', title: 'Bakım', reason: 'D-07', scope: 'st', target: 'S1', from: gun0 - 2 * GUN + 9 * SA, to: gun0 - 2 * GUN + 10 * SA, rep: 'daily' }];
  await eski.loadCfg();
  a = await ayarlariOku(kaynak);
});

const OLCULER: PlanItem[] = [
  { id: 1, nom: 'Ø20 h7', min: 19.979, max: 20, tool: 'Mikrometre' },
  { id: 2, nom: '45 ±0,1', min: 44.9, max: 45.1, tool: 'CMM' },
  { id: 3, nom: 'M8 diş', min: 0, max: 0, tool: 'Diş mastarı', gauge: true },
  { id: 4, nom: '12,5', min: 12.45, max: 12.55, tool: 'Kumpas', m: 'cmm', l: 'Kanal genişliği' },
  { id: 12, nom: 'Ø8 H7', min: 8, max: 8.015, tool: 'CMM' },
];

describe('A4 hesapları eskisiyle aynı', () => {
  it('CMM dosyası: ayraç, başlık, sütun ve balon eşleşmesi', () => {
    const dosyalar = [
      'No;Nominal;Actual\n1;20;19,99\n2;45;45,04\n12;8;8,02\n',
      '﻿Balon\tAd\tÖlçülen\nB-4\tKanal genişliği\t12,51\n#2\t\t44,95\n',
      'Feature,Nominal,Measured\nKanal genişliği,12.5,12.49\nX,45.0,45.2\nY,,abc\n',
      '1;19,995\n2;45,01\n99;3\n',
      '"Item";"Name";"Value"\n"1";"Ø20 h7";"19,98"\n"";"45 ±0,1";"45,00"\n',
      '',
    ];
    // Eşleşmeyen satırın ölçüsü eskide undefined, yenide null'dur (veri yoksa null kuralı); ikisi de "eşleşmedi" okunur.
    const esle = (r: unknown) => { const o = r as { rows: { b: unknown }[] }; return { ...o, rows: o.rows.map((x) => ({ ...x, b: x.b ?? null })) }; };
    for (const d of dosyalar) expect(cmmOku(d, OLCULER)).toEqual(esle(eski.parseCmm(d, OLCULER)));
    expect(cmmOku(dosyalar[0]!, OLCULER).matched).toBe(3);
    for (const [l, ay] of [['a;"b;c";d', ';'], ['"x""y",2', ','], [' 1 \t 2 ', '\t']] as const) expect(satirBol(l, ay)).toEqual(eski.splitCsv(l, ay));
    for (const s of ['İŞÇİ ölçü', 'Ğüçlü']) expect(katla(s)).toBe(eski.fold(s));
  });

  it('SPC özeti, Cpk rengi ve dört hane', () => {
    for (let i = 0; i < 30; i++) {
      const n = Math.floor(rastgele() * 40);
      const vals = Array.from({ length: n }, () => 20 + (rastgele() - 0.5) * 0.05);
      const [lsl, usl] = i % 5 === 0 ? [-Infinity, 20.02] : [19.98, 20.02];
      expect(spcOzeti(vals, lsl, usl)).toEqual(eski.spcStats(vals, lsl, usl));
    }
    for (const c of [null, undefined, 0.5, 1, 1.2, 1.33, 2]) expect(cpkRengi(c) == null ? 'var(--muted)' : `var(--${cpkRengi(c)})`).toBe(eski.cpkTone(c));
    for (const v of [null, undefined, NaN, Infinity, 1.23456789, 20, -0.00004]) expect(dortHane(v)).toBe(eski.f4(v));
  });

  it('kenara yakınlık ve paketin kalite kuralı', () => {
    for (let i = 0; i < 200; i++) {
      const b = sec(OLCULER);
      const v = b.min + (rastgele() * 1.4 - 0.2) * (b.max - b.min);
      const band = sec([0, 50, 80, 95]);
      expect(kenaraYakin(b, v, band)).toBe(eski.nearEdge(b, v, band));
    }
    expect(kenaraYakin(null, 1, 80)).toBe(eski.nearEdge(null, 1, 80));
    expect(kenaraYakin(OLCULER[0], '20', 80)).toBe(eski.nearEdge(OLCULER[0], '20', 80));
    for (const p of [null, {}, { rules: {} }, { rules: { q: { band: 60 } } }, { rules: { q: { critTwice: true, band: 90 } } }]) {
      const q = eski.rulesOf(p).q;
      expect(kaliteKurali(p as Pkg)).toEqual({ band: q.band, critTwice: q.critTwice });
    }
  });

  it('rapor aralığı ve ölçü aleti durumu', () => {
    for (const t of [gun0 + 10 * SA, gun0 + 4 * GUN + 23 * SA, gun0 - 1]) {
      for (const k of ['today', 'yday', 'week', 'd7', 'd30', 'bilinmeyen']) expect(aralik(k, t)).toEqual(eski.rangeOf(k, t));
    }
    for (const g of [
      { status: 'out', last: gun0, interval: 365 }, { status: 'ok', last: gun0 - 400 * GUN, interval: 365 }, { status: 'ok', last: gun0 - 350 * GUN, interval: 365 },
      { status: 'ok', last: gun0 - 10 * GUN, interval: 0 }, { status: 'ok', interval: 30 },
    ] as const) {
      const y = aletDurumu(g, gun0);
      expect([`var(--${y.renk})`, y.etiket]).toEqual(eski.gaugeTone(g, gun0));
    }
  });

  it('rapor: istasyon, gün, Pareto, hurda, çağrı ve arıza (süzgeçlerle)', () => {
    const from = gun0 - 6 * GUN;
    const now = gun0 + 15 * SA;
    const ev: LogEvent[] = [];
    const cn: LogCount[] = [];
    for (const st of ['S1', 'S2', 'S3']) {
      for (let t = from - GUN; t < now; t += Math.floor(rastgele() * 3 * SA) + 600_000) {
        const state = sec(['running', 'running', 'stopped', 'paused', 'setup'] as const);
        ev.push({ cid: `e${ev.length}`, at: t, machine: st, wc: st === 'S3' ? 'W2' : 'W1', state, reason: state === 'stopped' ? sec(['U-01', 'U-02', 'D-07', null]) : null, pkgId: 'p1' });
        if (state === 'running') {
          cn.push({ cid: `g${cn.length}`, at: t + 60_000, machine: st, kind: 'good', delta: Math.ceil(rastgele() * 40), cycleMs: 30_000, planMs: 28_000, pkgId: sec(['p1', 'p2', 'yok']), orderNo: 'E-1' });
          if (rastgele() < 0.4) cn.push({ cid: `h${cn.length}`, at: t + 120_000, machine: st, kind: 'scrap', delta: Math.ceil(rastgele() * 3), reason: sec(['H-1', 'H-2', null]), pkgId: sec(['p1', 'p2']), orderNo: 'E-2' });
        }
      }
    }
    const calls: LogCall[] = [];
    for (let i = 0; i < 30; i++) {
      const at = from + Math.floor(rastgele() * 6 * GUN);
      const machine = sec(['S1', 'S2', 'S3']);
      const team = sec(['bakim', 'kalite', 'malzeme'] as const);
      calls.push({ cid: `c${i}a`, at, callId: `k${i}`, team, phase: 'open', machine, userName: 'Deneme', note: null });
      if (rastgele() < 0.7) calls.push({ cid: `c${i}b`, at: at + 300_000, callId: `k${i}`, team, phase: 'ack', machine, userName: 'Deneme', note: null });
      if (rastgele() < 0.3) calls.push({ cid: `c${i}c`, at: at + 600_000, callId: `k${i}`, team, phase: 'esc', machine, userName: 'Deneme', note: null });
      if (rastgele() < 0.6) calls.push({ cid: `c${i}d`, at: at + 1_200_000, callId: `k${i}`, team, phase: 'done', machine, userName: 'Deneme', note: null });
    }
    const pk = [{ id: 'p1', part: 'Parça A' }, { id: 'p2', part: '' }] as Pkg[];
    const mt: Maint[] = [
      { id: 'a1', type: 'ariza', st: 'S1', title: 'Kaçak', openedAt: from + GUN, status: 'done', repairMs: 45 * 60_000 },
      { id: 'a2', type: 'ariza', st: 'S2', title: 'Sensör', openedAt: from + 3 * GUN, status: 'open' },
      { id: 'a3', type: 'ariza', st: 'S1', title: 'Eski', openedAt: from - 3 * GUN, status: 'done', repairMs: 10 * 60_000 },
      { id: 'pl', type: 'plan', mc: 'M1', title: 'Yağ', everyDays: 30 },
    ];
    for (const [f0, t0] of [[from, now], [gun0, gun0 + 10 * GUN], [gun0 - GUN, gun0]] as const) {
      const D = { ev, cn, calls, pk, mt, from: f0, to: t0, now };
      expect(raporHesapla(D, { wc: '', st: '', shf: '' }, a).tot.good).toBeGreaterThan(0);
      for (const f of [{ wc: '', st: '', shf: '' }, { wc: 'W1', st: '', shf: '' }, { wc: '', st: 'S2', shf: 'B' }, { wc: 'W2', st: '', shf: 'A' }]) {
        expect(raporHesapla(D, f, a)).toEqual(eski.reportCalc(D, f));
      }
    }
  });
});
