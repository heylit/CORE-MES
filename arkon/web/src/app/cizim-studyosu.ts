import type { Pkg } from '@shared/model';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../data/cakisma';
import { AKStore } from '../data/store';
import { cizimSilinir } from '../data/cizim-silme';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../data/gonderim-hatasi';
import { MERKEZDEN_EKLENIR, merkezDosyasiniKoy } from '../data/cizim-merkezi';
import { MerkezRozeti, MerkezSecici, merkezVar, useMerkezUyarilari } from './cizim-merkezi';
import { Fragment, I, fmt, html, pad, pl, useCallback, useEffect, useMemo, useNow, useState } from './temel';
import { LS } from './yukleyici';
import { RCFG, cfgFix, setRCFG } from './pdf';
import { fold } from './pdf-okuma';
import { BlueprintM } from './teknik-resim';
import { Sw } from './kurallar';
import { Bus, DB, seedIfEmpty } from './hazirlik';
import { Brand, useMob, useTheme } from './baslat';

/* ── Çizim stüdyosu (#cizim): PDF ve 3B okuma ayarlarını dene, tanı katmanıyla önizle, sisteme ya da pakete uygula ── */
export const ZCLS = { dim: ['Ölçü', 'var(--run)'], table: ['Antet / tablo', 'var(--hold)'], border: ['Pafta kenarı', 'var(--muted)'], notes: ['Not', '#c58bff'], prose: ['Açıklama', '#ff8fb0'], stack: ['Üst üste', 'var(--muted)'], none: ['Ölçü değil', 'var(--stop)'] };
export function LabSeg({ v, set, opts }) {
  return html`<div className="segs labseg">${opts.map(([k, l]) => html`<button key=${String(k)} className=${'seg ' + (String(v) === String(k) ? 'on' : '')} onClick=${() => set(k)}>${l}</button>`)}</div>`;
}
export function LabRow({ l, d, children }) {
  return html`<div className="labrow"><div><b>${l}</b>${d ? html`<small>${d}</small>` : null}</div>${children}</div>`;
}
export function LabTop({ theme, onTheme }) {
  const now = useNow(30000), d = new Date(now);
  return html`<header className="top">
    <${Brand} />
    <span className="vsep"></span>
    <div className="sbig prepmode" style=${{ '--sig': '#c58bff', color: '#c58bff' }}><${I} n="lab" s=${20} /><span className="sname" style=${{ color: '#c58bff' }}>Çizim stüdyosu</span></div>
    <div className="sp"></div>
    <a className="callbtn tnav" ...${pl('hazirlik')}><${I} n="layers" s=${20} />Üretim Terminali Hazırlık</a>
    <a className="iconbtn tnav" ...${pl('')} title="Operatör ekranı"><${I} n="gauge" s=${22} /></a>
    <div className="clock"><b>${pad(d.getHours())}:${pad(d.getMinutes())}</b><small>PDF · 3B okuma</small></div>
    <button className="iconbtn" onClick=${onTheme} aria-label="Tema değiştir"><${I} n=${theme === 'dark' ? 'sun' : 'moon'} /></button>
  </header>`;
}
/** Çizim stüdyosu çalışması: PDF + 3B model birlikte (iş paketindeki gibi), ayarlar ve balonlar. Kaydedilince Üretim Terminali Hazırlık › Dokümanlar'da kullanılır. */
export const W0 = (): any => ({ id: 'dr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: '', files: [], primary: null, bal: [], rev: Date.now(), saved: false });
export const fileKindOf = n => /\.pdf$/i.test(n) ? 'pdf' : 'model';
export const dkLabel = f => f.kind === 'pdf' ? 'PDF' : f.name.split('.').pop().toUpperCase().slice(0, 4);
/** Bir dosyayı çalışmaya koyar: aynı türden olanın yerine geçer. PDF varsa ana resim PDF'tir. */
export function wAdd(w, f) {
  const files = w.files.filter(x => x.kind !== f.kind).concat([f]);
  const primary = f.kind === 'pdf' ? f.name : (w.primary && files.some(x => x.name === w.primary) ? w.primary : f.name);
  return Object.assign({}, w, { files, primary, bal: primary !== w.primary ? [] : w.bal, rev: Date.now(), saved: false, name: w.name || f.name.replace(/\.[^.]+$/, '') });
}
export function DrawLabApp() {
  const mob = useMob();
  const [theme, setTheme] = useTheme();
  const [cfg, setCfg] = useState(() => cfgFix(RCFG)), [applied, setApplied] = useState(() => cfgFix(RCFG));
  const [w, setW] = useState(W0), [open, setOpen] = useState(null), [info, setInfo] = useState(null), [lv, setLv] = useState('files');
  const [tab, setTab] = useState('pdf'), [q, setQ] = useState(''), [meas, setMeas] = useState<Record<string, any>>({});
  const [ov, setOv] = useState({ dim: true, table: true, border: true, notes: true, prose: true, stack: false, none: true, zones: true, ocr: true });
  const [draws, setDraws] = useState([]), [pkgs, setPkgs] = useState([]), [pkgId, setPkgId] = useState(''), [send, setSend] = useState(null);
  const [toast, setToast] = useState(null);
  const say = useCallback((m, i = 'check', c = 'var(--done)') => setToast({ m, i, c, k: Date.now() }), []);
  useEffect(() => { const f = (e: any) => say((e.detail && e.detail.msg) || CAKISMA_ILETISI, 'alert', 'var(--hold)'); window.addEventListener(CAKISMA_OLAYI, f); return () => window.removeEventListener(CAKISMA_OLAYI, f); }, [say]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); document.documentElement.setAttribute('data-state', 'done'); document.title = 'Üretim Hazırlık · Çizim stüdyosu'; }, [theme]);
  const loadAll = async () => { await seedIfEmpty(); const ps = (await DB.all('pkgs')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); setPkgs(ps); setDraws((await DB.all('draws')).sort((a, b) => b.updatedAt - a.updatedAt)); return ps; };
  // Hazırlıktan "Çizim stüdyosunda düzenle" ile gelindiyse paketi aç
  useEffect(() => { loadAll().then(ps => { const j = LS.get('labOpen'); LS.set('labOpen', null); const p = j && ps.find(x => x.id === j.pkg); if (p) loadPkg(p); else if (ps[0]) setPkgId(ps[0].id); }); }, []);
  const up = (k, v) => setCfg(c => cfgFix(Object.assign({}, c, { [k]: v })));
  const upEx = (k, v) => setCfg(c => cfgFix(Object.assign({}, c, { ex: Object.assign({}, c.ex, { [k]: v }) })));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(applied);
  const pdfF = w.files.find(f => f.kind === 'pdf'), mdlF = w.files.find(f => f.kind === 'model');
  const fresh = () => { setInfo(null); setMeas({}); setOpen(null); if (mob) setLv('view'); };
  // Çizim Merkezi (kart #800): çalışmaya eklenir; aynı belgenin yeni revizyonu aynı dosya kaydının yerine geçer.
  const [mSec, setMSec] = useState(false), [mBusy, setMBusy] = useState(false);
  const mUyari = useMerkezUyarilari(w.files);
  useEffect(() => { const f = (e: any) => say(KAYIT_GITMEDI + ' · ' + ((e.detail && e.detail.msg) || ''), 'alert', 'var(--stop)'); window.addEventListener(KAYIT_REDDI_OLAYI, f); return () => window.removeEventListener(KAYIT_REDDI_OLAYI, f); }, []);
  const merkezdenAl = async (belgeId, guncelleme) => {
    setMBusy(true);
    try {
      const f = await AKStore.Server.merkezdenAl(belgeId);
      setW(o => { const r = merkezDosyasiniKoy(o, f); return Object.assign({}, o, { files: r.files, primary: r.primary, bal: r.planSifirla ? [] : o.bal, rev: Date.now(), saved: false, name: o.name || f.name.replace(/\.[^.]+$/, '') }); });
      fresh(); setTab(f.kind === 'pdf' ? 'pdf' : '3d'); setMSec(false);
      say(f.name + (guncelleme ? ' güncellendi' : ' Çizim Merkezi’nden eklendi'), 'upload', 'var(--run)');
    } catch (e) { say('Çizim Merkezi’nden alınamadı: ' + (e.message || e), 'alert', 'var(--stop)'); }
    setMBusy(false);
  };
  const rmFile = kind => { setW(o => { const files = o.files.filter(x => x.kind !== kind), primary = files.some(x => x.name === o.primary) ? o.primary : (files[0] && files[0].name) || null; return Object.assign({}, o, { files, primary, bal: primary !== o.primary ? [] : o.bal, rev: Date.now(), saved: false }); }); fresh(); };
  const setPrimary = name => { setW(o => o.primary === name ? o : Object.assign({}, o, { primary: name, bal: [], rev: Date.now(), saved: false })); fresh(); };
  const loadDraw = d => { setW(Object.assign({}, d, { rev: Date.now(), saved: true })); if (d.cfg) { setCfg(cfgFix(d.cfg)); setApplied(cfgFix(d.cfg)); } fresh(); };
  const loadPkg = p => { setW(Object.assign(W0(), { name: p.partNo || p.part || p.no, files: (p.files || []).map(f => Object.assign({}, f)), primary: p.primary, bal: (p.plan || []).map(b => Object.assign({}, b)), from: p.id })); if (p.readCfg) { setCfg(cfgFix(p.readCfg)); setApplied(cfgFix(p.readCfg)); } setPkgId(p.id); fresh(); };
  const newWork = () => { setW(W0()); fresh(); if (mob) setLv('files'); };
  const saveDraw = async () => {
    if (!w.files.length) return;
    const d = { id: w.id, name: (w.name || w.primary || 'Çizim').trim(), files: w.files, primary: w.primary, bal: w.bal, cfg: cfgFix(applied), updatedAt: Date.now() };
    await DB.put('draws', d); setW(o => Object.assign({}, o, { saved: true, name: d.name })); setDraws(ds => [d].concat(ds.filter(x => x.id !== d.id))); loadAll();
    say('“' + d.name + '” kaydedildi · Üretim Terminali Hazırlık › Dokümanlar\'da hazır', 'check', 'var(--run)');
  };
  const delDraw = async d => { await DB.del('draws', d.id); await loadAll(); say('“' + d.name + '” silindi', 'trash', 'var(--stop)'); };
  const apply = fr => { setApplied(cfg); setInfo(null); setMeas({}); setW(o => Object.assign({}, o, { bal: [], saved: false })); const f = w.files.find(x => x.name === w.primary); if (f) setOpen({ bytes: f.bytes, name: f.name, n: Date.now(), fresh: !!fr }); };
  const onLab = useCallback(d => setInfo(o => Object.assign({}, o, d, { at: Date.now() })), []);
  const setBal = useCallback(nb => setW(o => Object.assign({}, o, { bal: typeof nb === 'function' ? nb(o.bal) : nb, saved: false })), []);
  const segs = (info && info.diag && info.diag.segs) || [], osegs = (info && info.ocrDiag && info.ocrDiag.segs) || [];
  const overlay = useCallback((doc, U) => {
    if (tab !== 'diag' || !info || doc.kind !== 'pdf' || !info.C || info.C.w !== doc.w) return null; // renkli kutular yalnız Tanı sekmesinde
    const one = (s, i, ocr) => { if (!ov[s.z] || (ocr && !ov.ocr)) return null; const c = (ZCLS[s.z] || ZCLS.none)[1]; return html`<g key=${(ocr ? 'o' : 't') + i} transform=${'translate(' + s.x.toFixed(1) + ' ' + s.y.toFixed(1) + ') rotate(' + (s.a * 180 / Math.PI).toFixed(1) + ')'}><rect className=${'dgr ' + (ocr ? 'ocr' : '')} x=${-s.w / 2 - s.h * 0.35} y=${-s.h * 0.95} width=${s.w + s.h * 0.7} height=${s.h * 1.6} rx=${s.h * 0.2} style=${{ stroke: c }}><title>${(ocr ? 'OCR · ' : '') + (ZCLS[s.z] || ZCLS.none)[0] + ' · ' + s.t}</title></rect></g>`; };
    const zones = ov.zones ? ((info.diag && info.diag.zones) || []).concat((info.ocrDiag && info.ocrDiag.zones) || []).map((z, i) => html`<rect key=${'z' + i} className="dgz" x=${z.x0} y=${z.y0} width=${z.x1 - z.x0} height=${z.y1 - z.y0} style=${{ stroke: (ZCLS[z.why] || ZCLS.none)[1] }} />`) : null;
    return html`<g className="labov">${zones}${segs.map((s, i) => one(s, i, false))}${osegs.map((s, i) => one(s, i, true))}</g>`;
  }, [info, ov, tab]);
  const ctl = useMemo(() => ({ key: 'lab:' + w.rev, lab: onLab, cfg: applied, open, files: w.files, primary: w.primary, bal: w.bal, setBal, meas, setMeas, overlay }), [applied, open, w.rev, w.files, w.primary, w.bal, meas, overlay]);
  const doSend = async () => {
    const p = pkgs.find(x => x.id === pkgId); if (!p || !send) return;
    const ch: Partial<Pkg> = { dirty: true, updatedAt: Date.now() };
    if (send.files && w.files.length) { ch.files = w.files.map(f => Object.assign({}, f)); ch.primary = w.primary; if (!send.plan && p.primary !== w.primary) ch.plan = []; ch.partNo = p.partNo || (w.name || '').trim(); }
    if (send.cfg) ch.readCfg = cfgFix(applied);
    if (send.plan) ch.plan = w.bal.map((b, i) => Object.assign({ freq: 'İlk parça', crit: false }, (p.plan || []).find(x => x.nom === b.nom && x.id === b.id) || {}, b));
    await DB.put('pkgs', Object.assign({}, p, ch)); Bus.send({ type: 'pkg-draft', id: p.id }); await loadAll(); setSend(null);
    say(p.no + ' paketine aktarıldı · Hazırlıkta yayınlayınca operatöre gider', 'check', 'var(--run)');
  };
  const useAll = () => { setRCFG(cfg); say('Ayarlar bu cihazda tüm ekranlarda kullanılacak', 'check', 'var(--run)'); };
  const reset = () => setCfg(cfgFix({}));
  const C = info && info.C, S = (info && info.dims && info.dims.stats) || {}, M = info && info.model;
  const nz = z => segs.filter(s => s.z === z).length + osegs.filter(s => s.z === z).length;
  const list = segs.map(s => Object.assign({ src: 'PDF' }, s)).concat(osegs.map(s => Object.assign({ src: 'OCR' }, s))).filter(s => !q || fold(s.t).indexOf(fold(q)) >= 0);
  const curPkg = pkgs.find(x => x.id === pkgId);

  const pdfSet = html`<${Fragment}>
    <span className="over">Görüntü</span>
    <${LabRow} l="Çizim çözünürlüğü" d="Uzun kenar piksel · keskinlik ↔ hız/bellek"><${LabSeg} v=${cfg.res} set=${v => up('res', v)} opts=${[[3000, 'Hızlı'], [4200, 'Normal'], [6000, 'Keskin']]} /></${LabRow}>
    <${LabRow} l="Çizgi kalınlaştırma" d="İnce CAD çizgileri ekranda kaybolmasın"><${LabSeg} v=${cfg.bold} set=${v => up('bold', v)} opts=${[[0, 'Yok'], [1, 'Hafif'], [2, 'Kalın']]} /></${LabRow}>
    <${LabRow} l="Renk" d="Net: yüksek kontrast · Mavi: teknik resim görünümü · Orijinal: PDF'in kendi renkleri"><${LabSeg} v=${cfg.look} set=${v => up('look', v)} opts=${[['net', 'Net'], ['blue', 'Mavi'], ['orig', 'Orijinal']]} /></${LabRow}>
    <span className="over">Görüntüden okuma (OCR)</span>
    <${LabRow} l="OCR" d="Otomatik: metin katmanı yoksa ya da ölçüler çizgiye dönmüşse"><${LabSeg} v=${cfg.ocr} set=${v => up('ocr', v)} opts=${[['auto', 'Otomatik'], ['always', 'Her zaman'], ['off', 'Kapalı']]} /></${LabRow}>
    <${LabRow} l="OCR keskinliği" d="Büyük paftada (A2–A0) karo karo yüksek çözünürlük"><${LabSeg} v=${cfg.dpi} set=${v => up('dpi', v)} opts=${[[2.4, 'Hızlı'], [3.2, 'Normal'], [4.2, 'İnce yazı']]} /></${LabRow}>
    <${LabRow} l="Otomatik OCR eşiği" d="Metinden bundan az ölçü çıkarsa görüntüden tamamla"><${LabSeg} v=${cfg.minDims} set=${v => up('minDims', v)} opts=${[[1, '1'], [3, '3'], [6, '6'], [12, '12']]} /></${LabRow}>
    <span className="over">Ayıklama · ölçü sayılmayacak yazılar</span>
    <div className="labsw">${[['table', 'Antet ve tablolar', 'Malzeme, revizyon, parça listesi'], ['border', 'Pafta kenarı', 'Kenardaki A–F / 1–8 kare harfleri'], ['notes', 'Notlar', '"NOTLAR" başlığı altındaki satırlar'], ['prose', 'Açıklama cümleleri', 'Uzun yazılar']].map(([k, l, d]) => html`<${Sw} key=${k} on=${cfg.ex[k]} onChange=${v => upEx(k, v)} l=${l} d=${d} />`)}</div>
    <span className="over">Öneri listesi ve balonlar</span>
    <${LabRow} l="Otomatik işaretle" d="Hangi güven seviyesi seçili gelsin"><${LabSeg} v=${cfg.auto} set=${v => up('auto', v)} opts=${[['high', 'Yüksek'], ['mid', '+ Kontrol et'], ['low', 'Hepsi']]} /></${LabRow}>
    <${LabRow} l="Balon boyutu"><${LabSeg} v=${cfg.balS} set=${v => up('balS', v)} opts=${[[0.8, 'S'], [1, 'M'], [1.25, 'L'], [1.5, 'XL']]} /></${LabRow}>
  </${Fragment}>`;
  const m3Set = html`<${Fragment}>
    <span className="over">Model işleme</span>
    <${LabRow} l="Ağ kalitesi" d="Üçgenleme sıklığı · eğrisel yüzeylerin pürüzsüzlüğü"><${LabSeg} v=${cfg.mesh} set=${v => up('mesh', v)} opts=${[['coarse', 'Kaba'], ['normal', 'Normal'], ['fine', 'İnce']]} /></${LabRow}>
    <${LabRow} l="Ön görünüş ekseni" d="Otomatik: delik/mil eksenine göre"><${LabSeg} v=${cfg.fa} set=${v => up('fa', v)} opts=${[['auto', 'Otomatik'], ['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]} /></${LabRow}>
    <div className="labsw"><${Sw} on=${cfg.hidden} onChange=${v => up('hidden', v)} l="Gizli çizgiler" d="Arkada kalan kenarlar kesikli çizilir" /><${Sw} on=${cfg.autoDim} onChange=${v => up('autoDim', v)} l="Otomatik ölçülendirme" d="Çaplar, delik grupları, PCD, kademe boyları" /></div>
    <span className="over">Balonlar</span>
    <${LabRow} l="Balon boyutu"><${LabSeg} v=${cfg.balS} set=${v => up('balS', v)} opts=${[[0.8, 'S'], [1, 'M'], [1.25, 'L'], [1.5, 'XL']]} /></${LabRow}>
  </${Fragment}>`;
  const stat = (l, v, c?) => html`<div className="lst"><span>${l}</span><b style=${c ? { color: c } : null}>${v}</b></div>`;
  const diagView = html`<${Fragment}>
    ${!info ? html`<p className="muted">Bir dosya aç; okuma sonuçları, süreler ve ham yazılar burada görünür.</p>` : null}
    ${C ? html`<${Fragment}>
      <div className="lstats">
        ${stat('Sayfa', C.w + '×' + C.h + ' px')}${stat('Ölçek', C.scale.toFixed(2) + ' px/pt')}
        ${stat('PDF yazısı', C.items.length + (C.junk ? ' · bozuk font' : ''), C.junk ? 'var(--stop)' : null)}${stat('Metin katmanı', C.textless ? 'yok' : 'var', C.textless ? 'var(--hold)' : 'var(--run)')}
        ${stat('OCR', info.needOcr ? (C.ocrDims ? C.ocrDims.length + ' ölçü' : 'çalıştı') : 'gerekmedi', info.needOcr ? 'var(--done)' : null)}${stat('Bulunan', (info.dims || []).length + ' ölçü', 'var(--run)')}
        ${stat('Yüksek / kontrol / düşük', (S.high || 0) + ' / ' + (S.mid || 0) + ' / ' + (S.low || 0))}${stat('Elenen', (S.table || 0) + (S.border || 0) + (S.notes || 0) + (S.prose || 0) + ' yazı')}
        ${C.ms ? html`${stat('Çizim', (C.ms.render || 0) + ' ms')}${stat('Ölçü ayıklama', (C.ms.dims || 0) + ' ms')}${C.ms.ocr ? stat('OCR', (C.ms.ocr / 1000).toFixed(1) + ' sn') : null}` : html`${stat('Kaynak', 'önbellek')}`}
      </div>
      <span className="over">Katmanlar · bu sekme açıkken resimde renkli çerçeveler</span>
      <div className="lchips">${Object.keys(ZCLS).map(k => html`<button key=${k} className=${'lchip ' + (ov[k] ? 'on' : '')} style=${{ '--c': ZCLS[k][1] }} onClick=${() => setOv(Object.assign({}, ov, { [k]: !ov[k] }))}><i></i>${ZCLS[k][0]}<b>${nz(k)}</b></button>`)}
        <button className=${'lchip ' + (ov.zones ? 'on' : '')} style=${{ '--c': 'var(--hold)' }} onClick=${() => setOv(Object.assign({}, ov, { zones: !ov.zones }))}><i></i>Bölgeler</button>
        ${osegs.length ? html`<button className=${'lchip ' + (ov.ocr ? 'on' : '')} style=${{ '--c': 'var(--done)' }} onClick=${() => setOv(Object.assign({}, ov, { ocr: !ov.ocr }))}><i></i>OCR yazıları<b>${osegs.length}</b></button>` : null}</div>
      <span className="over">Ham yazılar · ${list.length}</span>
      <input className="lq" placeholder="Ara: Ø25, H7, malzeme…" value=${q} onChange=${e => setQ(e.target.value)} />
      <div className="lraw">${list.slice(0, 400).map((s, i) => html`<div key=${i} className="lrw"><i style=${{ background: (ZCLS[s.z] || ZCLS.none)[1] }}></i><span className="mono">${s.t}</span><small>${s.src} · ${(ZCLS[s.z] || ZCLS.none)[0]}</small></div>`)}</div>
    </${Fragment}>` : null}
    ${M ? html`<div className="lstats">
      ${stat('Biçim', M.kind)}${stat('Süre', info.ms + ' ms' + (info.ms < 400 ? ' · önbellek' : ''))}
      ${M.D ? html`${stat('Ölçek', M.D.info.scale)}${stat('Boyut', M.D.info.size.join(' × ') + ' mm')}${stat('Üçgen', fmt(M.D.info.tris))}${stat('Kenar', fmt(M.D.info.edges))}${stat('Silindir', M.D.info.cylinders)}${stat('Delik', M.D.info.holes)}${stat('Ön eksen', M.D.info.frontAxis)}${stat('Ölçü önerisi', M.D.balloons.length, 'var(--run)')}` : null}
    </div>` : null}
  </${Fragment}>`;

  const slot = (kind, f, label, icon?) => html`<div className=${'wslot ' + (f ? 'on' : '')}><span className=${'dk ' + (kind === 'pdf' ? 'pdf' : 'step')}>${kind === 'pdf' ? 'PDF' : '3B'}</span><div><b>${f ? f.name : label}</b><span>${f ? (f.bytes.length / 1024).toFixed(0) + ' KB' + (w.files.length > 1 && w.primary === f.name ? ' · ana resim' : '') : kind === 'pdf' ? 'Teknik resim · isteğe bağlı' : 'STEP / IGES / STL · isteğe bağlı'}</span>${f ? html`<${MerkezRozeti} f=${f} uyari=${mUyari} mesgul=${mBusy} onGuncelle=${g => merkezdenAl(g.merkez, true)} />` : null}</div>${f ? html`<button className="x" onClick=${() => rmFile(kind)} aria-label="Çıkar"><${I} n="x" s=${16} /></button>` : null}</div>`;
  return html`<${Fragment}>
    <div className="aura"></div><div className="gridbg"></div><div className="grain"></div>
    <div className="app">
      <${LabTop} theme=${theme} onTheme=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      <main className="labmain">
        ${mob ? html`<div className="segs mseg">${[['files', 'Dosya'], ['view', 'Önizleme'], ['set', 'Ayarlar']].map(([k, l]) => html`<button key=${k} className=${'seg ' + (lv === k ? 'on' : '')} onClick=${() => setLv(k)}>${l}</button>`)}</div>` : null}
        <aside className="col labfiles glass" style=${mob && lv !== 'files' ? { display: 'none' } : null}>
          <div className="wcard">
            <div className="wh"><span className="over">Çalışma</span>${w.saved ? html`<span className="chip" style=${{ '--c': 'var(--run)' }}><i></i>Kayıtlı</span>` : w.files.length ? html`<span className="chip" style=${{ '--c': 'var(--hold)' }}><i></i>Kaydedilmedi</span>` : null}<button className="lnk" onClick=${newWork}>Yeni</button></div>
            <input className="lq wname" placeholder="Çizim adı · örn. GVD-340 Rev C" value=${w.name} onChange=${e => setW(Object.assign({}, w, { name: e.target.value, saved: false }))} />
            ${slot('pdf', pdfF, 'PDF eklenmedi')}${slot('model', mdlF, '3B model eklenmedi')}
            ${pdfF && mdlF ? html`<div className="segs labseg">${[[pdfF.name, 'Ana resim: PDF'], [mdlF.name, 'Modelden üret']].map(([n, l]) => html`<button key=${n} className=${'seg ' + (w.primary === n ? 'on' : '')} onClick=${() => setPrimary(n)}>${l}</button>`)}</div>` : null}
            <div style=${{ display: 'flex', gap: 8 }}>
              <button className="btn pri" style=${{ flex: 1 }} disabled=${!w.files.length} onClick=${saveDraw}><${I} n="check" s=${18} />Kaydet</button>
            </div>
            ${merkezVar() ? html`<button className="btn" onClick=${() => setMSec(true)}><${I} n="layers" s=${18} />Çizim Merkezi’nden ekle</button>` : null}
            ${mSec ? html`<${MerkezSecici} onPick=${b => merkezdenAl(b.id, false)} onClose=${() => setMSec(false)} />` : null}
            <small className="muted">${MERKEZDEN_EKLENIR} · balonlar ve ayarlar da kaydedilir</small>
          </div>
          ${draws.length ? html`<span className="over">Kayıtlı çizimler · ${draws.length}</span>${draws.map(d => html`<div key=${d.id} className=${'docrow drow ' + (w.id === d.id ? 'cur' : '')} role="button" tabIndex="0" onClick=${() => loadDraw(d)}><span className="dk lab"><${I} n="lab" s=${18} /></span><div><b>${d.name}</b><span>${d.files.map(dkLabel).join(' + ')}${d.bal && d.bal.length ? ' · ' + d.bal.length + ' balon' : ''}</span></div>${cizimSilinir((AKStore.Auth.current() || {}).role) ? html`<button className="x" onClick=${e => { e.stopPropagation(); delDraw(d); }} aria-label="Sil"><${I} n="trash" s=${15} /></button>` : null}</div>`)}` : null}
          ${pkgs.some(p => p.files && p.files.length) ? html`<span className="over">İş paketlerinden</span>${pkgs.filter(p => p.files && p.files.length).slice(0, 10).map(p => html`<button key=${p.id} className=${'docrow ' + (w.from === p.id ? 'cur' : '')} onClick=${() => loadPkg(p)}><span className="dk pk">${p.files.map(f => f.kind === 'pdf' ? 'PDF' : '3B').join('+')}</span><div><b>${p.no}</b><span>${p.part}${p.readCfg ? ' · özel ayar' : ''}</span></div></button>`)}` : null}
        </aside>
        <section className="labdraw" style=${mob && lv !== 'view' ? { display: 'none' } : null}>
          ${w.files.length ? html`<${BlueprintM} say=${say} theme=${theme} ctl=${ctl} />` : html`<div className="glass empty"><${I} n="lab" s=${44} /><b>Çizim stüdyosu</b><small className="muted">Soldan Çizim Merkezi'nden PDF'i ve 3B modeli ekle (ikisi birlikte de olur) ya da bir iş paketini aç. Sağdaki ayarları değiştirip <b>Uygula</b> de: okuma yeniden yapılır, sonucu resim üzerinde renkli kutularla görürsün. <b>Kaydet</b> dediğin çizim Üretim Terminali Hazırlık › Dokümanlar'da hazır olur.</small></div>`}
        </section>
        <aside className="col labset glass" style=${mob && lv !== 'set' ? { display: 'none' } : null}>
          <div className="segs" style=${{ width: '100%', marginTop: 0 }}>${[['pdf', 'PDF'], ['3d', '3B model'], ['diag', 'Tanı']].map(([k, l]) => html`<button key=${k} className=${'seg ' + (tab === k ? 'on' : '')} style=${{ flex: 1, justifyContent: 'center' }} onClick=${() => setTab(k)}>${l}${k === 'diag' && info ? html`<i className="ldot"></i>` : null}</button>`)}</div>
          <div className="labbody">${tab === 'pdf' ? pdfSet : tab === '3d' ? m3Set : diagView}</div>
          <div className="labacts">
            <div style=${{ display: 'flex', gap: 8 }}>
              <button className="btn pri" style=${{ flex: 1 }} disabled=${!w.files.length || !dirty} onClick=${() => apply(false)}><${I} n="check" s=${18} />${dirty ? 'Uygula · yeniden oku' : 'Ayarlar uygulandı'}</button>
              <button className="btn" title="Önbelleği atlayıp baştan işle" disabled=${!w.files.length} onClick=${() => apply(true)}><${I} n="bolt" s=${18} /></button>
              <button className="btn" title="Varsayılan ayarlara dön" onClick=${reset}><${I} n="back" s=${18} /></button>
            </div>
            <button className="btn" onClick=${useAll}><${I} n="layers" s=${18} />Ayarları tüm sistemde kullan</button>
            ${send ? html`<div className="sendbox">
              <div className="lpkg"><select value=${pkgId} onChange=${e => setPkgId(e.target.value)}>${pkgs.map(p => html`<option key=${p.id} value=${p.id}>${p.no} · ${p.part}</option>`)}</select></div>
              <${Sw} on=${send.files} onChange=${v => setSend(Object.assign({}, send, { files: v }))} l="Dosyalar" d=${w.files.map(f => f.name).join(' + ') || 'dosya yok'} />
              <${Sw} on=${send.plan} onChange=${v => setSend(Object.assign({}, send, { plan: v }))} l=${'Kontrol planı · ' + w.bal.length + ' balon'} d=${curPkg && curPkg.plan && curPkg.plan.length ? 'Paketteki ' + curPkg.plan.length + ' noktanın yerine geçer' : 'Balonlar kontrol planı olur'} />
              <${Sw} on=${send.cfg} onChange=${v => setSend(Object.assign({}, send, { cfg: v }))} l="Okuma ayarları" d="Operatör ekranı bu ayarla açar" />
              <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setSend(null)}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} disabled=${!pkgId || !(send.files || send.plan || send.cfg)} onClick=${doSend}><${I} n="next" s=${18} />Pakete aktar</button></div>
            </div>` : html`<button className="btn" disabled=${!w.files.length} onClick=${() => setSend({ files: true, plan: w.bal.length > 0, cfg: true })}><${I} n="next" s=${18} />İş paketine aktar${w.from && curPkg && w.from === curPkg.id ? ' · ' + curPkg.no : ''}</button>`}
          </div>
        </aside>
      </main>
    </div>
    ${toast ? html`<div key=${toast.k} className="toast" role="status"><span className="ti" style=${{ '--c': toast.c }}><${I} n=${toast.i} s=${18} /></span>${toast.m}</div>` : null}
  </${Fragment}>`;
}

