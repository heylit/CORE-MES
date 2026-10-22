import { Chip, Fragment, I, ST, dur, fmt, html, pad, pl, useEffect, useMemo, useNow, useRef, useState } from './temel';
import { ME, canSee, currentShift, initials, machineOf } from './ortak-ayarlar';
import { CallChip, readyCount } from './operator-parcalar';
import { Brand } from './baslat';
import { kalanMetni, vardiyaKalanDk } from '../data/operator-ozeti';
import { halkaPaylari, kalanAdet } from '../data/sayac-halkasi';
import { adimTuru } from '../data/adim-turu';
import { parcaEtiketi } from '../data/parca';
import { bitenleriAyir } from '../data/biten-is';

/* ── top bar ── */
export function Top({ state, since, theme, onTheme, onCall, call, onCallOpen, onAway, onShift, onOzetim = null, preview, machine, onStation, ozet = null }) {
  const mc = machineOf(machine);
  const now = useNow();
  const d = new Date(now);
  const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'], mons = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const lamp = state === 'stopped' ? 'r' : (state === 'paused' || state === 'setup') ? 'y' : state === 'running' ? 'g' : '';
  return html`<header className="top">
    <${Brand} />
    <span className="vsep"></span>
    <div className="mach"><div className="lamps"><i className=${'r ' + (lamp === 'r' ? 'on' : '')}></i><i className=${'y ' + (lamp === 'y' ? 'on' : '')}></i><i className=${'g ' + (lamp === 'g' ? 'on' : '')}></i></div>
      <button className="machbtn" onClick=${onStation} title="İstasyonu değiştir"><b>${mc.id}</b><small>${mc.l.split(' · ').slice(1).join(' · ')}</small></button></div>
    <div className="sbig" role="status"><span className="sdot"></span><span className="sname">${ST[state].l}</span><span className="stime">${dur((now - since) / 1000)}</span></div>
    ${preview ? html`<span className="pvbadge">ÖNİZLEME · kayıt yapılmaz</span>` : null}
    <div className="sp"></div>
    <${CallChip} call=${call} onOpen=${onCallOpen} />
    ${!preview && canSee('hazirlik') ? html`<a className="iconbtn tnav" ...${pl('hazirlik')} title="Üretim Terminali Hazırlık" aria-label="Üretim Terminali Hazırlık"><${I} n="layers" s=${22} /></a>` : null}
    ${!preview && canSee('kalite') ? html`<a className="iconbtn tnav" ...${pl('kalite')} title="Kalite ölçüm istasyonu" aria-label="Kalite ölçüm istasyonu"><${I} n="target" s=${22} /></a>` : null}
    ${onOzetim ? html`<button className="iconbtn" onClick=${onOzetim} title="Özetim" aria-label="Özetim"><${I} n="user" s=${22} /></button>` : null}
    <button className="iconbtn" onClick=${onAway} title="Uzak mod" aria-label="Uzak mod"><${I} n="expand" s=${22} /></button>
    <button className="callbtn" onClick=${onCall}><${I} n="bell" s=${22} />Çağrı</button>
    <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>${days[d.getDay()]} ${d.getDate()} ${mons[d.getMonth()]} · ${currentShift(now).tanimsiz ? 'Vardiya tanımsız' : 'Vardiya ' + currentShift(now).name}</small></div>
    <button className="iconbtn" onClick=${onTheme} aria-label="Tema değiştir"><${I} n=${theme === 'dark' ? 'sun' : 'moon'} /></button>
    <button className="op" onClick=${onShift} title="Vardiya özeti ve devir"><span className="av">${initials(ME())}</span><div><b>${ME()}</b><small>${[ozet && ozet.metin, kalanMetni(vardiyaKalanDk(currentShift(now), now))].filter(Boolean).join(' · ') || 'Vardiya özeti'} ›</small></div></button>
  </header>`;
}

/* ── queue ── */
export function MiniRing({ v, c }) {
  const r = 21, C = 2 * Math.PI * r;
  return html`<div className="ring-mini"><svg width="52" height="52"><circle cx="26" cy="26" r=${r} fill="none" stroke="var(--edge2)" strokeWidth="4" />
    <circle cx="26" cy="26" r=${r} fill="none" stroke=${c} strokeWidth="4" strokeLinecap="round" strokeDasharray=${C} strokeDashoffset=${C * (1 - v)} style=${{ transition: 'stroke-dashoffset .6s' }} /></svg><span>${Math.round(v * 100)}%</span></div>`;
}
export function Queue({ orders, active, onPick, nextNo, aheadNo = null, onScan }) {
  const kart = kuyrukKarti(active, onPick, nextNo, aheadNo), { acik, biten } = bitenleriAyir(orders);
  return html`<div className="col">
    <div className="qhead"><b>İş emirleri</b><span className="over">${orders.filter(o => o.state !== 'done').length} açık</span>${onScan ? html`<button className="qscan" onClick=${onScan} title="İş kartını okut (QR / barkod)"><${I} n="scan" s=${16} />Okut</button>` : null}</div>
    <div className="queue">${acik.map(kart)}${biten.length ? html`<div className="qsub over">Biten işler · ${biten.length}</div>` : null}${biten.map(kart)}</div>
  </div>`;
}
const kuyrukKarti = (active, onPick, nextNo, aheadNo) => ([o, i]) => html`<button key=${o.no} className=${'qc ' + (i === active ? 'sel ' : '') + (o.fresh ? 'fresh' : '')} onClick=${() => onPick(i)}>
      <${MiniRing} v=${o.good / o.target} c=${ST[o.state].c} />
      <div><div className="no">${o.no}${o.pkg ? html`<span className="revc">Rev ${o.pkg.rev}</span>` : null}${o.fresh ? html`<span className="tag newt">Yeni</span>` : null}</div><div className="pt">${o.part}${o.urgent ? html`<span className="tag urgent">Acil</span>` : null}</div>
      <div className="mt"><span>${o.op}</span><span>Termin ${o.due}</span></div>${parcaEtiketi(o.pkg) ? html`<div className="adimtur"><span className="tag adim">${parcaEtiketi(o.pkg)}</span></div>` : null}${adimTuru(o.pkg) ? html`<div className="adimtur"><span className="tag adim">${adimTuru(o.pkg).etiket}</span>${adimTuru(o.pkg).aciklama ? html`<span className="adimnot">${adimTuru(o.pkg).aciklama}</span>` : null}</div>` : null}<div style=${{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><${Chip} s=${o.state} />${o.no === nextNo ? html`<span className="chip" style=${{ '--c': 'var(--done)' }}><i></i>Sıradaki · hazırlık ${readyCount(o)}/4</span>` : null}${o.no === aheadNo ? html`<span className="chip" style=${{ '--c': 'var(--hazard)' }}><i></i>Öne alındı</span>` : null}</div></div></button>`;

/* ── dial ── */
/* ── Çevrim halkası: bir tur = bir parçanın planlı çevrim süresi (birim üretim süresi) ──
   Parça sayılınca baştan başlar; duraklatınca durur; süre aşılırsa halka sarıya döner ve gecikme yazar. */
export function CycAnim({ o, el, late }) {
  const [d0] = useState(() => -(el() / 1000)); // yalnız ilk çizimde: sonradan değişirse CSS animasyonu kayar
  const R = 158, C = 2 * Math.PI * R, st = { animationDuration: o.cycle + 's', animationDelay: d0 + 's', '--adim': Math.max(1, Math.round(o.cycle * 2)) };
  return html`<${Fragment}>
    <div className=${'sweep ' + (late ? 'late' : '')} style=${st}></div>
    <svg className="cycsvg" viewBox="0 0 440 440" aria-hidden="true">
      <circle className="cyct" cx="220" cy="220" r=${R} fill="none" strokeWidth="3" />
      <circle className=${'cyca ' + (late ? 'late' : '')} cx="220" cy="220" r=${R} fill="none" strokeWidth="3" strokeDasharray=${C} transform="rotate(-90 220 220)" style=${Object.assign({ '--C': C }, st)} />
      <g className=${'cycd ' + (late ? 'late' : '')} style=${st}><circle cx="220" cy="62" r="7" /></g>
    </svg>
  </${Fragment}>`;
}
export function CycRing({ o, cyc }) {
  useNow(500);
  if (!cyc || !(o.cycle > 0)) return null;
  const e = cyc.el(), T = o.cycle * 1000, run = o.state === 'running', late = run && e > T * 1.08, last = cyc.last();
  return html`<${Fragment}>
    <${CycAnim} key=${o.no + ':' + cyc.n()} o=${o} el=${cyc.el} late=${late} />
    <div className=${'dlabel l2 ' + (last > T * 1.08 ? 'slow' : '')} title="Son parçanın gerçek süresi (iyi ya da hurda)">Son çevrim<b>${last ? Math.round(last / 1000) + ' sn' : '—'}</b></div>
    <div className=${'dlabel r2 ' + (late ? 'late' : '') + (run ? '' : ' idle')} title="Halkanın bir turu = planlı çevrim süresi · iyi parça ya da hurda eklenince baştan başlar">${late ? 'Gecikme' : 'Çevrim'}<b>${late ? '+' + Math.round((e - T) / 1000) + ' sn' : Math.floor(e / 1000) + ' / ' + o.cycle + ' sn'}</b></div>
  </${Fragment}>`;
}
export function Dial({ o, onEdit, label, unit, cyc }) {
  const N = 120, { iyi: frac, hurda: sfrac } = halkaPaylari(o.good, o.scrap, o.target);
  const lit = Math.round(N * frac);
  const ticks = useMemo(() => Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2 - Math.PI / 2, big = i % 10 === 0, r1 = big ? 196 : 202, r2 = 214; return { i, big, x1: 220 + r1 * Math.cos(a), y1: 220 + r1 * Math.sin(a), x2: 220 + r2 * Math.cos(a), y2: 220 + r2 * Math.sin(a) }; }), []);
  const R = 180, C = 2 * Math.PI * R;
  const [k, setK] = useState(0); const prev = useRef(o.good);
  useEffect(() => { if (prev.current !== o.good) { setK(x => x + 1); prev.current = o.good; } }, [o.good]);
  const remain = kalanAdet(o.target, o.good, o.scrap);
  return html`<div className="dial">
    <svg viewBox="0 0 440 440" aria-hidden="true">
      ${ticks.map(t => html`<line key=${t.i} className=${'tk ' + (t.i < lit ? 'on ' : '') + (t.big ? 'big' : '')} x1=${t.x1} y1=${t.y1} x2=${t.x2} y2=${t.y2} />`)}
      <circle className="trk" cx="220" cy="220" r=${R} fill="none" strokeWidth="12" />
      <circle className="arc" cx="220" cy="220" r=${R} fill="none" strokeWidth="12" strokeLinecap="round" strokeDasharray=${C * frac + ' ' + C} transform="rotate(-90 220 220)" />
      ${o.scrap ? html`<circle className="scr" cx="220" cy="220" r=${R} fill="none" strokeWidth="12" strokeDasharray=${'0 ' + (C * frac + 6) + ' ' + Math.max(4, C * sfrac) + ' ' + C} transform="rotate(-90 220 220)" />` : null}
    </svg>
    <${CycRing} o=${o} cyc=${cyc} />
    <button className="core" onClick=${onEdit} title="Dokun: sayıyı düzelt" style=${{ border: 0 }}>
      <span className="over">${label || 'İyi parça'}</span>
      <span key=${k} className=${'num ' + (k ? 'bump' : '')}>${fmt(o.good)}</span>
      <span className="of">/ ${fmt(o.target)} ${unit || 'adet'}</span>
      <span className="pct">%${Math.floor((frac + sfrac) * 100)} · ${fmt(remain)} kaldı</span>
    </button>
    <div className="dlabel l">Hurda<b className="s">${o.scrap}</b></div>
    <div className="dlabel r">Kalan süre<b>${dur(remain * o.cycle)}</b></div>
  </div>`;
}

/* ── orbs ── */
export function Orb({ icon, label, c, main, hold, onGo, disabled }) {
  const [p, setP] = useState(0); const [shake, setShake] = useState(false);
  const raf = useRef(0), t0 = useRef(0), fired = useRef(false);
  const D = 1200;
  const tick = now => { const v = Math.min(1, (now - t0.current) / D); setP(v); if (v >= 1) { fired.current = true; try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} onGo(); setTimeout(() => setP(0), 300); return; } raf.current = requestAnimationFrame(tick); };
  const down = e => { if (!hold || disabled) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} fired.current = false; t0.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  const up = () => { if (!hold || fired.current) return; cancelAnimationFrame(raf.current); if (t0.current && performance.now() - t0.current < 900) { setShake(true); setTimeout(() => setShake(false), 320); if (window.__akSay) window.__akSay(label + ' için 1,2 sn basılı tut', 'alert', 'var(--hold)'); } t0.current = 0; setP(0); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const r = 50, C = 2 * Math.PI * r;
  return html`<button className=${'orb ' + (main ? 'main ' : '') + (shake ? 'shake' : '')} disabled=${disabled}
      onClick=${hold ? undefined : onGo} onPointerDown=${down} onPointerUp=${up} onPointerLeave=${up} onPointerCancel=${up} onContextMenu=${e => e.preventDefault()}
      onKeyDown=${e => { if (hold && (e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); fired.current = false; t0.current = performance.now(); raf.current = requestAnimationFrame(tick); } }}
      onKeyUp=${e => { if (hold && (e.key === ' ' || e.key === 'Enter')) up(); }}
      aria-label=${label + (hold ? ' — basılı tutun' : '')}>
    <span className="b" style=${{ '--c': c }}><${I} n=${icon} s=${main ? 46 : 32} />
      ${hold ? html`<svg className="ring" viewBox="0 0 108 108"><circle cx="54" cy="54" r=${r} strokeDasharray=${C} strokeDashoffset=${C * (1 - p)} style=${{ opacity: p > 0 ? 1 : 0 }} /></svg>` : null}</span>
    <span className="lbl">${label}</span>${hold ? html`<span className="hint">${p > 0 ? (((1 - p) * D) / 1000).toFixed(1) + ' sn' : 'Basılı tut'}</span>` : html`<span className="hint">${'\u00a0'}</span>`}
  </button>`;
}
export function Orbs({ state, act }) {
  const O = (props) => html`<${Orb} ...${props} />`;
  if (state === 'queued') return html`<div className="orbs">${O({ key: 'su', icon: 'wrench', label: 'Hazırlık', c: 'var(--hazard)', onGo: () => act('setup') })}${O({ key: 's', main: 1, icon: 'play', label: 'İşi Başlat', c: 'var(--run)', onGo: () => act('start') })}${O({ key: 'd', icon: 'ruler', label: 'Resim', c: 'var(--done)', onGo: () => act('drawing') })}</div>`;
  if (state === 'setup') return html`<div className="orbs">${O({ key: 's', main: 1, icon: 'play', label: 'Üretime Geç', c: 'var(--run)', onGo: () => act('start') })}</div>`;
  if (state === 'running') return html`<div className="orbs">${O({ key: 'x', hold: 1, icon: 'stop', label: 'Durdur', c: 'var(--stop)', onGo: () => act('stop') })}${O({ key: 'p', main: 1, icon: 'pause', label: 'Duraklat', c: 'var(--hold)', onGo: () => act('pause') })}${O({ key: 'f', hold: 1, icon: 'flag', label: 'Bitir', c: 'var(--done)', onGo: () => act('finish') })}</div>`;
  if (state === 'paused') return html`<div className="orbs">${O({ key: 'x', hold: 1, icon: 'stop', label: 'Durdur', c: 'var(--stop)', onGo: () => act('stop') })}${O({ key: 'r', main: 1, icon: 'play', label: 'Devam Et', c: 'var(--run)', onGo: () => act('resume') })}${O({ key: 'f', hold: 1, icon: 'flag', label: 'Bitir', c: 'var(--done)', onGo: () => act('finish') })}</div>`;
  if (state === 'stopped') return html`<div className="orbs">${O({ key: 'r', main: 1, icon: 'rotate', label: 'Yeniden Başlat', c: 'var(--run)', onGo: () => act('restart') })}${O({ key: 'f', hold: 1, icon: 'flag', label: 'Bitir', c: 'var(--done)', onGo: () => act('finish') })}</div>`;
  return html`<div className="orbs">${O({ key: 'n', main: 1, icon: 'next', label: 'Sıradaki İş', c: 'var(--hazard)', onGo: () => act('next') })}</div>`;
}

/* ── blueprint ── */
export function Art({ dims, uid }) {
  const cx = 260, cy = 300, pcd = 135;
  const SEC = 'M600 120 H654 V210 H726 V270 H600 Z M600 330 H726 V390 H654 V480 H600 Z';
  const A = (x, y, r, k) => html`<path key=${k} className="arw late" d="M0 0 L12 -4 L12 4 Z" transform=${'translate(' + x + ' ' + y + ') rotate(' + r + ')'} />`;
  const L = (p, k, d = 0) => html`<path key=${k} className="ln draw glow" pathLength="1" d=${p} style=${{ animationDelay: d + 's' }} />`;
  const circ = (r, x = cx, y = cy) => 'M' + (x + r) + ' ' + y + ' A' + r + ' ' + r + ' 0 1 1 ' + (x - r) + ' ' + y + ' A' + r + ' ' + r + ' 0 1 1 ' + (x + r) + ' ' + y;
  const holes = [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 6 + i * Math.PI / 3; return L(circ(16, cx + pcd * Math.cos(a), cy + pcd * Math.sin(a)), 'h' + i, .5 + i * .08); });
  const hatch = Array.from({ length: 40 }, (_, t) => { const x0 = 560 + t * 12; return html`<line key=${t} className="hatch" x1=${x0} y1="480" x2=${x0 + 360} y2="120" />`; });
  return html`<${Fragment}>
    <g className="late"><line className="ctr" x1=${cx - 215} y1=${cy} x2=${cx + 215} y2=${cy} /><line className="ctr" x1=${cx} y1=${cy - 215} x2=${cx} y2=${cy + 215} />
      <circle className="ctr" cx=${cx} cy=${cy} r=${pcd} /><line className="ctr" x1="580" y1="300" x2="750" y2="300" /><circle className="hid" cx=${cx} cy=${cy} r="66" /></g>
    ${L(circ(180), 'o', 0)}${L(circ(90), 'm', .2)}${L(circ(60), 'b', .35)}${holes}
    <defs><clipPath id=${uid}><path d=${SEC} /></clipPath></defs>
    <g clipPath=${'url(#' + uid + ')'} className="late">${hatch}</g>
    ${L(SEC, 'sec', .3)}
    <text className="tbt late" x="200" y="585">ÖN GÖRÜNÜŞ 1:1</text><text className="tbt late" x="620" y="585">KESİT A–A 1:1</text>
    ${dims ? html`<g className="late">
      <line className="dim" x1="80" y1="300" x2="80" y2="92" /><line className="dim" x1="440" y1="300" x2="440" y2="92" /><line className="dim" x1="80" y1="100" x2="440" y2="100" />${A(80, 100, 0, 1)}${A(440, 100, 180, 2)}
      <text className="dimt" x="215" y="92">Ø120 ±0.10</text>
      <path className="dim" d=${'M' + (cx + 42) + ' ' + (cy - 42) + ' L370 200 L470 200'} />${A(cx + 42, cy - 42, 225, 3)}<text className="dimt" x="378" y="192">Ø40 H7</text>
      <path className="dim" d=${'M' + (cx + 95) + ' ' + (cy + 95) + ' L380 450 L500 450'} /><text className="dimt" x="384" y="442">6× Ø16 · PCD Ø90</text>
      <line className="dim" x1="600" y1="120" x2="600" y2="96" /><line className="dim" x1="654" y1="120" x2="654" y2="96" /><line className="dim" x1="600" y1="104" x2="654" y2="104" />${A(600, 104, 0, 4)}${A(654, 104, 180, 5)}
      <text className="dimt" x="664" y="109">18 ±0.05</text>
      <line className="dim" x1="600" y1="480" x2="600" y2="520" /><line className="dim" x1="726" y1="390" x2="726" y2="520" /><line className="dim" x1="600" y1="512" x2="726" y2="512" />${A(600, 512, 0, 6)}${A(726, 512, 180, 7)}
      <text className="dimt" x="735" y="517">42 ±0.10</text>
      <line className="dim" x1="770" y1="210" x2="770" y2="390" />${A(770, 210, 90, 8)}${A(770, 390, 270, 9)}<line className="dim" x1="726" y1="210" x2="778" y2="210" /><line className="dim" x1="726" y1="390" x2="778" y2="390" />
      <text className="dimt" x="782" y="305">Ø60</text></g>` : null}
    <g className="late"><rect className="tb" x="20" y="20" width="960" height="600" rx="6" /><rect className="tb" x="800" y="470" width="180" height="150" />
      <line className="tb" x1="800" y1="520" x2="980" y2="520" /><line className="tb" x1="800" y1="570" x2="980" y2="570" /><line className="tb" x1="890" y1="570" x2="890" y2="620" />
      <text className="tbt" x="810" y="487">PARÇA</text><text className="tbv" x="810" y="509">FLN-120 Flanş</text>
      <text className="tbt" x="810" y="537">MALZEME</text><text className="tbv" x="810" y="559">S355J2</text>
      <text className="tbt" x="810" y="587">REV</text><text className="tbv" x="810" y="609">C</text><text className="tbt" x="900" y="587">PAFTA</text><text className="tbv" x="900" y="609">1/2</text></g>
  </${Fragment}>`;
}
