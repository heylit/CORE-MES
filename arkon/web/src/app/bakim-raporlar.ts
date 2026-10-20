import type { Gauge } from '@shared/model';
import { AKStore } from '../data/store';
import { CALLS, Fragment, I, REASONS, fmt, html, isPlannedReason, reasonOf, scrapOf, useCallback, useEffect, useMemo, useNow, useState } from './temel';
import { nedenAdi, nedenToplamlariniBirlestir, paretoSatirlari } from '../data/durus-nedeni';
import { LS } from './yukleyici';
import { gunAraliklari } from '../data/vardiya-gunu';
import { DOWNS, ME, PLANT, POLICY, SHIFTS, act_, allowed, audit, can, machineOf, mcOf, oeeCalc, setDOWNS, shiftWindows, stationList } from './ortak-ayarlar';
import { PreviewOv, VardiyaTanimsiz, pctS } from './operator-parcalar';
import { OPTYPES, StationSelect, opOf } from './istasyonlar';
import { Bus, apPending, uidg } from './hazirlik';
import { DAYS, PageShell, Segs, WcFilter, callsFrom, csvDownload, delDoc, dmy, dmyhm, mins, minsL, putDoc, toLocalInput, useDocs, useToast } from './pano-planlama';

/* ══ Bakım (#bakim): arıza kayıtları, periyodik bakım, makine güvenilirliği (MTBF / MTTR) ══ */
export const CAUSES = ['Mekanik', 'Elektrik', 'Hidrolik / pnömatik', 'Elektronik / kontrol', 'Yazılım / program', 'Takım / aparat', 'Operatör hatası', 'Diğer'];
export function MaintApp() {
  const [say, toastEl] = useToast();
  const [tab, setTab] = useState(LS.get('maintTab') || 'ariza');
  const [list, reload] = useDocs('maint');
  const open = list.filter(m => m.type === 'ariza' && m.status !== 'done'), plans = list.filter(m => m.type === 'plan');
  const now = useNow(60000), due = plans.filter(p => p.active !== false && (p.lastAt || 0) + (p.everyDays || 30) * 864e5 <= now + 7 * 864e5).length;
  const setT = k => { setTab(k); LS.set('maintTab', k); };
  return html`<${PageShell} icon="wrench" title="Bakım" color="var(--stop)" extra=${html`<${Segs} v=${tab} onChange=${setT} opts=${[['ariza', 'Arızalar', open.length || null], ['plan', 'Periyodik bakım', due || null], ['mc', 'Makine güvenilirliği']]} />`} mainClass="maintmain">
    ${tab === 'ariza' ? html`<${FaultView} list=${list} reload=${reload} say=${say} />` : tab === 'plan' ? html`<${PmView} list=${list} reload=${reload} say=${say} />` : html`<${RelView} list=${list} />`}
    ${toastEl}
  </${PageShell}>`;
}
export function FaultView({ list, reload, say }) {
  const [ed, setEd] = useState(null), [days, setDays] = useState(30), now = useNow(30000), edit = can('maint.work');
  const faults = list.filter(m => m.type === 'ariza').sort((a, b) => b.openedAt - a.openedAt);
  const open = faults.filter(m => m.status !== 'done'), closed = faults.filter(m => m.status === 'done' && m.closedAt > now - days * 864e5);
  const save = async (m, patchD, msg) => { const n = Object.assign({}, m, patchD); await putDoc('maint', n); audit('bakım', msg, n.st + (n.mc ? ' · ' + n.mc : ''), n.title); reload(); setEd(null); say('Arıza kaydı: ' + msg, 'check', 'var(--run)'); };
  const nw = () => { const st = (stationList()[0] || {}).id || ''; return { id: 'ar-' + Date.now(), isNew: true, type: 'ariza', st, mc: (machineOf(st).mcs[0] || {}).id || '', title: '', openedAt: Date.now(), openedBy: ME(), status: 'open' }; };
  const F = (k, v) => setEd(Object.assign({}, ed, { [k]: v }));
  const form = () => html`<div className="glass uedit">
    <div className="plgrid">
      ${ed.isNew ? html`<${Fragment}><label className="fld"><span className="over">İstasyon</span><${StationSelect} v=${ed.st} onChange=${v => setEd(Object.assign({}, ed, { st: v, mc: (machineOf(v).mcs[0] || {}).id || '' }))} /></label>
        <label className="fld"><span className="over">Makine</span><select value=${ed.mc || ''} onChange=${e => F('mc', e.target.value)}><option value="">—</option>${machineOf(ed.st).mcs.map(m => html`<option key=${m.id} value=${m.id}>${m.id} · ${m.name}</option>`)}</select></label>
        <label className="fld"><span className="over">Arıza</span><input value=${ed.title} onChange=${e => F('title', e.target.value)} placeholder="örn. Hidrolik kaçak, ayna basıncı düşük" /></label></${Fragment}>` : html`<${Fragment}>
        <label className="fld"><span className="over">Sebep</span><select value=${ed.cause || ''} onChange=${e => F('cause', e.target.value)}><option value="">Seç</option>${CAUSES.map(c => html`<option key=${c}>${c}</option>`)}</select></label>
        <label className="fld"><span className="over">Yapılan işlem</span><input value=${ed.action || ''} onChange=${e => F('action', e.target.value)} placeholder="örn. Conta değişti, basınç ayarlandı" /></label>
        <label className="fld"><span className="over">Kullanılan parça</span><input value=${ed.parts || ''} onChange=${e => F('parts', e.target.value)} placeholder="örn. O-ring 32×3 (2 ad.)" /></label></${Fragment}>`}
    </div>
    <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setEd(null)}>Vazgeç</button>${ed.isNew ? html`<button className="btn pri" style=${{ flex: 1 }} disabled=${!ed.title} onClick=${() => { const d = Object.assign({}, ed); delete d.isNew; d.wc = machineOf(d.st).wc || null; save(d, {}, 'açıldı'); }}><${I} n="check" s=${18} />Arıza kaydı aç</button>` : html`<button className="btn pri" style=${{ flex: 1 }} disabled=${!ed.cause} onClick=${() => { const d = Object.assign({}, ed); delete d.closing; save(d, { status: 'done', closedAt: Date.now(), closedBy: ME(), repairMs: Date.now() - (d.openedAt || Date.now()) }, 'kapatıldı'); }}><${I} n="check" s=${18} />Kapat · makine hazır</button>`}</div>
  </div>`;
  const row = m => html`<div key=${m.id} className=${'glass frow ' + m.status}>
    <div className="frh"><span className="pic" style=${{ color: m.status === 'done' ? 'var(--run)' : 'var(--stop)' }}><${I} n="wrench" s=${18} /></span><div><b>${m.st}${m.mc ? ' · ' + ((mcOf(m.mc) || {}).name || m.mc) : ''}</b><small>${m.title}${m.orderNo ? ' · ' + m.orderNo : ''}</small></div>
      <span className="chip" style=${{ '--c': m.status === 'done' ? 'var(--run)' : m.status === 'work' ? 'var(--hazard)' : 'var(--stop)' }}><i></i>${m.status === 'done' ? 'Kapandı · ' + minsL(m.repairMs) : m.status === 'work' ? 'Müdahalede · ' + minsL(now - m.openedAt) : 'Açık · ' + minsL(now - m.openedAt)}</span></div>
    <small className="muted">Açılış ${dmyhm(m.openedAt)} · ${m.openedBy || '—'}${m.ackAt ? ' · üstlendi ' + (m.ackBy || '') + ' (' + mins(m.ackAt - m.openedAt) + ' dk sonra)' : ''}${m.closedAt ? ' · kapanış ' + dmyhm(m.closedAt) + ' · ' + (m.closedBy || '') : ''}</small>
    ${m.status === 'done' ? html`<small><b>${m.cause}</b>${m.action ? ' · ' + m.action : ''}${m.parts ? ' · Parça: ' + m.parts : ''}</small>` : edit && !(ed && ed.id === m.id) ? html`<div style=${{ display: 'flex', gap: 8 }}>${m.status === 'open' ? html`<button className="btn" onClick=${() => save(m, { status: 'work', ackAt: Date.now(), ackBy: ME() }, 'üstlenildi')}>Üstlen</button>` : null}<button className="btn pri" onClick=${() => setEd(Object.assign({}, m, { closing: true }))}>Kapat…</button></div>` : null}
    ${ed && ed.id === m.id && !ed.isNew ? form() : null}
  </div>`;
  return html`<div className="mw">
    <div className="plantop"><span className="over">Bakım çağrısı üstlenilince arıza kaydı kendiliğinden açılır. Kapatırken sebep ve yapılan işlem girilir; MTTR / MTBF bunlardan hesaplanır.</span><span className="sp"></span>${edit ? html`<button className="btn pri" onClick=${() => setEd(nw())}><${I} n="plus" s=${18} />Arıza kaydı aç</button>` : null}</div>
    ${ed && ed.isNew ? form() : null}
    <span className="over">Açık · ${open.length}</span>${open.length ? open.map(row) : html`<small className="muted">Açık arıza yok.</small>`}
    <div className="plantop"><span className="over">Kapanan · son</span><${Segs} v=${days} onChange=${setDays} opts=${[[7, '7 gün'], [30, '30 gün'], [90, '90 gün']]} /></div>
    ${closed.length ? closed.map(row) : html`<small className="muted">Bu aralıkta kapanan arıza yok.</small>`}
  </div>`;
}
export function PmView({ list, reload, say }) {
  const [ed, setEd] = useState(null), [dn, setDn] = useState(null), now = useNow(60000), edit = can('maint.plan'), work = can('maint.work');
  const plans = list.filter(m => m.type === 'plan').map(p => Object.assign({}, p, { due: (p.lastAt || 0) + (p.everyDays || 30) * 864e5 })).sort((a, b) => a.due - b.due);
  const hist = list.filter(m => m.type === 'pm').sort((a, b) => b.at - a.at);
  const allMc = PLANT.mcs.filter(act_);
  const F = (k, v) => setEd(Object.assign({}, ed, { [k]: v }));
  const savePlan = async () => { if (!ed.mc || !ed.title) return say('Makine ve bakım adı gerekli', 'alert', 'var(--stop)'); const d = Object.assign({}, ed); delete d.isNew; d.st = (mcOf(d.mc) || {}).st || ''; await putDoc('maint', d); audit('bakım', ed.isNew ? 'periyodik plan eklendi' : 'periyodik plan değişti', d.mc, d.title + ' · ' + d.everyDays + ' günde bir'); setEd(null); reload(); say('Bakım planı kaydedildi', 'check', 'var(--run)'); };
  const doneIt = async p => { if (!allowed('maint.work', say)) return; const at = Date.now(); await putDoc('maint', { id: 'pm-' + at, type: 'pm', planId: p.id, mc: p.mc, st: p.st, title: p.title, at, by: ME() }); const n = Object.assign({}, p); delete n.due; n.lastAt = at; await putDoc('maint', n); audit('bakım', 'periyodik bakım yapıldı', p.mc, p.title); reload(); say(p.title + ' yapıldı · sonraki ' + dmy(at + p.everyDays * 864e5), 'check', 'var(--run)'); };
  const planDown = async () => { if (!allowed('down.edit', say)) return; const p = dn.p, d = { id: 'dn-' + uidg(), title: 'Bakım · ' + p.title, reason: (REASONS.find(r => r.code === 'D-07') || REASONS.find(r => r.cat === 'p') || {}).code, scope: 'st', target: p.st, from: dn.from, to: dn.from + dn.min * 60e3, rep: 'none', note: p.mc, by: ME(), at: Date.now() }; await putDoc('downs', d); setDOWNS(await AKStore.DB.all('downs')); Bus.send({ type: 'cfg' }); audit('planlı duruş', 'bakım için eklendi', d.title, dmyhm(d.from)); setDn(null); say('Planlı duruş eklendi · ' + dmyhm(d.from), 'clock', 'var(--done)'); };
  return html`<div className="mw">
    <div className="plantop"><span className="over">Makine başına periyodik bakımlar. Yaklaşan bakım için planlı duruş eklenince OEE ve iş planı buna göre ayarlanır.</span><span className="sp"></span>${edit ? html`<button className="btn pri" onClick=${() => setEd({ id: 'pl-' + uidg(), isNew: true, type: 'plan', mc: (allMc[0] || {}).id || '', title: '', everyDays: 30, durMin: 60, lastAt: Date.now() })}><${I} n="plus" s=${18} />Bakım planı ekle</button>` : null}</div>
    ${!allMc.length ? html`<small className="muted">Önce Ayarlar › Tesis yapısı'nda makine tanımla.</small>` : null}
    ${ed ? html`<div className="glass uedit"><div className="plgrid">
      <label className="fld"><span className="over">Makine</span><select value=${ed.mc} onChange=${e => F('mc', e.target.value)}>${allMc.map(m => html`<option key=${m.id} value=${m.id}>${m.id} · ${m.name}${m.st ? ' · ' + m.st : ''}</option>`)}</select></label>
      <label className="fld"><span className="over">Bakım</span><input value=${ed.title} onChange=${e => F('title', e.target.value)} placeholder="örn. Yağ ve filtre değişimi" /></label>
      <label className="fld"><span className="over">Kaç günde bir</span><input type="number" min="1" value=${ed.everyDays} onChange=${e => F('everyDays', +e.target.value || 1)} /></label>
      <label className="fld"><span className="over">Süre (dk)</span><input type="number" min="0" value=${ed.durMin || 0} onChange=${e => F('durMin', +e.target.value || 0)} /></label>
      <label className="fld"><span className="over">Son yapıldığı gün</span><input type="date" value=${toLocalInput(ed.lastAt || Date.now()).slice(0, 10)} onChange=${e => F('lastAt', new Date(e.target.value + 'T12:00').getTime())} /></label>
      <label className="fld"><span className="over">Talimat / not</span><input value=${ed.note || ''} onChange=${e => F('note', e.target.value)} /></label>
    </div><div style=${{ display: 'flex', gap: 8 }}>${!ed.isNew ? html`<button className="btn" style=${{ color: 'var(--stop)' }} onClick=${async () => { if (confirm('Plan silinsin mi?')) { await delDoc('maint', ed.id); audit('bakım', 'periyodik plan silindi', ed.mc, ed.title); setEd(null); reload(); } }}>Sil</button>` : null}<button className="btn" onClick=${() => setEd(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${savePlan}><${I} n="check" s=${18} />Kaydet</button></div></div>` : null}
    ${plans.map(p => { const left = Math.round((p.due - now) / 864e5), tone = left < 0 ? 'var(--stop)' : left <= 7 ? 'var(--hold)' : 'var(--run)'; return html`<div key=${p.id} className="glass frow">
      <div className="frh"><span className="pic" style=${{ color: tone }}><${I} n="gauge" s=${18} /></span><div><b>${p.title}</b><small>${p.mc} · ${(mcOf(p.mc) || {}).name || ''}${p.st ? ' · ' + p.st : ''} · ${p.everyDays} günde bir${p.durMin ? ' · ' + p.durMin + ' dk' : ''}</small></div>
        <span className="chip" style=${{ '--c': tone }}><i></i>${left < 0 ? -left + ' gün gecikti' : left === 0 ? 'Bugün' : left + ' gün kaldı'}</span></div>
      <small className="muted">Son: ${p.lastAt ? dmy(p.lastAt) : '—'} · Sonraki: ${dmy(p.due)}${p.note ? ' · ' + p.note : ''}</small>
      <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>${work ? html`<button className="btn pri" onClick=${() => doneIt(p)}><${I} n="check" s=${16} />Yapıldı</button>` : null}${can('down.edit') && p.st ? html`<button className="btn" onClick=${() => { const t = new Date(Math.max(now + 3600e3, p.due)); t.setMinutes(0, 0, 0); setDn({ p, from: t.getTime(), min: p.durMin || 60 }); }}><${I} n="clock" s=${16} />Planlı duruş ekle</button>` : null}${edit ? html`<button className="lnk" onClick=${() => setEd(Object.assign({}, p))}>Düzenle</button>` : null}</div>
      ${dn && dn.p.id === p.id ? html`<div className="uedit"><div className="plgrid"><label className="fld"><span className="over">Başlangıç</span><input type="datetime-local" value=${toLocalInput(dn.from)} onChange=${e => setDn(Object.assign({}, dn, { from: new Date(e.target.value).getTime() || dn.from }))} /></label><label className="fld"><span className="over">Süre (dk)</span><input type="number" value=${dn.min} onChange=${e => setDn(Object.assign({}, dn, { min: +e.target.value || 30 }))} /></label></div><div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setDn(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${planDown}>${p.st} için planlı duruş ekle</button></div></div>` : null}
    </div>`; })}
    ${hist.length ? html`<details className="phist glass" style=${{ padding: 12 }}><summary>Yapılan periyodik bakımlar · ${hist.length}</summary>${hist.slice(0, 100).map(h => html`<div key=${h.id} className="phrow"><b>${dmy(h.at)}</b><span>${h.mc}</span><span>${h.title}</span><span>${h.by}</span></div>`)}</details>` : null}
  </div>`;
}
export function RelView({ list }) {
  const [days, setDays] = useState(90), [ev, setEv] = useState(null), now = useNow(300000);
  useEffect(() => { AKStore.Log.query('events', { from: now - days * 864e5 - 864e5, limit: 20000 }).then(setEv).catch(() => setEv([])); }, [days]);
  const from = now - days * 864e5;
  const rows = PLANT.mcs.filter(act_).map(m => {
    const f = list.filter(x => x.type === 'ariza' && (x.mc === m.id || (!x.mc && x.st === m.st && machineOf(m.st).mcs.length === 1)) && x.openedAt >= from);
    const closed = f.filter(x => x.repairMs > 0), mttr = closed.length ? closed.reduce((a, x) => a + x.repairMs, 0) / closed.length : null;
    const c = ev && m.st ? oeeCalc({ ev: ev.filter(e => e.machine === m.st), cn: [], from, to: now, st: m.st, windows: shiftWindows(from, now) }) : null;
    const run = c ? c.run : null, mtbf = run != null && f.length ? run / f.length : null;
    const byCause: Record<string, any> = {}; closed.forEach(x => { byCause[x.cause || '—'] = (byCause[x.cause || '—'] || 0) + 1; });
    return { m, n: f.length, open: f.filter(x => x.status !== 'done').length, mttr, mtbf, run, cause: Object.entries<any>(byCause).sort((a, b) => b[1] - a[1])[0], down: closed.reduce((a, x) => a + x.repairMs, 0) };
  }).sort((a, b) => b.n - a.n);
  const csv = () => csvDownload('makine-guvenilirligi-' + days + 'gun', [['Makine', 'Ad', 'İstasyon', 'Arıza', 'Açık', 'Çalışma (sa)', 'MTBF (sa)', 'MTTR (dk)', 'Toplam onarım (dk)', 'En sık sebep']].concat(rows.map(r => [r.m.id, r.m.name, r.m.st, r.n, r.open, r.run != null ? r.run / 3600e3 : '', r.mtbf != null ? r.mtbf / 3600e3 : '', r.mttr != null ? r.mttr / 60000 : '', r.down / 60000, r.cause ? r.cause[0] : ''])));
  return html`<div className="mw">
    <div className="plantop"><span className="over">MTBF = çalışma süresi ÷ arıza sayısı · MTTR = ortalama onarım süresi (açılıştan kapanışa)</span><span className="sp"></span><${Segs} v=${days} onChange=${setDays} opts=${[[30, '30 gün'], [90, '90 gün'], [365, '1 yıl']]} /><button className="btn" onClick=${csv}><${I} n="download" s=${16} />CSV</button></div>
    <div className="glass permscroll"><table className="perm rtbl"><thead><tr><th>Makine</th><th>İstasyon</th><th className="num">Arıza</th><th className="num">Çalışma</th><th className="num">MTBF</th><th className="num">MTTR</th><th className="num">Onarım</th><th>En sık sebep</th></tr></thead>
      <tbody>${rows.map(r => html`<tr key=${r.m.id}><td><b>${r.m.id}</b> <small className="muted">${r.m.name}</small></td><td>${r.m.st || '—'}</td><td className="num">${r.n}${r.open ? html` <small style=${{ color: 'var(--stop)' }}>(${r.open} açık)</small>` : null}</td><td className="num">${r.run != null ? Math.round(r.run / 3600e3) + ' sa' : '…'}</td><td className="num">${r.mtbf != null ? (r.mtbf / 3600e3).toFixed(1) + ' sa' : '—'}</td><td className="num">${r.mttr != null ? mins(r.mttr) + ' dk' : '—'}</td><td className="num">${minsL(r.down)}</td><td>${r.cause ? r.cause[0] + ' (' + r.cause[1] + ')' : '—'}</td></tr>`)}</tbody></table></div>
  </div>`;
}

/* ══ Raporlar (#raporlar): OEE eğilimi, duruş ve hurda Pareto, istasyonlar, çağrılar, bakım ══ */
export const RANGES = [['today', 'Bugün'], ['yday', 'Dün'], ['week', 'Bu hafta'], ['d7', 'Son 7 gün'], ['d30', 'Son 30 gün']];
export function rangeOf(k, now) { const d0 = new Date(now).setHours(0, 0, 0, 0); if (k === 'today') return [d0, now]; if (k === 'yday') return [d0 - 864e5, d0]; if (k === 'week') { const wd = (new Date(now).getDay() + 6) % 7; return [d0 - wd * 864e5, now]; } if (k === 'd30') return [d0 - 29 * 864e5, now]; return [d0 - 6 * 864e5, now]; }
export function ReportsApp() {
  const [say, toastEl] = useToast();
  const [rk, setRk] = useState(LS.get('repRange') || 'd7'), [wc, setWc] = useState(''), [st, setSt] = useState(''), [shf, setShf] = useState(''), [D, setD] = useState(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); const now = Date.now(), [from, to] = rangeOf(rk, now), L = AKStore.Log, DB0 = AKStore.DB;
    try { const [ev, cn, calls, pk, mt] = await Promise.all([L.query('events', { from: from - 3 * 864e5, to, limit: 20000 }), L.query('counts', { from, to, limit: 20000 }), L.query('calls', { from, to, limit: 20000 }), DB0.all('pkgs'), DB0.all('maint')]); setD({ ev, cn, calls, pk, mt, from, to, now }); } catch (e) { say('Kayıtlar okunamadı: ' + e.message, 'alert', 'var(--stop)'); }
    setBusy(false);
  }, [rk]);
  useEffect(() => { load(); }, [load]);
  const R = useMemo(() => D ? reportCalc(D, { wc, st, shf }) : null, [D, wc, st, shf]);
  const sts = stationList(true).filter(s => !wc || s.wc === wc);
  const extra = html`<${Segs} v=${rk} onChange=${k => { setRk(k); LS.set('repRange', k); }} opts=${RANGES} />`;
  return html`<${PageShell} icon="chart" title="Raporlar" color="var(--done)" extra=${extra} mainClass="repmain">
    <div className="plantop"><${WcFilter} v=${wc} onChange=${v => { setWc(v); setSt(''); }} /><select className="rsel" value=${st} onChange=${e => setSt(e.target.value)}><option value="">Bütün istasyonlar</option>${sts.map(s => html`<option key=${s.id} value=${s.id}>${s.id} · ${s.name}</option>`)}</select><select className="rsel" value=${shf} onChange=${e => setShf(e.target.value)}><option value="">Bütün vardiyalar</option>${SHIFTS.map(s => html`<option key=${s.name} value=${s.name}>Vardiya ${s.name}</option>`)}</select><span className="sp"></span>${D ? html`<small className="muted">${dmyhm(D.from)} – ${dmyhm(Math.min(D.to, D.now))}</small>` : null}<button className="btn" onClick=${load} disabled=${busy}><${I} n="rotate" s=${16} />Yenile</button><button className="btn" onClick=${() => printPage('Üretim Hazırlık rapor')}><${I} n="download" s=${16} />Yazdır / PDF</button></div>
    ${!SHIFTS.length ? html`<${VardiyaTanimsiz} />` : null}
    ${!R ? html`<p className="muted">Hesaplanıyor…</p>` : html`<${ReportBody} R=${R} D=${D} />`}
    ${toastEl}
  </${PageShell}>`;
}
export function printPage(name) { if (window.ArkonAndroid && window.ArkonAndroid.print) window.ArkonAndroid.print(name); else window.print(); }
export function reportCalc(D, f) {
  const sts = stationList(true).filter(s => (!f.wc || s.wc === f.wc) && (!f.st || s.id === f.st));
  const to = Math.min(D.to, D.now), wins = shiftWindows(D.from, to).filter(w => !f.shf || w.name === f.shf);
  const evBy: Record<string, any> = {}, cnBy: Record<string, any> = {}; D.ev.forEach(e => { (evBy[e.machine] = evBy[e.machine] || []).push(e); }); D.cn.forEach(c => { (cnBy[c.machine] = cnBy[c.machine] || []).push(c); });
  const inW = t => !f.shf || wins.some(w => t >= w.s && t < w.e);
  const sum = cs => { const a = cs.reduce((o, c) => { o.run += c.run; o.planned += c.planned; o.ideal += c.ideal; o.good += c.good; o.scrap += c.scrap; o.stopMs += c.stopMs; o.stopPMs += c.stopPMs; o.downMs += c.downMs; o.setupMs += c.setupMs; o.stops += c.stops; return o; }, { run: 0, planned: 0, ideal: 0, good: 0, scrap: 0, stopMs: 0, stopPMs: 0, downMs: 0, setupMs: 0, stops: 0 }); a.A = a.planned > 1 ? Math.min(1, a.run / a.planned) : null; a.P = a.run && a.ideal ? Math.min(1, a.ideal / a.run) : null; a.Q = a.good + a.scrap ? a.good / (a.good + a.scrap) : null; a.oee = a.A != null && a.P != null && a.Q != null ? a.A * a.P * a.Q : null; return a; };
  const per = sts.map(s => { const cn = (cnBy[s.id] || []).filter(c => inW(c.at)); const c = oeeCalc({ ev: evBy[s.id] || [], cn, from: D.from, to, st: s.id, windows: wins }); return { s, c }; });
  const tot = sum(per.map(x => x.c));
  const days = gunAraliklari(D.from, to, wins).map(r => { const cs = sts.map(s => oeeCalc({ ev: evBy[s.id] || [], cn: (cnBy[s.id] || []).filter(c => c.at >= r.from && c.at < r.to && inW(c.at)), from: r.from, to: r.to, st: s.id, windows: r.pencereler })); return Object.assign({ d: r.d }, sum(cs)); });
  const byR = nedenToplamlariniBirlestir(per.map(({ c }) => c.byR));
  const pareto = paretoSatirlari(byR, k => (reasonOf(k) || { l: null }).l, isPlannedReason);
  const scrapBy: Record<string, any> = {}, scrapPart: Record<string, any> = {}; const pkById = Object.fromEntries(D.pk.map(p => [p.id, p]));
  per.forEach(({ s }) => (cnBy[s.id] || []).filter(c => c.kind === 'scrap' && inW(c.at) && c.at >= D.from).forEach(c => { const k = c.reason || '—'; scrapBy[k] = (scrapBy[k] || 0) + c.delta; const pn = (pkById[c.pkgId] || {}).part || c.orderNo || '—'; scrapPart[pn] = (scrapPart[pn] || 0) + c.delta; }));
  const scrap = Object.entries<any>(scrapBy).map(([k, n]) => ({ k, l: k === '—' ? 'Nedeni girilmemiş' : (scrapOf(k) || { l: k }).l, n })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const scrapP = Object.entries<any>(scrapPart).map(([l, n]) => ({ l, n })).filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 10);
  const stSet = new Set(sts.map(s => s.id)), calls = callsFrom(D.calls).filter(c => stSet.has(c.machine));
  const callBy: Record<string, any> = {}; calls.forEach(c => { const t = callBy[c.team] = callBy[c.team] || { n: 0, ack: [], fix: [], esc: 0 }; t.n++; if (c.ack) t.ack.push(c.ack - c.open); if (c.done) t.fix.push(c.done - c.open); if (c.esc) t.esc++; });
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const faults = D.mt.filter(m => m.type === 'ariza' && m.openedAt >= D.from && m.openedAt < to && stSet.has(m.st)), closed = faults.filter(m => m.repairMs > 0);
  return { per, tot, days, pareto, scrap, scrapP, calls: Object.entries<any>(callBy).map(([k, v]) => ({ k, l: (CALLS.find(c => c.k === k) || { l: k }).l, n: v.n, ack: avg(v.ack), fix: avg(v.fix), esc: v.esc })), faults: { n: faults.length, open: faults.filter(m => m.status !== 'done').length, mttr: avg(closed.map(m => m.repairMs)), mtbf: faults.length ? tot.run / faults.length : null }, from: D.from, to };
}
export function HBars({ rows, val, fmtV, color, legend }) {
  const mx = Math.max(1, ...rows.map(val));
  return html`<div className="hbars">${rows.map((r, i) => html`<div key=${i} className="hb" title=${r.l + ' · ' + fmtV(r)}><span className="hl">${r.l}</span><span className="ht"><i style=${{ width: (val(r) / mx * 100) + '%', background: typeof color === 'function' ? color(r) : color }}></i></span><span className="hv">${fmtV(r)}</span></div>`)}${!rows.length ? html`<small className="muted">Kayıt yok</small>` : null}${legend || null}</div>`;
}
export function ReportBody({ R, D }) {
  const t = R.tot, per = R.per.slice().sort((a, b) => (b.c.planned > 1 ? 1 : 0) - (a.c.planned > 1 ? 1 : 0) || (a.c.oee ?? 2) - (b.c.oee ?? 2));
  const name = 'rapor-' + dmy(R.from).replace('.', '') + '-' + dmy(R.to).replace('.', '');
  const kpi = (l, v, sub, c?) => html`<div className="glass bk"><span className="over">${l}</span><b style=${c ? { color: c } : null}>${v}</b><small>${sub}</small></div>`;
  const totPar = R.pareto.reduce((a, x) => a + x.ms, 0); let cum = 0;
  const mxD = 1;
  return html`<div className="repw">
    <div className="bsum">
      ${kpi('OEE', pctS(t.oee), 'Kullanılabilirlik ' + pctS(t.A))}${kpi('Performans', pctS(t.P), 'Kalite ' + pctS(t.Q))}${kpi('İyi parça', fmt(t.good), fmt(t.scrap) + ' hurda · %' + (t.good + t.scrap ? (t.scrap / (t.good + t.scrap) * 100).toFixed(1) : '0'))}
      ${kpi('Plansız duruş', minsL(t.stopMs), t.stops + ' olay', 'var(--stop)')}${kpi('Planlı duruş', minsL(Math.max(t.stopPMs, t.downMs)), 'OEE dışı', 'var(--done)')}${kpi('Arıza', R.faults.n, R.faults.mttr != null ? 'MTTR ' + mins(R.faults.mttr) + ' dk' : 'MTTR —')}
    </div>
    <div className="repgrid">
      <section className="glass rcard wide2"><div className="rch"><span className="over">OEE · günlük</span><button className="lnk" onClick=${() => csvDownload(name + '-oee', [['Gün', 'OEE %', 'Kullanılabilirlik %', 'Performans %', 'Kalite %', 'İyi', 'Hurda', 'Plansız duruş dk', 'Planlı duruş dk']].concat(R.days.map(d => [dmy(d.d), d.oee != null ? d.oee * 100 : '', d.A != null ? d.A * 100 : '', d.P != null ? d.P * 100 : '', d.Q != null ? d.Q * 100 : '', d.good, d.scrap, mins(d.stopMs), mins(Math.max(d.stopPMs, d.downMs))])))}>CSV</button></div>
        <div className="vbars">${R.days.map(d => html`<div key=${d.d} className="vb" title=${dmy(d.d) + ' · OEE ' + pctS(d.oee) + ' · K ' + pctS(d.A) + ' · P ' + pctS(d.P) + ' · Q ' + pctS(d.Q) + ' · ' + fmt(d.good) + ' iyi'}><span className="vv">${d.oee != null ? Math.round(d.oee * 100) : '—'}</span><span className="vt"><i style=${{ height: ((d.oee || 0) * 100) + '%' }}></i><em style=${{ bottom: '85%' }} title="Dünya sınıfı OEE ≈ %85"></em></span><span className="vl">${R.days.length > 10 ? new Date(d.d).getDate() : DAYS[new Date(d.d).getDay()] + ' ' + new Date(d.d).getDate()}</span></div>`)}</div>
        <small className="muted">Çubuk: günlük OEE (%) · çizgi: %85 hedef · üzerine gelince kullanılabilirlik / performans / kalite</small></section>
      <section className="glass rcard"><div className="rch"><span className="over">Duruş nedenleri · Pareto</span><button className="lnk" onClick=${() => csvDownload(name + '-durus', [['Neden', 'Tür', 'Dakika', 'Olay', 'Pay %']].concat(R.pareto.map(x => [x.l, x.p ? 'Planlı' : 'Plansız', mins(x.ms), x.n, totPar ? x.ms / totPar * 100 : 0])))}>CSV</button></div>
        <${HBars} rows=${R.pareto.slice(0, 10)} val=${x => x.ms} fmtV=${x => minsL(x.ms) + ' · ' + x.n + '×'} color=${x => x.p ? 'var(--done)' : 'var(--hold)'} legend=${html`<div className="hleg"><span><i style=${{ background: 'var(--hold)' }}></i>Plansız</span><span><i style=${{ background: 'var(--done)' }}></i>Planlı</span></div>`} />
        ${R.pareto.length ? html`<small className="muted">İlk ${R.pareto.findIndex(x => (cum += x.ms) >= totPar * 0.8) + 1} neden toplam duruşun %80'i</small>` : null}</section>
      <section className="glass rcard"><div className="rch"><span className="over">Hurda nedenleri</span><button className="lnk" onClick=${() => csvDownload(name + '-hurda', [['Neden', 'Adet']].concat(R.scrap.map(x => [x.l, x.n])).concat([[], ['Parça', 'Adet']]).concat(R.scrapP.map(x => [x.l, x.n])))}>CSV</button></div>
        <${HBars} rows=${R.scrap} val=${x => x.n} fmtV=${x => fmt(x.n) + ' ad.'} color="var(--stop)" />
        ${R.scrapP.length ? html`<span className="over" style=${{ marginTop: 10, display: 'block' }}>Parçaya göre</span><${HBars} rows=${R.scrapP.slice(0, 6)} val=${x => x.n} fmtV=${x => fmt(x.n) + ' ad.'} color="var(--stop)" />` : null}</section>
      <section className="glass rcard wide2"><div className="rch"><span className="over">İstasyonlar</span><button className="lnk" onClick=${() => csvDownload(name + '-istasyon', [['İstasyon', 'İş merkezi', 'OEE %', 'Kullanılabilirlik %', 'Performans %', 'Kalite %', 'Planlı süre dk', 'Çalışma dk', 'İyi', 'Hurda', 'Plansız duruş dk', 'Planlı duruş dk', 'En uzun neden']].concat(per.map(({ s, c }) => [s.id, s.wcName, c.oee != null ? c.oee * 100 : '', c.A * 100, c.P != null ? c.P * 100 : '', c.Q != null ? c.Q * 100 : '', mins(c.planned), mins(c.run), c.good, c.scrap, mins(c.stopMs), mins(Math.max(c.stopPMs, c.downMs)), c.topReason ? (reasonOf(c.topReason) || { l: c.topReason }).l : ''])))}>CSV</button></div>
        <div className="permscroll"><table className="perm rtbl"><thead><tr><th>İstasyon</th><th className="num">OEE</th><th className="num">K</th><th className="num">P</th><th className="num">Q</th><th className="num">İyi</th><th className="num">Hurda</th><th className="num">Plansız duruş</th><th className="num">Planlı</th><th>En uzun neden</th></tr></thead>
          <tbody>${per.map(({ s, c }) => html`<tr key=${s.id}><td><b>${s.id}</b> <small className="muted">${s.wcName}</small></td><td className="num"><b>${pctS(c.oee)}</b></td><td className="num">${pctS(c.A)}</td><td className="num">${pctS(c.P)}</td><td className="num">${pctS(c.Q)}</td><td className="num">${fmt(c.good)}</td><td className="num">${c.scrap}</td><td className="num">${minsL(c.stopMs)}</td><td className="num">${minsL(Math.max(c.stopPMs, c.downMs))}</td><td>${c.topReason ? nedenAdi(c.topReason, k => (reasonOf(k) || { l: null }).l) : '—'}</td></tr>`)}</tbody></table></div></section>
      <section className="glass rcard"><div className="rch"><span className="over">Çağrılar · yanıt süreleri</span><button className="lnk" onClick=${() => csvDownload(name + '-cagri', [['Ekip', 'Çağrı', 'Ort. üstlenme dk', 'Ort. çözüm dk', 'Yükseltilen']].concat(R.calls.map(c => [c.l, c.n, c.ack != null ? c.ack / 60000 : '', c.fix != null ? c.fix / 60000 : '', c.esc])))}>CSV</button></div>
        <table className="perm rtbl"><thead><tr><th>Ekip</th><th className="num">Çağrı</th><th className="num">Üstlenme</th><th className="num">Çözüm</th><th className="num">Yükseltilen</th></tr></thead><tbody>${R.calls.map(c => html`<tr key=${c.k}><td>${c.l}</td><td className="num">${c.n}</td><td className="num">${c.ack != null ? (c.ack / 60000).toFixed(1) + ' dk' : '—'}</td><td className="num">${c.fix != null ? Math.round(c.fix / 60000) + ' dk' : '—'}</td><td className="num" style=${{ color: c.esc ? 'var(--stop)' : null }}>${c.esc}</td></tr>`)}${!R.calls.length ? html`<tr><td colSpan="5" className="muted">Çağrı yok</td></tr>` : null}</tbody></table></section>
      <section className="glass rcard"><div className="rch"><span className="over">Bakım</span></div>
        <div className="minikpi"><div><b>${R.faults.n}</b><small>arıza</small></div><div><b>${R.faults.open}</b><small>açık</small></div><div><b>${R.faults.mttr != null ? mins(R.faults.mttr) + ' dk' : '—'}</b><small>MTTR</small></div><div><b>${R.faults.mtbf != null ? (R.faults.mtbf / 3600e3).toFixed(1) + ' sa' : '—'}</b><small>MTBF</small></div></div>
        <small className="muted">Makine bazında ayrıntı: Bakım › Makine güvenilirliği</small></section>
    </div>
  </div>`;
}

/* ══ Kalite › Onaylar (paket yayın onayı) ══ */
export function ApprovalView({ pkgs, say }) {
  const [note, setNote] = useState<Record<string, any>>({}), [pv, setPv] = useState(null);
  const list = Object.values<any>(pkgs || {}).filter(apPending).sort((a, b) => a.apReq.at - b.apReq.at);
  const recent = Object.values<any>(pkgs || {}).filter(p => p.approval && Date.now() - p.approval.at < 7 * 864e5).sort((a, b) => b.approval.at - a.approval.at).slice(0, 12);
  const decide = async (p, ok) => {
    if (!allowed('pkg.approve', say)) return;
    if (!ok && !(note[p.id] || '').trim()) { say('Geri gönderme nedeni yaz', 'alert', 'var(--stop)'); return; }
    const cur = (await AKStore.DB.get('pkgs', p.id)) || p;
    const n = Object.assign({}, cur, { approval: { ok, by: ME(), at: Math.max(Date.now(), (cur.updatedAt || 0) + 1), note: note[p.id] || '', version: (cur.version || 0) + 1 } });
    await AKStore.DB.put('pkgs', n); Bus.send({ type: 'pkg-approved', id: p.id, ok, note: note[p.id] || '' });
    audit('paket', ok ? 'kalitece onaylandı' : 'geri gönderildi', p.no, 'Rev ' + p.rev + (note[p.id] ? ' · ' + note[p.id] : '')); say(ok ? p.no + ' onaylandı' : p.no + ' geri gönderildi', ok ? 'check' : 'x', ok ? 'var(--run)' : 'var(--stop)');
  };
  return html`<div className="mw">
    <div className="plantop"><span className="over">Hazırlıkta “Kaliteye onaya gönder” denilen paketler. Onaylanan paket hazırlıkta yayınlanabilir; onaydan sonra değişirse yeniden onay ister.</span></div>
    ${list.length ? list.map(p => html`<div key=${p.id} className="glass frow">
      <div className="frh"><span className="pic"><${I} n=${(OPTYPES[opOf(p)] || OPTYPES.cnc).i} s=${18} /></span><div><b>${p.no} · ${p.part}</b><small>Rev ${p.rev} · v${(p.version || 0) + 1} · ${p.machine} · ${p.op}</small></div><span className="chip" style=${{ '--c': 'var(--hold)' }}><i></i>${minsL(Date.now() - p.apReq.at)} bekliyor</span></div>
      <small className="muted">Gönderen ${p.apReq.by} · ${dmyhm(p.apReq.at)} · ${(p.plan || []).length} kontrol noktası · ${(p.files || []).length} dosya · ${(p.steps || []).length} adım${(p.samp || []).length ? ' · ' + p.samp.length + ' numune kuralı' : ''}${p.approval && p.approval.ok === false ? ' · önceki geri gönderme: ' + p.approval.note : ''}</small>
      <div className="aprow"><input value=${note[p.id] || ''} onChange=${e => setNote(Object.assign({}, note, { [p.id]: e.target.value }))} placeholder="Not (geri gönderirken zorunlu)" /><button className="btn" onClick=${() => setPv(p.id)}><${I} n="eye" s=${16} />Operatör gözüyle</button><button className="btn" style=${{ color: 'var(--stop)' }} onClick=${() => decide(p, false)}><${I} n="x" s=${16} />Geri gönder</button><button className="btn pri" onClick=${() => decide(p, true)}><${I} n="check" s=${16} />Onayla</button></div>
    </div>`) : html`<div className="glass empty" style=${{ padding: 26 }}><${I} n="check" s=${32} /><b>Onay bekleyen paket yok</b><small className="muted">Yayın onayı Ayarlar › Üretim › Çalışma kurallarından açılır${POLICY.approval ? ' (şu an açık)' : ' (şu an kapalı)'}.</small></div>`}
    ${recent.length ? html`<details className="phist glass" style=${{ padding: 12 }}><summary>Son 7 gün kararları · ${recent.length}</summary>${recent.map(p => html`<div key=${p.id} className="phrow"><b style=${{ color: p.approval.ok ? 'var(--run)' : 'var(--stop)' }}>${p.approval.ok ? 'Onay' : 'Geri'}</b><span>${p.no}</span><span>${dmyhm(p.approval.at)}</span><span>${p.approval.by}${p.approval.note ? ' · ' + p.approval.note : ''}</span></div>`)}</details>` : null}
    ${pv ? html`<${PreviewOv} id=${pv} onClose=${() => setPv(null)} />` : null}
  </div>`;
}

/* ══ Kalite › Ölçü aletleri ve kalibrasyon ══ */
export let GAUGES: Gauge[] = [];
export const gaugeDue = g => (g.last || 0) + (g.interval || 365) * 864e5;
export const gaugeTone = (g, now) => g.status === 'out' ? ['var(--idle)', 'Kullanım dışı'] : gaugeDue(g) < now ? ['var(--stop)', 'Kalibrasyonu geçmiş'] : gaugeDue(g) < now + 30 * 864e5 ? ['var(--hold)', Math.ceil((gaugeDue(g) - now) / 864e5) + ' gün kaldı'] : ['var(--run)', 'Geçerli'];
// Sunucuya bağlı Arkon'da ölçü aletleri TMI'nin Kalibrasyon sayfasındadır; sunucu gauges yazımını reddeder (A7, #518). Liste salt okunur.
const aletlerTmide = () => AKStore.status().mode === 'server';
export function GaugeView({ say }) {
  const [list, reload] = useDocs('gauges'), [ed, setEd] = useState(null), [cal, setCal] = useState(null), [q, setQ] = useState(''), now = useNow(600000), edit = can('gauge.edit') && !aletlerTmide();
  useEffect(() => { GAUGES = list; }, [list]);
  const F = (k, v) => setEd(Object.assign({}, ed, { [k]: v }));
  const save = async () => { if (!ed.no || !ed.type) return say('Alet no ve tür gerekli', 'alert', 'var(--stop)'); const d = Object.assign({}, ed); delete d.isNew; await putDoc('gauges', d); audit('kalibrasyon', ed.isNew ? 'alet eklendi' : 'alet değişti', d.no, d.type); setEd(null); reload(); say('Ölçü aleti kaydedildi', 'check', 'var(--run)'); };
  const saveCal = async () => { const g = cal.g, at = new Date(cal.date + 'T12:00').getTime() || Date.now(); const n = Object.assign({}, g, { last: cal.res === 'ok' ? at : g.last, status: cal.res === 'ok' ? 'ok' : 'out', cals: (g.cals || []).concat([{ at, by: ME(), res: cal.res, cert: cal.cert, note: cal.note }]).slice(-40) }); await putDoc('gauges', n); audit('kalibrasyon', cal.res === 'ok' ? 'kalibre edildi' : 'uygunsuz · kullanım dışı', g.no, cal.cert || ''); setCal(null); reload(); say(g.no + ' kalibrasyon kaydedildi', 'check', 'var(--run)'); };
  const L = list.filter(g => !q || (g.no + ' ' + g.type + ' ' + (g.name || '') + ' ' + (g.loc || '')).toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR'))).sort((a, b) => gaugeDue(a) - gaugeDue(b));
  const csv = () => csvDownload('olcu-aletleri', [['Alet no', 'Tür', 'Ad / ölçme aralığı', 'Yer', 'Periyot (gün)', 'Son kalibrasyon', 'Sonraki', 'Durum']].concat(L.map(g => [g.no, g.type, (g.name || '') + ' ' + (g.range || ''), g.loc || '', g.interval, g.last ? dmy(g.last) : '', dmy(gaugeDue(g)), gaugeTone(g, now)[1]])));
  return html`<div className="mw">
    <div className="plantop"><input className="rsel" value=${q} onChange=${e => setQ(e.target.value)} placeholder="Ara: alet no, tür, yer" /><span className="muted">${list.filter(g => g.status !== 'out' && gaugeDue(g) < now).length} geçmiş · ${list.filter(g => g.status !== 'out' && gaugeDue(g) >= now && gaugeDue(g) < now + 30 * 864e5).length} yaklaşan</span><span className="sp"></span><button className="btn" onClick=${csv}><${I} n="download" s=${16} />CSV</button>${edit ? html`<button className="btn pri" onClick=${() => setEd({ id: 'g-' + uidg(), isNew: true, no: '', type: '', name: '', range: '', loc: '', interval: 365, last: Date.now(), status: 'ok' })}><${I} n="plus" s=${18} />Alet ekle</button>` : null}</div>
    ${aletlerTmide() ? html`<small className="muted"><${I} n="lock" s=${14} /> Ölçü aletleri ve kalibrasyon kayıtları TMI'de Kalibrasyon sayfasından girilir.</small>` : null}
    ${ed ? html`<div className="glass uedit"><div className="plgrid">
      <label className="fld"><span className="over">Alet no</span><input value=${ed.no} onChange=${e => F('no', e.target.value.toUpperCase())} placeholder="MK-012" /></label>
      <label className="fld"><span className="over">Tür (kontrol planındaki ölçü aleti adıyla)</span><input value=${ed.type} onChange=${e => F('type', e.target.value)} list="g-types" placeholder="Mikrometre" /><datalist id="g-types">${['Mikrometre', 'Kumpas', 'Komparatör', 'Tampon mastar', 'Halka mastar', 'Diş mastarı', 'Radyus mastarı', 'Yükseklik mihengiri', 'İç çap mikrometresi', 'CMM', 'Tork anahtarı', 'Kaplama kalınlık ölçer'].map(x => html`<option key=${x} value=${x} />`)}</datalist></label>
      <label className="fld"><span className="over">Ölçme aralığı / çözünürlük</span><input value=${ed.range || ''} onChange=${e => F('range', e.target.value)} placeholder="25–50 mm · 0,001" /></label>
      <label className="fld"><span className="over">Yer / zimmet</span><input value=${ed.loc || ''} onChange=${e => F('loc', e.target.value)} placeholder="TZG-04 dolabı" /></label>
      <label className="fld"><span className="over">Kalibrasyon periyodu (gün)</span><input type="number" min="1" value=${ed.interval} onChange=${e => F('interval', +e.target.value || 365)} /></label>
      <label className="fld"><span className="over">Son kalibrasyon</span><input type="date" value=${toLocalInput(ed.last || Date.now()).slice(0, 10)} onChange=${e => F('last', new Date(e.target.value + 'T12:00').getTime())} /></label>
    </div><div style=${{ display: 'flex', gap: 8 }}>${!ed.isNew ? html`<button className="btn" style=${{ color: 'var(--stop)' }} onClick=${async () => { if (confirm(ed.no + ' silinsin mi?')) { await delDoc('gauges', ed.id); audit('kalibrasyon', 'alet silindi', ed.no); setEd(null); reload(); } }}>Sil</button>` : null}<button className="btn" onClick=${() => setEd(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div></div>` : null}
    <div className="glass permscroll"><table className="perm rtbl"><thead><tr><th>Alet</th><th>Tür</th><th>Yer</th><th className="num">Periyot</th><th className="num">Son</th><th className="num">Sonraki</th><th>Durum</th><th></th></tr></thead><tbody>
      ${L.map(g => { const [c, l] = gaugeTone(g, now); return html`<${Fragment} key=${g.id}><tr><td><b>${g.no}</b> <small className="muted">${g.range || ''}</small></td><td>${g.type}</td><td>${g.loc || '—'}</td><td className="num">${g.interval} gün</td><td className="num">${g.last ? dmy(g.last) : '—'}</td><td className="num">${dmy(gaugeDue(g))}</td><td><span className="chip" style=${{ '--c': c }}><i></i>${l}</span></td><td style=${{ whiteSpace: 'nowrap' }}>${edit ? html`<button className="lnk" onClick=${() => setCal({ g, date: toLocalInput(Date.now()).slice(0, 10), res: 'ok', cert: '', note: '' })}>Kalibrasyon</button><button className="lnk" onClick=${() => setEd(Object.assign({}, g))}>Düzenle</button>` : null}</td></tr>
        ${cal && cal.g.id === g.id ? html`<tr><td colSpan="8"><div className="uedit"><div className="plgrid"><label className="fld"><span className="over">Tarih</span><input type="date" value=${cal.date} onChange=${e => setCal(Object.assign({}, cal, { date: e.target.value }))} /></label><label className="fld"><span className="over">Sonuç</span><select value=${cal.res} onChange=${e => setCal(Object.assign({}, cal, { res: e.target.value }))}><option value="ok">Uygun</option><option value="nok">Uygunsuz · kullanım dışı</option></select></label><label className="fld"><span className="over">Sertifika no</span><input value=${cal.cert} onChange=${e => setCal(Object.assign({}, cal, { cert: e.target.value }))} /></label><label className="fld"><span className="over">Not</span><input value=${cal.note} onChange=${e => setCal(Object.assign({}, cal, { note: e.target.value }))} /></label></div><div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setCal(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${saveCal}>Kaydet</button></div>${(g.cals || []).length ? html`<small className="muted">Geçmiş: ${g.cals.slice().reverse().slice(0, 6).map(x => dmy(x.at) + ' ' + (x.res === 'ok' ? 'uygun' : 'uygunsuz') + (x.cert ? ' (' + x.cert + ')' : '')).join(' · ')}</small>` : null}</div></td></tr>` : null}</${Fragment}>`; })}
      ${!L.length ? html`<tr><td colSpan="8" className="muted">Ölçü aleti yok. Alet eklenince kalibrasyonu geçmiş türle ölçüm girilirken uyarı çıkar.</td></tr>` : null}
    </tbody></table></div>
  </div>`;
}

/* Kaliteye numune isteği (kart #1083): görev kartındaki hatırlatma ve ilk parça uyarısı açar. */
export function NumuneOv({ st, numune, onClose }) {
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" style=${{ width: 'min(720px, 100%)' }}>
    <div className="ov-h"><div><span className="over">${st}</span><h2>Kaliteye numune</h2></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <p className="muted" style=${{ margin: '0 0 8px' }}>${!numune.hazir ? 'Bu işin kontrol planı yok; numune gönderilemez.' : numune.bekliyor ? 'Önceki numune kalitede · sonuç bekleniyor.' : 'Numune isteği Kalite ekranına düşer. Onay ya da red kaliteciden gelir; gönderince iş onaylanmış olmaz.'}</p>
    <div className="ov-f"><button className="btn lg" onClick=${onClose}>Vazgeç</button><button className="btn lg pri" disabled=${!numune.hazir || numune.bekliyor} onClick=${() => { onClose(); numune.gonder(); }}><${I} n="target" s=${20} />Numune gönder</button></div>
  </div></div>`;
}


/* başka modüllerden değiştirilen paylaşılan durum */
export function setGAUGES(v: any) { GAUGES = v; return v; }
