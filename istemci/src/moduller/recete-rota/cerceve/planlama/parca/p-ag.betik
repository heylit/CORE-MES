/* ---------- Ağ: tahtanın sinir ağı görünümü ----------
   Tezgâhlar tahtadaki yerlerinde birer hücredir; derinlik zamandır: her gün bir katman, bugün önde.
   Hücre o gün ne kadar doluysa o kadar büyür ve parlar. Bir adımı bitip sonrakine geçen iş, iki hücre arasında akan bir ışıktır.
   Önizlemede değişen hücreler, değişikliğin ilk dokunduğu saat sırasıyla kırmızı halka verir; zincir etkisi böyle yayılır.
   Kütüphane yok: tek tuval, elle izdüşüm. */
const AGT = { raf: 0, kam: { yaw: -0.55, pitch: 0.42, mesafe: 1, x: 0, y: 0 }, t: null, oynat: true, son: 0, fare: null, veri: null, t0: 0 };
function agtVeri() {
  const p = gosterilen(); const Y = tbYerlesim(p); const cx = cxAl(); const now = cx.st.now;
  const d0 = Math.floor(now / 24) * 24; let G = Math.max(3, Math.min(7, U.tbGun || 3));
  /* seçili siparişin bütün yolu görünsün diye katmanlar onun son adımına kadar uzar */
  const secJ = U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null);
  if (secJ) { const son = Math.max(...Object.values(p.ops).filter(r => r.job === secJ && isFinite(r.C)).map(r => r.C), now); G = Math.max(G, Math.min(10, Math.floor((son - d0) / 24) + 1)); }
  const katman = t => Math.floor((t - d0) / 24);
  const dz = Math.max(Y.w, Y.h) * 0.32;
  const hucre = {}; const R = agRenk();
  for (const k of Object.values(Y.kart)) {
    const M = cx.M[k.id]; const gun = [];
    for (let g = 0; g < G; g++) {
      const a = d0 + g * 24, b = a + 24; let acik = 0, dolu = 0;
      if (M) for (const [x, y] of M.rw) { if (y <= a || x >= b) continue; acik += Math.min(y, b) - Math.max(x, a); } else acik = 24;
      gun.push({ g, a, b, acik, dolu });
    }
    hucre[k.id] = { id: k.id, kart: k, X: k.x + TB.W / 2 - Y.w / 2, Yv: k.y + TB.H / 2 - Y.h / 2, gun };
  }
  for (const r of Object.values(p.ops)) { const h = hucre[r.m]; if (!h || !isFinite(r.C)) continue; for (const d of h.gun) { const o = Math.min(r.C, d.b) - Math.max(r.S, d.a); if (o > 0) d.dolu += o; } }
  const sinaps = [];
  for (const jo of Object.values(cx.jobs)) {
    const rs = jo.ops.map(o => p.ops[o.id]).filter(r => r && isFinite(r.C));
    for (let i = 1; i < rs.length; i++) { const a = rs[i - 1], b = rs[i]; const ga = katman(a.C), gb = katman(b.S);
      if (!hucre[a.m] || !hucre[b.m] || ga < 0 || gb < 0 || ga >= G || gb >= G) continue;
      sinaps.push({ job: a.job, a, b, ga, gb, renk: durumRenkHam(a.job, R) }); }
  }
  /* önizlemede değişen işler: ilk dokunduğu saat dalganın sırasıdır */
  const dalga = [];
  if (U.hamle) { const eski = S.plan.ops; for (const r of Object.values(p.ops)) { const e = eski[r.id]; if (!isFinite(r.S)) continue; if (!e || e.m !== r.m || Math.abs(e.S - r.S) > 0.25) { const g = katman(r.S); if (hucre[r.m] && g >= 0 && g < G) dalga.push({ m: r.m, g, t: Math.min(r.S, e ? e.S : r.S) }); } } }
  const tmin = dalga.length ? Math.min(...dalga.map(x => x.t)) : 0, tmax = dalga.length ? Math.max(...dalga.map(x => x.t)) : 1;
  dalga.forEach(x => { x.gec = (x.t - tmin) / Math.max(1, tmax - tmin); });
  return { p, Y, now, G, d0, dz, hucre, sinaps, dalga, R, sec: U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null) };
}
function agtIzdus(v, cv, X, Yv, Z) {
  const k = AGT.kam; const cy = Math.cos(k.yaw), sy = Math.sin(k.yaw), cp = Math.cos(k.pitch), sp = Math.sin(k.pitch);
  const zc = (v.G - 1) * v.dz / 2; const Zr = Z - zc;
  const x1 = X * cy + Zr * sy, z1 = -X * sy + Zr * cy; const y1 = Yv * cp - z1 * sp, z2 = Yv * sp + z1 * cp;
  const uzak = Math.max(v.Y.w, v.Y.h) * 1.5 * k.mesafe; const d = z2 + uzak; if (d < 40) return null;
  const f = Math.min(cv.width, cv.height * 1.4) * 0.9; const s = f / d;
  return [cv.width / 2 + x1 * s + k.x * cv.dpr, cv.height / 2 + y1 * s + k.y * cv.dpr, s, d];
}
function agtCiz(zaman) {
  const cv = document.getElementById('tb-ag'); if (!cv) { AGT.raf = 0; return; }
  AGT.raf = requestAnimationFrame(agtCiz);
  const v = AGT.veri || (AGT.veri = agtVeri()); const R = v.R; const ctx = cv.getContext('2d');
  const dt = AGT.son ? Math.min(0.1, (zaman - AGT.son) / 1000) : 0; AGT.son = zaman;
  if (AGT.t == null) AGT.t = v.now;
  if (AGT.oynat) { AGT.t += dt * 6; if (AGT.t > v.d0 + v.G * 24) AGT.t = v.now; }
  const t = AGT.t; const yaz = document.getElementById('ag-zaman'); if (yaz) yaz.textContent = fmtDT(S.D, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  const P = (X, Yv, Z) => agtIzdus(v, cv, X, Yv, Z);
  const kz = g => g * v.dz; const W2 = v.Y.w / 2 + 120, H2 = v.Y.h / 2 + 120; const dpr = cv.dpr;
  const gt = U.agGun != null ? U.agGun : Math.floor((t - v.d0) / 24);
  /* katman levhaları, arkadan öne */
  for (let g = v.G - 1; g >= 0; g--) {
    const c = [P(-W2, -H2, kz(g)), P(W2, -H2, kz(g)), P(W2, H2, kz(g)), P(-W2, H2, kz(g))]; if (c.some(x => !x)) continue;
    ctx.beginPath(); c.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
    ctx.globalAlpha = g === gt ? 0.16 : 0.05; ctx.fillStyle = R.grafik; ctx.fill();
    ctx.globalAlpha = g === gt ? 0.7 : 0.25; ctx.strokeStyle = R.edge; ctx.lineWidth = dpr; ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.fillStyle = R.muted; ctx.font = `${12 * dpr}px ui-monospace, monospace`; ctx.fillText(fmtDT(S.D, v.d0 + g * 24).slice(0, 9), c[0][0] + 6 * dpr, c[0][1] - 6 * dpr);
  }
  /* aksonlar: aynı tezgâhın günleri arasında ince çizgi */
  ctx.globalAlpha = 0.18; ctx.strokeStyle = R.edge; ctx.lineWidth = dpr;
  for (const h of Object.values(v.hucre)) { const a = P(h.X, h.Yv, 0), b = P(h.X, h.Yv, kz(v.G - 1)); if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); } }
  /* sinapslar ve üzerlerinde akan ışık */
  const sec = v.sec;
  for (const s of v.sinaps) {
    const A = v.hucre[s.a.m], B = v.hucre[s.b.m];
    const za = kz(s.ga), zb = kz(s.gb); const mx = (A.X + B.X) / 2, my = (A.Yv + B.Yv) / 2 - 90 - Math.abs(A.X - B.X) * 0.12, mz = (za + zb) / 2;
    const a = P(A.X, A.Yv, za), b = P(B.X, B.Yv, zb), m = P(mx, my, mz); if (!a || !b || !m) continue;
    const bu = sec && s.job === sec; const sol = sec && !bu;
    ctx.globalAlpha = bu ? 0.95 : sol ? 0.04 : 0.16; ctx.strokeStyle = s.renk; ctx.lineWidth = (bu ? 3 : 1) * dpr;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke();
    if (t >= s.a.C && t <= s.b.S && !sol) {
      const u = (t - s.a.C) / Math.max(0.1, s.b.S - s.a.C); const q = 1 - u;
      const x = q * q * a[0] + 2 * q * u * m[0] + u * u * b[0], y = q * q * a[1] + 2 * q * u * m[1] + u * u * b[1];
      ctx.globalAlpha = 1; ctx.fillStyle = s.renk; ctx.shadowColor = s.renk; ctx.shadowBlur = 12 * dpr;
      ctx.beginPath(); ctx.arc(x, y, (bu ? 6 : 3.5) * dpr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  /* hücreler: arkadan öne sıralı */
  const liste = [];
  for (const h of Object.values(v.hucre)) for (const d of h.gun) { const q = P(h.X, h.Yv, kz(d.g)); if (q) liste.push({ h, d, q }); }
  liste.sort((x, y) => y.q[3] - x.q[3]);
  const yolM = sec ? new Set(Object.values(v.p.ops).filter(r => r.job === sec).map(r => r.m)) : null;
  AGT.isabet = [];
  for (const { h, d, q } of liste) {
    const oran = d.acik ? d.dolu / d.acik : 0; const sv = isiSeviye(d.acik ? oran : null);
    const r = (10 + Math.min(1.2, oran) * 34) * q[2]; const renk = sv >= 4 ? R.stop : sv === 3 ? R.hazard : sv >= 1 ? R.grafik : R.edge;
    const sol = yolM && !yolM.has(h.id);
    const calisiyor = Object.values(v.p.ops).some(o => o.m === h.id && o.S <= t && o.C > t) && d.g === gt;
    ctx.globalAlpha = sol ? 0.12 : (d.g === gt ? 1 : 0.75);
    if (sv >= 3 && !sol) { ctx.shadowColor = renk; ctx.shadowBlur = 18 * dpr; }
    ctx.fillStyle = renk; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2, r), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (calisiyor && !sol) { const nab = 1 + 0.25 * Math.sin(zaman / 180); ctx.globalAlpha = 0.6; ctx.strokeStyle = R.ink; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(q[0], q[1], r * 1.35 * nab, 0, Math.PI * 2); ctx.stroke(); }
    if (d.g === 0 && !sol) { ctx.globalAlpha = 0.95; ctx.fillStyle = R.ink; ctx.font = `700 ${12 * dpr}px ui-monospace, monospace`; ctx.fillText(h.id[0] === '@' ? h.id.slice(1) : h.id, q[0] + r + 4 * dpr, q[1] + 4 * dpr); }
    AGT.isabet.push({ m: h.id, g: d.g, x: q[0], y: q[1], r: Math.max(8 * dpr, r), oran, d });
  }
  /* değişiklik dalgası */
  if (v.dalga.length) { const f = ((zaman - AGT.t0) / 1000) % 3.2;
    for (const w of v.dalga) { const q = P(v.hucre[w.m].X, v.hucre[w.m].Yv, kz(w.g)); if (!q) continue; const e = f - w.gec * 2; if (e < 0 || e > 1.2) continue;
      ctx.globalAlpha = Math.max(0, 1 - e / 1.2); ctx.strokeStyle = R.stop; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.arc(q[0], q[1], (16 + e * 60) * q[2] * 2, 0, Math.PI * 2); ctx.stroke(); } }
  /* üstüne gelinen hücre */
  if (AGT.fare) { const hit = AGT.isabet.slice().reverse().find(x => Math.hypot(x.x - AGT.fare[0], x.y - AGT.fare[1]) < x.r); cv.style.cursor = hit ? 'pointer' : '';
    if (hit) { const metin = `${hit.m} · ${fmtDT(S.D, hit.d.a).slice(0, 9)} · doluluk %${Math.round(hit.oran * 100)}`; ctx.globalAlpha = 1; ctx.font = `600 ${13 * dpr}px system-ui, sans-serif`; const w = ctx.measureText(metin).width + 16 * dpr;
      ctx.fillStyle = R.zemin; ctx.strokeStyle = R.edge; ctx.lineWidth = dpr; ctx.beginPath(); ctx.roundRect(hit.x + 12 * dpr, hit.y - 34 * dpr, w, 26 * dpr, 6 * dpr); ctx.fill(); ctx.stroke(); ctx.fillStyle = R.ink; ctx.fillText(metin, hit.x + 20 * dpr, hit.y - 16 * dpr); } }
  ctx.globalAlpha = 1;
}
function agtBoyut() {
  const cv = document.getElementById('tb-ag'); if (!cv) return; const r = cv.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); cv.dpr = dpr;
}
function agtBagla() {
  const cv = document.getElementById('tb-ag'); if (!cv) return;
  AGT.veri = null; AGT.t0 = performance.now(); agtBoyut();
  if (!AGT.raf) AGT.raf = requestAnimationFrame(agtCiz);
  new ResizeObserver(agtBoyut).observe(cv);
  let tut = null; const ptr = new Map();
  cv.addEventListener('pointerdown', e => { ptr.set(e.pointerId, [e.clientX, e.clientY]); tut = { x: e.clientX, y: e.clientY, yaw: AGT.kam.yaw, pitch: AGT.kam.pitch, px: AGT.kam.x, py: AGT.kam.y, kay: e.shiftKey || e.button === 2 || ptr.size === 2, oynadi: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(); AGT.fare = [(e.clientX - r.left) * cv.dpr, (e.clientY - r.top) * cv.dpr];
    if (ptr.has(e.pointerId)) ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (!tut) return; const dx = e.clientX - tut.x, dy = e.clientY - tut.y; if (Math.abs(dx) + Math.abs(dy) > 4) tut.oynadi = true;
    if (tut.kay || ptr.size === 2) { AGT.kam.x = tut.px + dx; AGT.kam.y = tut.py + dy; }
    else { AGT.kam.yaw = tut.yaw + dx * 0.006; AGT.kam.pitch = Math.max(-1.2, Math.min(1.35, tut.pitch + dy * 0.005)); }
  });
  const bit = e => {
    ptr.delete(e.pointerId);
    if (tut && !tut.oynadi && AGT.isabet) { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * cv.dpr, y = (e.clientY - r.top) * cv.dpr;
      const hit = AGT.isabet.slice().reverse().find(q => Math.hypot(q.x - x, q.y - y) < q.r); if (hit) { tut = null; U.gySec = null; gyGir(hit.g); return; } }
    tut = null;
  };
  cv.addEventListener('pointerup', bit); cv.addEventListener('pointercancel', bit);
  cv.addEventListener('pointerleave', () => { AGT.fare = null; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { e.preventDefault(); AGT.kam.mesafe = Math.max(0.25, Math.min(3, AGT.kam.mesafe * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
}
function agtUstSerit() {
  return `<div class="pm-tb-ag-serit" role="group" aria-label="Ağ zamanı">${dugme('', 'ag-oynat', { simge: AGT.oynat ? 'pause' : 'play', kucuk: true, ad: AGT.oynat ? 'Durdur' : 'Oynat' })}${dugme('', 'ag-bas', { simge: 'first', kucuk: true, ad: 'Başa sar' })}<span class="mono" id="ag-zaman"></span>
    <span class="pm-kucuk">Hücre büyüklüğü o günün doluluğu · ışık, adımdan adıma geçen iş · katmanlar gün · hücreye basınca o gün öne gelir · sürükle döndür, Shift ile kaydır, tekerlekle yaklaş</span>${dugme('', 'ag-kamera', { simge: 'fit', kucuk: true, ad: 'Bakışı sıfırla' })}</div>`;
}
