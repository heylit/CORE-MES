import { AKStore, type TmiAdim } from '../data/store';
import { adimCevabiUygula, adimYaz } from '../data/tmi-adim';
import { NEDEN_YOK, nedenAdi } from '../data/durus-nedeni';
import { kayitIlgili, seyrelt } from '../data/log-tepki';
import { yuzdeMetni } from '../data/yuzde';
import { isSatiri, malzemeSatiri, modelDosyasi, saatMetni } from '../data/buyuk-ekran';
import { Step3D, processModel } from './model-3b';
import { CALLS, Fragment, I, REASONS, SCRAPS, ST, STEPS0, alpha, dur, fmt, html, isPlannedReason, pad, reasonOf, useCallback, useEffect, useMemo, useNow, useRef, useState } from './temel';
import { MiniRing } from './bilesenler';
import { onerileriSuz } from './neden-kaynagi';
import { ILK_PARCA_KARAR_BEKLIYOR_ILETISI, kararBekleyenEki } from '../data/ilk-parca';
import { FEAT, LS } from './yukleyici';
import { POLICY, currentShift, downNext, downNow, downWindows, oeeCalc } from './ortak-ayarlar';
import { rulesOf } from './kurallar';
import { anlikPencereler } from '../data/vardiya-gunu';
import { opOf, stOf } from './istasyonlar';
import { kalanAdet } from '../data/sayac-halkasi';
import { topluGirisHatasi, topluGirisSayilari } from '../data/toplu-giris';
import { makineSecimiGorunur, secimOzeti, secimiDegistir } from '../data/makine-secimi';
import { TEKRAR_OLCUM } from '../data/otomatik-numune';
import { hurdaNedeniYokIletisi } from '../data/hurda-nedeni';

/* ── steps ── */
// TMI emrinde adımlar emrin talimatıdır ve işaret TMI'ye yazılır (Üretim Terminali ile aynı uç); yerel pakette paketin adımları yerelde kalır.
export function Steps({ steps, emirId = null, preview = false }: { steps?: any[]; emirId?: number | null; preview?: boolean }) {
  return emirId !== null && !preview && AKStore.status().mode === 'server' ? html`<${TmiSteps} emirId=${emirId} />` : html`<${YerelSteps} steps=${steps} />`;
}
function TmiSteps({ emirId }: { emirId: number }) {
  const [liste, setListe] = useState<TmiAdim[] | null>(null), [hata, setHata] = useState<string | null>(null);
  const suruyor = useRef(new Set<number>());
  useEffect(() => { let canli = true; AKStore.Server.tmiAdimlari(emirId).then(l => { if (canli) setListe(l); }, () => { if (canli) { setListe([]); setHata('Adımlar alınamadı'); } }); return () => { canli = false; }; }, [emirId]);
  const isaretle = (a: TmiAdim) => {
    if (suruyor.current.has(a.id)) return;
    suruyor.current.add(a.id); setHata(null);
    const tamam = !a.tamam;
    setListe(l => l && adimYaz(l, a.id, x => ({ ...x, tamam })));
    AKStore.Server.tmiAdimIsaretle(emirId, a.id, tamam)
      .then(c => setListe(l => l && adimCevabiUygula(l, a.id, c)))
      .catch(e => { setListe(l => l && adimYaz(l, a.id, x => ({ ...x, tamam: !tamam }))); setHata('Adım kaydedilmedi · ' + ((e && e.message) || 'TMI kabul etmedi')); })
      .finally(() => { suruyor.current.delete(a.id); });
  };
  const L = liste || [], n = L.filter(a => a.tamam).length;
  return html`<div className="glass steps fadein">
    <div className="steps-h"><${MiniRing} v=${L.length ? n / L.length : 0} c="var(--run)" /><div><h3>Operasyon adımları</h3><span className="over">${liste === null ? 'Yükleniyor…' : L.length ? n + ' / ' + L.length + ' tamamlandı · TMI\'ye yazılır' : 'Bu emrin talimat adımı yok'}</span></div></div>
    ${hata ? html`<div className="suggest"><${I} n="alert" s=${20} /><div><b>${hata}</b></div></div>` : null}
    ${L.map((a, i) => html`<div key=${a.id} className=${'step ' + (a.tamam ? 'on' : '')} role="checkbox" aria-checked=${a.tamam} tabIndex="0" onClick=${() => isaretle(a)} onKeyDown=${e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), isaretle(a))}>
      <span className="box"><${I} n="check" s=${26} w=${3} /></span><div><b>${i + 1}. ${a.ad}</b>${a.aciklama ? html`<small>${a.aciklama}</small>` : null}</div></div>`)}
  </div>`;
}
function YerelSteps({ steps }) {
  const STEPS = steps && steps.length ? steps : STEPS0;
  const [on, setOn] = useState(() => Object.fromEntries(STEPS.filter(s => s.on).map(s => [s.id, true])));
  const n = Object.values<any>(on).filter(Boolean).length;
  return html`<div className="glass steps fadein">
    <div className="steps-h"><${MiniRing} v=${n / STEPS.length} c="var(--run)" /><div><h3>Operasyon adımları</h3><span className="over">${n} / ${STEPS.length} tamamlandı · ${STEPS.filter(s => s.r).length} zorunlu</span></div></div>
    ${STEPS.map((s, i) => html`<div key=${s.id} className=${'step ' + (on[s.id] ? 'on' : '')} role="checkbox" aria-checked=${!!on[s.id]} tabIndex="0" onClick=${() => setOn({ ...on, [s.id]: !on[s.id] })} onKeyDown=${e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setOn({ ...on, [s.id]: !on[s.id] }))}>
      <span className="box"><${I} n="check" s=${26} w=${3} /></span><div><b>${i + 1}. ${s.t}</b><small>${s.d}</small></div>${s.r ? html`<span className="req">Zorunlu</span>` : null}</div>`)}
  </div>`;
}

/* ── analytics ── */
export function Scope({ state }) {
  const cv = useRef(null), stR = useRef(state); stR.current = state;
  const [load, setLoad] = useState(0);
  useEffect(() => {
    const c = cv.current, ctx = c.getContext('2d'); let raf, t = 0, buf = [], lastSet = 0;
    const draw = (now) => {
      const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const s = stR.current; t += 1;
      const base = s === 'running' ? .62 : s === 'setup' ? .25 : s === 'paused' ? .08 : 0;
      const ph = (t % 90) / 90; const cyc = s === 'running' ? (ph < .7 ? .12 * Math.sin(ph * Math.PI / .7) : -.18) : 0;
      const v = Math.max(0, Math.min(1, base + cyc + (s === 'running' ? (Math.random() - .5) * .08 : s === 'paused' ? (Math.random() - .5) * .02 : 0)));
      buf.push(v); if (buf.length > w / 2) buf.shift();
      const col = getComputedStyle(document.documentElement).getPropertyValue('--sig').trim() || '#3cf0a8';
      const grid = getComputedStyle(document.documentElement).getPropertyValue('--edge').trim();
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      for (let y = 0; y <= 4; y++) { ctx.beginPath(); ctx.moveTo(0, y * h / 4 + .5); ctx.lineTo(w, y * h / 4 + .5); ctx.stroke(); }
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, alpha(col, .33)); g.addColorStop(1, alpha(col, 0));
      ctx.beginPath(); buf.forEach((p, i) => { const x = w - (buf.length - i) * 2, y = h - 6 - p * (h - 12); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.lineTo(w, h); ctx.lineTo(w - buf.length * 2, h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      const lx = w - 2, ly = h - 6 - v * (h - 12); ctx.beginPath(); ctx.arc(lx, ly, 4, 0, 7); ctx.fillStyle = col; ctx.fill();
      if (now - lastSet > 400) { setLoad(v); lastSet = now; }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, []);
  const rpm = state === 'running' ? 2400 : state === 'setup' ? 600 : 0;
  return html`<div className="glass scope"><div className="scope-h"><div><span className="over">İş mili yükü · canlı</span><br /><b>${Math.round(load * 100)}<small> %</small></b></div>
    <div style=${{ textAlign: 'right' }}><span className="over">Devir</span><br /><b style=${{ color: 'var(--ink)', fontSize: 26 }}>${fmt(rpm)}<small> dev/dk</small></b></div></div><canvas ref=${cv}></canvas></div>`;
}
/* ── Vardiya verisi: durum kayıtları + sayımlar → kullanılabilirlik, performans, kalite (OEE), duruşlar ── */
export function useShiftLog(machine, off) {
  const [d, setD] = useState<any>({ ev: [], cn: [], sh: currentShift(Date.now()), ok: false });
  const load = useCallback(async () => {
    if (off) return;
    const sh = currentShift(Date.now()), L = AKStore.Log;
    try { const [ev, cn] = await Promise.all([L.query('events', { machine, from: sh.s - 7 * 864e5, to: sh.e }), L.query('counts', { machine, from: sh.s, to: sh.e })]); setD({ ev, cn, sh, machine, ok: true }); } catch (e) { console.warn(e); }
  }, [machine, off]);
  useEffect(() => { load(); const s = seyrelt(load, 250); const offL = AKStore.Log.on((k, r) => { if (kayitIlgili(k, r, ['events', 'counts'], machine)) s.tetikle(); }); const t = setInterval(load, 30000); return () => { offL(); s.birak(); clearInterval(t); }; }, [load, machine]);
  return d;
}
/** Vardiya hesabı (oeeCalc): Kullanılabilirlik = çalışma / planlı süre (molalar ve planlı duruşlar düşülür) · Performans = Σ planlı çevrim × parça / çalışma · Kalite = iyi / (iyi + hurda) */
export function shiftCalc(d, now) {
  const sh = d.sh, end = Math.max(sh.s + 1, Math.min(now, sh.e));
  const c = oeeCalc({ ev: d.ev, cn: d.cn, from: sh.s, to: end, st: d.machine, windows: anlikPencereler(sh) });
  const plannedCycle = (d.cn || []).find(x => x.planMs) ? d.cn.find(x => x.planMs).planMs : null;
  return Object.assign(c, { sh, plannedCycle, expected: plannedCycle && !sh.tanimsiz ? Math.floor(c.planned / plannedCycle) : null });
}
export const pctS = yuzdeMetni;
export function VardiyaTanimsiz() {
  return html`<div className="glass vuyari" role="status"><${I} n="alert" s=${26} /><div><b>Vardiya tanımsız</b><small>Aktif vardiya tanımlanmadığı için OEE ve vardiya süresi gösterilmiyor. Yönetici Ayarlar › Vardiyalar'dan tanımlar.</small></div></div>`;
}
export function Oee({ c }) {
  const parts = [{ l: 'Kullanılabilirlik', v: c.A, c: 'var(--run)', r: 62, d: 'Çalışma ' + Math.round(c.run / 60000) + ' / planlı ' + Math.round(c.planned / 60000) + ' dk' }, { l: 'Performans', v: c.P == null ? null : Math.min(1, c.P), c: 'var(--hazard)', r: 48, d: 'Planlı çevrimle yapılabilecek parçaya göre' }, { l: 'Kalite', v: c.Q, c: 'var(--done)', r: 34, d: c.good + ' iyi · ' + c.scrap + ' hurda' }];
  const [go, setGo] = useState(false); useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t); }, []);
  return html`<div className="glass oee" title="OEE = Kullanılabilirlik × Performans × Kalite · bu vardiyanın kayıtlarından"><svg width="150" height="150" viewBox="0 0 150 150">
    ${parts.map(p => { const C = 2 * Math.PI * p.r; return html`<g key=${p.l}><circle cx="75" cy="75" r=${p.r} fill="none" stroke="var(--edge)" strokeWidth="10" /><circle className="rg" cx="75" cy="75" r=${p.r} stroke=${p.c} strokeWidth="10" strokeDasharray=${C} strokeDashoffset=${go && p.v != null ? C * (1 - Math.max(0, Math.min(1, p.v))) : C} transform="rotate(-90 75 75)" /></g>`; })}
    <text x="75" y="80" textAnchor="middle" style=${{ font: '800 22px Archivo, system-ui, sans-serif', fill: 'var(--ink)', fontStretch: '115%' }}>${pctS(c.oee)}</text></svg>
    <div><span className="over">OEE · Vardiya ${c.sh.name}</span><ul style=${{ marginTop: 10 }}>${parts.map(p => html`<li key=${p.l} title=${p.d}><i style=${{ background: p.c }}></i>${p.l}<b>${pctS(p.v)}</b></li>`)}</ul>${!c.has ? html`<small className="muted" style=${{ display: 'block', marginTop: 8 }}>Bu vardiyada henüz kayıt yok</small>` : null}</div></div>`;
}
export function Ribbon({ c, now, st }) {
  const sh = c.sh, len = sh.e - sh.s, X = t => Math.max(0, Math.min(100, (t - sh.s) / len * 100)), hmm = ms => Math.floor(ms / 3600e3) + ' sa ' + pad(Math.round((ms % 3600e3) / 60000)) + ' dk';
  const hours = []; for (let t = Math.ceil(sh.s / 3600e3) * 3600e3; t <= sh.e; t += 3600e3) hours.push(t);
  const tot = { running: c.run, setup: c.setupMs, paused: c.pauseMs, stopped: c.stopMs, planned: c.stopPMs };
  const dws = st ? downWindows(st, sh.s, sh.e) : [];
  return html`<div className="glass ribbon"><div className="scope-h"><span className="over">${sh.label}</span><span className="over">${hmm(Math.max(0, Math.min(now, sh.e) - sh.s))} geçti</span></div>
    <div className="rb-track abs"><div className="rb-rest"></div>
      ${(sh.breaks || []).map((b, i) => html`<div key=${'b' + i} className="rb-brk" style=${{ left: X(b.s) + '%', width: (X(b.e) - X(b.s)) + '%' }} title="Mola"></div>`)}
      ${dws.map((w, i) => html`<div key=${'d' + i} className="rb-brk rb-pd" style=${{ left: X(w.s) + '%', width: (X(w.e) - X(w.s)) + '%' }} title=${'Planlı duruş · ' + (w.d.title || (reasonOf(w.d.reason) || {}).l || '')}></div>`)}
      ${c.segs.filter(x => x.s !== 'none').map((x, i) => html`<div key=${i} className=${'rb-seg ' + (x.s === 'stopped' ? 'stop' : '')} style=${{ left: X(x.f) + '%', width: Math.max(0.3, X(x.t) - X(x.f)) + '%', '--c': x.s === 'stopped' && isPlannedReason(x.n) ? 'var(--done)' : (ST[x.s] || ST.queued).c }} data-t=${(ST[x.s] || { l: x.s }).l + ' · ' + Math.round((x.t - x.f) / 60000) + ' dk' + (x.n ? ' · ' + nedenAdi(x.n, k => (REASONS.find(r => r.code === k) || {}).l ?? null) : x.s === 'stopped' || x.s === 'paused' ? ' · ' + nedenAdi(NEDEN_YOK, () => null) : '')}></div>`)}
      <div className="rb-now" style=${{ left: X(now) + '%' }}></div></div>
    <div className="rb-ticks">${hours.map(t => html`<span key=${t} style=${{ left: X(t) + '%' }}>${pad(new Date(t).getHours())}:00</span>`)}</div>
    <div className="rb-leg">${['running', 'setup', 'paused', 'stopped'].map(k => html`<span key=${k} style=${{ '--c': ST[k].c }}><i></i>${k === 'stopped' ? 'Plansız duruş' : ST[k].l} <b>${hmm(tot[k] || 0)}</b></span>`)}<span style=${{ '--c': 'var(--done)' }}><i></i>Planlı duruş <b>${hmm(tot.planned || 0)}</b></span><span style=${{ '--c': 'var(--edge2)' }}><i></i>Mola</span></div></div>`;
}
export function Analytics({ c, now, o, st }) {
  const feat = FEAT.get(), exp = c.expected, rel = exp ? c.good / exp - 1 : null;
  const top = c.topReason ? nedenAdi(c.topReason, k => (REASONS.find(r => r.code === k) || {}).l ?? null) : null;
  if (c.sh.tanimsiz) return html`<div className="ana fadein">${feat.spindle ? html`<${Scope} state=${o.state} />` : null}<${VardiyaTanimsiz} /></div>`;
  return html`<div className="ana fadein">${feat.spindle ? html`<${Scope} state=${o.state} />` : null}<div className="duo"><${Oee} c=${c} /><div className="kpis">
    <div className="glass kpi"><span className="over">Vardiya üretimi · bu makine</span><b>${fmt(c.good)}<small>iyi</small></b><span className="d" style=${{ color: rel == null ? 'var(--muted)' : rel >= 0 ? 'var(--run)' : 'var(--hold)' }}>${rel == null ? c.scrap + ' hurda' : (rel >= 0 ? '▲ ' : '▼ ') + 'Planlı hızın %' + Math.abs(Math.round(rel * 100)) + (rel >= 0 ? ' üstünde' : ' altında') + ' · ' + c.scrap + ' hurda'}</span></div>
    <div className="glass kpi"><span className="over">Plansız duruş</span><b>${Math.round(c.stopMs / 60000)}<small>dk</small></b><span className="d" style=${{ color: c.stops ? 'var(--stop)' : 'var(--muted)' }}>${c.stops ? c.stops + ' olay' + (top ? ' · en uzun ' + top : '') : 'Duruş yok'}${c.stopPMs > 60000 || c.downMs > 60000 ? ' · planlı ' + Math.round(Math.max(c.stopPMs, c.downMs) / 60000) + ' dk (OEE dışı)' : ''}</span></div></div></div>
    <${Ribbon} c=${c} now=${now} st=${st} /></div>`;
}

/* ── overlays ── */
/** Planlı duruş bildirimi: şu an takvimde planlı duruş var ya da 30 dk içinde başlayacak */
export function PlanBanner({ st, o, now, onStop }) {
  if (!st || o.empty) return null;
  const cur = downNow(st, now), nx = cur ? null : downNext(st, now, 30 * 60e3), w = cur || nx; if (!w) return null;
  const r = reasonOf(w.d.reason), hm = t => pad(new Date(t).getHours()) + ':' + pad(new Date(t).getMinutes());
  const already = cur && o.state === 'stopped';
  return html`<div className=${'handover glass planbn ' + (cur ? 'now' : '')}><${I} n="clock" s=${18} /><div><span className="over">${cur ? 'Şu an planlı duruş' : Math.max(1, Math.round((w.s - now) / 60000)) + ' dk sonra planlı duruş'}</span><b>${w.d.title || (r ? r.l : 'Planlı duruş')} · ${hm(w.s)}–${hm(w.e)}</b></div>${cur && !already && w.d.reason ? html`<button className="btn" onClick=${() => onStop(w.d.reason)}>Duruşa geç</button>` : null}</div>`;
}
export function ScrapOv({ onClose, onSave }) {
  const last = LS.get('lastScrap');
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const pick = code => { LS.set('lastScrap', code); onSave(code); };
  const L = SCRAPS.filter(r => r.active !== false);
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" role="dialog" aria-modal="true" aria-label="Hurda nedeni" style=${{ width: 'min(760px, 100%)' }}>
    <div className="ov-h"><div><span className="over" style=${{ color: 'var(--stop)' }}>Hurda +1</span><h2>Hurda nedeni?</h2><p>Dokun, kaydedilsin. Nedenler raporda hurda analizine gider.</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    ${hurdaNedeniYokIletisi(L) ? html`<p className="muted">${hurdaNedeniYokIletisi(L)}</p>` : null}<div className="reasons scraps">${L.map(r => html`<button key=${r.code} className=${'rs ' + (r.code === last ? 'sug' : '')} style=${{ '--c': 'var(--stop)' }} onClick=${() => pick(r.code)}><span className="ic"><${I} n="trash" s=${24} /></span><b>${r.l}</b><code>${r.code === last ? 'son seçilen' : r.code}</code></button>`)}</div>
    <div className="ov-f"><button className="btn lg" onClick=${onClose}>Vazgeç</button></div>
  </div></div>`;
}
// Toplu giriş (kart #1046): sağlam ve hurda adedi bir seferde; hurda varsa nedeni seçilir. Kaydet, sayaçları artırır.
// Toplu giriş ekranda hep açıktır (kullanıcı talimatı, kart #1075): operatör pencere açmadan sayıyı yazar, kaydedince alanlar boşalır.
export function TopluPanel({ kalan, disabled, onSave }) {
  const [sg, setSg] = useState(''); const [hr, setHr] = useState(''); const [neden, setNeden] = useState(LS.get('lastScrap'));
  const n = topluGirisSayilari(sg, hr), g = { saglam: n.saglam, hurda: n.hurda, neden: n.hurda > 0 ? neden : null };
  const hata = topluGirisHatasi(g, kalan), bos = sg.trim() === '' && hr.trim() === '';
  const nedenRef = useRef<any>(null);
  useEffect(() => { if (n.hurda > 0 && nedenRef.current && nedenRef.current.scrollIntoView) nedenRef.current.scrollIntoView({ block: 'nearest' }); }, [n.hurda > 0]); // dar ekranda neden listesi kaydırma alanının altında kalmasın
  const kaydet = () => { if (hata || disabled) return; if (onSave(g) === false) return; if (g.neden) LS.set('lastScrap', g.neden); setSg(''); setHr(''); };
  const alan = (l, v, set, sinif) => html`<label className=${'tp-f ' + sinif}><span className="over">${l}</span>
    <input className="mono" inputMode="numeric" pattern="[0-9]*" value=${v} placeholder="0" disabled=${disabled} aria-label=${'Toplu ' + l.toLocaleLowerCase('tr-TR')} onChange=${e => set(e.target.value)} onKeyDown=${e => e.key === 'Enter' && kaydet()} /></label>`;
  const L = SCRAPS.filter(r => r.active !== false);
  return html`<div className="glass toplu" role="group" aria-label="Toplu giriş">
    <div className="tp-h"><${I} n="layers" s=${14} /><span className="over">Toplu giriş</span><small className="muted">Sağlam en çok ${fmt(Math.max(0, kalan))}</small></div>
    <div className="tp-r">${alan('Sağlam', sg, setSg, 'ok')}${alan('Hurda', hr, setHr, 'bad')}
      <button className="btn pri tp-k" disabled=${disabled || bos || !!hata} onClick=${kaydet}><${I} n="check" s=${16} />Kaydet</button></div>
    ${n.hurda > 0 ? html`<div ref=${nedenRef} className="reasons scraps tp-n" role="radiogroup" aria-label="Hurda nedeni">${L.map(r => html`<button key=${r.code} role="radio" aria-checked=${neden === r.code} className=${'rs ' + (neden === r.code ? 'sel' : '')} style=${{ '--c': 'var(--stop)' }} onClick=${() => setNeden(r.code)}><span className="ic"><${I} n="trash" s=${16} /></span><b>${r.l}</b></button>`)}</div>` : null}
    ${hata && !bos ? html`<small className="tp-e">${hata}</small>` : null}
  </div>`;
}
export function ReasonOv({ onClose, onSave, suggest, machine }) {
  const [v, setV] = useState(null);
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const sug = onerileriSuz<any>(suggest || [], REASONS).filter((s, i, a) => a.findIndex(x => x.code === s.code) === i).slice(0, 3);
  const tile = (r, why?) => html`<button key=${r.code + (why ? 's' : '')} role="radio" aria-checked=${v === r.code} className=${'rs ' + (v === r.code ? 'sel ' : '') + (why ? 'sug' : '')} style=${{ '--c': r.c }} onClick=${() => setV(r.code)}>
      <span className="ic"><${I} n=${r.i} s=${26} /></span><b>${r.l}</b>${why ? html`<span className="why"><${I} n="bolt" s=${12} />${why}</span>` : html`<code>${r.code}</code>`}</button>`;
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" role="dialog" aria-modal="true" aria-label="Duruş nedeni">
    <div className="ov-h"><div><span className="over" style=${{ color: 'var(--stop)' }}>Duruş kaydı · ${machine || ''}</span><h2>Neden durdu?</h2><p>Nedeni seç; süre ve kod otomatik kaydedilir.</p></div>
      <button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    ${sug.length ? html`<span className="over" style=${{ display: 'block', marginBottom: 10 }}>Duruma göre önerilen</span><div className="reasons" style=${{ marginBottom: 18 }}>${sug.map(s => tile(REASONS.find(r => r.code === s.code), s.why))}</div><span className="over" style=${{ display: 'block', marginBottom: 10 }}>Tüm nedenler</span>` : null}
    ${[['u', 'Plansız duruş · OEE kaybı'], ['p', 'Planlı duruş · OEE dışı']].map(([cat, l]) => { const L = REASONS.filter(r => r.active !== false && (r.cat || 'u') === cat && !sug.some(s => s.code === r.code)); return L.length ? html`<${Fragment} key=${cat}><span className="over" style=${{ display: 'block', margin: '4px 0 10px', color: cat === 'p' ? 'var(--done)' : 'var(--muted)' }}>${l}</span><div className="reasons" role="radiogroup" style=${{ marginBottom: 14 }}>${L.map(r => tile(r))}</div></${Fragment}>` : null; })}
    ${v && reasonOf(v) && reasonOf(v).team && POLICY.autoCall ? html`<small className="muted" style=${{ display: 'block', marginBottom: 8 }}>${(CALLS.find(c => c.k === reasonOf(v).team) || {}).l} ekibi ${reasonOf(v).after ? reasonOf(v).after + ' dk sonra' : 'hemen'} kendiliğinden çağrılır.</small>` : null}
    <div className="ov-f"><button className="btn lg" onClick=${onClose}>Vazgeç</button><button className="btn lg danger" disabled=${!v} onClick=${() => onSave(REASONS.find(r => r.code === v))}><${I} n="stop" s=${20} />Duruşu kaydet</button></div>
  </div></div>`;
}

export function NumOv({ value, max, onClose, onSave }) {
  const [v, setV] = useState(String(value)); const [warn, setWarn] = useState(false);
  const trySave = () => { const n = Number(v || 0); if (!warn && Math.abs(n - value) > Math.max(20, value * 0.1)) { setWarn(true); return; } onSave(n); };
  const press = k => { let n = k === 'del' ? v.slice(0, -1) : (v === '0' ? k : v + k); if (n.length > 6 || Number(n) > max) return; setV(n); };
  useEffect(() => { const k = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') trySave(); else if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass np" role="dialog" aria-label="Sayaç düzelt">
    <div style=${{ display: 'flex', alignItems: 'center' }}><span className="over">İyi parça sayısını düzelt</span><button className="iconbtn" style=${{ marginLeft: 'auto', width: 40, height: 40 }} onClick=${onClose} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
    <div className="np-d"><span className="over">adet</span><b>${fmt(Number(v || 0))}</b></div>
    ${warn ? html`<div className="suggest"><${I} n="alert" s=${20} /><div><b>Büyük değişiklik: ${fmt(value)} → ${fmt(Number(v || 0))}</b><span>Doğruysa tekrar ✓ bas.</span></div></div>` : null}
    <div className="np-k">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => html`<button key=${k} className=${k === 'ok' ? 'ok' : ''} aria-label=${k === 'del' ? 'Sil' : k === 'ok' ? 'Onayla' : k}
      onClick=${() => k === 'ok' ? trySave() : (setWarn(false), press(k))}>${k === 'del' ? html`<${I} n="back" s=${28} />` : k === 'ok' ? html`<${I} n="check" s=${30} w=${3} />` : k}</button>`)}</div>
  </div></div>`;
}
export function CallOv({ onClose, onCall }) {
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" style=${{ width: 'min(720px,100%)' }} role="dialog" aria-label="Çağrı">
    <div className="ov-h"><div><span className="over" style=${{ color: 'var(--hazard-ink)' }}>Andon çağrısı</span><h2>Kimi çağıralım?</h2><p>Çağrı ilgili ekibin ekranına ve telefonuna düşer.</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <div className="calls">${CALLS.map(c => html`<button key=${c.k} className="rs" style=${{ '--c': c.c, minHeight: 120 }} onClick=${() => onCall(c)}><span className="ic"><${I} n=${c.i} s=${26} /></span><b>${c.l}</b><code>${c.d} · ~${c.eta} dk</code></button>`)}</div>
  </div></div>`;
}
export function DoneOv({ o, onNext, onClose }) {
  const bits = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * .8, t: 2.2 + Math.random() * 1.8, c: ['var(--hazard)', 'var(--run)', 'var(--done)', 'var(--hold)'][i % 4], r: Math.random() * 360 })), []);
  return html`<${Fragment}><div className="confetti">${bits.map((b, i) => html`<i key=${i} style=${{ left: b.l + '%', background: b.c, animationDuration: b.t + 's', animationDelay: b.d + 's', transform: 'rotate(' + b.r + 'deg)' }}></i>`)}</div>
    <div className="done-ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="done-c">
      <div className="stamp"><${I} n="check" s=${110} w=${2.5} /></div>
      <span className="over" style=${{ color: 'var(--done)' }}>${o.no} · TMI'ye bildirildi</span>
      <h2>İş emri tamamlandı</h2>
      <div className="sum"><div>İyi parça<b>${fmt(o.good)}</b></div><div>Hurda<b style=${{ color: 'var(--stop)' }}>${o.scrap}</b></div><div>Kalite<b>%${(100 * o.good / (o.good + o.scrap || 1)).toFixed(1)}</b></div></div>
      <div style=${{ display: 'flex', gap: 12, marginTop: 8 }}><button className="btn lg" onClick=${onClose}>Kapat</button><button className="btn lg pri" onClick=${onNext}><${I} n="next" s=${20} />Sıradaki işe geç</button></div>
    </div></div></${Fragment}>`;
}

export const SEED_PLAN = [{"freq": "İlk parça", "crit": false, "id": 1, "x": 3005.2, "y": 1443.3, "l": "Çap", "nom": "Ø60", "tol": "+0.02 / −0.01", "min": 59.99, "max": 60.02, "tool": "Mikrometre", "gauge": false}, {"freq": "İlk parça", "crit": false, "id": 2, "x": 995.3, "y": 580.2, "l": "Çap", "nom": "Ø120", "tol": "±0.1", "min": 119.9, "max": 120.1, "tool": "Kumpas", "gauge": false}, {"freq": "Saatlik", "crit": false, "id": 3, "x": 2687.8, "y": 580.2, "l": "Uzunluk", "nom": "18", "tol": "±0.05", "min": 17.95, "max": 18.05, "tool": "Kumpas", "gauge": false}, {"freq": "Vardiya başı", "crit": false, "id": 4, "x": 2696.5, "y": 958.7, "l": "Radyus (genel tol.)", "nom": "R1", "tol": "±0.2 (ISO 2768-m)", "min": 0.8, "max": 1.2, "tool": "Radyus mastarı", "gauge": false}, {"freq": "Her 10 parça", "crit": true, "id": 5, "x": 1429.1, "y": 975.2, "l": "Çap", "nom": "Ø40 H7", "tol": "+0.025 / 0", "min": 40, "max": 40.025, "tool": "Tampon mastar", "gauge": false}, {"freq": "İlk parça", "crit": false, "id": 6, "x": 1699.6, "y": 1720.2, "l": "Çap (genel tol.)", "nom": "6× Ø16", "tol": "±0.2 (ISO 2768-m)", "min": 15.8, "max": 16.2, "tool": "Kumpas", "gauge": false}, {"freq": "Her 50 parça", "crit": false, "id": 7, "x": 295.3, "y": 1795.2, "l": "Çap", "nom": "Ø90", "tol": "±0.05", "min": 89.95, "max": 90.05, "tool": "Kumpas", "gauge": false}];
/* ══════════ v5: görev akışı, uzak mod, geri al, akıllı uyarılar, çağrı takibi, vardiya özeti ══════════ */
export let AC = null;
export function beep(kind) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const seq = { ok: [[880, .08], [1320, .12]], nok: [[300, .18], [220, .25]], due: [[660, .1], [0, .05], [660, .1], [990, .16]], call: [[520, .1], [780, .14]] }[kind] || [[700, .1]];
    let t = AC.currentTime;
    for (const [f, d] of seq) { if (f) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02); } t += d; }
  } catch (e) {}
}
export const FREQN = f => { const m = /Her (\d+) parça/.exec(f || ''); return m ? +m[1] : 0; };
export const shiftStart = now => currentShift(now).s; // vardiya tanımı: Ayarlar › Vardiyalar
/* ── Numune planı: ne zaman (başta / her N parça / her N dk / vardiya başı / sonda), kim ölçer (kalite / operatör, sırayla döngü), hangi ölçüler ── */
export const SAMP_WHEN = { first: 'İlk parça', every: 'Her N parça', time: 'Her N dakika', shift: 'Vardiya başı', last: 'Son parça' };
export const WHO = { q: { l: 'Kalite', c: 'var(--done)', i: 'target' }, op: { l: 'Operatör', c: 'var(--run)', i: 'ruler' } };
export const sampLabel = r => r.when === 'every' ? 'Her ' + r.n + ' parça' : r.when === 'time' ? 'Her ' + r.n + ' dk' : SAMP_WHEN[r.when];
export const whoAt = (r, k) => { const w = r.who && r.who.length ? r.who : ['q']; return w[((k % w.length) + w.length) % w.length]; };
/** Paketin numune planı. Eski paketlerde ölçü başına sıklıktan (freq) ve "kim ölçer" kuralından türetilir. */
export function sampOf(p) {
  if (!p) return [];
  if (p.samp && p.samp.length) return p.samp;
  const R = rulesOf(p), who = [R.q.who === 'operator' ? 'op' : 'q'], g: Record<string, any> = {};
  (p.plan || []).forEach(b => { const f = b.freq || 'İlk parça'; (g[f] = g[f] || []).push(b.id); });
  return Object.keys(g).map((f, i) => { const n = FREQN(f), r = { id: 'lg' + i, who, items: g[f] };
    if (f === 'İlk parça') return Object.assign(r, { when: 'first', gate: R.q.firstPiece });
    if (n) return Object.assign(r, { when: 'every', n });
    if (f === 'Saatlik') return Object.assign(r, { when: 'time', n: 60 });
    if (f === 'Vardiya başı') return Object.assign(r, { when: 'shift' });
    return Object.assign(r, { when: 'last' }); });
}
export const sampItems = (p, r) => (p.plan || []).filter(b => r.items === 'crit' ? b.crit : Array.isArray(r.items) ? r.items.includes(b.id) : true);
/** İlk parça onayı bekleyen ölçüler (sağlam sayım kilidi, 130 a) */
// İlk parça kapısının ölçüleri; kapının açık olup olmadığını ölçüm değil Kalite Merkezi kararı belirler (denetim #12).
export const ilkParcaKalemleri = o => o.pkg && opOf(o.pkg) === 'cnc' ? sampOf(o.pkg).filter(r => r.when === 'first' && r.gate).flatMap(r => sampItems(o.pkg, r)) : [];
export const firstGate = o => ilkParcaKalemleri(o).filter(b => !((o.meas || {})[b.id] && ((o.meas || {})[b.id].ok || (o.meas || {})[b.id].dev)));
/** Hangi kontrollerin zamanı geldi, kim ölçecek? */
export function dueControls(o, now): { due: any[]; next: any; who?: Record<string, string>; why?: Record<string, string> } {
  if (!o || !o.pkg || !o.pkg.plan) return { due: [], next: null, who: {}, why: {} };
  const meas = o.meas || {}, active = o.state === 'running' || o.state === 'setup' || o.state === 'paused', run = o.state === 'running';
  const pend = new Set(o.pendingItems || []), due = new Map(), who: Record<string, any> = {}, why: Record<string, any> = {}; let next = null;
  const add = (b, w, l) => { if (pend.has(b.id)) return; if (!due.has(b.id)) { due.set(b.id, b); who[b.id] = w; why[b.id] = l; } else if (w === 'q' && why[b.id] !== TEKRAR_OLCUM) who[b.id] = 'q'; };
  const consider = left => { if (left && (!next || (left.u === 'parça' ? left.v * (o.cycle || 30) / 60 : left.v) < (next.u === 'parça' ? next.v * (o.cycle || 30) / 60 : next.v))) next = left; };
  // reddedilen ölçü: düzeltilip yeniden ölçülene kadar sırada kalır
  for (const b of o.pkg.plan) { const m = meas[b.id]; if (m && m.ok === false && !m.dev && active) add(b, m.who === 'op' ? 'op' : 'q', TEKRAR_OLCUM); }
  for (const r of sampOf(o.pkg)) {
    const its = sampItems(o.pkg, r), L = sampLabel(r);
    if (r.when === 'first') { if (active) its.forEach(b => { const m = meas[b.id]; if (!(m && (m.ok || m.dev))) add(b, whoAt(r, 0), L); }); continue; }
    if (r.when === 'every') {
      const N = Math.max(1, r.n || 50), base = o.baseGood ?? 0, c = o.good - base, k = Math.floor(c / N);
      const open = k >= 1 ? its.filter(b => { const m = meas[b.id]; return !(m && (m.cnt ?? -1) >= base + k * N); }) : [];
      if (open.length && run) open.forEach(b => add(b, whoAt(r, k - 1), L + ' · ' + k + '. numune'));
      else if (its.length) consider({ v: N - (c % N), u: 'parça', b: its[0], who: whoAt(r, k) });
      continue;
    }
    if (r.when === 'time') {
      const M = Math.max(1, r.n || 60) * 60e3, t0 = o.startedAt; if (!t0) continue;
      const k = Math.floor((now - t0) / M), trig = t0 + k * M;
      const open = k >= 1 ? its.filter(b => { const m = meas[b.id]; return !(m && m.at >= trig); }) : [];
      if (open.length && run) open.forEach(b => add(b, whoAt(r, k - 1), L));
      else if (its.length) consider({ v: Math.max(0, Math.ceil((t0 + (k + 1) * M - now) / 60000)), u: 'dk', b: its[0], who: whoAt(r, k) });
      continue;
    }
    if (r.when === 'shift') { const ss = shiftStart(now), k = Math.floor(ss / 288e5); if (active) its.forEach(b => { const m = meas[b.id]; if (!(m && m.at >= ss)) add(b, whoAt(r, k), L); }); continue; }
    if (r.when === 'last') { if (active && o.target - o.good <= 1) its.forEach(b => { const m = meas[b.id]; if (!(m && (m.cnt ?? -1) >= o.target - 1)) add(b, whoAt(r, 0), L); }); else if (its.length) consider({ v: Math.max(0, o.target - 1 - o.good), u: 'parça', b: its[0], who: whoAt(r, 0) }); }
  }
  const list = Array.from(due.values()).sort((a, b) => (b.crit ? 1 : 0) - (a.crit ? 1 : 0));
  return { due: list, next, who, why };
}
/** `ilk`: ilk parça kapısı açık mı ve kapının tabanından bu yana kaç sağlam sayıldı (129, 130 a). */
export function nextTask(o, D, nextOrder, ilk?: { acik: boolean; yeniden?: boolean; sayilan: number; kararBekleyen?: number | null }) {
  if (!o) return null;
  const meas = o.meas || {};
  if (o.empty) return { tone: 'var(--idle)', icon: 'layers', t: 'Bu istasyonda iş yok', d: 'Hazırlıktan bu istasyona paket gönderilince burada görünür · istasyonu değiştirmek için üst çubuktaki adına dokun', quiet: true };
  const RLo = rulesOf(o.pkg), ot = opOf(o.pkg), sr = o.sr || {}, sc = stOf(o.pkg);
  if (o.state === 'running' || o.state === 'setup' || o.state === 'paused') {
    if (ot === 'boya' && sr.rack && sr.rack.stage === 'oven' && Date.now() - sr.rack.t0 >= sc.cureMin * 60000) return { tone: 'var(--hazard)', icon: 'thermo', t: 'Fırın süresi doldu', d: sr.rack.n + ' parçalık askıyı çıkar', act: 'st', btn: 'Boya paneli', pulse: true };
    if (ot === 'depo' && (sc.items || []).length && o.good >= sc.items.length) return { tone: 'var(--run)', icon: 'check', t: 'Toplama tamamlandı', d: 'Kiti teslim et ve işi bitir', act: 'finish', btn: 'Bitir' };
    if (ot === 'kalite' && (sr.insp || []).length >= sc.n) { const rej = sr.insp.filter(r => !r.ok).length, ok = rej <= sc.ac; return { tone: ok ? 'var(--run)' : 'var(--stop)', icon: ok ? 'check' : 'x', t: 'Lot kararı: ' + (ok ? 'KABUL' : 'RED'), d: rej + ' red / ' + sr.insp.length + ' numune · işi bitir', act: 'finish', btn: 'Bitir' }; }
  }
  const first = firstGate(o);
  const worn = RLo.prod.tools.find(t => o.good - ((o.toolsAt || {})[t.id] || 0) >= t.life);
  const dec = o.lastDecision;
  if (dec && dec.status === 'rejected' && !dec.ack) return { tone: 'var(--stop)', icon: 'x', t: 'Kalite RED · ' + dec.bad, d: (dec.note ? dec.note + ' · ' : '') + 'Makineyi durdur, düzelt ve yeni numune gönder', act: 'stop', btn: 'Durdur', act2: 'ack', btn2: 'Anladım', pulse: true, key: 'rej' };
  if (o.pendingReq) return { tone: 'var(--done)', icon: 'target', t: 'Numune kalitede · ' + (o.pendingItems || []).length + ' ölçü', d: 'Bekleme ' + dur((Date.now() - o.pendingAt) / 1000).slice(3) + (ilk && ilk.acik ? (ilk.yeniden ? ' · üretim uyarıyla sürer, karar gelene kadar sağlam sayılmaz' : ' · üretim sürer, sonraki sağlam parçalar karar bekler' + kararBekleyenEki(ilk)) : ' · üretim devam edebilir'), act: null, quiet: true, key: 'pend' };
  // İlk parça Başlat'tan sonra üretilir, önce sağlam sayılır sonra kaliteye gider: numune stoktan teslim edilir.
  if (ilk && ilk.acik && first.length && o.state === 'setup') return { tone: 'var(--hazard)', icon: 'wrench', t: 'Hazırlık yapılıyor', d: 'Hazırlık bitince başlat · ilk parçayı say ve kaliteye gönder', act: 'start', btn: 'Başlat' };
  if (ilk && ilk.acik && ilk.sayilan < 1 && o.state === 'running') return { tone: 'var(--hazard)', icon: 'plus', t: 'İlk parçayı say', d: 'İlk parça bitince İyi +1 · sonra kaliteye gönder', act: null, quiet: true, key: 'ilk' };
  const remainMin = kalanAdet(o.target, o.good, o.scrap) * (o.cycle || 30) / 60;
  const nxt = D.next ? 'Sıradaki kontrol: ' + D.next.b.nom + ' · ' + D.next.v + ' ' + D.next.u + ' sonra' + (D.next.who ? ' · ' + (D.next.who === 'op' ? 'sen ölçeceksin' : 'kaliteye') : '') : null;
  if (o.state === 'done') return { tone: 'var(--done)', icon: 'next', t: 'Sıradaki işe geç', d: nextOrder ? nextOrder.no + ' · ' + nextOrder.part + ' · hazırlık ' + readyCount(nextOrder) + '/4' : 'Kuyrukta iş yok', act: 'next', btn: 'Geç' };
  if (o.state === 'stopped') return { tone: 'var(--stop)', icon: 'rotate', t: 'Makine duruşta', d: 'Sorun giderildiyse yeniden başlat · yardım gerekiyorsa çağrı aç', act: 'restart', btn: 'Yeniden başlat', act2: 'call', btn2: 'Çağrı' };
  if (worn && o.state !== 'queued' && o.state !== 'done') return { tone: 'var(--stop)', icon: 'tool', t: 'Takım ömrü doldu · ' + worn.name, d: fmt(worn.life) + ' parça işlendi · takımı değiştir, ofseti doğrula', act: 'tool', btn: 'Değiştirildi', toolId: worn.id, key: 'tool:' + worn.id + ':' + ((o.toolsAt || {})[worn.id] || 0) };
  const qd = D.due.filter(b => (D.who || {})[b.id] !== 'op'), od = D.due.filter(b => (D.who || {})[b.id] === 'op');
  if (!qd.length && od.length) return { tone: od.some(x => x.crit) ? 'var(--stop)' : 'var(--run)', icon: 'ruler', t: 'Ölçüm sırası sende · ' + od.map(x => x.nom).slice(0, 3).join(', ') + (od.length > 3 ? '…' : ''), d: (od.some(x => x.crit) ? 'KRİTİK · ' : '') + (D.why[od[0].id] || '') + ' · resimde balona dokun, değeri gir · ' + od.length + ' ölçü', act: 'measure', btn: 'Ölç', id: od[0].id, pulse: true, key: 'opdue' };
  if (D.due.length) { const b = qd[0]; D = Object.assign({}, D, { due: qd }); return { tone: D.due.some(x => x.crit) ? 'var(--stop)' : 'var(--hazard)', icon: 'target', t: (first.some(x => x.id === b.id) ? 'İlk parça numunesi · ' : 'Numune zamanı · ') + D.due.map(x => x.nom).slice(0, 3).join(', ') + (D.due.length > 3 ? '…' : ''), d: (D.due.some(x => x.crit) ? 'KRİTİK · ' : '') + 'Parçayı al, kaliteye gönder · ' + D.due.length + ' ölçü', act: 'sample', btn: 'Kaliteye gönder', pulse: true, key: 'due' };
  }
  if (ilk && ilk.acik && !ilk.yeniden && ilk.sayilan > 1 && o.state === 'running') return { tone: 'var(--hazard)', icon: 'target', t: ILK_PARCA_KARAR_BEKLIYOR_ILETISI, d: 'Üretim sürer · kalite kararıyla sağlama ya da redde geçer' + kararBekleyenEki(ilk), act: null, quiet: true, key: 'kb' };
  if (o.state === 'paused') return { tone: 'var(--hold)', icon: 'play', t: 'İş duraklatıldı', d: 'Hazır olduğunda devam et' + (nxt ? ' · ' + nxt : ''), act: 'resume', btn: 'Devam et' };
  if (o.state === 'queued') return first.length ? { tone: 'var(--hazard)', icon: 'wrench', t: 'Hazırlığa başla', d: 'İlk parça Başlat\'tan sonra kaliteye gider · ' + first.length + ' ölçü', act: 'setup', btn: 'Hazırlığa geç' } : { tone: 'var(--run)', icon: 'play', t: 'İşi başlat', d: o.pkg ? 'Paket hazır · Rev ' + o.pkg.rev : 'Hazır olduğunda başlat', act: 'start', btn: 'Başlat' };
  if (o.state === 'setup') return first.length ? { tone: 'var(--hazard)', icon: 'wrench', t: 'Hazırlık yapılıyor', d: 'İlk parçayı işle, sonra kaliteye gönder', act: 'sample', btn: 'İlk parçayı gönder' } : { tone: 'var(--run)', icon: 'check', t: 'İlk parça onaylandı', d: 'Kalite onayı geldi · üretime geçebilirsin', act: 'start', btn: 'Üretime geç' };
  if (nextOrder && remainMin < 45) return { tone: 'var(--done)', icon: 'layers', t: 'Sıradaki işe hazırlan', d: nextOrder.no + ' · ' + nextOrder.part + ' · ' + Math.round(remainMin) + ' dk sonra · hazırlık ' + readyCount(nextOrder) + '/4', act: 'prepnext', btn: 'Hazırla', dismiss: true, key: 'prep' };
  return { tone: 'var(--run)', icon: 'gauge', t: 'Üretim sürüyor', d: nxt || 'Planlı kontrol yok', act: nextOrder ? 'prepnext' : null, btn: nextOrder ? 'Sonraki iş' : null, quiet: true };
}
export const READY = [{ k: 'mat', l: 'Malzeme hazır', d: 'Ham madde ve kasa makine yanında', i: 'truck' }, { k: 'tool', l: 'Takımlar hazır', d: 'Takım listesi ve ofsetler', i: 'tool' }, { k: 'prog', l: 'Program yüklendi', d: 'Program no iş paketi ile aynı', i: 'cpu' }, { k: 'draw', l: 'Resim incelendi', d: 'Revizyon ve kritik ölçüler', i: 'ruler' }];
export const readyCount = o => READY.filter(r => (o.ready || {})[r.k]).length;

export function TaskCard({ task, onAct, onDismiss }) {
  if (!task) return null;
  return html`<div key=${task.t} className=${'task glass ' + (task.pulse ? 'pulse ' : '') + (task.quiet ? 'quiet' : '')} style=${{ '--c': task.tone }}>
    <span className="tk-ic"><${I} n=${task.icon} s=${22} /></span>
    <div className="tk-tx"><span className="over">Şimdi</span><b>${task.t}</b><small>${task.d}</small></div>
    ${task.act2 ? html`<button className="btn" onClick=${() => onAct(task.act2, task)}>${task.btn2}</button>` : null}
    ${task.btn ? html`<button className="btn tk-go" onClick=${() => onAct(task.act, task)}>${task.btn}<${I} n="next" s=${16} /></button>` : null}
    ${task.dismiss ? html`<button className="tk-x" onClick=${() => onDismiss(task)} aria-label="Sonra hatırlat" title="10 dk sonra hatırlat"><${I} n="x" s=${18} /></button>` : null}
  </div>`;
}

// Büyük ekranda paketin 3B modeli: yalnız hazır veri (paketle gelen ya da önbellekteki) varsa, yavaşça dönerek.
function AwayModel({ pkg }) {
  const [v, setV] = useState(null);
  const f: any = pkg ? modelDosyasi(pkg.files, pkg.primary) : null;
  useEffect(() => {
    let alive = true; setV(null);
    if (!f || !f.bytes) return;
    processModel(f.bytes, f.name, () => {}, { need: '3d', derived: pkg.derived, cfg: pkg.readCfg, yalnizHazir: true }).then(r => { if (alive && r && r.V) setV(r); }, () => {});
    return () => { alive = false; };
  }, [pkg && pkg.id, pkg && pkg.version, f && f.name]);
  return v ? html`<div className="aw-3d"><${Step3D} data=${v.V} fa=${v.fa} theme=${null} sade=${true} /></div>` : null;
}

export function AwayView({ o, task, D, since, onWake, st }) {
  const now = useNow(1000);
  const frac = Math.min(1, o.good / o.target), satir = isSatiri(o.part, o.op), malzeme = malzemeSatiri(o.pkg, o.part);
  return html`<div className="away" onClick=${e => { e.preventDefault(); e.stopPropagation(); onWake(); }} onKeyDown=${onWake} tabIndex="0">
    <div className="aw-top"><div className="aw-l"><span className="sdot"></span><span className="aw-st">${ST[o.state].l}</span><span className="aw-t mono" title="Bu durumda geçen süre">${dur((now - since) / 1000)}</span></div><span className="aw-clock mono">${saatMetni(now)}</span><span className="aw-no mono">${o.no}${st ? ' · ' + st : ''}</span></div>
    <div className="aw-body">
      ${satir ? html`<div className="aw-part">${satir}</div>` : null}
      ${malzeme ? html`<div className="aw-mat mono">${malzeme}</div>` : null}
      <div className="aw-mid"><div className="aw-m"><${AwayModel} pkg=${o.pkg} /></div><span className="aw-num">${fmt(o.good)}</span><span className="aw-of">/ ${fmt(o.target)}</span></div>
    </div>
    <div className="aw-bar"><i style=${{ width: frac * 100 + '%' }}></i></div>
    <div className="aw-bot">
      <div><span className="over">Hurda</span><b style=${{ color: 'var(--stop)' }}>${o.scrap}</b></div>
      <div><span className="over">Kalan</span><b>${dur(Math.max(0, o.target - o.good) * (o.cycle || 30))}</b></div>
      <div><span className="over">Sıradaki kontrol</span><b>${D.due.length ? 'ŞİMDİ · ' + D.due[0].nom : D.next ? (D.next.v === 0 ? 'Üretime dönünce' : D.next.v + ' ' + D.next.u) : '—'}</b></div>
    </div>
    ${task && !task.quiet ? html`<div className="aw-task" style=${{ '--c': task.tone }}><${I} n=${task.icon} s=${34} />${task.t}</div>` : null}
    <span className="aw-hint">Dokun · normal ekrana dön</span>
  </div>`;
}

export function NextPrepOv({ o, onClose, onToggle }) {
  const r = o.ready || {}; const n = readyCount(o);
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" style=${{ width: 'min(820px,100%)' }} role="dialog" aria-label="Sonraki işe hazırlık">
    <div className="ov-h"><div><span className="over" style=${{ color: 'var(--done)' }}>Sonraki iş · ön hazırlık</span><h2>${o.no}</h2><p>${o.part} · ${o.op}${o.pkg ? ' · Rev ' + o.pkg.rev : ''} · Termin ${o.due}</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <div className="np-prog"><${MiniRing} v=${n / 4} c="var(--done)" /><div><b>${n === 4 ? 'Her şey hazır · iş bitince hemen başlayabilirsin' : 'Mevcut iş sürerken hazırla, hazırlık süresi kısalsın'}</b><small>${n}/4 tamamlandı</small></div></div>
    <div className="readyg">${READY.map(x => html`<button key=${x.k} className=${'rdy ' + (r[x.k] ? 'on' : '')} onClick=${() => onToggle(x.k)}><span className="box"><${I} n="check" s=${24} w=${3} /></span><span className="ic2"><${I} n=${x.i} s=${22} /></span><div><b>${x.l}</b><small>${x.d}</small></div></button>`)}</div>
    ${o.pkg ? html`<div className="np-files"><span className="over">Paketteki dokümanlar</span>${o.pkg.files.map(f => html`<span key=${f.name} className="chip" style=${{ '--c': f.kind === 'pdf' ? 'var(--stop)' : 'var(--run)' }}><i></i>${f.name}</span>`)}<span className="chip" style=${{ '--c': 'var(--done)' }}><i></i>${o.pkg.plan.length} kontrol · ${o.pkg.steps.length} adım</span></div>` : null}
    <div className="ov-f"><button className="btn lg pri" onClick=${onClose}>Tamam</button></div>
  </div></div>`;
}

export function ShiftOv({ st, onClose, onHandover }) {
  const [note, setNote] = useState('');
  const q = st.good + st.scrap ? (100 * st.good / (st.good + st.scrap)) : 100;
  const pct = Math.min(100, Math.round(st.good / st.goal * 100));
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card shift" role="dialog" aria-label="Vardiya özeti">
    <div className="ov-h"><div><span className="over" style=${{ color: 'var(--run)' }}>${currentShift(Date.now()).label} · ${st.machine || ''}</span><h2>${st.title || 'Vardiya özeti'}</h2><p>${st.headline}</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <div className="sh-grid">
      <div className="sh-t big"><span className="over">Üretilen</span><b>${fmt(st.good)}</b><small>iyi parça</small></div>
      <div className="sh-t"><span className="over">Kalite</span><b>%${q.toFixed(1)}</b><small>${st.scrap} hurda</small></div>
      <div className="sh-t"><span className="over">En iyi çevrim</span><b>${st.best} sn</b><small>standart ${st.std} sn</small></div>
      <div className="sh-t"><span className="over">Ölçüm</span><b>${st.mOk}/${st.mOk + st.mNok}</b><small>${st.mNok ? st.mNok + ' red · kaliteye iletildi' : 'hepsi uygun'}</small></div>
      <div className="sh-t"><span className="over">Duruş</span><b>${st.stopMin} dk</b><small>${st.stops} olay${st.topReason ? ' · en çok ' + st.topReason : ''}</small></div>
      <div className="sh-t"><span className="over">Çağrı</span><b>${st.calls}</b><small>${st.calls ? (st.callAvg ? 'ortalama varış ' + st.callAvg : 'devam ediyor') : 'çağrı yok'}</small></div>
    </div>
    <div className="sh-team"><div><span className="over">Ekip hedefi · Hücre 2</span><b>%${pct}</b></div><div className="aw-bar" style=${{ height: 12 }}><i style=${{ width: pct + '%', background: 'var(--run)' }}></i></div><small>Bireysel sıralama yok · hücre birlikte değerlendirilir</small></div>
    <label className="fld"><span className="over">Vardiya B'ye not (isteğe bağlı)</span><textarea rows="3" value=${note} onChange=${e => setNote(e.target.value)} placeholder="örn. T04 aşınmaya başladı, ilk parçayı dikkatli ölç."></textarea></label>
    <div className="ov-f"><button className="btn lg" onClick=${onClose}>Kapat</button><button className="btn lg pri" onClick=${() => onHandover(note)}><${I} n="check" s=${20} />Vardiyayı devret</button></div>
  </div></div>`;
}

export const CALL_STAGES = ['Çağrıldı', 'Alındı', 'Yolda', 'Geldi'];
export const QUICK = [{ t: 'Tamam, bekliyorum', r: null }, { t: 'Acil · makine durdu', r: 'Anlaşıldı, hızlanıyorum. 2 dakikaya oradayım.' }, { t: 'Malzeme / parça getir', r: 'Getiriyorum.' }, { t: 'Gerek kalmadı, çözüldü', r: 'Tamam, çağrıyı kapatıyorum.', close: true }];
export function CallChip({ call, onOpen }) {
  const now = useNow(1000);
  if (!call) return null;
  return html`<button className="cchip" style=${{ '--c': call.c }} onClick=${onOpen}><span className="cdot"></span><b>${call.l}</b><span>${CALL_STAGES[call.stage]}</span><span className="mono">${dur((now - call.t0) / 1000).slice(3)}</span></button>`;
}
export function CallTrackOv({ call, onClose, onReply, onEnd }) {
  const now = useNow(1000);
  return html`<div className="ov" onClick=${e => e.target === e.currentTarget && onClose()}><div className="glass ov-card" style=${{ width: 'min(760px,100%)' }} role="dialog" aria-label="Çağrı takibi">
    <div className="ov-h"><div><span className="over" style=${{ color: call.c }}>Çağrı takibi · ${dur((now - call.t0) / 1000).slice(3)}</span><h2>${call.l}${call.who ? ' · ' + call.who : ''}</h2><p>${call.d}</p></div><button className="iconbtn x" onClick=${onClose} aria-label="Kapat"><${I} n="x" /></button></div>
    <div className="ctl-line" style=${{ '--c': call.c }}>${CALL_STAGES.map((s, i) => html`<div key=${s} className=${'cst ' + (i <= call.stage ? 'on ' : '') + (i === call.stage ? 'cur' : '')}><span>${i < call.stage ? html`<${I} n="check" s=${14} w=${3} />` : i + 1}</span><b>${s}</b><small>${call.times[i] ? new Date(call.times[i]).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</small></div>`)}</div>
    <div className="chat">${call.msgs.map((m, i) => html`<div key=${i} className=${'bub ' + m.from}><span>${m.text}</span><small>${new Date(m.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>`)}</div>
    <div className="quick">${QUICK.map(q => html`<button key=${q.t} className="qr" onClick=${() => onReply(q)}>${q.t}</button>`)}</div>
    <div className="ov-f"><button className="btn lg" onClick=${onClose}>Küçült</button><button className="btn lg pri" onClick=${onEnd}><${I} n="check" s=${20} />Çözüldü · kapat</button></div>
  </div></div>`;
}

export function PreviewOv({ id, onClose }) {
  const wrap = useRef(null); const [k, setK] = useState(0.5);
  useEffect(() => { const f = () => { const el = wrap.current; if (!el) return; setK(Math.min((el.clientWidth - 40) / 1600, (el.clientHeight - 40) / 900)); }; f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return html`<div className="ov pv" onClick=${e => e.target === e.currentTarget && onClose()}>
    <div className="pv-h"><span className="over" style=${{ color: 'var(--hazard-ink)' }}>Operatör gözüyle önizleme · ${LS.get('pvStation') || ''} ekranı · kayıt yapılmaz</span><button className="btn" onClick=${onClose}><${I} n="x" s=${18} />Kapat</button></div>
    <div ref=${wrap} className="pv-stage"><div className="pv-dev" style=${{ width: 1600 * k + 24, height: 900 * k + 24 }}><iframe title="Operatör önizleme" src=${location.href.split('#')[0] + '#onizle:' + id} style=${{ width: 1600, height: 900, transform: 'scale(' + k + ')' }}></iframe></div></div>
  </div>`;
}

/* ── makine seçimi (kart #1148) ── */
export function MakineSecici({ makineler, secili, atanan, durum, onChange }) {
  if (!makineSecimiGorunur(makineler, durum)) return null;
  return html`<div className="mksec" role="group" aria-label="Çalışılacak makine">
    <span className="over">Makine</span>
    ${makineler.map(m => html`<button key=${m.id} type="button" className=${'mkchip' + (secili.includes(m.id) ? ' on' : '')} aria-pressed=${secili.includes(m.id)} title=${m.name || m.id} onClick=${() => onChange(secimiDegistir(secili, m.id))}>${m.id}</button>`)}
    <small className="mkhint">${secimOzeti(secili, atanan)}</small>
  </div>`;
}
