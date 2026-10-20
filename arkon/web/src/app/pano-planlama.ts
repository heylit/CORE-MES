import { AKStore } from '../data/store';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { kayitIlgili, seyrelt } from '../data/log-tepki';
import { istasyonPaketleri, istasyonPlanOzeti, adimIstegi, planOnce, siralamaIstegi, siralamayiGonder, tmiPlani } from '../data/tmi-plan';
import { CALLS, Fragment, I, REASONS, ST, fmt, html, isPlannedReason, pad, reasonOf, useCallback, useEffect, useNow, useState } from './temel';
import { LS, download } from './yukleyici';
import { DOWNS, ME, PLANT, act_, allowed, audit, can, currentShift, downNext, downNow, downWindows, expandDown, machineOf, oeeCalc, setDOWNS, shiftWindows, stationList, wcOf } from './ortak-ayarlar';
import { VardiyaTanimsiz, pctS } from './operator-parcalar';
import { anlikPencereler } from '../data/vardiya-gunu';
import { OPTYPES, StationSelect, opOf } from './istasyonlar';
import { Bus, PSTAT, PlanChip, apPending, uidg } from './hazirlik';
import { Brand, useTheme } from './baslat';
import { kalanAdet } from '../data/sayac-halkasi';

/* ══════════ PANO, PLANLAMA, BAKIM, RAPORLAR (v25) ══════════ */
/* ── ortak: bildirim, belge listesi, sayfa çerçevesi, CSV ── */
export function useToast() {
  const [toast, setToast] = useState(null);
  const say = useCallback((m, i = 'check', c = 'var(--done)') => setToast({ m, i, c, k: Date.now() }), []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  const el = toast ? html`<div key=${toast.k} className="toast" role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}</div>` : null;
  return [say, el] as const;
}
/** Bir deponun bütün belgeleri; başka ekranda / cihazda değişince tazelenir */
export function useDocs(store, alsoOn?) {
  const [list, setList] = useState(null);
  const load = useCallback(() => AKStore.DB.all(store).then(setList).catch(() => setList([])), [store]);
  useEffect(() => { load(); return Bus.on(m => { if (m.type === store || (m.store === store && (m.type === '$db' || m.type === '$merged')) || (alsoOn && alsoOn.includes(m.type))) setTimeout(load, 150); }); }, [load]);
  return [list || [], load, list !== null];
}
export async function putDoc(store, doc, msg?) { await AKStore.DB.put(store, doc); Bus.send(Object.assign({ type: store, id: doc.id }, msg || {})); }
export async function delDoc(store, id) { await AKStore.DB.del(store, id); Bus.send({ type: store, id, del: true }); }
export function PageShell({ icon, title, color, extra, children, mainClass }) {
  const [theme, setTheme] = useTheme(), now = useNow(30000), d = new Date(now);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.setAttribute('data-state', 'done'); document.title = 'Üretim Hazırlık · ' + title; }, [theme, title]);
  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <header className="top">
        <${Brand} /><span className="vsep"></span>
        <div className="sbig prepmode" style=${{ '--sig': color, color }}><${I} n=${icon} s=${20} /><span className="sname" style=${{ color }}>${title}</span></div>
        ${extra || null}
        <div className="sp"></div>
        <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>${currentShift(now).label}</small></div>
        <button className="iconbtn" onClick=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Tema değiştir"><${I} n=${theme === 'dark' ? 'sun' : 'moon'} /></button>
      </header>
      <main className=${'xmain ' + (mainClass || '')}>${children}</main>
    </div>
  </${Fragment}>`;
}
export function Segs({ v, opts, onChange, cls }) { return html`<div className=${'segs ' + (cls || '')}>${opts.map(([k, l, n]) => html`<button key=${k} className=${'seg ' + (v === k ? 'on' : '')} onClick=${() => onChange(k)}>${l}${n ? html` <b className="segn">${n}</b>` : null}</button>`)}</div>`; }
export function WcFilter({ v, onChange }) {
  const wcs = PLANT.wcs.filter(act_); if (wcs.length < 2) return null;
  return html`<div className="chips">${[['', 'Tümü']].concat(wcs.map(w => [w.id, w.name])).map(([k, l]) => html`<button key=${k} className=${'chp ' + (v === k ? 'on' : '')} onClick=${() => onChange(k)}>${l}</button>`)}</div>`;
}
/** Excel'de açılan CSV (UTF-8 BOM, ; ayraç) */
export function csvDownload(name, rows) {
  const esc = v => { const s0 = v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v); return /[;"\n]/.test(s0) ? '"' + s0.replace(/"/g, '""') + '"' : s0; };
  download(name.replace(/[^\wİıŞşĞğÜüÖöÇç.-]+/g, '_') + '.csv', String.fromCharCode(0xfeff) + rows.map(r => r.map(esc).join(';')).join('\r\n'), 'text/csv');
}
export const hm = t => pad(new Date(t).getHours()) + ':' + pad(new Date(t).getMinutes());
export const dmy = t => new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
export const dmyhm = t => t ? dmy(t) + ' ' + hm(t) : '—';
export const mins = ms => Math.round((ms || 0) / 60000);
export const minsL = ms => { const m = mins(ms); return m >= 60 ? Math.floor(m / 60) + ' sa ' + (m % 60) + ' dk' : m + ' dk'; };
/** Çağrı kayıtlarını çağrı başına topla: { id, team, machine, open, ack, esc, done, ackBy } */
export function callsFrom(rows) {
  const by: Record<string, any> = {};
  for (const r of rows || []) { const c = by[r.callId] = by[r.callId] || { id: r.callId, team: r.team, machine: r.machine, wc: r.wc }; c[r.phase] = Math.min(c[r.phase] || Infinity, r.at); if (r.phase === 'open') { c.by = r.userName; c.note = r.note; } if (r.phase === 'ack') c.ackBy = r.userName; }
  return Object.values<any>(by).filter(c => c.open);
}
/* istasyon durumu → renk / ad */
export function stLook(state, reason, planned) {
  if (state === 'stopped' && (planned || isPlannedReason(reason))) return { c: 'var(--done)', l: 'Planlı duruş' };
  if (state === 'none' || !ST[state]) return { c: 'var(--idle)', l: 'Veri yok' };
  return ST[state];
}

/* ══ Fabrika panosu (#pano): bütün istasyonlar canlı · TV modu ══ */
export function BoardApp() {
  const [say, toastEl] = useToast();
  const [wc, setWc] = useState(LS.get('boardWc') || ''), [tv, setTv] = useState(false), [d, setD] = useState(null);
  const now = useNow(5000);
  const load = useCallback(async () => {
    const t = Date.now(), sh = currentShift(t), L = AKStore.Log, D = AKStore.DB;
    try {
      const [ev, cn, calls, pk, rs, mt] = await Promise.all([L.query('events', { from: t - 3 * 864e5, limit: 20000 }), L.query('counts', { from: sh.s, limit: 20000 }), L.query('calls', { from: t - 12 * 3600e3, limit: 5000 }), D.all('pkgs'), D.all('results'), D.all('maint')]);
      setD({ ev, cn, calls: callsFrom(calls), pk, rs: Object.fromEntries(rs.map(r => [r.id, r])), mt, sh, at: t });
    } catch (e) { console.warn(e); }
  }, []);
  useEffect(() => { load(); const s = seyrelt(load, 300); const off = AKStore.Log.on(k => { if (kayitIlgili(k, null, ['events', 'counts', 'calls'], null)) s.tetikle(); }); const off2 = Bus.on(m => { if (/^(call|progress|pkg|maint|downs|cfg)/.test(m.type) || m.type === '$log') s.tetikle(); }); const t = setInterval(load, 20000); return () => { off(); off2(); s.birak(); clearInterval(t); }; }, [load]);
  useEffect(() => { document.documentElement.classList.toggle('tv', tv); return () => document.documentElement.classList.remove('tv'); }, [tv]);
  const goTv = async () => { const on = !tv; setTv(on); try { if (on && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch (e) {} };
  const sts = stationList().filter(s => !wc || s.wc === wc);
  const tiles = !d ? [] : sts.map(s => {
    const ev = d.ev.filter(e => e.machine === s.id), last = ev[ev.length - 1];
    const state = last ? last.state : 'none', pkg = (last && d.pk.find(p => p.id === last.pkgId)) || istasyonPaketleri(d.pk, s.id)[0], bekleyen = istasyonPlanOzeti(d.pk, s.id);
    const res = pkg ? d.rs[pkg.id] : null, cn = d.cn.filter(c => c.machine === s.id);
    const c = oeeCalc({ ev, cn, from: d.sh.s, to: Math.min(now, d.sh.e), st: s.id, windows: anlikPencereler(d.sh) });
    const dn = downNow(s.id, now), nx = dn ? null : downNext(s.id, now, 60 * 60e3);
    const calls = d.calls.filter(x => x.machine === s.id && !x.done && !x.cancel && now - x.open < 12 * 3600e3);
    const mts = d.mt.filter(m => m.type === 'ariza' && m.status !== 'done' && m.st === s.id);
    const look = stLook(state, last && last.reason, last && last.planned);
    return { s, last, state, pkg, bekleyen, res, c, dn, nx, calls, mts, look, since: last ? last.at : null, tanimsiz: !!d.sh.tanimsiz };
  });
  const agg = tiles.reduce((a, t) => { a.run += t.c.run; a.planned += t.c.planned; a.ideal += t.c.ideal; a.good += t.c.good; a.scrap += t.c.scrap; a.stop += t.c.stopMs; return a; }, { run: 0, planned: 0, ideal: 0, good: 0, scrap: 0, stop: 0 });
  const A = agg.planned ? Math.min(1, agg.run / agg.planned) : null, P = agg.run && agg.ideal ? Math.min(1, agg.ideal / agg.run) : null, Q = agg.good + agg.scrap ? agg.good / (agg.good + agg.scrap) : null;
  const cnt = k => tiles.filter(t => k(t)).length;
  const openCalls = d ? d.calls.filter(x => !x.done && !x.cancel && now - x.open < 12 * 3600e3 && (!wc || machineOf(x.machine).wc === wc)).sort((a, b) => a.open - b.open) : [];
  const groups = []; tiles.forEach(t => { let g = groups.find(x => x.wc === t.s.wc); if (!g) groups.push(g = { wc: t.s.wc, name: t.s.wcName || 'İş merkezi atanmamış', list: [] }); g.list.push(t); });
  const extra = html`<button className="btn" onClick=${goTv}><${I} n="expand" s=${18} />${tv ? 'TV modundan çık' : 'TV modu'}</button>`;
  return html`<${PageShell} icon="grid" title="Fabrika panosu" color="var(--run)" extra=${extra} mainClass="boardmain">
    ${PLANT.wcs.filter(act_).length > 1 ? html`<div className="plantop"><${WcFilter} v=${wc} onChange=${v => { setWc(v); LS.set('boardWc', v); }} /></div>` : null}
    <div className="bsum">
      ${d && d.sh.tanimsiz ? html`<${VardiyaTanimsiz} />` : html`<div className="glass bk big"><span className="over">OEE · Vardiya ${d ? d.sh.name : ''}</span><b>${pctS(A != null && P != null && Q != null ? A * P * Q : null)}</b><small>K ${pctS(A)} · P ${pctS(P)} · Q ${pctS(Q)}</small></div>`}
      <div className="glass bk"><span className="over">Çalışıyor</span><b style=${{ color: 'var(--run)' }}>${cnt(t => t.state === 'running')}</b><small>/ ${tiles.length} istasyon</small></div>
      <div className="glass bk"><span className="over">Plansız duruş</span><b style=${{ color: 'var(--stop)' }}>${cnt(t => t.state === 'stopped' && t.look.l !== 'Planlı duruş')}</b><small>${minsL(agg.stop)} bu vardiya</small></div>
      <div className="glass bk"><span className="over">Planlı duruş</span><b style=${{ color: 'var(--done)' }}>${cnt(t => t.dn || t.look.l === 'Planlı duruş')}</b><small>takvim + planlı neden</small></div>
      <div className="glass bk"><span className="over">Üretim · vardiya</span><b>${fmt(agg.good)}</b><small>${fmt(agg.scrap)} hurda</small></div>
      <div className="glass bk"><span className="over">Açık çağrı</span><b style=${{ color: openCalls.length ? 'var(--hazard-ink)' : 'var(--muted)' }}>${openCalls.length}</b><small>${openCalls.filter(c => c.esc).length ? openCalls.filter(c => c.esc).length + ' yükseltildi' : 'yükseltilen yok'}</small></div>
    </div>
    <div className="bwrap">
      <div className="bgrid">${!d ? html`<p className="muted">Yükleniyor…</p>` : !tiles.length ? html`<div className="glass empty" style=${{ padding: 30 }}><${I} n="layers" s=${36} /><b>İstasyon yok</b><small className="muted">Ayarlar › Tesis yapısı'ndan istasyon ekleyin.</small></div>` : groups.map(g => html`<section key=${g.wc} className="bgrp"><span className="over">${g.name}</span><div className="btiles">${g.list.map(t => html`<${BoardTile} key=${t.s.id} t=${t} now=${now} />`)}</div></section>`)}</div>
      <aside className="bside">
        <div className="glass bcalls"><span className="over">Açık çağrılar</span>${openCalls.length ? openCalls.map(c => html`<div key=${c.id} className=${'bcall ' + (c.esc ? 'esc' : c.ack ? 'ack' : '')}><b>${c.machine} · ${(CALLS.find(x => x.k === c.team) || { l: c.team }).l}</b><small>${c.ack ? 'Üstlendi: ' + (c.ackBy || '') + ' · ' : c.esc ? 'YÜKSELTİLDİ · ' : 'Bekliyor · '}${mins(now - c.open)} dk${c.note ? ' · ' + c.note : ''}</small></div>`) : html`<small className="muted">Açık çağrı yok</small>`}</div>
        <div className="glass bcalls"><span className="over">Açık arızalar</span>${d && d.mt.filter(m => m.type === 'ariza' && m.status !== 'done' && (!wc || machineOf(m.st).wc === wc)).length ? d.mt.filter(m => m.type === 'ariza' && m.status !== 'done' && (!wc || machineOf(m.st).wc === wc)).map(m => html`<div key=${m.id} className="bcall"><b>${m.st}${m.mc ? ' · ' + m.mc : ''}</b><small>${m.title} · ${mins(now - m.openedAt)} dk${m.ackBy ? ' · ' + m.ackBy : ''}</small></div>`) : html`<small className="muted">Açık arıza yok</small>`}</div>
        <div className="glass bcalls"><span className="over">Yaklaşan planlı duruşlar · 8 saat</span>${(() => { const L = []; const seen = new Set(); for (const s of sts) for (const w of downWindows(s.id, now, now + 8 * 3600e3)) { const k = w.d.id + w.s; if (seen.has(k)) continue; seen.add(k); L.push(w); } L.sort((a, b) => a.s - b.s); return L.length ? L.slice(0, 8).map(w => html`<div key=${w.d.id + w.s} className="bcall plan"><b>${w.d.title || (reasonOf(w.d.reason) || {}).l}</b><small>${hm(w.s)}–${hm(w.e)} · ${w.d.scope === 'all' ? 'bütün tesis' : w.d.scope === 'wc' ? (wcOf(w.d.target) || { name: w.d.target }).name : w.d.target}</small></div>`) : html`<small className="muted">Yok</small>`; })()}</div>
      </aside>
    </div>
    ${toastEl}
  </${PageShell}>`;
}
export function BoardTile({ t, now }) {
  const { s, pkg, bekleyen, res, c, look } = t, prog = pkg && pkg.target ? Math.min(1, ((res && res.good) || 0) / pkg.target) : null;
  return html`<div className=${'glass btile ' + (t.state === 'stopped' && look.l !== 'Planlı duruş' ? 'stop' : '')} style=${{ '--c': look.c }}>
    <div className="bth"><b className="mono">${s.id}</b><span className="bst"><i></i>${look.l}${t.since ? ' · ' + minsL(now - t.since) : ''}</span></div>
    <small className="bnm">${s.name}${s.mcs.length === 1 ? ' · ' + s.mcs[0].name : ''}</small>
    ${t.state === 'stopped' && t.last && t.last.reason ? html`<div className="brsn">${(reasonOf(t.last.reason) || { l: t.last.reason }).l}</div>` : t.state === 'stopped' ? html`<div className="brsn warn">Neden girilmedi</div>` : null}
    ${pkg ? html`<div className="bord"><span>${pkg.no}</span><b>${pkg.part}</b>${prog != null ? html`<div className="bbar"><i style=${{ width: (prog * 100) + '%' }}></i></div><small>${fmt((res && res.good) || 0)} / ${fmt(pkg.target)}</small>` : null}</div>` : html`<div className="bord muted">İş yok</div>`}${bekleyen ? html`<div className="bord muted"><${I} n="clock" s=${13} /> ${bekleyen}</div>` : null}
    <div className="bfoot">${t.tanimsiz ? html`<span title="Aktif vardiya tanımlı değil"><${I} n="alert" s=${13} /> Vardiya tanımsız</span>` : html`<span title="Bu vardiyanın OEE'si">OEE <b>${pctS(c.oee)}</b></span>`}<span>İyi <b>${fmt(c.good)}</b></span><span>Hurda <b style=${{ color: c.scrap ? 'var(--stop)' : null }}>${c.scrap}</b></span></div>
    ${t.calls.length || t.mts.length || t.dn || t.nx ? html`<div className="bflags">${t.calls.map(x => html`<span key=${x.id} className=${'bf ' + (x.esc ? 'esc' : 'call')}><${I} n="bell" s=${12} />${(CALLS.find(k => k.k === x.team) || { l: x.team }).l}${x.ack ? ' ✓' : ''}</span>`)}${t.mts.length ? html`<span className="bf mt"><${I} n="wrench" s=${12} />Arıza</span>` : null}${t.dn ? html`<span className="bf pd"><${I} n="clock" s=${12} />Planlı → ${hm(t.dn.e)}</span>` : t.nx ? html`<span className="bf pd"><${I} n="clock" s=${12} />${hm(t.nx.s)} planlı</span>` : null}</div>` : null}
  </div>`;
}

/* ══ Planlama (#planlama): istasyon şeritleri, sıra, içe aktarma · planlı duruş takvimi ══ */
/** Termin metnini zamana çevir: "14:30", "05.10", "05.10.2026", "Yarın 16:00", "2026-10-05 14:00" */
export function parseDue(txt, base?) {
  const s0 = String(txt || '').trim(); if (!s0) return null; const b = new Date(base || Date.now());
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s0); if (m) return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59).getTime();
  m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s0); if (m) { const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : b.getFullYear(); return new Date(y, +m[2] - 1, +m[1], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59).getTime(); }
  m = /^(yarın|yarin)?\s*(\d{1,2}):(\d{2})$/i.exec(s0); if (m) { const d = new Date(b); d.setHours(+m[2], +m[3], 0, 0); if (m[1]) d.setDate(d.getDate() + 1); return d.getTime(); }
  return null;
}
/** İstasyonun çalışılabilir zaman dilimleri (vardiya − mola − planlı duruş), şimdiden itibaren 21 gün */
export function availSlots(st, from) {
  const to = from + 21 * 864e5, out = [];
  for (const w of shiftWindows(from, to)) {
    const cut = (w.breaks || []).concat(downWindows(st, w.s, w.e)).map(x => [x.s, x.e]).sort((a, b) => a[0] - b[0]);
    let t = Math.max(w.s, from);
    for (const [a, b] of cut) { if (b <= t) continue; if (a > t) out.push([t, Math.min(a, w.e)]); t = Math.max(t, b); if (t >= w.e) break; }
    if (t < w.e) out.push([t, w.e]);
  }
  return out.filter(x => x[1] > x[0]);
}
/** sıradaki işlerin tahmini başlangıç / bitişi */
export function schedule(st, items, from) {
  const slots = availSlots(st, from); let si = 0, t = slots[0] ? slots[0][0] : from;
  return items.map(x => {
    let need = x.ms, start = null;
    while (need > 0 && si < slots.length) { const [a, b] = slots[si]; if (t < a) t = a; if (start == null) start = t; const take = Math.min(need, b - t); need -= take; t += take; if (t >= b) si++; }
    return { start: start == null ? t : start, end: need > 0 ? null : t };
  });
}
export function PlanApp() {
  const [say, toastEl] = useToast();
  const [tab, setTab] = useState(LS.get('planTab') || 'orders');
  const [pk, reloadPk] = useDocs('pkgs', ['pkg', 'pkg-removed', 'pkg-approval', 'pkg-approved', 'progress']);
  const [rs, reloadRs] = useDocs('results', ['progress', 'result']);
  const setT = k => { setTab(k); LS.set('planTab', k); };
  return html`<${PageShell} icon="list" title="Plan Kuyruğu" color="var(--hazard-ink)" extra=${html`<${Segs} v=${tab} onChange=${setT} opts=${[['orders', 'İş emirleri'], ['downs', 'Planlı duruşlar', DOWNS.filter(x => x.active !== false).length || null]]} />`} mainClass="planmain">
    ${tab === 'orders' ? html`<${OrdersBoard} pk=${pk} rs=${rs} say=${say} reload=${() => { reloadPk(); reloadRs(); }} />` : html`<${DownsView} say=${say} />`}
    ${toastEl}
  </${PageShell}>`;
}
// TMI ana menüsündeki Kuyruk sayfası: planın salt okunur görünümü; sıra ve istasyon yalnız Plan Kuyruğu'nda değişir.
export function KuyrukApp() {
  const [say, toastEl] = useToast();
  const [pk, reloadPk] = useDocs('pkgs', ['pkg', 'pkg-removed', 'pkg-approval', 'pkg-approved', 'progress']);
  const [rs, reloadRs] = useDocs('results', ['progress', 'result']);
  return html`<${PageShell} icon="list" title="Plan Kuyruğu" color="var(--hazard-ink)" extra=${html`<span className="chip" style=${{ '--c': 'var(--idle)' }}><i></i>Salt okunur</span>`} mainClass="planmain">
    <${OrdersBoard} pk=${pk} rs=${rs} say=${say} salt=${true} reload=${() => { reloadPk(); reloadRs(); }} />
    ${toastEl}
  </${PageShell}>`;
}
export function OrdersBoard({ pk, rs, say, reload, salt = false }) {
  const [wc, setWc] = useState(LS.get('planWc') || ''), [showDone, setShowDone] = useState(false), [drag, setDrag] = useState(null), [over, setOver] = useState(null);
  const now = useNow(60000), edit = !salt && can('plan.edit');
  // Canlı plan sürümü paketlerden önce okunur (`siralamayiGonder`): açılışta, sürüm yokken ve ret gelince önce sürüm, sonra paketler.
  const [planSurumu, setPlanSurumu] = useState(null);
  const yenile = async () => { try { setPlanSurumu((await AKStore.Plan.surum()).planSurumu); } catch (e) { setPlanSurumu(null); } reload(); };
  useEffect(() => { if (edit) yenile(); }, []);
  const R = Object.fromEntries((rs || []).map(r => [r.id, r]));
  const done = p => R[p.id] && R[p.id].state === 'done';
  const lanes = stationList().filter(s => !wc || s.wc === wc);
  const known = new Set(stationList(true).map(s => s.id));
  const items = pk.filter(p => showDone || !done(p));
  const sortL = L => L.slice().sort((a, b) => planOnce(a, b) || (a.seq ?? 1e9) - (b.seq ?? 1e9) || (parseDue(a.due) || 9e15) - (parseDue(b.due) || 9e15) || (a.createdAt || 0) - (b.createdAt || 0));
  const remainMs = p => { const r = R[p.id], left = kalanAdet(p.target, (r && r.good) || 0, (r && r.scrap) || 0); return left * (p.cycle || 0) * 1000; };
  // TMI'den gelen işin istasyonu TMI planından değişir: taşınan paketin kaydı TMI'de reddedilir. Aynı şeritte sıra değiştirme serbesttir.
  const tmiIsi = p => String(p.id).startsWith('tmi-');
  const moveTo = async (p, st, beforeId?) => {
    if (!allowed('plan.edit', say)) return;
    if (tmiIsi(p) && p.machine !== st) { say('İstasyon TMI planından değişir', 'x', 'var(--stop)'); return; }
    if (tmiPlani(p)) { await planaSirala(p, st, beforeId); return; }
    const mt = machineOf(st).t, pt = opOf(p);
    if (known.has(st) && mt !== pt && !confirm(p.no + ' bir ' + OPTYPES[pt].l + ' paketi; ' + st + ' istasyonu ' + (OPTYPES[mt] || OPTYPES.cnc).l + ' tipinde. Yine de taşınsın mı?')) return;
    const lane = sortL(items.filter(x => x.machine === st && x.id !== p.id));
    const idx = beforeId ? Math.max(0, lane.findIndex(x => x.id === beforeId)) : lane.length; lane.splice(idx < 0 ? lane.length : idx, 0, p);
    const moved = p.machine !== st;
    for (let i = 0; i < lane.length; i++) { const x = lane[i], seq = (i + 1) * 10; if (tmiPlani(x)) continue; if (x.seq === seq && !(x.id === p.id && moved)) continue; await AKStore.DB.put('pkgs', Object.assign({}, x, { seq }, x.id === p.id ? { machine: st, mc: moved ? '' : x.mc } : null)); }
    if (moved && p.status !== 'draft') { Bus.send({ type: 'pkg-removed', id: p.id }); Bus.send({ type: 'pkg', id: p.id, no: p.no, rev: p.rev, version: p.version, machine: st }); }
    else Bus.send({ type: 'pkg-order', machine: st });
    audit('plan', moved ? 'istasyon değişti' : 'sıra değişti', p.no, moved ? p.machine + ' → ' + st : st + ' · ' + (idx + 1) + '. sıra');
    say(moved ? p.no + ' → ' + st : p.no + ' sırası güncellendi', 'check', 'var(--run)'); reload();
  };
  // Rotalı TMI işinin sırası planındır (A4): plan taslağına yazılır, ekran ve operatör müdür canlıya alınca değişir.
  const planaSirala = async (p, st, beforeId) => {
    if (!tmiPlani(p).canli) { say('Plana yerleşmemiş iş sıralanamaz', 'x', 'var(--stop)'); return; }
    const once = sortL(items.filter(x => x.machine === st)), yeni = once.filter(x => x.id !== p.id);
    const idx = beforeId ? yeni.findIndex(x => x.id === beforeId) : -1; yeni.splice(idx < 0 ? yeni.length : idx, 0, p);
    await planaGonder(p, st, siralamaIstegi(once, yeni, p));
  };
  const planaGonder = async (p, st, istek) => {
    if (!istek) { say('Plan sırası değişmedi', 'check', 'var(--idle)'); return; }
    const r = await siralamayiGonder(istek, planSurumu, AKStore.Plan.sirala);
    if (r.sonuc === 'yazildi') { audit('plan', 'plan taslağına sıra', p.no, st); say('Taslağa yazıldı · canlıya alınınca geçerli', 'check', 'var(--run)'); return; }
    say(r.ileti, 'x', 'var(--stop)'); if (r.yenile) await yenile();
  };
  const step = (p, st, dir) => { const L = sortL(items.filter(x => x.machine === st));
    if (tmiPlani(p)) { if (!allowed('plan.edit', say)) return; if (!tmiPlani(p).canli) { say('Plana yerleşmemiş iş sıralanamaz', 'x', 'var(--stop)'); return; } planaGonder(p, st, adimIstegi(L, p, dir)); return; }
    const i = L.findIndex(x => x.id === p.id), j = i + dir; if (j < 0 || j >= L.length) return; moveTo(p, st, dir < 0 ? L[j].id : (L[j + 1] || {}).id); };
  const card = (p, st, sc) => {
    const r = R[p.id], good = (r && r.good) || 0, prog = p.target ? Math.min(1, good / p.target) : 0, due = parseDue(p.due, p.createdAt), late = due && sc && sc.end && sc.end > due, running = r && r.state === 'running';
    const stt = PSTAT[done(p) ? 'done' : r && r.state && r.state !== 'queued' && p.status !== 'draft' ? 'production' : apPending(p) ? 'review' : p.status] || PSTAT.draft;
    return html`<div key=${p.id} className=${'pcard ' + (drag === p.id ? 'drag ' : '') + (over === p.id ? 'over ' : '') + (late ? 'late' : '')} draggable=${edit} onDragStart=${e => { setDrag(p.id); e.dataTransfer.setData('text/plain', p.id); }} onDragEnd=${() => { setDrag(null); setOver(null); }} onDragOver=${e => { if (drag) { e.preventDefault(); setOver(p.id); } }} onDrop=${e => { e.preventDefault(); e.stopPropagation(); const x = pk.find(q => q.id === e.dataTransfer.getData('text/plain')); setOver(null); if (x && x.id !== p.id) moveTo(x, st, p.id); }}>
      <div className="pch"><span className="mono">${p.no}</span>${p.priority === 'urgent' ? html`<span className="tag urgent">Acil</span>` : null}<span className="chip" style=${{ '--c': stt.c }}><i></i>${running ? 'Çalışıyor' : stt.l}</span><${PlanChip} p=${p} /></div>
      <b>${p.part || 'Adsız parça'}</b><small className="muted">${p.op || ''} · Rev ${p.rev}</small>
      <div className="bbar"><i style=${{ width: (prog * 100) + '%' }}></i></div>
      <div className="pcm"><span>${fmt(good)} / ${fmt(p.target || 0)}</span><span>${minsL(remainMs(p))}</span></div>
      <div className="pcm"><span>${sc && sc.start ? 'Başlar ' + dmyhm(sc.start) : ''}</span><span className=${late ? 'lt' : ''}>${sc && sc.end ? 'Biter ' + dmyhm(sc.end) : sc ? 'Takvime sığmıyor' : ''}</span></div>
      ${p.due ? html`<div className="pcm"><span>Termin ${p.due}</span>${late ? html`<span className="lt">Gecikecek</span>` : null}</div>` : null}
      ${edit ? html`<div className="pcbtn"><button className="x" onClick=${() => step(p, st, -1)} aria-label="Yukarı"><${I} n="chevu" s=${14} /></button><button className="x" onClick=${() => step(p, st, 1)} aria-label="Aşağı"><${I} n="chevd" s=${14} /></button><select value=${known.has(st) ? st : ''} disabled=${tmiIsi(p)} title=${tmiIsi(p) ? 'İstasyon TMI planından değişir' : null} onChange=${e => e.target.value && moveTo(p, e.target.value)} aria-label="İstasyona taşı"><option value="">Taşı…</option>${stationList().map(s => html`<option key=${s.id} value=${s.id}>${s.id}</option>`)}</select></div>` : null}
    </div>`;
  };
  const laneEl = (id, title, sub, L, isSt) => {
    const sorted = sortL(L), sc = isSt ? schedule(id, sorted.map(p => ({ ms: done(p) ? 0 : remainMs(p) })), now) : [];
    const tot = sorted.reduce((a, p) => a + (done(p) ? 0 : remainMs(p)), 0), lastEnd = sc.length ? sc[sc.length - 1].end : null;
    return html`<div key=${id} className=${'plane glass ' + (drag && over === 'lane:' + id ? 'over' : '')} onDragOver=${e => { if (drag) { e.preventDefault(); if (over !== 'lane:' + id && !sorted.some(p => p.id === over)) setOver('lane:' + id); } }} onDrop=${e => { e.preventDefault(); const x = pk.find(q => q.id === e.dataTransfer.getData('text/plain')); setOver(null); if (x && isSt) moveTo(x, id); }}>
      <div className="plh"><b className="mono">${title}</b><small>${sub}</small><small className="muted">${sorted.length} iş · ${minsL(tot)}${lastEnd ? ' · biter ' + dmyhm(lastEnd) : ''}</small>${isSt && downNow(id, now) ? html`<span className="chip" style=${{ '--c': 'var(--done)' }}><i></i>Planlı duruşta</span>` : null}</div>
      <div className="plb">${sorted.map((p, i) => card(p, id, sc[i]))}${!sorted.length ? html`<small className="muted pempty">${edit ? 'İş emri sürükle' : 'İş yok'}</small>` : null}</div>
    </div>`;
  };
  const orphan = items.filter(p => !known.has(p.machine));
  return html`<div className="planw">
    <div className="plantop"><${WcFilter} v=${wc} onChange=${v => { setWc(v); LS.set('planWc', v); }} /><label className="sw2"><input type="checkbox" checked=${showDone} onChange=${e => setShowDone(e.target.checked)} />Tamamlananları göster</label><span className="sp"></span>
      <small className="muted">Tahminler vardiya, mola ve planlı duruşlara göre · kalan adet × çevrim süresi</small></div>
    <div className="lanes">${orphan.length ? laneEl('-', 'Atanmamış', 'İstasyonu tanımsız', orphan, false) : null}${lanes.map(s => laneEl(s.id, s.id, s.name + (s.wcName ? ' · ' + s.wcName : ''), items.filter(p => p.machine === s.id), true))}</div>
  </div>`;
}
/* Planlı duruş takvimi */
export const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const toLocalInput = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export function DownsView({ say }) {
  const [list, reload] = useDocs('downs', ['cfg']), [ed, setEd] = useState(null), now = useNow(60000), edit = can('down.edit');
  const save = async () => {
    const d = Object.assign({}, ed); if (!d.reason) return say('Neden seç', 'alert', 'var(--stop)'); if (!(d.to > d.from)) return say('Bitiş başlangıçtan sonra olmalı', 'alert', 'var(--stop)');
    if (d.scope !== 'all' && !d.target) return say((d.scope === 'wc' ? 'İş merkezi' : 'İstasyon') + ' seç', 'alert', 'var(--stop)');
    d.title = d.title || (reasonOf(d.reason) || {}).l; d.by = d.by || ME(); d.at = d.at || Date.now();
    await putDoc('downs', d); setDOWNS(await AKStore.DB.all('downs')); Bus.send({ type: 'cfg' }); audit('planlı duruş', ed.isNew ? 'eklendi' : 'değiştirildi', d.title, dmyhm(d.from) + '–' + hm(d.to) + (d.rep && d.rep !== 'none' ? ' · ' + (d.rep === 'daily' ? 'her gün' : 'haftalık') : '') + ' · ' + scopeL(d));
    setEd(null); reload(); say('Planlı duruş kaydedildi', 'check', 'var(--run)');
  };
  const del = async d => { if (!confirm(d.title + ' silinsin mi?')) return; await delDoc('downs', d.id); setDOWNS(await AKStore.DB.all('downs')); Bus.send({ type: 'cfg' }); audit('planlı duruş', 'silindi', d.title); reload(); };
  const scopeL = d => d.scope === 'all' ? 'Bütün tesis' : d.scope === 'wc' ? 'İş merkezi · ' + ((wcOf(d.target) || {}).name || d.target) : 'İstasyon · ' + d.target;
  const day0 = new Date(now).setHours(0, 0, 0, 0), span = 7 * 864e5, X = t => Math.max(0, Math.min(100, (t - day0) / span * 100));
  const nw = () => { const s0 = new Date(now + 864e5); s0.setHours(8, 0, 0, 0); return { id: 'dn-' + uidg(), isNew: true, title: '', reason: (REASONS.find(r => r.cat === 'p') || {}).code, scope: 'st', target: (stationList()[0] || {}).id || '', from: s0.getTime(), to: s0.getTime() + 2 * 3600e3, rep: 'none', days: [1, 2, 3, 4, 5], until: null, note: '' }; };
  const F = (k, v) => setEd(Object.assign({}, ed, { [k]: v }));
  const sorted = list.slice().sort((a, b) => ((expandDown(a, now - 864e5, now + 60 * 864e5)[0] || { s: 9e15 }).s) - ((expandDown(b, now - 864e5, now + 60 * 864e5)[0] || { s: 9e15 }).s));
  return html`<div className="downw">
    <div className="plantop"><span className="over">Planlı duruşlar OEE'de planlı üretim süresinden düşülür; operatör ekranında uyarı çıkar, plan tahminleri bunlara göre kayar.</span><span className="sp"></span>${edit ? html`<button className="btn pri" onClick=${() => setEd(nw())}><${I} n="plus" s=${18} />Planlı duruş ekle</button>` : null}</div>
    ${ed ? html`<div className="glass uedit dform">
      <div className="plgrid">
        <label className="fld"><span className="over">Neden</span><select value=${ed.reason || ''} onChange=${e => F('reason', e.target.value)}>${REASONS.filter(r => r.cat === 'p' && r.active !== false).map(r => html`<option key=${r.code} value=${r.code}>${r.l}</option>`)}</select></label>
        <label className="fld"><span className="over">Başlık (isteğe bağlı)</span><input value=${ed.title || ''} onChange=${e => F('title', e.target.value)} placeholder=${(reasonOf(ed.reason) || {}).l || ''} /></label>
        <label className="fld"><span className="over">Kapsam</span><select value=${ed.scope} onChange=${e => setEd(Object.assign({}, ed, { scope: e.target.value, target: e.target.value === 'wc' ? (PLANT.wcs[0] || {}).id : e.target.value === 'st' ? (stationList()[0] || {}).id : '' }))}><option value="all">Bütün tesis</option><option value="wc">İş merkezi</option><option value="st">İstasyon</option></select></label>
        ${ed.scope === 'wc' ? html`<label className="fld"><span className="over">İş merkezi</span><select value=${ed.target || ''} onChange=${e => F('target', e.target.value)}>${PLANT.wcs.map(w => html`<option key=${w.id} value=${w.id}>${w.name}</option>`)}</select></label>` : ed.scope === 'st' ? html`<label className="fld"><span className="over">İstasyon</span><${StationSelect} v=${ed.target} onChange=${v => F('target', v)} /></label>` : null}
        <label className="fld"><span className="over">Başlangıç</span><input type="datetime-local" value=${toLocalInput(ed.from)} onChange=${e => { const t = new Date(e.target.value).getTime(); if (t) setEd(Object.assign({}, ed, { from: t, to: t + (ed.to - ed.from) })); }} /></label>
        <label className="fld"><span className="over">Bitiş</span><input type="datetime-local" value=${toLocalInput(ed.to)} onChange=${e => { const t = new Date(e.target.value).getTime(); if (t) F('to', t); }} /></label>
        <label className="fld"><span className="over">Tekrar</span><select value=${ed.rep} onChange=${e => F('rep', e.target.value)}><option value="none">Bir kez</option><option value="daily">Her gün</option><option value="weekly">Haftanın günleri</option></select></label>
        ${ed.rep !== 'none' ? html`<label className="fld"><span className="over">Bitiş tarihi (boş: süresiz)</span><input type="date" value=${ed.until ? toLocalInput(ed.until).slice(0, 10) : ''} onChange=${e => F('until', e.target.value ? new Date(e.target.value + 'T23:59').getTime() : null)} /></label>` : null}
      </div>
      ${ed.rep === 'weekly' ? html`<div className="chips">${[1, 2, 3, 4, 5, 6, 0].map(k => html`<button key=${k} className=${'chp ' + ((ed.days || []).includes(k) ? 'on' : '')} onClick=${() => F('days', (ed.days || []).includes(k) ? ed.days.filter(x => x !== k) : (ed.days || []).concat([k]))}>${DAYS[k]}</button>`)}</div>` : null}
      <label className="fld"><span className="over">Not</span><input value=${ed.note || ''} onChange=${e => F('note', e.target.value)} placeholder="örn. yıllık bakım firması gelecek" /></label>
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setEd(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div>
    </div>` : null}
    <div className="glass dtl">
      <div className="dth"><span></span><div className="dtdays">${[0, 1, 2, 3, 4, 5, 6].map(i => html`<span key=${i}>${DAYS[new Date(day0 + i * 864e5).getDay()]} ${dmy(day0 + i * 864e5)}</span>`)}</div></div>
      ${sorted.length ? sorted.map(d => { const occ = expandDown(d, day0, day0 + span), nx = expandDown(d, now, now + 400 * 864e5)[0]; return html`<div key=${d.id} className=${'dtr ' + (d.active === false ? 'off' : '')}>
        <div className="dtn"><b>${d.title || (reasonOf(d.reason) || {}).l}</b><small>${scopeL(d)} · ${hm(d.from)}–${hm(d.to)}${d.rep === 'daily' ? ' · her gün' : d.rep === 'weekly' ? ' · ' + (d.days || []).map(k => DAYS[k]).join(' ') : ' · ' + dmy(d.from)}${nx ? '' : ' · geçmiş'}</small>${edit ? html`<div><button className="lnk" onClick=${() => setEd(Object.assign({}, d))}>Düzenle</button><button className="lnk" style=${{ color: 'var(--stop)' }} onClick=${() => del(d)}>Sil</button></div>` : null}</div>
        <div className="dtt">${[1, 2, 3, 4, 5, 6].map(i => html`<i key=${i} className="dtg" style=${{ left: (i / 7 * 100) + '%' }}></i>`)}<i className="dtnow" style=${{ left: X(now) + '%' }}></i>${occ.map((w, i) => html`<span key=${i} className="dtb" style=${{ left: X(w.s) + '%', width: Math.max(0.6, X(w.e) - X(w.s)) + '%' }} title=${dmyhm(w.s) + ' – ' + hm(w.e)}></span>`)}</div>
      </div>`; }) : html`<p className="muted" style=${{ padding: 16 }}>Planlı duruş yok. Bakım, toplantı, eğitim, sayım gibi olayları buraya gir; OEE hesabı ve iş planı bunlara göre ayarlanır.</p>`}
    </div>
  </div>`;
}

