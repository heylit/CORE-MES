import { AKStore } from '../data/store';
import { AKTol } from '../core/tol';
import React from 'react';
import { BALLS, Fragment, I, fmt, html, perf, useEffect, useMemo, useRef, useState } from './temel';
import { Art } from './bilesenler';
import { LS, b64bytes, download, ornekVerisiVar, tick } from './yukleyici';
import { gorunenOrnekler, ornekCizimGorunur } from '../data/ornekler';
import { gomuluMu } from './gomulu';
import { LOOK_KEYS, PDFMEM, PDF_KEYS, RCFG, cfgSig, memPut, mergeDims, pdfOpen, pdfRender, pdfRenderImg, pdfRenderRegion, pdfStore, tint, unpackBits } from './pdf';
import { inkOf, pdfDims } from './pdf-okuma';
import { getTess, ocrImage, ocrPdfPage } from './ocr';
import { layoutBalloons } from './balon-yerlesimi';
import { Step3D, fileHash, isModelName, processModel } from './model-3b';
import { beep } from './operator-parcalar';
import { AletSecimi, olcumAletiBul, useOlcumAletleri } from './olcum-aleti-secimi';
import { ALET_ZORUNLU_ILETISI, olcumAletDamgasi } from '../data/olcum-aleti';
import { ESKI_CIZIM } from '../data/cizim-merkezi';

/* ── teknik resim paneli ── */
export const SAMPLES = [
  { id: 'demo', name: 'FLN-120 · yerleşik çizim', kind: 'demo', sub: 'Örnek SVG' },
  { id: 'smp-pdf', name: 'FLN-120.pdf', kind: 'pdf', sub: 'CAD\'den PDF · örnek' },
  { id: 'smp-gvd', name: 'GVD-340.pdf', kind: 'pdf', sub: 'Detaylı · antet, BOM, GD&T, 38 ölçü' },
  { id: 'smp-gvd-c', name: 'GVD-340-cizgi.pdf', kind: 'pdf', sub: 'Yazılar çizgiye dönmüş · OCR' },
  { id: 'smp-gvd-t', name: 'GVD-340-taranmis.pdf', kind: 'pdf', sub: 'Taranmış kâğıt · OCR' },
  { id: 'smp-gvd-k', name: 'GVD-340-karisik.pdf', kind: 'pdf', sub: 'Karışık: antet yazı, ölçüler çizgi' },
  { id: 'smp-gvd-a1', name: 'GVD-340-karisik-A1.pdf', kind: 'pdf', sub: 'A1 pafta · küçük yazı' },
  { id: 'smp-step-fln', name: 'FLN-120.step', kind: 'step', sub: 'STEP · flanş' },
  { id: 'smp-step-brk', name: 'BRK-80.step', kind: 'step', sub: 'STEP · L braket' }
];
/** Ölçüm yöntemi: 'cmm' (koordinat ölçme makinesi) ya da 'man' (elle · el aleti) */
export const methOf = b => b.m || (b.tool === 'CMM' ? 'cmm' : 'man');
export const METH = { cmm: { l: 'CMM', c: 'var(--cmm)' }, man: { l: 'Elle', c: 'var(--man)' } };
export const HEX = 'M17 0L8.5 14.7H-8.5L-17 0-8.5-14.7H8.5Z';
/** teknik resim belgesi (PDF sayfası, 3B'den üretilen resim ya da tanıtım çizimi) */
export interface DrawDoc { kind: string; key: string; name: string; w: number; h: number; balloons: any[]; [k: string]: any }
export const DEMO_DOC: DrawDoc = { kind: 'demo', key: 'demo', name: 'FLN-120 Flanş', sub: 'TR-FLN-120-03 · 12.09.2026 · Pafta 1/2 · S355J2', rev: 'C', w: 1000, h: 640, balloons: BALLS };

/** yuklemeYok: operatör terminali dosya yüklemez (iş paketinin resmi gelir); yükleme düğmesi, sürükle-bırak ve dosya seçici gösterilmez. */
export function Blueprint({ say, theme, ctl, yuklemeYok = false }: { say: any; theme: any; ctl?: any; yuklemeYok?: boolean }) {
  const [doc, setDoc] = useState(DEMO_DOC);
  const [mode3d, setMode3d] = useState(false);
  const [busy, setBusy] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [lib, setLib] = useState([]);
  const [z, setZ] = useState({ k: 1, x: 0, y: 0 });
  const [dims, setDims] = useState(true), [showB, setShowB] = useState(true), [grid, setGrid] = useState(true), [hidden, setHidden] = useState(true);
  const [adding, setAdding] = useState(false);
  const [balS, setBalS] = useState(BALLS), [measS, setMeasS] = useState<Record<string, any>>({});
  const aletler = useOlcumAletleri();
  const bal = ctl && ctl.bal ? ctl.bal : balS, setBal = ctl && ctl.setBal ? ctl.setBal : setBalS;
  const meas = ctl && ctl.meas ? ctl.meas : measS, setMeas = ctl && ctl.setMeas ? ctl.setMeas : setMeasS;
  const RO = !!(ctl && ctl.readOnly);
  const [model3d, setModel3d] = useState(null);
  const [fs, setFs] = useState(false);
  useEffect(() => { ctl && ctl.onFocusMode && ctl.onFocusMode(fs); if (!fs) return; const k = e => { if (e.key === 'Escape') setFs(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [fs]);
  const [suggest, setSuggest] = useState(null), [pinMode, setPinMode] = useState(false), [pinEdit, setPinEdit] = useState(null), [pinSel, setPinSel] = useState(null);
  useEffect(() => { if (ctl && ctl.focus) { setMode3d(false); setSel(ctl.focus.id); setVal(''); setEdit(null); setDrawer(null); setSuggest(null); } }, [ctl && ctl.focus && ctl.focus.n]);
  const pkgModel = ctl && ctl.files ? ctl.files.find(f => isModelName(f.name)) : null;
  const [props, setProps] = useState(null);
  const [sel, setSel] = useState(null), [val, setVal] = useState(''), [edit, setEdit] = useState(null);
  const [drag, setDrag] = useState(false), [dropping, setDropping] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const [regMode, setRegMode] = useState(false), [regRect, setRegRect] = useState(null), [pwAsk, setPwAsk] = useState(null), [lowOn, setLowOn] = useState(false), [pageTick, setPageTick] = useState(0);
  const regRef = useRef(null), pageRef = useRef(null), pwRef = useRef(null);
  const [selMode, setSelMode] = useState(false), [msel, setMsel] = useState([]), selRef = useRef(null);
  const st = useRef(null), dr = useRef(null), pts = useRef<any>({}), svgRef = useRef(null), fileRef = useRef(null), pdfRef = useRef(null), imgRef = useRef(null);
  const uid = useMemo(() => 'c' + Math.random().toString(36).slice(2, 7), []);
  const U = doc.w / 1000, BK = +((ctl && ctl.cfg) || RCFG).balS || 1;
  // kalıcılık
  useEffect(() => { if (!ctl) { const s = LS.get('bal:' + doc.key); if (s) { setBal(s.bal || []); setMeas(s.meas || {}); } else { setBal(doc.balloons || []); setMeas({}); } } setSel(null); setEdit(null); setZ({ k: 1, x: 0, y: 0 }); }, [doc.key]);
  const persist = (b, m) => { if (!ctl) LS.set('bal:' + doc.key, { bal: b, meas: m }); };
  const needProps = key => ctl ? (!RO && !(ctl.bal && ctl.bal.length)) : !LS.get('bal:' + key);
  // iş paketi: ana dokümanı otomatik aç
  useEffect(() => {
    setModel3d(null); setMode3d(false);
    if (!ctl && !ornekCizimGorunur(gomuluMu(), false, false)) { setDoc(Object.assign({}, DEMO_DOC, { key: 'empty:is-yok', name: 'İş yok', sub: 'Bu istasyonda açık iş yok', rev: '', balloons: [], empty: true })); setBalS([]); setMeasS({}); setProps(null); return; }
    if (!ctl) { if (doc.kind !== 'demo' || doc.empty) { setDoc(DEMO_DOC); setBalS(BALLS); setMeasS({}); setProps(null); } return; }
    const f = (ctl.files || []).find(x => x.name === ctl.primary) || (ctl.files || [])[0];
    if (f) openBytes(f.bytes, f.name, 'pkg'); else { setDoc(Object.assign({}, DEMO_DOC, { key: 'empty:' + ctl.key, name: 'Doküman yok', sub: 'Hazırlıkta teknik resim eklenmemiş', rev: '', balloons: [], kind: 'demo', empty: true })); }
  }, [ctl && ctl.key]);
  const open3d = async () => {
    if (doc.kind === 'step') { setMode3d(true); return; }
    if (!pkgModel) return;
    try { setBusy({ t: '3B model hazırlanıyor', steps: ['Geometri çekirdeği yükleniyor', 'Model okunuyor', 'Topoloji', 'Görünüşler', 'Hazır'], i: 0 }); const tM = performance.now(); const R = await processModel(pkgModel.bytes, pkgModel.name, i => setBusy(b => b && Object.assign({}, b, { i })), { need: '3d', derived: ctl && ctl.derived, cfg: cfgOf() }); setModel3d({ data: R.V, fa: R.fa }); setMode3d(true); if (ctl && ctl.lab) ctl.lab({ model: R, ms: Math.round(performance.now() - tM) }); } catch (e) { say('3B açılamadı: ' + e.message, 'alert', 'var(--stop)'); }
    setBusy(null);
  };
  // pdf görüntüsü: ekrana sığarken ekran çözünürlüğünde vektörden çizilmiş net görüntü (lo),
  // yakınlaşınca yüksek çözünürlüklü görüntü (hi). Büyük görüntüyü küçültmek ince yazı ve çizgileri soldurur.
  const [loUrl, setLoUrl] = useState(null);
  const hiWant = z.k > 1.12, ckSeen = useRef(null);
  useEffect(() => {
    if (doc.kind !== 'pdf' || !doc.ck) return; let ok = true;
    if (ckSeen.current !== doc.ck) { ckSeen.current = doc.ck; setImgUrl(o => { if (o) URL.revokeObjectURL(o); return null; }); setLoUrl(o => { if (o) URL.revokeObjectURL(o); return null; }); }
    (async () => {
      const C = PDFMEM.get(doc.ck); if (!C) return;
      const cf = cfgOf(), pkey = theme + '~v4' + cfgSig(cf, LOOK_KEYS);
      const dpr = window.devicePixelRatio || 1, L = Math.round(Math.min(C.w, Math.max(1200, window.innerWidth * dpr * 0.85)));
      const url = b => URL.createObjectURL(b);
      if (L < C.w * 0.8) {
        const lk = pkey + '@' + L;
        let lb = C.pngLo && C.pngLo[lk];
        if (!lb) { const pdf = await ensurePdf(); if (!ok || !pdf) return; const t0 = performance.now(); const img = await pdfRenderImg(pdf, doc.page || 1, L / C.w * C.scale); perf('pdf:ekran', t0); if (!ok) return; lb = await tint(img, theme, cf, true); C.pngLo = Object.assign({}, C.pngLo, { [lk]: lb }); if (!C.enc) AKStore.Cache.put(doc.ck, pdfStore(C)); }
        if (ok) setLoUrl(o => { if (o) URL.revokeObjectURL(o); return url(lb); });
      } else if (ok) setLoUrl(o => { if (o) URL.revokeObjectURL(o); return null; });
      // yüksek çözünürlük: hemen değil, ekran boşalınca hazırlanır
      await tick(L < C.w * 0.8 ? 400 : 0); if (!ok) return;
      let blob = C.png && C.png[pkey];
      if (!blob) { const img = await ensureImg(); if (!ok || !img) return; blob = await tint(img, theme, cf); C.png = Object.assign({}, C.png, { [pkey]: blob }); if (!C.enc) AKStore.Cache.put(doc.ck, pdfStore(C)); }
      if (ok) setImgUrl(o => { if (o) URL.revokeObjectURL(o); return url(blob); });
    })().catch(e => console.warn(e));
    return () => { ok = false; };
  }, [doc.key, doc.ck, theme, ctl && ctl.cfg && cfgSig(ctl.cfg, LOOK_KEYS)]);
  const pdfSrc = useRef(null);
  const askPw = again => new Promise(res => { setBusy(null); pwRef.current = res; setPwAsk({ again, v: '' }); });
  const ensurePdf = async () => { if (pdfRef.current) return pdfRef.current; if (!pdfSrc.current) return null; pdfRef.current = await pdfOpen(pdfSrc.current.bytes, askPw); return pdfRef.current; };
  const ensureImg = async () => { if (imgRef.current) return imgRef.current; const P = pageRef.current, pdf = await ensurePdf(); if (!pdf || !P) return null; const R = await pdfRender(pdf, P.n || 1, cfgOf()); imgRef.current = R.img; return R.img; };
  const cfgOf = () => (ctl && ctl.cfg) || RCFG;

  const zoomAt = (f, px, py) => setZ(o => { const k = Math.max(.5, Math.min(12, o.k * f)), r = k / o.k; return { k, x: px - (px - o.x) * r, y: py - (py - o.y) * r }; });
  const ctr = () => { const b = st.current.getBoundingClientRect(); return [b.width / 2, b.height / 2]; };
  useEffect(() => { const el = st.current; if (!el) return; const w = e => { e.preventDefault(); const b = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - b.left, e.clientY - b.top); }; el.addEventListener('wheel', w, { passive: false }); return () => el.removeEventListener('wheel', w); }, [mode3d, doc.key]);
  const toVB = (cx, cy) => { const s = svgRef.current; if (!s) return null; const p = s.createSVGPoint(); p.x = cx; p.y = cy; const m = s.getScreenCTM(); if (!m) return null; const q = p.matrixTransform(m.inverse()); return [q.x, q.y]; };
  // derin yakınlaşma: yüksek çözünürlüklü görüntü de büyütülmeye başlayınca görünen bölge PDF'ten (vektör) ekran çözünürlüğünde yeniden çizilir
  const [deep, setDeep] = useState(null);
  useEffect(() => { setDeep(null); }, [doc.ck]);
  useEffect(() => {
    if (doc.kind !== 'pdf' || mode3d || !doc.ck || z.k < 1.12) { if (deep) setDeep(null); return; }
    let ok = true;
    const t = setTimeout(async () => {
      try {
        const C = PDFMEM.get(doc.ck), el = st.current; if (!C || !el) return;
        const r = el.getBoundingClientRect(), a = toVB(r.left, r.top), b = toVB(r.right, r.bottom); if (!a || !b) return;
        const x0 = Math.max(0, Math.floor(a[0])), y0 = Math.max(0, Math.floor(a[1])), x1 = Math.min(doc.w, Math.ceil(b[0])), y1 = Math.min(doc.h, Math.ceil(b[1]));
        if (x1 - x0 < 8 || y1 - y0 < 8) return;
        const zoomCss = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        let f = (r.width / Math.max(1, b[0] - a[0])) * (window.devicePixelRatio || 1) * zoomCss;
        if (f < 1.05) { if (ok) setDeep(null); return; } // yüksek çözünürlüklü görüntü zaten yeterli
        f = Math.min(f, 6, Math.sqrt(9e6 / ((x1 - x0) * (y1 - y0)))); // en çok ~9 MP
        const pdf = await ensurePdf(); if (!ok || !pdf) return;
        const t0 = performance.now(), R = await pdfRenderRegion(pdf, doc.page || 1, C.scale, [x0, y0, x1 - x0, y1 - y0], f); if (!ok) return;
        const blob = await tint(R.img, theme, cfgOf(), true); perf('pdf:yakin', t0); if (!ok) return;
        const url = URL.createObjectURL(blob);
        setDeep(o => { if (o) URL.revokeObjectURL(o.url); return { url, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; });
      } catch (e) { console.warn(e); }
    }, 220);
    return () => { ok = false; clearTimeout(t); };
  }, [z.k, z.x, z.y, doc.ck, mode3d, theme, ctl && ctl.cfg && cfgSig(ctl.cfg, LOOK_KEYS)]);
  const pd = e => { if (e.target.closest('.ball') || e.target.closest('.phl')) return; if (selMode) { const p = toVB(e.clientX, e.clientY); if (p) { selRef.current = p; setRegRect({ x: p[0], y: p[1], w: 0, h: 0 }); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} } return; } if (regMode) { const p = toVB(e.clientX, e.clientY); if (p) { regRef.current = p; setRegRect({ x: p[0], y: p[1], w: 0, h: 0 }); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} } return; } pts.current[e.pointerId] = [e.clientX, e.clientY]; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} dr.current = { x: e.clientX, y: e.clientY, ox: z.x, oy: z.y, moved: false }; setDrag(true); };
  const pm = e => {
    if (selMode && selRef.current) { const p = toVB(e.clientX, e.clientY), o = selRef.current; if (p) setRegRect({ x: Math.min(o[0], p[0]), y: Math.min(o[1], p[1]), w: Math.abs(p[0] - o[0]), h: Math.abs(p[1] - o[1]) }); return; }
    if (regMode && regRef.current) { const p = toVB(e.clientX, e.clientY), o = regRef.current; if (p) setRegRect({ x: Math.min(o[0], p[0]), y: Math.min(o[1], p[1]), w: Math.abs(p[0] - o[0]), h: Math.abs(p[1] - o[1]) }); return; }
    if (!pts.current[e.pointerId]) return;
    const ids = Object.keys(pts.current);
    if (ids.length === 2) { const a0 = pts.current[ids[0]], b0 = pts.current[ids[1]], d0 = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]); pts.current[e.pointerId] = [e.clientX, e.clientY]; const a1 = pts.current[ids[0]], b1 = pts.current[ids[1]], d1 = Math.hypot(a1[0] - b1[0], a1[1] - b1[1]); const bb = st.current.getBoundingClientRect(); if (d0) zoomAt(d1 / d0, (a1[0] + b1[0]) / 2 - bb.left, (a1[1] + b1[1]) / 2 - bb.top); if (dr.current) dr.current.moved = true; return; }
    pts.current[e.pointerId] = [e.clientX, e.clientY];
    const d = dr.current; if (d) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true; setZ(q => ({ k: q.k, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }
  };
  const pu = e => {
    if (selMode && selRef.current) { const r = regRect; selRef.current = null; setRegRect(null); if (r && r.w > doc.w * 0.004) { const ids = bal.filter(x => { const q = LB.pos[x.id] || x; return q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h; }).map(x => x.id); setMsel(m => Array.from(new Set(m.concat(ids)))); } return; }
    if (regMode && regRef.current) { const r = regRect; regRef.current = null; setRegRect(null); setRegMode(false); if (r && r.w > doc.w * 0.01 && r.h > doc.w * 0.006) readRegion([r.x, r.y, r.w, r.h]); return; }
    const d = dr.current; delete pts.current[e.pointerId]; dr.current = null; setDrag(false);
    if (pinMode && d && !d.moved) { const p = toVB(e.clientX, e.clientY); if (p) { setPinEdit({ x: p[0], y: p[1], text: '', tags: [] }); setSel(null); setPinMode(false); } return; }
    if (adding && d && !d.moved) { const p = toVB(e.clientX, e.clientY); if (p) { setEdit({ isNew: true, x: p[0], y: p[1], text: '', label: '' }); setSel(null); setAdding(false); } }
  };

  /* dosya açma */
  const openBytes = async (bytes, name, src?) => {
    const low = name.toLowerCase();
    const head = new TextDecoder().decode(bytes.slice(0, 64));
    const isPdf = low.endsWith('.pdf') || head.startsWith('%PDF');
    const isStep = /\.(step|stp|p21)$/.test(low) || head.indexOf('ISO-10303-21') >= 0;
    const isIges = /\.(igs|iges)$/.test(low);
    const key = name + ':' + bytes.length;
    setDrawer(null); setMode3d(false); setProps(null);
    try {
      if (isPdf) {
        setBusy({ t: 'PDF açılıyor', steps: ['Dosya okunuyor', 'Sayfa vektörden çiziliyor', 'Ölçü yazıları aranıyor'], i: 0 }); await tick(60);
        pdfRef.current = null; imgRef.current = null; pdfSrc.current = { bytes, hash: await fileHash(bytes) };
        await showPdfPage(1, name, key);
      } else if (isStep || isIges || /\.stl$/.test(low)) {
        const kindName = /\.stl$/.test(low) ? 'STL' : isIges ? 'IGES' : 'STEP';
        setBusy({ t: kindName + ' işleniyor', steps: ['Geometri çekirdeği yükleniyor', 'Model okunuyor ve üçgenleniyor', 'Kenar ve yüz topolojisi kuruluyor', 'Görünüşler izdüşürülüyor · gizli çizgiler ayıklanıyor', 'Delik ve çaplar tanınıyor · ölçülendiriliyor'], i: 0 });
        const tM = performance.now();
        const R = await processModel(bytes, name, i => setBusy(b => b && Object.assign({}, b, { i })), { need: 'draw', derived: ctl && ctl.derived, cfg: cfgOf(), fresh: freshRef.current });
        if (ctl && ctl.lab) ctl.lab({ model: R, ms: Math.round(performance.now() - tM) });
        const D = R.D;
        const nd = { kind: 'step', mk: R.kind, key, name: name.replace(/\.(step|stp|p21|igs|iges|stl)$/i, ''), file: name, sub: 'Ölçek ' + D.info.scale + ' · ' + D.info.size.join(' × ') + ' mm · ' + fmt(D.info.tris) + ' üçgen', w: D.w, h: D.h, svg: D.svg, balloons: [], data: R.V, fa: R.fa, info: D.info };
        setDoc(nd);
        if (needProps(key) && D.balloons.length) setProps(D.balloons.map(b => Object.assign({ on: true }, b)));
        if (src !== 'pkg') say('Teknik resim oluşturuldu · ' + D.balloons.length + ' ölçü önerisi', 'ruler', 'var(--done)');
      } else throw new Error('Desteklenen biçimler: PDF, STEP (.step/.stp), IGES, STL');
      if (src !== 'lib' && src !== 'pkg' && !lib.some(l => l.name === name)) setLib(l => [{ name, bytes, kind: isPdf ? 'pdf' : 'step', sub: (bytes.length / 1024).toFixed(0) + ' KB · yüklendi' }, ...l].slice(0, 6));
    } catch (err) { console.error(err); say('Açılamadı: ' + (err.message || err), 'alert', 'var(--stop)'); }
    setBusy(null);
  };
  const showPdfPage = async (n, name, key) => {
    const cf = cfgOf(), ck = 'pdf:' + pdfSrc.current.hash + '#' + n + cfgSig(cf, PDF_KEYS), t0 = performance.now();
    imgRef.current = null;
    let C = freshRef.current ? null : PDFMEM.get(ck);
    if (!C && !freshRef.current) { const c = await AKStore.Cache.get(ck); if (c && c.inkBits) { C = Object.assign({}, c, { ink: unpackBits(c.inkBits, c.w * c.h) }); delete C.inkBits; memPut(ck, C); } }
    if (C) perf('pdf:onbellek', t0);
    else {
      setBusy(b => Object.assign({}, b || { t: 'PDF açılıyor', steps: ['Dosya okunuyor', 'Sayfa vektörden çiziliyor', 'Ölçü yazıları aranıyor'] }, { i: 1 })); await tick();
      const pdf = await ensurePdf();
      setBusy(b => b || { t: 'PDF açılıyor', steps: ['Dosya okunuyor', 'Sayfa vektörden çiziliyor', 'Ölçü yazıları aranıyor'], i: 1 });
      let t1 = performance.now();
      const R = await pdfRender(pdf, n, cf); const tRender = performance.now() - t1;
      setBusy(b => b && Object.assign({}, b, { i: 2 })); await tick();
      imgRef.current = R.img;
      t1 = performance.now(); const ink = inkOf(R.img); perf('pdf:ink', t1);
      const textless = R.items.length < 8 || R.junk, cls = AKTol.detectClass(R.items.map(o => o.s).join(' '));
      t1 = performance.now(); const dims: any = textless ? [] : pdfDims(R.items, cls, { w: R.w, h: R.h, ink, ex: cf.ex, auto: cf.auto, diag: !!(ctl && ctl.lab) }); const tDims = performance.now() - t1; perf('pdf:olcu', t1);
      C = { w: R.w, h: R.h, pages: R.pages, scale: R.scale, items: R.items, junk: R.junk, textless, cls, dims, stats: dims.stats, diag: dims.diag, ink, png: {}, enc: !!pdf.arkonEnc, ms: { render: Math.round(tRender), dims: Math.round(tDims) } };
      memPut(ck, C);
    }
    const dims: any = C.dims || []; if (C.stats && !dims.stats) dims.stats = C.stats;
    pageRef.current = { items: C.items, w: C.w, h: C.h, ink: C.ink, scale: C.scale, n, dims, ck, junk: C.junk }; setPageTick(t => t + 1);
    const pk = key + '#' + n;
    setDoc({ kind: 'pdf', key: pk, ck, baseKey: key, name: name.replace(/\.pdf$/i, ''), file: name, sub: 'Sayfa ' + n + '/' + C.pages + ' · ' + C.w + '×' + C.h + ' px · ' + (C.textless ? 'metin katmanı yok · OCR' : C.items.length + ' yazı') + ' · ISO 2768-' + C.cls, w: C.w, h: C.h, page: n, pages: C.pages, balloons: [], cls: C.cls, textCount: C.items.length, textless: C.textless });
    // metin katmanı yoksa ya da ölçüler çizgiye dönüşmüşse (karışık PDF: antet yazı, ölçüler çizgi) görüntüden tamamla
    const needOcr = cf.ocr === 'always' || (cf.ocr !== 'off' && (C.textless || dims.length < (cf.minDims || 3)));
    if (needProps(pk) || (ctl && ctl.lab)) {
      let found = dims.map(d => Object.assign({}, d)); found.stats = dims.stats;
      if (needOcr) {
        if (!C.ocrDims) {
          say(C.textless ? (C.items.length ? 'PDF yazıları okunamayan fontta · görüntüden okunuyor' : 'PDF\'te metin yok (yazılar çizgiye dönüştürülmüş) · görüntüden okunuyor') : 'Ölçü yazıları çizgiye dönüştürülmüş · görüntüden tamamlanıyor', 'search', 'var(--done)');
          const t1 = performance.now();
          const r = await runOcr(null, C.cls, !C.textless);
          C.ocrDims = r; C.ocrStats = r.stats; C.ocrDiag = r.diag; C.ms = Object.assign({}, C.ms, { ocr: Math.round(performance.now() - t1) });
          if (!C.enc && C.png && Object.keys(C.png).length) AKStore.Cache.put(ck, pdfStore(C));
        }
        const od = C.ocrDims.map(d => Object.assign({ ocr: true }, d));
        if (C.textless) { found = od; found.stats = C.ocrStats; }
        else found = mergeDims(found, od, C.w, C.ocrStats);
      }
      if (ctl && ctl.lab) { if (!C.diag && !C.textless) C.diag = pdfDims(C.items, C.cls, { w: C.w, h: C.h, ink: C.ink, ex: cf.ex, auto: cf.auto, diag: true }).diag; ctl.lab({ C, dims: found, diag: C.diag, ocrDiag: C.ocrDiag, needOcr }); }
      if (!needProps(pk)) return;
      if (found.length) setProps(found);
      else say(needOcr ? 'Görüntüden de ölçü okunamadı · ◎ ile noktaları ekleyebilirsin' : 'Ölçü yazısı tanınmadı · "Görüntüden oku" ya da ◎ ile ekle', 'alert', 'var(--hold)');
    }
  };
  /** OCR: tüm sayfa ya da seçili bölge */
  const runOcr = async (box, cls?, mask?) => {
    const P = pageRef.current;
    if (!P) return [];
    setBusy({ t: box ? 'Bölge görüntüden okunuyor' : 'Görüntüden okunuyor (OCR)', steps: ['OCR motoru yükleniyor (çevrimdışı)', 'Yazılar tanınıyor · yatay + dikey', 'Ölçüler ayrıştırılıyor'], i: 0, pct: 0 }); await tick(60);
    try {
      await getTess();
      setBusy(b => b && Object.assign({}, b, { i: 1 })); await tick();
      const onProgress = p => setBusy(b => b && Object.assign({}, b, { pct: p }));
      let items;
      const pdf = await ensurePdf();
      if (box && pdf && P.scale) {
        const C = await pdfRenderRegion(pdf, P.n || 1, P.scale, box);
        items = (await ocrImage(C.img, { onProgress })).map(o => Object.assign(o, { x: box[0] + o.x / C.f, y: box[1] + o.y / C.f, h: o.h / C.f, w: o.w / C.f }));
      } else if (!box && pdf && P.scale) {
        const cf = cfgOf(), f = cf.dpi / P.scale;
        items = await ocrPdfPage(pdf, P.n || 1, P, { img: f < 1.2 ? await ensureImg() : null, mask: mask && !P.junk ? P.items : null, dpi: cf.dpi, onProgress });
      } else { const img = await ensureImg(); if (!img) return []; items = await ocrImage(img, { box, onProgress }); }
      setBusy(b => b && Object.assign({}, b, { i: 2, pct: 1 })); await tick();
      const cf = cfgOf();
      return pdfDims(items, cls || doc.cls || 'm', { w: P.w, h: P.h, ink: P.ink, ocr: true, region: !!box, ex: cf.ex, auto: cf.auto, diag: !!(ctl && ctl.lab) });
    } catch (e) { console.error(e); say('OCR çalışmadı: ' + (e.message || e), 'alert', 'var(--stop)'); return []; }
    finally { setBusy(null); }
  };
  const mergeProps = (list, label) => {
    const cur = props || [];
    const add = list.filter(p => !cur.some(q => q.nom === p.nom && Math.hypot(q.tx - p.tx, q.ty - p.ty) < doc.w * 0.01) && !bal.some(q => q.ar && q.nom === p.nom && Math.hypot(q.ar[0] - p.tx, q.ar[1] - p.ty) < doc.w * 0.01));
    if (!add.length) { say(label + ': yeni ölçü bulunamadı', 'alert', 'var(--hold)'); return; }
    const merged = cur.concat(add); merged.stats = Object.assign({}, (props && props.stats) || {}, { found: merged.length, added: add.length, ocr: (props && props.stats && props.stats.ocr) || (list.stats && list.stats.ocr) });
    setProps(merged); say(label + ': ' + add.length + ' ölçü eklendi', 'check', 'var(--run)');
  };
  const ocrPage = async () => { const r = await runOcr(null, null, !doc.textless); mergeProps(r, 'Görüntüden okuma'); };
  /** Bölge oku: önce bölgedeki PDF yazıları, yoksa görüntüden */
  const readRegion = async box => {
    const P = pageRef.current; if (!P) return;
    const [x0, y0, w, h] = box;
    const inside = P.items.filter(o => o.x >= x0 - 2 && o.x <= x0 + w + 2 && o.y >= y0 - 2 && o.y <= y0 + h + o.h);
    let r = inside.length && !doc.textless ? pdfDims(inside, doc.cls || 'm', { w: P.w, h: P.h, ink: P.ink, region: true }) : [];
    if (!r.length) r = await runOcr(box);
    r.forEach(p => { p.on = !p.ref; }); if (r.some(p => p.lvl === 'low')) setLowOn(true);
    if (r.length === 1 && !props) { const p = r[0]; setEdit({ isNew: true, x: p.x, y: p.y, ar: p.ar, text: p.raw, label: p.l.replace(/ \(.*\)$/, '') }); setSel(null); say('Bölgede 1 ölçü okundu · kontrol edip kaydet', 'check', 'var(--run)'); return; }
    mergeProps(r, 'Bölge okuma');
  };
  const openSample = async s => {
    if (s.kind === 'demo') { setDoc(DEMO_DOC); setMode3d(false); setProps(null); setDrawer(null); return; }
    await openBytes(b64bytes(s.id), s.name, 'lib');
  };
  const onFile = async f => { if (!f) return; const bytes = new Uint8Array(await f.arrayBuffer()); await openBytes(bytes, f.name); };
  // Çizim stüdyosu: dosya dışarıdan açılır / ayar değişince yeniden işlenir
  const freshRef = useRef(false);
  useEffect(() => { const o = ctl && ctl.open; if (!o || !o.bytes) return; freshRef.current = !!o.fresh; setSel(null); setEdit(null); setModel3d(null); openBytes(o.bytes, o.name, 'lab').finally(() => { freshRef.current = false; }); }, [ctl && ctl.open && ctl.open.n]);

  /* balonlar */
  const b = bal.find(x => x.id === sel), m = b && meas[b.id];
  const nextId = () => bal.reduce((a, x) => Math.max(a, x.id), 0) + 1;
  const saveMeasure = (forced?, override?) => {
    if (!b) return;
    const alet = ctl && ctl.aletZorunlu ? olcumAletiBul(aletler, b.tool) : null;
    if (ctl && ctl.aletZorunlu && !alet) { beep('nok'); say(ALET_ZORUNLU_ILETISI + (b.tool ? ' · ' + b.tool : ''), 'alert', 'var(--stop)'); return; }
    let v, ok;
    if (b.gauge) { ok = forced === 'ok'; v = ok ? 'Geçer' : 'Geçmez'; }
    else {
      v = override != null ? override : parseFloat(String(val).replace(',', '.')); if (isNaN(v)) return; ok = v >= b.min - 1e-9 && v <= b.max + 1e-9;
      if (!ok && override == null) { const alts = [10, 0.1, 100, 0.01, 1000, 0.001].map(f => +(v * f).toFixed(4)).filter(x => x >= b.min - 1e-9 && x <= b.max + 1e-9); if (alts.length) { setSuggest({ v, alt: alts[0] }); beep('nok'); return; } }
    }
    setSuggest(null); beep(ok ? 'ok' : 'nok');
    const nm = Object.assign({}, meas, { [b.id]: Object.assign({ v, ok, at: Date.now() }, alet ? olcumAletDamgasi(alet) : null) }); setMeas(nm); persist(bal, nm); setVal('');
    say((ok ? 'Uygun · ' : 'Tolerans dışı! ') + b.nom + ' = ' + v, ok ? 'check' : 'alert', ok ? 'var(--run)' : 'var(--stop)');
    const nx = bal.find(x => !nm[x.id]); if (nx && ok) setTimeout(() => setSel(nx.id), 500);
  };
  const applyEdit = () => {
    const p = AKTol.parse(edit.text, { cls: doc.cls || 'm' });
    if (!p) { say('Ölçü anlaşılamadı · örn. Ø40 H7, 18 ±0.05, M8x1.25', 'alert', 'var(--hold)'); return; }
    const fields = { nom: p.nomText, tol: p.tolText, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge, l: edit.label || p.label || ({ diameter: 'Çap', linear: 'Uzunluk', radius: 'Radyus', angle: 'Açı', thread: 'Diş', chamfer: 'Pah', gdt: p.gdtName || 'Geometrik tol.', rough: 'Yüzey pürüzlülüğü' }[p.kind] || 'Ölçü') };
    let nb;
    if (edit.isNew) { const id = nextId(); nb = [...bal, Object.assign({ id, x: edit.x, y: edit.y }, edit.ar ? { ar: edit.ar } : {}, fields)]; setSel(id); }
    else nb = bal.map(x => x.id === edit.id ? Object.assign({}, x, fields) : x);
    setBal(nb); persist(nb, meas); setEdit(null);
  };
  const removeBalloon = id => { const nb = bal.filter(x => x.id !== id).map((x, i) => Object.assign({}, x, { id: i + 1 })); const nm: Record<string, any> = {}; bal.filter(x => x.id !== id).forEach((x, i) => { if (meas[x.id]) nm[i + 1] = meas[x.id]; }); setBal(nb); setMeas(nm); persist(nb, nm); setSel(null); setEdit(null); };
  const acceptProps = () => { const chosen = props.filter(p => p.on); const base = bal.reduce((a, x) => Math.max(a, x.id), 0); const nb = [...bal, ...chosen.map((p, i) => ({ id: base + i + 1, x: p.x, y: p.y, ar: p.ar, l: p.l, nom: p.nom, tol: p.tol, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge, m: p.tool === 'CMM' ? 'cmm' : 'man' }))]; setBal(nb); persist(nb, meas); setProps(null); say(chosen.length + ' kontrol noktası eklendi', 'check', 'var(--run)'); };
  const exportCsv = () => {
    const rows = [['No', 'Etiket', 'Ölçü', 'Tolerans', 'Min', 'Max', 'Ölçü aleti', 'Yöntem', 'Ölçülen', 'Sonuç', 'Zaman']].concat(bal.map(x => { const r = meas[x.id]; return [x.id, x.l, x.nom, x.tol, x.min, x.max, x.tool, METH[methOf(x)].l, r ? r.v : '', r ? (r.ok ? 'UYGUN' : 'RED') : 'ÖLÇÜLMEDİ', r ? new Date(r.at).toLocaleString('tr-TR') : '']; }));
    download((doc.file || doc.name) + '-olcum-raporu.csv', String.fromCharCode(0xfeff) + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv');
  };
  const exportSvg = () => {
    const css = '.ln{stroke:#000;fill:none;stroke-width:1.4}.hid{stroke:#666;fill:none;stroke-width:.8;stroke-dasharray:5 3}.ctr{stroke:#c00;fill:none;stroke-width:.6;stroke-dasharray:14 3 2 3}.dim{stroke:#000;fill:none;stroke-width:.6}.dimt{fill:#000;font:13px monospace}.arw{fill:#000}.tb{stroke:#000;fill:none;stroke-width:.8}.tbt{fill:#444;font:10px monospace}.tbv{fill:#000;font:bold 14px sans-serif}.bl circle{fill:#fff;stroke:#1f5fd0;stroke-width:1.5}.bl text{fill:#1f5fd0;font:bold 12px sans-serif;text-anchor:middle;dominant-baseline:central}';
    const bl = bal.map(x => { const p = LB.pos[x.id] || x, L = p.lead; return (L ? '<line x1="' + L[0].toFixed(1) + '" y1="' + L[1].toFixed(1) + '" x2="' + L[2].toFixed(1) + '" y2="' + L[3].toFixed(1) + '" stroke="#1f5fd0" stroke-width="1"/>' : '') + '<g class="bl" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') scale(' + LB.s.toFixed(2) + ')"><circle r="13"/><text>' + x.id + '</text></g>'; }).join('');
    download(doc.name + '-teknik-resim.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + doc.w + ' ' + doc.h + '" width="420mm" height="297mm"><style>' + css + '</style><rect width="100%" height="100%" fill="#fff"/>' + doc.svg + bl + '</svg>', 'image/svg+xml');
  };

  const span = b && !b.gauge ? (b.max - b.min || 1e-6) : 1, lo = b ? b.min - span * .2 / .7 : 0, hi = b ? b.max + span * .2 / .7 : 1;
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const T = (icon, on, fn, label) => html`<button className=${'tool ' + (on ? 'on' : '')} onClick=${fn} aria-label=${label} title=${label}><${I} n=${icon} s=${22} /></button>`;
  const nMeas = Object.keys(meas).length, nBad = Object.values<any>(meas).filter(x => !x.ok).length;
  const badge = { demo: 'ÖRNEK', pdf: 'PDF', step: 'STEP' }[doc.kind];
  const onPrimary = !ctl || doc.file === ctl.primary;
  const popRef = useRef<any>({ key: null, t: 0 }); if (popRef.current.key !== doc.key) popRef.current = { key: doc.key, t: Date.now() };
  const LB = useMemo(() => layoutBalloons(bal.map(b => {
    // eski paketler: balonun ait olduğu yazıyı bul (kılavuz çizgi + yazıyı örtmeme için)
    const D = doc.kind === 'pdf' && pageRef.current && pageRef.current.w === doc.w && pageRef.current.dims; if (b.ar || !D || !D.length) return b;
    let best = null, bd = doc.w * 0.05; for (const d of D) { if (d.nom !== b.nom) continue; const q = Math.hypot(d.x - b.x, d.y - b.y); if (q < bd) { bd = q; best = d; } }
    return best ? Object.assign({}, b, { ar: best.ar }) : b;
  }), U * BK, doc.w, doc.h, doc.kind === 'pdf' && pageRef.current && pageRef.current.w === doc.w ? pageRef.current.ink : null), [bal, doc.key, doc.w, pageTick, BK]);
  const BS = U * BK * LB.s;
  const leadLayer = showB && onPrimary ? html`<g className="leads">${bal.map(x => { const p = LB.pos[x.id]; if (!p || !p.lead) return null; const L = p.lead, mm = meas[x.id]; return html`<g key=${'l' + x.id} className=${'lead ' + (methOf(x) === 'cmm' ? 'cmm ' : '') + (sel === x.id ? 'sel ' : '') + (mm ? (mm.ok ? 'ok' : 'nok') : '')}><line x1=${L[0]} y1=${L[1]} x2=${L[2]} y2=${L[3]} style=${{ strokeWidth: 1.6 * BS }} /><circle cx=${L[2]} cy=${L[3]} r=${2.6 * BS} /></g>`; })}</g>` : null;
  const balloonsLayer = showB && onPrimary ? bal.map((x, i) => { const mm = meas[x.id], ps = LB.pos[x.id] || x, cm = methOf(x) === 'cmm'; return html`<g key=${doc.key + x.id} transform=${'translate(' + ps.x + ' ' + ps.y + ') scale(' + BS + ')'}><g className=${'ball ' + (cm ? 'cmm ' : '') + (msel.includes(x.id) ? 'msel ' : '') + (sel === x.id ? 'sel ' : '') + (ctl && ctl.due && ctl.due.includes(x.id) ? 'due ' : '') + (mm ? (mm.ok ? (mm.edge ? 'ok edge' : 'ok') : 'nok') : '')} style=${{ animationDelay: (Date.now() - popRef.current.t < 2500 ? (doc.kind === 'pdf' ? 0.1 : 1.2) + Math.min(i * .08, 1.2) : 0) + 's', transformOrigin: '0 0' }}
      onClick=${e => { e.stopPropagation(); if (selMode || e.shiftKey || e.ctrlKey || e.metaKey) { if (!RO) { setSelMode(true); setMsel(m => m.includes(x.id) ? m.filter(q => q !== x.id) : m.concat([x.id])); setSel(null); } return; } setSel(sel === x.id ? null : x.id); setVal(''); setEdit(null); setSuggest(null); setPinSel(null); ctl && ctl.onSelect && ctl.onSelect(x.id); }} role="button" tabIndex="0" aria-label=${'Kontrol ' + x.id + ' ' + x.nom}>
      ${cm ? html`<path className="p" d=${HEX} /><path className="o" d=${HEX} />` : html`<circle className="p" r="16" /><circle className="o" r="16" />`}<text>${x.id}</text></g></g>`; }) : null;
  const setMeth = (ids, mm) => { const nb = bal.map(x => ids.includes(x.id) ? Object.assign({}, x, { m: mm }) : x); setBal(nb); persist(nb, meas); say(ids.length + ' balon · ' + METH[mm].l + ' ölçüm', mm === 'cmm' ? 'hex' : 'ruler', METH[mm].c); };

  return html`<div className=${'bp fadein ' + (fs ? 'fs ' : '') + (dims ? '' : 'nodims ') + (hidden ? '' : 'nohid ') + (adding || regMode ? 'adding' : '')}
      onDragOver=${e => { e.preventDefault(); if (!ctl && !yuklemeYok) setDropping(true); }} onDragLeave=${e => { if (e.currentTarget === e.target) setDropping(false); }} onDrop=${e => { e.preventDefault(); setDropping(false); if (!ctl && !yuklemeYok) onFile(e.dataTransfer.files[0]); }}>
    ${grid ? html`<div className="bp-grid"></div>` : null}
    ${mode3d && (doc.kind === 'step' || model3d) ? html`<${Step3D} data=${doc.kind === 'step' ? doc.data : model3d.data} theme=${theme} fa=${doc.kind === 'step' ? doc.fa : model3d.fa} />` : html`
    <div ref=${st} className=${'bp-stage ' + (drag ? 'drag' : '')} onPointerDown=${pd} onPointerMove=${pm} onPointerUp=${pu} onPointerCancel=${pu}
      onDoubleClick=${e => { if (adding) return; const r = st.current.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); }}>
      <div className="bp-canvas" style=${{ transform: 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.k + ')' }}>
        ${doc.kind === 'pdf' && (imgUrl || loUrl) ? html`<img className="pdfimg" src=${(hiWant || !loUrl) && imgUrl ? imgUrl : loUrl || imgUrl} alt="" draggable="false" />` : null}
        <svg ref=${svgRef} key=${doc.key} viewBox=${'0 0 ' + doc.w + ' ' + doc.h} preserveAspectRatio="xMidYMid meet" role="img" aria-label=${'Teknik resim ' + doc.name}>
          ${doc.kind === 'demo' && !doc.empty ? html`<${Art} dims=${dims} uid=${uid} />` : null}
          ${doc.kind === 'pdf' && deep && z.k >= 1.12 ? html`<g className="deep"><rect x=${deep.x} y=${deep.y} width=${deep.w} height=${deep.h} className="deepbg" /><image href=${deep.url} x=${deep.x} y=${deep.y} width=${deep.w} height=${deep.h} preserveAspectRatio="none" /></g>` : null}
          ${doc.kind === 'step' ? html`<g dangerouslySetInnerHTML=${{ __html: doc.svg }}></g>` : null}
          ${props && !RO && doc.kind === 'pdf' ? html`<g className="phls">${props.map((p, i) => p.ar && (lowOn || p.lvl !== 'low' || p.on) ? html`<g key=${'h' + i} className=${'phl ' + p.lvl + (p.on ? ' on' : '')} transform=${'translate(' + p.ar[0] + ' ' + p.ar[1] + ') rotate(' + (p.ar[4] * 180 / Math.PI) + ')'} onClick=${e => { e.stopPropagation(); setProps(Object.assign(props.map((q, j) => j === i ? Object.assign({}, q, { on: !q.on }) : q), { stats: props.stats })); }}><rect x=${-p.ar[2] - p.ar[3] * 0.4} y=${-p.ar[3] * 1.25} width=${2 * p.ar[2] + p.ar[3] * 0.8} height=${p.ar[3] * 2.5} rx=${p.ar[3] * 0.4} style=${{ strokeWidth: 2.2 * U }} /></g>` : null)}</g>` : null}
          ${ctl && ctl.overlay && onPrimary ? ctl.overlay(doc, U) : null}
          ${leadLayer}
          ${balloonsLayer}
          ${regRect ? html`<rect className="regsel" x=${regRect.x} y=${regRect.y} width=${regRect.w} height=${regRect.h} style=${{ strokeWidth: 2 * U }} />` : null}
          ${onPrimary && ctl && ctl.pins ? ctl.pins.map(p => html`<g key=${'pin' + p.id} transform=${'translate(' + p.x + ' ' + p.y + ') scale(' + U + ')'}><g className=${'pin ' + (p.status === 'done' ? 'done' : '')} onClick=${e => { e.stopPropagation(); setPinSel(p.id); setSel(null); }} role="button" aria-label="Operatör notu"><path d="M0 0C-15 -15 -15 -38 0 -38C15 -38 15 -15 0 0Z" /><text y="-22">${p.status === 'done' ? '✓' : '!'}</text></g></g>`) : null}
          ${pinEdit ? html`<g transform=${'translate(' + pinEdit.x + ' ' + pinEdit.y + ') scale(' + U + ')'}><g className="pin ghostpin"><path d="M0 0C-15 -15 -15 -38 0 -38C15 -38 15 -15 0 0Z" /></g></g>` : null}
          ${edit && edit.isNew ? html`<g transform=${'translate(' + edit.x + ' ' + edit.y + ') scale(' + U + ')'}><circle r="16" className="ghost" /></g>` : null}
        </svg></div></div>`}
    <div className="bp-top">
      <div className="bp-title"><b>${doc.name}${doc.rev ? html`<span className="rev">REV ${doc.rev}</span>` : null}<span className="src">${doc.mk || badge}</span>${RO && ctl.eskiCizim ? html`<span className="src eski"><${I} n="alert" s=${11} w=${3} /> ${ESKI_CIZIM[ctl.eskiCizim].rozet}</span>` : RO ? html`<span className="src lock"><${I} n="check" s=${11} w=${3} /> KALİTE ONAYLI</span>` : null}</b><span className="mono">${doc.sub}</span>
        ${doc.kind === 'step' || pkgModel ? html`<div className="segs"><button className=${'seg ' + (!mode3d ? 'on' : '')} onClick=${() => setMode3d(false)}><${I} n="ruler" s=${16} />Teknik resim</button><button className=${'seg ' + (mode3d ? 'on' : '')} onClick=${open3d}><${I} n="cube" s=${16} />3B model</button></div>` : null}
        ${doc.kind === 'pdf' && doc.pages > 1 ? html`<div className="segs"><button className="seg" disabled=${doc.page <= 1} onClick=${() => showPdfPage(doc.page - 1, doc.file, doc.baseKey).then(() => setBusy(null))}>‹</button><span className="mono" style=${{ padding: '0 8px' }}>${doc.page} / ${doc.pages}</span><button className="seg" disabled=${doc.page >= doc.pages} onClick=${() => showPdfPage(doc.page + 1, doc.file, doc.baseKey).then(() => setBusy(null))}>›</button></div>` : null}
      </div>
      <div className="tools">
        ${!ctl && !yuklemeYok ? T('upload', false, () => fileRef.current.click(), 'PDF / STEP yükle') : null}${T(fs ? 'x' : 'expand', fs, () => setFs(!fs), fs ? 'Odak modundan çık' : 'Odak modu · tam ekran')}${T('layers', drawer === 'lib', () => setDrawer(drawer === 'lib' ? null : 'lib'), 'Dokümanlar')}
        <span className="tsep"></span>
        ${!mode3d ? html`${ctl && ctl.onPin && onPrimary ? T('flag', pinMode, () => { setPinMode(!pinMode); setAdding(false); setSel(null); }, 'Resim üzerine geri bildirim') : null}${!RO && onPrimary ? T('target', adding, () => { setAdding(!adding); setRegMode(false); setSel(null); }, 'Kontrol noktası ekle') : null}${!RO && onPrimary && bal.length ? T('msel', selMode, () => { setSelMode(!selMode); setMsel([]); setAdding(false); setRegMode(false); setPinMode(false); setSel(null); }, 'Çoklu seç · CMM / Elle') : null}${!RO && onPrimary && doc.kind === 'pdf' ? T('scan', regMode, () => { setRegMode(!regMode); setAdding(false); setPinMode(false); setSel(null); }, 'Bölge oku · ölçüyü çerçeve içine al') : null}${T('list', drawer === 'insp', () => setDrawer(drawer === 'insp' ? null : 'insp'), 'Ölçüm listesi')}${T('eye', showB, () => setShowB(!showB), 'Balonları göster')}
          ${doc.kind !== 'pdf' ? T('ruler', dims, () => setDims(!dims), 'Ölçüler') : null}${doc.kind === 'step' ? T('dash', hidden, () => setHidden(!hidden), 'Gizli çizgiler') : null}${T('grid', grid, () => setGrid(!grid), 'Izgara')}
          <span className="tsep"></span>${T('zin', 0, () => { const c = ctr(); zoomAt(1.3, c[0], c[1]); }, 'Yakınlaştır')}${T('zout', 0, () => { const c = ctr(); zoomAt(1 / 1.3, c[0], c[1]); }, 'Uzaklaştır')}${T('fit', 0, () => setZ({ k: 1, x: 0, y: 0 }), 'Sığdır')}
          ${doc.kind === 'step' ? T('download', 0, exportSvg, 'Teknik resmi SVG indir') : null}` : null}
      </div>
    </div>
    ${yuklemeYok ? null : html`<input ref=${fileRef} type="file" accept=".pdf,.step,.stp,.p21,.igs,.iges,.stl,application/pdf" style=${{ display: 'none' }} onChange=${e => { onFile(e.target.files[0]); e.target.value = ''; }} />`}
    ${!mode3d ? html`<span className="zoomlbl">${Math.round(z.k * 100)}% · ${nMeas}/${bal.length} ölçüldü${nBad ? html` · <b style=${{ color: 'var(--stop)' }}>${nBad} red</b>` : null}${nBad && ctl?.retGerekcesi ? html` · <span className="retneden">${ctl.retGerekcesi}</span>` : null}</span>` : null}
    ${pinMode ? html`<div className="hintbar glass"><${I} n="flag" s=${18} />Notu bırakmak istediğin yere dokun<button className="btn" style=${{ height: 36 }} onClick=${() => setPinMode(false)}>Vazgeç</button></div>` : null}
    ${selMode ? html`<div className="hintbar glass selbar" onPointerDown=${e => e.stopPropagation()}><${I} n="msel" s=${18} /><span><b>${msel.length}</b> balon seçili<small>Balona dokun ya da çerçeve çiz</small></span>
      <button className="btn" style=${{ height: 36 }} onClick=${() => setMsel(msel.length === bal.length ? [] : bal.map(x => x.id))}>${msel.length === bal.length ? 'Hiçbiri' : 'Tümü'}</button>
      <button className="btn" style=${{ height: 36, color: 'var(--man)' }} disabled=${!msel.length} onClick=${() => setMeth(msel, 'man')}><${I} n="ruler" s=${16} />Elle</button>
      <button className="btn" style=${{ height: 36, color: 'var(--cmm)' }} disabled=${!msel.length} onClick=${() => setMeth(msel, 'cmm')}><${I} n="hex" s=${16} />CMM</button>
      <button className="btn pri" style=${{ height: 36 }} onClick=${() => { setSelMode(false); setMsel([]); }}>Bitti</button></div>` : null}
    ${regMode ? html`<div className="hintbar glass"><${I} n="scan" s=${18} />Okunacak ölçüyü parmağınla çerçeve içine al<button className="btn" style=${{ height: 36 }} onClick=${() => { setRegMode(false); setRegRect(null); }}>Vazgeç</button></div>` : null}
    ${adding ? html`<div className="hintbar glass"><${I} n="target" s=${18} />Resimde ölçünün yanına dokun<button className="btn" style=${{ height: 36 }} onClick=${() => setAdding(false)}>Vazgeç</button></div>` : null}
    ${dropping ? html`<div className="dropz"><div><${I} n="upload" s=${54} /><b>Bırak: PDF veya STEP</b><span>Dosya bilgisayarından çıkmaz · internetsiz çalışır</span></div></div>` : null}

    ${drawer === 'lib' ? html`<div className="drawer glass" onPointerDown=${e => e.stopPropagation()}>
      <div className="dh"><b>Dokümanlar</b><button className="x" onClick=${() => setDrawer(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
      ${ctl ? html`<span className="over">İş paketi dosyaları</span>${(ctl.files || []).map(f => html`<button key=${f.name} className=${'docrow ' + ((doc.file === f.name) ? 'cur' : '')} onClick=${() => openBytes(f.bytes, f.name, 'pkg')}><span className=${'dk ' + (f.kind === 'pdf' ? 'pdf' : 'step')}>${f.kind === 'pdf' ? 'PDF' : f.name.split('.').pop().toUpperCase().slice(0, 4)}</span><div><b>${f.name}</b><span>${(f.bytes.length / 1024).toFixed(0)} KB${f.name === ctl.primary ? ' · ana resim' : ''}</span></div></button>`)}` : html`<${Fragment}>
      ${yuklemeYok ? null : html`<button className="upl" onClick=${() => fileRef.current.click()}><${I} n="upload" s=${28} /><div><b>PDF veya STEP yükle</b><span>Sürükle-bırak da olur · .pdf .step .stp .igs .stl</span></div></button>`}
      ${lib.length ? html`<span className="over">Bu oturumda açılanlar</span>${lib.map(l => html`<button key=${l.name} className="docrow" onClick=${() => openBytes(l.bytes, l.name, 'lib')}><span className=${'dk ' + l.kind}>${l.kind === 'pdf' ? 'PDF' : 'STEP'}</span><div><b>${l.name}</b><span>${l.sub}</span></div></button>`)}` : null}
      <span className="over">Örnekler</span>
      ${gorunenOrnekler(SAMPLES, ornekVerisiVar).map(s => html`<button key=${s.id} className=${'docrow ' + ((doc.file || doc.name) === s.name || (s.kind === 'demo' && doc.kind === 'demo') ? 'cur' : '')} onClick=${() => openSample(s)}><span className=${'dk ' + s.kind}>${{ demo: 'SVG', pdf: 'PDF', step: 'STEP' }[s.kind]}</span><div><b>${s.name}</b><span>${s.sub}</span></div></button>`)}</${Fragment}>`}
    </div>` : null}

    ${drawer === 'insp' ? html`<div className="drawer glass wide" onPointerDown=${e => e.stopPropagation()}>
      <div className="dh"><b>Ölçüm listesi</b><span className="over">${nMeas}/${bal.length} · ${nBad} red</span><button className="x" onClick=${() => setDrawer(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
      <div className="insp">${bal.length ? bal.map(x => { const r = meas[x.id]; return html`<button key=${x.id} className=${'irow ' + (sel === x.id ? 'cur' : '')} onClick=${() => { setSel(x.id); setVal(''); }}>
        <span className=${'n ' + (methOf(x) === 'cmm' ? 'hx ' : '') + (r ? (r.ok ? 'ok' : 'nok') : '')}>${x.id}</span><div><b className="mono">${x.nom}</b><span>${x.tol} · ${x.tool} · ${METH[methOf(x)].l}</span></div><em className=${r ? (r.ok ? 'ok' : 'nok') : ''}>${r ? r.v : '—'}</em></button>`; }) : html`<p className="muted">Henüz kontrol noktası yok. <b>◎</b> ile resme dokunarak ekle.</p>`}</div>
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn" style=${{ flex: 1 }} onClick=${exportCsv} disabled=${!bal.length}><${I} n="download" s=${18} />CSV rapor</button><button className="btn" onClick=${() => { setMeas({}); persist(bal, {}); }} disabled=${!nMeas}>Sıfırla</button></div>
    </div>` : null}

    ${props && !RO ? (() => {
      const S = props.stats || {}, LV = [['high', 'Yüksek güven', 'var(--run)'], ['mid', 'Kontrol et', 'var(--hold)'], ['low', 'Düşük güven', 'var(--stop)']];
      const tog = i => setProps(Object.assign(props.map((q, j) => j === i ? Object.assign({}, q, { on: !q.on }) : q), { stats: props.stats }));
      const setAll = (f, v) => setProps(Object.assign(props.map(q => f(q) ? Object.assign({}, q, { on: v }) : q), { stats: props.stats }));
      const elim = (S.table || 0) + (S.border || 0) + (S.notes || 0) + (S.prose || 0);
      return html`<div className="drawer glass wide props" onPointerDown=${e => e.stopPropagation()}>
      <div className="dh"><div><span className="over" style=${{ color: 'var(--done)' }}>${doc.kind === 'step' ? 'Modelden çıkarıldı' : S.ocr ? 'Görüntüden okundu (OCR)' : 'PDF metninden okundu'}</span><b style=${{ display: 'block' }}>${props.length} ölçü bulundu</b></div><button className="x" onClick=${() => setProps(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></div>
      ${doc.kind === 'pdf' && S.items != null ? html`<div className="pstats">${LV.map(([k, l, c]) => html`<span key=${k} style=${{ '--c': c }}><i></i>${S[k] || 0} ${l.toLowerCase()}</span>`)}${elim ? html`<em>${elim} yazı elendi: ${[S.table && S.table + ' antet/tablo', S.border && S.border + ' pafta kenarı', S.notes && S.notes + ' not', S.prose && S.prose + ' açıklama'].filter(Boolean).join(' · ')}</em>` : null}</div>` : html`<p className="muted" style=${{ margin: 0 }}>Kontrol noktası olacakları seç. Tolerans yazmayanlara genel tolerans uygulanır.</p>`}
      <div className="insp">${doc.kind !== 'pdf' ? props.map((p, i) => html`<label key=${i} className="irow"><input type="checkbox" checked=${p.on} onChange=${() => tog(i)} /><div><b className="mono">${p.nom}</b><span>${p.l} · ${p.tol}${p.unknown ? ' · tablo dışı geçme!' : ''}</span></div><em>${p.tool}</em></label>`)
        : LV.map(([k, l, c]) => { const rows = props.map((p, i) => [p, i]).filter(([p]) => (p.lvl || 'high') === k); if (!rows.length) return null; const hide = k === 'low' && !lowOn; return html`<${Fragment} key=${k}><div className="pgh" style=${{ '--c': c }}><i></i>${l}<span>${rows.length}</span>${k === 'low' ? html`<button className="lnk" onClick=${() => setLowOn(!lowOn)}>${lowOn ? 'Gizle' : 'Göster'}</button>` : html`<button className="lnk" onClick=${() => setAll(p => (p.lvl || 'high') === k, !rows.every(([p]) => p.on))}>${rows.every(([p]) => p.on) ? 'Hiçbiri' : 'Tümü'}</button>`}</div>
          ${hide ? null : rows.map(([p, i]) => html`<label key=${i} className=${'irow ' + (p.lvl || '')}><input type="checkbox" checked=${p.on} onChange=${() => tog(i)} /><div><b className="mono">${p.nom}</b><span>${p.l} · ${p.tol}${p.note ? ' · ' + p.note : ''}${p.unknown ? ' · tablo dışı geçme!' : ''}</span>${p.why ? html`<small>${p.why}</small>` : null}</div><em>${p.tool}</em></label>`)}</${Fragment}>`; })}</div>
      ${doc.kind === 'pdf' ? html`<div className="pacts"><button className="btn" onClick=${() => { setRegMode(true); setAdding(false); setPinMode(false); }}><${I} n="scan" s=${18} />Bölge oku</button>${!S.ocr ? html`<button className="btn" onClick=${ocrPage}><${I} n="search" s=${18} />Görüntüden oku</button>` : null}</div>` : null}
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => setAll(() => true, !props.every(q => q.on))}>${props.every(q => q.on) ? 'Hiçbiri' : 'Tümü'}</button><button className="btn pri" style=${{ flex: 1 }} onClick=${acceptProps} disabled=${!props.some(p => p.on)}><${I} n="check" s=${18} />${props.filter(p => p.on).length} noktayı ekle</button></div>
    </div>`; })() : null}

    ${pwAsk ? html`<div className="pwask glass" onPointerDown=${e => e.stopPropagation()}><h3><${I} n="lock" s=${20} />Şifreli PDF</h3><p className="muted">${pwAsk.again ? 'Şifre yanlış, tekrar dene.' : 'Bu teknik resim şifreyle korunuyor.'}</p>
      <input type="password" autoFocus value=${pwAsk.v} placeholder="PDF şifresi" onChange=${e => setPwAsk(Object.assign({}, pwAsk, { v: e.target.value }))} onKeyDown=${e => { if (e.key === 'Enter') { const r = pwRef.current; setPwAsk(null); r && r(pwAsk.v); } }} />
      <div style=${{ display: 'flex', gap: 8 }}><button className="btn" onClick=${() => { const r = pwRef.current; setPwAsk(null); r && r(null); }}>Vazgeç</button><button className="btn pri" style=${{ flex: 1 }} onClick=${() => { const r = pwRef.current; setPwAsk(null); r && r(pwAsk.v); }}>Aç</button></div></div>` : null}

    ${b && !edit && !mode3d && !pinEdit && !(ctl && ctl.hideSpec) ? html`<div key=${b.id} className="spec glass" onPointerDown=${e => e.stopPropagation()}>
      <h3><span className="n">${b.id}</span>${b.l}<button className="x" style=${{ marginLeft: 'auto' }} onClick=${() => setEdit({ id: b.id, text: b.nom.replace(/^(\d+)× /, '$1x ') + (/^[±+−-]/.test(b.tol) && !/2768/.test(b.tol) && !/ [A-Za-z]{1,2}\d/.test(b.nom) ? ' ' + b.tol.replace(/−/g, '-').replace(' / ', '/') : ''), label: b.l })} aria-label="Düzenle" hidden=${RO}><${I} n="edit" s=${18} /></button><button className="x" onClick=${() => setSel(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></h3>
      <div className="nom">${b.nom}<small>${b.tol}</small></div>
      ${!b.gauge ? html`<div className="tolbar"><div className="band"></div><span className="lim" style=${{ left: '15%' }}>${b.min}</span><span className="lim" style=${{ left: '85%' }}>${b.max}</span>${m ? html`<i className="mk" style=${{ left: pos(m.v) + '%' }}></i>` : null}</div>` : null}
      <div className="meta"><span>Ölçü aleti</span>${ctl && ctl.aletZorunlu && (!ctl.noMeasure || (ctl.opIds || []).includes(b.id)) ? html`<${AletSecimi} aletler=${aletler} tool=${b.tool} />` : html`<b>${b.tool}${m && m.gno ? ' · ' + m.gno : ''}</b>`}</div>
      <div className="meta"><span>Ölçüm yöntemi</span>${RO ? html`<b className=${'mth ' + methOf(b)}>${METH[methOf(b)].l}</b>` : html`<div className="segs mthseg">${['man', 'cmm'].map(k => html`<button key=${k} className=${'seg m-' + k + ' ' + (methOf(b) === k ? 'on' : '')} onClick=${() => setMeth([b.id], k)}>${METH[k].l}</button>`)}</div>`}</div>
      ${b.freq ? html`<div className="meta"><span>Kontrol sıklığı</span><b style=${b.crit ? { color: 'var(--stop)' } : null}>${b.freq}${b.crit ? ' · KRİTİK' : ''}</b></div>` : null}
      ${m ? html`<div className=${'verdict ' + (m.ok ? 'ok' : 'nok')}><${I} n=${m.ok ? 'check' : 'alert'} s=${18} />${m.ok ? 'Uygun' : 'Tolerans dışı'} · ${m.v}</div>` : null}
      ${ctl && ctl.noMeasure && !(ctl.opIds || []).includes(b.id) ? html`<div className="qinfo"><${I} n="target" s=${18} /><span>Bu ölçü <b>kalite istasyonunda</b> yapılır${b.freq ? ' · ' + b.freq : ''}.</span></div>` : b.gauge ? html`<div className="measure"><button className="btn" style=${{ flex: 1, color: 'var(--run)' }} onClick=${() => saveMeasure('ok')}><${I} n="check" s=${18} />Geçer</button><button className="btn" style=${{ flex: 1, color: 'var(--stop)' }} onClick=${() => saveMeasure('nok')}><${I} n="x" s=${18} />Geçmez</button></div>`
        : suggest ? html`<div className="suggest"><${I} n="alert" s=${22} /><div><b>${suggest.v} tolerans dışında</b><span><b className="mono">${suggest.alt}</b> mi demek istedin? Virgül kaymış olabilir.</span></div></div><div className="measure"><button className="btn pri" style=${{ flex: 1 }} onClick=${() => saveMeasure(null, suggest.alt)}><${I} n="check" s=${18} />${suggest.alt} kaydet</button><button className="btn" onClick=${() => saveMeasure(null, suggest.v)}>${suggest.v} doğru</button></div>`
        : html`<div className="measure"><input inputMode="decimal" placeholder="Değer" value=${val} onChange=${e => setVal(e.target.value)} onKeyDown=${e => e.key === 'Enter' && saveMeasure()} aria-label="Ölçülen değer" autoFocus /><button className="btn pri" onClick=${() => saveMeasure()}><${I} n="check" s=${20} />Kaydet</button></div>`}
    </div>` : null}

    ${edit && !mode3d ? html`<div className="spec glass" onPointerDown=${e => e.stopPropagation()}>
      <h3><span className="n">${edit.isNew ? '+' : edit.id}</span>${edit.isNew ? 'Yeni kontrol noktası' : 'Noktayı düzenle'}<button className="x" style=${{ marginLeft: 'auto' }} onClick=${() => setEdit(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></h3>
      <label className="fld"><span className="over">Ölçü (resimde yazdığı gibi)</span><input className="mono" autoFocus placeholder="Ø40 H7 · 18 ±0.05 · M8x1.25" value=${edit.text} onChange=${e => setEdit(Object.assign({}, edit, { text: e.target.value }))} onKeyDown=${e => e.key === 'Enter' && applyEdit()} /></label>
      ${(() => { const p = edit.text ? AKTol.parse(edit.text, { cls: doc.cls || 'm' }) : null; return p ? html`<div className="verdict ok" style=${{ background: 'var(--panel2)', color: 'var(--ink)' }}><span className="mono">${p.nomText}</span><span style=${{ marginLeft: 'auto' }} className="mono">${p.min} – ${p.max}</span></div><div className="meta"><span>${p.tolText}</span><b>${p.tool}</b></div>` : edit.text ? html`<div className="verdict nok">Biçim tanınmadı</div>` : html`<div className="meta"><span>H7, g6 gibi geçmeler ISO 286'dan hesaplanır</span></div>`; })()}
      <label className="fld"><span className="over">Etiket (isteğe bağlı)</span><input placeholder="örn. Merkez delik" value=${edit.label} onChange=${e => setEdit(Object.assign({}, edit, { label: e.target.value }))} /></label>
      <div className="measure">${!edit.isNew ? html`<button className="btn" style=${{ color: 'var(--stop)' }} onClick=${() => removeBalloon(edit.id)}><${I} n="trash" s=${18} /></button>` : null}<button className="btn pri" style=${{ flex: 1 }} onClick=${applyEdit}><${I} n="check" s=${20} />Kaydet</button></div>
    </div>` : null}

    ${pinEdit ? html`<div className="spec glass" onPointerDown=${e => e.stopPropagation()}>
      <h3><span className="n" style=${{ background: 'var(--hazard)', color: 'var(--on-hazard)' }}>!</span>Resim üzerine not<button className="x" style=${{ marginLeft: 'auto' }} onClick=${() => setPinEdit(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></h3>
      <div className="quick">${['Ölçü okunmuyor', 'Tolerans hatalı görünüyor', 'Revizyon farklı', 'Ölçü aleti uygun değil', 'Adım eksik / yanlış'].map(t => html`<button key=${t} className=${'qr ' + (pinEdit.tags.includes(t) ? 'on' : '')} onClick=${() => setPinEdit(Object.assign({}, pinEdit, { tags: pinEdit.tags.includes(t) ? pinEdit.tags.filter(x => x !== t) : pinEdit.tags.concat([t]) }))}>${t}</button>`)}</div>
      <label className="fld"><span className="over">Açıklama (isteğe bağlı)</span><input value=${pinEdit.text} onChange=${e => setPinEdit(Object.assign({}, pinEdit, { text: e.target.value }))} placeholder="Kısaca yaz" /></label>
      <button className="btn pri" disabled=${!pinEdit.tags.length && !pinEdit.text} onClick=${() => { ctl.onPin({ x: pinEdit.x, y: pinEdit.y, text: pinEdit.tags.concat(pinEdit.text ? [pinEdit.text] : []).join(' · ') }); setPinEdit(null); }}><${I} n="next" s=${18} />Hazırlığa gönder</button>
    </div>` : null}
    ${pinSel && ctl && ctl.pins && ctl.pins.find(p => p.id === pinSel) ? (() => { const p = ctl.pins.find(q => q.id === pinSel); return html`<div className="spec glass" onPointerDown=${e => e.stopPropagation()}>
      <h3><span className="n" style=${{ background: p.status === 'done' ? 'var(--run)' : 'var(--hazard)', color: 'var(--on-hazard)' }}>${p.status === 'done' ? '✓' : '!'}</span>Operatör notu<button className="x" style=${{ marginLeft: 'auto' }} onClick=${() => setPinSel(null)} aria-label="Kapat"><${I} n="x" s=${18} /></button></h3>
      <div className="pintx">${p.text}</div><div className="meta"><span>${p.by} · ${new Date(p.at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span><b>${p.status === 'done' ? 'Çözüldü' : 'Açık'}</b></div>
      ${p.reply ? html`<div className="verdict ok">${p.reply}</div>` : null}
      ${ctl.onPinResolve && p.status !== 'done' ? html`<button className="btn pri" onClick=${() => { ctl.onPinResolve(p.id); setPinSel(null); }}><${I} n="check" s=${18} />Çözüldü olarak işaretle</button>` : null}
    </div>`; })() : null}
    ${busy ? html`<div className="busy"><div className="scan"></div><div className="bcard glass"><b>${busy.t}</b>${busy.pct != null ? html`<div className="bprog"><i style=${{ width: Math.round(busy.pct * 100) + '%' }}></i></div>` : null}${busy.steps.map((s, i) => html`<div key=${i} className=${'bs ' + (i < busy.i ? 'ok' : i === busy.i ? 'cur' : '')}><span>${i < busy.i ? html`<${I} n="check" s=${14} w=${3} />` : i === busy.i ? html`<i className="spin"></i>` : ''}</span>${s}</div>`)}</div></div>` : null}
  </div>`;
}


export const BlueprintM = React.memo(Blueprint);
