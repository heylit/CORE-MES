import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cigNoktasi, isKurallari, isTuru, isoHafta, istasyonAyari, istasyonDenetimi, kuralOzeti, kurallariKopyala, numuneEtiketi, numuneOlaylari,
  numuneOlculeri, numunePlani, numunePlaniYaz, onayBekliyor, onayGerekir, onayReddedildi, onayli, paketDenetimi, paketKartDurumu,
  parcaAilesi, seriNo, siradakiOlcen, sinirYakin, varsayilanSablon,
} from './kurallar.ts';
import type { KuralSablonu, NumuneKurali, Pkg, Result } from './tipler.ts';
import type { Plant } from '../cekirdek/tipler.ts';
import { istasyonBul } from '../cekirdek/tesis.ts';

// Taşınan hesaplar eski ekranınkiyle aynı sonucu vermeli. Eski modüller (kurallar.ts, istasyonlar.ts, operator-parcalar.ts, hazirlik.ts)
// gerçek haliyle yüklenir; yalnız arayüz, çizim ve veri katmanı bağımlılıkları sahtedir. Değerler uydurmadır.

const TESIS: Plant = {
  wcs: [{ id: 'TAL', name: 'Deneme merkez' }],
  sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }, { id: 'KAL-1', name: 'Deneme kalite', wc: 'TAL', t: 'kalite' }],
  mcs: [{ id: 'M-1', name: 'Deneme makine', st: 'IST-1' }],
};
const kv: Record<string, unknown> = {};
const politika = { approval: false };

vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({
  AKStore: { status: () => ({ mode: 'server' }), DB: { get: async (_s: string, k: string) => kv[k] }, Bus: {}, Pkg: {}, Folder: {}, Auth: { current: () => null }, Log: { add: () => {} } },
}));
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({
  html: () => null, I: () => null, Fragment: () => null, fmt: (n: number) => String(n), useEffect: () => {}, useState: () => [null, () => {}], useRef: () => ({}),
  useNow: () => 0, useCallback: (f: unknown) => f, useMemo: (f: () => unknown) => f(), ST: {}, CALLS: [], REASONS: [], SCRAPS: [], STEPS0: [], pad: String, pl: () => ({}),
  alpha: () => '', dur: () => '', isPlannedReason: () => false, reasonOf: () => null,
}));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: () => null, set: () => {} }, FEAT: {}, b64bytes: () => new Uint8Array(), loadLib: async () => {}, download: () => {} }));
vi.mock('../../../../../../arkon/web/src/app/ortak-ayarlar.ts', async () => {
  const t = await import('../cekirdek/tesis.ts');
  return {
    PLANT: TESIS, POLICY: politika, MEU: () => null, ME: () => 'Deneme', can: () => true, canSee: () => true, allowed: () => true, audit: () => {},
    machineOf: (id: string) => t.istasyonBul(TESIS, id), stationList: (h?: boolean) => t.istasyonListesi(TESIS, h), mcOf: (id: string) => t.makineBul(TESIS, id),
    wcOf: (id: string) => t.isMerkeziBul(TESIS, id), userInWc: () => true, APPMODE: { demo: false }, ROLE_L: {}, initials: () => '',
    currentShift: () => null, downNext: () => null, downNow: () => null, downWindows: () => [], oeeCalc: () => null,
  };
});
vi.mock('../../../../../../arkon/web/src/app/teknik-resim.ts', () => ({ methOf: (b: { m?: string; tool?: string }) => b.m || (b.tool === 'CMM' ? 'cmm' : 'man'), BlueprintM: () => null }));
vi.mock('../../../../../../arkon/web/src/app/model-3b.ts', () => ({ Step3D: () => null, processModel: async () => ({}), MODEL_KEYS: [], fileHash: async () => '' }));
vi.mock('../../../../../../arkon/web/src/app/pdf.ts', () => ({ LOOK_KEYS: [], PDF_KEYS: [], RCFG: {}, cfgFix: (c: unknown) => c, cfgSig: () => '' }));
vi.mock('../../../../../../arkon/web/src/app/bilesenler.ts', () => ({ MiniRing: () => null }));
vi.mock('../../../../../../arkon/web/src/app/neden-kaynagi.ts', () => ({ onerileriSuz: () => [] }));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({ Brand: () => null, navGo: () => {}, useMob: () => false, useTheme: () => ['dark', () => {}] }));
vi.mock('../../../../../../arkon/web/src/app/gomulu.ts', () => ({ gomuluMu: () => true }));
vi.mock('../../../../../../arkon/web/src/app/cizim-merkezi.ts', () => ({ MerkezRozeti: () => null, MerkezSecici: () => null, merkezVar: () => true, useMerkezUyarilari: () => ({}) }));

// Eski modüller tipsizdir.
let K: any; let S: any; let O: any; let H: any;
const YOL = '../../../../../../arkon/web/src/app/';
beforeAll(async () => {
  K = await import(/* @vite-ignore */ YOL + 'kurallar.ts');
  S = await import(/* @vite-ignore */ YOL + 'istasyonlar.ts');
  O = await import(/* @vite-ignore */ YOL + 'operator-parcalar.ts');
  H = await import(/* @vite-ignore */ YOL + 'hazirlik.ts');
}, 30000);

const PLAN = [
  { id: 1, nom: 'Ø60', tol: '+0.02 / −0.01', min: 59.99, max: 60.02, tool: 'Mikrometre', freq: 'İlk parça', crit: true },
  { id: 2, nom: '25', tol: '±0.1', min: 24.9, max: 25.1, tool: 'CMM', freq: 'Her 50 parça', crit: false },
  { id: 3, nom: 'M8', tol: 'Mastar', min: 0, max: 0, tool: 'Tampon', freq: 'Saatlik', gauge: true },
  { id: 4, nom: '12', tol: '±0.2', min: 11.8, max: 12.2, tool: 'Kumpas', freq: 'Vardiya başı' },
  { id: 5, nom: '8', tol: '±0.2', min: 7.8, max: 8.2, tool: 'Kumpas', freq: 'Son parça', m: 'cmm' },
];
const paket = (ek: Partial<Pkg> = {}): Pkg => ({
  id: 'tmi-ue-7', no: 'IE-1', opType: 'cnc', st: {}, partNo: 'ABC-12', part: 'Deneme parça', rev: 'B', op: 'Op 10', machine: 'IST-1',
  target: 120, cycle: 40, due: '', priority: 'normal', material: '', note: '', files: [{ kind: 'pdf', name: 'a.pdf' }], primary: 'a.pdf', plan: PLAN.map((b) => ({ ...b })),
  steps: [{ id: 's1', t: 'Adım', r: 1 }], status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 10, by: 'Deneme', ...ek,
} as Pkg);

describe('A2 kurallar eski hesaplarla aynı', () => {
  it('iş kuralları, sınıra yakınlık, parça ailesi, özet', () => {
    const girdiler = [null, {}, { rules: { warns: [{ id: 'a', t: 'x', lvl: 'warn', when: 'start' }], q: { band: 60, who: 'operator' }, prod: { scrapPct: 5 } } }, { rules: { prod: { tools: [{ id: 't', name: 'T1', life: 10, warnPct: 80 }] }, q: { nok: 'stop' } } }];
    for (const g of girdiler) {
      expect(isKurallari(g)).toEqual(K.rulesOf(g));
      expect(kuralOzeti(isKurallari(g))).toBe(K.rulesSummary(K.rulesOf(g)));
    }
    const b = { min: 9.9, max: 10.1 };
    for (const v of [9.9, 9.92, 9.98, 10, 10.05, 10.09, 10.1, 10.2, '10']) for (const band of [0, 50, 80, 95]) expect(sinirYakin(b, v, band)).toBe(K.nearEdge(b, v, band));
    for (const v of [10, 20, 90, 100]) for (const band of [60, 80]) expect(sinirYakin({ min: 0, max: 100 }, v, band)).toBe(K.nearEdge({ min: 0, max: 100 }, v, band));
    expect(sinirYakin({ min: 0, max: 0, gauge: true }, 0, 80)).toBe(K.nearEdge({ min: 0, max: 0, gauge: true }, 0, 80));
    for (const p of [{ partNo: 'flş-120', part: '' }, { partNo: '', part: 'ÇUBUK 3' }, { partNo: '12-A', part: 'x' }]) expect(parcaAilesi(p)).toBe(K.famOf(p));
  });

  it('yeni paketin varsayılan kural şablonu: makine > aile > genel', async () => {
    const R = isKurallari({ rules: { warns: [{ id: 'w', t: 'Deneme', lvl: 'info', when: 'every', n: 5 }], prod: { tools: [{ id: 't', name: 'T', life: 9, warnPct: 50 }] } } });
    const sablonlar: KuralSablonu[] = [
      { id: '1', name: 'Genel', scope: 'all', key: '', def: true, rules: R, at: 1 },
      { id: '2', name: 'Aile', scope: 'family', key: 'ABC', def: true, rules: R, at: 2 },
      { id: '3', name: 'Makine', scope: 'machine', key: 'IST-2', def: true, rules: R, at: 3 },
      { id: '4', name: 'Kapalı', scope: 'machine', key: 'IST-1', def: false, rules: R, at: 4 },
    ];
    kv['ruleTpls'] = sablonlar;
    for (const p of [paket(), paket({ machine: 'IST-2' }), paket({ partNo: '9', part: '' })]) {
      const yeni = varsayilanSablon(sablonlar, p);
      const eski = await K.defaultRulesFor(p);
      expect(yeni ? yeni.name : null).toBe(eski ? eski.name : null);
      const kimliksiz = (r: ReturnType<typeof isKurallari>) => ({ ...r, warns: r.warns.map(({ id: _i, ...w }) => w), prod: { ...r.prod, tools: r.prod.tools.map(({ id: _i, ...t }) => t) } });
      if (yeni) expect(kimliksiz(kurallariKopyala(isKurallari({ rules: yeni.rules })))).toEqual(kimliksiz(eski.rules));
    }
  });

  it('istasyon türü, ayarı, seri no, çiğ noktası, ISO hafta', () => {
    for (const t of [undefined, 'cnc', 'kalite', 'depo', 'mark', 'boya', 'montaj', 'yok']) {
      const p = paket({ opType: t as Pkg['opType'], st: t === 'kalite' ? { lot: 500 } : { fmt: '{PARCA}-{SEQ:3}' } });
      expect(isTuru(p)).toBe(S.opOf(p));
      expect(istasyonAyari(p)).toEqual(S.stOf(p));
      expect(istasyonDenetimi(p)).toEqual(S.stValidate(p));
    }
    const d = new Date(2026, 9, 24, 10, 0);
    for (const f of ['{PARCA}-{YY}{WW}-{SEQ:5}', '{IE}/{REV}/{YYYY}{MM}{DD}-{SEQ}', '', null, '{X}-{seq:2}']) {
      for (const n of [1, 42, 12345]) expect(seriNo(f, n, paket(), d)).toBe(S.fmtSerial(f, n, paket(), d));
    }
    for (const [t, rh] of [[20, 50], [-5, 90], [30, 0], [15.5, 70]] as const) expect(cigNoktasi(t, rh)).toBe(S.dewPoint(t, rh));
    for (const g of [new Date(2026, 0, 1), new Date(2026, 11, 31), new Date(2027, 0, 3), new Date(2026, 5, 15)]) expect(isoHafta(g)).toBe(S.isoWeek(g));
  });

  it('numune planı, ölçen sırası, olaylar ve plan yazımı', () => {
    const kurallar: NumuneKurali[] = [
      { id: 'a', when: 'first', who: ['q'], items: 'all', gate: true }, { id: 'b', when: 'every', n: 25, who: ['q', 'op'], items: 'crit' },
      { id: 'c', when: 'time', n: 30, who: ['op'], items: [2, 4] }, { id: 'd', when: 'shift', who: ['q'], items: 'all' }, { id: 'e', when: 'last', who: [], items: 'all' },
    ];
    for (const p of [paket(), paket({ samp: kurallar }), paket({ rules: { q: { who: 'operator', firstPiece: false } } })]) {
      expect(numunePlani(p)).toEqual(O.sampOf(p));
    }
    for (const r of kurallar) {
      expect(numuneEtiketi(r)).toBe(O.sampLabel(r));
      expect(numuneOlculeri(paket(), r)).toEqual(O.sampItems(paket(), r));
      for (const k of [-1, 0, 1, 2, 7]) expect(siradakiOlcen(r, k)).toBe(O.whoAt(r, k));
    }
    for (const [hedef, cevrim] of [[120, 40], [5000, 10], [1, 0], [0, 30]] as const) expect(numuneOlaylari(kurallar, hedef, cevrim)).toEqual(S.sampEvents(kurallar, hedef, cevrim));
    expect(numunePlaniYaz(paket(), kurallar)).toEqual(S.numunePlaniYaz(paket(), kurallar));
  });

  it('yayın onayı, yayın öncesi kontrol ve paket kartı durumu', () => {
    const onaylar: Partial<Pkg>[] = [
      {}, { approval: { ok: true, by: 'K', at: 20 } }, { approval: { ok: true, by: 'K', at: 5 } }, { approval: { ok: false, by: 'K', at: 20 } },
      { apReq: { at: 15, by: 'H' } }, { apReq: { at: 15, by: 'H' }, approval: { ok: false, by: 'K', at: 12 } }, { apReq: { at: 15, by: 'H' }, approval: { ok: true, by: 'K', at: 16 } },
    ];
    for (const ap of [false, true]) {
      politika.approval = ap;
      for (const o of onaylar) {
        const p = paket(o);
        expect([onayli(p), onayReddedildi(p), onayBekliyor(p), onayGerekir(p, { approval: ap })]).toEqual([H.apOk(p), H.apRejected(p), H.apPending(p), H.needApproval(p)]);
      }
    }
    for (const p of [paket(), paket({ machine: '' }), paket({ opType: 'depo', st: { items: [] }, plan: [], steps: [] }), paket({ files: [{ kind: 'model', name: 'm.step' }], primary: null }), paket({ tmi: { emirId: 1, isEmriId: 2, opNo: 10, rotaEksik: 'Girdi yok' } as Pkg['tmi'] })]) {
      expect(paketDenetimi(p, TESIS)).toEqual(H.validate(p));
    }
    const eskiDurum = (x: Pkg, r: Result | null) => (r && r.state === 'done' ? 'done' : r && r.state && r.state !== 'queued' && x.status !== 'draft' ? 'production' : x.status);
    for (const st of ['draft', 'published', 'review'] as const) {
      for (const r of [null, { state: 'queued' }, { state: 'running' }, { state: 'done' }] as (Result | null)[]) expect(paketKartDurumu(paket({ status: st }), r)).toBe(eskiDurum(paket({ status: st }), r));
    }
    expect(istasyonBul(TESIS, 'IST-1').name).toBe('Deneme tezgah');
  });
});
