import { AKTol } from '../../../../istemci/src/ortak/cizim/cekirdek/tol';


/* ── PDF ölçü okuma: sembol fontları, satırlar, dışlama bölgeleri (antet/tablo/pafta/notlar), güven puanı ── */
export const GDT_FONT_MAP = { n: 'Ø', j: '⌖', u: '⏤', c: '⏥', e: '○', g: '⌭', k: '⌒', d: '⌓', b: '⟂', a: '∠', f: '∥', i: '⌯', r: '◎', h: '↗', t: '⌰', v: '⌴', w: '⌵', x: '↧', m: 'Ⓜ', l: 'Ⓛ', s: 'Ⓢ', p: 'Ⓟ' };
export function fixGlyphs(s, font) {
  if (font && /gdt|isocp|amgdt|gdtsym|symbol\s*gd/i.test(font)) s = s.replace(/[a-z]/g, ch => GDT_FONT_MAP[ch] || ch);
  // özel alan (PUA) / kontrol karakterleri: rakamdan hemen önceyse çoğu CAD'de çap işaretidir
  return s.replace(/[\uE000-\uF8FF\u0080-\u009F\u0001-\u0008](?=\s?\d)/g, 'Ø').replace(/[\uE000-\uF8FF\u0000-\u001F\u0080-\u009F\uFFFD]/g, '');
}
export const fold = s => s.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
export const KW = /^(olcek|scale|malzeme|material|mat\.|cizen|cizim|drawn|designed|design|tasarlayan|tasarim|tarih|date|rev\.?|revizyon|revision|pafta|sheet|agirlik|weight|mass|kutle|parca ?(no|adi|numarasi|kodu|ismi)|part ?(no|number|name)|poz\.?|pozisyon|item|adet|qty|quantity|miktar|kontrol|kontrol eden|checked|chk|onay|onaylayan|approved|appr|dosya|file|proje|project|birim|units?|format|boyut|izdusum|projection|aciklama|description|desc\.?|genel tol.*|general tol.*|yuzey.*|surface.*|finish|sayfa|page|title|baslik|dwg\.? ?no|drawing ?(no|number)|resim ?no|firma|company|musteri|customer|sertlik|hardness|kaplama|coating|isil islem|heat treat.*|degisiklik|change|stok kodu|standart|standard|tolerans|tolerance|unless otherwise.*|aksi belirtilmedikce.*)\s*:?$/;
export const NOTES_KW = /^(notlar?|notes?|genel notlar|general notes|aciklamalar|teknik sartlar)\s*:?$/;
export const OK_WORDS = /^(thru|boydan|boya|derin|derinlik|depth|typ|tip|ref|eqs|esit|aralikli|plcs|yerde|adet|delik|max|maks|min|havsa|cbore|csk|unc|unf|unef|npt|ra|rz|rmax|rt)$/;
export function isProse(s) { const w = fold(s).match(/[a-z]{3,}/g) || []; return w.filter(x => !OK_WORDS.test(x)).length >= 2; }

/** Rasterdan tablo blokları: aynı uzunlukta, üst üste ≥3 yatay çizgi (antet, malzeme listesi, revizyon tablosu) */
export function findTables(ink, W, H) {
  if (!ink) return [];
  const minLen = Math.round(W * 0.045), raw = [];
  for (let y = 0; y < H; y++) {
    const o = y * W; let run = 0, x0 = 0;
    for (let x = 0; x <= W; x++) { if (x < W && ink[o + x]) { if (!run) x0 = x; run++; } else { if (run >= minLen) raw.push([x0, x - 1, y]); run = 0; } }
  }
  const tol = Math.max(4, W * 0.003), lines = [];
  raw.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  for (const s of raw) { const l = lines.find(q => Math.abs(q[0] - s[0]) <= tol && Math.abs(q[1] - s[1]) <= tol && s[2] - q[3] <= 2 && s[2] >= q[2]); if (l) l[3] = s[2]; else lines.push([s[0], s[1], s[2], s[2]]); }
  const used = new Set(), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const grp = [i]; for (let j = i + 1; j < lines.length; j++) if (!used.has(j) && Math.abs(lines[j][0] - lines[i][0]) <= tol * 1.5 && Math.abs(lines[j][1] - lines[i][1]) <= tol * 1.5) grp.push(j);
    grp.sort((a, b) => lines[a][2] - lines[b][2]);
    let chain = [grp[0]];
    const flush = () => { if (chain.length >= 3) { chain.forEach(k => used.add(k)); const L0 = lines[chain[0]], L1 = lines[chain[chain.length - 1]]; blocks.push({ x0: Math.min(L0[0], L1[0]), x1: Math.max(L0[1], L1[1]), y0: L0[2], y1: L1[3] }); } };
    for (let k = 1; k < grp.length; k++) { if (lines[grp[k]][2] - lines[chain[chain.length - 1]][3] <= H * 0.06) chain.push(grp[k]); else { flush(); chain = [grp[k]]; } }
    flush();
  }
  return blocks;
}
export function inkOf(img) {
  const d = img.data, n = img.width * img.height, ink = new Uint8Array(n), g = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; g[i] = v; hist[v]++; }
  // Otsu eşiği (taranmış resimlerde soluk çizgiler için), makul aralıkta
  let sum = 0, sB = 0, wB = 0, best = 0, th = 165; for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = i; } }
  th = Math.min(215, Math.max(150, th));
  for (let i = 0; i < n; i++) ink[i] = g[i] < th ? 1 : 0;
  return ink;
}

/**
 * Metin parçalarından ölçü önerileri.
 * items: [{s, x, y, h, a, w, font?, conf?}] — x,y: taban çizgisi başlangıcı (piksel), a: yazı açısı (radyan)
 * opt: { w, h, ink, ocr }
 */
export function pdfDims(items0, cls, opt) {
  opt = opt || {};
  const T = AKTol, W = opt.w || 4000, H = opt.h || 3000, ink = opt.ink || null, M = Math.min(W, H);
  const ex = opt.ex || {}, autoR = { high: 2, mid: 1, low: 0 }[opt.auto || 'mid'];
  const st = { items: items0.length, rows: 0, segs: 0, table: 0, border: 0, notes: 0, prose: 0, found: 0, high: 0, mid: 0, low: 0, ocr: !!opt.ocr, tables: 0 };
  // 1) öğeler — yerel koordinat (u: okuma yönü, v: yukarı)
  const it = [];
  for (const o of items0) {
    const s = fixGlyphs(String(o.s), o.font).replace(/\s+/g, ' ').trim(); if (!s) continue;
    const a = o.a, dx = Math.cos(a), dy = Math.sin(a), ux = Math.sin(a), uy = -Math.cos(a), h = Math.max(o.h, 1);
    let ang = Math.round(a * 180 / Math.PI / 2) * 2; if (ang <= -180) ang += 360;
    it.push({ s, x: o.x, y: o.y, h, a, w: o.w > 0 ? o.w : h * 0.55 * s.length, dx, dy, ux, uy, ang, u: o.x * dx + o.y * dy, v: o.x * ux + o.y * uy, conf: o.conf == null ? 100 : o.conf });
  }
  // 2) aynı taban çizgisindekiler → satır; satır içinde boşluğa göre parçalar
  const groups = new Map();
  for (const o of it) { if (!groups.has(o.ang)) groups.set(o.ang, []); groups.get(o.ang).push(o); }
  const rows = [];
  for (const g of groups.values()) {
    g.sort((p, q) => p.v - q.v);
    let open = [];
    for (const o of g) {
      open = open.filter(r => o.v - r.v <= r.h * 1.2);
      let best = null, bd = 1e9;
      for (const r of open) { const dv = Math.abs(o.v - r.v), k = o.h / r.h; if ((opt.ocr ? dv < 0.4 * Math.min(r.h, o.h) && k > 0.66 && k < 1.5 : dv < 0.4 * Math.min(r.h, o.h) && k > 0.72 && k < 1.38) && dv < bd) { bd = dv; best = r; } }
      if (best) best.parts.push(o); else { const r = { v: o.v, h: o.h, ang: o.ang, parts: [o] }; open.push(r); rows.push(r); }
    }
  }
  st.rows = rows.length;
  const GD = T.GDT_CHARS || '';
  const isGd = c => c && GD.indexOf(c) >= 0;
  const segs = [];
  for (const r of rows) {
    r.parts.sort((p, q) => p.u - q.u);
    let cur = null;
    for (const o of r.parts) {
      const gap = cur ? o.u - cur.u1 : 1e9;
      const gdtJoin = cur && isGd(cur.parts[0].s[0]) && gap < 3.4 * r.h && gap > -0.5 * r.h && o.s.length <= 9 && /^[Ø\d.A-Z|ⓂⓁⓈⓅ() -]+$/.test(o.s);
      if (cur && ((gap < 0.95 * r.h && gap > -0.5 * r.h) || gdtJoin)) { cur.txt += gdtJoin && gap >= 0.95 * r.h ? ' | ' : gap > 0.18 * r.h ? ' ' : ''; cur.txt += o.s; cur.parts.push(o); cur.gaps.push(gap); cur.u1 = Math.max(cur.u1, o.u + o.w); }
      else { cur = { txt: o.s, parts: [o], gaps: [], u0: o.u, u1: o.u + o.w, v: r.v, h: r.h, ang: r.ang, a: o }; segs.push(cur); }
    }
  }
  st.segs = segs.length;
  const P = (sg, u, vo) => { const a = sg.a; return [u * a.dx + (sg.v + vo) * a.ux, u * a.dy + (sg.v + vo) * a.uy]; }; // yerel → piksel
  for (const sg of segs) { const c = P(sg, (sg.u0 + sg.u1) / 2, sg.h * 0.35); sg.cx = c[0]; sg.cy = c[1]; }
  // 3) istifli toleranslar (+0.02 / -0.01)
  const small = segs.filter(o => /^([+\-±]\s*)?\d*[.,]?\d+$/.test(o.txt.replace(/\s/g, '')) || o.txt.trim() === '0');
  for (const L of segs) {
    if (!/\d$|[A-Za-z]\d$/.test(L.txt) || L.stack) continue;
    let c = small.filter(o => o !== L && !o.stack && o.ang === L.ang && o.h < 0.85 * L.h && o.u0 >= L.u1 - 0.3 * L.h && o.u0 <= L.u1 + 1.6 * L.h && o.v <= L.v + 1.4 * L.h && o.v >= L.v - 0.6 * L.h);
    // daha gevşek: aynı boyda istif, biraz uzakta başlayan ya da daha aşağı inen alt satır
    if (c.length < 2) c = small.filter(o => o !== L && !o.stack && o.ang === L.ang && o.h <= 1.02 * L.h && o.u0 >= L.u1 - 0.5 * L.h && o.u0 <= L.u1 + 2.6 * L.h && o.v <= L.v + 1.7 * L.h && o.v >= L.v - 1.1 * L.h);
    if (c.length >= 2) { c.sort((a, b) => b.v - a.v); if (c[0].v - c[c.length - 1].v < 0.55 * Math.min(c[0].h, c[c.length - 1].h)) c = []; }
    if (c.length >= 2) { c.sort((a, b) => b.v - a.v); const up = c[0], lo = c[c.length - 1]; L.txt += ' ' + up.txt.replace(/\s/g, '') + '/' + lo.txt.replace(/\s/g, ''); up.stack = lo.stack = true; L.u1 = Math.max(L.u1, up.u1, lo.u1); }
  }
  // 4) dışlama bölgeleri
  const zones = [];
  const tbl = findTables(ink, W, H).filter(b => { const inside = segs.filter(s => s.cx >= b.x0 && s.cx <= b.x1 && s.cy >= b.y0 && s.cy <= b.y1); return inside.length >= 3 && (inside.some(s => KW.test(fold(s.txt))) || inside.length >= 6); });
  st.tables = tbl.length;
  tbl.forEach(b => zones.push(Object.assign({ why: 'table' }, b)));
  for (const s of segs) {
    const f = fold(s.txt);
    if (KW.test(f) && !tbl.some(b => s.cx >= b.x0 && s.cx <= b.x1 && s.cy >= b.y0 && s.cy <= b.y1) && Math.abs(s.ang) < 3) zones.push({ why: 'table', x0: s.a.x - s.h, x1: s.a.x + s.h * 16, y0: s.a.y - s.h * 1.6, y1: s.a.y + s.h * 3.6, kw: s });
    if (NOTES_KW.test(f)) zones.push({ why: 'notes', x0: s.a.x - s.h * 2, x1: s.a.x + s.h * 70, y0: s.a.y - s.h * 0.5, y1: s.a.y + s.h * 26, kw: s });
  }
  // tablo başlık satırı (≥2 anahtar kelime yan yana) → sütun hizasındaki satırlar da tablo sayılır
  const flat = segs.filter(s => Math.abs(s.ang) < 3);
  const kwRows = [];
  for (const s of flat) if (KW.test(fold(s.txt))) { const r = kwRows.find(r => Math.abs(r.y - s.a.y) < s.h * 0.7); if (r) r.segs.push(s); else kwRows.push({ y: s.a.y, h: s.h, segs: [s] }); }
  const rowsY = []; for (const s of flat) { const r = rowsY.find(r => Math.abs(r.y - s.a.y) < s.h * 0.6); if (r) r.segs.push(s); else rowsY.push({ y: s.a.y, segs: [s] }); }
  rowsY.sort((a, b) => a.y - b.y);
  for (const kr of kwRows) {
    if (kr.segs.length < 2) continue;
    const cols = kr.segs.map(s => s.a.x), hh = kr.h, x0 = Math.min.apply(null, cols) - hh * 2, x1 = Math.max.apply(null, kr.segs.map(s => s.a.x + (s.u1 - s.u0))) + hh * 16;
    let y0 = kr.y - hh * 1.2, y1 = kr.y + hh * 0.6;
    const ri = rowsY.findIndex(r => Math.abs(r.y - kr.y) < hh * 0.6);
    for (const dir of [1, -1]) {
      let last = kr.y;
      for (let k = ri + dir; k >= 0 && k < rowsY.length; k += dir) {
        const r = rowsY[k]; if (Math.abs(r.y - last) > hh * 3.2) break;
        const inX = r.segs.filter(s => s.a.x >= x0 && s.a.x <= x1); if (!inX.length) continue;
        const hit = inX.filter(s => cols.some(c => Math.abs(s.a.x - c) < hh * 1.3)).length;
        if (!hit) break;
        last = r.y; if (dir > 0) y1 = r.y + hh * 0.6; else y0 = r.y - hh * 1.2;
      }
    }
    zones.push({ why: 'table', x0, x1, y0, y1 });
  }
  const edge = M * 0.022, edge2 = M * 0.05;
  const zoneOf = s => {
    if (s.cx < edge || s.cy < edge || s.cx > W - edge || s.cy > H - edge) return 'border';
    if (/^([A-Z]|\d{1,2})$/.test(s.txt) && (s.cx < edge2 || s.cy < edge2 || s.cx > W - edge2 || s.cy > H - edge2)) return 'border';
    for (const z of zones) if (z.kw !== s && s.cx >= z.x0 && s.cx <= z.x1 && s.cy >= z.y0 && s.cy <= z.y1) return z.why;
    if (/^\d{1,2}[.)]\s+\S/.test(s.txt) && isProse(s.txt)) return 'notes';
    return null;
  };
  // 5) ayrıştır (bütün parça → olmazsa alt parçalar)
  const collapse = s => s.replace(/(\d)\s+(?=[\d.])/g, '$1').replace(/\.\s+(?=\d)/g, '.');
  const tryP = s => T.parse(s, { cls }) || (/\d\s+[\d.]/.test(s) ? T.parse(collapse(s), { cls }) : null);
  const cands = [];
  for (const s of segs) {
    if (s.stack) { s.tag = 'stack'; continue; }
    const z = zoneOf(s); if (z) { st[z]++; s.tag = z; if (ex[z] !== false) continue; }
    if (KW.test(fold(s.txt)) || NOTES_KW.test(fold(s.txt))) { s.tag = s.tag || 'table'; continue; }
    if (opt.ocr) s.txt = s.txt.replace(/^(\S*\d)\s+\+\s?(\d*\.\d+)$/, '$1 ±$2');
    const p = tryP(s.txt);
    if (p) { cands.push({ s, p, txt: s.txt }); s.tag = 'dim'; continue; }
    if (isProse(s.txt)) { st.prose++; s.tag = 'prose'; if (ex.prose !== false) continue; }
    if (s.parts.length > 1) {
      let i = 0; const n = s.parts.length;
      while (i < n) {
        let hit = false;
        for (let j = Math.min(n - 1, i + 3); j >= i; j--) {
          if (i === 0 && j === n - 1) continue;
          const ps = s.parts.slice(i, j + 1), txt = ps.map((q, k) => (k ? (q.u - (ps[k - 1].u + ps[k - 1].w) > 0.18 * s.h ? ' ' : '') : '') + q.s).join('');
          const q = tryP(txt);
          if (q) { s.tag = 'dim'; const sub = Object.assign({}, s, { parts: ps, u0: ps[0].u, u1: Math.max.apply(null, ps.map(x => x.u + x.w)), txt, a: ps[0] }); const c = P(sub, (sub.u0 + sub.u1) / 2, s.h * 0.35); sub.cx = c[0]; sub.cy = c[1]; cands.push({ s: sub, p: q, txt }); i = j + 1; hit = true; break; }
        }
        if (!hit) i++;
      }
    }
  }
  // 6) ölçü çizgisi kanıtı (yazının altında/üstünde yazıdan uzun düz çizgi)
  const inkAt = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return 0; const o = y * W + x; return ink[o] || ink[o - W] || ink[o + W]; };
  const dimLine = sg => {
    if (!ink) return false;
    const len = sg.u1 - sg.u0, n = 28;
    for (const off of [-0.18, -0.3, -0.45, -0.62, -0.8, -1.0, 1.12, 1.3]) {
      let hit = 0; for (let k = 0; k < n; k++) { const q = P(sg, sg.u0 + len * (k + 0.5) / n, sg.h * off); hit += inkAt(q[0], q[1]); }
      if (hit / n >= 0.86) return true;
    }
    return false;
  };
  const hs = cands.map(c => c.s.h).sort((a, b) => a - b), modalH = hs.length ? hs[hs.length >> 1] : 0;
  const out: any = [];
  for (const { s, p } of cands) {
    let c = 0.3; const why = [];
    if (p.kind === 'gdt') { c += 0.45; why.push('GD&T'); }
    else if (p.kind === 'rough') { c += 0.15; why.push('yüzey'); }
    else {
      if (!p.general) { c += 0.3; why.push(p.fit ? 'geçme' : 'toleranslı'); }
      if (/^(SØ|SR|Ø|R|M|□|C)$/.test(p.prefix) || p.kind === 'thread') { c += 0.2; why.push('sembol'); }
      if (p.kind === 'angle' || p.kind === 'chamfer') c += 0.12;
      if (p.count > 1) c += 0.08;
    }
    const dl = dimLine(s); if (dl) { c += 0.25; why.push('ölçü çizgisi'); }
    if (modalH && !opt.ocr) { if (Math.abs(s.h / modalH - 1) < 0.25) c += 0.05; else { c -= 0.12; why.push('farklı yazı boyu'); } }
    if (p.general && !p.prefix && p.kind === 'linear' && p.nominal < 10 && Number.isInteger(p.nominal)) { c -= 0.2; why.push('tek hane'); }
    if (p.ref) { c -= 0.25; why.push('referans'); }
    if (opt.ocr) { const oc = Math.min.apply(null, s.parts.map(q => q.conf)); c -= oc < 60 ? 0.25 : oc < 80 ? 0.12 : 0.04; why.push('OCR %' + Math.round(oc)); }
    c = Math.max(0, Math.min(1, c));
    const lvl = c >= 0.6 ? 'high' : c >= 0.38 ? 'mid' : 'low';
    // balon: yazının üst-sağı; kılavuz çizgi yazı kutusuna
    const a = s.a, hw = (s.u1 - s.u0) / 2;
    const bx = s.cx + a.ux * s.h * 1.9 + a.dx * (hw + s.h * 0.6), by = s.cy + a.uy * s.h * 1.9 + a.dy * (hw + s.h * 0.6);
    if (out.some(o => o.nom === p.nomText && Math.hypot(o.tx - s.cx, o.ty - s.cy) < s.h * 2)) continue;
    const kindL = { diameter: 'Çap', linear: 'Uzunluk', radius: 'Radyus', angle: 'Açı', thread: 'Diş', chamfer: 'Pah', gdt: p.gdtName || 'Geometrik tol.', rough: 'Yüzey pürüzlülüğü' }[p.kind] || 'Ölçü';
    out.push({ x: bx, y: by, tx: s.cx, ty: s.cy, ar: [s.cx, s.cy, hw, s.h * 0.62, Math.atan2(a.dy, a.dx)], l: (p.label || kindL) + (p.ref ? ' (referans)' : p.general ? ' (genel tol.)' : ''), nom: p.nomText, tol: p.tolText, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge, raw: s.txt, unknown: !!p.unknownFit, note: p.note || '', kind: p.kind, ref: !!p.ref, conf: +c.toFixed(2), lvl, why: why.join(' · '), on: { high: 2, mid: 1, low: 0 }[lvl] >= autoR && !p.ref && p.kind !== 'rough' });
  }
  // okuma sırası: yukarıdan aşağı, soldan sağa (bantlı)
  const band = Math.max(modalH * 6, H / 24);
  out.sort((p, q) => Math.floor(p.ty / band) - Math.floor(q.ty / band) || p.tx - q.tx);
  out.forEach(o => { st[o.lvl]++; });
  st.found = out.length;
  out.stats = st;
  if (opt.diag) out.diag = { segs: segs.map(q => ({ t: q.txt, x: q.cx, y: q.cy, w: q.u1 - q.u0, h: q.h, a: Math.atan2(q.a.dy, q.a.dx), z: q.tag || 'none' })), zones: zones.map(z => ({ why: z.why, x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 })) };
  return out;
}

