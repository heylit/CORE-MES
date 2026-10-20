import type { Order, Pkg, Result, SampleRequest, PlanItem } from '@shared/model';
import { I, fmt, html, useEffect, useNow, useRef, useState } from './temel';
import { b64bytes, loadLib } from './yukleyici';
import { MEU, PLANT, can, machineOf, stationList, userInWc, wcOf } from './ortak-ayarlar';
import { secilebilirIstasyonlar } from '../data/istasyon-sec';
import { methOf } from './teknik-resim';
import { SEED_PLAN, WHO, beep, sampItems, sampLabel, sampOf, whoAt } from './operator-parcalar';
import { Num, Seg, Sw, nearEdge } from './kurallar';
import { DB, newPkg, uidg } from './hazirlik';
import { navGo } from './baslat';
import { muayeneNumunePlani } from '../data/muayene-lotu';
import { tmiPaketiMi } from '../data/yeni-paket';

/* ══════════ İSTASYON TİPLERİ: talaşlı, kalite, depo, markalama, boya, montaj ══════════ */
export const OPTYPES = {
  cnc: { l: 'Talaşlı imalat', short: 'Talaşlı', i: 'cpu', cnt: 'İyi parça', unit: 'adet', d: 'Torna, freze, pres · resim, ölçü, numune' },
  kalite: { l: 'Kalite kontrol', short: 'Muayene', i: 'search', cnt: 'Muayene', unit: 'parça', tab: 'Muayene', d: 'Numune ölçümü, görsel kusur, lot kararı' },
  depo: { l: 'Depo · toplama', short: 'Toplama', i: 'truck', cnt: 'Toplanan', unit: 'kalem', tab: 'Toplama listesi', pills: false, d: 'Toplama / mal kabul listesi, raf yeri, kod okutma' },
  mark: { l: 'Markalama', short: 'Markala', i: 'tag', cnt: 'Markalanan', unit: 'parça', tab: 'Markalama', d: 'Seri no, lazer / damga / etiket, QR doğrulama' },
  boya: { l: 'Boya · kaplama', short: 'Boya', i: 'brush', cnt: 'Boyanan', unit: 'parça', tab: 'Boya', d: 'Renk, ortam, fırın süresi, kaplama kalınlığı' },
  montaj: { l: 'Montaj', short: 'Montaj', i: 'box', cnt: 'Monte edilen', unit: 'ünite', tab: 'Montaj', d: 'Kit listesi, parça izlenebilirliği, tork' }
};
export const opOf = p => (p && OPTYPES[p.opType]) ? p.opType : 'cnc';
export const RAL = { '9005': ['Siyah', '#0a0a0a'], '9010': ['Saf beyaz', '#f1ece1'], '9016': ['Trafik beyazı', '#f1f0ea'], '7016': ['Antrasit gri', '#383e42'], '7021': ['Siyah gri', '#2f3234'], '7035': ['Açık gri', '#cbd0cc'], '7040': ['Pencere grisi', '#9da3a6'], '9006': ['Beyaz alüminyum', '#a5a8a6'], '3020': ['Trafik kırmızısı', '#c1121c'], '5010': ['Gentiyan mavisi', '#0e4c92'], '5015': ['Gök mavisi', '#2271b3'], '6005': ['Yosun yeşili', '#0f4336'], '1023': ['Trafik sarısı', '#f7b500'], '2004': ['Saf turuncu', '#f44611'] };
export const ST_DEFAULT = {
  cnc: () => ({}),
  kalite: () => ({ lot: 200, n: 8, ac: 0, defects: ['Çizik', 'Ezik', 'Çapak', 'Eksik işlem', 'Pas / leke', 'Yanlış malzeme'] }),
  depo: () => ({ mode: 'pick', items: [] }),
  mark: () => ({ fmt: '{PARCA}-{YY}{WW}-{SEQ:5}', start: 1, method: 'lazer', pos: '', verify: true }),
  boya: () => ({ ral: '7016', name: 'Antrasit gri', hex: '#383e42', type: 'Toz', layers: 1, dftMin: 60, dftMax: 90, cureT: 200, cureMin: 12, envTmin: 15, envTmax: 30, rhMax: 70, rack: 20 }),
  montaj: () => ({ bom: [], torque: [], fmt: '{PARCA}-{YY}{WW}-{SEQ:4}', start: 1 })
};
export const stOf = p => {
  const c = Object.assign(ST_DEFAULT[opOf(p)](), (p && p.st) || {});
  // Operatör, editör ve doğrulama aynı lotu görsün diye türetme tek yerde yapılır.
  return opOf(p) === 'kalite' ? muayeneNumunePlani(p, c) : c;
};
export function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((+t - +y0) / 864e5 + 1) / 7); }
/** seri numarası şablonu: {PARCA} {IE} {REV} {YY} {YYYY} {MM} {WW} {DD} {SEQ:n} */
export function fmtSerial(f, seq, p, d?) {
  d = d || new Date(); const two = v => String(v).padStart(2, '0');
  return String(f || '{PARCA}-{SEQ:5}').replace(/\{(\w+)(?::(\d+))?\}/g, (m, k, n) => {
    k = k.toUpperCase();
    if (k === 'SEQ') return String(seq).padStart(+n || 4, '0');
    if (k === 'YY') return String(d.getFullYear()).slice(2); if (k === 'YYYY') return String(d.getFullYear());
    if (k === 'MM') return two(d.getMonth() + 1); if (k === 'DD') return two(d.getDate()); if (k === 'WW') return two(isoWeek(d));
    if (k === 'PARCA') return String((p && (p.partNo || p.part)) || 'PRC').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (k === 'IE') return String((p && p.no) || '').replace(/\D/g, '').slice(-5);
    if (k === 'REV') return (p && p.rev) || '';
    return m;
  });
}
/* ── QR: üretme ve okuma (çevrimdışı) ── */
export async function qrSvg(text) {
  await loadLib('qrgen');
  const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
export function QR({ text, size = 140 }) {
  const [s, setS] = useState('');
  useEffect(() => { let ok = true; qrSvg(text).then(v => ok && setS(v)).catch(() => {}); return () => { ok = false; }; }, [text]);
  return html`<div className="qrbox" style=${{ width: size, height: size }} dangerouslySetInnerHTML=${{ __html: s }}></div>`;
}
/** Kod okutma penceresi: telefon/tablet kamerası (QR) ya da elle yazma / el okuyucu */
export function ScanOv({ title, hint, onCode, onClose }) {
  const vid = useRef(null), [err, setErr] = useState(null), [txt, setTxt] = useState(''), [live, setLive] = useState(false);
  const fine = (() => { try { return matchMedia('(pointer: fine)').matches; } catch (e) { return true; } })();
  useEffect(() => {
    let stream = null, to = 0, alive = true;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('bu cihazda kamera erişimi yok');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = vid.current; v.srcObject = stream; await v.play(); setLive(true);
        await loadLib('jsqr');
        const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
        const loop = () => {
          if (!alive) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const w = 520, h = Math.round(v.videoHeight / v.videoWidth * w); cv.width = w; cv.height = h; ctx.drawImage(v, 0, 0, w, h);
            const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
            if (r && r.data && r.data.trim()) { alive = false; onCode(r.data.trim()); return; }
          }
          to = setTimeout(loop, 160);
        };
        loop();
      } catch (e) { setErr(e && e.name === 'NotAllowedError' ? 'kamera izni verilmedi' : (e.message || String(e))); }
    })();
    return () => { alive = false; clearTimeout(to); if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card scanov" role="dialog" aria-label=${title || 'Kod okut'}>
    <div className="dh"><b>${title || 'Kod okut'}</b><button className="x" onClick=${onClose} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
    <div className="scanv">${err ? html`<div className="scanerr"><${I} n="alert" s=${26} /><b>Kamera açılamadı</b><span>${err} · kodu aşağıya yazabilirsin</span></div>` : html`<video ref=${vid} playsInline muted></video><i className=${'scanframe ' + (live ? 'on' : '')}></i>${!live ? html`<span className="scanwait">Kamera açılıyor…</span>` : null}`}</div>
    <form className="scanin" onSubmit=${e => { e.preventDefault(); if (txt.trim()) onCode(txt.trim()); }}><input value=${txt} autoFocus=${fine || !!err} onChange=${e => setTxt(e.target.value)} placeholder="Kodu yaz ya da okuyucuyla okut" aria-label="Kod" autoCapitalize="characters" /><button className="btn pri" type="submit"><${I} n="check" s=${18} />Tamam</button></form>
    ${hint ? html`<p className="muted" style=${{ margin: 0 }}>${hint}</p>` : null}
  </div></div>`;
}
/** Kod giriş çubuğu: yaz + Enter, ya da kamera */
export function CodeBar({ onCode, onCam, ph }) {
  const [v, setV] = useState('');
  return html`<form className="codebar" onSubmit=${e => { e.preventDefault(); if (v.trim()) { onCode(v.trim()); setV(''); } }}>
    <span className="cbi"><${I} n="scan" s=${20} /></span><input value=${v} onChange=${e => setV(e.target.value)} placeholder=${ph || 'Kod yaz veya okut'} aria-label="Kod" autoCapitalize="characters" />
    <button type="button" className="btn" onClick=${onCam} title="Kamerayla QR okut"><${I} n="qr" s=${20} />QR</button></form>`;
}
export function printLabel(svgs) {
  let el = document.getElementById('arkon-print'); if (!el) { el = document.createElement('div'); el.id = 'arkon-print'; document.body.appendChild(el); }
  el.innerHTML = svgs.join('');
  document.documentElement.classList.add('printing');
  if (window.ArkonAndroid && window.ArkonAndroid.print) { setTimeout(() => window.ArkonAndroid.print('Etiket'), 60); return; } // Android: yazdırma hizmeti, bitince sınıfı kendisi kaldırır
  setTimeout(() => { try { window.print(); } catch (e) {} setTimeout(() => document.documentElement.classList.remove('printing'), 500); }, 60);
}
export async function labelSvg(sn, p, extra) {
  const q = await qrSvg(sn);
  const inner = q.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''), vb = /viewBox="([^"]+)"/.exec(q)[1].split(' ').map(Number);
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<svg class="lbl" xmlns="http://www.w3.org/2000/svg" width="60mm" height="30mm" viewBox="0 0 600 300"><rect width="600" height="300" fill="#fff" stroke="#000" stroke-width="3" rx="12"/>' +
    '<svg x="20" y="20" width="260" height="260" viewBox="' + vb.join(' ') + '">' + inner + '</svg>' +
    '<text x="300" y="80" font-family="monospace" font-size="34" font-weight="700">' + esc(sn) + '</text>' +
    '<text x="300" y="130" font-family="sans-serif" font-size="26">' + esc(p.part) + '</text>' +
    '<text x="300" y="170" font-family="sans-serif" font-size="22" fill="#444">' + esc(p.partNo) + ' · Rev ' + esc(p.rev) + '</text>' +
    '<text x="300" y="250" font-family="sans-serif" font-size="20" fill="#444">' + esc(extra || new Date().toLocaleDateString('tr-TR')) + '</text></svg>';
}

/* ── operatör panelleri ── */
export function Prog({ v, n, label, c }) {
  const p = n ? Math.min(1, v / n) : 0;
  return html`<div className="sprog"><div className="sp-h"><span className="over">${label}</span><b className="mono">${v}<small> / ${n}</small></b></div><div className="aw-bar"><i style=${{ width: p * 100 + '%', background: c || 'var(--sig)' }}></i></div></div>`;
}
export function DepoPanel({ api }) {
  const { o, cfg, sr } = api, items = cfg.items || [], picked = sr.picked || {}, short = sr.short || {};
  const [sel, setSel] = useState(null), [qtyEd, setQtyEd] = useState(null);
  const done = it => (picked[it.id] || 0) >= it.qty || !!short[it.id];
  const nDone = items.filter(done).length, qty = items.reduce((a, it) => a + Math.min(it.qty, picked[it.id] || 0), 0), qtyT = items.reduce((a, it) => a + (+it.qty || 0), 0);
  const recount = (p, s) => items.filter(i => (p[i.id] || 0) >= i.qty || s[i.id]).length;
  const setPick = (it, v, label?) => api.act(label || (it.code + ' · ' + v + '/' + it.qty + ' ' + (it.unit || 'adet')), 'truck', 'var(--run)', x => { const s = x.sr || {}, p = Object.assign({}, s.picked, { [it.id]: Math.max(0, v) }); return { sr: Object.assign({}, s, { picked: p }), good: recount(p, s.short || {}) }; });
  const setShort = (it, on) => api.act(on ? it.code + ' eksik bildirildi' : it.code + ' eksik kaldırıldı', 'alert', on ? 'var(--hold)' : 'var(--idle)', x => { const s = x.sr || {}, sh = Object.assign({}, s.short); if (on) sh[it.id] = { at: Date.now(), got: (s.picked || {})[it.id] || 0 }; else delete sh[it.id]; return { sr: Object.assign({}, s, { short: sh }), good: recount(s.picked || {}, sh) }; });
  const onCode = code => {
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    const it = items.find(i => String(i.code).toUpperCase().replace(/\s+/g, '') === c) || items.find(i => c.indexOf(String(i.code).toUpperCase().replace(/\s+/g, '')) >= 0);
    if (!it) { beep('nok'); api.say('Listede yok: ' + code, 'alert', 'var(--stop)'); return; }
    setSel(it.id); const cur = picked[it.id] || 0;
    if (cur >= it.qty) { beep('nok'); api.say(it.code + ' zaten tamam · fazla toplama yapma', 'alert', 'var(--hold)'); return; }
    beep('ok'); setPick(it, cur + 1);
  };
  const list = items.slice().sort((a, b) => (Number(done(a)) - Number(done(b))) || String(a.loc).localeCompare(String(b.loc), 'tr'));
  const nextIt = list.find(i => !done(i));
  return html`<div className="stpanel sp-depo">
    <div className="sp-top"><${Prog} v=${nDone} n=${items.length} label=${cfg.mode === 'receive' ? 'Kabul edilen kalem' : 'Tamamlanan kalem'} c="var(--run)" /><${Prog} v=${qty} n=${qtyT} label="Toplam miktar" c="var(--done)" /></div>
    ${nextIt ? html`<div className="nextloc"><span className="over">Sıradaki raf</span><b className="mono">${nextIt.loc || '—'}</b><span>${nextIt.code} · ${nextIt.name} · <b>${nextIt.qty - (picked[nextIt.id] || 0)} ${nextIt.unit || 'adet'}</b></span></div>` : html`<div className="nextloc ok"><${I} n="check" s=${22} /><b>Liste tamamlandı</b><span>${Object.keys(short).length ? Object.keys(short).length + ' kalem eksik bildirildi' : 'Eksik yok'} · işi bitirebilirsin</span></div>`}
    <${CodeBar} onCode=${onCode} onCam=${() => api.scan({ title: 'Ürün kodunu okut', hint: 'Kutunun ya da rafın üzerindeki QR kodu çerçeveye getir', cb: onCode })} ph="Ürün kodu yaz veya okut" />
    <div className="dlist">${list.map(it => { const g = picked[it.id] || 0, d = done(it), sh = short[it.id]; return html`<div key=${it.id} className=${'dl ' + (d ? (sh ? 'short' : 'ok') : '') + (sel === it.id ? ' cur' : '')} onClick=${() => setSel(it.id)}>
      <span className="loc mono">${it.loc || '—'}</span>
      <div className="dln"><b className="mono">${it.code}</b><span>${it.name}</span>${sh ? html`<small className="shtag">Eksik · ${sh.got}/${it.qty}</small>` : null}</div>
      <div className="dlq">${qtyEd === it.id ? html`<input type="number" inputMode="numeric" autoFocus defaultValue=${g} onBlur=${e => { setQtyEd(null); const v = +e.target.value; if (!isNaN(v) && v !== g) setPick(it, v); }} onKeyDown=${e => e.key === 'Enter' && e.target.blur()} />` : html`<button className="qn mono" onClick=${e => { e.stopPropagation(); setQtyEd(it.id); }} title="Miktarı düzelt">${g}<small>/${it.qty}</small></button>`}<small>${it.unit || 'adet'}</small></div>
      <div className="dla"><button className="tool" disabled=${g <= 0} onClick=${e => { e.stopPropagation(); setPick(it, g - 1); }} aria-label="Bir eksilt"><${I} n="minus" s=${18} /></button><button className="tool" onClick=${e => { e.stopPropagation(); setPick(it, g + 1); }} aria-label="Bir ekle"><${I} n="plus" s=${18} /></button>
        ${!d ? html`<button className="btn" onClick=${e => { e.stopPropagation(); setPick(it, it.qty, it.code + ' tamamı toplandı'); }}>Tamamı</button>` : null}
        <button className=${'crit ' + (sh ? 'on' : '')} onClick=${e => { e.stopPropagation(); setShort(it, !sh); }} title="Rafta yok / eksik">Eksik</button></div>
    </div>`; })}</div>
  </div>`;
}
export function MarkPanel({ api }) {
  const { o, cfg, sr, pkg } = api, seq = sr.seq != null ? sr.seq : (+cfg.start || 1), sn = fmtSerial(cfg.fmt, seq, pkg), log = sr.log || [];
  const lastOk = log.find(l => l.ok);
  const mark = ok => api.act((ok ? 'Markalandı · ' : 'Hatalı markalama · hurda · ') + sn, ok ? 'tag' : 'trash', ok ? 'var(--run)' : 'var(--stop)', x => { const s = x.sr || {}, q = s.seq != null ? s.seq : (+cfg.start || 1); return Object.assign({ sr: Object.assign({}, s, { seq: q + 1, log: [{ sn: fmtSerial(cfg.fmt, q, pkg), ok, at: Date.now() }].concat(s.log || []).slice(0, 2000) }) }, ok ? { good: x.good + 1 } : { scrap: x.scrap + 1 }); });
  const verify = () => api.scan({ title: 'Markayı doğrula', hint: 'Parçadaki QR kodu okut ya da seri numarasını yaz · son markalanan: ' + (lastOk ? lastOk.sn : '—'), cb: code => {
    const hit = log.find(l => l.sn === code.trim());
    if (hit && hit.ok) { beep('ok'); api.say('Doğrulandı · ' + code + (hit === lastOk ? ' (son parça)' : ''), 'check', 'var(--run)'); api.act0(x => ({ sr: Object.assign({}, x.sr, { verified: Object.assign({}, (x.sr || {}).verified, { [code]: Date.now() }) }) })); }
    else { beep('nok'); api.say('Eşleşmedi: ' + code + ' · bu işte markalanmamış', 'alert', 'var(--stop)'); }
  } });
  const print = async () => { printLabel([await labelSvg(sn, pkg, cfg.pos)]); };
  const nV = Object.keys(sr.verified || {}).length;
  return html`<div className="stpanel sp-mark">
    <div className="mk-main glass2">
      <div className="mk-sn"><span className="over">Şimdi markalanacak</span><b className="mono">${sn}</b><small>Sonraki: <span className="mono">${fmtSerial(cfg.fmt, seq + 1, pkg)}</span></small>
        <div className="mk-meta"><span className="chip" style=${{ '--c': 'var(--done)' }}><i></i>${{ lazer: 'Lazer', damga: 'Damga / nokta vuruş', etiket: 'Etiket' }[cfg.method] || cfg.method}</span>${cfg.pos ? html`<span className="mk-pos"><${I} n="target" s=${14} />${cfg.pos}</span>` : null}</div></div>
      <${QR} text=${sn} size=${150} />
    </div>
    <div className="mk-acts"><button className="btn lg pri" onClick=${() => mark(true)}><${I} n="check" s=${22} />Markalandı</button><button className="btn lg" onClick=${() => mark(false)} style=${{ color: 'var(--stop)' }}><${I} n="trash" s=${20} />Hatalı · hurda</button>
      ${cfg.verify ? html`<button className="btn lg" onClick=${verify}><${I} n="qr" s=${20} />Doğrula</button>` : null}<button className="btn lg" onClick=${print}><${I} n="download" s=${20} />Etiket</button></div>
    <div className="mk-log"><div className="dh"><b>Seri kaydı</b><span className="over">${log.filter(l => l.ok).length} iyi · ${log.filter(l => !l.ok).length} hatalı${cfg.verify ? ' · ' + nV + ' doğrulandı' : ''}</span></div>
      ${log.slice(0, 12).map((l, i) => html`<div key=${i} className=${'mkl ' + (l.ok ? '' : 'bad')}><span className="mono">${l.sn}</span>${(sr.verified || {})[l.sn] ? html`<span className="chip" style=${{ '--c': 'var(--run)' }}><i></i>Doğrulandı</span>` : null}${!l.ok ? html`<span className="chip" style=${{ '--c': 'var(--stop)' }}><i></i>Hurda</span>` : null}<small>${new Date(l.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></div>`)}
      ${!log.length ? html`<p className="muted" style=${{ margin: 0 }}>Henüz markalama yok. İlk seri: <b className="mono">${sn}</b></p>` : null}</div>
  </div>`;
}
export const dewPoint = (t, rh) => { const a = 17.62, b = 243.12, g = Math.log(Math.max(1, rh) / 100) + a * t / (b + t); return b * g / (a - g); };
export function BoyaPanel({ api }) {
  const { o, cfg, sr } = api, now = useNow(1000);
  const env = (sr.env || [])[0], rack = sr.rack || { stage: 'load' }, dft = sr.dft || [];
  const [t, setT] = useState(''), [rh, setRh] = useState(''), [vals, setVals] = useState(['', '', '', '', '']), [n, setN] = useState(String(cfg.rack || 20));
  const left = rack.stage === 'oven' ? Math.max(0, cfg.cureMin * 60 - (now - rack.t0) / 1000) : 0;
  const alarmed = useRef(0);
  useEffect(() => { if (rack.stage === 'oven' && left <= 0 && alarmed.current !== rack.t0) { alarmed.current = rack.t0; beep('due'); api.say('Fırın süresi doldu · askıyı çıkar', 'clock', 'var(--hazard)'); } }, [left <= 0, rack.t0]);
  const saveEnv = () => { const T = parseFloat(String(t).replace(',', '.')), H = parseFloat(String(rh).replace(',', '.')); if (isNaN(T) || isNaN(H)) return; const dp = dewPoint(T, H), ok = T >= cfg.envTmin && T <= cfg.envTmax && H <= cfg.rhMax; api.act('Ortam kaydedildi · ' + T + '°C · %' + H + (ok ? '' : ' · LİMİT DIŞI'), 'drop', ok ? 'var(--run)' : 'var(--stop)', x => ({ sr: Object.assign({}, x.sr, { env: [{ t: T, rh: H, dp: +dp.toFixed(1), ok, at: Date.now() }].concat((x.sr || {}).env || []).slice(0, 200) }) })); setT(''); setRh(''); if (!ok) beep('nok'); };
  const toOven = () => { const k = Math.max(1, parseInt(n) || cfg.rack); api.act('Askı fırına girdi · ' + k + ' parça · ' + cfg.cureMin + ' dk', 'thermo', 'var(--hazard)', x => ({ sr: Object.assign({}, x.sr, { rack: { stage: 'oven', n: k, t0: Date.now() } }) })); };
  const outOven = () => { const k = rack.n || 0, early = left > 0; api.act((early ? 'Erken çıkarıldı · ' : 'Askı çıktı · ') + k + ' parça boyandı', 'check', early ? 'var(--hold)' : 'var(--run)', x => ({ sr: Object.assign({}, x.sr, { rack: { stage: 'load' }, racks: [{ n: k, t0: rack.t0, t1: Date.now(), early }].concat((x.sr || {}).racks || []).slice(0, 300) }), good: x.good + k })); };
  const saveDft = () => { const v = vals.map(s => parseFloat(String(s).replace(',', '.'))).filter(x => !isNaN(x)); if (v.length < 3) { api.say('En az 3 nokta ölç', 'alert', 'var(--hold)'); return; } const avg = v.reduce((a, b) => a + b, 0) / v.length, mn = Math.min(...v), mx = Math.max(...v), ok = mn >= cfg.dftMin && mx <= cfg.dftMax; if (!ok) beep('nok'); else beep('ok'); api.act('Kalınlık ' + avg.toFixed(0) + ' µm · ' + (ok ? 'uygun' : 'TOLERANS DIŞI'), 'gauge', ok ? 'var(--run)' : 'var(--stop)', x => ({ sr: Object.assign({}, x.sr, { dft: [{ v, avg: +avg.toFixed(1), mn, mx, ok, at: Date.now() }].concat((x.sr || {}).dft || []).slice(0, 300) }) })); setVals(['', '', '', '', '']); };
  const envAge = env ? (now - env.at) / 60000 : 1e9;
  const mm = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const rng = (v, a, b) => v >= a && v <= b;
  return html`<div className="stpanel sp-boya">
    <div className="by-color glass2"><span className="swatch" style=${{ background: cfg.hex }}></span><div><span className="over">Renk</span><b>RAL ${cfg.ral}</b><span>${cfg.name} · ${cfg.type} boya · ${cfg.layers} kat</span></div>
      <div className="by-spec"><div><span className="over">Kalınlık</span><b className="mono">${cfg.dftMin}–${cfg.dftMax}<small> µm</small></b></div><div><span className="over">Fırın</span><b className="mono">${cfg.cureT}°<small>C · ${cfg.cureMin} dk</small></b></div></div></div>
    <div className="by-grid">
      <div className="glass2 by-oven">
        <div className="dh"><b><${I} n="thermo" s=${18} /> Fırın</b><span className="over">${(sr.racks || []).length} askı tamam</span></div>
        ${rack.stage === 'oven' ? html`<div className=${'ovt ' + (left <= 0 ? 'done' : '')}><span className="over">${left > 0 ? 'Kür süresi' : 'Süre doldu'}</span><b className="mono">${mm(left)}</b><small>${rack.n} parça · ${cfg.cureT}°C</small><div className="aw-bar"><i style=${{ width: (100 - left / (cfg.cureMin * 60) * 100) + '%', background: left > 0 ? 'var(--hazard)' : 'var(--run)' }}></i></div></div>
          <button className=${'btn lg ' + (left <= 0 ? 'pri' : '')} onClick=${outOven}><${I} n="check" s=${20} />${left > 0 ? 'Erken çıkar' : 'Askı çıktı · ' + rack.n + ' parça'}</button>`
        : html`<label className="fld"><span className="over">Askıdaki parça</span><input type="number" inputMode="numeric" value=${n} onChange=${e => setN(e.target.value)} /></label>
          <button className="btn lg pri" onClick=${toOven} disabled=${envAge > 240}><${I} n="thermo" s=${20} />Fırına ver · ${cfg.cureMin} dk</button>${envAge > 240 ? html`<small className="muted">Önce ortam ölçümünü kaydet (4 saatte bir)</small>` : null}`}
      </div>
      <div className="glass2 by-env">
        <div className="dh"><b><${I} n="drop" s=${18} /> Ortam</b>${env ? html`<span className=${'chip'} style=${{ '--c': env.ok ? 'var(--run)' : 'var(--stop)' }}><i></i>${env.t}°C · %${env.rh} · çiğ ${env.dp}°</span>` : html`<span className="chip" style=${{ '--c': 'var(--hold)' }}><i></i>Ölçüm yok</span>`}</div>
        <div className="by-in"><label className="fld"><span className="over">Sıcaklık °C · ${cfg.envTmin}–${cfg.envTmax}</span><input inputMode="decimal" value=${t} onChange=${e => setT(e.target.value)} /></label><label className="fld"><span className="over">Nem % · en çok ${cfg.rhMax}</span><input inputMode="decimal" value=${rh} onChange=${e => setRh(e.target.value)} /></label></div>
        <button className="btn" onClick=${saveEnv} disabled=${!t || !rh}><${I} n="check" s=${18} />Ortamı kaydet</button>
      </div>
      <div className="glass2 by-dft">
        <div className="dh"><b><${I} n="gauge" s=${18} /> Kaplama kalınlığı</b><span className="over">${cfg.dftMin}–${cfg.dftMax} µm</span></div>
        <div className="dftin">${vals.map((v, i) => html`<input key=${i} inputMode="decimal" placeholder=${'N' + (i + 1)} value=${v} className=${v === '' ? '' : rng(parseFloat(v), cfg.dftMin, cfg.dftMax) ? 'ok' : 'nok'} onChange=${e => setVals(vals.map((x, j) => j === i ? e.target.value : x))} onKeyDown=${e => e.key === 'Enter' && saveDft()} />`)}</div>
        <button className="btn pri" onClick=${saveDft}><${I} n="check" s=${18} />Ölçümü kaydet</button>
        <div className="dftbars">${dft.slice(0, 14).reverse().map((d, i) => { const lo = cfg.dftMin * 0.6, hi = cfg.dftMax * 1.25, y = v => 100 - Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); return html`<i key=${i} className=${d.ok ? 'ok' : 'nok'} style=${{ left: 10 + i * 26, top: y(d.mx) + '%', bottom: (100 - y(d.mn)) + '%' }} title=${d.avg + ' µm'}><b style=${{ top: ((y(d.avg) - y(d.mx)) / Math.max(1, y(d.mn) - y(d.mx)) * 100) + '%' }}></b></i>`; })}<span className="lim hi" style=${{ top: (100 - (cfg.dftMax - cfg.dftMin * 0.6) / (cfg.dftMax * 1.25 - cfg.dftMin * 0.6) * 100) + '%' }}></span><span className="lim" style=${{ top: (100 - (cfg.dftMin - cfg.dftMin * 0.6) / (cfg.dftMax * 1.25 - cfg.dftMin * 0.6) * 100) + '%' }}></span></div>
      </div>
    </div>
  </div>`;
}
export function MontajPanel({ api }) {
  const { o, cfg, sr, pkg } = api, seq = sr.seq != null ? sr.seq : (+cfg.start || 1), sn = fmtSerial(cfg.fmt, seq, pkg), cur = sr.cur || {}, comps = cur.comps || {}, tq = cur.tq || {};
  const bom = cfg.bom || [], torque = cfg.torque || [], units = sr.units || [];
  const [tv, setTv] = useState<Record<string, any>>({});
  const setCur = (ch, label, icon?, color?) => api.act(label, icon || 'check', color || 'var(--run)', x => { const s = x.sr || {}; return { sr: Object.assign({}, s, { cur: Object.assign({}, s.cur, ch(s.cur || {})) }) }; });
  const compOk = b => !!comps[b.id];
  const tqOk = t => tq[t.id] != null && Math.abs(tq[t.id] - t.nm) <= t.tol + 1e-9;
  const pick = b => {
    if (compOk(b)) { setCur(c => ({ comps: Object.assign({}, c.comps, { [b.id]: undefined }) }), b.name + ' geri alındı', 'rotate', 'var(--idle)'); return; }
    if (b.trace) api.scan({ title: b.name + ' · seri / lot', hint: b.code + ' parçasının üzerindeki QR kodu okut ya da seri/lot numarasını yaz', cb: code => setCur(c => ({ comps: Object.assign({}, c.comps, { [b.id]: code }) }), b.name + ' · ' + code) });
    else setCur(c => ({ comps: Object.assign({}, c.comps, { [b.id]: true }) }), b.name + ' takıldı');
  };
  const saveTq = t => { const v = parseFloat(String(tv[t.id] || '').replace(',', '.')); if (isNaN(v)) return; const ok = Math.abs(v - t.nm) <= t.tol + 1e-9; beep(ok ? 'ok' : 'nok'); setCur(c => ({ tq: Object.assign({}, c.tq, { [t.id]: v }) }), t.name + ' · ' + v + ' Nm' + (ok ? '' : ' · TOLERANS DIŞI'), 'wrench', ok ? 'var(--run)' : 'var(--stop)'); setTv(Object.assign({}, tv, { [t.id]: '' })); };
  const nC = bom.filter(compOk).length, nT = torque.filter(tqOk).length, ready = nC === bom.length && nT === torque.length;
  const finish = () => api.act('Ünite tamamlandı · ' + sn, 'box', 'var(--run)', x => { const s = x.sr || {}, q = s.seq != null ? s.seq : (+cfg.start || 1); return { sr: Object.assign({}, s, { seq: q + 1, cur: {}, units: [{ sn: fmtSerial(cfg.fmt, q, pkg), comps: (s.cur || {}).comps || {}, tq: (s.cur || {}).tq || {}, at: Date.now() }].concat(s.units || []).slice(0, 2000) }), good: x.good + 1 }; });
  return html`<div className="stpanel sp-montaj">
    <div className="mt-unit glass2"><div><span className="over">Monte edilen ünite</span><b className="mono">${sn}</b><small>${units.length} ünite tamamlandı · son: <span className="mono">${units[0] ? units[0].sn : '—'}</span></small></div>
      <div className="mt-steps"><span className=${'ms ' + (nC === bom.length ? 'ok' : 'cur')}><i>1</i>Kit ${nC}/${bom.length}</span><span className=${'ms ' + (nT === torque.length && torque.length ? 'ok' : nC === bom.length ? 'cur' : '')}><i>2</i>Tork ${nT}/${torque.length}</span><span className=${'ms ' + (ready ? 'cur' : '')}><i>3</i>Tamamla</span></div>
      <button className="btn lg pri" disabled=${!ready} onClick=${finish}><${I} n="check" s=${22} />Ünite tamam</button></div>
    <div className="mt-grid">
      <div className="glass2 mt-kit"><div className="dh"><b>Parça listesi</b><span className="over">dokun: takıldı · <${I} n="qr" s=${12} /> seri/lot okut</span></div>
        ${bom.map(b => { const v = comps[b.id]; return html`<button key=${b.id} className=${'mk-row ' + (v ? 'ok' : '')} onClick=${() => pick(b)}>
          <span className="ck">${v ? html`<${I} n="check" s=${16} w=${3} />` : b.trace ? html`<${I} n="qr" s=${16} />` : ''}</span>
          <div><b>${b.name}</b><span className="mono">${b.code}${b.trace ? ' · izlenebilir' : ''}</span>${typeof v === 'string' ? html`<small className="mono lot">${v}</small>` : null}</div><em className="mono">×${b.qty}</em></button>`; })}</div>
      <div className="glass2 mt-tq"><div className="dh"><b>Tork değerleri</b><span className="over">tork anahtarı okuması</span></div>
        ${torque.map(t => { const v = tq[t.id], ok = tqOk(t); return html`<div key=${t.id} className=${'tq-row ' + (v == null ? '' : ok ? 'ok' : 'nok')}>
          <div><b>${t.name}</b><span className="mono">${t.nm} ± ${t.tol} Nm</span></div>
          ${v != null ? html`<span className=${'qv ' + (ok ? 'ok' : 'nok')}>${v}</span>` : null}
          <input inputMode="decimal" placeholder="Nm" value=${tv[t.id] || ''} onChange=${e => setTv(Object.assign({}, tv, { [t.id]: e.target.value }))} onKeyDown=${e => e.key === 'Enter' && saveTq(t)} />
          <button className="tool" onClick=${() => saveTq(t)} aria-label="Kaydet"><${I} n="check" s=${18} /></button></div>`; })}
        ${!torque.length ? html`<p className="muted" style=${{ margin: 0 }}>Bu işte tork adımı yok.</p>` : null}</div>
    </div>
  </div>`;
}
export function KalitePanel({ api, RL }) {
  const { o, cfg, sr, pkg } = api, plan = (pkg && pkg.plan) || [], insp = sr.insp || [], cur = sr.cur || {}, vals = cur.vals || {}, def = cur.def || [];
  const [inp, setInp] = useState<Record<string, any>>({});
  const band = RL ? RL.q.band : 0;
  const okOf = b => { const v = vals[b.id]; if (v == null) return null; if (b.gauge) return v === 'Geçer'; return v >= b.min - 1e-9 && v <= b.max + 1e-9; };
  const setVal = (b, v) => api.act0(x => { const s = x.sr || {}, c = s.cur || {}; return { sr: Object.assign({}, s, { cur: Object.assign({}, c, { vals: Object.assign({}, c.vals, { [b.id]: v }) }) }) }; });
  const saveNum = b => { const v = parseFloat(String(inp[b.id] || '').replace(',', '.')); if (isNaN(v)) return; const ok = v >= b.min - 1e-9 && v <= b.max + 1e-9; beep(ok ? 'ok' : 'nok'); setVal(b, v); setInp(Object.assign({}, inp, { [b.id]: '' })); };
  const togDef = d => api.act0(x => { const s = x.sr || {}, c = s.cur || {}, L = c.def || []; return { sr: Object.assign({}, s, { cur: Object.assign({}, c, { def: L.includes(d) ? L.filter(z => z !== d) : L.concat([d]) }) }) }; });
  const measured = plan.filter(b => vals[b.id] != null).length, allOk = plan.every(b => okOf(b) !== false) && !def.length;
  const rej = insp.filter(r => !r.ok).length, decided = insp.length >= cfg.n, lotOk = rej <= cfg.ac;
  const save = () => { const ok = allOk && measured === plan.length; api.act('Parça ' + (insp.length + 1) + ' · ' + (ok ? 'KABUL' : 'RED' + (def.length ? ' · ' + def.join(', ') : '')), ok ? 'check' : 'x', ok ? 'var(--run)' : 'var(--stop)', x => { const s = x.sr || {}; return Object.assign({ sr: Object.assign({}, s, { cur: {}, insp: (s.insp || []).concat([{ i: (s.insp || []).length + 1, vals: (s.cur || {}).vals || {}, def: (s.cur || {}).def || [], ok, at: Date.now() }]) }) }, ok ? { good: x.good + 1 } : { scrap: x.scrap + 1 }); }); };
  return html`<div className="stpanel sp-kalite">
    <div className="kl-head glass2"><div><span className="over">Lot ${fmt(cfg.lot)} · numune ${cfg.n} · kabul sayısı Ac ${cfg.ac}</span><b>Parça ${Math.min(insp.length + 1, cfg.n)} / ${cfg.n}</b></div>
      ${decided ? html`<span className=${'lotd ' + (lotOk ? 'ok' : 'nok')}><${I} n=${lotOk ? 'check' : 'x'} s=${22} w=${3} />LOT ${lotOk ? 'KABUL' : 'RED'}<small>${rej} red / ${insp.length}</small></span>` : html`<span className="lotd"><small>${insp.length} muayene · ${rej} red</small></span>`}</div>
    <div className="kl-grid">
      <div className="glass2 kl-items"><div className="dh"><b>Ölçüler</b><span className="over">${measured}/${plan.length}</span></div>
        ${plan.map(b => { const v = vals[b.id], ok = okOf(b), e = ok && typeof v === 'number' ? nearEdge(b, v, band) : 0; return html`<div key=${b.id} className=${'kli ' + (ok == null ? '' : ok ? (e ? 'edge' : 'ok') : 'nok')}>
          <span className=${'n ' + (methOf(b) === 'cmm' ? 'hx' : '')}>${b.id}</span><div><b className="mono">${b.nom}${methOf(b) === 'cmm' ? html`<span className="cmmtag">CMM</span>` : null}</b><small>${b.tol} · ${b.tool}${b.crit ? ' · KRİTİK' : ''}</small></div>
          ${v != null ? html`<span className=${'qv ' + (ok ? (e ? 'edge' : 'ok') : 'nok')}>${v}${e ? html`<small>sınırda</small>` : null}</span>` : null}
          ${b.gauge ? html`<div className="kgg"><button className="btn" onClick=${() => { beep('ok'); setVal(b, 'Geçer'); }} style=${{ color: 'var(--run)' }}>Geçer</button><button className="btn" onClick=${() => { beep('nok'); setVal(b, 'Geçmez'); }} style=${{ color: 'var(--stop)' }}>Geçmez</button></div>`
            : html`<div className="kgg"><input inputMode="decimal" placeholder=${b.min + '–' + b.max} value=${inp[b.id] || ''} onChange=${e => setInp(Object.assign({}, inp, { [b.id]: e.target.value }))} onKeyDown=${e => e.key === 'Enter' && saveNum(b)} /><button className="tool" onClick=${() => saveNum(b)} aria-label="Kaydet"><${I} n="check" s=${18} /></button></div>`}</div>`; })}
        ${!plan.length ? html`<p className="muted" style=${{ margin: 0 }}>Kontrol planı boş · hazırlıkta ölçü noktası ekle.</p>` : null}</div>
      <div className="kl-side">
        <div className="glass2 kl-def"><div className="dh"><b>Görsel kusur</b><span className="over">varsa işaretle</span></div><div className="defs">${(cfg.defects || []).map(d => html`<button key=${d} className=${'pchip ' + (def.includes(d) ? 'on' : '')} style=${{ '--c': 'var(--stop)' }} onClick=${() => togDef(d)}><i></i>${d}</button>`)}</div></div>

        <div className="glass2 kl-hist"><div className="dh"><b>Muayene kaydı</b></div><div className="khg">${insp.map(r => html`<span key=${r.i} className=${'kh ' + (r.ok ? 'ok' : 'nok')} title=${r.def.join(', ')}>${r.i}</span>`)}${Array.from({ length: Math.max(0, cfg.n - insp.length) }, (_, i) => html`<span key=${'e' + i} className="kh"></span>`)}</div></div>
      </div>
    </div>
    <div className="kl-save"><button className=${'btn lg ' + (allOk && measured === plan.length ? 'pri' : '')} style=${!allOk ? { background: 'var(--stop)', color: 'var(--on-sig)', borderColor: 'transparent' } : null} disabled=${decided || (measured < plan.length && !def.length)} onClick=${save}><${I} n=${allOk ? 'check' : 'x'} s=${22} />${allOk ? 'Parça kabul' : 'Parça red'} · kaydet</button></div>
  </div>`;
}
export const PANELS = { kalite: KalitePanel, depo: DepoPanel, mark: MarkPanel, boya: BoyaPanel, montaj: MontajPanel };

/* ── hazırlık: istasyona özel düzenleyiciler ── */
export function TypePicker({ v, onChange }) {
  return html`<div className="typepick">${Object.entries<any>(OPTYPES).map(([k, t]) => html`<button key=${k} type="button" className=${'tp ' + (v === k ? 'on' : '')} onClick=${e => { e.preventDefault(); onChange(k); }}><${I} n=${t.i} s=${22} /><b>${t.l}</b><small>${t.d}</small></button>`)}</div>`;
}
export function StEditor({ p, patch, say }) {
  const t = opOf(p), c = stOf(p);
  const set = ch => patch(Object.assign({ st: Object.assign({}, c, ch) }, ch.items ? { target: Math.max(1, ch.items.length) } : null));
  const row = (arr, key, id, ch) => set({ [key]: arr.map(x => x.id === id ? Object.assign({}, x, ch) : x) });
  const N = (v, f, w = 80, suf?) => html`<${Num} v=${v} w=${w} suf=${suf} onChange=${f} />`;
  const [paste, setPaste] = useState('');
  if (t === 'depo') {
    const items = c.items || [];
    const imp = () => { const rows = paste.split(/\r?\n/).map(l => l.split(/\t|;/).map(s => s.trim())).filter(r => r[0]); if (!rows.length) return; const add = rows.map(r => ({ id: uidg(), code: r[0], name: r[1] || '', qty: +String(r[2] || '1').replace(',', '.') || 1, unit: r[3] || 'adet', loc: r[4] || '' })); set({ items: items.concat(add) }); setPaste(''); say(add.length + ' kalem eklendi', 'check', 'var(--run)'); };
    return html`<div className="rules fadein"><div className="glass rcard wide2">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--done)' }}><${I} n="truck" s=${20} /></span><div><b>Toplama listesi</b><small>Operatör kodu okutur ya da yazar · raf sırasına göre yönlendirilir</small></div><span className="over" style=${{ marginLeft: 'auto' }}>${items.length} kalem</span></div>
      <${Seg} v=${c.mode} opts=${[['pick', 'Toplama (çıkış)'], ['receive', 'Mal kabul (giriş)']]} onChange=${mode => set({ mode })} />
      <div className="sttbl"><div className="sth"><span>Kod</span><span>Ad</span><span>Miktar</span><span>Birim</span><span>Raf</span><span></span></div>
        ${items.map(it => html`<div key=${it.id} className="str"><input className="mono" value=${it.code} onChange=${e => row(items, 'items', it.id, { code: e.target.value })} /><input value=${it.name} onChange=${e => row(items, 'items', it.id, { name: e.target.value })} />${N(it.qty, qty => row(items, 'items', it.id, { qty }), 80)}<input value=${it.unit} onChange=${e => row(items, 'items', it.id, { unit: e.target.value })} /><input className="mono" value=${it.loc} placeholder="A-01-02" onChange=${e => row(items, 'items', it.id, { loc: e.target.value })} /><button type="button" className="tool" onClick=${() => set({ items: items.filter(x => x.id !== it.id) })} aria-label="Sil"><${I} n="trash" s=${18} /></button></div>`)}</div>
      <button type="button" className="btn" onClick=${() => set({ items: items.concat([{ id: uidg(), code: '', name: '', qty: 1, unit: 'adet', loc: '' }]) })}><${I} n="plus" s=${16} />Kalem ekle</button>
      <div className="rf"><span className="over">Excel'den yapıştır · sütunlar: kod, ad, miktar, birim, raf</span><textarea rows="3" className="mono" value=${paste} onChange=${e => setPaste(e.target.value)} placeholder="CIV-M8x25	Cıvata M8x25	12	adet	B-02-04"></textarea><button type="button" className="btn" onClick=${imp} disabled=${!paste.trim()}><${I} n="download" s=${16} />Listeye ekle</button></div>
    </div></div>`;
  }
  if (t === 'mark') {
    const toks = ['{PARCA}', '{IE}', '{REV}', '{YY}', '{YYYY}', '{MM}', '{WW}', '{DD}', '{SEQ:4}', '{SEQ:5}'];
    return html`<div className="rules fadein"><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--hazard)' }}><${I} n="tag" s=${20} /></span><div><b>Seri numarası</b><small>Her markalamada sıradaki numara verilir · operatör ekranında QR ile gösterilir</small></div></div>
      <div className="rf"><span className="over">Şablon</span><input className="mono" value=${c.fmt} onChange=${e => set({ fmt: e.target.value })} /><div className="presets">${toks.map(k => html`<button key=${k} type="button" className="pchip" style=${{ '--c': 'var(--done)' }} onClick=${() => set({ fmt: c.fmt + k })}><i></i>${k}</button>`)}</div></div>
      <div className="rf2"><span>Başlangıç sırası</span>${N(c.start, start => set({ start }), 100)}</div>
      <div className="rf"><span className="over">Yöntem</span><${Seg} v=${c.method} opts=${[['lazer', 'Lazer'], ['damga', 'Damga / nokta vuruş'], ['etiket', 'Etiket']]} onChange=${method => set({ method })} /></div>
      <div className="rf"><span className="over">Markalama yeri</span><input value=${c.pos} placeholder="örn. Flanş dış yüzü, saat 12 yönü, 3 mm yazı" onChange=${e => set({ pos: e.target.value })} /></div>
      <${Sw} on=${c.verify} onChange=${verify => set({ verify })} l="QR ile doğrulama" d="Operatör markalanan parçayı okutup seri numarasını doğrular" />
    </div><div className="glass rcard"><div className="rch"><span className="rci" style=${{ '--c': 'var(--run)' }}><${I} n="qr" s=${20} /></span><div><b>Önizleme</b><small>İlk üç numara</small></div></div>
      <div className="mkprev"><${QR} text=${fmtSerial(c.fmt, c.start, p)} size=${120} /><div>${[0, 1, 2].map(i => html`<b key=${i} className="mono">${fmtSerial(c.fmt, (+c.start || 1) + i, p)}</b>`)}</div></div></div></div>`;
  }
  if (t === 'boya') {
    return html`<div className="rules fadein"><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': c.hex }}><${I} n="brush" s=${20} /></span><div><b>Renk ve boya</b><small>Operatör ekranında renk örneğiyle gösterilir</small></div></div>
      <div className="rf2"><span>RAL kodu</span><input className="mono" style=${{ width: 100 }} value=${c.ral} onChange=${e => { const k = e.target.value.replace(/\D/g, '').slice(0, 4), r = RAL[k]; set(Object.assign({ ral: k }, r ? { name: r[0], hex: r[1] } : null)); }} /><input type="color" value=${c.hex} onChange=${e => set({ hex: e.target.value })} style=${{ width: 54, padding: 2 }} /><input value=${c.name} onChange=${e => set({ name: e.target.value })} /></div>
      <div className="presets">${Object.entries<any>(RAL).map(([k, [n, h]]) => html`<button key=${k} type="button" className=${'ralc ' + (c.ral === k ? 'on' : '')} title=${n} onClick=${() => set({ ral: k, name: n, hex: h })}><i style=${{ background: h }}></i>${k}</button>`)}</div>
      <div className="rf"><span className="over">Boya türü</span><${Seg} v=${c.type} opts=${[['Toz', 'Toz'], ['Yaş', 'Yaş (sıvı)'], ['KTL', 'KTL / daldırma']]} onChange=${type => set({ type })} /></div>
      <div className="rf2"><span>Kat sayısı</span>${N(c.layers, layers => set({ layers }), 70)}<span>Askı başına</span>${N(c.rack, rack => set({ rack }), 80, 'parça')}</div>
    </div><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--hazard)' }}><${I} n="thermo" s=${20} /></span><div><b>Proses limitleri</b><small>Dışına çıkınca operatör uyarılır</small></div></div>
      <div className="rf2"><span>Kaplama kalınlığı</span>${N(c.dftMin, dftMin => set({ dftMin }), 70)}<span>–</span>${N(c.dftMax, dftMax => set({ dftMax }), 70, 'µm')}</div>
      <div className="rf2"><span>Fırın</span>${N(c.cureT, cureT => set({ cureT }), 80, '°C')}${N(c.cureMin, cureMin => set({ cureMin }), 70, 'dk')}</div>
      <div className="rf2"><span>Ortam sıcaklığı</span>${N(c.envTmin, envTmin => set({ envTmin }), 70)}<span>–</span>${N(c.envTmax, envTmax => set({ envTmax }), 70, '°C')}</div>
      <div className="rf2"><span>Bağıl nem en çok</span>${N(c.rhMax, rhMax => set({ rhMax }), 70, '%')}</div>
    </div></div>`;
  }
  if (t === 'montaj') {
    const bom = c.bom || [], tq = c.torque || [];
    return html`<div className="rules fadein"><div className="glass rcard wide2">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--done)' }}><${I} n="box" s=${20} /></span><div><b>Parça listesi (kit)</b><small>İzlenebilir parçalarda operatör seri/lot okutur · ünite kaydına yazılır</small></div><span className="over" style=${{ marginLeft: 'auto' }}>${bom.length} kalem</span></div>
      <div className="sttbl"><div className="sth b"><span>Kod</span><span>Ad</span><span>Adet</span><span>İzlenebilir</span><span></span></div>
        ${bom.map(b => html`<div key=${b.id} className="str b"><input className="mono" value=${b.code} onChange=${e => row(bom, 'bom', b.id, { code: e.target.value })} /><input value=${b.name} onChange=${e => row(bom, 'bom', b.id, { name: e.target.value })} />${N(b.qty, qty => row(bom, 'bom', b.id, { qty }), 70)}<button type="button" className=${'crit ' + (b.trace ? 'on' : '')} onClick=${() => row(bom, 'bom', b.id, { trace: !b.trace })}>Seri/lot</button><button type="button" className="tool" onClick=${() => set({ bom: bom.filter(x => x.id !== b.id) })} aria-label="Sil"><${I} n="trash" s=${18} /></button></div>`)}</div>
      <button type="button" className="btn" onClick=${() => set({ bom: bom.concat([{ id: uidg(), code: '', name: '', qty: 1, trace: false }]) })}><${I} n="plus" s=${16} />Parça ekle</button>
    </div><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--hazard)' }}><${I} n="wrench" s=${20} /></span><div><b>Tork değerleri</b><small>Operatör tork anahtarı okumasını girer</small></div></div>
      <div className="tlist">${tq.map(x => html`<div key=${x.id} className="trow"><input value=${x.name} placeholder="Kapak cıvataları" onChange=${e => row(tq, 'torque', x.id, { name: e.target.value })} />${N(x.nm, nm => row(tq, 'torque', x.id, { nm }), 70, 'Nm')}${N(x.tol, tol => row(tq, 'torque', x.id, { tol }), 60, '±')}<button type="button" className="tool" onClick=${() => set({ torque: tq.filter(z => z.id !== x.id) })} aria-label="Sil"><${I} n="trash" s=${18} /></button></div>`)}</div>
      <button type="button" className="btn" onClick=${() => set({ torque: tq.concat([{ id: uidg(), name: '', nm: 25, tol: 2 }]) })}><${I} n="plus" s=${16} />Tork ekle</button>
    </div><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--run)' }}><${I} n="tag" s=${20} /></span><div><b>Ünite seri numarası</b><small>${fmtSerial(c.fmt, c.start, p)}</small></div></div>
      <div className="rf"><span className="over">Şablon</span><input className="mono" value=${c.fmt} onChange=${e => set({ fmt: e.target.value })} /></div>
      <div className="rf2"><span>Başlangıç sırası</span>${N(c.start, start => set({ start }), 100)}</div>
    </div></div>`;
  }
  if (t === 'kalite') {
    const [nd, setNd] = [paste, setPaste];
    return html`<div className="rules fadein"><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--done)' }}><${I} n="search" s=${20} /></span><div><b>Numune planı</b><small>Ölçülecek karakteristikler “Kontrol planı” sekmesinden gelir</small></div></div>
      <div className="rf2"><span>Lot büyüklüğü</span>${N(c.lot, lot => set({ lot }), 90, 'parça')}</div>
      <div className="rf2"><span>Numune</span>${N(c.n, n => patch(Object.assign({ st: Object.assign({}, c, { n }) }, tmiPaketiMi(p) ? null : { target: n })), 70, 'parça')}<span>Kabul sayısı (Ac)</span>${N(c.ac, ac => set({ ac }), 60)}</div>
      <small className="muted">Red sayısı Ac'yi geçerse lot reddedilir. Ac = 0: tek red lotu reddeder.</small>
    </div><div className="glass rcard">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--stop)' }}><${I} n="alert" s=${20} /></span><div><b>Görsel kusurlar</b><small>Operatör işaretler · parça reddedilir</small></div></div>
      <div className="presets">${(c.defects || []).map(d => html`<button key=${d} type="button" className="pchip on" style=${{ '--c': 'var(--stop)' }} onClick=${() => set({ defects: c.defects.filter(x => x !== d) })} title="Kaldır"><i></i>${d} ×</button>`)}</div>
      <div className="tsave"><input value=${nd} placeholder="Yeni kusur · örn. Boya akıntısı" onChange=${e => setNd(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && nd.trim()) { set({ defects: (c.defects || []).concat([nd.trim()]) }); setNd(''); } }} /><button type="button" className="btn" disabled=${!nd.trim()} onClick=${() => { set({ defects: (c.defects || []).concat([nd.trim()]) }); setNd(''); }}><${I} n="plus" s=${16} />Ekle</button></div>
    </div></div>`;
  }
  return null;
}
export function stValidate(p): { k: string; ok: any; l: string; d: string; soft?: boolean }[] {
  const t = opOf(p), c = stOf(p);
  if (t === 'depo') return [{ k: 'st', ok: (c.items || []).length > 0 && c.items.every(i => i.code && i.qty > 0), l: 'Toplama listesi', d: (c.items || []).length + ' kalem · her kalemde kod ve miktar' }];
  if (t === 'mark') return [{ k: 'st', ok: /\{SEQ(:\d+)?\}/i.test(c.fmt || ''), l: 'Seri numarası şablonu', d: c.fmt ? fmtSerial(c.fmt, c.start, p) : 'Şablonda {SEQ} olmalı' }];
  if (t === 'boya') return [{ k: 'st', ok: !!c.ral && c.dftMax > c.dftMin && c.cureMin > 0, l: 'Boya parametreleri', d: 'RAL ' + c.ral + ' · ' + c.dftMin + '–' + c.dftMax + ' µm · ' + c.cureT + '°C ' + c.cureMin + ' dk' }];
  if (t === 'montaj') return [{ k: 'st', ok: (c.bom || []).length > 0, l: 'Montaj parça listesi', d: (c.bom || []).length + ' parça · ' + (c.torque || []).length + ' tork' }];
  if (t === 'kalite') return [{ k: 'st', ok: c.n > 0 && c.lot >= c.n, l: 'Numune planı', d: 'Lot ' + c.lot + ' · numune ' + c.n + ' · Ac ' + c.ac }];
  return [];
}
export const EMPTY_ORDER = (m?): Order => ({ no: '—', part: 'Bu istasyona atanmış iş yok', op: machineOf(m).l, state: 'queued', good: 0, scrap: 0, target: 1, cycle: 0, due: '—', baseGood: 0, meas: {}, pins: [], empty: true });
/** örnek istasyon paketleri (kalite, depo, markalama, boya, montaj) */
export async function seedStations() {
  if (await DB.get('kv', 'seedV11')) return;
  const ago = h => Date.now() - h * 3600e3, base = { status: 'published', version: 1, dirty: false, priority: 'normal' };
  const fln = () => [{ name: 'FLN-120.pdf', kind: 'pdf', bytes: b64bytes('smp-pdf') }];
  const S = (arr) => arr.map((t, i) => ({ id: 'ss' + i, t: t[0], d: t[1] || '', r: !!t[2] }));
  const list = [
    Object.assign(newPkg(), base, { id: 'seed-kal', no: 'İE-2026-04854', partNo: 'FLN-120', part: 'FLN-120 Flanş · final muayene', rev: 'C', op: 'Op 60 · Final kontrol', machine: 'KAL-01', opType: 'kalite', target: 8, cycle: 90, due: '16:00', material: 'S355J2', note: 'Lot 2026-41 · müşteri numunesi ayrı kutuya',
      st: { lot: 200, n: 8, ac: 0, defects: ['Çizik', 'Ezik', 'Çapak', 'Eksik işlem', 'Pas / leke', 'Yanlış malzeme'] }, files: fln(), primary: 'FLN-120.pdf', plan: SEED_PLAN.map(b => Object.assign({}, b)), steps: S([['Lot etiketini kontrol et', 'İE no ve parça no eşleşmeli', 1], ['Numuneleri rastgele seç', 'Kasanın farklı katlarından'], ['Ölçüm aletlerinin kalibrasyon tarihine bak', '', 1]]), publishedAt: ago(2) }),
    Object.assign(newPkg(), base, { id: 'seed-depo', no: 'İE-2026-04850', partNo: 'KIT-PMP200', part: 'PMP-200 montaj kiti toplama', rev: 'A', op: 'Malzeme hazırlama', machine: 'DEPO-1', opType: 'depo', target: 8, cycle: 45, due: '13:30', priority: 'urgent', note: 'Montaj hattı 1 · 60 ünitelik kit',
      st: { mode: 'pick', items: [['FLN-120', 'Flanş gövdesi', 60, 'adet', 'A-01-02'], ['MIL-45', 'Tahrik mili', 60, 'adet', 'A-01-05'], ['RLM-6204', 'Rulman 6204-2RS', 120, 'adet', 'B-03-01'], ['OR-40x3', 'O-ring 40×3 NBR', 60, 'adet', 'B-03-04'], ['BRG-08', 'Yatak kapağı', 60, 'adet', 'A-02-01'], ['CIV-M8x25', 'Cıvata M8×25 8.8', 360, 'adet', 'C-01-02'], ['PUL-M8', 'Pul M8', 360, 'adet', 'C-01-03'], ['ETK-PMP', 'Ürün etiketi', 60, 'adet', 'D-04-01']].map((r, i) => ({ id: 'di' + i, code: r[0], name: r[1], qty: r[2], unit: r[3], loc: r[4] })) },
      files: [], primary: null, plan: [], steps: S([['Toplama arabasını hazırla', '', 0], ['Kit kutusunu etiketle', 'İE no + montaj hattı', 1]]), publishedAt: ago(1) }),
    Object.assign(newPkg(), base, { id: 'seed-mark', no: 'İE-2026-04851', partNo: 'FLN-120', part: 'FLN-120 Flanş · seri no markalama', rev: 'C', op: 'Op 40 · Lazer markalama', machine: 'MRK-01', opType: 'mark', target: 1500, cycle: 12, due: '17:00', note: 'Markalama sonrası yüzeyi temizle',
      st: { fmt: 'FLN120-{YY}{WW}-{SEQ:5}', start: 1201, method: 'lazer', pos: 'Flanş dış yüzü · saat 12 yönü · 3 mm yazı', verify: true }, files: fln(), primary: 'FLN-120.pdf', plan: [], steps: S([['Lazer odak mesafesini kontrol et', '', 1], ['İlk parçada okunurluğu doğrula', 'QR ile okut', 1]]), publishedAt: ago(1.5) }),
    Object.assign(newPkg(), base, { id: 'seed-boya', no: 'İE-2026-04852', partNo: 'BRK-80', part: 'BRK-80 L braket · toz boya', rev: 'B', op: 'Op 50 · Toz boya', machine: 'BOYA-1', opType: 'boya', target: 480, cycle: 20, due: 'Yarın 10:00', note: 'Montaj yüzeyleri maskelenecek',
      st: { ral: '7016', name: 'Antrasit gri', hex: '#383e42', type: 'Toz', layers: 1, dftMin: 60, dftMax: 90, cureT: 200, cureMin: 12, envTmin: 15, envTmax: 30, rhMax: 70, rack: 24 },
      files: [{ name: 'BRK-80.step', kind: 'model', bytes: b64bytes('smp-step-brk') }], primary: 'BRK-80.step', plan: [], steps: S([['Yağ alma ve fosfat banyosu kontrolü', '', 1], ['Maskeleme', 'Delik içleri ve montaj yüzeyi', 1], ['Topraklama', 'Askı teması temiz olmalı', 1]]),
      rules: { warns: [{ id: 'bw1', t: 'Maske ve tulum zorunlu · kabin fanı açık olmalı', lvl: 'warn', when: 'shift', ack: true }], q: {}, prod: { tools: [] } }, publishedAt: ago(3) }),
    Object.assign(newPkg(), base, { id: 'seed-mnt', no: 'İE-2026-04853', partNo: 'PMP-200', part: 'PMP-200 pompa grubu', rev: 'A', op: 'Montaj · Hat 1', machine: 'MNT-01', opType: 'montaj', target: 60, cycle: 240, due: 'Yarın 16:00', note: 'Rulmanları ısıtarak tak (80 °C)',
      st: { fmt: 'PMP200-{YY}{WW}-{SEQ:4}', start: 87, bom: [['FLN-120', 'Flanş gövdesi', 1, true], ['MIL-45', 'Tahrik mili', 1, true], ['RLM-6204', 'Rulman 6204-2RS', 2, false], ['OR-40x3', 'O-ring 40×3', 1, false], ['BRG-08', 'Yatak kapağı', 1, false], ['CIV-M8x25', 'Cıvata M8×25', 6, false], ['ETK-PMP', 'Ürün etiketi', 1, false]].map((r, i) => ({ id: 'bm' + i, code: r[0], name: r[1], qty: r[2], trace: r[3] })),
        torque: [{ id: 'tq1', name: 'Kapak cıvataları (6×)', nm: 25, tol: 2 }, { id: 'tq2', name: 'Mil somunu', nm: 40, tol: 3 }, { id: 'tq3', name: 'Bağlantı flanşı', nm: 18, tol: 1.5 }] },
      files: [{ name: 'FLN-120.step', kind: 'model', bytes: b64bytes('smp-step-fln') }], primary: 'FLN-120.step', plan: [], steps: S([['ESD bilekliğini tak', '', 1], ['Rulmanları 80 °C ısıt', 'Endüksiyon ısıtıcı', 1], ['Mili yatakla', 'Pres ile, darbe yok', 1], ['Kapağı tak ve çapraz sık', 'Tork sırası: 1-4-2-5-3-6', 1], ['Döndürme testi', 'Elle serbest dönmeli, ses yok', 1]]),
      rules: { warns: [{ id: 'mw1', t: 'Rulmanı çekiçle çakma · sadece pres', lvl: 'crit', when: 'start', ack: true }], q: {}, prod: { tools: [] } }, publishedAt: ago(0.5) })
  ];
  for (const p of list) if (!(await DB.get('pkgs', p.id))) await DB.put('pkgs', p);
  await DB.put('kv', 1, 'seedV11');
}
/** İstasyon seçimi: iş merkezine göre gruplu */
export function StationSelect({ v, onChange, all }) {
  const L = stationList(all), wcs = PLANT.wcs.filter(w => L.some(m => m.wc === w.id)), loose = L.filter(m => !wcOf(m.wc));
  return html`<select value=${v || ''} onChange=${e => onChange(e.target.value)}>
    ${!L.some(m => m.id === v) ? html`<option value=${v || ''}>${v ? v + ' · tanımsız istasyon' : 'İstasyon seç'}</option>` : null}
    ${wcs.map(w => html`<optgroup key=${w.id} label=${w.name}>${L.filter(m => m.wc === w.id).map(m => html`<option key=${m.id} value=${m.id}>${m.id} · ${m.name}</option>`)}</optgroup>`)}
    ${loose.map(m => html`<option key=${m.id} value=${m.id}>${m.id} · ${m.name}</option>`)}
  </select>`;
}
export function StationPicker({ cur, onPick, onClose }) {
  const u = MEU(), L = secilebilirIstasyonlar(stationList().filter(m => userInWc(u, m.wc)), can('prod.station'), u && u.sts);
  const groups = []; L.forEach(m => { let g = groups.find(x => x.wc === m.wc); if (!g) groups.push(g = { wc: m.wc, name: m.wcName || 'İş merkezi atanmamış', list: [] }); g.list.push(m); });
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" style=${{ width: 'min(820px, 100%)' }}>
    <div className="dh"><div><span className="over">Bu cihaz</span><b style=${{ display: 'block', fontSize: 24 }}>Hangi istasyonda?</b></div><button className="x" onClick=${onClose} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
    <p className="muted">İş paketleri istasyona göre gelir; ekran açılan işin türüne göre şekillenir.${u && u.wcs && u.wcs.length && u.role !== 'admin' ? ' Yalnız yetkili olduğun iş merkezleri gösteriliyor.' : ''}${!can('prod.station') ? ' Yalnız çalışabildiğin istasyonlar gösteriliyor.' : ''}</p>
    ${!L.length && !can('prod.station') ? html`<div className="glass empty" style=${{ padding: 24 }}><${I} n="layers" s=${36} /><b>Size atanmış istasyon yok</b><small className="muted">Amirinize bildirin.</small></div>` : null}
    ${!L.length && can('prod.station') ? html`<div className="glass empty" style=${{ padding: 24 }}><${I} n="layers" s=${36} /><b>Tanımlı istasyon yok</b><small className="muted">Yönetici Ayarlar › Tesis yapısı bölümünden iş merkezi ve istasyon eklemeli.</small>${can('adm.plant') ? html`<a className="btn" href="#ayarlar" onClick=${e => { navGo(e, 'ayarlar'); onClose(); }} style=${{ textDecoration: 'none', color: 'inherit' }}><${I} n="gear" s=${18} />Tesis yapısını aç</a>` : null}</div>` : null}
    ${groups.map(g => html`<div key=${g.wc} className="stgrp"><span className="over">${g.name}${g.wc ? ' · ' + g.wc : ''}</span><div className="stpick">${g.list.map(m => { const t = OPTYPES[m.t || 'cnc'] || OPTYPES.cnc; return html`<button key=${m.id} className=${'tp ' + (m.id === cur ? 'on' : '')} onClick=${() => onPick(m.id)}><${I} n=${t.i} s=${22} /><b>${m.id}</b><small>${m.name}${m.mcs.length ? ' · ' + (m.mcs.length === 1 ? m.mcs[0].name : m.mcs.length + ' makine') : ''}</small></button>`; })}</div></div>`)}
  </div></div>`;
}

/* ── Hazırlık › Numune planı sekmesi ── */
export const SAMP_PRESETS = [
  { l: 'İlk parça kalite · her 50 operatör · son parça kalite', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'every', n: 50, who: ['op'], items: 'all' }, { when: 'last', who: ['q'], items: 'all' }] },
  { l: 'İlk parça kalite · her 25 sırayla kalite → operatör', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'every', n: 25, who: ['q', 'op'], items: 'all' }] },
  { l: 'İlk parça kalite · kritikler saatlik operatör · vardiya başı kalite', r: [{ when: 'first', who: ['q'], items: 'all', gate: true }, { when: 'time', n: 60, who: ['op'], items: 'crit' }, { when: 'shift', who: ['q'], items: 'all' }] }
];
/** Numune olaylarının parça ekseninde dağılımı (önizleme) */
export function sampEvents(rules, target, cycle) {
  const ev = [], T = Math.max(1, target || 1), cy = Math.max(1, cycle || 30);
  rules.forEach((r, ri) => {
    const push = (at, k) => { if (at >= 1 && at <= T && ev.length < 600) ev.push({ at, ri, who: whoAt(r, k), k }); };
    if (r.when === 'first') push(1, 0);
    else if (r.when === 'last') push(T, 0);
    else if (r.when === 'every') { const N = Math.max(1, r.n || 50); for (let k = 1; k * N < T; k++) push(k * N, k - 1); }
    else if (r.when === 'time') { const N = Math.max(1, Math.round((r.n || 60) * 60 / cy)); for (let k = 1; k * N < T; k++) push(k * N, k - 1); }
    else if (r.when === 'shift') { const N = Math.max(1, Math.round(28800 / cy)); for (let k = 0; k * N < T; k++) push(Math.max(1, k * N), k); }
  });
  return ev;
}
// Numune planını yazar. Ölçülerin "sıklık" etiketi kurallardan yazılır: operatör/kalite ekranlarındaki mevcut gösterimler bunu kullanır.
export function numunePlaniYaz(p, rs) {
  const plan = p.plan.map(b => { const ls = rs.filter(r => sampItems(Object.assign({}, p, { plan: [b] }), r).length).map(r => sampLabel(r) + ' · ' + (r.who || ['q']).map(w => WHO[w].l).join('→')); return Object.assign({}, b, { freq: ls.length ? ls.join(' + ') : 'Numune planında yok' }); });
  return { samp: rs.map(r => Object.assign({}, r)), plan };
}
export function SampTab({ p, patch, say }) {
  const rules = sampOf(p), legacy = !(p.samp && p.samp.length);
  const save = rs => patch(numunePlaniYaz(p, rs));
  const up = (id, ch) => save(rules.map(r => r.id === id ? Object.assign({}, r, ch) : r));
  const add = (r?) => save(rules.concat([Object.assign({ id: uidg(), when: 'every', n: 50, who: ['q'], items: 'all' }, r || {})]));
  const del = id => save(rules.filter(r => r.id !== id));
  const tgt = +p.target || 500, ev = sampEvents(rules, tgt, +p.cycle || 30);
  const nQ = ev.filter(e => e.who === 'q').length, nO = ev.filter(e => e.who === 'op').length;
  return html`<div className="samp fadein">
    <div className="glass rcard wide2">
      <div className="rch"><span className="rci" style=${{ '--c': 'var(--done)' }}><${I} n="target" s=${20} /></span><div><b>Numune planı</b><small>Numune ne zaman alınır, kim ölçer, hangi ölçüler · ${fmt(tgt)} parçalık iş için</small></div></div>
      ${legacy && p.plan.length ? html`<div className="qinfo"><${I} n="alert" s=${18} /><span>Bu paket eski usul ölçü başına sıklıkla çalışıyor; aşağıdaki kurallar ondan türetildi. Değiştirdiğin anda numune planı geçerli olur.</span></div>` : null}
      ${!p.plan.length ? html`<p className="muted" style=${{ margin: 0 }}>Önce <b>Kontrol planı</b> sekmesinde ölçüleri ekle.</p>` : null}
      <div className="stl">
        <div className="stl-h"><span className="over">Önizleme · parça sayısına göre</span><span className="mleg"><span><i className="wq"></i><b>${nQ}</b> kalite numunesi</span><span><i className="wo"></i><b>${nO}</b> operatör ölçümü</span></span></div>
        <div className="stl-lanes">${rules.map((r, ri) => html`<div key=${r.id} className="stl-lane"><span className="stl-n">${ri + 1}</span><div className="stl-tr">${ev.filter(e => e.ri === ri).map((e, i) => html`<i key=${i} style=${{ left: (e.at / tgt * 100) + '%', background: WHO[e.who].c }} title=${fmt(e.at) + '. parça · ' + sampLabel(r) + ' · ' + WHO[e.who].l}></i>`)}</div></div>`)}</div>
        <div className="stl-ax"><span>1</span><span>${fmt(Math.round(tgt / 2))}</span><span>${fmt(tgt)}</span></div>
      </div>
    </div>
    ${rules.map((r, ri) => { const its = sampItems(p, r); return html`<div key=${r.id} className="glass rcard srule">
      <div className="rch"><span className="sno">${ri + 1}</span><div><b>${sampLabel(r)}</b><small>${(r.who || ['q']).map(w => WHO[w].l).join(' → ')}${(r.who || []).length > 1 ? ' → (tekrar)' : ''} · ${its.length} ölçü</small></div><button className="tool" onClick=${() => del(r.id)} aria-label="Kuralı sil"><${I} n="trash" s=${18} /></button></div>
      <div className="rf"><span className="over">Ne zaman</span><${Seg} v=${r.when} opts=${[['first', 'Başta (ilk parça)'], ['every', 'Her N parça'], ['time', 'Her N dakika'], ['shift', 'Vardiya başı'], ['last', 'Sonda (son parça)']]} onChange=${when => up(r.id, { when, n: when === 'time' ? (r.when === 'time' ? r.n : 60) : when === 'every' ? (r.when === 'every' ? r.n : 50) : r.n })} /></div>
      ${r.when === 'every' || r.when === 'time' ? html`<div className="rf"><span className="over">${r.when === 'every' ? 'Kaç parçada bir' : 'Kaç dakikada bir'}</span><div className="nrow"><input type="number" min="1" value=${r.n} onChange=${e => up(r.id, { n: Math.max(1, +e.target.value || 1) })} /><span className="muted">${r.when === 'every' ? 'parça' : 'dk'}</span>${(r.when === 'every' ? [10, 25, 50, 100] : [30, 60, 120]).map(v => html`<button key=${v} className=${'pchip ' + (r.n === v ? 'on' : '')} onClick=${() => up(r.id, { n: v })}>${v}</button>`)}</div></div>` : null}
      <div className="rf"><span className="over">Kim ölçer · sırayla döner</span>
        <div className="wseq">${(r.who || ['q']).map((w, k) => html`<button key=${k} className=${'wchip w-' + w} title="Dokun: kalite ↔ operatör" onClick=${() => up(r.id, { who: r.who.map((x, j) => j === k ? (x === 'q' ? 'op' : 'q') : x) })}><small>${k + 1}.</small><${I} n=${WHO[w].i} s=${15} />${WHO[w].l}${r.who.length > 1 ? html`<span className="wx" onClick=${e => { e.stopPropagation(); up(r.id, { who: r.who.filter((x, j) => j !== k) }); }}>×</span>` : null}</button>`)}
          ${r.when !== 'first' && r.when !== 'last' ? html`<button className="wadd" onClick=${() => up(r.id, { who: (r.who || ['q']).concat([(r.who || ['q'])[(r.who || ['q']).length - 1] === 'q' ? 'op' : 'q']) })}><${I} n="plus" s=${15} />Sıraya ekle</button>` : null}</div>
        ${(r.who || []).length > 1 ? html`<small className="muted">1. numuneyi ${WHO[r.who[0]].l.toLowerCase()}, 2. numuneyi ${WHO[r.who[1]].l.toLowerCase()} ölçer${r.who.length > 2 ? ', …' : ''}; liste bitince başa döner.</small>` : null}
      </div>
      <div className="rf"><span className="over">Hangi ölçüler</span><${Seg} v=${Array.isArray(r.items) ? 'sel' : r.items || 'all'} opts=${[['all', 'Tümü · ' + p.plan.length], ['crit', 'Kritikler (KK) · ' + p.plan.filter(b => b.crit).length], ['sel', 'Seçili']]} onChange=${v => up(r.id, { items: v === 'sel' ? its.map(b => b.id) : v })} />
        ${Array.isArray(r.items) ? html`<div className="ichips">${p.plan.map(b => html`<button key=${b.id} className=${'ichip ' + (r.items.includes(b.id) ? 'on' : '')} onClick=${() => up(r.id, { items: r.items.includes(b.id) ? r.items.filter(x => x !== b.id) : r.items.concat([b.id]) })}><b>${b.id}</b>${b.nom}</button>`)}</div>` : null}</div>
      ${r.when === 'first' ? html`<${Sw} on=${!!r.gate} onChange=${v => up(r.id, { gate: v })} l="Onay gelmeden seri üretim başlamasın" d="Bu ölçüler uygun çıkana kadar operatör ekranında Başlat kilitli" />` : null}
    </div>`; })}
    <div className="glass rcard wide2 sadd">
      <button className="upl" style=${{ justifyContent: 'center' }} onClick=${() => add()}><${I} n="plus" s=${20} /><b>Numune kuralı ekle</b></button>
      <div className="presets"><span className="over">Hazır planlar</span>${SAMP_PRESETS.map((x, i) => html`<button key=${i} type="button" className="pchip" style=${{ '--c': 'var(--done)' }} onClick=${() => { save(x.r.map(r => Object.assign({ id: uidg() }, r))); say('Numune planı uygulandı', 'target', 'var(--run)'); }}><i></i>${x.l}</button>`)}</div>
    </div>
  </div>`;
}

