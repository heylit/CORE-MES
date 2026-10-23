import { EY_KEYS } from './icerik/eydep.ts';
import { OZF, OZV, PROGRAM_SIRASI, PTYPE, programMi } from './icerik/programlar.ts';
import { KDUR, KSON, KTUR } from './icerik/kalibrasyon.ts';
import { ISO_TARIH } from './tarih.ts';
import type {
  AcikOzTuru, Calisma, Cevap, Cihaz, Denetim, Depo, Ic, IcSonucu, Kal, Kys, KysMaddesi, KysSekmesi, OzDurumu, OzMaddesi, OzSikligi, Profil,
  SahaMaddesi, Surec, UretilenDokuman,
} from './tipler.ts';

// Kayıttaki metin güvenilmez: eski sürümlerden, elle düzenlenmiş yedekten ya da öteki ekrandan gelebilir. Her okumada prototipin
// `fill` / `norm*` işlevleriyle aynı kurallarla tamamlanır ve sınırlanır (alan uzunlukları, sayı sınırları, tarih biçimi).

type Ham = Record<string, unknown>;
const nesne = (v: unknown): v is Ham => v !== null && typeof v === 'object' && !Array.isArray(v);
const metin = (v: unknown, n: number): string => (typeof v === 'string' ? v.slice(0, n) : '');
const tarih = (v: unknown): string => (typeof v === 'string' && ISO_TARIH.test(v) ? v : '');
const ay = /^\d{4}-\d{2}$/;
const anahtarlar = <T extends string>(...k: T[]): ReadonlySet<string> => new Set<string>(k);

let sira = 0;
// Prototipin kimlik biçimi (öteki ekranın ürettikleriyle aynı biçim).
export const yeniKimlik = (): string => `p${Date.now().toString(36)}${(sira++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const bosOz = (): OzDurumu => ({ freq: 'monthly', size: 10, by: '', rounds: [], cur: null, last: {} });

export const bosCalisma = (): Calisma => ({
  curQ: 0, curF: 0, oz: bosOz(), wkx: [], wkAnchor: {}, prepView: 'week', ans: {}, notes: {}, ev: {}, checks: {}, docs: {}, cards: {}, trace: {},
  done: {}, exDone: {}, def: false, cur: 0, mode: 'full', quick: [], dept: '', card: 0, flipped: false, example: false, stage: 0, clause: '', phase: -1,
  chainSel: '', filter: 'risk', docq: '',
});

export const bosKys = (): Kys => ({
  sv: 'pano', fl: 'dok', tp: '', items: {}, procs: [], tab: 'nedir', filter: 'all', road: {}, start: '', prefix: '', docs: [], roles: {}, rt: {}, rtStart: '',
  gd: {}, logo: '', stamp: 'kontrolsuz',
});
export const bosKal = (): Kal => ({ devs: [], view: 'tablo', filter: 'all', q: '', month: '' });
export const bosIc = (): Ic => ({ plan: { year: 0, rows: [] }, runs: [], saha: [], tab: 'plan', cur: '' });

export function bosProfil(): Profil {
  return {
    ic: bosIc(), ux: 'rehber', onbHide: false, kal: bosKal(), view: 'home', prog: 'iso9001', updated: 0,
    profile: { firma: '', tesis: '', kapsam: '', kurulus: '', hazirlayan: '' }, audits: [],
    pw: { iso9001: bosCalisma(), as9100: bosCalisma(), eydep: bosCalisma() }, kys: bosKys(),
  };
}

const cevapMi = (v: unknown): v is Cevap => typeof v === 'string' && OZV.has(v);

function ozMaddeleri(it: unknown): Record<string, OzMaddesi> {
  const o: Record<string, OzMaddesi> = {};
  if (!nesne(it)) return o;
  for (const [k, x] of Object.entries(it)) {
    if (!nesne(x) || !cevapMi(x['v'])) continue;
    o[k] = { v: x['v'], n: typeof x['n'] === 'string' ? x['n'] : '', pv: cevapMi(x['pv']) ? x['pv'] : '' };
  }
  return o;
}

export function ozNormalize(o: unknown): OzDurumu {
  const b = bosOz();
  if (!nesne(o)) return b;
  if (typeof o['freq'] === 'string' && o['freq'] in OZF) b.freq = o['freq'] as OzSikligi;
  const boy = Number(o['size']);
  if ([5, 10, 15, 20].includes(boy)) b.size = boy;
  if (typeof o['by'] === 'string') b.by = o['by'];
  if (nesne(o['last'])) for (const [k, v] of Object.entries(o['last'])) if (tarih(v)) b.last[k] = v as string;
  if (Array.isArray(o['rounds'])) {
    b.rounds = o['rounds'].filter((r): r is Ham => nesne(r) && tarih(r['date']) !== '').map((r) => ({
      id: String(r['id'] ?? `r${Math.random().toString(36).slice(2, 9)}`),
      date: r['date'] as string,
      by: typeof r['by'] === 'string' ? r['by'] : '',
      kind: typeof r['kind'] === 'string' ? r['kind'] : 'rot',
      items: ozMaddeleri(r['items']),
    })).filter((r) => Object.keys(r.items).length > 0);
  }
  const c = o['cur'];
  if (nesne(c) && tarih(c['date']) && Array.isArray(c['qids'])) {
    const ci: AcikOzTuru['items'] = {};
    if (nesne(c['items'])) {
      for (const [q, x] of Object.entries(c['items'])) {
        if (nesne(x)) ci[q] = { v: cevapMi(x['v']) ? x['v'] : '', n: typeof x['n'] === 'string' ? x['n'] : '' };
      }
    }
    b.cur = {
      id: String(c['id'] ?? `r${String(Date.now())}`),
      date: c['date'] as string,
      by: typeof c['by'] === 'string' ? c['by'] : '',
      kind: typeof c['kind'] === 'string' ? c['kind'] : 'rot',
      qids: c['qids'].filter((x): x is string => typeof x === 'string'),
      items: ci,
    };
  }
  return b;
}

// Prototip `fillWS`: alan yalnız aynı türdeyse alınır.
export function calismaNormalize(src: unknown): Calisma {
  const b = bosCalisma();
  if (nesne(src)) {
    const hedef = b as unknown as Ham;
    for (const k of Object.keys(b)) {
      const v = src[k];
      const bv = hedef[k];
      if (v !== undefined && v !== null && typeof v === typeof bv && Array.isArray(v) === Array.isArray(bv)) hedef[k] = v;
    }
  }
  b.oz = ozNormalize(nesne(src) ? src['oz'] : undefined);
  b.wkx = (b.wkx as unknown[]).filter((x): x is Ham => nesne(x) && typeof x['id'] === 'string' && tarih(x['w']) !== '' && typeof x['t'] === 'string')
    .map((x) => ({ id: x['id'] as string, w: x['w'] as string, t: (x['t'] as string).slice(0, 300), done: !!x['done'] }));
  if (!tarih(b.wkAnchor.ad) || !tarih(b.wkAnchor.from)) b.wkAnchor = {};
  if (b.prepView !== 'phase') b.prepView = 'week';
  b.flipped = false;
  return b;
}

const SEVIYE = anahtarlar('major', 'minor', 'obs');

export function denetimNormalize(a: unknown): Denetim | null {
  if (!nesne(a) || !tarih(a['date'])) return null;
  const r = nesne(a['res']) ? a['res'] : {};
  const date = a['date'] as string;
  const end = tarih(a['end']);
  const sayi = (v: unknown): number => Math.max(0, Number(v) || 0);
  const areas: Partial<Record<string, number>> = {};
  if (nesne(r['areas'])) {
    for (const k of EY_KEYS) {
      const v = r['areas'][k];
      if (v !== '' && v != null && !Number.isNaN(Number(v))) areas[k] = Math.max(0, Math.min(100, Math.round(Number(v))));
    }
  }
  return {
    id: typeof a['id'] === 'string' && a['id'] ? a['id'] : yeniKimlik(),
    prog: programMi(a['prog']) ? a['prog'] : 'iso9001',
    kind: a['kind'] === 'deadline' ? 'deadline' : 'audit',
    parent: typeof a['parent'] === 'string' ? a['parent'] : '',
    sub: a['sub'] === 'docs' || a['sub'] === 'ncr' ? a['sub'] : '',
    type: typeof a['type'] === 'string' ? a['type'] : '',
    date,
    end: end && end > date ? end : '',
    cb: typeof a['cb'] === 'string' ? a['cb'] : '',
    note: typeof a['note'] === 'string' ? a['note'] : '',
    status: a['status'] === 'done' || a['status'] === 'cancel' ? a['status'] : 'plan',
    res: {
      major: sayi(r['major']),
      minor: sayi(r['minor']),
      obs: sayi(r['obs']),
      score: r['score'] === '' || r['score'] == null ? '' : Math.max(0, Math.min(100, Number(r['score']) || 0)),
      items: Array.isArray(r['items'])
        ? r['items'].filter((x): x is Ham => nesne(x) && typeof x['lvl'] === 'string' && SEVIYE.has(x['lvl'])).slice(0, 300).map((x) => ({
          lvl: x['lvl'] as 'major' | 'minor' | 'obs',
          g: typeof x['g'] === 'string' ? x['g'] : '',
          c: metin(x['c'], 20),
          t: metin(x['t'], 400),
        }))
        : [],
      areas,
    },
  };
}

// Prototipin yeni denetim kaydı: eksik alanlar boş, durum plan.
export const yeniDenetim = (alanlar: Partial<Omit<Denetim, 'res'>> & { date: string }): Denetim => denetimNormalize(alanlar) as Denetim;

const KYS_SEKMESI = anahtarlar('nedir', 'yol', 'blok', 'surec', 'dosya', 'gorev', 'rutin', 'uret', 'sema');

export function kysNormalize(k: unknown): Kys {
  const b = bosKys();
  if (!nesne(k)) return b;
  if (nesne(k['items'])) {
    for (const [id, x] of Object.entries(k['items'])) {
      if (!nesne(x)) continue;
      const st = Number(x['st']);
      const o: KysMaddesi = {
        st: st === 1 || st === 2 ? st : 0, date: tarih(x['date']),
        code: metin(x['code'], 300), rev: metin(x['rev'], 300), owner: metin(x['owner'], 300), note: metin(x['note'], 300),
      };
      b.items[id] = o;
    }
  }
  if (Array.isArray(k['procs'])) {
    b.procs = k['procs'].filter((p): p is Ham => nesne(p) && typeof p['id'] === 'string' && typeof p['name'] === 'string').slice(0, 80).map((p) => {
      const vals: Record<string, number> = {};
      if (nesne(p['vals'])) {
        for (const [m, v] of Object.entries(p['vals'])) if (ay.test(m) && v !== '' && v != null && !Number.isNaN(Number(v))) vals[m] = Number(v);
      }
      const hedef = p['target'];
      const o: Surec = {
        id: p['id'] as string, name: (p['name'] as string).slice(0, 120),
        type: typeof p['type'] === 'string' && p['type'] in PTYPE ? p['type'] as Surec['type'] : 'a',
        dir: p['dir'] === 'le' ? 'le' : 'ge', vals,
        owner: metin(p['owner'], 300), inputs: metin(p['inputs'], 300), outputs: metin(p['outputs'], 300), kpi: metin(p['kpi'], 300),
        unit: metin(p['unit'], 300), res: metin(p['res'], 300), who: metin(p['who'], 300), how: metin(p['how'], 300), risk: metin(p['risk'], 300),
        target: hedef === '' || hedef == null || Number.isNaN(Number(hedef)) ? '' : Number(hedef),
      };
      return o;
    });
  }
  if (typeof k['tab'] === 'string' && KYS_SEKMESI.has(k['tab'])) b.tab = k['tab'] as KysSekmesi;
  if (nesne(k['gd'])) {
    for (const [gk, gv] of Object.entries(k['gd'])) {
      if (!nesne(gv) || gk.length > 80) continue;
      const secs: Record<string, string> = {};
      if (nesne(gv['secs'])) for (const [sk, sv] of Object.entries(gv['secs'])) if (typeof sv === 'string') secs[sk] = sv.slice(0, 30000);
      const go: UretilenDokuman = {
        st: gv['st'] === 'yayin' ? 'yayin' : gv['st'] === 'taslak' ? 'taslak' : '', secs,
        hist: Array.isArray(gv['hist'])
          ? gv['hist'].filter((h): h is Ham => nesne(h) && tarih(h['date']) !== '').slice(-60)
            .map((h) => ({ rev: String(h['rev'] ?? '').slice(0, 6), date: h['date'] as string, note: String(h['note'] ?? '').slice(0, 300) }))
          : [],
        code: metin(gv['code'], 100), rev: metin(gv['rev'], 100) || '00', prep: metin(gv['prep'], 100), appr: metin(gv['appr'], 100),
        pub: tarih(gv['pub']), date: tarih(gv['date']),
      };
      b.gd[gk] = go;
    }
  }
  const logo = k['logo'];
  if (typeof logo === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo) && logo.length < 400000) b.logo = logo;
  if (typeof k['stamp'] === 'string' && anahtarlar('', 'kontrollu', 'kontrolsuz', 'taslak').has(k['stamp'])) b.stamp = k['stamp'] as Kys['stamp'];
  if (typeof k['sv'] === 'string' && anahtarlar('pano', 'akis', 'etk', 'kap', 'org', 'agac').has(k['sv'])) b.sv = k['sv'];
  if (typeof k['fl'] === 'string' && /^[a-z]{2,12}$/.test(k['fl'])) b.fl = k['fl'];
  if (typeof k['tp'] === 'string') b.tp = k['tp'].slice(0, 60);
  if (nesne(k['road'])) for (const [rd, v] of Object.entries(k['road'])) if (v === true) b.road[rd] = true;
  b.start = tarih(k['start']);
  b.rtStart = tarih(k['rtStart']);
  if (typeof k['prefix'] === 'string') b.prefix = k['prefix'].slice(0, 10);
  if (Array.isArray(k['docs'])) {
    b.docs = k['docs'].filter((x): x is Ham => nesne(x) && typeof x['id'] === 'string' && typeof x['name'] === 'string').slice(0, 500).map((x) => ({
      id: x['id'] as string, code: metin(x['code'], 200), name: metin(x['name'], 200), type: metin(x['type'], 200), rev: metin(x['rev'], 200),
      owner: metin(x['owner'], 200), loc: metin(x['loc'], 200), gen: metin(x['gen'], 200), date: tarih(x['date']),
    }));
  }
  if (nesne(k['roles'])) {
    for (const [rk, rv] of Object.entries(k['roles'])) if (nesne(rv)) b.roles[rk] = { kisi: metin(rv['kisi'], 100), vekil: metin(rv['vekil'], 100) };
  }
  if (nesne(k['rt'])) {
    for (const [rq, v] of Object.entries(k['rt'])) if (Array.isArray(v)) b.rt[rq] = v.filter((x): x is string => typeof x === 'string').slice(-60);
  }
  if (typeof k['filter'] === 'string' && anahtarlar('all', 'missing', 'late', 'z', 'as', 'ey').has(k['filter'])) b.filter = k['filter'];
  return b;
}

export function kalNormalize(k: unknown): Kal {
  const b = bosKal();
  if (!nesne(k)) return b;
  if (Array.isArray(k['devs'])) {
    b.devs = k['devs'].filter((x): x is Ham => nesne(x) && typeof x['id'] === 'string').slice(0, 2000).map((x) => {
      const o: Cihaz = {
        id: x['id'] as string, no: metin(x['no'], 200), ad: metin(x['ad'], 200), marka: metin(x['marka'], 200), seri: metin(x['seri'], 200),
        aralik: metin(x['aralik'], 200), coz: metin(x['coz'], 200), yer: metin(x['yer'], 200), sorumlu: metin(x['sorumlu'], 200), lab: metin(x['lab'], 200),
        cert: metin(x['cert'], 200), kabul: metin(x['kabul'], 200), note: metin(x['note'], 200),
        tur: typeof x['tur'] === 'string' && x['tur'] in KTUR ? x['tur'] as Cihaz['tur'] : 'dis',
        st: typeof x['st'] === 'string' && x['st'] in KDUR ? x['st'] as Cihaz['st'] : 'aktif',
        res: typeof x['res'] === 'string' && x['res'] in KSON ? x['res'] as Cihaz['res'] : '',
        per: Math.max(1, Math.min(120, parseInt(String(x['per']), 10) || 12)), last: tarih(x['last']), nx: tarih(x['nx']),
        hist: Array.isArray(x['hist'])
          ? x['hist'].filter((h): h is Ham => nesne(h) && tarih(h['date']) !== '').slice(0, 100).map((h) => ({
            date: h['date'] as string,
            res: typeof h['res'] === 'string' && h['res'] in KSON ? h['res'] as Cihaz['hist'][number]['res'] : 'uygun',
            lab: String(h['lab'] ?? '').slice(0, 120), cert: String(h['cert'] ?? '').slice(0, 80), note: String(h['note'] ?? '').slice(0, 300),
          }))
          : [],
      };
      return o;
    });
  }
  if (k['view'] === 'tablo' || k['view'] === 'takvim') b.view = k['view'];
  if (typeof k['filter'] === 'string' && anahtarlar('all', 'gec', 'yak', 'ok', 'pasif').has(k['filter'])) b.filter = k['filter'];
  if (typeof k['q'] === 'string') b.q = k['q'].slice(0, 80);
  if (typeof k['month'] === 'string' && ay.test(k['month'])) b.month = k['month'];
  return b;
}

const IC_SONUCU = anahtarlar('u', 'g', 'm', 'M', 'na');
const SAHA_SONUCU = anahtarlar('ok', 'no', 'na');

export function icNormalize(o: unknown): Ic {
  const b = bosIc();
  if (!nesne(o)) return b;
  const S = (x: unknown, n: number): string => String(x ?? '').slice(0, n);
  const plan = o['plan'];
  if (nesne(plan)) {
    b.plan.year = Number(plan['year']) || 0;
    if (Array.isArray(plan['rows'])) {
      b.plan.rows = plan['rows'].filter((r): r is Ham => nesne(r) && typeof r['pid'] === 'string').slice(0, 100).map((r) => ({
        pid: r['pid'] as string, aud: S(r['aud'], 80),
        months: Array.isArray(r['months']) ? r['months'].filter((m): m is string => typeof m === 'string' && ay.test(m)).slice(0, 24) : [],
      }));
    }
  }
  if (Array.isArray(o['runs'])) {
    b.runs = o['runs'].filter((r): r is Ham => nesne(r) && typeof r['id'] === 'string' && tarih(r['date']) !== '').slice(0, 400).map((r) => ({
      id: r['id'] as string, pid: S(r['pid'], 40), pname: S(r['pname'], 120), date: r['date'] as string, aud: S(r['aud'], 80), done: !!r['done'],
      audId: S(r['audId'], 40),
      items: Array.isArray(r['items'])
        ? r['items'].slice(0, 80).map((i: unknown) => {
          const x = nesne(i) ? i : {};
          return { t: S(x['t'], 300), c: S(x['c'], 20), g: S(x['g'], 4), h: S(x['h'], 300), r: (typeof x['r'] === 'string' && IC_SONUCU.has(x['r']) ? x['r'] : '') as IcSonucu, n: S(x['n'], 400) };
        })
        : [],
    }));
  }
  if (Array.isArray(o['saha'])) {
    b.saha = o['saha'].filter((r): r is Ham => nesne(r) && typeof r['id'] === 'string' && tarih(r['date']) !== '' && typeof r['tpl'] === 'string').slice(0, 600)
      .map((r) => ({
        id: r['id'] as string, tpl: r['tpl'] as string, date: r['date'] as string, by: S(r['by'], 80), done: !!r['done'],
        items: Array.isArray(r['items'])
          ? r['items'].slice(0, 30).map((i: unknown): SahaMaddesi => {
            const x = nesne(i) ? i : {};
            return { r: (typeof x['r'] === 'string' && SAHA_SONUCU.has(x['r']) ? x['r'] : '') as SahaMaddesi['r'], n: S(x['n'], 300), fix: !!x['fix'] };
          })
          : [],
      }));
  }
  if (typeof o['tab'] === 'string' && anahtarlar('plan', 'yurut', 'saha').has(o['tab'])) b.tab = o['tab'];
  if (typeof o['cur'] === 'string') b.cur = o['cur'];
  return b;
}

// Prototip `fill`.
export function profilNormalize(src: unknown): Profil {
  const b = bosProfil();
  if (!nesne(src)) return b;
  if (typeof src['view'] === 'string') b.view = src['view'];
  if (programMi(src['prog'])) b.prog = src['prog'];
  if (typeof src['updated'] === 'number') b.updated = src['updated'];
  if (src['onbHide'] === true) b.onbHide = true;
  if (src['ux'] === 'uzman') b.ux = 'uzman';
  const pr = nesne(src['profile']) ? src['profile'] : {};
  for (const f of Object.keys(b.profile) as (keyof Profil['profile'])[]) {
    const v = pr[f];
    if (typeof v === 'string') b.profile[f] = v;
  }
  const pw = src['pw'];
  if (nesne(pw)) for (const k of PROGRAM_SIRASI) b.pw[k] = calismaNormalize(pw[k]);
  else b.pw.iso9001 = calismaNormalize(src);
  b.kys = kysNormalize(src['kys']);
  b.kal = kalNormalize(src['kal']);
  b.ic = icNormalize(src['ic']);
  if (Array.isArray(src['audits'])) b.audits = src['audits'].map(denetimNormalize).filter((a): a is Denetim => a !== null);
  else if (tarih(src['auditDate'])) {
    const a = denetimNormalize({ prog: 'iso9001', type: typeof pr['tur'] === 'string' ? pr['tur'] : '', date: src['auditDate'], cb: typeof pr['kurulus'] === 'string' ? pr['kurulus'] : '' });
    if (a) b.audits = [a];
  }
  return b;
}

// Prototip `load`: kayıt metni bozuksa ya da boşsa tek boş profil açılır. Eski sürüm anahtarlarından aktarım yalnız öteki ekranda kalır
// (yerel depo artık sunucudadır; eski anahtarlar TMI'ye hiç gelmedi).
export function depoOku(metinDegeri: string | null): Depo {
  let j: unknown = null;
  if (metinDegeri) {
    try { j = JSON.parse(metinDegeri); } catch { j = null; }
  }
  const depo: Depo = { active: '', order: [], data: {}, lastBackup: 0 };
  if (nesne(j) && Array.isArray(j['order']) && nesne(j['data'])) {
    const veri = j['data'];
    depo.order = j['order'].filter((id): id is string => typeof id === 'string' && veri[id] != null);
    for (const id of depo.order) depo.data[id] = profilNormalize(veri[id]);
    depo.active = typeof j['active'] === 'string' ? j['active'] : '';
    depo.lastBackup = typeof j['lastBackup'] === 'number' ? j['lastBackup'] : 0;
  }
  if (depo.order.length === 0) {
    const id = yeniKimlik();
    depo.order = [id];
    depo.data[id] = bosProfil();
    depo.active = id;
  }
  if (!depo.data[depo.active]) depo.active = depo.order[0] ?? '';
  return depo;
}

export const depoMetni = (d: Depo): string => JSON.stringify(d);
