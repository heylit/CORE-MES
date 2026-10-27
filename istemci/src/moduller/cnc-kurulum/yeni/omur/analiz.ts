import {
  allLathe, allMill, byId, clamp, fmtN, lifeMat, lifeModel, lifeOpt, lifeRefs, machine, num, progFor, progParams, catParams, state,
  toolById, tools, weibull,
} from './cekirdek.ts';
import type { IsMalzemesi, KesmeKosulu, KesmeParametresi, OmurHesabi, OmurModeli, Takim } from './tipler.ts';

// Tek takım analizi: seçili takım (magazin cebi `p:<cep>` ya da kütüphane `t:<kimlik>`), kesme verisi, Weibull dağılımı, parti
// planı ve ekonomik kesme hızı. Hesap prototipindir; ekrandaki hesap (151 a) ekranda kalır.

export interface SeciliTakim { t: Takim; pocket: number | null }

export function lifeTool(): SeciliTakim {
  const v = state.life.sel || '', arr = tools();
  let t: Takim | null = null;
  if (v.indexOf('p:') === 0) {
    const i = +v.slice(2);
    t = arr[i] && arr[i] !== 'empty' ? toolById(arr[i]) : null;
    if (t && t.kind !== 'probe') return { t, pocket: i };
  }
  if (v.indexOf('t:') === 0) {
    t = byId(allMill().concat(allLathe()), v.slice(2));
    if (t) return { t, pocket: null };
  }
  for (let k = 0; k < arr.length; k++) if (arr[k] !== 'empty' && arr[k] !== 'probe') { state.life.sel = 'p:' + k; return { t: toolById(arr[k]!), pocket: k }; }
  const t0 = allMill()[2]!;
  state.life.sel = 't:' + t0.id;
  return { t: t0, pocket: null };
}

// Magazindeki bir cep analize açılır: elle girilmiş değerler boşalır, program varsa kesme verisi programdan gelir.
export function openAnalysis(p: number): void {
  const m = machine(), t = toolById(tools()[p]!), g = progFor(m, p), q = catParams(t, lifeMat()), l = state.life;
  l.sel = 'p:' + p; l.vc = ''; l.f = ''; l.ap = ''; l.ae = ''; l.tp = ''; l.vb = ''; l.ld = '';
  if (progParams(t, g, q)) { l.vc = Math.round(q.vc); l.f = +q.f.toFixed(4); }
}

export function lifeParams(t: Takim, mat: IsMalzemesi): KesmeParametresi {
  const l = state.life, R = lifeRefs(t, mat);
  let vc = num(l.vc, NaN), f = num(l.f, NaN);
  if (!(vc > 0)) vc = Math.round(R.vref || 100);
  if (!(f > 0)) f = +(R.fref || 0.1).toFixed(3);
  let ap = num(l.ap, NaN), ae = num(l.ae, NaN);
  if (!(ap > 0)) ap = R.apRef;
  if (!(ae > 0)) ae = R.aeRef;
  const key = t.id + '|' + mat.id, O = lifeOpt(t);
  return { vc, f, ap, ae, ld: num(l.ld, O.ld), cool: l.cool || state.coolant, vb: num(l.vb, O.vb), rel: num(l.rel, 90), cal: state.life.cal[key] || 1, key };
}

export interface PartiPlani { Q: number; per: number; edgesMean: number; edgesP90: number; failMean: number; pFail: number; cost: number }

export interface AnalizSonucu {
  sel: SeciliTakim;
  t: Takim;
  mat: IsMalzemesi;
  p: KesmeParametresi;
  M: OmurModeli;
  gtp?: number | null;
  tp?: number | null;
  costEdge?: number;
  uses?: number;
  price?: number;
  lives?: Float64Array;
  batch?: PartiPlani;
  vOpt?: number;
  Topt?: number;
}

export type HesapliSonuc = AnalizSonucu & { M: OmurHesabi; lives: Float64Array; costEdge: number; uses: number; price: number };

// Parti planı ve ömür dağılımı benzetimdir (Weibull örneklemesi, prototipteki gibi rastgele).
export function lifeCompute(): AnalizSonucu {
  const sel = lifeTool(), t = sel.t, mat = lifeMat(), p = lifeParams(t, mat), M0 = lifeModel(t, mat, p), l = state.life;
  const res: AnalizSonucu = { sel, t, mat, p, M: M0 };
  if (M0.err !== undefined) return res;
  let tp = num(l.tp, NaN);
  const g = sel.pocket != null ? progFor(machine(), sel.pocket) : null, gtp = g ? g.t : null;
  res.gtp = gtp;
  if (!(tp > 0) && gtp) tp = gtp;
  res.tp = tp > 0 ? tp : null;
  const price = num(l.price, 0), uses = Math.max(1, num(l.uses, t.tm === 'I' ? 2 : 3)), tc = num(l.tc, 1), rate = num(l.rate, 1500) / 60;
  res.costEdge = price / uses; res.uses = uses; res.price = price;
  const N = 2000, lives = new Float64Array(N);
  for (let i = 0; i < N; i++) lives[i] = weibull(M0.eta, M0.P.beta);
  res.lives = lives;
  if (res.tp) {
    const Q = Math.max(1, Math.round(num(l.batch, 100))), per = Math.max(1, Math.floor(M0.TR / res.tp)), runs = 600, edges: number[] = [], fails: number[] = [];
    let anyFail = 0;
    for (let r = 0; r < runs; r++) {
      let done = 0, e = 0, fl = 0, guard = 0;
      while (done < Q && guard++ < 100000) {
        e++;
        const L0 = weibull(M0.eta, M0.P.beta), can = Math.floor(L0 / res.tp);
        if (can >= per) done += per; else { done += can; fl++; }
      }
      edges.push(e); fails.push(fl);
      if (fl) anyFail++;
    }
    edges.sort((a, b) => a - b);
    const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
    const edgesMean = mean(edges);
    res.batch = {
      Q, per, edgesMean, edgesP90: edges[Math.floor(runs * 0.9)]!, failMean: mean(fails), pFail: anyFail / runs,
      cost: (edgesMean * res.costEdge + edgesMean * tc * rate) / Q,
    };
  }
  if (price > 0) {
    const n = M0.P.n, Topt = (1 / n - 1) * (tc + res.costEdge / Math.max(0.01, rate));
    res.vOpt = p.vc * Math.pow(M0.Tm / Topt, n); res.Topt = Topt;
  }
  return res;
}

// Boş bırakılan temel değerlerin yerine gösterilen optimum (katalog / önerilen) değer ve ondalık sayısı. Kullanıcı girdiyse onunki
// kalır; `oto` alanı yeşil gösterilir (prototipte `lfauto`).
export const OTO_ALANLAR = ['vc', 'f', 'ap', 'ae', 'ld', 'vb', 'tp', 'batch', 'uses', 'tc', 'rate'] as const;
export type OtoAlan = typeof OTO_ALANLAR[number];

export function lifeFill(r: AnalizSonucu): Partial<Record<OtoAlan, string>> {
  const l = state.life, p = r.p, O = lifeOpt(r.t), out: Partial<Record<OtoAlan, string>> = {};
  const V: Record<OtoAlan, [number | null | undefined, number]> = {
    vc: [p.vc, 0], f: [p.f, 4], ap: [p.ap, 2], ae: [p.ae, 2], ld: [p.ld, 1], vb: [p.vb, 1], tp: [r.gtp, 2], batch: [100, 0],
    uses: [O.uses, 0], tc: [1, 1], rate: [1500, 0],
  };
  for (const k of OTO_ALANLAR) {
    const v = V[k][0], own = l[k] != null && l[k] !== '';
    if (own || !(v != null && v > 0)) continue;
    out[k] = String(+(+v).toFixed(V[k][1]));
  }
  return out;
}

const SUF = ['\'ı', '\'i', '\'si', '\'ü', '\'ü', '\'i', '\'sı', '\'si', '\'i', '\'u', '\'u'];
export const trSuf = (n: number): string => SUF[n] || '\'i';
export const fmtDays = (d: number): string => (d < 1 ? '≈ ' + fmtN(d * 8, 1) + ' saat (vardiya)' : fmtN(d, d < 10 ? 1 : 0) + ' iş günü');

// Ömür hesap zinciri: katalogdan parçaya, adım adım. Prototip HTML üretirdi; burada adımlar veri olarak döner, metin aynıdır.
export interface ZincirCipi { lbl: string; x: number; why: string }
export interface ZincirAdimi {
  t: string;
  v: number | null;
  d: ZincirMetni;
  x?: number;
  key?: boolean;
  n?: number;
  n2?: number;
  minus?: number;
  cips?: ZincirCipi[];
  on?: number;
}
// Metin parçaları: düz yazı ve kalın yazı sırayla (prototipin <b>…</b> ve <u>…</u> bölümleri).
export type ZincirMetni = ReadonlyArray<string | { b: string } | { u: string }>;

export interface ZincirGirdisi {
  M: OmurHesabi;
  p: KesmeKosulu;
  lf?: number;
  used?: number;
  parts?: number;
  tp?: number | null;
  tpSrc?: string;
  perDay?: number;
  sogutmaAdi?: string;
}

export function lifeChain(o: ZincirGirdisi): { steps: ZincirAdimi[]; parts: number | null; rem: number; TR: number } {
  const M = o.M, p = o.p, R = M.R, f = M.f, P = M.P, steps: ZincirAdimi[] = [];
  let cur = P.Tref;
  const pc = (a: number, b: number): string => {
    const d = Math.round((a / b - 1) * 100);
    return d === 0 ? 'katalogla aynı' : '%' + Math.abs(d) + (d > 0 ? ' fazla' : ' az');
  };
  steps.push({
    t: 'Katalog ömrü', v: cur,
    d: ['Bir ', { b: P.fam.toLocaleLowerCase('tr-TR') }, ', üreticinin önerdiği kesme verisiyle bu malzemede ortalama ', { b: P.Tref + ' dk' },
      ' talaş kaldırır; sonra yan aşınma 0,3 mm\'ye ulaşır. Bu, takım üreticilerinin standart kabulüdür.'],
  });
  const cips: ZincirCipi[] = [];
  let prod = 1;
  if (Math.abs(f.V - 1) > 0.005) {
    cips.push({ lbl: 'Kesme hızı ' + fmtN(p.vc, 0) + ' m/dk', x: f.V, why: 'katalog ' + fmtN(R.vref, 0) + ' · ' + pc(p.vc, R.vref) + (p.vc > R.vref ? ' → kenar daha çok ısınır' : ' → kenar daha az ısınır') });
    prod *= f.V;
  }
  if (!R.pitch && Math.abs(f.F - 1) > 0.005) {
    cips.push({ lbl: (R.fz ? 'Diş başı ilerleme ' : 'İlerleme ') + fmtN(p.f, 3), x: f.F, why: 'katalog ' + fmtN(R.fref, 3) + ' · ' + pc(p.f, R.fref) + (p.f > R.fref ? ' → talaş kalınlaşır, kenar çok yüklenir' : ' → kenar az yüklenir') });
    prod *= f.F;
  }
  if (Math.abs(f.ap - 1) > 0.005) { cips.push({ lbl: 'Kesme derinliği ' + fmtN(p.ap, 1) + ' mm', x: f.ap, why: 'öneri ' + fmtN(R.apRef, 1) + ' · ' + pc(p.ap, R.apRef) }); prod *= f.ap; }
  if (Math.abs(f.ae - 1) > 0.005) {
    cips.push({ lbl: 'Kavrama ' + fmtN(p.ae, 1) + ' mm', x: f.ae, why: 'öneri ' + fmtN(R.aeRef, 1) + ' · ' + pc(p.ae, R.aeRef) + (p.ae < R.aeRef ? ' → kenar kesmede daha kısa kalır, soğur' : ' → kenar daha uzun süre kesmede') });
    prod *= f.ae;
  }
  if (Math.abs(f.ld - 1) > 0.005) { cips.push({ lbl: 'Delik derinliği ' + fmtN(p.ld, 1) + '×Ø', x: f.ld, why: '3×Ø\'ye göre · talaş tahliyesi zorlaşır' }); prod *= f.ld; }
  if (Math.abs(f.cool - 1) > 0.005) { cips.push({ lbl: 'Soğutma: ' + (o.sogutmaAdi ?? p.cool), x: f.cool, why: 'bu malzeme için' }); prod *= f.cool; }
  const capped = prod > 6.0001;
  if (capped) prod = 6;
  cur = P.Tref * prod;
  steps.push({
    t: 'Sizin kesme veriniz', v: cur, x: prod, cips,
    d: cips.length ? ['Katalogdan farklı olan her ayar ömrü bir katsayıyla değiştirir; katsayılar çarpılır.' + (capped ? ' Toplam etki en fazla ×6 kabul edilir.' : '')]
      : ['Değerleriniz katalogla aynı — ömür değişmez.'],
  });
  if (Math.abs((p.cal || 1) - 1) > 0.005) {
    cur *= p.cal;
    steps.push({ t: 'Gerçek ölçümünüz', v: cur, x: p.cal, d: ['Bu takım + malzeme için girdiğiniz gerçek ömre göre düzeltme.'] });
  }
  const vbx = M.Tm / M.T03;
  if (Math.abs(vbx - 1) > 0.01) {
    cur = M.Tm;
    steps.push({
      t: 'Değişim sınırı', v: cur, x: vbx,
      d: ['Takımı yan aşınma ', { b: 'VB ' + fmtN(p.vb, 1) + ' mm' }, '\'de değiştiriyorsunuz (standart 0,3 mm). '
        + (p.vb > 0.3 ? 'Daha çok aşınmaya izin vermek ömrü uzatır ama yüzey kalitesi ve ölçü düşer.' : 'Erken değiştirmek ölçüyü korur ama ömrü kısaltır.')],
    });
  }
  cur = M.Tm;
  steps.push({ t: 'Ortalama ömür', v: cur, d: ['Aynı koşulda çalışan takımların ', { b: 'ortalama' }, ' dayandığı kesme süresi.'], key: true });
  const rel = p.rel || 80, sh = M.TR / M.Tm, onda = Math.round(rel / 10);
  cur = M.TR;
  steps.push({
    t: 'Güvenli değişim', v: cur, x: sh, on: onda,
    d: ['Takımların hepsi aynı dayanmaz: bazısı ortalamadan erken biter. ', { b: '%' + rel + ' güven' }, ' için ortalamanın ' + fmtN(sh, 2)
      + ' katında değiştiriyoruz — 10 takımdan ' + onda + trSuf(onda) + ' bu süreye kadar dayanır.'],
  });
  if (o.lf && Math.abs(o.lf - 1) > 0.005) {
    cur *= o.lf;
    steps.push({ t: 'Bileme / düzeltme', v: cur, x: o.lf, d: ['Takım bilendiği / düzeltildiği için yeni takıma göre ömür katsayısı.'] });
  }
  const TRf = cur;
  if (o.used != null) {
    cur = Math.max(0, TRf - o.used);
    steps.push({
      t: 'Kullanılan', v: cur, minus: o.used,
      d: ['Takıldığından beri ', { b: fmtN(o.used, 1) + ' dk' }, ' kesti' + (o.parts != null ? ' (' + fmtN(o.parts) + ' parça)' : '') + ' → kalan kesme süresi.'],
    });
  }
  let parts: number | null = null;
  if (o.tp != null && o.tp > 0) {
    parts = Math.floor(cur / o.tp);
    steps.push({
      t: 'Parçaya çevir', v: null, n: parts,
      d: ['Bu takım her parçada ', { b: fmtN(o.tp, 2) + ' dk' }, ' kesiyor (' + (o.tpSrc || 'girildi') + '): ' + fmtN(cur, 1) + ' ÷ ' + fmtN(o.tp, 2) + ' = ',
        { b: fmtN(parts) + ' parça' }, '.'],
    });
  }
  if (parts != null && o.perDay != null && o.perDay > 0) {
    steps.push({ t: 'Takvime çevir', v: null, n2: parts / o.perDay, d: ['Günde ' + fmtN(o.perDay) + ' parça üretiliyorsa ', { b: fmtDays(parts / o.perDay) }, ' sonra.'] });
  }
  return { steps, parts, rem: cur, TR: TRf };
}

// Ömür yüzeyi ve grafiklerin ortak ızgarası: Vc ve ilerlemeye göre ortalama ömür.
export const yuzeyOmru = (t: Takim, mat: IsMalzemesi, p: KesmeParametresi, vc: number, f: number): number => {
  const M = lifeModel(t, mat, Object.assign({}, p, { vc, f }));
  return M.err !== undefined ? 0 : M.Tm;
};

export const kalibrasyon = (r: AnalizSonucu & { M: OmurHesabi }, gozlenen: number): number => clamp(gozlenen / (r.M.Tm / (r.p.cal || 1)), 0.05, 20);
