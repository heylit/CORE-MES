import { AKStore } from '../data/store';
import { Fragment, I, fmt, html, useEffect, useState } from './temel';
import { DB, uidg } from './hazirlik';

/* ══════════ İŞ KURALLARI: operatör uyarıları, kalite kuralları, üretim parametreleri, şablonlar ══════════ */
export const WHEN = [['start', 'İş başında'], ['every', 'Her N parçada'], ['interval', 'Her N dakikada'], ['tool', 'Takım değişiminde'], ['shift', 'Vardiya başında']];
export const LVL = { info: { l: 'Bilgi', c: 'var(--done)', i: 'bell' }, warn: { l: 'Dikkat', c: 'var(--hazard)', i: 'alert' }, crit: { l: 'Kritik', c: 'var(--stop)', i: 'alert' } };
export const WARN_PRESETS = [
  { t: 'Ayna sıkma basıncı 32 bar olmalı · kontrol et', lvl: 'warn', when: 'start', ack: true },
  { t: 'Çapakları al, keskin kenarları kır', lvl: 'info', when: 'every', n: 50, ack: false },
  { t: 'Bor yağı konsantrasyonu %6–8 · refraktometre ile ölç', lvl: 'info', when: 'shift', ack: true },
  { t: 'Kritik ölçü Ø40 H7 · her parçada tampon mastar', lvl: 'crit', when: 'start', ack: true },
  { t: 'Yeni takımın ofsetini ilk parçada doğrula', lvl: 'warn', when: 'tool', ack: true },
  { t: 'Koruyucu gözlük ve eldiven zorunlu', lvl: 'warn', when: 'shift', ack: true },
  { t: 'Talaş konveyörünü boşalt', lvl: 'info', when: 'interval', n: 120, ack: false }
];
// Numune zamanı gelince istek kendiliğinden kaliteye düşer: operatör düğmeye basmayı unutunca numune kaçıyordu.
export const RULES0 = { warns: [], q: { who: 'quality', firstPiece: true, nok: 'warn', band: 80, critTwice: false, autoSend: true }, prod: { scrapPct: 3, scrapMin: 20, maxPauseMin: 15, tools: [] } };
export function rulesOf(p) {
  const r = (p && p.rules) || {};
  return { warns: r.warns || [], q: Object.assign({}, RULES0.q, r.q), prod: Object.assign({}, RULES0.prod, r.prod, { tools: (r.prod && r.prod.tools) || [] }) };
}
/** ölçü toleransın kenarına yakın mı: band=80 → aralığın orta noktasından uzaklık, yarı aralığın %80'ini geçerse */
export function nearEdge(b, v, band) {
  if (!band || !b || b.gauge || typeof v !== 'number' || !(b.max > b.min) || b.max > b.min + 500) return 0;
  const mid = (b.min + b.max) / 2, half = (b.max - b.min) / 2, r = Math.abs(v - mid) / half;
  return r >= band / 100 && r <= 1 + 1e-9 ? Math.round(r * 100) : 0;
}
export const famOf = p => ((p.partNo || p.part || '').match(/^[A-Za-zÇĞİÖŞÜçğıöşü]+/) || [''])[0].toUpperCase();
export const rulesSummary = R => [R.warns.length + ' uyarı', R.prod.tools.length + ' takım', R.q.who === 'operator' ? 'operatör ölçer' : 'kalite ölçer', R.q.nok === 'stop' ? 'redde dur' : R.q.nok === 'call' ? 'redde kalite çağır' : 'redde uyar'].join(' · ');
export const cloneRules = R => ({ warns: R.warns.map(w => Object.assign({}, w, { id: uidg() })), q: Object.assign({}, R.q), prod: Object.assign({}, R.prod, { tools: R.prod.tools.map(t => Object.assign({}, t, { id: uidg() })) }) });
/** yeni paket: makine > parça ailesi > genel sırasıyla "otomatik uygula" işaretli şablonu bul */
export async function defaultRulesFor(p) {
  const T = (await AKStore.DB.get('kv', 'ruleTpls')) || [];
  const d = T.filter(t => t.def);
  const pick = d.find(t => t.scope === 'machine' && t.key === p.machine) || d.find(t => t.scope === 'family' && t.key && t.key === famOf(p)) || d.find(t => t.scope === 'all');
  return pick ? { rules: cloneRules(rulesOf({ rules: pick.rules })), name: pick.name } : null;
}

export function Sw({ on, onChange, l, d }) {
  return html`<label className="swrow"><span className=${'sw ' + (on ? 'on' : '')}><input type="checkbox" checked=${!!on} onChange=${e => onChange(e.target.checked)} /><i></i></span><div><b>${l}</b>${d ? html`<small>${d}</small>` : null}</div></label>`;
}
export function Seg({ v, opts, onChange }) {
  return html`<div className="segs rseg">${opts.map(([k, l]) => html`<button key=${k} type="button" className=${'seg ' + (v === k ? 'on' : '')} onClick=${() => onChange(k)}>${l}</button>`)}</div>`;
}
export function Num({ v, onChange, min = 0, max = 100000, w = 90, suf }) {
  return html`<span className="rnum"><input type="number" min=${min} max=${max} value=${v} style=${{ width: w }} onChange=${e => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))} />${suf ? html`<em>${suf}</em>` : null}</span>`;
}

export function RulesTab({ p, patch, say, res }) {
  const R = rulesOf(p);
  const setR = ch => patch({ rules: Object.assign({}, R, ch) });
  const setQ = ch => setR({ q: Object.assign({}, R.q, ch) });
  const setP = ch => setR({ prod: Object.assign({}, R.prod, ch) });
  const setW = (id, ch) => setR({ warns: R.warns.map(w => w.id === id ? Object.assign({}, w, ch) : w) });
  const addW = w => setR({ warns: R.warns.concat([Object.assign({ id: uidg(), t: '', lvl: 'warn', when: 'start', n: 50, ack: true }, w)]) });
  const setT = (id, ch) => setP({ tools: R.prod.tools.map(t => t.id === id ? Object.assign({}, t, ch) : t) });
  const [tpls, setTpls] = useState([]), [tName, setTName] = useState(''), [scope, setScope] = useState('machine'), [def, setDef] = useState(true);
  useEffect(() => { DB.get('kv', 'ruleTpls').then(t => setTpls(t || [])); }, []);
  const putT = async t => { setTpls(t); await DB.put('kv', t, 'ruleTpls'); };
  const fam = famOf(p);
  const saveTpl = async () => {
    const name = tName.trim() || (scope === 'machine' ? p.machine + ' standart' : scope === 'family' ? (fam || 'Parça') + ' ailesi' : 'Genel kurallar');
    const key = scope === 'machine' ? p.machine : scope === 'family' ? fam : '';
    let t = tpls.filter(x => !(x.name === name));
    if (def) t = t.map(x => x.scope === scope && x.key === key ? Object.assign({}, x, { def: false }) : x);
    await putT([{ id: uidg(), name, scope, key, def, rules: JSON.parse(JSON.stringify(R)), at: Date.now() }].concat(t));
    setTName(''); say('Şablon kaydedildi: ' + name + (def ? ' · yeni işlerde otomatik' : ''), 'check', 'var(--run)');
  };
  const acks = (res && res.acks) || {};
  const sl = { machine: 'Makine · ' + p.machine, family: 'Parça ailesi · ' + (fam || '—'), all: 'Tüm işler' };
  return html`<div className="rules fadein">
    <div className="glass rcard wide2">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--hazard)' }}><${I} n="bell" s=${20} /></span><div><b>Operatöre gidecek uyarılar</b><small>Zamanı gelince operatör ekranında çıkar · “Okudum” onayı istenebilir</small></div><span className="over" style=${{ marginLeft: 'auto' }}>${R.warns.length} uyarı</span></div>
      <div className="wlist">${R.warns.map(w => { const a = acks[w.id]; return html`<div key=${w.id} className=${'wrow l-' + w.lvl}>
        <div className="wlvl">${Object.keys(LVL).map(k => html`<button key=${k} type="button" className=${'lv ' + k + (w.lvl === k ? ' on' : '')} title=${LVL[k].l} onClick=${() => setW(w.id, { lvl: k })}>${LVL[k].l}</button>`)}</div>
        <input className="wt" value=${w.t} placeholder="Uyarı metni · örn. Ayna basıncını kontrol et" onChange=${e => setW(w.id, { t: e.target.value })} />
        <select value=${w.when} onChange=${e => setW(w.id, { when: e.target.value })}>${WHEN.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
        ${w.when === 'every' || w.when === 'interval' ? html`<${Num} v=${w.n || 50} min=${1} w=${70} suf=${w.when === 'every' ? 'parça' : 'dk'} onChange=${n => setW(w.id, { n })} />` : html`<span></span>`}
        <button type="button" className=${'crit ' + (w.ack ? 'on' : '')} title="Operatör “Okudum” demeden kapanmaz" onClick=${() => setW(w.id, { ack: !w.ack })}>Onay</button>
        <button type="button" className="tool" onClick=${() => setR({ warns: R.warns.filter(x => x.id !== w.id) })} aria-label="Uyarıyı sil"><${I} n="trash" s=${18} /></button>
        ${a ? html`<small className="wack"><${I} n="check" s=${12} w=${3} />Son okunma ${new Date(a.at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · ${a.by || 'operatör'}</small>` : null}
      </div>`; })}</div>
      ${!R.warns.length ? html`<p className="muted" style=${{ margin: '2px 0 0' }}>Henüz uyarı yok. Hazır örneklerden seç ya da kendin yaz.</p>` : null}
      <div className="presets"><span className="over">Hazır</span>${WARN_PRESETS.map((w, i) => html`<button key=${i} type="button" className="pchip" style=${{ '--c': LVL[w.lvl].c }} onClick=${() => addW(w)}><i></i>${w.t}</button>`)}</div>
      <button type="button" className="upl" style=${{ justifyContent: 'center' }} onClick=${() => addW({})}><${I} n="plus" s=${20} /><b>Uyarı ekle</b></button>
    </div>

    <div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--done)' }}><${I} n="target" s=${20} /></span><div><b>Kalite kuralları</b><small>Ölçüm, onay ve red akışı</small></div></div>
      ${p.samp && p.samp.length ? html`<div className="qinfo"><${I} n="clock" s=${18} /><span>Ne zaman numune alınacağı, kimin ölçeceği ve ilk parça onayı <b>Numune</b> sekmesinde kural kural belirleniyor.</span></div>` : html`<${Fragment}>
      <div className="rf"><span className="over">Ölçümü kim yapar</span><${Seg} v=${R.q.who} opts=${[['quality', 'Kalite istasyonu'], ['operator', 'Operatör tezgahta']]} onChange=${who => setQ({ who })} /></div>
      <${Sw} on=${R.q.firstPiece} onChange=${v => setQ({ firstPiece: v })} l="İlk parça onayı olmadan seri üretim başlamasın" d="“İlk parça” sıklığındaki ölçüler kaliteden onaylanana kadar Başlat kilitli" /></${Fragment}>`}
      <${Sw} on=${R.q.autoSend} onChange=${v => setQ({ autoSend: v })} l="Numune zamanı gelince otomatik kaliteye gönder" d="Operatörün düğmeye basmasını beklemez; istek kalite sırasına düşer" />
      <${Sw} on=${R.q.critTwice} onChange=${v => setQ({ critTwice: v })} l="Kritik ölçüde ikinci kontrol iste" d="Kalite, kritik (KK) ölçüleri onaylarken ikinci kontrolü işaretlemeli" />
      <div className="rf"><span className="over">Kalite RED verirse</span><${Seg} v=${R.q.nok} opts=${[['warn', 'Sadece uyar'], ['call', 'Kaliteyi çağır'], ['stop', 'Makineyi durdur']]} onChange=${nok => setQ({ nok })} /></div>
      <div className="rf"><span className="over">Sınıra yakın uyarısı</span>
        <div className="rrange"><input type="range" min="0" max="95" step="5" value=${R.q.band} onChange=${e => setQ({ band: +e.target.value })} /><b className="mono">${R.q.band ? '%' + R.q.band : 'Kapalı'}</b></div>
        <small className="muted">${R.q.band ? 'Ölçü uygun ama toleransın dış %' + (100 - R.q.band) + '’lik kısmındaysa sarı “sınırda” uyarısı · takım aşınmasını erken yakalar' : 'Yalnız tolerans dışı ölçüler uyarı verir'}</small>
        <div className="bandviz"><i style=${{ left: (50 - R.q.band / 2) + '%', right: (50 - R.q.band / 2) + '%' }}></i></div></div>
    </div>

    <div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--run)' }}><${I} n="gauge" s=${20} /></span><div><b>Üretim parametreleri</b><small>Limit aşılınca operatör ve amir uyarılır</small></div></div>
      <div className="rf2"><span>Hurda oranı limiti</span><${Num} v=${R.prod.scrapPct} min=${0} max=${100} w=${70} suf="%" onChange=${scrapPct => setP({ scrapPct })} /><span className="muted">en az</span><${Num} v=${R.prod.scrapMin} min=${1} w=${70} suf="parçadan sonra" onChange=${scrapMin => setP({ scrapMin })} /></div>
      <div className="rf2"><span>Uzun duruş uyarısı</span><${Num} v=${R.prod.maxPauseMin} min=${0} max=${600} w=${70} suf="dk (0 = kapalı)" onChange=${maxPauseMin => setP({ maxPauseMin })} /></div>
      <div className="rf"><span className="over">Takım ömrü sayaçları</span>
        <div className="tlist">${R.prod.tools.map(t => html`<div key=${t.id} className="trow">
          <input value=${t.name} placeholder="T04 İnce torna" onChange=${e => setT(t.id, { name: e.target.value })} />
          <${Num} v=${t.life} min=${1} w=${80} suf="parça" onChange=${life => setT(t.id, { life })} />
          <${Num} v=${t.warnPct} min=${10} max=${100} w=${60} suf="% uyar" onChange=${warnPct => setT(t.id, { warnPct })} />
          <button type="button" className="tool" onClick=${() => setP({ tools: R.prod.tools.filter(x => x.id !== t.id) })} aria-label="Takımı sil"><${I} n="trash" s=${18} /></button></div>`)}</div>
        <button type="button" className="btn" onClick=${() => setP({ tools: R.prod.tools.concat([{ id: uidg(), name: 'T0' + (R.prod.tools.length + 1), life: 400, warnPct: 85 }]) })}><${I} n="plus" s=${16} />Takım ekle</button>
        <small className="muted">Ömür dolunca operatöre “Takımı değiştir” görevi çıkar; değiştirince “Takım değişiminde” uyarıları gelir.</small></div>
    </div>

    <div className="glass rcard wide2">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--idle)' }}><${I} n="layers" s=${20} /></span><div><b>Şablonlar</b><small>Bu kuralları kaydet, başka işlere tek tıkla uygula · yeni işlere otomatik gelsin</small></div></div>
      <div className="tsave"><input value=${tName} placeholder=${'Şablon adı · örn. ' + p.machine + ' standart'} onChange=${e => setTName(e.target.value)} />
        <${Seg} v=${scope} opts=${Object.entries<any>(sl)} onChange=${setScope} />
        <${Sw} on=${def} onChange=${setDef} l="Yeni işlerde otomatik uygula" />
        <button type="button" className="btn pri" onClick=${saveTpl}><${I} n="download" s=${18} />Şablon olarak kaydet</button></div>
      <div className="tpls">${tpls.length ? tpls.map(t => { const match = (t.scope === 'machine' && t.key === p.machine) || (t.scope === 'family' && t.key === fam) || t.scope === 'all'; return html`<div key=${t.id} className=${'tpl ' + (match ? 'match' : '')}>
        <div><b>${t.name}${t.def ? html`<span className="chip" style=${{ '--c': 'var(--run)', marginLeft: 8 }}><i></i>Otomatik</span>` : null}</b><small>${t.scope === 'machine' ? 'Makine ' + t.key : t.scope === 'family' ? 'Parça ailesi ' + t.key : 'Tüm işler'} · ${rulesSummary(rulesOf({ rules: t.rules }))}</small></div>
        <button type="button" className="btn" onClick=${() => { patch({ rules: cloneRules(rulesOf({ rules: t.rules })) }); say('“' + t.name + '” bu işe uygulandı', 'check', 'var(--run)'); }}>Uygula</button>
        <button type="button" className="tool" onClick=${() => putT(tpls.map(x => x.id === t.id ? Object.assign({}, x, { def: !x.def }) : x))} title="Yeni işlerde otomatik uygula">${t.def ? '★' : '☆'}</button>
        <button type="button" className="tool" onClick=${() => putT(tpls.filter(x => x.id !== t.id))} aria-label="Şablonu sil"><${I} n="trash" s=${18} /></button></div>`; }) : html`<p className="muted" style=${{ margin: 0 }}>Kayıtlı şablon yok.</p>`}</div>
    </div>
  </div>`;
}

/* ── operatör: uyarı penceresi ── */
export function WarnOv({ list, title, onAck }) {
  const top = list.some(w => w.lvl === 'crit') ? 'crit' : list.some(w => w.lvl === 'warn') ? 'warn' : 'info';
  return html`<div className="ov"><div className=${'glass ov-card warnov l-' + top} role="alertdialog" aria-label="Uyarılar">
    <div className="wh"><span className="wbig" style=${{ '--c': LVL[top].c }}><${I} n=${LVL[top].i} s=${30} /></span><div><span className="over">${title || 'Hazırlıktan uyarı'}</span><h2>${list.length > 1 ? list.length + ' uyarı' : LVL[list[0].lvl].l}</h2></div></div>
    <div className="wis">${list.map(w => html`<div key=${w.id} className=${'wi l-' + w.lvl}><i style=${{ background: LVL[w.lvl].c }}></i><b>${w.t}</b><small>${(WHEN.find(x => x[0] === w.when) || [])[1] || ''}${w.when === 'every' ? ' · ' + w.n + ' parça' : w.when === 'interval' ? ' · ' + w.n + ' dk' : ''}</small></div>`)}</div>
    <button className="btn lg pri" style=${{ width: '100%' }} onClick=${onAck}><${I} n="check" s=${22} />Okudum, anladım</button>
  </div></div>`;
}
/* ── operatör: takım ömrü ── */
export function ToolsCard({ tools, o, onChange }) {
  if (!tools.length) return null;
  return html`<div className="glass toolsc"><div className="dh"><b>Takım ömrü</b><span className="over">${tools.length} takım</span></div>
    ${tools.map(t => { const used = Math.max(0, o.good - ((o.toolsAt || {})[t.id] || 0)), pct = Math.min(100, used / t.life * 100), c = pct >= 100 ? 'var(--stop)' : pct >= t.warnPct ? 'var(--hazard)' : 'var(--run)';
      return html`<div key=${t.id} className="tl"><div className="tlh"><b>${t.name}</b><span className="mono">${fmt(used)} / ${fmt(t.life)}</span><button className="linkbtn" onClick=${() => onChange(t)}>Değiştirildi</button></div><div className="aw-bar"><i style=${{ width: pct + '%', background: c }}></i></div></div>`; })}
  </div>`;
}

