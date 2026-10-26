import { AKStore } from '../data/store';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { ILETI_GITMEDI } from '../data/gonderim-hatasi';
import { numuneDugmeleri, numuneReddiEksigi, secinceOlcumeAlinir } from '../data/numune';
import { Fragment, I, dur, fmt, html, pad, pl, useCallback, useEffect, useMemo, useNow, useRef, useState } from './temel';
import { ME, MEU, ROLE_L, allowed, can, initials, machineOf } from './ortak-ayarlar';
import { fold } from './pdf-okuma';
import { BlueprintM, methOf } from './teknik-resim';
import { beep, ilkParcaKalemleri } from './operator-parcalar';
import { KALITE_MERKEZI_KARARI_ILETISI, kaliteMerkeziKarariBekler } from '../data/ilk-parca';
import { Sw, nearEdge, rulesOf } from './kurallar';
import { Bus, DB, apPending, seedIfEmpty } from './hazirlik';
import { SpcView } from './giris-ayarlar-spc';
import { ApprovalView, GaugeView } from './bakim-raporlar';
import { Brand, useMob, useTheme } from './baslat';
import { AletSecimi, olcumAletiBul, useOlcumAletleri } from './olcum-aleti-secimi';
import { ALET_ZORUNLU_ILETISI, olcumAletDamgasi } from '../../../../istemci/src/ortak/cizim/cekirdek/olcum-aleti';

/* ══════════ KALİTE · ÖLÇÜM İSTASYONU ══════════ */
export const RQ = { waiting: { l: 'Bekliyor', c: 'var(--hold)' }, measuring: { l: 'Ölçülüyor', c: 'var(--done)' }, approved: { l: 'Onaylandı', c: 'var(--run)' }, deviation: { l: 'Sapma ile onay', c: 'var(--hazard-ink)' }, rejected: { l: 'Red', c: 'var(--stop)' } };
export function QTop({ theme, onTheme, nWait, mode, setMode, nAp }) {
  const now = useNow(30000), d = new Date(now), base = location.href.split('#')[0];
  return html`<header className="top">
    <${Brand} />
    <span className="vsep"></span>
    <div className="sbig prepmode" style=${{ '--sig': 'var(--done)', color: 'var(--done)' }}><${I} n="target" s=${20} /><span className="sname" style=${{ color: 'var(--done)' }}>Kalite · ölçüm istasyonu</span></div>
    ${nWait ? html`<span className="chip" style=${{ '--c': 'var(--hold)', height: 34 }}><i></i>${nWait} numune bekliyor</span>` : null}
    ${setMode ? html`<div className="segs qmode">${[['samples', 'Numuneler', true], ['spc', 'SPC · rapor', can('q.report')], ['onay', 'Onaylar', can('pkg.approve')], ['alet', 'Ölçü aletleri', can('gauge.edit') || can('q.meas')]].filter(x => x[2]).map(([k, l]) => html`<button key=${k} className=${'seg ' + (mode === k ? 'on' : '')} onClick=${() => setMode(k)}>${l}${k === 'onay' && nAp ? html` <b className="segn">${nAp}</b>` : null}</button>`)}</div>` : null}
    <div className="sp"></div>
    <a className="callbtn tnav" ...${pl('')}><${I} n="gauge" s=${20} />Operatör</a>
    <a className="iconbtn tnav" ...${pl('hazirlik')} title="Üretim Terminali Hazırlık"><${I} n="layers" s=${22} /></a>
    <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>Kalite laboratuvarı</small></div>
    <button className="iconbtn" onClick=${onTheme} aria-label="Tema değiştir"><${I} n=${theme === 'dark' ? 'sun' : 'moon'} /></button>
    <div className="op"><span className="av" style=${{ background: 'var(--done)' }}>${initials(ME())}</span><div><b>${ME()}</b><small>${ROLE_L[(MEU() || {}).role] || 'Kalite kontrol'}</small></div></div>
  </header>`;
}
/** Ölçüm geçmişine bir satır (SPC, Cpk, ölçüm raporu) */
export function logMeas(pkg, b, m, x) {
  if (!pkg || !b || !m) return;
  const num = typeof m.v === 'number' && isFinite(m.v);
  AKStore.Log.add('meas', Object.assign({ machine: pkg.machine || null, wc: machineOf(pkg.machine).wc || null, pkgId: pkg.id, itemId: b.id, nom: b.nom, lsl: b.min, usl: b.max, value: num ? m.v : null, attr: num ? null : String(m.v), ok: !!m.ok, partCnt: m.cnt ?? null }, x));
}
/* ── CMM sonuç dosyası (CSV / TXT): ayraç, başlık ve sütunlar kendiliğinden bulunur ── */
export function splitCsv(l, d) { const o = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === d) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o.map(c => c.trim()); }
export function parseCmm(text, items): any {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
  const sc = d => lines.slice(0, 30).reduce((a, l) => { const n = splitCsv(l, d).length; return a + (n > 1 ? n : 0); }, 0);
  const dl = [';', '\t', ','].sort((a, b) => sc(b) - sc(a))[0];
  const rows = lines.map(l => splitCsv(l, dl));
  const num = c => { let t = String(c == null ? '' : c).trim().replace(/\s/g, ''); if (dl !== ',') t = t.replace(',', '.'); const m = t.match(/[-+]?\d*\.?\d+(e[-+]?\d+)?/i); return m ? parseFloat(m[0]) : null; };
  let hi = -1, cId = -1, cAct = -1, cNom = -1, cName = -1;
  for (let k = 0; k < Math.min(rows.length, 30) && hi < 0; k++) {
    const h = rows[k].map(c => fold(c));
    const a = h.findIndex(c => /^(actual|measured|meas\.?|ist|olculen|olculen deger|gercek|gerceklesen|deger|value|sonuc deger)/.test(c));
    if (a < 0) continue;
    hi = k; cAct = a;
    cNom = h.findIndex(c => /^(nominal|nom\.?|soll|anma|hedef)/.test(c));
    cId = h.findIndex(c => /^(no\.?|id|#|balon|balloon|char\.? ?(no|id)?|karakteristik( no)?|kar\.? ?no|item|sira)$/.test(c));
    cName = h.findIndex((c, i) => i !== cId && /^(name|ad|adi|feature|ozellik|label|etiket|aciklama|description|desc|olcu)/.test(c));
  }
  const data = hi >= 0 ? rows.slice(hi + 1) : rows;
  const out = [], used = new Set();
  const pool = items.filter(b => !b.gauge), cmmFirst = pool.slice().sort((p, q) => Number(methOf(q) === 'cmm') - Number(methOf(p) === 'cmm'));
  const nomOf = b => (b.min + b.max) / 2;
  for (const r of data) {
    let act;
    if (cAct >= 0) act = num(r[cAct]);
    else { act = null; for (let i = r.length - 1; i > 0; i--) { const v = num(r[i]); if (v != null) { act = v; break; } } }
    if (act == null || isNaN(act)) continue;
    const idTxt = cId >= 0 ? r[cId] : hi < 0 ? r[0] : '', nameTxt = cName >= 0 ? r[cName] : '';
    let b = null, how = '';
    const im = String(idTxt).match(/^\s*(?:B|#|K|balon|balloon|char\.?)?\s*-?\s*(\d{1,3})\s*$/i) || String(nameTxt).match(/^\s*(?:B|#|balon|balloon)\s*-?\s*(\d{1,3})\s*$/i);
    if (im) { b = pool.find(x => x.id === +im[1] && !used.has(x.id)); if (b) how = 'no'; }
    const nom = cNom >= 0 ? num(r[cNom]) : null;
    if (!b && nom != null) { let bd = 1e9; for (const x of cmmFirst) { if (used.has(x.id)) continue; const w = Math.max(0.02, x.max - x.min), d = Math.abs(nomOf(x) - nom); if (d <= w && d < bd) { bd = d; b = x; } } if (b) how = 'anma'; }
    if (!b && nameTxt) { const t = fold(nameTxt); b = pool.find(x => !used.has(x.id) && (fold(x.nom).replace(/\s/g, '') === t.replace(/\s/g, '') || (x.l && fold(x.l) === t))); if (b) how = 'ad'; }
    out.push({ key: [idTxt, nameTxt].filter(Boolean).join(' · ') || '—', act, nom, b, how });
    if (b) used.add(b.id);
  }
  return { dl: dl === '\t' ? 'sekme' : dl, header: hi >= 0, rows: out, matched: out.filter(x => x.b).length };
}
export function QualityApp() {
  const mob = useMob();
  const [qv, setQv] = useState('list'), [qmode, setQmode] = useState('samples');
  const [theme, setTheme] = useTheme();
  const [reqs, setReqs] = useState([]);
  const [pkgs, setPkgs] = useState<Record<string, any>>({});
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState('open');
  const [vals, setVals] = useState<Record<string, any>>({});
  const [sug, setSug] = useState<Record<string, any>>({});
  const [focus, setFocus] = useState(null);
  const [toast, setToast] = useState(null);
  const [note, setNote] = useState(''), [c2, setC2] = useState(false);
  const [mf, setMf] = useState('all'), [cmmImp, setCmmImp] = useState(null);
  const inputs = useRef<any>({}), cmmRef = useRef(null);
  const aletler = useOlcumAletleri(), [, setAletN] = useState(0);
  const now = useNow(1000);
  const say = useCallback((m, i = 'check', c = 'var(--done)') => setToast({ m, i, c, k: Date.now() }), []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  useEffect(() => { const f = (e: any) => say(ILETI_GITMEDI + ' · ' + ((e.detail && e.detail.msg) || ''), 'alert', 'var(--hold)'); window.addEventListener('arkon-ileti-gitmedi', f); return () => window.removeEventListener('arkon-ileti-gitmedi', f); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.setAttribute('data-state', 'done'); }, [theme]);
  const reload = async () => {
    const rs = (await DB.all('requests')).sort((a, b) => a.at - b.at); setReqs(rs);
    const ps = await DB.all('pkgs'); setPkgs(Object.fromEntries(ps.map(p => [p.id, p])));
    return rs;
  };
  useEffect(() => { (async () => { await seedIfEmpty(); const rs = await reload(); const first = rs.find(r => r.status === 'waiting' || r.status === 'measuring'); if (first) setSelId(first.id); })(); return Bus.on(m => { if (m.type === 'pkg-approval' || m.type === 'pkg-approved' || m.type === 'pkg') { reload(); if (m.type === 'pkg-approval') { beep('call'); say('Onay bekleyen paket: ' + (m.no || ''), 'target', 'var(--done)'); } } if (m.type === 'sample') { reload().then(rs => { beep('due'); say('Yeni numune: ' + m.no + ' · ' + m.machine + ' · ' + m.reason, 'target', 'var(--hold)'); setSelId(s => s || m.reqId); }); } }); }, []);
  const r = reqs.find(x => x.id === selId);
  const p = r && pkgs[r.pkgId];
  const items = r && p ? r.items.map(id => p.plan.find(b => b.id === id)).filter(Boolean) : [];
  useEffect(() => { setVals({}); setSug({}); setNote(''); setC2(false); if (r && secinceOlcumeAlinir(r.status, can('q.meas'))) { const n = Object.assign({}, r, { status: 'measuring', startedAt: Date.now() }); DB.put('requests', n).then(reload); } if (items[0]) setTimeout(() => { setFocus({ id: items[0].id, n: Date.now() }); inputs.current[items[0].id] && inputs.current[items[0].id].focus(); }, 300); }, [selId]);
  const results = (r && r.results) || {};
  const dugme = numuneDugmeleri({ olcebilir: can('q.meas'), karar: can('q.decide') });
  const save = async (b, override?) => {
    if (!allowed('q.meas', say)) return;
    const alet = olcumAletiBul(aletler, b && b.tool);
    if (!alet) { beep('nok'); say(ALET_ZORUNLU_ILETISI + (b && b.tool ? ' · ' + b.tool : ''), 'alert', 'var(--stop)'); return; }
    let v, ok;
    if (b.gauge) { ok = override === 'ok'; v = ok ? 'Geçer' : 'Geçmez'; }
    else {
      v = override != null ? override : parseFloat(String(vals[b.id] || '').replace(',', '.')); if (isNaN(v)) return;
      ok = v >= b.min - 1e-9 && v <= b.max + 1e-9;
      if (!ok && override == null) { const alts = [10, 0.1, 100, 0.01, 1000, 0.001].map(f => +(v * f).toFixed(4)).filter(x => x >= b.min - 1e-9 && x <= b.max + 1e-9); if (alts.length) { setSug(Object.assign({}, sug, { [b.id]: { v, alt: alts[0] } })); beep('nok'); return; } }
    }
    beep(ok ? 'ok' : 'nok'); setSug(Object.assign({}, sug, { [b.id]: null }));
    const edge = ok ? nearEdge(b, v, rulesOf(p).q.band) : 0;
    const n = Object.assign({}, r, { results: Object.assign({}, results, { [b.id]: Object.assign({ v, ok, at: Date.now(), cnt: r.cnt, by: ME() }, olcumAletDamgasi(alet), edge ? { edge } : null) }) });
    await DB.put('requests', n); await reload(); logMeas(p, b, { v, ok, cnt: r.cnt }, { src: 'quality', orderNo: r.no, machine: r.machine, reqId: r.id });
    const idx = items.findIndex(x => x.id === b.id), nx = items.slice(idx + 1).find(x => !n.results[x.id]) || items.find(x => !n.results[x.id]);
    if (nx) { setFocus({ id: nx.id, n: Date.now() }); setTimeout(() => inputs.current[nx.id] && inputs.current[nx.id].focus(), 50); }
  };
  const loadCmm = async f => { if (!f) return; const t = await f.text(); const R = parseCmm(t, items); R.file = f.name; setCmmImp(R); if (!R.rows.length) say('Dosyada ölçüm değeri bulunamadı', 'alert', 'var(--stop)'); };
  const applyCmm = async () => {
    if (!allowed('q.meas', say)) return;
    const R = cmmImp; if (!R) return; const add: Record<string, any> = {}; const band = rulesOf(p).q.band;
    const aletsiz = R.rows.find(x => x.b && !olcumAletiBul(aletler, x.b.tool));
    if (aletsiz) { beep('nok'); say(ALET_ZORUNLU_ILETISI + ' · ' + aletsiz.b.tool, 'alert', 'var(--stop)'); return; }
    R.rows.filter(x => x.b).forEach(x => { const b = x.b, v = +x.act.toFixed(5), ok = v >= b.min - 1e-9 && v <= b.max + 1e-9, edge = ok ? nearEdge(b, v, band) : 0; add[b.id] = Object.assign({ v, ok, at: Date.now(), cnt: r.cnt, by: 'CMM', src: 'cmm', file: R.file }, olcumAletDamgasi(olcumAletiBul(aletler, b.tool)), edge ? { edge } : null); });
    const n = Object.assign({}, r, { results: Object.assign({}, results, add) }); await DB.put('requests', n); R.rows.filter(x => x.b).forEach(x => logMeas(p, x.b, add[x.b.id], { src: 'cmm', orderNo: r.no, machine: r.machine, reqId: r.id })); await reload(); setCmmImp(null);
    const bad = Object.values<any>(add).filter(x => !x.ok).length; beep(bad ? 'nok' : 'ok');
    say('CMM sonucu yüklendi · ' + Object.keys(add).length + ' ölçü' + (bad ? ' · ' + bad + ' RED' : ''), bad ? 'alert' : 'check', bad ? 'var(--stop)' : 'var(--run)');
  };
  const decide = async (status) => {
    if (!allowed('q.decide', say)) return;
    if (status === 'rejected' && redEksigi) { say(redEksigi, 'alert', 'var(--hold)'); return; }
    const n = Object.assign({}, r, { status, decidedAt: Date.now(), decidedBy: ME(), note }, status === 'approved' && needC2 && c2 ? { c2: true } : null);
    await DB.put('requests', n);
    const res = (await DB.get('results', r.pkgId)) || { id: r.pkgId, no: r.no, meas: {}, pins: [] };
    res.meas = Object.assign({}, res.meas, n.results); res.at = Date.now(); await DB.put('results', res);
    Bus.send({ type: 'sample-result', reqId: r.id, id: r.pkgId, no: r.no, status, machine: r.machine });
    Bus.send({ type: 'result', id: r.pkgId, no: r.no });
    if (status !== 'rejected' && kaliteMerkeziKarariBekler(p, r.items || [], ilkParcaKalemleri({ pkg: p }).map(b => b.id))) say(KALITE_MERKEZI_KARARI_ILETISI, 'alert', 'var(--hold)');
    else say(status === 'rejected' ? 'Red kararı makineye iletildi' : 'Onay makineye iletildi', status === 'rejected' ? 'x' : 'check', RQ[status].c);
    const rs = await reload(); const nx = rs.find(x => x.status === 'waiting'); setSelId(nx ? nx.id : null);
  };
  const open = reqs.filter(x => x.status === 'waiting' || x.status === 'measuring'), done = reqs.filter(x => !(x.status === 'waiting' || x.status === 'measuring')).reverse();
  const list = view === 'open' ? open : done;
  const needC2 = !!(p && rulesOf(p).q.critTwice && items.some(b => b.crit));
  const nMeas = items.filter(b => results[b.id]).length, nBad = items.filter(b => results[b.id] && !results[b.id].ok).length;
  const redEksigi = numuneReddiEksigi(nMeas, note);
  const ctl = useMemo(() => r && p ? { key: 'q:' + r.id, files: p.files, primary: p.primary, derived: p.derived, cfg: p.readCfg, bal: p.plan, setBal: () => {}, readOnly: true, hideSpec: true, meas: results, focus, due: r.items.filter(id => !results[id]), onSelect: id => { setFocus({ id, n: Date.now() }); setTimeout(() => inputs.current[id] && inputs.current[id].focus(), 30); }, setMeas: m => { const nm = typeof m === 'function' ? m(results) : m; const n = Object.assign({}, r, { results: Object.fromEntries(Object.entries<any>(nm).map(([k, x]) => [k, Object.assign({ cnt: r.cnt, by: ME() }, x)])) }); DB.put('requests', n).then(reload); } } : undefined, [r && r.id, r && r.results, p && p.id, focus]);
  const wait = x => dur(((x.decidedAt || now) - x.at) / 1000);
  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <${QTop} theme=${theme} onTheme=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} nWait=${open.length} mode=${qmode} setMode=${setQmode} nAp=${Object.values<any>(pkgs || {}).filter(apPending).length} />
      ${qmode === 'spc' ? html`<main className="qmain spcmain"><${SpcView} pkgs=${pkgs} reqs=${reqs} say=${say} /></main>` : qmode === 'onay' ? html`<main className="qmain spcmain"><${ApprovalView} pkgs=${pkgs} say=${say} /></main>` : qmode === 'alet' ? html`<main className="qmain spcmain"><${GaugeView} say=${say} /></main>` : html`<main className="qmain">
        ${mob ? html`<div className="segs mseg">${[['list', 'Sıra · ' + open.length], ['draw', 'Resim'], ['form', 'Ölçüm']].map(([k, l]) => html`<button key=${k} className=${'seg ' + (qv === k ? 'on' : '')} onClick=${() => setQv(k)}>${l}</button>`)}</div>` : null}
        <div className="col" style=${mob && qv !== 'list' ? { display: 'none' } : null}>
          <div className="segs" style=${{ marginTop: 0, width: '100%' }}><button className=${'seg ' + (view === 'open' ? 'on' : '')} style=${{ flex: 1 }} onClick=${() => setView('open')}>Bekleyen · ${open.length}</button><button className=${'seg ' + (view === 'done' ? 'on' : '')} style=${{ flex: 1 }} onClick=${() => setView('done')}>Tamamlanan · ${done.length}</button></div>
          <div className="queue">${list.length ? list.map(x => html`<button key=${x.id} className=${'qc pk ' + (x.id === selId ? 'sel' : '')} onClick=${() => { setSelId(x.id); setQv('form'); }}>
            <div><div className="no">${x.no}<span className="revc">Rev ${x.rev}</span></div><div className="pt">${x.part}</div>
            <div className="mt"><span><b style=${{ color: 'var(--ink)' }}>${x.machine}</b> · ${x.by}</span><span>${x.reason} · ${x.items.length} ölçü</span></div>
            <div style=${{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip" style=${{ '--c': RQ[x.status].c }}><i></i>${RQ[x.status].l}</span>${x.crit ? html`<span className="chip" style=${{ '--c': 'var(--stop)' }}><i></i>Kritik</span>` : null}<span className="mini mono">${wait(x)}</span></div></div></button>`)
            : html`<div className="glass empty" style=${{ padding: 30 }}><${I} n="check" s=${34} /><b>${view === 'open' ? 'Bekleyen numune yok' : 'Henüz kayıt yok'}</b><small className="muted">Makinelerden gelen numune istekleri burada sıraya girer.</small></div>`}</div>
        </div>
        <section className="qdraw" style=${mob && qv !== 'draw' ? { display: 'none' } : null}>${ctl ? html`<${BlueprintM} say=${say} theme=${theme} ctl=${ctl} />` : html`<div className="glass empty"><${I} n="target" s=${44} /><b>Numune seç</b><small className="muted">Operatör "Numuneyi kaliteye gönder" dediğinde istek soldaki listeye düşer.</small></div>`}</section>
        <section className="col qform" style=${mob && qv !== 'form' ? { display: 'none' } : null}>${r && p ? html`
          <div className="glass qhead2"><span className="over">${r.machine} · ${r.by} · ${new Date(r.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span><h2>${r.no} <span className="revbig">Rev ${r.rev}</span></h2><p>${r.part} · ${r.reason} · ${fmt(r.cnt)}. parça</p>
            <div className="qprog"><div className="aw-bar" style=${{ height: 10 }}><i style=${{ width: (items.length ? nMeas / items.length * 100 : 0) + '%', background: nBad ? 'var(--stop)' : 'var(--run)' }}></i></div><b className="mono">${nMeas}/${items.length}</b></div></div>
          ${(() => { const nc = items.filter(b => methOf(b) === 'cmm').length; return html`<div className="qtools">${nc && nc < items.length ? html`<div className="segs">${[['all', 'Tümü · ' + items.length], ['man', 'Elle · ' + (items.length - nc)], ['cmm', 'CMM · ' + nc]].map(([k, l]) => html`<button key=${k} className=${'seg ' + (mf === k ? 'on' : '')} onClick=${() => setMf(k)}>${l}</button>`)}</div>` : null}
            ${dugme.olcum && (r.status === 'waiting' || r.status === 'measuring') ? html`<button className="btn" style=${{ marginLeft: 'auto', color: 'var(--cmm)' }} onClick=${() => cmmRef.current && cmmRef.current.click()}><${I} n="hex" s=${18} />CMM dosyası</button>` : null}
            <input ref=${cmmRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style=${{ display: 'none' }} onChange=${e => { loadCmm(e.target.files[0]); e.target.value = ''; }} /></div>`; })()}
          ${cmmImp ? html`<div className="glass cmmimp"><div className="dh" style=${{ margin: 0 }}><div><span className="over" style=${{ color: 'var(--cmm)' }}>CMM sonucu · ${cmmImp.file}</span><b style=${{ display: 'block' }}>${cmmImp.matched}/${cmmImp.rows.length} satır eşleşti</b></div><button className="x" onClick=${() => setCmmImp(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
            <small className="muted">Ayraç: ${cmmImp.dl} · ${cmmImp.header ? 'başlık satırı bulundu' : 'başlık yok · ilk sütun balon no, son sayı ölçülen'} · eşleştirme sırası: balon no → anma değeri → ad</small>
            <div style=${{ maxHeight: 220, overflow: 'auto' }}><table><thead><tr><th>Satır</th><th>Ölçülen</th><th>Balon</th><th>Sonuç</th></tr></thead><tbody>${cmmImp.rows.map((x, i) => { const ok = x.b && x.act >= x.b.min - 1e-9 && x.act <= x.b.max + 1e-9; return html`<tr key=${i}><td>${x.key}</td><td className="mono">${x.act}</td><td>${x.b ? html`<b>${x.b.id}</b> <span className="mono">${x.b.nom}</span> <small className="muted">(${x.how})</small>` : html`<span className="muted">eşleşmedi</span>`}</td><td className=${x.b ? (ok ? 'ok' : 'nok') : ''}>${x.b ? (ok ? 'Uygun' : 'RED') : '—'}</td></tr>`; })}</tbody></table></div>
            <div className="measure"><button className="btn" onClick=${() => setCmmImp(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} disabled=${!cmmImp.matched} onClick=${applyCmm}><${I} n="check" s=${18} />${cmmImp.matched} ölçüyü kaydet</button></div></div>` : null}
          <div className="glass qitems">${items.filter(b => mf === 'all' || methOf(b) === mf).sort((p, q) => mf === 'all' ? Number(methOf(p) === 'cmm') - Number(methOf(q) === 'cmm') : 0).map((b, i, arr) => { const m = results[b.id], sg = sug[b.id], grp = mf === 'all' && arr.some(x => methOf(x) === 'cmm') && arr.some(x => methOf(x) !== 'cmm') && (i === 0 || methOf(arr[i - 1]) !== methOf(b)) ? methOf(b) : null; const span = b.max - b.min || 1e-6, lo = b.min - span * .2 / .7, hi = b.max + span * .2 / .7, pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
            return html`<${Fragment} key=${b.id}>${grp ? html`<div className=${'qgrp ' + grp}><${I} n=${grp === 'cmm' ? 'hex' : 'ruler'} s=${15} />${grp === 'cmm' ? 'CMM ile ölçülecek' : 'Elle ölçülecek'}<span>${arr.filter(x => methOf(x) === grp).length}</span></div>` : null}<div className=${'qi ' + (focus && focus.id === b.id ? 'cur ' : '') + (m ? (m.ok ? 'ok' : 'nok') : '')} onClick=${() => setFocus({ id: b.id, n: Date.now() })}>
              <div className="qi-h"><span className=${'n ' + (methOf(b) === 'cmm' ? 'hx' : '')}>${b.id}</span><div><b className="mono">${b.nom}${methOf(b) === 'cmm' ? html`<span className="cmmtag">CMM</span>` : null}</b><small>${b.tol} · ${b.tool}${b.crit ? ' · KRİTİK' : ''}${m && m.src === 'cmm' ? ' · CMM dosyasından' : ''}${m && m.gno ? ' · ' + m.gno : ''}</small></div>${m ? html`<span className=${'qv ' + (m.ok ? (m.edge ? 'edge' : 'ok') : 'nok')}>${m.v}${m.edge ? html`<small>sınırda %${m.edge}</small>` : null}</span>` : null}</div>
              ${!b.gauge ? html`<div className="tolbar" style=${{ height: 26 }}><div className="band" style=${{ top: 8 }}></div>${m && typeof m.v === 'number' ? html`<i className="mk" style=${{ left: pos(m.v) + '%', top: 0, height: 22 }}></i>` : null}</div>` : null}
              ${dugme.olcum && !sg && (r.status === 'waiting' || r.status === 'measuring') ? html`<div className="meta"><span>Ölçü aleti</span><${AletSecimi} aletler=${aletler} tool=${b.tool} onSec=${() => setAletN(n => n + 1)} /></div>` : null}
              ${sg ? html`<div className="suggest"><${I} n="alert" s=${18} /><div><b>${sg.v} tolerans dışında</b><span><b className="mono">${sg.alt}</b> mi demek istedin?</span></div></div><div className="measure"><button className="btn pri" style=${{ flex: 1 }} onClick=${() => save(b, sg.alt)}>${sg.alt} kaydet</button><button className="btn" onClick=${() => save(b, sg.v)}>${sg.v} doğru</button></div>`
                : !dugme.olcum ? null
                : b.gauge ? html`<div className="measure"><button className="btn" style=${{ flex: 1, color: 'var(--run)' }} onClick=${() => save(b, 'ok')}>Geçer</button><button className="btn" style=${{ flex: 1, color: 'var(--stop)' }} onClick=${() => save(b, 'nok')}>Geçmez</button></div>`
                : html`<div className="measure"><input ref=${el => { inputs.current[b.id] = el; }} inputMode="decimal" placeholder=${b.min + ' – ' + b.max} value=${vals[b.id] || ''} onChange=${e => setVals(Object.assign({}, vals, { [b.id]: e.target.value }))} onKeyDown=${e => e.key === 'Enter' && save(b)} aria-label=${'Ölçülen ' + b.nom} /><button className="btn pri" onClick=${() => save(b)}><${I} n="check" s=${18} /></button></div>`}
            </div></${Fragment}>`; })}</div>
          ${r.status === 'waiting' || r.status === 'measuring' ? (dugme.karar ? html`<div className="glass qdec">
            <input className="qnote" placeholder="Not · Red için gerekçe zorunlu · örn. takım değişimi önerilir" value=${note} onChange=${e => setNote(e.target.value)} />
            ${redEksigi ? html`<small className="muted">${redEksigi}</small>` : null}
            ${needC2 ? html`<${Sw} on=${c2} onChange=${setC2} l="Kritik ölçüleri ikinci kez kontrol ettim" d=${'Hazırlık kuralı · ' + items.filter(b => b.crit).map(b => b.nom).join(', ')} />` : null}
            <div className="measure">
              <button className="btn lg" style=${{ flex: 1, background: nBad ? 'var(--stop)' : null, color: nBad ? 'var(--on-sig)' : 'var(--stop)', borderColor: nBad ? 'transparent' : null }} disabled=${redEksigi !== null} title=${redEksigi || ''} onClick=${() => decide('rejected')}><${I} n="x" s=${20} />Red</button>
              ${nBad ? html`<button className="btn lg" style=${{ flex: 1 }} disabled=${nMeas < items.length} onClick=${() => decide('deviation')}>Sapma ile onay</button>` : null}
              <button className="btn lg pri" style=${{ flex: 1.3 }} disabled=${nMeas < items.length || nBad > 0 || (needC2 && !c2)} onClick=${() => decide('approved')}><${I} n="check" s=${20} />Onayla</button>
            </div></div>` : null) : html`<div className="glass qdec"><div className=${'verdict ' + (r.status === 'rejected' ? 'nok' : 'ok')}><${I} n=${r.status === 'rejected' ? 'x' : 'check'} s=${18} />${RQ[r.status].l} · ${r.decidedBy} · ${new Date(r.decidedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${r.note ? ' · ' + r.note : ''}</div></div>`}
        ` : null}</section>
      </main>`}
    </div>
    ${toast ? html`<div key=${toast.k} className="toast" role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}</div>` : null}
  </${Fragment}>`;
}

