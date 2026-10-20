import { AKStore } from '../data/store';
import { CALLS, Fragment, I, REASONS, REASONS0, SCRAPS, SCRAPS0, html, pad, reasonColor, setREASONS, setSCRAPS, useCallback, useEffect, useState } from './temel';
import { LS } from './yukleyici';
import { MC_CONN, PLANT, POLICY, POLICY0, act_, audit, setPOLICY } from './ortak-ayarlar';
import { Sw } from './kurallar';
import { Bus } from './hazirlik';
import { useSrv } from './giris-ayarlar-spc';
import { Segs, csvDownload, dmyhm } from './pano-planlama';

/* ══ Ayarlar › Üretim: duruş nedenleri, hurda nedenleri, çalışma kuralları · Sistem: değişiklik günlüğü, makine verisi ══ */
// Sunucuya bağlı Arkon'da duruş ve hurda nedenleri TMI'nin Duruş ve Hurda Nedenleri sayfasındadır; sunucu bu kayıtların yazımını reddeder
// (tekrar eden sayfalar temizliği, madde 13). Bölüm yalnız sunucusuz kipte görünür.
export const nedenlerTmide = () => AKStore.status().mode === 'server';
export const REASON_ICONS = ['truck', 'wrench', 'bolt', 'tool', 'search', 'cpu', 'user', 'gauge', 'coffee', 'list', 'flag', 'clock', 'alert', 'box'];
export function ReasonEditor({ say }) {
  const [list, setList] = useState(() => REASONS.map(r => Object.assign({}, r))), [dirty, setDirty] = useState(false);
  const up = (i, ch) => { setList(list.map((x, j) => j === i ? Object.assign({}, x, ch) : x)); setDirty(true); };
  const add = cat => { const nums = list.map(r => +String(r.code).replace(/\D/g, '') || 0); setList(list.concat([{ code: 'D-' + pad(Math.max(0, ...nums) + 1), l: '', i: cat === 'p' ? 'clock' : 'alert', cat }])); setDirty(true); };
  const save = async () => {
    if (list.some(r => !r.l.trim() || !r.code.trim())) return say('Kod ve ad boş olamaz', 'alert', 'var(--stop)');
    if (new Set(list.map(r => r.code)).size !== list.length) return say('Kodlar benzersiz olmalı', 'alert', 'var(--stop)');
    const clean = list.map(r => { const o = Object.assign({}, r); delete o.c; return o; });
    await AKStore.DB.put('kv', clean, 'reasons'); setREASONS(clean.map(x => Object.assign({}, x, { c: reasonColor(x) }))); Bus.send({ type: 'cfg' }); setDirty(false);
    audit('neden', 'duruş nedenleri değişti', '', clean.filter(r => r.active !== false).length + ' etkin · ' + clean.filter(r => r.cat === 'p').length + ' planlı'); say('Duruş nedenleri kaydedildi', 'check', 'var(--run)');
  };
  const sect = (cat, title, d) => html`<div className="rsect"><div className="rsh"><b>${title}</b><small className="muted">${d}</small></div>
    ${list.map((r, i) => (r.cat || 'u') !== cat ? null : html`<div key=${i} className=${'rrow ' + (r.active === false ? 'off' : '')}>
      <select className="ric" value=${r.i || 'alert'} onChange=${e => up(i, { i: e.target.value })} aria-label="Simge">${REASON_ICONS.map(x => html`<option key=${x} value=${x}>${x}</option>`)}</select>
      <input className="rcode mono" value=${r.code} onChange=${e => up(i, { code: e.target.value.toUpperCase() })} />
      <input className="rname" value=${r.l} onChange=${e => up(i, { l: e.target.value })} placeholder="Neden adı" />
      ${cat === 'u' ? html`<select value=${r.team || ''} onChange=${e => up(i, { team: e.target.value || undefined })} title="Bu nedenle durunca çağrılacak ekip"><option value="">Çağrı yok</option>${CALLS.map(c => html`<option key=${c.k} value=${c.k}>${c.l} çağır</option>`)}</select>${r.team ? html`<label className="rafter"><input type="number" min="0" value=${r.after || 0} onChange=${e => up(i, { after: +e.target.value || 0 })} />dk sonra</label>` : html`<span></span>`}` : html`<span></span><span></span>`}
      <select value=${r.cat || 'u'} onChange=${e => up(i, { cat: e.target.value })}><option value="u">Plansız</option><option value="p">Planlı</option></select>
      <button className=${'chp ' + (r.active === false ? '' : 'on')} onClick=${() => up(i, { active: r.active === false })}>${r.active === false ? 'Pasif' : 'Etkin'}</button>
    </div>`)}<button className="lnk" onClick=${() => add(cat)}>+ ${cat === 'p' ? 'Planlı' : 'Plansız'} neden</button></div>`;
  return html`<div className="redit">
    ${sect('u', 'Plansız duruş', 'Kullanılabilirlik kaybıdır; OEE düşer. Ekip seçilirse duruş süresi aşılınca o ekip kendiliğinden çağrılır.')}
    ${sect('p', 'Planlı duruş', 'Planlı üretim süresinden düşülür; OEE etkilenmez (mola, planlı bakım, toplantı, iş yok…).')}
    <div style=${{ display: 'flex', gap: 8 }}>${AKStore.status().mode === 'server' ? null : html`<button className="btn" onClick=${() => { setList(REASONS0.map(r => Object.assign({}, r))); setDirty(true); }}>Varsayılanlar</button>`}<span style=${{ flex: 1 }}></span><button className="btn pri" disabled=${!dirty} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div>
    <small className="muted">Kullanılmış bir nedeni silmek yerine pasif yapın; geçmiş kayıtlar kodla durur.</small>
  </div>`;
}
export function ScrapEditor({ say }) {
  const [list, setList] = useState(() => SCRAPS.map(r => Object.assign({}, r))), [dirty, setDirty] = useState(false);
  const up = (i, ch) => { setList(list.map((x, j) => j === i ? Object.assign({}, x, ch) : x)); setDirty(true); };
  const save = async () => { if (list.some(r => !r.l.trim())) return say('Ad boş olamaz', 'alert', 'var(--stop)'); await AKStore.DB.put('kv', list, 'scraps'); setSCRAPS(list); Bus.send({ type: 'cfg' }); setDirty(false); audit('neden', 'hurda nedenleri değişti', '', list.length + ' neden'); say('Hurda nedenleri kaydedildi', 'check', 'var(--run)'); };
  return html`<div className="redit"><div className="rsect">
    ${list.map((r, i) => html`<div key=${i} className=${'rrow two ' + (r.active === false ? 'off' : '')}><input className="rcode mono" value=${r.code} onChange=${e => up(i, { code: e.target.value.toUpperCase() })} /><input className="rname" value=${r.l} onChange=${e => up(i, { l: e.target.value })} placeholder="Hurda nedeni" /><button className=${'chp ' + (r.active === false ? '' : 'on')} onClick=${() => up(i, { active: r.active === false })}>${r.active === false ? 'Pasif' : 'Etkin'}</button></div>`)}
    <button className="lnk" onClick=${() => { const nums = list.map(r => +String(r.code).replace(/\D/g, '') || 0); setList(list.concat([{ code: 'H-' + pad(Math.max(0, ...nums) + 1), l: '' }])); setDirty(true); }}>+ Hurda nedeni</button></div>
    <div style=${{ display: 'flex', gap: 8 }}>${AKStore.status().mode === 'server' ? null : html`<button className="btn" onClick=${() => { setList(SCRAPS0.map(r => Object.assign({}, r))); setDirty(true); }}>Varsayılanlar</button>`}<span style=${{ flex: 1 }}></span><button className="btn pri" disabled=${!dirty} onClick=${save}><${I} n="check" s=${18} />Kaydet</button></div></div>`;
}
export function PolicyEditor({ say }) {
  const [p, setP] = useState(Object.assign({}, POLICY)), [dirty, setDirty] = useState(false);
  const S = (k, v) => { setP(Object.assign({}, p, { [k]: v })); setDirty(true); };
  const save = async () => { await AKStore.DB.put('kv', p, 'policy'); setPOLICY(Object.assign({}, POLICY0, p)); Bus.send({ type: 'cfg' }); setDirty(false); audit('kural', 'çalışma kuralları değişti', '', Object.entries<any>(p).map(([k, v]) => k + '=' + v).join(' · ')); say('Çalışma kuralları kaydedildi', 'check', 'var(--run)'); };
  const num = (k, l, d, unit) => html`<div className="numrow"><div><b>${l}</b><small>${d}</small></div><label className="rafter"><input type="number" min="0" value=${p[k]} onChange=${e => S(k, Math.max(0, +e.target.value || 0))} />${unit}</label></div>`;
  return html`<${Fragment}>
    <${Sw} on=${p.shiftLogout} onChange=${v => S('shiftLogout', v)} l="Vardiya değişince oturumu kapat" d="Ortak tablette yeni vardiyanın kişisi giriş yapana kadar ekran kilitlenir (yönetici hariç). Ekrandaki iş kaybolmaz." />
    ${num('idleLock', 'Dokunulmazsa kilitle', 'Bu süre işlem yoksa ilk dokunuşta PIN istenir; ekran (uzak mod dahil) görünmeye devam eder. 0 = kapalı.', 'dk')}
    ${num('callEsc', 'Çağrı yükseltme', 'Çağrıyı bu sürede kimse üstlenmezse vardiya amirine ve yöneticiye kırmızı uyarı gider. 0 = kapalı.', 'dk')}
    <${Sw} on=${p.autoCall} onChange=${v => S('autoCall', v)} l="Duruş nedenine göre otomatik çağrı" d="Duruş nedenleri listesinde ekip seçilen nedenlerde (ör. mekanik arıza → bakım) belirtilen süre sonra çağrı kendiliğinden gider." />
    <${Sw} on=${p.approval} onChange=${v => S('approval', v)} l="Paket yayınında kalite onayı" d="Hazırlık paketi önce kaliteye onaya gönderir; kalite onaylamadan operatöre yayınlanmaz. Onaydan sonra değişiklik olursa yeniden onay gerekir." />
    <${Sw} on=${p.fpRestart !== false} onChange=${v => S('fpRestart', v)} l="Değişiklikte ara onay sor" d="Çalışmış işte son numune reddedilir, revizyon, istasyon, makine ya da paket içeriği (kontrol planı, adımlar, dokümanlar, süreler) değişirse Hazırlık yeniden başlatmada ilk parça onayı istenip istenmeyeceğine karar verir." />
    <button className="btn pri" disabled=${!dirty} onClick=${save} style=${{ justifySelf: 'start' }}><${I} n="check" s=${18} />Kaydet</button>
  </${Fragment}>`;
}
export const AUDIT_AREAS = ['paket', 'plan', 'planlı duruş', 'bakım', 'kalibrasyon', 'tesis', 'kullanıcı', 'yetki', 'vardiya', 'neden', 'kural', 'sistem'];
export function AuditView() {
  const [rows, setRows] = useState(null), [area, setArea] = useState(''), [q, setQ] = useState(''), [days, setDays] = useState(7);
  const load = useCallback(() => AKStore.Log.query('audit', { from: Date.now() - days * 864e5, limit: 5000 }).then(r => setRows(r.slice().reverse())).catch(() => setRows([])), [days]);
  useEffect(() => { load(); return AKStore.Log.on(k => { if (k === 'audit') load(); }); }, [load]);
  const L = (rows || []).filter(r => (!area || r.area === area) && (!q || [r.action, r.target, r.detail, r.userName].join(' ').toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR'))));
  return html`<div className="auditw">
    <div className="plantop"><select className="rsel" value=${area} onChange=${e => setArea(e.target.value)}><option value="">Bütün alanlar</option>${AUDIT_AREAS.map(a => html`<option key=${a} value=${a}>${a}</option>`)}</select><input className="rsel" value=${q} onChange=${e => setQ(e.target.value)} placeholder="Ara" /><${Segs} v=${days} onChange=${setDays} opts=${[[1, 'Bugün'], [7, '7 gün'], [30, '30 gün']]} /><span className="sp"></span><button className="btn" onClick=${() => csvDownload('degisiklik-gunlugu', [['Zaman', 'Kişi', 'Alan', 'İşlem', 'Konu', 'Ayrıntı', 'Cihaz istasyonu']].concat(L.map(r => [new Date(r.at).toLocaleString('tr-TR'), r.userName, r.area, r.action, r.target, r.detail, r.machine])))}><${I} n="download" s=${16} />CSV</button></div>
    <div className="permscroll"><table className="perm rtbl"><thead><tr><th>Zaman</th><th>Kişi</th><th>Alan</th><th>İşlem</th><th>Konu</th><th>Ayrıntı</th></tr></thead><tbody>
      ${rows === null ? html`<tr><td colSpan="6" className="muted">Yükleniyor…</td></tr>` : L.slice(0, 400).map((r, i) => html`<tr key=${r.cid || i}><td className="mono" style=${{ whiteSpace: 'nowrap' }}>${dmyhm(r.at)}</td><td>${r.userName || '—'}</td><td>${r.area}</td><td>${r.action}</td><td><b>${r.target}</b></td><td className="muted">${r.detail || ''}</td></tr>`)}
      ${rows && !L.length ? html`<tr><td colSpan="6" className="muted">Kayıt yok</td></tr>` : null}
    </tbody></table></div>
    <small className="muted">Paket yayını/onayı/silme, plan ve istasyon değişikliği, planlı duruş, bakım, kalibrasyon, tesis, kullanıcı, yetki, vardiya ve kural değişiklikleri kaydedilir.</small>
  </div>`;
}
export function CollectorCard() {
  const st = useSrv(), [info, setInfo] = useState(null);
  useEffect(() => { if (st.mode === 'server' && st.online) fetch(st.base + '/api/collector', { headers: { Authorization: 'Bearer ' + ((LS.get('session') || {}).token || '') } }).then(r => r.ok ? r.json() : null).then(setInfo).catch(() => setInfo(null)); }, [st.mode, st.online]);
  const mcs = PLANT.mcs.filter(m => act_(m) && m.conn);
  return html`<div className="ulist">
    <p className="muted" style=${{ margin: 0 }}>Makinesinde veri bağlantısı tanımlı makinelerden (Tesis yapısı › makine › Veri bağlantısı) parça sayımı ve çalışıyor/durdu bilgisi sunucu tarafından okunur; operatör ekranında sayaç kendiliğinden artar, durunca neden sorulur. Yalnız sunucu modunda çalışır.</p>
    ${mcs.length ? mcs.map(m => { const x = info && info.machines && info.machines[m.id]; return html`<div key=${m.id} className="urow"><span className="av" style=${{ background: x && x.ok ? 'var(--run)' : x ? 'var(--stop)' : 'var(--idle)' }}><${I} n="cpu" s=${16} /></span><div><b>${m.id} · ${m.name}</b><small>${(MC_CONN.find(c => c[0] === m.conn) || [0, m.conn])[1]} · ${m.addr || 'adres yok'}${m.st ? ' · ' + m.st : ''}${x ? ' · ' + (x.ok ? 'bağlı · ' + (x.state || '') + (x.count != null ? ' · sayaç ' + x.count : '') : 'hata: ' + (x.err || '')) : st.mode === 'server' ? ' · bekleniyor' : ''}</small></div></div>`; }) : html`<small className="muted">Veri bağlantısı tanımlı makine yok.</small>`}
    ${info && info.note ? html`<small className="muted">${info.note}</small>` : null}
  </div>`;
}

