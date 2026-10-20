import type { AppMode, Perm, PermMatrix, Plant, PlannedDown, Policy, Role, Shift } from '@shared/model';
import { AKStore } from '../data/store';
import { REASONS, REASONS0, SCRAPS, SCRAPS0, isPlannedReason, reasonColor, setREASONS, setSCRAPS } from './temel';
import { LS } from './yukleyici';
import { istasyonSec } from '../data/istasyon-sec';
import { beep } from './operator-parcalar';
import { nedenKaynagi } from './neden-kaynagi';
import { GAUGES, setGAUGES } from './bakim-raporlar';
import { durusToplamlari, enCokPlansiz, isDegisiminiDurusSay, nedenToplamlari } from '../data/durus-nedeni';
import { kapaliGun, kapaliGunEtiketi, tatilleriOku, type Tatiller } from '../data/tatil';

/* ── Ortak ayarlar: vardiyalar ve çalışma modu (kv 'shifts', 'mode' · sunucu modunda bütün cihazlarda aynı) ── */
// Aktif vardiya tanımı yoksa liste boştur: varsayılan vardiya uydurulmaz, OEE ve vardiya süresi hesaplanmaz.
export let SHIFTS: Shift[] = [], APPMODE: AppMode = { demo: true };
// TMI tatil ve kapalı günleri (kv 'holidays'): o gün başlayan vardiya penceresi yoktur.
export let HOLIDAYS: Tatiller = {};
/* ── Tesis yapısı: İş merkezi › İstasyon › Makine (kv 'plant') ──
   İstasyon: tabletin durduğu iş yeri; iş paketleri istasyona gönderilir (pkg.machine = istasyon kodu, kayıtlarda "machine").
   Makine: istasyondaki tezgâh/ekipman (bir istasyonda hiç ya da birden çok olabilir; pkg.mc ile pakete bağlanabilir). */
export const PLANT_DEMO: Plant = {
  wcs: [{ id: 'TAL', name: 'Talaşlı imalat' }, { id: 'SKL', name: 'Şekillendirme' }, { id: 'KAL', name: 'Kalite' }, { id: 'LOJ', name: 'Depo ve lojistik' }, { id: 'YZY', name: 'Markalama ve yüzey işlem' }, { id: 'MNT', name: 'Montaj' }],
  sts: [{ id: 'TZG-04', name: 'CNC Torna · Hücre 2', wc: 'TAL', t: 'cnc' }, { id: 'TZG-05', name: 'CNC Torna · Hücre 2', wc: 'TAL', t: 'cnc' }, { id: 'FRZ-11', name: 'Dik işlem · Hücre 5', wc: 'TAL', t: 'cnc' }, { id: 'PRS-02', name: 'Pres · Hücre 1', wc: 'SKL', t: 'cnc' },
    { id: 'KAL-01', name: 'Final muayene', wc: 'KAL', t: 'kalite' }, { id: 'DEPO-1', name: 'Merkez depo · Toplama', wc: 'LOJ', t: 'depo' }, { id: 'MRK-01', name: 'Lazer markalama · Hücre 3', wc: 'YZY', t: 'mark' }, { id: 'BOYA-1', name: 'Toz boya hattı', wc: 'YZY', t: 'boya' }, { id: 'MNT-01', name: 'Montaj hattı 1', wc: 'MNT', t: 'montaj' }],
  mcs: [{ id: 'M-TZG-04', name: 'CNC torna tezgâhı', kind: 'CNC torna', st: 'TZG-04' }, { id: 'M-TZG-05', name: 'CNC torna tezgâhı', kind: 'CNC torna', st: 'TZG-05' }, { id: 'M-FRZ-11', name: 'Dik işlem merkezi', kind: 'CNC freze', st: 'FRZ-11' },
    { id: 'M-PRS-02', name: 'Hidrolik pres', kind: 'Pres', st: 'PRS-02' }, { id: 'M-CMM-01', name: 'Koordinat ölçüm makinesi', kind: 'CMM', st: 'KAL-01' }, { id: 'M-LZR-01', name: 'Fiber lazer markalama', kind: 'Lazer', st: 'MRK-01' }, { id: 'M-FRN-01', name: 'Kürleme fırını', kind: 'Fırın', st: 'BOYA-1' }]
};
export const PLANT_EMPTY: Plant = { wcs: [], sts: [], mcs: [] };
export let PLANT: Plant = PLANT_DEMO;
export const MC_CONN = [['', 'Bağlantı yok'], ['focas', 'FANUC FOCAS'], ['opcua', 'OPC UA'], ['mtc', 'MTConnect'], ['modbus', 'Modbus TCP'], ['io', 'Dijital giriş (sayaç)']];
export const act_ = x => x && x.active !== false;
export const wcOf = id => PLANT.wcs.find(w => w.id === id) || null;
/** İstasyon listesi (eski MACHINES biçiminde: id, l, t) + iş merkezi ve makineler */
export const stationList = (all?) => PLANT.sts.filter(s => all || act_(s)).map(s => { const w = wcOf(s.wc); return { id: s.id, l: s.id + ' · ' + (s.name || '') + (w ? ' · ' + w.name : ''), t: s.t || 'cnc', wc: s.wc || '', wcName: w ? w.name : '', name: s.name || '', active: act_(s), mcs: PLANT.mcs.filter(m => m.st === s.id && act_(m)) }; });
export const machineOf = id => stationList(true).find(m => m.id === id) || { id, l: id || '—', t: 'cnc', wc: '', wcName: '', name: '', mcs: [] };
export const mcOf = id => PLANT.mcs.find(m => m.id === id) || null;
/** Bu cihaz bir istasyon tableti mi? (istasyon bu cihazda seçilmiş ve kişi üretim kaydı yapabiliyor) — ofisten operatör ekranına bakan kişiler istasyon kaydını bozmasın */
export const isStationTablet = () => (!!LS.get('station') || (APPMODE.demo && !MEU())) && can('prod.run');
/** Bu tabletin istasyonu: kayıtlı istasyon, yoksa kişinin TMI'de atandığı istasyon, o da yoksa ilk istasyon */
export const myStation = () => istasyonSec(LS.get('station'), (MEU() || {}).st, stationList().map(x => x.id), (MEU() || {}).sts);

/* ── Roller (sabit) ve işlem yetki matrisi (kv 'perms' · yönetici düzenler) ── */
export const ROLES: [Role, string][] = [['admin', 'Yönetici'], ['plan', 'Üretim planlama'], ['prep', 'Proses / hazırlık'], ['quality', 'Kalite kontrol'], ['lead', 'Vardiya amiri'], ['maint', 'Bakım'], ['operator', 'Operatör']];
export const ROLE_L = Object.fromEntries(ROLES);
export const PERMS: { g: string; k: Perm; l: string }[] = [
  { g: 'Ekranlar', k: 'page.op', l: 'Operatör ekranı' }, { g: 'Ekranlar', k: 'page.board', l: 'Fabrika panosu' }, { g: 'Ekranlar', k: 'page.plan', l: 'Plan Kuyruğu' }, { g: 'Ekranlar', k: 'page.prep', l: 'Üretim Terminali Hazırlık' }, { g: 'Ekranlar', k: 'page.quality', l: 'Kalite istasyonu' }, { g: 'Ekranlar', k: 'page.maint', l: 'Bakım' }, { g: 'Ekranlar', k: 'page.report', l: 'Raporlar' }, { g: 'Ekranlar', k: 'page.draw', l: 'Çizim stüdyosu' },
  { g: 'Üretim', k: 'prod.run', l: 'Üretimi başlat / durdur, parça say' }, { g: 'Üretim', k: 'prod.fix', l: 'Sayım düzeltme (−1, sayı gir)' }, { g: 'Üretim', k: 'prod.station', l: 'Tabletin istasyonunu değiştir' }, { g: 'Üretim', k: 'prod.ack', l: 'Çağrıları üstlen' }, { g: 'Üretim', k: 'logi.req', l: 'Malzeme iste, teslim et / al' }, { g: 'Üretim', k: 'logi.handle', l: 'Malzeme taleplerini karşıla (depo)' },
  { g: 'Planlama', k: 'plan.edit', l: 'İş emri sırası, istasyon ataması, içe aktarma' }, { g: 'Planlama', k: 'down.edit', l: 'Planlı duruş takvimi' },
  { g: 'Hazırlık', k: 'pkg.edit', l: 'Paket oluştur / düzenle' }, { g: 'Hazırlık', k: 'pkg.publish', l: 'Paketi istasyona yayınla / geri çek' }, { g: 'Hazırlık', k: 'pkg.del', l: 'Paket sil' }, { g: 'Hazırlık', k: 'pkg.approve', l: 'Paketi onayla (yayın onayı)' },
  { g: 'Kalite', k: 'q.meas', l: 'Kalite ölçümü gir (elle / CMM)' }, { g: 'Kalite', k: 'q.decide', l: 'Numune onay / red kararı' }, { g: 'Kalite', k: 'q.report', l: 'SPC ve ölçüm raporu' }, { g: 'Kalite', k: 'gauge.edit', l: 'Ölçü aletleri ve kalibrasyon' },
  { g: 'Bakım', k: 'maint.work', l: 'Arıza kaydı aç / kapat' }, { g: 'Bakım', k: 'maint.plan', l: 'Periyodik bakım planı' },
  { g: 'Yönetim', k: 'adm.users', l: 'Kullanıcılar ve PIN' }, { g: 'Yönetim', k: 'adm.plant', l: 'Tesis yapısı (iş merkezi, istasyon, makine)' }, { g: 'Yönetim', k: 'adm.shifts', l: 'Vardiyalar ve molalar' }, { g: 'Yönetim', k: 'adm.backup', l: 'Yedekleme ve geri yükleme' }, { g: 'Yönetim', k: 'adm.demo', l: 'Tanıtım verileri' }, { g: 'Yönetim', k: 'adm.reasons', l: 'Duruş / hurda nedenleri, çalışma kuralları' }, { g: 'Yönetim', k: 'adm.audit', l: 'Değişiklik günlüğü' }
];
export const PERM_L = Object.fromEntries(PERMS.map(p => [p.k, p.l]));
export const PERMS0: PermMatrix = {
  plan: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'prod.station', 'q.report', 'adm.shifts', 'plan.edit', 'down.edit', 'logi.handle'],
  prep: ['page.op', 'page.board', 'page.plan', 'page.prep', 'page.quality', 'page.report', 'page.draw', 'pkg.edit', 'pkg.publish', 'pkg.del', 'prod.station', 'q.report'],
  quality: ['page.op', 'page.board', 'page.quality', 'page.report', 'q.meas', 'q.decide', 'q.report', 'prod.ack', 'pkg.approve', 'gauge.edit'],
  lead: ['page.op', 'page.board', 'page.plan', 'page.quality', 'page.maint', 'page.report', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'q.report', 'adm.shifts', 'down.edit', 'logi.req', 'maint.work'],
  maint: ['page.op', 'page.board', 'page.maint', 'page.report', 'prod.ack', 'prod.station', 'maint.work', 'maint.plan'],
  operator: ['page.op', 'prod.run', 'logi.req']
};
/* v24'te kaydedilmiş matriste olmayan (sonradan eklenen) yetkiler için varsayılan kullanılır */
export const PERMS_V24 = ['page.op', 'page.prep', 'page.quality', 'page.draw', 'prod.run', 'prod.fix', 'prod.station', 'prod.ack', 'pkg.edit', 'pkg.publish', 'pkg.del', 'q.meas', 'q.decide', 'q.report', 'adm.users', 'adm.plant', 'adm.shifts', 'adm.backup', 'adm.demo'];
export function permsFrom(saved) {
  if (!saved) return PERMS0;
  const known = new Set(saved._known || PERMS_V24), out: Record<string, any> = {};
  for (const [r] of ROLES) { if (r === 'admin') continue; const own = Array.isArray(saved[r]) ? saved[r] : (PERMS0[r] || []); out[r] = own.concat((PERMS0[r] || []).filter(k => !known.has(k) && !own.includes(k))); }
  return out;
}
export let PERMM: PermMatrix = PERMS0;
/** Giriş yapan kişinin bu işleme yetkisi var mı? (giriş yoksa — yerel mod, kullanıcı tanımsız — her şey açık) */
export const can = k => { const u = AKStore && AKStore.Auth.current(); if (!u || u.role === 'admin') return true; return (PERMM[u.role] || []).includes(k); };
export const PAGE_PERM = { '': 'page.op', pano: 'page.board', planlama: 'page.plan', hazirlik: 'page.prep', anomali: 'page.prep', kalite: 'page.quality', bakim: 'page.maint', raporlar: 'page.report', cizim: 'page.draw', onizle: 'page.prep' };
export const canSee = h => h === 'ayarlar' || can(PAGE_PERM[h] || 'page.op');
export const firstPage = () => ['', 'pano', 'planlama', 'hazirlik', 'kalite', 'bakim', 'raporlar', 'cizim'].find(canSee) ?? 'ayarlar';
/** Kişi bu iş merkezinde çalışabilir mi? (wcs boş = her yerde) */
export const userInWc = (u, wc) => !u || u.role === 'admin' || !(u.wcs && u.wcs.length) || !wc || u.wcs.includes(wc);
export let denyT = 0;
/** Yetki yoksa uyarı verip false döner */
/* ── Çalışma kuralları (kv 'policy') ── */
export const POLICY0: Policy = { shiftLogout: true, idleLock: 30, callEsc: 5, approval: false, autoCall: true, scrapAsk: true, fpRestart: true };
export let POLICY: Policy = POLICY0;
/* ── Planlı duruş takvimi ('downs' deposu) ──
   { id, title, reason (planlı neden kodu), scope: 'all' | 'wc' | 'st', target, from, to (ms), rep: 'none' | 'daily' | 'weekly', days: [0-6], until, note } */
export let DOWNS: PlannedDown[] = [];
export const downApplies = (d, st) => { if (!d || d.active === false) return false; if (d.scope === 'all') return true; const m = machineOf(st); return d.scope === 'wc' ? d.target === m.wc : d.target === st; };
/** Bir planlı duruş kaydının [from, to) içindeki gerçekleşmeleri */
export function expandDown(d, from, to) {
  const out = [], len = d.to - d.from; if (!(len > 0) || d.active === false) return out;
  if (!d.rep || d.rep === 'none') { if (d.to > from && d.from < to) out.push({ s: d.from, e: d.to, d }); return out; }
  const t0 = new Date(d.from), h = t0.getHours(), mi = t0.getMinutes();
  for (let day = new Date(from - len).setHours(0, 0, 0, 0); day < to; day += 864e5) {
    const s0 = new Date(day).setHours(h, mi, 0, 0); if (s0 < d.from - 60e3 || (d.until && s0 > d.until)) continue;
    if (d.rep === 'weekly' && !(d.days || []).includes(new Date(s0).getDay())) continue;
    if (s0 + len > from && s0 < to) out.push({ s: s0, e: s0 + len, d });
  }
  return out;
}
/** Belirli aralıkta, bir istasyon için planlı duruş pencereleri */
export function downWindows(st, from, to, list?) { return (list || DOWNS).filter(d => downApplies(d, st)).flatMap(d => expandDown(d, from, to)).sort((a, b) => a.s - b.s); }
export const downNow = (st, t) => downWindows(st, t, t + 1).find(w => w.s <= t && w.e > t) || null;
export const downNext = (st, t, within) => downWindows(st, t, t + (within || 8 * 3600e3)).find(w => w.s > t) || null;
/** Aralıkların birleşiminin [a,b] içindeki toplam süresi */
export function unionMs(list, a, b) { const L = list.map(x => [Math.max(a, x.s), Math.min(b, x.e)]).filter(x => x[1] > x[0]).sort((x, y) => x[0] - y[0]); let tot = 0, cs = -1, ce = -1; for (const [s0, e0] of L) { if (s0 > ce) { if (ce > cs) tot += ce - cs; cs = s0; ce = e0; } else ce = Math.max(ce, e0); } if (ce > cs) tot += ce - cs; return tot; }
/** Vardiya pencereleri (rapor aralığı için): [{ s, e, breaks, name }] */
export function shiftWindows(from, to) { const out = []; for (let day = new Date(from).setHours(0, 0, 0, 0) - 864e5; day < to; day += 864e5) for (const sh of kapaliGun(HOLIDAYS, day) ? [] : SHIFTS) { const a = hm2min(sh.start), b = hm2min(sh.end); const s0 = day + a * 60e3, len = ((b - a + 1440) % 1440 || 1440) * 60e3, e0 = s0 + len; if (e0 <= from || s0 >= to) continue; const breaks = (sh.breaks || []).map(x => { let t = day + hm2min(x.at) * 60e3; if (t < s0) t += 864e5; return { s: t, e: t + (+x.min || 0) * 60e3 }; }); out.push({ s: s0, e: e0, breaks, name: sh.name }); } return out.sort((x, y) => x.s - y.s); }
/** OEE çekirdeği: bir istasyonun [from, to) aralığı. Planlı süre = vardiya süresi − molalar − planlı duruşlar (takvim + planlı nedenli duruşlar) */
export function oeeCalc({ ev, cn, from, to, st, windows }) {
  ev = (ev || []).slice().sort((a, b) => a.at - b.at);
  let state = 'none', note = null, planned0 = false; for (const e of ev) if (e.at <= from) { state = e.state; note = e.reason; }
  const ham = []; let t = from;
  const push = (x, s, n) => { if (x > t) { const L = ham[ham.length - 1]; if (L && L.s === s && L.n === n) L.t = x; else ham.push({ f: t, t: x, s, n }); t = x; } };
  for (const e of ev) { if (e.at <= from || e.at > to) continue; push(e.at, state, note); state = e.state; note = e.reason; }
  push(to, state, note);
  const segs = isDegisiminiDurusSay(ham);
  const wins = windows || [{ s: from, e: to, breaks: [] }];
  const shiftMs = wins.reduce((a, w) => a + Math.max(0, Math.min(to, w.e) - Math.max(from, w.s)), 0);
  const brks = wins.flatMap(w => w.breaks || []), dws = downWindows(st, from, to);
  const pstops = segs.filter(x => x.s === 'stopped' && isPlannedReason(x.n)).map(x => ({ s: x.f, e: x.t }));
  // planlı kayıp yalnız vardiya içinde sayılır
  const inShift = l => l.flatMap(x => wins.map(w => ({ s: Math.max(x.s, w.s), e: Math.min(x.e, w.e) })).filter(y => y.e > y.s));
  const plannedOff = unionMs(inShift(brks.concat(dws, pstops)), from, to);
  const breakMs = unionMs(inShift(brks), from, to), downMs = unionMs(inShift(dws.concat(pstops)), from, to);
  const planned = shiftMs > 0 ? Math.max(1, shiftMs - plannedOff) : 0; // vardiya penceresi yoksa planlı süre yoktur; 1 ms uydurulmaz
  const dur = k => segs.filter(x => x.s === k).reduce((a, x) => a + x.t - x.f, 0);
  const run = dur('running'), setupMs = dur('setup'), pauseMs = dur('paused');
  const stopU = segs.filter(x => x.s === 'stopped' && !isPlannedReason(x.n)), stopP = segs.filter(x => x.s === 'stopped' && isPlannedReason(x.n));
  const stopMs = stopU.reduce((a, x) => a + x.t - x.f, 0), stopPMs = stopP.reduce((a, x) => a + x.t - x.f, 0);
  cn = cn || [];
  const good = cn.filter(c => c.kind === 'good').reduce((a, c) => a + c.delta, 0), scrap = cn.filter(c => c.kind === 'scrap').reduce((a, c) => a + c.delta, 0);
  const ideal = cn.filter(c => c.delta > 0).reduce((a, c) => a + (c.planMs || 0) * c.delta, 0);
  const cyc = cn.filter(c => c.delta > 0 && c.cycleMs > 0).map(c => c.cycleMs);
  const A = planned > 0 ? Math.min(1, run / planned) : null, P = run > 0 && ideal > 0 ? Math.min(1, ideal / run) : null, Q = good + scrap > 0 ? good / (good + scrap) : null;
  const byR = nedenToplamlari(segs);
  const topReason = enCokPlansiz(durusToplamlari(segs), isPlannedReason);
  const scrapBy: Record<string, any> = {}; cn.filter(c => c.kind === 'scrap').forEach(c => { const k = c.reason || '—'; scrapBy[k] = (scrapBy[k] || 0) + c.delta; });
  return { segs, shiftMs, planned, breakMs, downMs, run, stopMs, stopPMs, setupMs, pauseMs, good, scrap, ideal, A, P, Q, oee: A != null && P != null && Q != null ? A * Math.min(1, P) * Q : null, stops: stopU.length, byR, scrapBy, topReason, best: cyc.length ? Math.min.apply(null, cyc) : null, avg: cyc.length ? cyc.reduce((a, b) => a + b, 0) / cyc.length : null, has: ev.some(e => e.at > from) || cn.length > 0 };
}
/* ── Değişiklik günlüğü ── */
export function audit(area, action, target, detail?) { try { AKStore.Log.add('audit', { area, action, target: target == null ? '' : String(target), detail: detail || null, machine: LS.get('station') || null }); } catch (e) {} }
export function allowed(k, say) { if (can(k)) return true; if (Date.now() - denyT > 1500) { denyT = Date.now(); try { beep('nok'); } catch (e) {} say && say('Yetkin yok: ' + (PERM_L[k] || k), 'lock', 'var(--stop)'); } return false; }
export async function loadCfg() {
  const S = AKStore, st = S.status(), srv = st.mode === 'server';
  // Okumalar birbirini beklemeden gider: TMI içinde her biri ayrı sunucu isteğidir, sırayla beklemek terminalin açılışını okuma sayısı
  // kadar gidiş-dönüş uzatıyordu. Sonuçlar eskisi gibi sırayla uygulanır (tesis, kipten sonra).
  const sonuc = (p: Promise<any>) => p.then(v => ({ ok: true, v }), () => ({ ok: false, v: undefined }));
  const [sh, md, pl, pm, po, rs, sc, dw, gg, hd] = await Promise.all([
    S.DB.get('kv', 'shifts'), S.DB.get('kv', 'mode'), S.DB.get('kv', 'plant'), S.DB.get('kv', 'perms'), S.DB.get('kv', 'policy'),
    S.DB.get('kv', 'reasons'), S.DB.get('kv', 'scraps'), S.DB.all('downs'), S.DB.all('gauges'), S.DB.get('kv', 'holidays'),
  ].map(sonuc));
  // Her ayar ayrı uygulanır: biri bozuksa ötekiler yine yüklenir (eski sıralı okumadaki ayrı try blokları gibi).
  const uygula = (r: { ok: boolean; v: any }, f: (v: any) => void, yoksa?: () => void) => { try { if (!r.ok) throw r; f(r.v); } catch (e) { if (yoksa) yoksa(); } };
  uygula(sh, v => { SHIFTS = v && v.length ? v : []; });
  uygula(hd, v => { HOLIDAYS = tatilleriOku(v); }, () => { HOLIDAYS = {}; });
  // Sunucuya bağlı kurulum her zaman gerçek kullanımdadır (kart #1087): tanıtım anahtarı Ayarlar'dan kalktı, kayıtlı eski 'mode' değeri tanıtımı açamaz.
  uygula(md, v => { APPMODE = st.mode === 'server' ? Object.assign({}, v || {}, { demo: false }) : Object.assign({ demo: true }, v || {}); });
  uygula(pl, v => { PLANT = v && v.sts ? Object.assign({ wcs: [], sts: [], mcs: [] }, v) : (APPMODE.demo ? PLANT_DEMO : PLANT_EMPTY); });
  uygula(pm, v => { PERMM = permsFrom(v); });
  uygula(po, v => { POLICY = Object.assign({}, POLICY0, v || {}); });
  uygula(rs, v => setREASONS(nedenKaynagi(srv, v, REASONS0).map(x => Object.assign({}, x, { c: reasonColor(x) }))), () => { if (srv && REASONS === REASONS0) setREASONS([]); });
  uygula(sc, v => setSCRAPS(nedenKaynagi(srv, v, SCRAPS0)), () => { if (srv && SCRAPS === SCRAPS0) setSCRAPS([]); });
  uygula(dw, v => { DOWNS = v; });
  uygula(gg, v => setGAUGES(v));
}
export const hm2min = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
/** Şu anki vardiya: başlangıç/bitiş (ms) ve molalar */
export function currentShift(now) {
  const d = new Date(now), mins = d.getHours() * 60 + d.getMinutes(), day0 = new Date(d).setHours(0, 0, 0, 0);
  if (!SHIFTS.length) return { name: '—', s: day0, e: day0 + 864e5, breaks: [], label: 'Vardiya tanımsız', tanimsiz: true };
  for (const sh of SHIFTS) {
    const a = hm2min(sh.start), b = hm2min(sh.end), over = a >= b, inS = over ? (mins >= a || mins < b) : (mins >= a && mins < b);
    if (!inS) continue;
    let s = day0 + a * 60e3; if (over && mins < b) s -= 864e5;
    if (kapaliGun(HOLIDAYS, s)) continue;
    const len = ((b - a + 1440) % 1440 || 1440) * 60e3, e = s + len;
    const breaks = (sh.breaks || []).map(x => { let t = new Date(s).setHours(0, 0, 0, 0) + hm2min(x.at) * 60e3; if (t < s) t += 864e5; return { s: t, e: t + (+x.min || 0) * 60e3 }; }).filter(x => x.s < e);
    return { name: sh.name, s, e, breaks, label: 'Vardiya ' + sh.name + ' · ' + sh.start + ' – ' + sh.end, tanimsiz: false };
  }
  const kapali = kapaliGun(HOLIDAYS, day0);
  return { name: '—', s: day0, e: day0 + 864e5, breaks: [], label: kapali ? kapaliGunEtiketi(kapali) : 'Vardiya dışı', tanimsiz: false };
}
/** Oturumdaki kişi */
export const ME = () => { const u = AKStore && AKStore.Auth.current(); return u ? u.name : (LS.get('opName') || 'Operatör'); };
export const MEU = () => (AKStore && AKStore.Auth.current()) || null;
export const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR');
export const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function rgbOf(c) { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const s = getComputedStyle(d).color; d.remove(); const m = s.match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }


/* başka modüllerden değiştirilen paylaşılan durum */
export function setPLANT(v: any) { PLANT = v; return v; }
export function setPERMM(v: any) { PERMM = v; return v; }
export function setSHIFTS(v: any) { SHIFTS = v; return v; }
export function setAPPMODE(v: any) { APPMODE = v; return v; }
export function setDOWNS(v: any) { DOWNS = v; return v; }
export function setPOLICY(v: any) { POLICY = v; return v; }
