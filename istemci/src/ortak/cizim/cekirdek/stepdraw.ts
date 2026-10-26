/* Arkon — STEP ağından (OCCT çıktısı) otomatik teknik resim: birinci açı izdüşüm, gizli çizgi ayıklama, delik/mil tanıma, ölçülendirme */
  type Vec = number[];
  /** OCCT (occt-import-js) ya da parseSTL sonucu */
  export interface OcctMesh { name?: string; attributes: { position: { array: ArrayLike<number> } }; index: { array: ArrayLike<number> }; brep_faces?: { first: number; last: number }[] }
  export interface OcctResult { success?: boolean; meshes: OcctMesh[] }
  interface Edge { a: number; b: number; t: number[] }
  interface ViewDir { right: Vec; up: Vec; fwd: Vec }
  interface ProjOpts { res?: number; hidden?: boolean }
  export interface Cylinder { face: number; axis: number; center: Vec; r: number; lo: number; hi: number; cover: number; hole: boolean; kind?: 'hole' | 'boss' | 'arc' }
  export interface DrawMeta { name?: string; fa?: number; res?: number; hidden?: boolean; dims?: boolean; [k: string]: unknown }
  export interface DrawBalloon { id: number; x: number; y: number; l: string; nom: string; tol: string; min: number; max: number; tool: string; gauge: boolean }
  type ViewName = 'front' | 'left' | 'top';
  const V = {
    sub: (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    dot: (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], mul: (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s],
    cross: (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a: Vec): number => Math.hypot(a[0], a[1], a[2]), norm: (a: Vec): Vec => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  };
  const AX: Vec[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const f1 = (v: number): string => { const s = (Math.round(v * 100) / 100).toString(); return s; };

  /** OCCT sonucunu tek, kaynaklanmış (welded) ağa çevirir */
  function buildModel(result: OcctResult, opts: { regionGrow?: boolean; angle?: number } = {}) {
    const P: number[] = [], T: number[] = [], F: number[] = [];
    let faceBase = 0;
    for (const m of result.meshes) {
      const pos = m.attributes.position.array, idx = m.index.array, base = P.length / 3;
      for (let i = 0; i < pos.length; i++) P.push(pos[i]);
      const triFace = new Int32Array(idx.length / 3).fill(-1);
      (m.brep_faces || []).forEach((bf, k) => { for (let t = bf.first; t <= bf.last; t++) triFace[t] = faceBase + k; });
      for (let t = 0; t < idx.length / 3; t++) { T.push(base + idx[3 * t], base + idx[3 * t + 1], base + idx[3 * t + 2]); F.push(triFace[t] >= 0 ? triFace[t] : faceBase + 100000 + t); }
      faceBase += (m.brep_faces || []).length + 1;
    }
    // bbox
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
    const diag = V.len(V.sub(mx, mn));
    // weld
    const q = diag * 1e-6, map = new Map<string, number>(), wpos: number[] = [], remap = new Int32Array(P.length / 3);
    for (let i = 0; i < P.length / 3; i++) {
      const key = Math.round(P[3 * i] / q) + ',' + Math.round(P[3 * i + 1] / q) + ',' + Math.round(P[3 * i + 2] / q);
      let id = map.get(key); if (id === undefined) { id = wpos.length / 3; map.set(key, id); wpos.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); }
      remap[i] = id;
    }
    const tris = new Uint32Array(T.length); for (let i = 0; i < T.length; i++) tris[i] = remap[T[i]];
    const pos = new Float64Array(wpos);
    const nT = tris.length / 3, tn = new Float64Array(nT * 3);
    const pt = (i: number): Vec => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    for (let t = 0; t < nT; t++) { const a = pt(tris[3 * t]), b = pt(tris[3 * t + 1]), c = pt(tris[3 * t + 2]); const n = V.norm(V.cross(V.sub(b, a), V.sub(c, a))); tn[3 * t] = n[0]; tn[3 * t + 1] = n[1]; tn[3 * t + 2] = n[2]; }
    // edge adjacency
    const em = new Map<number, Edge>();
    for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
      const a = tris[3 * t + k], b = tris[3 * t + (k + 1) % 3]; if (a === b) continue;
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      let e = em.get(key); if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), t: [] }; em.set(key, e); } e.t.push(t);
    }
    if (opts.regionGrow) { // STL gibi yüz bilgisi olmayan ağlar: yumuşak bölgeleri tek yüz say
      const par = new Int32Array(nT); for (let t = 0; t < nT; t++) par[t] = t;
      const find = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
      const cs = Math.cos(opts.angle || 0.45);
      for (const e of em.values()) { if (e.t.length !== 2) continue; const a = e.t[0], b = e.t[1]; const d = tn[3 * a] * tn[3 * b] + tn[3 * a + 1] * tn[3 * b + 1] + tn[3 * a + 2] * tn[3 * b + 2]; if (d > cs) { const ra = find(a), rb = find(b); if (ra !== rb) par[ra] = rb; } }
      for (let t = 0; t < nT; t++) F[t] = find(t);
    }
    const feature: Edge[] = [], smooth: Edge[] = [];
    for (const e of em.values()) {
      if (e.t.length !== 2 || F[e.t[0]] !== F[e.t[1]]) feature.push(e);
      else { const n1 = e.t[0], n2 = e.t[1]; const d = tn[3 * n1] * tn[3 * n2] + tn[3 * n1 + 1] * tn[3 * n2 + 1] + tn[3 * n1 + 2] * tn[3 * n2 + 2]; if (d < 0.9999) smooth.push(e); }
    }
    // faces → vertex sets
    const faceVerts = new Map<number, Set<number>>(), faceNorm = new Map<number, number[]>();
    for (let t = 0; t < nT; t++) {
      const f = F[t]; let s = faceVerts.get(f); if (!s) { s = new Set<number>(); faceVerts.set(f, s); faceNorm.set(f, []); }
      s.add(tris[3 * t]); s.add(tris[3 * t + 1]); s.add(tris[3 * t + 2]); faceNorm.get(f)!.push(t);
    }
    return { pos, tris, faceOf: F, tn, feature, smooth, faceVerts, faceTris: faceNorm, bbox: { mn, mx }, diag, pt };
  }

  /** Silindirik yüzleri (delik / mil / radyus) bulur */
  type Model = ReturnType<typeof buildModel>;
  function findCylinders(M: Model): Cylinder[] {
    const out: Cylinder[] = [];
    for (const [f, vs] of M.faceVerts) {
      if (vs.size < 8) continue;
      const ids = Array.from(vs) as number[], tris = M.faceTris.get(f) || [];
      for (let ax = 0; ax < 3; ax++) {
        // yüz normalleri eksene dik mi?
        let par = 0; for (const t of tris) par = Math.max(par, Math.abs(M.tn[3 * t + ax])); if (par > 0.15) continue;
        const u = (ax + 1) % 3, v = (ax + 2) % 3;
        // Kasa daire uydurma
        let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0, n = ids.length;
        for (const i of ids) { const x = M.pos[3 * i + u], y = M.pos[3 * i + v], z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
        const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], bb = [sxz, syz, sz];
        const sol = solve3(A, bb); if (!sol) continue;
        const cx = sol[0] / 2, cy = sol[1] / 2, r = Math.sqrt(sol[2] + cx * cx + cy * cy);
        if (!(r > 0) || r > M.diag) continue;
        let err = 0, amin = Infinity, amax = -Infinity, angs: number[] = [];
        for (const i of ids) { const x = M.pos[3 * i + u] - cx, y = M.pos[3 * i + v] - cy; err = Math.max(err, Math.abs(Math.hypot(x, y) - r)); const w = M.pos[3 * i + ax]; amin = Math.min(amin, w); amax = Math.max(amax, w); angs.push(Math.atan2(y, x)); }
        if (err > Math.max(1e-3 * r, M.diag * 2e-4)) continue;
        angs.sort((a, b) => a - b); let gap = 0; for (let k = 0; k < angs.length; k++) gap = Math.max(gap, (k ? angs[k] - angs[k - 1] : angs[0] + 2 * Math.PI - angs[angs.length - 1]));
        const cover = 2 * Math.PI - gap;
        // iç mi dış mı: normaller merkeze mi bakıyor
        let inward = 0; for (const t of tris) { const a = M.tris[3 * t]; const rx = M.pos[3 * a + u] - cx, ry = M.pos[3 * a + v] - cy; inward += -(M.tn[3 * t + u] * rx + M.tn[3 * t + v] * ry); }
        const c3 = [0, 0, 0]; c3[u] = cx; c3[v] = cy; c3[ax] = (amin + amax) / 2;
        out.push({ face: f, axis: ax, center: c3, r, lo: amin, hi: amax, cover, hole: inward > 0 });
        break;
      }
    }
    // birleştir (aynı eksen/merkez/yarıçap → tek özellik)
    const merged: Cylinder[] = [];
    for (const c of out) {
      const u = (c.axis + 1) % 3, v = (c.axis + 2) % 3, tol = Math.max(0.01, c.r * 0.01);
      const m = merged.find(o => o.axis === c.axis && o.hole === c.hole && Math.abs(o.r - c.r) < tol && Math.abs(o.center[u] - c.center[u]) < tol && Math.abs(o.center[v] - c.center[v]) < tol && c.lo <= o.hi + tol && c.hi >= o.lo - tol);
      if (m) { m.cover = Math.min(2 * Math.PI, m.cover + c.cover); m.lo = Math.min(m.lo, c.lo); m.hi = Math.max(m.hi, c.hi); m.center[c.axis] = (m.lo + m.hi) / 2; }
      else merged.push(Object.assign({}, c, { center: c.center.slice() }));
    }
    return merged.map(c => Object.assign(c, { kind: c.cover > 5.5 ? (c.hole ? 'hole' : 'boss') : 'arc' }));
  }
  function solve3(A: number[][], b: number[]): number[] | null {
    const m = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      if (Math.abs(m[p][i]) < 1e-12) return null; [m[i], m[p]] = [m[p], m[i]];
      for (let k = 0; k < 3; k++) if (k !== i) { const f = m[k][i] / m[i][i]; for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]; }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  /** Bir görünüş için: sağ/yukarı/bakış yönleri; ekran (x sağ, y aşağı) koordinatlarında çizgi parçaları */
  function project(M: Model, view: ViewDir, opt: ProjOpts) {
    const { right, up, fwd } = view; // fwd: bakış yönü (göze doğru = -fwd)
    const toV = (d: Vec): number => -V.dot(d, fwd); // derinlik: büyük = göze yakın
    const n = M.pos.length / 3;
    const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
    let xmn = Infinity, xmx = -Infinity, ymn = Infinity, ymx = -Infinity;
    for (let i = 0; i < n; i++) { const p = [M.pos[3 * i], M.pos[3 * i + 1], M.pos[3 * i + 2]]; X[i] = V.dot(p, right); Y[i] = -V.dot(p, up); Z[i] = toV(p); xmn = Math.min(xmn, X[i]); xmx = Math.max(xmx, X[i]); ymn = Math.min(ymn, Y[i]); ymx = Math.max(ymx, Y[i]); }
    const w = xmx - xmn || 1, h = ymx - ymn || 1;
    const RES = opt.res || 900, px = Math.max(w, h) / RES; // model birimi / piksel
    const W = Math.ceil(w / px) + 3, H = Math.ceil(h / px) + 3;
    const zb = new Float32Array(W * H).fill(-Infinity);
    const sx = (i: number): number => (X[i] - xmn) / px + 1, sy = (i: number): number => (Y[i] - ymn) / px + 1;
    const nT = M.tris.length / 3;
    for (let t = 0; t < nT; t++) {
      const a = M.tris[3 * t], b = M.tris[3 * t + 1], c = M.tris[3 * t + 2];
      const x0 = sx(a), y0 = sy(a), x1 = sx(b), y1 = sy(b), x2 = sx(c), y2 = sy(c);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0); if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
        const cx = xx + .5, cy = yy + .5;
        const l1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area, l2 = ((x0 - cx) * (y1 - cy) - (x1 - cx) * (y0 - cy)) / area, l0 = 1 - l1 - l2;
        if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
        const z = l0 * Z[a] + l1 * Z[b] + l2 * Z[c], k = yy * W + xx; if (z > zb[k]) zb[k] = z;
      }
    }
    const eps = M.diag * 0.002 + px * 1.5;
    const visAt = (x: number, y: number, z: number): boolean => {
      const ix = Math.floor(x), iy = Math.floor(y); let ok = false;
      for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) { const xx = ix + dx, yy = iy + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) { ok = true; continue; } const b = zb[yy * W + xx]; if (z >= b - eps) ok = true; }
      return ok;
    };
    // kenarlar: özellik kenarları + silüet
    const edges = M.feature.slice();
    for (const e of M.smooth) { const d1 = V.dot([M.tn[3 * e.t[0]], M.tn[3 * e.t[0] + 1], M.tn[3 * e.t[0] + 2]], fwd), d2 = V.dot([M.tn[3 * e.t[1]], M.tn[3 * e.t[1] + 1], M.tn[3 * e.t[1] + 2]], fwd); if ((d1 > 1e-6) !== (d2 > 1e-6)) edges.push(e); }
    const vis: number[][] = [], hid: number[][] = [], mask = new Uint8Array(W * H);
    const runsFor = (e: Edge, wantVis: boolean): number[][] => {
      const ax = sx(e.a), ay = sy(e.a), bx = sx(e.b), by = sy(e.b);
      const L = Math.hypot(bx - ax, by - ay); if (L < 0.05) return [];
      const steps = Math.max(2, Math.ceil(L / 0.8)); const runs: number[][] = []; let cur: number[] | null = null;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = Z[e.a] + (Z[e.b] - Z[e.a]) * t;
        let v = visAt(x, y, z);
        if (!wantVis && !v) { const k = Math.floor(y) * W + Math.floor(x); if (mask[k]) v = true; }
        if (v === wantVis) { if (!cur) { cur = [x, y]; runs.push(cur); } cur[2] = x; cur[3] = y; } else cur = null;
      }
      return runs.filter(r => r.length === 4 && Math.hypot(r[2] - r[0], r[3] - r[1]) > 0.6);
    };
    for (const e of edges) for (const r of runsFor(e, true)) { vis.push(r); const L = Math.hypot(r[2] - r[0], r[3] - r[1]), st = Math.max(1, Math.ceil(L)); for (let s = 0; s <= st; s++) { const x = r[0] + (r[2] - r[0]) * s / st, y = r[1] + (r[3] - r[1]) * s / st; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1; } } }
    if (opt.hidden) for (const e of edges) for (const r of runsFor(e, false)) hid.push(r);
    // piksel → model birimi (görünüş kutusu sol-üst = 0,0)
    const toModel = (r: number[]): number[] => r.map(v => (v - 1) * px);
    return { vis: vis.map(toModel), hid: hid.map(toModel), w, h, xmn, ymn, toScreen: (p: Vec): Vec => [V.dot(p, right) - xmn, -V.dot(p, up) - ymn] };
  }

  function views(frontAxis: number) {
    // ön görünüş: +d tarafından bakılır. d=Z → sağ X, yukarı Y; d=Y → sağ X, yukarı Z; d=X → sağ Y, yukarı Z
    const d = AX[frontAxis];
    const u = frontAxis === 2 ? AX[1] : AX[2];
    const r = V.cross(u, d);
    const front = { right: r, up: u, fwd: V.mul(d, -1) };
    const left = { right: d, up: u, fwd: r };              // soldan bakış, ön görünüşün SAĞINA yerleşir (ISO-E)
    const top = { right: r, up: V.mul(d, -1), fwd: V.mul(u, -1) }; // üstten bakış, ön görünüşün ALTINA
    const isoF = V.norm(V.mul(V.add(V.add(r, u), d), -1));
    const isoR = V.norm(V.cross(isoF, u)), isoU = V.norm(V.cross(isoR, isoF));
    const iso = { right: isoR, up: isoU, fwd: isoF };
    return { front, left, top, iso, d, r, u };
  }

  /** Ana fonksiyon: model → { svg, balloons, info } */
  function makeDrawing(M: Model, meta: DrawMeta) {
    const cyl = findCylinders(M);
    const ext = V.sub(M.bbox.mx, M.bbox.mn);
    // ön görünüş ekseni: en çok delik/mil ekseni; yoksa en ince eksen
    const cnt = [0, 0, 0]; cyl.forEach(c => { if (c.kind !== 'arc') cnt[c.axis] += c.r; });
    let fa = cnt.indexOf(Math.max(...cnt)); if (!(cnt[fa] > 0)) fa = ext.indexOf(Math.min(...ext));
    if (meta.fa === 0 || meta.fa === 1 || meta.fa === 2) fa = meta.fa; // Çizim stüdyosu: ön görünüş ekseni elle
    const VW = views(fa);
    const opt = { res: meta.res || 1000, hidden: meta.hidden !== false };
    const P: Record<ViewName | 'iso', ReturnType<typeof project>> = { front: project(M, VW.front, opt), left: project(M, VW.left, opt), top: project(M, VW.top, opt), iso: project(M, VW.iso, { res: 700, hidden: false }) };
    // sayfa: A3 yatay, 1000 × 707 birim (1 birim = 0.42 mm)
    const SW = 1000, SH = 707, U = 1000 / 420; // birim / mm
    const gap = 26, margin = 60;
    const availW = SW - 2 * margin - 2 * gap - 20, availH = SH - 2 * margin - 2 * gap - 40;
    const need = Math.min(availW / (P.front.w + P.left.w), availH / (P.front.h + P.top.h)) / U; // sayfa mm / model mm
    const SCALES = [10, 5, 2, 1, 1 / 2, 1 / 2.5, 1 / 5, 1 / 10, 1 / 20, 1 / 50];
    const sc = SCALES.find(s => s <= need) || 1 / 100;
    const k = sc * U; // birim / model mm
    const fw = P.front.w * k, fh = P.front.h * k, lw = P.left.w * k, th = P.top.h * k;
    const totalW = fw + gap * 2.2 + lw, totalH = fh + gap * 2.2 + th;
    const ox = margin + Math.max(20, (SW - 2 * margin - totalW) / 2 - 40), oy = margin + Math.max(10, (SH - 2 * margin - 40 - totalH) / 2);
    const place: Record<ViewName, [number, number]> = { front: [ox, oy], left: [ox + fw + gap * 2.2, oy], top: [ox, oy + fh + gap * 2.2] };
    const scText = sc >= 1 ? sc + ':1' : '1:' + (Math.round(1 / sc * 10) / 10);
    const out: string[] = [];
    const pathOf = (runs: number[][], x0: number, y0: number, kk: number): string => runs.map(r => 'M' + (x0 + r[0] * kk).toFixed(1) + ' ' + (y0 + r[1] * kk).toFixed(1) + 'L' + (x0 + r[2] * kk).toFixed(1) + ' ' + (y0 + r[3] * kk).toFixed(1)).join('');
    let nPaths = 0;
    const emit = (cls: string, runs: number[][], x0: number, y0: number, kk: number, anim: boolean): void => {
      if (!runs.length) return;
      // çizim animasyonu için ~40 parçaya böl
      const chunks = anim ? Math.min(40, runs.length) : 1, per = Math.ceil(runs.length / chunks);
      for (let i = 0; i < runs.length; i += per) { out.push('<path class="' + cls + (anim ? ' draw glow' : '') + '" pathLength="1" style="animation-delay:' + (nPaths * 0.02).toFixed(2) + 's" d="' + pathOf(runs.slice(i, i + per), x0, y0, kk) + '"/>'); nPaths++; }
    };
    for (const name of ['front', 'left', 'top'] as ViewName[]) { const [x0, y0] = place[name]; emit('hid late', P[name].hid, x0, y0, k, false); emit('ln', P[name].vis, x0, y0, k, true); }
    // izometrik (ölçeksiz) — sağ alt boş alan, antet üstünde
    const regs = [{ x: place.left[0] + lw + gap * 2, y: oy, w: SW - margin + 20 - (place.left[0] + lw + gap * 2), h: fh }, { x: place.left[0], y: oy + fh + gap * 2.2, w: SW - margin - place.left[0], h: SH - 160 - (oy + fh + gap * 2.2) }];
    const best = regs.map(g => Object.assign(g, { k: Math.min(g.w / P.iso.w, g.h / P.iso.h) * 0.9 })).sort((a, b) => b.k - a.k)[0]; const ik = best.k;
    let isoOk = ik * Math.max(P.iso.w, P.iso.h) > 110;
    if (isoOk) { const ix = best.x + (best.w - P.iso.w * ik) / 2, iy = best.y + (best.h - P.iso.h * ik) / 2; emit('ln', P.iso.vis, ix, iy, ik, true); out.push('<text class="tbt late" x="' + ix.toFixed(0) + '" y="' + (iy + P.iso.h * ik + 16).toFixed(0) + '">İZOMETRİK (ÖLÇEKSİZ)</text>'); }
    // görünüş etiketleri
    out.push('<g class="late">');
    out.push(lbl(place.front[0], place.front[1] + fh + 18, 'ÖN GÖRÜNÜŞ ' + scText));
    out.push(lbl(place.left[0], place.left[1] + P.left.h * k + 18, 'SOL GÖRÜNÜŞ'));
    out.push(lbl(place.top[0], place.top[1] + th + 18, 'ÜST GÖRÜNÜŞ'));
    out.push('</g>');
    // eksen çizgileri + ölçüler
    const balloons: DrawBalloon[] = []; let bid = 0;
    const dims: string[] = [];
    const scr = (name: ViewName, p: Vec): Vec => { const s = P[name].toScreen(p); return [place[name][0] + s[0] * k, place[name][1] + s[1] * k]; };
    const ctr: string[] = [];
    const front = cyl.filter(c => c.kind !== 'arc' && c.axis === fa);
    const side = cyl.filter(c => c.kind !== 'arc' && c.axis !== fa);
    for (const c of front) { const [x, y] = scr('front', c.center), R = c.r * k + 8; ctr.push(line(x - R, y, x + R, y), line(x, y - R, x, y + R)); }
    for (const c of cyl.filter(c => c.kind !== 'arc')) for (const nm of ['left', 'top', 'front'] as ViewName[]) {
      const vw = VW[nm]; if (Math.abs(V.dot(AX[c.axis], vw.fwd)) > 0.5) continue;
      const a = c.center.slice(), b = c.center.slice(); a[c.axis] = c.lo; b[c.axis] = c.hi; const A = scr(nm, a), Bp = scr(nm, b);
      const dx = Bp[0] - A[0], dy = Bp[1] - A[1], L = Math.hypot(dx, dy) || 1, ex = dx / L * 8, ey = dy / L * 8;
      ctr.push(line(A[0] - ex, A[1] - ey, Bp[0] + ex, Bp[1] + ey));
    }
    // delik grupları
    const groups: { r: number; hole: boolean; items: Cylinder[] }[] = [];
    for (const c of front) { const g = groups.find(o => o.hole === c.hole && Math.abs(o.r - c.r) < Math.max(.01, c.r * .01)); if (g) g.items.push(c); else groups.push({ r: c.r, hole: c.hole, items: [c] }); }
    // dış çap mı?
    const u = VW.r, vv = VW.u;
    const outer = groups.find(g => !g.hole && g.items.length === 1 && Math.abs(2 * g.r - Math.max(P.front.w, P.front.h)) < 0.02 * Math.max(P.front.w, P.front.h));
    const fx0 = place.front[0], fy0 = place.front[1];
    const addBalloon = (x: number, y: number, txt: string, src: string): void => { const p = window.AKTol ? window.AKTol.parse(txt, { cls: 'm' }) : null; if (!p) return; bid++; balloons.push(Object.assign({ id: bid, x, y, l: src, nom: p.nomText, tol: p.tolText, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge }, {})); };
    if (outer) {
      const c = outer.items[0], [x, y] = scr('front', c.center), R = c.r * k, yy = fy0 - 30;
      dims.push(hdim(x - R, x + R, yy, y, 'Ø' + f1(2 * c.r))); addBalloon(x, yy - 34, 'Ø' + f1(2 * c.r), 'Dış çap');
    } else {
      dims.push(hdim(fx0, fx0 + fw, fy0 - 30, fy0, f1(P.front.w))); addBalloon(fx0 + fw / 2, fy0 - 64, f1(P.front.w), 'Genişlik');
      dims.push(vdim(fx0 - 30, fy0, fy0 + fh, fx0, f1(P.front.h))); addBalloon(fx0 - 62, fy0 + fh / 2, f1(P.front.h), 'Yükseklik');
    }
    let li = 0; const pc = [fx0 + fw / 2, fy0 + fh / 2], Rm = Math.max(fw, fh) / 2;
    for (const g of groups) {
      if (g === outer) continue;
      const c = g.items[0], [x, y] = scr('front', c.center), R = c.r * k;
      const dirs = [[1, -1], [-1, -1], [1, 1], [-1, 1]], d = dirs[li++ % 4], dn = [d[0] * Math.SQRT1_2, d[1] * Math.SQRT1_2];
      const pick = g.items.slice().sort((p, q) => { const a = scr('front', p.center), b = scr('front', q.center); return ((b[0] - pc[0]) * dn[0] + (b[1] - pc[1]) * dn[1]) - ((a[0] - pc[0]) * dn[0] + (a[1] - pc[1]) * dn[1]); })[0]; const [hx, hy] = scr('front', pick.center); const ax = hx + dn[0] * R, ay = hy + dn[1] * R; const reach = Rm + 22 + (li > 4 ? 26 : 0); const bx = pc[0] + dn[0] * reach, by = pc[1] + dn[1] * reach;
      let txt = (g.items.length > 1 ? g.items.length + 'x ' : '') + 'Ø' + f1(2 * g.r);
      let pcd: { m: Vec; r: number } | null = null;
      if (g.items.length >= 3) { const cs = g.items.map(o => o.center); const m = cs.reduce((a, b) => V.add(a, b), [0, 0, 0]).map(v => v / cs.length); const rs = cs.map(o => V.len(V.sub(o, m))); const an = cs.map(o => Math.atan2(V.dot(V.sub(o, m), VW.u), V.dot(V.sub(o, m), VW.r))).sort((a, b) => a - b); const st = 2 * Math.PI / an.length; const even = an.every((a, i) => i === 0 || Math.abs(a - an[i - 1] - st) < 0.03);
        if (even && Math.max(...rs) - Math.min(...rs) < 0.01 * rs[0] + 0.01) { pcd = { m, r: rs[0] }; } }
      dims.push(leader(ax, ay, bx, by, d[0], txt + (pcd ? ' · PCD Ø' + f1(2 * pcd.r) : '')));
      addBalloon(bx + d[0] * 30, by - 26, txt, g.hole ? (g.items.length > 1 ? 'Delik grubu' : 'Delik') : 'Mil çapı');
      if (pcd) { const [mx, my] = scr('front', pcd.m); ctr.push('<circle class="ctr" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="' + (pcd.r * k).toFixed(1) + '"/>'); addBalloon(bx + d[0] * (txt.length * 8.6 + 120), by - 26, 'Ø' + f1(2 * pcd.r), 'Delik çemberi (PCD)'); }
    }
    // sol görünüş: derinlik zinciri (d ekseni boyunca düzlemsel yüz seviyeleri)
    const lv = new Set<number>();
    for (const [f, tris] of M.faceTris) { const t = tris[0]; if (Math.abs(M.tn[3 * t + fa]) > 0.999) { const a = M.tris[3 * t]; lv.add(Math.round(M.pos[3 * a + fa] * 100) / 100); } }
    const levels = Array.from(lv).sort((a, b) => a - b);
    const lx0 = place.left[0], ly0 = place.left[1], lh = P.left.h * k;
    const L0 = levels[0] ?? M.bbox.mn[fa];
    const hd = (lvl: number): number => { const p = M.bbox.mn.slice(); p[fa] = lvl; return scr('left', p)[0]; };
    const xs = levels.map(hd), x0 = hd(L0);
    const chain = levels.slice(1).slice(-3);
    chain.forEach((lvl, i) => { const xA = x0, xB = hd(lvl), yy = ly0 + lh + 52 + i * 30; const val = f1(Math.abs(lvl - L0)); dims.push(hdim(Math.min(xA, xB), Math.max(xA, xB), yy, ly0 + lh, val)); addBalloon(Math.max(xA, xB) + 26, yy, val, i === chain.length - 1 ? 'Toplam boy' : 'Kademe boyu'); });
    // yan görünüşte mil çapları (ön görünüşte zaten var) — yan eksenli delikler
    for (const c of side.slice(0, 3)) { const nm: ViewName = Math.abs(V.dot(AX[c.axis], VW.top.fwd)) > 0.5 ? 'top' : 'left'; const [x, y] = scr(nm, c.center); const R = c.r * k; dims.push(leader(x + R * .7, y - R * .7, x + R * .7 + 30, y - R * .7 - 30, 1, 'Ø' + f1(2 * c.r))); addBalloon(x + R * .7 + 50, y - R * .7 - 50, 'Ø' + f1(2 * c.r), c.hole ? 'Yan delik' : 'Yan çap'); }
    // genel ölçü üst görünüşte (yuvarlak değilse)
    if (!outer) { const tx0 = place.top[0], ty0 = place.top[1]; dims.push(vdim(tx0 - 30, ty0, ty0 + th, tx0, f1(P.top.h))); addBalloon(tx0 - 62, ty0 + th / 2, f1(P.top.h), 'Derinlik'); }
    const titleName = (meta.name || 'Parça').replace(/\.(step|stp)$/i, '');
    const svg = [
      '<g class="late">' + ctr.join('') + '</g>',
      out.join(''),
      meta.dims === false ? '' : '<g class="late">' + dims.join('') + '</g>',
      frame(SW, SH, titleName, scText, meta),
      projSymbol(SW - 320, SH - 45)
    ].join('');
    const holes = groups.filter(g => g.hole).reduce((a, g) => a + g.items.length, 0);
    return { svg, balloons: meta.dims === false ? [] : balloons, w: SW, h: SH, info: { scale: scText, size: ext.map(r2), holes, cylinders: cyl.length, frontAxis: 'XYZ'[fa], tris: M.tris.length / 3, edges: M.feature.length } };
  }
  const line = (x1: number, y1: number, x2: number, y2: number): string => '<line class="ctr" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
  const lbl = (x: number, y: number, t: string): string => '<text class="tbt" x="' + x.toFixed(0) + '" y="' + y.toFixed(0) + '">' + t + '</text>';
  const arw = (x: number, y: number, a: number): string => '<path class="arw" d="M0 0L11 -3.5L11 3.5Z" transform="translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + a + ')"/>';
  function hdim(x1: number, x2: number, y: number, from: number, txt: string): string {
    return '<line class="dim" x1="' + x1.toFixed(1) + '" y1="' + from.toFixed(1) + '" x2="' + x1.toFixed(1) + '" y2="' + (y - 6).toFixed(1) + '"/>' +
      '<line class="dim" x1="' + x2.toFixed(1) + '" y1="' + from.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + (y - 6).toFixed(1) + '"/>' +
      '<line class="dim" x1="' + x1.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' + arw(x1, y, 0) + arw(x2, y, 180) +
      '<text class="dimt" text-anchor="middle" x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '">' + txt + '</text>';
  }
  function vdim(x: number, y1: number, y2: number, from: number, txt: string): string {
    const ym = (y1 + y2) / 2;
    return '<line class="dim" x1="' + from.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + (x - 6).toFixed(1) + '" y2="' + y1.toFixed(1) + '"/>' +
      '<line class="dim" x1="' + from.toFixed(1) + '" y1="' + y2.toFixed(1) + '" x2="' + (x - 6).toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>' +
      '<line class="dim" x1="' + x.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>' + arw(x, y1, 90) + arw(x, y2, 270) +
      '<text class="dimt" text-anchor="middle" transform="translate(' + (x - 6).toFixed(1) + ' ' + ym.toFixed(1) + ') rotate(-90)">' + txt + '</text>';
  }
  function leader(ax: number, ay: number, bx: number, by: number, dir: number, txt: string): string {
    const tw = txt.length * 8.6 + 6, ex = bx + dir * tw;
    return '<path class="dim" d="M' + ax.toFixed(1) + ' ' + ay.toFixed(1) + 'L' + bx.toFixed(1) + ' ' + by.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + by.toFixed(1) + '"/>' + arw(ax, ay, Math.atan2(by - ay, bx - ax) * 180 / Math.PI) +
      '<text class="dimt" x="' + (dir > 0 ? bx + 3 : ex + 3).toFixed(1) + '" y="' + (by - 5).toFixed(1) + '">' + txt + '</text>';
  }
  function frame(SW: number, SH: number, name: string, sc: string, _meta: DrawMeta): string {
    const x = SW - 220, y = SH - 130, d = new Date();
    const date = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    const ESC: Record<string, string> = { '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' };
    const esc = (s: unknown): string => String(s).replace(/[<&>"]/g, c => ESC[c]);
    return '<g class="late"><rect class="tb" x="20" y="20" width="' + (SW - 40) + '" height="' + (SH - 40) + '" rx="4"/>' +
      '<rect class="tb" x="' + x + '" y="' + y + '" width="200" height="110"/>' +
      '<line class="tb" x1="' + x + '" y1="' + (y + 40) + '" x2="' + (x + 200) + '" y2="' + (y + 40) + '"/><line class="tb" x1="' + x + '" y1="' + (y + 75) + '" x2="' + (x + 200) + '" y2="' + (y + 75) + '"/>' +
      '<line class="tb" x1="' + (x + 100) + '" y1="' + (y + 40) + '" x2="' + (x + 100) + '" y2="' + (y + 110) + '"/>' +
      '<text class="tbt" x="' + (x + 8) + '" y="' + (y + 14) + '">PARÇA</text><text class="tbv" x="' + (x + 8) + '" y="' + (y + 33) + '">' + esc(name) + '</text>' +
      '<text class="tbt" x="' + (x + 8) + '" y="' + (y + 54) + '">ÖLÇEK</text><text class="tbv" x="' + (x + 8) + '" y="' + (y + 70) + '">' + sc + '</text>' +
      '<text class="tbt" x="' + (x + 108) + '" y="' + (y + 54) + '">TARİH</text><text class="tbv" x="' + (x + 108) + '" y="' + (y + 70) + '">' + date + '</text>' +
      '<text class="tbt" x="' + (x + 8) + '" y="' + (y + 89) + '">KAYNAK</text><text class="tbv" x="' + (x + 8) + '" y="' + (y + 104) + '" style="font-size:12px">STEP · otomatik</text>' +
      '<text class="tbt" x="' + (x + 108) + '" y="' + (y + 89) + '">GENEL TOL.</text><text class="tbv" x="' + (x + 108) + '" y="' + (y + 104) + '" style="font-size:12px">ISO 2768-m</text></g>';
  }
  function projSymbol(x: number, y: number): string { // birinci açı izdüşüm sembolü
    return '<g class="late"><path class="tb" d="M' + x + ' ' + (y - 9) + 'L' + (x + 22) + ' ' + (y - 14) + 'L' + (x + 22) + ' ' + (y + 14) + 'L' + x + ' ' + (y + 9) + 'Z"/>' +
      '<circle class="tb" cx="' + (x + 44) + '" cy="' + y + '" r="14"/><circle class="tb" cx="' + (x + 44) + '" cy="' + y + '" r="8"/>' +
      '<line class="ctr" x1="' + (x - 6) + '" y1="' + y + '" x2="' + (x + 64) + '" y2="' + y + '"/></g>';
  }
  /** STL (ikili veya ASCII) → OCCT benzeri sonuç */
  function parseSTL(u8: Uint8Array): OcctResult {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let pos: Float32Array;
    const n = u8.length >= 84 ? dv.getUint32(80, true) : 0;
    if (n && 84 + n * 50 === u8.length) {
      pos = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
    } else {
      const txt = new TextDecoder().decode(u8), arr: number[] = []; const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g; let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) arr.push(+m[1], +m[2], +m[3]);
      if (!arr.length) throw new Error('STL okunamadı'); pos = new Float32Array(arr);
    }
    const idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i;
    return { success: true, meshes: [{ name: 'STL', attributes: { position: { array: pos } }, index: { array: idx } }] };
  }
  /** ön görünüş ekseni (resim üretmeden, 3B görünüm için) */
  function frontAxis(M: Model): number { const cyl = findCylinders(M), ext = V.sub(M.bbox.mx, M.bbox.mn), cnt = [0, 0, 0]; cyl.forEach(c => { if (c.kind !== 'arc') cnt[c.axis] += c.r; }); let fa = cnt.indexOf(Math.max(...cnt)); if (!(cnt[fa] > 0)) fa = ext.indexOf(Math.min(...ext)); return fa; }
  export const AKStep = { buildModel, findCylinders, makeDrawing, parseSTL, frontAxis };
(window as any).AKStep = AKStep;
