import { AKStore } from '../data/store';
import { AKStep } from '../core/stepdraw';
import { Fragment, I, html, perf, useEffect, useRef, useState } from './temel';
import { getOcct, loadLib, tick } from './yukleyici';
import { RCFG, cfgSig } from './pdf';

/* ── 3B model işleme (STEP / IGES / STL) + önbellek ── */
export const MODELCACHE = new Map();
/* dosya içerik özeti (önbellek anahtarı): SHA-256, yoksa FNV-1a */
export const HASHES = new WeakMap();
export async function fileHash(u8) {
  if (HASHES.has(u8)) return HASHES.get(u8);
  let h;
  try { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8)); h = Array.from(d.subarray(0, 12), b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let a = 0x811c9dc5, c = 0x9dc5811c; for (let i = 0; i < u8.length; i++) { a = Math.imul(a ^ u8[i], 0x01000193); c = Math.imul(c ^ u8[u8.length - 1 - i], 0x01000193); } h = (a >>> 0).toString(16) + (c >>> 0).toString(16); }
  h += '-' + u8.length; HASHES.set(u8, h); return h;
}
/** 3B görünüm için sıkı veri: tipli diziler (IndexedDB'ye ve pakete doğrudan yazılabilir) */
export function compact3d(r, M) {
  const meshes = r.meshes.map(m => ({ p: Float32Array.from(m.attributes.position.array), n: m.attributes.normal ? Float32Array.from(m.attributes.normal.array) : null, i: Uint32Array.from(m.index.array) }));
  const ep = new Float32Array(M.feature.length * 6); M.feature.forEach((e, i) => { for (let k = 0; k < 3; k++) { ep[6 * i + k] = M.pos[3 * e.a + k]; ep[6 * i + 3 + k] = M.pos[3 * e.b + k]; } });
  return { meshes, ep, bbox: { mn: Array.from(M.bbox.mn), mx: Array.from(M.bbox.mx) }, diag: M.diag };
}
/**
 * STEP/IGES/STL → { kind, fa, V (3B), D (teknik resim) }. Sıra: bellek → paketle gelen hazır veri → IndexedDB → hesapla.
 * opt.need: 'draw' (resim gerekli) | '3d' (yalnız 3B: resim çizilmez, ~yarı süre)
 */
export const MESHQ = { coarse: 0.003, normal: 0.0012, fine: 0.0005 }, MODEL_KEYS = ['mesh', 'hidden', 'fa', 'autoDim'];
export async function processModel(bytes, name, onStep, opt) {
  opt = opt || {}; const need = opt.need || 'draw';
  const mc = opt.cfg || RCFG, sig = cfgSig(mc, MODEL_KEYS), h = await fileHash(bytes), key = 'model:' + h + sig, ok = r => r && r.V && (need === '3d' || r.D);
  const t0 = performance.now();
  let rec = opt.fresh ? null : MODELCACHE.get(key);
  if (!ok(rec) && !opt.fresh && opt.derived && ok(opt.derived[h + sig])) { rec = opt.derived[h + sig]; perf('model:paketten', t0); }
  if (!ok(rec) && !opt.fresh) { const c = await AKStore.Cache.get(key); if (ok(c)) { rec = c; perf('model:onbellek', t0); } }
  if (ok(rec)) { MODELCACHE.set(key, rec); return rec; }
  // Büyük ekran modeli hesaplatmaz (geometri çekirdeği ağırdır): yalnız hazır veri varsa gösterir.
  if (opt.yalnizHazir) return null;
  const low = name.toLowerCase(), isStl = /\.stl$/.test(low), isIges = /\.(igs|iges)$/.test(low);
  onStep(0); await tick(60);
  let r, tR = 0;
  if (isStl) r = AKStep.parseSTL(bytes);
  else { const occt = await getOcct(); onStep(1); await tick(); tR = performance.now(); r = isIges ? await occt.ReadIgesFile(bytes, null) : await occt.ReadStepFile(bytes, { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: MESHQ[mc.mesh] || 0.0012, angularDeflection: mc.mesh === 'fine' ? 0.15 : mc.mesh === 'coarse' ? 0.4 : 0.25 }); }
  if (tR) perf('step:read', tR);
  if (!r || !r.success || !r.meshes.length) throw new Error('Dosyada okunabilir katı model bulunamadı.');
  onStep(2); await tick();
  let t1 = performance.now(); const M = AKStep.buildModel(r, { regionGrow: isStl }); perf('step:topoloji', t1);
  onStep(3); await tick();
  let D = null, fa;
  if (need === 'draw') { t1 = performance.now(); D = AKStep.makeDrawing(M, { name, hidden: mc.hidden !== false, fa: { X: 0, Y: 1, Z: 2 }[mc.fa], dims: mc.autoDim !== false }); perf('step:resim', t1); fa = 'XYZ'.indexOf(D.info.frontAxis); }
  else fa = AKStep.frontAxis(M);
  onStep(4); await tick(150);
  rec = Object.assign({}, rec || {}, { kind: isStl ? 'STL' : isIges ? 'IGES' : 'STEP', fa, V: compact3d(r, M) }, D ? { D } : null);
  MODELCACHE.set(key, rec); AKStore.Cache.put(key, rec);
  return rec;
}
export const isModelName = n => /\.(step|stp|p21|igs|iges|stl)$/i.test(n);

/* ── STEP 3B görüntüleyici ── */
// sade: araç çubuğu yok, dokunuşla dönmez, kendi etrafında yavaşça döner (terminal büyük ekranı).
export function Step3D({ data, theme, fa, sade = false }) {
  const host = useRef(null), api = useRef<any>({});
  const [clip, setClip] = useState(100), [wire, setWire] = useState(false), [spin, setSpin] = useState(sade), [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true, raf = 0, ro;
    (async () => {
      const tS = performance.now(); await loadLib('three'); await loadLib('orbit'); if (!alive) return;
      const THREE = window.THREE, el = host.current;
      const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); R.setPixelRatio(Math.min(2, devicePixelRatio)); R.localClippingEnabled = true; R.outputEncoding = THREE.sRGBEncoding;
      el.appendChild(R.domElement);
      const S = new THREE.Scene();
      const bb = data.bbox, c = [(bb.mn[0] + bb.mx[0]) / 2, (bb.mn[1] + bb.mx[1]) / 2, (bb.mn[2] + bb.mx[2]) / 2], diag = data.diag;
      const cam = new THREE.PerspectiveCamera(35, 1, diag / 100, diag * 20);
      cam.up.set(0, 0, 1);
      const ctl = new THREE.OrbitControls(cam, R.domElement); ctl.target.set(c[0], c[1], c[2]); ctl.enableDamping = true; ctl.dampingFactor = 0.08;
      const axisN = [0, 0, 0]; axisN[fa] = -1; const plane = new THREE.Plane(new THREE.Vector3(axisN[0], axisN[1], axisN[2]), bb.mx[fa] + 1e-3);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9fb3cc, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const grp = new THREE.Group();
      for (const m of data.meshes) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.p, 3));
        if (m.n) g.setAttribute('normal', new THREE.BufferAttribute(m.n, 3)); g.setIndex(new THREE.BufferAttribute(m.i, 1)); if (!m.n) g.computeVertexNormals();
        grp.add(new THREE.Mesh(g, mat));
      }
      const ep = data.ep;
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
      const emat = new THREE.LineBasicMaterial({ color: 0xffffff, clippingPlanes: [plane] }); const edges = new THREE.LineSegments(eg, emat); grp.add(edges);
      S.add(grp);
      S.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1e24, 0.9));
      const d1 = new THREE.DirectionalLight(0xffffff, 1.1); d1.position.set(1, 1.4, 2); S.add(d1);
      const d2 = new THREE.DirectionalLight(0xffd23f, 0.35); d2.position.set(-2, -1, -1); S.add(d2);
      // zemin ızgarası
      const gh = new THREE.GridHelper(diag * 3, 30, 0x5d6675, 0x2a3038); gh.material.transparent = true; gh.material.opacity = 0.35;
      gh.rotation.x = Math.PI / 2; gh.position.set(c[0], c[1], bb.mn[2] - diag * 0.002);
      S.add(gh);
      const setView = (dir) => { const D = diag * 2.1; const v = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(); if (Math.abs(v.z) > 0.999) v.y -= 0.002; v.normalize().multiplyScalar(D); cam.position.set(c[0] + v.x, c[1] + v.y, c[2] + v.z); ctl.update(); };
      const r3 = [0, 0, 0], u3 = [0, 0, 0], d3 = [0, 0, 0]; d3[fa] = 1; if (fa === 2) u3[1] = 1; else u3[2] = 1;
      const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const rr = cr(u3, d3);
      const views = { front: d3, top: u3, left: rr.map(v => -v), iso: [rr[0] + u3[0] + d3[0], rr[1] + u3[1] + d3[1], rr[2] + u3[2] + d3[2]] };
      setView(views.iso);
      const colorize = () => { const dark = document.documentElement.getAttribute('data-theme') !== 'light'; mat.color.set(dark ? 0x8fa6c4 : 0xc3ccd8); emat.color.set(dark ? 0xdfeaff : 0x12305e); gh.material.color.set(dark ? 0x2a3038 : 0xc9cfd8); };
      colorize();
      const size = () => { const w = el.clientWidth, h = el.clientHeight; R.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      ro = new ResizeObserver(size); ro.observe(el); size();
      const loop = () => { ctl.update(); R.render(S, cam); raf = requestAnimationFrame(loop); }; loop();
      api.current = { setView: k => setView(views[k]), ctl, plane, bb, fa, mat, grp, edges, colorize, R, dispose: () => { cancelAnimationFrame(raf); ro && ro.disconnect(); R.dispose(); R.domElement.remove(); } };
      setReady(true); perf('3b:sahne', tS);
    })();
    return () => { alive = false; api.current.dispose && api.current.dispose(); };
  }, [data]);
  useEffect(() => { const a = api.current; if (!a.plane) return; const lo = a.bb.mn[a.fa], hi = a.bb.mx[a.fa]; a.plane.constant = lo + (hi - lo) * clip / 100 + 1e-3; }, [clip, ready]);
  useEffect(() => { const a = api.current; if (!a.mat) return; a.mat.visible = !wire; }, [wire, ready]);
  useEffect(() => { const a = api.current; if (!a.ctl) return; a.ctl.autoRotate = spin; a.ctl.autoRotateSpeed = sade ? 0.8 : 2.2; a.ctl.enabled = !sade; }, [spin, ready]);
  useEffect(() => { api.current.colorize && api.current.colorize(); }, [theme, ready]);
  const T = (icon, on, fn, label) => html`<button className=${'tool ' + (on ? 'on' : '')} onClick=${fn} aria-label=${label} title=${label}><${I} n=${icon} s=${22} /></button>`;
  return html`<${Fragment}>
    <div ref=${host} className="v3d"></div>
    ${!ready && !sade ? html`<div className="busy"><div className="scan"></div><b>3B görünüm hazırlanıyor…</b></div>` : null}
    ${sade ? null : html`<div className="v3d-bar glass">
      ${['front', 'top', 'left', 'iso'].map(k => html`<button key=${k} className="seg" onClick=${() => api.current.setView && api.current.setView(k)}>${{ front: 'Ön', top: 'Üst', left: 'Sol', iso: 'İzo' }[k]}</button>`)}
      <span className="vsep2"></span>${T('rotate', spin, () => setSpin(!spin), 'Otomatik döndür')}${T('grid', wire, () => setWire(!wire), 'Tel kafes')}
      <label className="clip"><span className="over">Kesit</span><input type="range" min="0" max="100" value=${clip} onChange=${e => setClip(+e.target.value)} aria-label="Kesit düzlemi" /><b className="mono">%${clip}</b></label>
    </div>`}
  </${Fragment}>`;
}

