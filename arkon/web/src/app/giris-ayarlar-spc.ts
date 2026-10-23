import { AKStore } from '../data/store';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { Fragment, I, REASONS, SCRAPS, html, pad, useCallback, useEffect, useNow, useRef, useState } from './temel';
import { FEAT, LITE, LS, download } from './yukleyici';
import { MC_CONN, ME, MEU, PERMM, PERMS, PERMS0, PLANT, PLANT_DEMO, ROLES, ROLE_L, SHIFTS, act_, audit, can, currentShift, initials, machineOf, myStation, permsFrom, setPERMM, setPLANT, setSHIFTS, userInWc, wcOf } from './ortak-ayarlar';
import { METH, methOf } from './teknik-resim';
import { beep } from './operator-parcalar';
import { Sw } from './kurallar';
import { OPTYPES, StationSelect } from './istasyonlar';
import { Bus } from './hazirlik';
import { AuditView, CollectorCard, PolicyEditor, ReasonEditor, ScrapEditor, nedenlerTmide } from './ayarlar-uretim';
import { Brand, navGo, useTheme } from './baslat';
import { gomuluMu } from './gomulu';
import { YETKI_KILIDI, yetkilerTmide } from '../data/tmi-yetkileri';
import { cagridanArizaAc } from '../data/ariza-ustlenme';
import { tesisDuzenleyicisi, tesisGruplari, tesisListesi, tmiListesiSaltOkunur } from '../data/tmi-listeleri';
import { tmiyeGit } from '../data/yeni-paket';

/* ══════════ GİRİŞ, AYARLAR, SPC, RAPOR ══════════ */
/* ── giriş: kişiyi seç, PIN gir ── */
export function LoginApp({ onDone, lock, onCancel }) {
  const [users, setUsers] = useState(null), [sel, setSel] = useState(null), [pin, setPin] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const st = AKStore.status();
  const load = () => AKStore.Auth.users().then(us => { setUsers(us); if (lock && lock.pre && !sel) { const u = us.find(x => x.id === lock.pre); if (u) setSel(u); } }).catch(() => setUsers([]));
  useEffect(() => { load(); document.documentElement.setAttribute('data-state', 'done'); }, []);
  const go = async p => { if (!sel || busy) return; setBusy(true); setErr(''); try { const u = await AKStore.Auth.login(sel.id, p); onDone(u); } catch (e) { setErr(e.message || 'Giriş yapılamadı'); setPin(''); beep('nok'); } setBusy(false); };
  const key = k => { if (k === 'del') return setPin(pin.slice(0, -1)); if (k === 'ok') return go(pin); const n = (pin + k).slice(0, 8); setPin(n); };
  useEffect(() => { const f = e => { if (/^\d$/.test(e.key)) key(e.key); else if (e.key === 'Backspace') key('del'); else if (e.key === 'Enter') key('ok'); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); });
  const [allU, setAllU] = useState(false), here = machineOf(myStation()), wc = here.wc;
  const vis = (users || []).filter(u => allU || userInWc(u, wc)), hidden = (users || []).length - vis.length;
  const groups: Record<string, any> = {}; vis.forEach(u => { (groups[u.role] = groups[u.role] || []).push(u); });
  return html`<div className="login">
    <div className="aura"></div><div className="gridbg"></div>
    <div className="lgbox glass">
      <div className="lghead"><span className="mark"></span><div><b>ÜRETİM HAZIRLIK</b><small>${st.mode === 'server' ? (st.online ? 'Sunucu · ' + st.base : 'Sunucuya ulaşılamıyor · ' + st.base) : 'Bu cihaz'}</small></div></div>
      ${lock ? html`<div className="lglock"><${I} n=${lock.why === 'shift' ? 'clock' : lock.why === 'idle' ? 'lock' : 'user'} s=${18} />${lock.why === 'shift' ? 'Vardiya değişti · bu tablette çalışacak kişi giriş yapsın' : lock.why === 'idle' ? 'Ekran kilitlendi · devam etmek için PIN gir' : 'Kişi değiştir'}</div>` : null}
      ${!sel ? html`<${Fragment}>
        <h2>Kimsin?</h2>${here.id && here.wcName ? html`<small className="muted lgwc">${here.id} · ${here.wcName}</small>` : null}
        ${users === null ? html`<p className="muted">Kişiler yükleniyor…</p>` : !users.length ? html`<p className="muted">Kişi listesi alınamadı. ${st.mode === 'server' ? 'Sunucu bağlantısını kontrol et.' : ''}</p><button className="btn" onClick=${load}>Tekrar dene</button>` : null}
        ${['operator', 'lead', 'quality', 'maint', 'prep', 'plan', 'admin'].filter(r => groups[r]).map(r => html`<div key=${r} className="lggrp"><span className="over">${ROLE_L[r]}</span><div className="lgusers">${groups[r].map(u => html`<button key=${u.id} className="lguser" onClick=${() => { setSel(u); setPin(''); setErr(''); }}><span className="av">${initials(u.name)}</span><b>${u.name}</b></button>`)}</div></div>`)}
        ${hidden > 0 ? html`<button className="lnk" onClick=${() => setAllU(true)}>Diğer iş merkezlerinden ${hidden} kişi</button>` : null}
      </${Fragment}>` : html`<${Fragment}>
        <button className="lgback" onClick=${() => setSel(null)}><${I} n="back" s=${16} />Başka kişi</button>
        <div className="lgme"><span className="av">${initials(sel.name)}</span><div><b>${sel.name}</b><small>${ROLE_L[sel.role]}</small></div></div>
        <div className="pindots">${[0, 1, 2, 3, 4, 5].map(i => html`<i key=${i} className=${i < pin.length ? 'on' : ''}></i>`)}</div>
        ${err ? html`<div className="lgerr">${err}</div>` : html`<div className="lghint">PIN gir</div>`}
        <div className="pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => html`<button key=${k} className=${'pinkey ' + (k === 'ok' ? 'ok' : '')} disabled=${busy || (k === 'ok' && pin.length < 4)} onClick=${() => key(k)}>${k === 'del' ? html`<${I} n="back" s=${22} />` : k === 'ok' ? html`<${I} n="check" s=${24} />` : k}</button>`)}</div>
      </${Fragment}>`}
      ${onCancel ? html`<button className="btn" style=${{ marginTop: 6 }} onClick=${onCancel}>Vazgeç</button>` : null}
      ${st.mode !== 'server' && !lock ? html`<button className="lnk" style=${{ marginTop: 6 }} onClick=${() => { location.hash = 'ayarlar'; onDone(null, true); }}>Sunucu ayarı</button>` : null}
    </div>
  </div>`;
}

/* ── başka istasyondan gelen çağrı (kalite, hazırlık ekranlarında görünür) ── */
/** Çağrı bu kişiye mi? Üstlenme yetkisi olan, çağrılan ekibin rolündeki kişiler (yönetici ve vardiya amiri hepsini görür); çağrıyı yapan istasyon hariç */
// Ekip -> Arkon rolü eşlemesi bannerin geçici kopyasıdır; asıl yönlendirme TMI bildirim modülündedir (298, CEKIRDEK-ISTEKLERI 8).
// Ayarcı varsayılanda müdüre gider; müdürün Arkon rolü (vardiya amiri, yönetici) bütün çağrıları zaten görür.
export const CALL_ROLES = { bakim: ['maint'], kalite: ['quality'], malzeme: ['plan'], amir: ['lead'], ayarci: ['lead'] };
export const callForMe = m => { if (!can('prod.ack') || (m.machine && m.machine === LS.get('station') && (location.hash || '#') === '#')) return false; const u = MEU(); if (!u || u.role === 'admin' || u.role === 'lead') return true; const R = CALL_ROLES[m.k]; return !R || R.includes(u.role) || !Object.values<any>(CALL_ROLES).some(x => x.includes(u.role)); };
export function CallBanner({ cur }) {
  const [list, setList] = useState([]);
  useEffect(() => Bus.on(m => {
    if (m.type === 'call' && callForMe(m)) { beep('call'); setList(l => l.filter(x => x.t0 !== m.t0).concat([m]).slice(-4)); }
    if (m.type === 'call-ack' || m.type === 'call-done') setList(l => l.filter(x => x.t0 !== m.t0));
  }), [cur]);
  useEffect(() => { if (!list.length) return; const t = setTimeout(() => setList(l => l.filter(x => Date.now() - x.t0 < 30 * 60e3)), 30000); return () => clearTimeout(t); }, [list]);
  if (!list.length) return null;
  const ack = async m => {
    Bus.send({ type: 'call-ack', machine: m.machine, t0: m.t0, who: ME() }); setList(l => l.filter(x => x.t0 !== m.t0));
    AKStore.Log.add('calls', { machine: m.machine, wc: m.wc || null, callId: String(m.t0), team: m.k, phase: 'ack' });
    if (m.k === 'bakim' && can('maint.work')) await cagridanArizaAc(m, ME(), Date.now(), { get: id => AKStore.DB.get('maint', id), put: doc => AKStore.DB.put('maint', doc), send: x => Bus.send(x), yerel: x => Bus.yerel(x) });
  };
  return html`<div className="callbn">${list.map(m => html`<div key=${m.t0} className=${'cbn glass ' + (m.esc ? 'esc' : '')}><span className="cbi"><${I} n="bell" s=${20} /></span><div><b>${m.machine} · ${m.l}${m.esc ? ' · YÜKSELTİLDİ' : ''}</b><small>${m.by} · ${new Date(m.t0).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}${m.note ? ' · ' + m.note : ''}${m.esc ? ' · ' + Math.round((Date.now() - m.t0) / 60000) + ' dk yanıtsız' : ''}</small></div>
    <button className="btn pri" onClick=${() => ack(m)}>Üstlen</button><button className="x" onClick=${() => setList(l => l.filter(x => x.t0 !== m.t0))} aria-label="Kapat"><${I} n="x" s=${16} /></button></div>`)}</div>`;
}

/* ── bağlantı durumu (sol menü) ── */
export function useSrv() { const [st, setSt] = useState(AKStore.status()); useEffect(() => AKStore.onStatus(setSt), []); return st; }

/* ── SPC: ölçü başına değer grafiği, Cp / Cpk ── */
export function spcStats(vals, lsl, usl) {
  const n = vals.length; if (!n) return { n: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / n, sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
  const cp = sd > 0 && isFinite(usl) && isFinite(lsl) ? (usl - lsl) / (6 * sd) : null, cpk = sd > 0 ? Math.min(isFinite(usl) ? (usl - mean) / (3 * sd) : Infinity, isFinite(lsl) ? (mean - lsl) / (3 * sd) : Infinity) : null;
  return { n, mean, sd, cp, cpk: cpk === Infinity ? null : cpk, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), out: vals.filter(v => v < lsl - 1e-9 || v > usl + 1e-9).length };
}
export const cpkTone = c => c == null ? 'var(--muted)' : c >= 1.33 ? 'var(--run)' : c >= 1 ? 'var(--hold)' : 'var(--stop)';
export const f4 = v => v == null || !isFinite(v) ? '—' : (+v.toFixed(4)).toString();
export function SpcChart({ rows, b }) {
  const W = 760, H = 260, pad = 34, vals = rows.filter(r => r.value != null), S = spcStats(vals.map(r => r.value), b.min, b.max);
  if (!vals.length) return html`<div className="spc-empty muted">Bu ölçü için sayısal kayıt yok</div>`;
  const span = b.max - b.min || 1, ucl = S.sd ? S.mean + 3 * S.sd : null, lcl = S.sd ? S.mean - 3 * S.sd : null;
  const lo = Math.min(b.min - span * 0.25, S.min, lcl ?? Infinity), hi = Math.max(b.max + span * 0.25, S.max, ucl ?? -Infinity);
  const Y = v => H - pad - (v - lo) / (hi - lo || 1) * (H - 2 * pad), X = i => pad + 30 + i * ((W - 2 * pad - 30) / Math.max(1, vals.length - 1));
  const line = (v, cls, l) => v == null ? null : html`<g key=${cls + l}><line x1=${pad + 30} x2=${W - pad} y1=${Y(v)} y2=${Y(v)} className=${'spl ' + cls} /><text x=${W - pad + 4} y=${Y(v) + 4} className=${'spt ' + cls}>${l}</text></g>`;
  return html`<svg className="spc" viewBox=${'0 0 ' + (W + 40) + ' ' + H} preserveAspectRatio="xMidYMid meet">
    <rect x=${pad + 30} y=${Y(b.max)} width=${W - 2 * pad - 30} height=${Math.max(0, Y(b.min) - Y(b.max))} className="spband" />
    ${line(b.max, 'lim', 'ÜTS')}${line(b.min, 'lim', 'ATS')}${line(S.mean, 'mean', 'x̄')}${line(ucl, 'cl', '+3σ')}${line(lcl, 'cl', '−3σ')}
    <text x=${pad} y=${Y(b.max) + 4} className="spy">${f4(b.max)}</text><text x=${pad} y=${Y(b.min) + 4} className="spy">${f4(b.min)}</text>
    <polyline className="spp" points=${vals.map((r, i) => X(i) + ',' + Y(r.value)).join(' ')} />
    ${vals.map((r, i) => html`<circle key=${i} cx=${X(i)} cy=${Y(r.value)} r="4.5" className=${'spd ' + (r.ok ? '' : 'nok')}><title>${new Date(r.at).toLocaleString('tr-TR')} · ${r.value} · ${r.userName || ''} · ${{ op: 'Operatör', quality: 'Kalite', cmm: 'CMM' }[r.src] || r.src || ''}</title></circle>`)}
  </svg>`;
}
export function SpcView({ pkgs, reqs, say }) {
  const list = Object.values<any>(pkgs || {}).filter(p => (p.plan || []).length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const [pid, setPid] = useState(list[0] ? list[0].id : null), [iid, setIid] = useState(null), [rows, setRows] = useState(null), [ord, setOrd] = useState('');
  const p = (pkgs || {})[pid];
  useEffect(() => { if (!pid) return; setRows(null); AKStore.Log.query('meas', { pkg: pid, limit: 20000 }).then(setRows).catch(() => setRows([])); }, [pid]);
  useEffect(() => AKStore.Log.on(k => { if (k === 'meas' && pid) AKStore.Log.query('meas', { pkg: pid, limit: 20000 }).then(setRows).catch(() => {}); }), [pid]);
  const orders = Array.from(new Set((rows || []).map(r => r.orderNo).filter(Boolean)));
  const R = (rows || []).filter(r => !ord || r.orderNo === ord);
  const by = id => R.filter(r => r.itemId === id);
  const b = p && (p.plan.find(x => x.id === iid) || p.plan[0]);
  const S = b ? spcStats(by(b.id).filter(r => r.value != null).map(r => r.value), b.min, b.max) : { n: 0 };
  return html`<div className="spcw">
    <div className="col spcl">
      <div className="glass spcpk"><span className="over">İş paketi</span><select value=${pid || ''} onChange=${e => { setPid(e.target.value); setIid(null); setOrd(''); }}>${list.map(x => html`<option key=${x.id} value=${x.id}>${x.no} · ${x.part}</option>`)}</select>
        ${orders.length > 1 ? html`<select value=${ord} onChange=${e => setOrd(e.target.value)}><option value="">Bütün iş emirleri</option>${orders.map(o => html`<option key=${o}>${o}</option>`)}</select>` : null}
        <button className="btn" disabled=${!p} onClick=${() => printReport(p, R, (reqs || []).filter(r => r.pkgId === pid && (!ord || r.no === ord)), say)}><${I} n="download" s=${18} />Ölçüm raporu (PDF)</button></div>
      <div className="glass spcitems">${p ? p.plan.map(x => { const s = spcStats(by(x.id).filter(r => r.value != null).map(r => r.value), x.min, x.max), nr = by(x.id).length, nok = by(x.id).filter(r => !r.ok).length; return html`<button key=${x.id} className=${'spci ' + (b && b.id === x.id ? 'on' : '')} onClick=${() => setIid(x.id)}>
          <span className=${'n ' + (methOf(x) === 'cmm' ? 'hx' : '')}>${x.id}</span><div><b className="mono">${x.nom}</b><small>${x.tol} · ${nr} ölçüm${nok ? ' · ' + nok + ' red' : ''}</small></div><em style=${{ color: cpkTone(s.cpk) }}>${s.cpk == null ? (x.gauge ? 'mastar' : '—') : 'Cpk ' + s.cpk.toFixed(2)}</em></button>`; }) : html`<p className="muted">Kontrol planı olan paket yok</p>`}</div>
    </div>
    <div className="col spcr">${!b ? html`<div className="glass empty"><b>Paket seç</b></div>` : html`<${Fragment}>
      <div className="glass spchead"><div><span className="over">${p.no} · ${p.part}${ord ? ' · ' + ord : ''}</span><h2 className="mono">${b.id} · ${b.nom}</h2><small className="muted">${b.tol} · ${b.min} – ${b.max} · ${b.tool} · ${METH[methOf(b)].l}</small></div>
        <div className="spcst">${[['n', S.n || 0], ['Ortalama', f4(S.mean)], ['σ', f4(S.sd)], ['Min / Max', f4(S.min) + ' / ' + f4(S.max)], ['Cp', S.cp == null ? '—' : S.cp.toFixed(2)], ['Cpk', S.cpk == null ? '—' : S.cpk.toFixed(2)], ['Tolerans dışı', S.out || 0]].map(([l, v]) => html`<div key=${l}><span>${l}</span><b style=${l === 'Cpk' ? { color: cpkTone(S.cpk) } : l === 'Tolerans dışı' && v ? { color: 'var(--stop)' } : null}>${v}</b></div>`)}</div></div>
      <div className="glass spcch">${rows === null ? html`<p className="muted">Kayıtlar yükleniyor…</p>` : html`<${SpcChart} rows=${by(b.id)} b=${b} />`}
        <small className="muted">Cpk ≥ 1,33 yeterli · 1,00–1,33 sınırda · ${'<'} 1,00 süreç toleransa sığmıyor. En az 25 ölçümle anlamlıdır${S.n && S.n < 25 ? ' (şu an ' + S.n + ')' : ''}.</small></div>
      <div className="glass spclog"><span className="over">Son ölçümler</span><div className="spctbl">${by(b.id).slice(-60).reverse().map((r, i) => html`<div key=${i} className=${'spcrow ' + (r.ok ? '' : 'nok')}><span className="mono">${new Date(r.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><b className="mono">${r.value != null ? r.value : r.attr}</b><span>${{ op: 'Operatör', quality: 'Kalite', cmm: 'CMM' }[r.src] || r.src || ''}</span><span>${r.userName || ''}</span><span className="mono">${r.orderNo || ''}${r.partCnt != null ? ' #' + r.partCnt : ''}</span></div>`)}</div></div>
    </${Fragment}>`}</div>
  </div>`;
}

/* ── ölçüm raporu: yazdır → PDF (tarayıcıda yeni pencere; Android uygulamasında yazdırma servisi) ── */
export const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function reportHtml(p, rows, reqs) {
  const dt = t => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ats = rows.map(r => r.at), from = ats.length ? Math.min.apply(null, ats) : null, to = ats.length ? Math.max.apply(null, ats) : null;
  const orders = Array.from(new Set(rows.map(r => r.orderNo).filter(Boolean)));
  const sum = (p.plan || []).map(b => { const rs = rows.filter(r => r.itemId === b.id), vals = rs.filter(r => r.value != null).map(r => r.value), S = spcStats(vals, b.min, b.max), bad = rs.filter(r => !r.ok).length; return { b, rs, S, bad }; });
  const SRC = { op: 'Operatör', quality: 'Kalite', cmm: 'CMM' }, RQS = { approved: 'Onaylandı', rejected: 'RED', deviation: 'Sapma ile onay', waiting: 'Bekliyor', measuring: 'Ölçülüyor' };
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ölçüm raporu ' + escH(p.no) + '</title><style>' +
    '@page{size:A4;margin:12mm}body{font:10.5px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0}h2{font-size:12.5px;margin:16px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}' +
    'table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee;font-size:9.5px;text-transform:uppercase}td.n{text-align:right;font-family:Consolas,monospace}.nok{color:#b00;font-weight:700}.ok{color:#060}' +
    '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:8px;margin-bottom:8px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 14px;margin:6px 0}.meta div span{display:block;color:#666;font-size:9px;text-transform:uppercase}.meta div b{font-size:11.5px}' +
    '.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:22px}.sig div{border-top:1px solid #111;padding-top:4px;height:46px}.small{color:#666;font-size:9px}tr{page-break-inside:avoid}</style></head><body>' +
    '<div class="hd"><div><div class="small">ÜRETİM HAZIRLIK</div><h1>Ölçüm raporu</h1></div><div style="text-align:right"><b>' + escH(p.no) + '</b><br>Rev ' + escH(p.rev) + '<br><span class="small">Oluşturma: ' + dt(Date.now()) + ' · ' + escH(ME()) + '</span></div></div>' +
    '<div class="meta">' + [['Parça', p.part], ['Parça no', p.partNo], ['Operasyon', p.op], ['Makine', p.machine], ['Malzeme', p.material], ['Hedef', p.target + ' adet'], ['İş emirleri', orders.join(', ') || p.no], ['Dönem', from ? dt(from) + ' – ' + dt(to) : '—']].map(([l, v]) => '<div><span>' + l + '</span><b>' + escH(v || '—') + '</b></div>').join('') + '</div>' +
    '<h2>Karakteristik özeti</h2><table><tr><th>No</th><th>Ölçü</th><th>Tolerans</th><th>Alt · Üst</th><th>Yöntem / alet</th><th>n</th><th>Min</th><th>Maks</th><th>Ort.</th><th>σ</th><th>Cpk</th><th>Red</th><th>Sonuç</th></tr>' +
    sum.map(({ b, rs, S, bad }) => '<tr><td>' + b.id + (b.crit ? ' KK' : '') + '</td><td><b>' + escH(b.nom) + '</b></td><td>' + escH(b.tol) + '</td><td class="n">' + f4(b.min) + ' · ' + f4(b.max) + '</td><td>' + escH(METH[methOf(b)].l + ' · ' + b.tool) + '</td><td class="n">' + rs.length + '</td><td class="n">' + f4(S.min) + '</td><td class="n">' + f4(S.max) + '</td><td class="n">' + f4(S.mean) + '</td><td class="n">' + f4(S.sd) + '</td><td class="n">' + (S.cpk == null ? '—' : S.cpk.toFixed(2)) + '</td><td class="n' + (bad ? ' nok' : '') + '">' + bad + '</td><td class="' + (!rs.length ? '' : bad ? 'nok' : 'ok') + '">' + (!rs.length ? 'Ölçülmedi' : bad ? 'Red var' : 'Uygun') + '</td></tr>').join('') + '</table>' +
    (reqs.length ? '<h2>Kalite kararları</h2><table><tr><th>Tarih</th><th>İş emri</th><th>Neden</th><th>Makine</th><th>Gönderen</th><th>Karar</th><th>Karar veren</th><th>Not</th></tr>' + reqs.sort((a, b) => a.at - b.at).map(r => '<tr><td>' + dt(r.at) + '</td><td>' + escH(r.no) + '</td><td>' + escH(r.reason) + '</td><td>' + escH(r.machine) + '</td><td>' + escH(r.by) + '</td><td class="' + (r.status === 'rejected' ? 'nok' : r.status === 'approved' ? 'ok' : '') + '">' + (RQS[r.status] || r.status) + '</td><td>' + escH(r.decidedBy || '') + (r.decidedAt ? '<br><span class="small">' + dt(r.decidedAt) + '</span>' : '') + '</td><td>' + escH(r.note || '') + '</td></tr>').join('') + '</table>' : '') +
    '<h2>Ölçüm kayıtları</h2><table><tr><th>Tarih</th><th>No</th><th>Ölçü</th><th>Değer</th><th>Sonuç</th><th>Kaynak</th><th>Ölçen</th><th>İş emri · parça</th></tr>' +
    rows.slice(0, 2000).map(r => '<tr><td>' + dt(r.at) + '</td><td>' + r.itemId + '</td><td>' + escH(r.nom) + '</td><td class="n">' + escH(r.value != null ? r.value : r.attr) + '</td><td class="' + (r.ok ? 'ok' : 'nok') + '">' + (r.ok ? 'Uygun' : 'RED') + '</td><td>' + (SRC[r.src] || escH(r.src)) + '</td><td>' + escH(r.userName) + '</td><td>' + escH((r.orderNo || '') + (r.partCnt != null ? ' #' + r.partCnt : '')) + '</td></tr>').join('') + '</table>' +
    (rows.length > 2000 ? '<p class="small">İlk 2000 kayıt gösterildi (toplam ' + rows.length + ').</p>' : '') +
    '<div class="sig"><div>Hazırlayan</div><div>Kontrol eden</div><div>Onaylayan</div></div></body></html>';
}
export function printReport(p, rows, reqs, say) {
  if (!p) return;
  const h = reportHtml(p, rows || [], reqs || []), name = 'olcum-raporu-' + String(p.no).replace(/[^\wİıŞşĞğÜüÖöÇç-]+/g, '_') + '.html';
  if (window.ArkonAndroid && window.ArkonAndroid.print) {
    let el = document.getElementById('arkon-print'); if (!el) { el = document.createElement('div'); el.id = 'arkon-print'; document.body.appendChild(el); }
    el.innerHTML = '<iframe id="arkon-rep" style="width:100%;border:0"></iframe>';
    const f = el.querySelector('iframe'); f.srcdoc = h; f.onload = () => { try { f.style.height = f.contentDocument.body.scrollHeight + 40 + 'px'; } catch (e) {} document.documentElement.classList.add('printing'); setTimeout(() => window.ArkonAndroid.print('Ölçüm raporu ' + p.no), 300); };
    return;
  }
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(h); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400); return; }
  download(name, h, 'text/html'); say && say('Rapor indirildi · açıp yazdır → PDF', 'download', 'var(--run)');
}

/* ══════════ AYARLAR ══════════ */
/* ── Ayarlar › Kişi düzenleyici: sabit roller, iş merkezi kısıtı ── */
export function WcChips({ v, onChange }) {
  const sel = v || [], tog = id => onChange(sel.includes(id) ? sel.filter(x => x !== id) : sel.concat([id]));
  return html`<div className="chips"><button type="button" className=${'chp ' + (!sel.length ? 'on' : '')} onClick=${() => onChange([])}>Tüm iş merkezleri</button>${PLANT.wcs.filter(act_).map(w => html`<button type="button" key=${w.id} className=${'chp ' + (sel.includes(w.id) ? 'on' : '')} onClick=${() => tog(w.id)}>${w.name}</button>`)}</div>`;
}
export function UserEditor({ say }) {
  const [list, setList] = useState(null), [ed, setEd] = useState(null), [err, setErr] = useState('');
  const me = MEU(), iAmAdmin = !me || me.role === 'admin';
  const load = () => AKStore.Auth.list().then(setList).catch(e => { setErr(e.message); setList([]); });
  useEffect(() => { load(); }, []);
  const save = async () => { setErr(''); try { if (!ed.name.trim()) throw new Error('Ad gerekli'); const id = ed.id || ed.name.trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 5); await AKStore.Auth.save(Object.assign({}, ed, { id, name: ed.name.trim() })); if (AKStore.status().mode !== 'server') audit('kullanıcı', ed.id ? 'değiştirildi' : 'eklendi', ed.name.trim(), 'rol: ' + ed.role); setEd(null); load(); say('Kullanıcı kaydedildi', 'check', 'var(--run)'); } catch (e) { setErr(e.message); } };
  const del = async u => { if (!confirm(u.name + ' silinsin mi?')) return; try { await AKStore.Auth.remove(u.id); load(); } catch (e) { setErr(e.message); } };
  const wcN = u => (u.wcs && u.wcs.length) ? u.wcs.map(id => (wcOf(id) || { name: id }).name).join(', ') : '';
  const order = Object.fromEntries(ROLES.map(([k], i) => [k, i]));
  const sorted = (list || []).slice().sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.name.localeCompare(b.name, 'tr'));
  return html`<div className="ulist">
    ${sorted.map(u => html`<div key=${u.id} className=${'urow ' + (u.active === false ? 'off' : '')}><span className="av">${initials(u.name)}</span><div><b>${u.name}</b><small>${ROLE_L[u.role] || u.role}${wcN(u) ? ' · ' + wcN(u) : ''}${u.active === false ? ' · pasif' : ''}</small></div>${!iAmAdmin && u.role === 'admin' ? null : html`<button className="btn" onClick=${() => setEd({ id: u.id, name: u.name, role: u.role, wcs: u.wcs || [], active: u.active !== false, pin: '' })}>Düzenle</button>`}${(me && me.id === u.id) || (!iAmAdmin && u.role === 'admin') ? null : html`<button className="x" onClick=${() => del(u)} aria-label="Sil"><${I} n="trash" s=${16} /></button>`}</div>`)}
    ${list && !list.length ? html`<p className="muted" style=${{ margin: 0 }}>Kullanıcı yok. İlk eklenen kişi yönetici olur; bundan sonra bu cihaz açılışta PIN ister.</p>` : null}
    ${ed ? html`<div className="uedit">
      <label className="fld"><span className="over">Ad soyad</span><input value=${ed.name} onChange=${e => setEd(Object.assign({}, ed, { name: e.target.value }))} placeholder="örn. Ad Soyad" /></label>
      <div className="rf"><span className="over">Rol</span><div className="chips">${ROLES.filter(([k]) => iAmAdmin || k !== 'admin').map(([k, l]) => html`<button type="button" key=${k} className=${'chp ' + (ed.role === k ? 'on' : '')} onClick=${() => setEd(Object.assign({}, ed, { role: k }))}>${l}</button>`)}</div></div>
      ${ed.role !== 'admin' && PLANT.wcs.length ? html`<div className="rf"><span className="over">Çalışabileceği iş merkezleri</span><${WcChips} v=${ed.wcs} onChange=${wcs => setEd(Object.assign({}, ed, { wcs }))} /><small className="muted">Tablet bu iş merkezindeki bir istasyondaysa giriş ekranında görünür; istasyon seçerken yalnız bunlar listelenir.</small></div>` : null}
      <label className="fld"><span className="over">${ed.id ? 'Yeni PIN (boş bırak: değişmesin)' : 'PIN · 4–8 rakam'}</span><input inputMode="numeric" type="password" value=${ed.pin} onChange=${e => setEd(Object.assign({}, ed, { pin: e.target.value.replace(/\D/g, '').slice(0, 8) }))} /></label>
      <${Sw} on=${ed.active} onChange=${v => setEd(Object.assign({}, ed, { active: v }))} l="Aktif" d="Pasif kişi giriş ekranında görünmez" />
      ${err ? html`<div className="lgerr">${err}</div>` : null}
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => { setEd(null); setErr(''); }}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div>
    </div>` : html`<button className="upl" style=${{ justifyContent: 'center' }} onClick=${() => setEd({ name: '', role: 'operator', wcs: [], active: true, pin: '' })}><${I} n="plus" s=${20} /><b>Kişi ekle</b></button>`}
    ${err && !ed ? html`<div className="lgerr">${err}</div>` : null}
  </div>`;
}

/* ── Ayarlar › Tesis yapısı: İş merkezi › İstasyon › Makine ── */
export const PL_KIND = { wc: { k: 'wcs', l: 'İş merkezi' }, st: { k: 'sts', l: 'İstasyon' }, mc: { k: 'mcs', l: 'Makine' } };
export async function savePlant(pl, msg) { setPLANT(pl); await AKStore.DB.put('kv', pl, 'plant'); Bus.send({ type: 'cfg' }); audit('tesis', msg || 'tesis yapısı değişti', '', pl.wcs.length + ' iş merkezi · ' + pl.sts.length + ' istasyon · ' + pl.mcs.length + ' makine'); }
export function PlantEditor({ say }) {
  const [pl, setPl] = useState(() => JSON.parse(JSON.stringify(PLANT))), [ed, setEd] = useState(null), [err, setErr] = useState(''), [open, setOpen] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(null);
  useEffect(() => { AKStore.DB.get('kv', 'plant').then(v => setSaved(!!(v && v.sts))).catch(() => setSaved(false)); }, []);
  const commit = async (n, msg) => { setPl(n); try { await savePlant(n, msg); setSaved(true); say(msg || 'Tesis yapısı kaydedildi', 'check', 'var(--run)'); } catch (e) { setErr(e.message); } };
  const start = (kind, data, isNew?) => { setErr(''); setEd({ kind, isNew, orig: isNew ? null : data.id, d: Object.assign({ active: true }, data) }); };
  const F = (k, v) => setEd(Object.assign({}, ed, { d: Object.assign({}, ed.d, { [k]: v }) }));
  const save = () => {
    const K = PL_KIND[ed.kind].k, d = Object.assign({}, ed.d, { id: String(ed.d.id || '').trim().toUpperCase(), name: String(ed.d.name || '').trim() });
    if (!/^[A-Z0-9ÇĞİÖŞÜ][A-Z0-9ÇĞİÖŞÜ._-]{0,23}$/.test(d.id)) return setErr('Kod gerekli: harf, rakam, - _ . (en çok 24)');
    if (!d.name) return setErr('Ad gerekli');
    if (ed.isNew && pl[K].some(x => x.id === d.id)) return setErr('Bu kod zaten var: ' + d.id);
    if (ed.kind === 'st' && !d.wc) return setErr('İş merkezi seç');
    const n = Object.assign({}, pl, { [K]: ed.isNew ? pl[K].concat([d]) : pl[K].map(x => x.id === ed.orig ? d : x) });
    setEd(null); commit(n, PL_KIND[ed.kind].l + ' kaydedildi · ' + d.id);
  };
  const remove = () => {
    const K = PL_KIND[ed.kind].k, id = ed.orig;
    if (ed.kind === 'wc' && pl.sts.some(s => s.wc === id)) return setErr('Önce bu iş merkezindeki istasyonları taşı ya da sil (pasif de yapabilirsin)');
    if (!confirm(PL_KIND[ed.kind].l + ' silinsin mi? ' + id + (ed.kind === 'st' ? ' · bu istasyona gönderilmiş paketler istasyonsuz kalır, makineleri boşta kalır' : ''))) return;
    const n = Object.assign({}, pl, { [K]: pl[K].filter(x => x.id !== id) });
    if (ed.kind === 'st') n.mcs = pl.mcs.map(m => m.st === id ? Object.assign({}, m, { st: '' }) : m);
    setEd(null); commit(n, PL_KIND[ed.kind].l + ' silindi · ' + id);
  };
  const form = () => { const d = ed.d, nw = ed.isNew; return html`<div className="uedit plform">
    <div className="plgrid">
      <label className="fld"><span className="over">${PL_KIND[ed.kind].l} kodu</span><input value=${d.id || ''} disabled=${!nw} onChange=${e => F('id', e.target.value.toUpperCase())} placeholder=${{ wc: 'TAL', st: 'TZG-06', mc: 'M-TZG-06' }[ed.kind]} />${!nw ? html`<small className="muted">Kod sonradan değişmez (paketler ve kayıtlar koda bağlı)</small>` : null}</label>
      <label className="fld"><span className="over">Ad</span><input value=${d.name || ''} onChange=${e => F('name', e.target.value)} placeholder=${{ wc: 'Talaşlı imalat', st: 'CNC Torna · Hücre 2', mc: 'CNC torna tezgâhı' }[ed.kind]} /></label>
      ${ed.kind === 'wc' ? html`<label className="fld"><span className="over">Açıklama · maliyet merkezi</span><input value=${d.note || ''} onChange=${e => F('note', e.target.value)} placeholder="örn. MM-210" /></label>` : null}
      ${ed.kind === 'st' ? html`<${Fragment}>
        <label className="fld"><span className="over">İş merkezi</span><select value=${d.wc || ''} onChange=${e => F('wc', e.target.value)}><option value="">Seç</option>${pl.wcs.map(w => html`<option key=${w.id} value=${w.id}>${w.name} · ${w.id}</option>`)}</select></label>
        <label className="fld"><span className="over">Ekran tipi</span><select value=${d.t || 'cnc'} onChange=${e => F('t', e.target.value)}>${Object.entries<any>(OPTYPES).map(([k, t]) => html`<option key=${k} value=${k}>${t.l}</option>`)}</select></label></${Fragment}>` : null}
      ${ed.kind === 'mc' ? html`<${Fragment}>
        <label className="fld"><span className="over">İstasyon</span><${StationSelect} v=${d.st || ''} all=${true} onChange=${v => F('st', v)} /></label>
        <label className="fld"><span className="over">Tür</span><input value=${d.kind || ''} onChange=${e => F('kind', e.target.value)} placeholder="CNC torna, pres, CMM…" list="mc-kinds" /><datalist id="mc-kinds">${['CNC torna', 'CNC freze', 'İşlem merkezi', 'Taşlama', 'Pres', 'Kaynak robotu', 'CMM', 'Lazer', 'Fırın', 'Boya kabini', 'Tork aleti'].map(k => html`<option key=${k} value=${k} />`)}</datalist></label>
        <label className="fld"><span className="over">Marka / model</span><input value=${d.make || ''} onChange=${e => F('make', e.target.value)} /></label>
        <label className="fld"><span className="over">Seri no · yıl</span><input value=${d.serial || ''} onChange=${e => F('serial', e.target.value)} /></label>
        <label className="fld"><span className="over">Veri bağlantısı</span><select value=${d.conn || ''} onChange=${e => F('conn', e.target.value)}>${MC_CONN.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></label>
        ${d.conn ? html`<label className="fld"><span className="over">Adres</span><input value=${d.addr || ''} onChange=${e => F('addr', e.target.value)} placeholder="192.168.1.40:8193" /></label>` : null}</${Fragment}>` : null}
    </div>
    <${Sw} on=${d.active !== false} onChange=${v => F('active', v)} l="Aktif" d=${ed.kind === 'st' ? 'Pasif istasyon seçim listelerinde görünmez' : ed.kind === 'wc' ? 'Pasif iş merkezi kişi kısıtlarında görünmez' : 'Pasif makine pakete atanamaz'} />
    ${err ? html`<div className="lgerr">${err}</div>` : null}
    <div style=${{ display: 'flex', gap: 8 }}>${!nw ? html`<button className="btn" style=${{ color: 'var(--stop)' }} onClick=${remove}><${I} n="trash" s=${18} />Sil</button>` : null}<button className="btn" onClick=${() => { setEd(null); setErr(''); }}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div>
  </div>`; };
  const isEd = (kind, id) => ed && ed.kind === kind && !ed.isNew && ed.orig === id;
  const isNew = (kind, parent) => ed && ed.kind === kind && ed.isNew && ed.parent === parent;
  const addTo = (kind, data, parent) => { start(kind, data, true); setEd(e => Object.assign({}, e, { parent })); };
  const mcRow = m => html`<div key=${m.id} className=${'pmc ' + (act_(m) ? '' : 'off')}><${I} n="cpu" s=${16} /><b className="mono">${m.id}</b><span>${m.name}${m.kind ? ' · ' + m.kind : ''}${m.make ? ' · ' + m.make : ''}</span>${m.conn ? html`<em className="tag">${(MC_CONN.find(c => c[0] === m.conn) || [0, m.conn])[1]}</em>` : null}<button className="lnk" onClick=${() => start('mc', m)}>Düzenle</button></div>`;
  const stRow = st => { const t = OPTYPES[st.t || 'cnc'] || OPTYPES.cnc, ms = pl.mcs.filter(m => m.st === st.id); return html`<div key=${st.id} className=${'pst ' + (act_(st) ? '' : 'off')}>
    <div className="psth"><span className="pic"><${I} n=${t.i} s=${18} /></span><div><b className="mono">${st.id}</b><small>${st.name} · ${t.short}${ms.length ? ' · ' + ms.length + ' makine' : ''}${act_(st) ? '' : ' · pasif'}</small></div>
      <button className="lnk" onClick=${() => start('st', st)}>Düzenle</button><button className="lnk" onClick=${() => addTo('mc', { st: st.id }, st.id)}>+ Makine</button></div>
    ${isEd('st', st.id) ? form() : null}
    ${ms.map(m => html`<${Fragment} key=${m.id}>${mcRow(m)}${isEd('mc', m.id) ? form() : null}</${Fragment}>`)}
    ${isNew('mc', st.id) ? form() : null}
  </div>`; };
  const loose = pl.sts.filter(s => !pl.wcs.some(w => w.id === s.wc)), freeM = pl.mcs.filter(m => !pl.sts.some(s => s.id === m.st));
  return html`<div className="plant">
    <div className="plhead"><span className="muted">${pl.wcs.length} iş merkezi · ${pl.sts.length} istasyon · ${pl.mcs.length} makine${saved === false && pl.sts.length ? ' · örnek yapı (henüz kaydedilmedi)' : ''}</span><span className="sp"></span>
      ${!pl.sts.length ? html`<button className="btn" onClick=${() => commit(JSON.parse(JSON.stringify(PLANT_DEMO)), 'Örnek yapı yüklendi · düzenleyebilirsin')}>Örnek yapıyla başla</button>` : null}
      ${saved === false && pl.sts.length ? html`<button className="btn" onClick=${() => commit(pl, 'Yapı kaydedildi')}>Bu yapıyı kaydet</button>` : null}
      <button className="btn pri" onClick=${() => addTo('wc', {}, '')}><${I} n="plus" s=${18} />İş merkezi</button></div>
    ${isNew('wc', '') ? form() : null}
    ${pl.wcs.map(w => { const sts = pl.sts.filter(s => s.wc === w.id), shut = open[w.id] === false; return html`<div key=${w.id} className=${'pwc glass ' + (act_(w) ? '' : 'off')}>
      <div className="pwch"><button className="pwct" onClick=${() => setOpen(o => Object.assign({}, o, { [w.id]: shut }))} aria-expanded=${!shut}><${I} n=${shut ? 'chev' : 'chevd'} s=${16} /><span className="tag">${w.id}</span><b>${w.name}</b><small>${sts.length} istasyon${w.note ? ' · ' + w.note : ''}${act_(w) ? '' : ' · pasif'}</small></button>
        <button className="lnk" onClick=${() => start('wc', w)}>Düzenle</button><button className="lnk" onClick=${() => { setOpen(o => Object.assign({}, o, { [w.id]: true })); addTo('st', { wc: w.id, t: (sts[0] || {}).t || 'cnc' }, w.id); }}>+ İstasyon</button></div>
      ${isEd('wc', w.id) ? form() : null}
      ${shut ? null : html`<div className="pwcb">${sts.map(stRow)}${isNew('st', w.id) ? form() : null}${!sts.length && !isNew('st', w.id) ? html`<small className="muted">İstasyon yok.</small>` : null}</div>`}
    </div>`; })}
    ${loose.length ? html`<div className="pwc glass"><div className="pwch"><b>İş merkezi atanmamış istasyonlar</b></div><div className="pwcb">${loose.map(stRow)}</div></div>` : null}
    ${freeM.length ? html`<div className="pwc glass"><div className="pwch"><b>İstasyona bağlı olmayan makineler</b></div><div className="pwcb">${freeM.map(m => html`<${Fragment} key=${m.id}>${mcRow(m)}${isEd('mc', m.id) ? form() : null}</${Fragment}>`)}</div></div>` : null}
    ${pl.wcs.length ? html`<button className="lnk" style=${{ justifySelf: 'start' }} onClick=${() => addTo('mc', {}, '-')}>+ İstasyonsuz makine ekle</button>` : null}
    ${isNew('mc', '-') ? form() : null}
  </div>`;
}

/* ── Ayarlar › Yetki matrisi (yalnız yönetici) ── */
export function PermEditor({ say }) {
  const [m, setM] = useState(() => JSON.parse(JSON.stringify(PERMM))), [dirty, setDirty] = useState(false);
  const kilitli = yetkilerTmide(AKStore.status().mode);
  const roles = ROLES.filter(([k]) => k !== 'admin');
  const tog = (r, k) => { const L = m[r] || []; setM(Object.assign({}, m, { [r]: L.includes(k) ? L.filter(x => x !== k) : L.concat([k]) })); setDirty(true); };
  const save = async () => { const m2 = Object.assign({}, m, { _known: PERMS.map(p => p.k) }); setPERMM(permsFrom(m2)); await AKStore.DB.put('kv', m2, 'perms'); audit('yetki', 'yetki matrisi değişti', '', ROLES.filter(([r]) => r !== 'admin').map(([r, l]) => l + ': ' + (m[r] || []).length).join(' · ')); Bus.send({ type: 'cfg' }); setDirty(false); say('Yetkiler kaydedildi · bütün cihazlarda geçerli', 'check', 'var(--run)'); };
  const groups = Array.from(new Set(PERMS.map(p => p.g)));
  return html`<div className="permw">
    <div className="permscroll"><table className="perm"><thead><tr><th>İşlem</th><th className="rc" title="Yönetici her şeye yetkilidir">Yönetici</th>${roles.map(([k, l]) => html`<th key=${k} className="rc">${l}</th>`)}</tr></thead>
      <tbody>${groups.map(g => html`<${Fragment} key=${g}><tr className="pg"><td colSpan=${roles.length + 2}>${g}</td></tr>${PERMS.filter(p => p.g === g).map(p => html`<tr key=${p.k}><td>${p.l}</td><td className="rc"><span className="pmk on plock" title="Yönetici · değiştirilemez"><${I} n="check" s=${14} /></span></td>${roles.map(([r]) => { const on = (m[r] || []).includes(p.k); return html`<td key=${r} className="rc"><button className=${'pmk ' + (on ? 'on' : '')} role="checkbox" aria-checked=${on} aria-label=${ROLE_L[r] + ' · ' + p.l} disabled=${kilitli} onClick=${() => tog(r, p.k)}>${on ? html`<${I} n="check" s=${14} />` : null}</button></td>`; })}</tr>`)}</${Fragment}>`)}</tbody></table></div>
    ${kilitli ? KILIT(YETKI_KILIDI) : html`<div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn" onClick=${() => { setM(JSON.parse(JSON.stringify(PERMS0))); setDirty(true); }}>Varsayılanlara dön</button><span className="sp" style=${{ flex: 1 }}></span><small className="muted" style=${{ alignSelf: 'center' }}>${dirty ? 'Kaydedilmemiş değişiklik var' : 'Kişinin rolü Kullanıcılar bölümünden seçilir'}</small><button className="btn pri" disabled=${!dirty} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div>`}
  </div>`;
}
// Sunucuya bağlı Arkon'da vardiyalar TMI'nin Vardiya sayfasındadır; sunucu kv/shifts yazımını reddeder (A7, #517). Liste salt okunur gösterilir.
const vardiyalarTmide = () => AKStore.status().mode === 'server';
function ShiftList() {
  return html`<div className="shl">
    ${SHIFTS.map((x, i) => html`<div key=${i} className="shr"><b className="shn">${x.name}</b><span className="mono">${x.start} – ${x.end}</span>
      <div className="shb">${(x.breaks || []).map((b, k) => html`<span key=${k} className="shbr mono">${b.at} · ${b.min} dk</span>`)}</div></div>`)}
    <small className="muted"><${I} n="lock" s=${14} /> Vardiyalar ve molalar TMI'de Vardiya sayfasından değiştirilir.</small>
  </div>`;
}
const KILIT = (metin: string) => html`<small className="muted"><${I} n="lock" s=${14} /> ${metin}</small>`;
function PlantList() {
  return html`<div className="plant">
    ${tesisGruplari(PLANT).map((g, i) => html`<div key=${g.merkez ? g.merkez.id : '-' + i} className=${'pwc glass ' + (g.merkez && !act_(g.merkez) ? 'off' : '')}>
      <div className="pwch">${g.merkez ? html`<span className="tag">${g.merkez.id}</span><b>${g.merkez.name}</b>` : html`<b>İş merkezi atanmamış istasyonlar</b>`}<small>${g.istasyonlar.length} istasyon</small></div>
      <div className="pwcb">${g.istasyonlar.map(({ istasyon: st, makineler }) => html`<div key=${st.id} className=${'pst ' + (act_(st) ? '' : 'off')}>
        <div className="psth"><span className="pic"><${I} n=${(OPTYPES[st.t || 'cnc'] || OPTYPES.cnc).i} s=${18} /></span><div><b className="mono">${st.id}</b><small>${st.name}${act_(st) ? '' : ' · pasif'}</small></div></div>
        ${makineler.map(m => html`<div key=${m.id} className=${'pmc ' + (act_(m) ? '' : 'off')}><${I} n="cpu" s=${16} /><b className="mono">${m.id}</b><span>${m.name}${m.kind ? ' · ' + m.kind : ''}</span></div>`)}
      </div>`)}${!g.istasyonlar.length ? html`<small className="muted">İstasyon yok.</small>` : null}</div>
    </div>`)}
    ${KILIT('Tesis TMI\'de İstasyonlar sayfasından değiştirilir.')}
    ${gomuluMu() ? html`<button className="btn" onClick=${() => tmiyeGit('istasyonlar')}><${I} n="layers" s=${18} />İstasyonlar sayfasını aç</button>` : null}
  </div>`;
}
function ReasonList() {
  return html`<div className="shl">
    ${REASONS.map(r => html`<div key=${r.code} className="shr"><b className="shn mono">${r.code}</b><span>${r.l}</span><span className="tag">${r.cat === 'p' ? 'Planlı' : 'Plansız'}</span></div>`)}
    ${KILIT('Duruş nedenleri TMI\'de Duruş ve Hurda Nedenleri sayfasından değiştirilir.')}
  </div>`;
}
function ScrapList() {
  return html`<div className="shl">
    ${SCRAPS.map(r => html`<div key=${r.code} className="shr"><b className="shn mono">${r.code}</b><span>${r.l}</span></div>`)}
    ${KILIT('Hurda nedenleri TMI\'de Duruş ve Hurda Nedenleri sayfasından değiştirilir.')}
  </div>`;
}
export function ShiftEditor({ say }) {
  const [list, setList] = useState(SHIFTS.map(x => Object.assign({}, x, { breaks: (x.breaks || []).map(b => Object.assign({}, b)) })));
  const up = (i, ch) => setList(list.map((x, j) => j === i ? Object.assign({}, x, ch) : x));
  const save = async () => { await AKStore.DB.put('kv', list, 'shifts'); setSHIFTS(list); Bus.send({ type: 'cfg' }); audit('vardiya', 'vardiyalar değişti', '', list.map(x => x.name + ' ' + x.start + '–' + x.end).join(' · ')); say('Vardiyalar kaydedildi', 'check', 'var(--run)'); };
  return html`<div className="shl">
    ${list.map((x, i) => html`<div key=${i} className="shr">
      <input className="shn" value=${x.name} onChange=${e => up(i, { name: e.target.value })} aria-label="Vardiya adı" />
      <input type="time" value=${x.start} onChange=${e => up(i, { start: e.target.value })} /><span>–</span><input type="time" value=${x.end} onChange=${e => up(i, { end: e.target.value })} />
      <div className="shb">${(x.breaks || []).map((b, k) => html`<span key=${k} className="shbr"><input type="time" value=${b.at} onChange=${e => up(i, { breaks: x.breaks.map((y, q) => q === k ? Object.assign({}, y, { at: e.target.value }) : y) })} /><input type="number" min="0" value=${b.min} onChange=${e => up(i, { breaks: x.breaks.map((y, q) => q === k ? Object.assign({}, y, { min: +e.target.value || 0 }) : y) })} />dk<button className="x" onClick=${() => up(i, { breaks: x.breaks.filter((_, q) => q !== k) })} aria-label="Molayı sil">×</button></span>`)}<button className="lnk" onClick=${() => up(i, { breaks: (x.breaks || []).concat([{ at: x.start, min: 15 }]) })}>+ mola</button></div>
      <button className="x" onClick=${() => setList(list.filter((_, j) => j !== i))} aria-label="Vardiyayı sil"><${I} n="trash" s=${16} /></button>
    </div>`)}
    <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setList(list.concat([{ name: String.fromCharCode(65 + list.length), start: '08:00', end: '16:00', breaks: [] }]))}><${I} n="plus" s=${16} />Vardiya</button><button className="btn pri" style=${{ flex: 1 }} onClick=${save}><${I} n="check" s=${18} />Vardiyaları kaydet</button></div>
    <small className="muted">Molalar OEE'de planlı süreden düşülür. Gece vardiyası ertesi güne taşabilir (22:00 – 06:00).</small>
  </div>`;
}
export function BackupCard({ say, st }) {
  const [list, setList] = useState(null), [busy, setBusy] = useState(''), fileRef = useRef(null);
  const srv = st.mode === 'server';
  const load = () => srv ? AKStore.Backup.list().then(setList).catch(() => setList([])) : setList([]);
  useEffect(() => { load(); }, [srv]);
  const dl = async n => { setBusy(n); try { const b = await AKStore.Backup.download(n); await download(n, b, 'application/gzip'); } catch (e) { say('İndirilemedi: ' + e.message, 'alert', 'var(--stop)'); } setBusy(''); };
  const mk = async () => { setBusy('mk'); try { if (srv) { await AKStore.Backup.create(); load(); say('Yedek alındı', 'check', 'var(--run)'); } else { const b = await AKStore.Backup.exportLocal(); const d = new Date(); await download('arkon-cihaz-yedegi-' + d.toISOString().slice(0, 10) + '.json.gz', b, 'application/gzip'); AKStore.local.put('kv', Date.now(), 'lastBackup'); say('Cihaz yedeği indirildi', 'check', 'var(--run)'); } } catch (e) { say('Yedek alınamadı: ' + e.message, 'alert', 'var(--stop)'); } setBusy(''); };
  const rs = async f => { if (!f) return; if (!confirm('Bütün veri bu yedekteki hâliyle değiştirilecek. Devam edilsin mi?' + (srv ? ' (Sunucu, geri yüklemeden önce mevcut verinin yedeğini alır.)' : ''))) return; setBusy('rs'); try { const b = new Uint8Array(await f.arrayBuffer()); if (srv) await AKStore.Backup.restore(b); else await AKStore.Backup.importLocal(b); say('Yedek geri yüklendi · sayfa yenileniyor', 'check', 'var(--run)'); setTimeout(() => location.reload(), 1200); } catch (e) { say('Geri yüklenemedi: ' + e.message, 'alert', 'var(--stop)'); } setBusy(''); };
  return html`<div className="bkl">
    <p className="muted" style=${{ margin: 0 }}>${srv ? 'Sunucu her gece kendiliğinden yedek alır (son 30 gün saklanır). Buradan elle yedek alıp indirebilir, bir yedeği geri yükleyebilirsin.' : 'Bu cihazdaki bütün veri (paketler, sonuçlar, ölçüm ve üretim kayıtları) tek dosyaya indirilir. Tablet sıfırlanırsa bu dosyayla geri yüklenir. Sunucuya geçmek kalıcı çözümdür.'}</p>
    <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn pri" disabled=${!!busy} onClick=${mk}><${I} n="download" s=${18} />${srv ? 'Şimdi yedek al' : 'Cihaz yedeğini indir'}</button><button className="btn" disabled=${!!busy} onClick=${() => fileRef.current.click()}><${I} n="upload" s=${18} />Yedekten geri yükle</button></div>
    <input ref=${fileRef} type="file" accept=".gz,.json,application/gzip,application/json" style=${{ display: 'none' }} onChange=${e => { rs(e.target.files[0]); e.target.value = ''; }} />
    ${srv && list && list.length ? html`<div className="bklist">${list.slice(0, 12).map(b => html`<div key=${b.name} className="bkr"><span className="mono">${new Date(b.at).toLocaleString('tr-TR')}</span><span className="muted">${(b.size / 1048576).toFixed(1)} MB${/-elle\./.test(b.name) ? ' · elle' : /geri-yukleme/.test(b.name) ? ' · geri yükleme öncesi' : ''}</span><button className="lnk" disabled=${busy === b.name} onClick=${() => dl(b.name)}>İndir</button></div>`)}</div>` : null}
    ${srv && list && !list.length ? html`<small className="muted">Henüz yedek yok.</small>` : null}
  </div>`;
}
export function ServerCard({ say, st }) {
  const [url, setUrl] = useState(AKStore.Server.saved || (st.mode === 'server' ? st.base : '')), [t, setT] = useState(null);
  const test = async () => { setT('…'); const j = await AKStore.Server.test(url.trim()); setT(j ? 'ok' : 'no'); return j; };
  const save = async () => { const u = url.trim(); if (u && !(await test())) return; AKStore.Server.set(u || null); say(u ? 'Sunucu kaydedildi · yeniden bağlanılıyor' : 'Yerel moda geçiliyor', 'check', 'var(--run)'); setTimeout(() => location.reload(), 800); };
  return html`<div className="srvc">
    <div className=${'srvst ' + (st.mode === 'server' ? (st.online ? 'on' : 'off') : 'loc')}><i></i><div><b>${st.mode === 'server' ? (st.online ? 'Sunucuya bağlı' : 'Sunucuya ulaşılamıyor') : 'Yerel mod · veriler yalnız bu cihazda'}</b><small>${st.memory ? 'Cihaz deposu açılamadı: gönderilmemiş kayıtlar sekme kapanınca kaybolur. Gizli pencere kullanmayın, tarayıcı depolamasına izin verin. · ' : ''}${st.mode === 'server' ? st.base + (st.pending ? ' · gönderilmeyi bekleyen ' + st.pending + ' kayıt' : ' · her şey gönderildi') : 'Bütün tabletlerin aynı veriyi görmesi için Üretim Hazırlık sunucusunu kurup adresini gir.'}</small></div></div>
    <label className="fld"><span className="over">Sunucu adresi</span><input value=${url} onChange=${e => { setUrl(e.target.value); setT(null); }} placeholder="http://192.168.1.10:8080" inputMode="url" /></label>
    <div style=${{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button className="btn" onClick=${test} disabled=${!url.trim()}>Bağlantıyı dene</button><button className="btn pri" onClick=${save}>${url.trim() ? 'Kaydet ve bağlan' : 'Yerel moda geç'}</button>${t === 'ok' ? html`<span style=${{ color: 'var(--run)', fontWeight: 700 }}>✓ Sunucu yanıt verdi</span>` : t === 'no' ? html`<span style=${{ color: 'var(--stop)', fontWeight: 700 }}>Yanıt yok</span>` : null}</div>
    ${st.mode === 'server' && st.pending ? html`<button className="btn" onClick=${() => AKStore.Server.flush()}>Bekleyenleri şimdi gönder</button>` : null}
  </div>`;
}
export function SettingsApp() {
  const [theme, setTheme] = useTheme();
  const [feat, setFeat] = useState(FEAT.get()), [lite, setLite] = useState(LITE.get()), [toast, setToast] = useState(null), [opName, setOpName] = useState(LS.get('opName') || '');
  const st = useSrv(), me = MEU(), admin = !me || me.role === 'admin';
  const tesisDuzenler = tesisDuzenleyicisi(st.mode === 'server', can('adm.plant')), tesisOkur = tesisListesi(st.mode === 'server', can('page.prep'), can('adm.plant'));
  const nedenOkur = tmiListesiSaltOkunur(nedenlerTmide(), can('page.prep'), false);
  const SET_TABS: [string, string, () => boolean][] = [['genel', 'Genel', () => true], ['tesis', 'Tesis', () => tesisDuzenler || tesisOkur], ['kisi', 'Kişiler ve yetkiler', () => can('adm.users') || admin], ['uretim', 'Üretim', () => can('adm.shifts') || can('adm.reasons') || nedenOkur], ['sistem', 'Sistem', () => can('adm.backup') || can('adm.audit') || can('adm.plant')]];
  const [stab, setStab] = useState(() => { const t = LS.get('setTab'); return SET_TABS.some(x => x[0] === t && x[2]()) ? t : 'genel'; });
  const [needLogin, setNeedLogin] = useState(false);
  useEffect(() => { AKStore.Auth.required().then(setNeedLogin); }, []);
  const say = useCallback((m, i = 'check', c = 'var(--done)') => setToast({ m, i, c, k: Date.now() }), []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.setAttribute('data-state', 'done'); document.title = 'Üretim Hazırlık · Ayarlar'; }, [theme]);
  const tog = (k, v) => { FEAT.set(k, v); setFeat(FEAT.get()); };
  const now = useNow(30000), d = new Date(now);
  const card = (over, title, body, wide?) => html`<section className=${'glass setcard ' + (wide ? 'setwide' : '')}><div className="dh"><div><span className="over">${over}</span><b style=${{ display: 'block' }}>${title}</b></div></div>${body}</section>`;
  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <header className="top">
        <${Brand} /><span className="vsep"></span>
        <div className="sbig prepmode" style=${{ '--sig': 'var(--idle)', color: 'var(--ink)' }}><${I} n="gear" s=${20} /><span className="sname" style=${{ color: 'var(--ink)' }}>Ayarlar</span></div>
        <div className="sp"></div>
        <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>${currentShift(now).label}</small></div>
      </header>
      <main className="setmain">
        <div className="settabs">${SET_TABS.filter(t => t[2]()).map(([k, l]) => html`<button key=${k} className=${'seg ' + (stab === k ? 'on' : '')} onClick=${() => { setStab(k); LS.set('setTab', k); }}>${l}</button>`)}</div>
        ${stab === 'genel' ? html`<${Fragment}>
        ${card('Hesap', me ? me.name : 'Giriş yapılmadı', html`<div className="srvc">${me ? html`<div className="lgme"><span className="av">${initials(me.name)}</span><div><b>${me.name}</b><small>${ROLE_L[me.role]}</small></div><button className="btn" style=${{ marginLeft: 'auto' }} onClick=${async () => { await AKStore.Auth.logout(); location.hash = ''; location.reload(); }}>Çıkış</button></div>` : html`<${Fragment}><p className="muted" style=${{ margin: 0 }}>Bu cihazda kişi girişi kapalı. Kayıtlarda aşağıdaki ad kullanılır; kişi eklersen açılışta PIN istenir.</p><label className="fld"><span className="over">Bu tabletteki operatör adı</span><input value=${opName} onChange=${e => { setOpName(e.target.value); LS.set('opName', e.target.value.trim() || null); }} placeholder="örn. Ad S." /></label></${Fragment}>`}</div>`)}
        ${!gomuluMu() && admin ? card('Bağlantı', 'Sunucu', html`<${ServerCard} say=${say} st=${st} />`) : null}
        ${card('Operatör ekranı', 'Ekran modülleri', html`<${Fragment}>
          <${Sw} on=${feat.spindle} onChange=${v => tog('spindle', v)} l="İş mili yükü ve devir grafiği" d="Analiz sekmesinde. Tezgâh bağlantısı (FOCAS / OPC UA / MTConnect) kurulana kadar gerçek veri değil, deneme verisi gösterir." />
          <${Sw} on=${feat.autoCount} onChange=${v => tog('autoCount', v)} l="Otomatik parça sayımı (tanıtım)" d="Kapalıyken parça yalnız operatörün İyi +1 düğmesiyle artar. Açılırsa çalışırken her çevrim süresinde 1 parça kendiliğinden eklenir — yalnız tanıtım içindir." />
          <${Sw} on=${lite} onChange=${v => { LITE.set(v); setLite(v); }} l="Performans modu" d="Zayıf tablette efektleri azaltır, pili korur" />
          <${Sw} on=${theme === 'light'} onChange=${v => setTheme(v ? 'light' : 'dark')} l="Gün ışığı (açık) teması" d="Aydınlık ortamda okunurluk için" />
          <small className="muted">Bu ayarlar yalnız bu cihazda geçerlidir.</small></${Fragment}>`)}
        ${can('page.draw') ? card('Teknik resim', 'PDF ve 3B okuma', html`<${Fragment}><p className="muted" style=${{ margin: 0 }}>Çözünürlük, renk, OCR, ayıklama ve 3B ağ kalitesi Çizim stüdyosunda denenip tüm sisteme ya da bir iş paketine uygulanır.</p>
          <a className="btn" href="#cizim" onClick=${e => navGo(e, 'cizim')} style=${{ textDecoration: 'none', color: 'inherit', justifySelf: 'start' }}><${I} n="lab" s=${18} />Çizim stüdyosunu aç</a></${Fragment}>`) : null}

        </${Fragment}>` : null}
        ${stab === 'tesis' ? html`<${Fragment}>
        ${tesisDuzenler ? card('Tesis', 'İş merkezleri, istasyonlar, makineler', html`<${PlantEditor} say=${say} />`, true) : null}
        ${tesisOkur ? card('Tesis', 'İş merkezleri, istasyonlar, makineler', html`<${PlantList} />`, true) : null}
        </${Fragment}>` : null}
        ${stab === 'kisi' ? html`<${Fragment}>
        ${can('adm.users') ? card('Kişiler', 'Kullanıcılar ve PIN', html`<${UserEditor} say=${say} />`) : null}
        ${admin ? card('Roller', 'İşlem yetki matrisi', html`<${PermEditor} say=${say} />`, true) : null}
        </${Fragment}>` : null}
        ${stab === 'uretim' ? html`<${Fragment}>
        ${can('adm.shifts') ? card('Çalışma düzeni', 'Vardiyalar ve molalar', vardiyalarTmide() ? html`<${ShiftList} />` : html`<${ShiftEditor} say=${say} />`) : null}
        ${can('adm.reasons') ? card('Kurallar', 'Çalışma kuralları', html`<${PolicyEditor} say=${say} />`) : null}
        ${can('adm.reasons') && !nedenlerTmide() ? card('Duruşlar', 'Duruş nedenleri · planlı / plansız', html`<${ReasonEditor} say=${say} />`, true) : null}
        ${can('adm.reasons') && !nedenlerTmide() ? card('Kalite', 'Hurda nedenleri', html`<${ScrapEditor} say=${say} />`) : null}
        ${nedenOkur ? card('Duruşlar', 'Duruş nedenleri · planlı / plansız', html`<${ReasonList} />`, true) : null}
        ${nedenOkur ? card('Kalite', 'Hurda nedenleri', html`<${ScrapList} />`) : null}
        </${Fragment}>` : null}
        ${stab === 'sistem' ? html`<${Fragment}>
        ${can('adm.backup') ? card('Güvence', 'Yedekleme', html`<${BackupCard} say=${say} st=${st} />`) : null}
        ${can('adm.plant') ? card('Makine verisi', 'Otomatik sayım ve durum', html`<${CollectorCard} />`) : null}
        ${can('adm.audit') ? card('İzlenebilirlik', 'Değişiklik günlüğü', html`<${AuditView} />`, true) : null}
        </${Fragment}>` : null}
      </main>
    </div>
    ${toast ? html`<div key=${toast.k} className="toast" role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}</div>` : null}
  </${Fragment}>`;
}

