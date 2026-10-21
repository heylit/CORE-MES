/* ---------- Atölye ikizi: planın elle yazılmış WebGL ile ışıklı, gölgeli 3B canlandırması ----------
   Kütüphane yok (dış paket onaysız girmez): tek birim küp, öteleme + ölçek + y dönüşü, yönlü ışık, yarım küre ortam ışığı,
   sis ve zemine izdüşürülmüş gölge. Etiketler, saat ve paneller HTML katmanıdır; render() çağırmadan yerinde güncellenir. */
const FB = { gl: null, cv: null, pr: null, u: null, kam: { h: [0, 0, 0], az: 0.55, el: 0.72, uz: 22 }, ucus: null, zaman: null, oynat: false, hiz: 4, kip: 'durum', iz: '', sec: null, ust: null, raf: null, sahne: null, anahtar: '', tur: -1, renk: null, tema: '', son: 0, surukle: null, VP: null, goz: null, etiket: {} };
const FB_HIZ = [[1, '1 sa/sn'], [4, '4 sa/sn'], [24, '1 gün/sn']];
const FB_ARA = 4.7, FB_SIRA = 3.3;
function fbDestek() {
  if (FB.destek != null) return FB.destek;
  try { const c = document.createElement('canvas'); FB.destek = !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { FB.destek = false; }
  return FB.destek;
}

/* ---------- sahne: tezgâhlar rotadaki ortalama sıralarına göre soldan sağa, grup içinde derinlemesine ---------- */
function fbSahneKur() {
  const p = fbPlan(); const cx = cxAl(); const D = S.D; if (!p || !cx) return { bos: true };
  const sira = {}; for (const u of D.urunler) u.rota.forEach((o, i) => { const gs = o.fason ? ['@' + o.fason] : [...new Set((o.tezgahlar || []).map(t => (D.tezgahlar.find(m => m.id === t.id) || {}).grup).filter(Boolean))]; for (const g of gs) (sira[g] = sira[g] || []).push(i / Math.max(1, u.rota.length - 1)); });
  const ort = g => { const l = sira[g] || [0.5]; return l.reduce((a, b) => a + b, 0) / l.length; };
  const gruplar = [...new Set(D.tezgahlar.map(m => m.grup))];
  const fasonlar = (D.fasoncular || []).filter(f => sira['@' + f.id]);
  const kolon = [...gruplar.map(g => ({ g, ad: g, l: D.tezgahlar.filter(m => m.grup === g).map(m => ({ id: m.id, ad: m.ad, fas: false })) })), ...fasonlar.map(f => ({ g: '@' + f.id, ad: 'Fason', l: [{ id: '@' + f.id, ad: f.ad, fas: true }] }))].sort((a, b) => ort(a.g) - ort(b.g));
  const N = {}; const x0 = -((kolon.length + 1) * FB_ARA) / 2;
  kolon.forEach((k, i) => { const x = x0 + (i + 1) * FB_ARA; k.x = x;
    k.l.forEach((m, j) => { const z = (j - (k.l.length - 1) / 2) * FB_SIRA; N[m.id] = { id: m.id, ad: m.fas ? m.ad : m.id, alt: m.fas ? 'Fason: ' + m.ad : `${m.ad} · ${k.g}`, grup: k.ad, fas: m.fas, p: [x, 0, z] }; }); });
  const zMax = Math.max(FB_SIRA, ...Object.values(N).map(n => Math.abs(n.p[2])));
  const depo = { id: '_depo', ad: 'Malzeme deposu', alt: 'İşler buradan çıkar', p: [x0, 0, 0], ozel: 'depo' };
  const sevk = { id: '_sevk', ad: 'Sevkiyat', alt: 'Biten siparişler buradan çıkar', p: [x0 + (kolon.length + 1) * FB_ARA, 0, 0], ozel: 'sevk' };
  N._depo = depo; N._sevk = sevk;
  const kuyruk = {}; for (const r of Object.values(p.ops)) if (isFinite(r.C) && N[r.m]) (kuyruk[r.m] = kuyruk[r.m] || []).push(r);
  for (const l of Object.values(kuyruk)) l.sort((a, b) => a.S - b.S);
  // parça yolları: önceki adım bittikten sonra en çok bir saatte sonraki tezgâhın girişine taşınır, orada bekler
  const yol = [], akis = {};
  const ekle = (a, b, t0, t1, job, tur) => { yol.push({ a, b, t0, t1, job, tur }); if (a !== b) { const k = a + '>' + b; (akis[k] = akis[k] || { a, b, n: 0, isler: new Set() }).n++; akis[k].isler.add(job); } };
  for (const o of cx.ops) { const r = p.ops[o.id]; if (!r || !isFinite(r.C) || !N[r.m]) continue;
    const onc = o.pr.map(([pid]) => p.ops[pid]).filter(x => x && isFinite(x.C) && N[x.m]);
    if (!onc.length) ekle('_depo', r.m, Math.max(cx.st.now, r.S - 1), r.S, r.job, 'depo');
    for (const a of onc) if (a.m !== r.m && a.C < r.S + 1e-6) ekle(a.m, r.m, a.C, r.S, r.job, 'ara');
    if (!(cx.succ[o.id] || []).length) ekle(r.m, '_sevk', r.C, r.C + 1, r.job, 'sevk'); }
  const now = cx.st.now; const Cs = Object.values(p.ops).map(r => r.C).filter(isFinite).sort((a, b) => a - b);
  const t1 = Math.max(now + 24, Cs.length ? Cs[Cs.length - 1] + 1 : now + 24);
  // doluluk: önümüzdeki bir haftada tezgâhın çalışma saatine oranla dolu saati
  const ufuk = [now, now + 24 * 7]; const dol = {};
  for (const id of Object.keys(N)) { const M = cx.M[id]; if (!M) continue; const ac = workIn(M.rw, ufuk[0], ufuk[1]); let mes = 0;
    for (const r of kuyruk[id] || []) mes += Math.max(0, Math.min(ufuk[1], r.C) - Math.max(ufuk[0], r.S));
    dol[id] = ac > 0 ? Math.min(1.2, mes / ac) : null; }
  const darbogaz = Object.entries(dol).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0];
  const ariza = [...(cx.st.down || []), ...(U.hamle && U.hamle.ariza && FB.etkiGor !== 'once' ? [U.hamle.ariza] : [])].filter(d => N[d.m]);
  const siparis = D.siparisler.map(s => ({ id: s.id, due: (cx.jobs[s.id] || {}).due, C: (p.J[s.id] || {}).C, T: (p.J[s.id] || {}).T || 0 }));
  return { N, kolon, yol, akis: Object.values(akis), kuyruk, now, t1, dol, darbogaz: darbogaz ? darbogaz[0] : null, ariza, siparis, x0, xs: sevk.p[0], zMax, maxN: Math.max(1, ...Object.values(akis).map(a => a.n)) };
}
function fbSahne() {
  const h = U.hamle; const k = [h ? `${h.ad}#${h.plan.ozet.wT}#${FB.etkiGor}` : '', S.dataVer, S.plan ? S.plan.ozet.wT : -1, S.plan ? Object.keys(S.plan.ops).length : 0, S.plan ? Object.values(S.plan.ops).reduce((a, r) => a + (r.S || 0), 0) : 0].join('|');
  if (FB.anahtar !== k || !FB.sahne) { FB.sahne = fbSahneKur(); FB.anahtar = k; if (FB.sahne.bos) return FB.sahne; if (FB.zaman == null || FB.zaman > FB.sahne.t1) FB.zaman = FB.sahne.now; if (FB.sec && !FB.sahne.N[FB.sec]) FB.sec = null; }
  return FB.sahne;
}
/* t anında tezgâhın durumu: arıza > ayar > çalışıyor > boş */
function fbDurum(s, id, t) {
  if (s.ariza.some(d => d.m === id && d.from <= t && t < d.to)) return { d: 'ariza' };
  const l = s.kuyruk[id] || []; const r = l.find(x => x.S <= t && t < x.C);
  if (!r) return { d: 'bos', sonra: l.find(x => x.S > t) };
  if (t < r.Su) return { d: 'ayar', r, i: (t - r.S) / Math.max(1e-6, r.Su - r.S) };
  return { d: 'calisiyor', r, i: (t - r.Su) / Math.max(1e-6, r.C - r.Su) };
}
const FB_DURUM = { calisiyor: ['Çalışıyor', 'tamam'], ayar: ['Ayarda', 'uyari'], ariza: ['Arızada', 'hata'], bos: ['Boş', ''] };

/* ---------- WebGL ---------- */
const FB_VS = `attribute vec3 aP;attribute vec3 aN;uniform mat4 uVP;uniform vec3 uPos,uSca,uL;uniform float uRot,uFlat;varying vec3 vN,vW;
void main(){vec3 p=aP*uSca;float c=cos(uRot),s=sin(uRot);p=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);vec3 w=p+uPos;
if(uFlat>0.5){w.xz-=uL.xz*(w.y/uL.y);w.y=0.004;}
vec3 n=aN/uSca;vN=normalize(vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z));vW=w;gl_Position=uVP*vec4(w,1.);}`;
const FB_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uC,uL,uGoz,uGok,uYer,uSis;uniform float uE,uA,uSisY,uSisU;varying vec3 vN,vW;
void main(){vec3 n=normalize(vN);float d=max(dot(n,uL),0.);vec3 h=normalize(uL+normalize(uGoz-vW));float sp=pow(max(dot(n,h),0.),40.)*.22;
vec3 amb=mix(uYer,uGok,n.y*.5+.5);vec3 c=uC*(amb*.62+d*.62)+sp*(1.-uE);c=mix(c,uC*1.15,uE);
float f=smoothstep(uSisY,uSisU,distance(uGoz,vW));gl_FragColor=vec4(mix(c,uSis,f*.8),uA);}`;
function fbGlKur(cv) {
  const gl = cv.getContext('webgl', { antialias: true, stencil: true, alpha: false, preserveDrawingBuffer: false }); if (!gl) return false;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, FB_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FB_FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  // birim küp: -0.5..0.5, yüz başına ayrı normal
  const v = []; const yuz = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  for (const n of yuz) { const a = n.map(Math.abs); const u = a[1] ? [1, 0, 0] : [0, 1, 0]; const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const k = (i, j) => [0, 1, 2].map(e => n[e] * 0.5 + u[e] * i * 0.5 + w[e] * j * 0.5);
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) v.push(...k(i, j), ...n); }
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(pr, 'aP'), aN = gl.getAttribLocation(pr, 'aN');
  gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 24, 12);
  const u = {}; for (const n of ['uVP', 'uPos', 'uSca', 'uL', 'uRot', 'uFlat', 'uC', 'uGoz', 'uGok', 'uYer', 'uSis', 'uE', 'uA', 'uSisY', 'uSisU']) u[n] = gl.getUniformLocation(pr, n);
  Object.assign(FB, { gl, cv, pr, u }); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  return true;
}
/* tasarım değişkenleri her biçimde yazılabilir; 1 piksel boyanıp okunarak RGB'ye çevrilir */
function fbRenkler() {
  const cs = getComputedStyle(document.documentElement); const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true });
  // yarı saydam değişkenler (panel2, edge2) sayfa zemininin üstüne boyanınca görünen renge çevrilir
  const zem = cs.getPropertyValue('--bg').trim() || '#808080';
  const rgb = n => { g.fillStyle = '#808080'; g.fillStyle = zem; g.fillRect(0, 0, 1, 1); g.fillStyle = cs.getPropertyValue(n).trim() || zem; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255]; };
  const R = { bg: rgb('--bg'), panel: rgb('--panel-solid'), panel2: rgb('--panel2'), ink: rgb('--ink'), muted: rgb('--muted'), edge: rgb('--edge'), edge2: rgb('--edge2'), run: rgb('--run'), hazard: rgb('--hazard'), stop: rgb('--stop'), done: rgb('--done'), hold: rgb('--hold'), grafik: rgb('--grafik'), grafik2: rgb('--grafik-2'), is: Array.from({ length: 10 }, (_, i) => rgb('--is-' + i)) };
  const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; R.koyu = L(R.bg) < 0.4;
  const kar = (a, b, t) => a.map((x, i) => x * (1 - t) + b[i] * t); R.kar = kar;
  R.zemin = R.koyu ? kar(R.bg, R.ink, 0.07) : kar(R.bg, R.ink, 0.1); R.serit = kar(R.zemin, R.ink, R.koyu ? 0.12 : 0.08);
  R.govde = R.koyu ? kar(R.panel, R.ink, 0.48) : kar(R.panel, R.edge2, 0.25); R.koyuGovde = kar(R.govde, R.ink, R.koyu ? -0.05 : 0.55).map(x => Math.max(0, x));
  R.cam = R.koyu ? [0.06, 0.08, 0.1] : [0.16, 0.2, 0.24]; R.metal = kar(R.govde, R.muted, 0.5);
  return R;
}
const fbM = {
  per(f, a, n, u) { const t = 1 / Math.tan(f / 2), k = 1 / (n - u); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (u + n) * k, -1, 0, 0, 2 * u * n * k, 0]; },
  bak(e, h) { const z = fbV.nor(fbV.cik(e, h)), x = fbV.nor(fbV.cap([0, 1, 0], z)), y = fbV.cap(z, x); return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -fbV.nok(x, e), -fbV.nok(y, e), -fbV.nok(z, e), 1]; },
  car(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
};
const fbV = { cik: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nok: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cap: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nor: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
function fbGoz() { const k = FB.kam; return [k.h[0] + k.uz * Math.cos(k.el) * Math.sin(k.az), k.h[1] + k.uz * Math.sin(k.el), k.h[2] + k.uz * Math.cos(k.el) * Math.cos(k.az)]; }
/* dünya noktası → ekran (CSS pikseli); arkadaysa null */
function fbIzdus(p) { const m = FB.VP; if (!m) return null; const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w <= 0.05) return null; const W = FB.cv.clientWidth, H = FB.cv.clientHeight; return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w]; }

/* ---------- çizim: önce opak sahne listesi kurulur, sonra gölge ve saydam geçişleri ---------- */
function fbCiz(sn) {
  const gl = FB.gl, cv = FB.cv, u = FB.u, R = FB.renk; const s = FB.sahne; if (!gl || !s || s.bos) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  gl.viewport(0, 0, cv.width, cv.height);
  const goz = fbGoz(); FB.goz = goz; FB.VP = fbM.car(fbM.per(0.68, W / H, 0.5, 400), fbM.bak(goz, FB.kam.h));
  gl.clearColor(R.bg[0], R.bg[1], R.bg[2], 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  const L = fbV.nor([-0.45, 1, 0.35]);
  gl.uniformMatrix4fv(u.uVP, false, FB.VP); gl.uniform3fv(u.uL, L); gl.uniform3fv(u.uGoz, goz);
  gl.uniform3fv(u.uGok, R.koyu ? R.kar(R.panel, [0.7, 0.8, 1], 0.25) : [1, 1, 1]); gl.uniform3fv(u.uYer, R.kar(R.zemin, [0, 0, 0], R.koyu ? 0.3 : 0.15)); gl.uniform3fv(u.uSis, R.bg);
  gl.uniform1f(u.uSisY, FB.kam.uz * 1.4); gl.uniform1f(u.uSisU, FB.kam.uz * 3.5 + 40);
  const t = FB.zaman; const L1 = [], L2 = [];
  // k: [x,y,z, sx,sy,sz, renk, ışıma, döndürme, gölge verir mi, saydamlık]
  const kutu = (x, y, z, a, b, c, renk, e, rot, golge, alfa) => (alfa != null && alfa < 1 ? L2 : L1).push([x, y, z, a, b, c, renk, e || 0, rot || 0, golge !== false, alfa == null ? 1 : alfa]);
  const iz = FB.kip === 'iz' && FB.iz ? FB.iz : null; const izTez = iz ? new Set(Object.values(fbPlan().ops).filter(r => r.job === iz).map(r => r.m)) : null;
  const et = fbEtki();
  const sonuk = id => id[0] !== '_' && ((!!izTez && !izTez.has(id)) || (!!et && !izTez && !et.tez[id]));
  const solgun = (c, id) => sonuk(id) ? R.kar(c, R.zemin, izTez ? 0.86 : 0.55) : c;
  // zemin, koridor şeritleri ve grup alanları
  const gen = s.xs - s.x0 + FB_ARA * 1.4, der = s.zMax * 2 + FB_SIRA * 2.2;
  kutu((s.x0 + s.xs) / 2, -0.06, 0, gen, 0.12, der, R.zemin, 0, 0, false);
  for (const k of s.kolon) kutu(k.x, 0.005, 0, FB_ARA * 0.78, 0.01, s.zMax * 2 + FB_SIRA * 0.95, R.kar(R.zemin, R.ink, R.koyu ? 0.05 : 0.035), 0, 0, false);
  kutu((s.x0 + s.xs) / 2, 0.008, s.zMax + FB_SIRA * 0.85, gen - 1, 0.012, 0.12, R.kar(R.hazard, R.zemin, 0.25), 0.35, 0, false);
  kutu((s.x0 + s.xs) / 2, 0.008, -s.zMax - FB_SIRA * 0.85, gen - 1, 0.012, 0.12, R.kar(R.hazard, R.zemin, 0.25), 0.35, 0, false);
  // doluluk kipi: tezgâh altında ısı karosu; darboğazın çevresinde atan halka
  if (FB.kip === 'doluluk') for (const [id, v] of Object.entries(s.dol)) { const n = s.N[id]; if (!n || v == null) continue;
    const c = v > 0.92 ? R.stop : v > 0.75 ? R.kar(R.hazard, R.stop, (v - 0.75) / 0.17) : R.kar(R.zemin, R.hazard, Math.min(1, v / 0.75));
    kutu(n.p[0], 0.012, n.p[2], 2.7, 0.02, 2.4, c, 0.55, 0, false);
    const yuk = Math.max(0.02, Math.min(1, v)) * 1.4; kutu(n.p[0] - 1.3, 0.02 + yuk / 2, n.p[2] - 1.0, 0.1, yuk, 0.1, c, 0.6); }
  if (s.darbogaz && (FB.kip === 'doluluk' || FB.tur === 2)) { const n = s.N[s.darbogaz]; const a = 1.75 + 0.18 * Math.sin(sn * 3.2); const c = R.stop;
    for (const [dx, dz, sx, sz] of [[0, a, 2 * a, 0.08], [0, -a, 2 * a, 0.08], [a, 0, 0.08, 2 * a], [-a, 0, 0.08, 2 * a]]) kutu(n.p[0] + dx, 0.03, n.p[2] + dz, sx, 0.04, sz, c, 0.9, 0, false); }
  // akış şeritleri: tezgâhtan tezgâha zemindeki yol; kalınlık o yoldan geçen iş sayısı, oklar yön
  const giris = n => n.ozel === 'depo' ? [n.p[0] + 1.6, n.p[2]] : n.ozel === 'sevk' ? [n.p[0] - 1.9, n.p[2]] : [n.p[0] - 1.55, n.p[2]];
  const cikis = n => n.ozel === 'depo' ? [n.p[0] + 1.6, n.p[2]] : [n.p[0] + 1.35, n.p[2]];
  for (const e of s.akis) { const a = s.N[e.a], b = s.N[e.b]; if (!a || !b) continue; const vurgu = iz ? e.isler.has(iz) : FB.sec ? (e.a === FB.sec || e.b === FB.sec) : true;
    const p0 = cikis(a), p1 = giris(b); const dx = p1[0] - p0[0], dz = p1[1] - p0[1], uz = Math.hypot(dx, dz); if (uz < 0.2) continue; const rot = Math.atan2(-dz, dx);
    const gw = 0.08 + 0.32 * (e.n / s.maxN); const c = vurgu ? (iz ? R.grafik : R.kar(R.grafik, R.zemin, 0.25)) : R.kar(R.serit, R.zemin, 0.4);
    kutu((p0[0] + p1[0]) / 2, 0.02, (p0[1] + p1[1]) / 2, uz, 0.02, gw, c, vurgu ? 0.45 : 0, rot, false);
    if (vurgu) { const adim = 1.1, kay = AG_AZ ? 0.5 : (sn * 0.9) % 1; for (let d = kay * adim; d < uz - 0.15; d += adim) { const q = d / uz; kutu(p0[0] + dx * q, 0.045, p0[1] + dz * q, 0.22, 0.03, gw + 0.12, R.kar(c, [1, 1, 1], R.koyu ? 0.35 : 0.5), 0.8, rot, false); } } }
  // sipariş izi: rotanın adımları sırasıyla havada parlayan bir yolla bağlanır
  if (iz) { const adim = Object.values(fbPlan().ops).filter(r => r.job === iz && s.N[r.m]).sort((a, b) => a.S - b.S); const yolN = [s.N._depo, ...adim.map(r => s.N[r.m]), s.N._sevk];
    for (let i = 0; i < yolN.length - 1; i++) { const a = yolN[i], b = yolN[i + 1]; const dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2], uz = Math.hypot(dx, dz); if (uz < 0.1) continue; const rot = Math.atan2(-dz, dx);
      const bitti = i > 0 && adim[i - 1] && adim[i - 1].C <= t; const c = bitti ? R.run : R.grafik;
      kutu((a.p[0] + b.p[0]) / 2, 3.6, (a.p[2] + b.p[2]) / 2, uz, 0.12, 0.12, c, 0.9, rot);
      for (let d = (AG_AZ ? 0.5 : (sn * 1.4) % 1) * 1.2; d < uz; d += 1.2) { const q = d / uz; kutu(a.p[0] + dx * q, 3.6, a.p[2] + dz * q, 0.26, 0.2, 0.26, R.kar(c, [1, 1, 1], 0.45), 1, rot, false); }
      kutu(b.p[0], 1.8 + 0.9, b.p[2], 0.05, 1.8, 0.05, c, 0.6, 0, false); } }
  // tezgâhlar
  const durumlar = {};
  for (const n of Object.values(s.N)) {
    const [x, , z] = n.p; const so = sonuk(n.id);
    if (n.ozel === 'depo') { // raf sistemi: dikmeler, raflar, üstünde sipariş renginde kasalar
      for (const dz of [-1.4, 1.4]) for (const dx of [-0.9, 0.9]) kutu(x + dx, 1.1, z + dz, 0.08, 2.2, 0.08, R.metal);
      for (const hy of [0.25, 1.05, 1.85]) { kutu(x, hy, z, 1.95, 0.06, 3.0, R.kar(R.hazard, R.metal, 0.55)); for (let i = 0; i < 4; i++) kutu(x + ((i % 2) - 0.5) * 0.85, hy + 0.27, z - 1.05 + i * 0.7, 0.62, 0.45, 0.5, R.is[(i + Math.round(hy * 3)) % 10]); }
      continue; }
    if (n.ozel === 'sevk') { // yükleme rampası ve kamyon
      kutu(x, 0.35, z, 2.6, 0.7, 3.4, R.kar(R.govde, R.zemin, 0.3)); kutu(x + 1.15, 1.4, z - 0.2, 2.1, 1.8, 1.25, R.kar(R.panel, [1, 1, 1], 0.5)); kutu(x + 2.55, 1.1, z - 0.2, 0.8, 1.2, 1.2, R.grafik);
      kutu(x + 2.75, 1.35, z - 0.2, 0.3, 0.45, 1.05, R.cam, 0.1); for (const wx of [0.6, 1.8, 2.6]) for (const wz of [-0.82, 0.42]) kutu(x + wx, 0.3, z - 0.2 + wz, 0.55, 0.55, 0.22, [0.08, 0.08, 0.09]);
      continue; }
    const du = fbDurum(s, n.id, t); durumlar[n.id] = du;
    const yanik = c => solgun(c, n.id);
    if (n.fas) { // fason: dış firma binası, kapısında durum ışığı
      kutu(x, 1.1, z, 3.0, 2.2, 2.4, yanik(R.kar(R.is[3], R.govde, 0.55))); kutu(x, 2.32, z, 3.2, 0.25, 2.6, yanik(R.koyuGovde));
      kutu(x - 1.51, 0.75, z, 0.04, 1.5, 1.3, yanik(R.cam), 0.1);
      kutu(x - 1.55, 1.75, z + 0.9, 0.12, 0.25, 0.25, du.d === 'calisiyor' ? R.run : R.kar(R.run, R.zemin, 0.8), du.d === 'calisiyor' ? 1 : 0);
      continue; }
    const govde = yanik(R.govde), koyu = yanik(R.koyuGovde);
    kutu(x, 0.14, z, 2.3, 0.28, 1.7, koyu); // kaide
    kutu(x - 0.1, 0.98, z, 2.0, 1.4, 1.5, govde); // kabin
    kutu(x - 0.1, 1.78, z - 0.05, 1.7, 0.2, 1.3, yanik(R.kar(R.govde, R.ink, 0.12))); // tavan
    const camRenk = du.d === 'calisiyor' ? R.kar(R.cam, R.run, 0.35) : du.d === 'ayar' ? R.kar(R.cam, R.hazard, 0.3) : du.d === 'ariza' ? R.kar(R.cam, R.stop, 0.35) : R.cam;
    kutu(x - 0.35, 1.02, z + 0.755, 1.1, 0.85, 0.02, yanik(camRenk), du.d === 'bos' ? 0.05 : 0.45); // ön cam
    kutu(x + 0.55, 1.0, z + 0.78, 0.04, 0.9, 0.04, yanik(R.metal)); // kapı kolu
    if (du.d === 'calisiyor' && !so) kutu(x - 0.35, 1.0, z + 0.2, 0.08, 0.5, 0.08, R.kar(R.metal, [1, 1, 1], 0.3), 0.3, AG_AZ ? 0 : sn * 9); // iş mili
    kutu(x + 0.98, 1.05, z + 0.45, 0.28, 0.75, 0.5, koyu); kutu(x + 1.13, 1.15, z + 0.45, 0.02, 0.4, 0.38, du.d === 'bos' ? R.kar(R.cam, R.grafik, 0.15) : R.grafik, du.d === 'bos' ? 0.1 : 0.7); // kumanda
    // ışık kulesi: kırmızı arıza, sarı ayar, yeşil çalışıyor
    kutu(x + 0.7, 2.05, z - 0.55, 0.06, 0.5, 0.06, R.metal);
    [['ariza', R.stop], ['ayar', R.hazard], ['calisiyor', R.run]].forEach(([d, c], i) => { const ac = du.d === d && !so; kutu(x + 0.7, 2.75 - i * 0.2, z - 0.55, 0.17, 0.17, 0.17, ac ? c : R.kar(c, R.koyuGovde, 0.75), ac ? (d === 'ariza' && !AG_AZ ? 0.6 + 0.4 * Math.sin(sn * 8) : 1) : 0.05); });
    // ilerleme çubuğu tavanda
    if (du.r && !so) { const c = du.d === 'ayar' ? R.hazard : R.run; const L = 1.6 * Math.max(0.02, Math.min(1, du.i)); kutu(x - 0.1, 1.9, z + 0.6, 1.6, 0.06, 0.1, R.kar(R.koyuGovde, R.zemin, 0.2)); kutu(x - 0.9 + L / 2, 1.92, z + 0.6, L, 0.07, 0.11, c, 0.8); }
    // çalışan tezgâhın altında ışıma
    if (du.d !== 'bos' && !so) kutu(x - 0.1, 0.01, z, 2.9, 0.01, 2.2, du.d === 'calisiyor' ? R.run : du.d === 'ayar' ? R.hazard : R.stop, 1, 0, false, 0.18);
    if (n.id === FB.sec || n.id === FB.ust) { const c = n.id === FB.sec ? R.ink : R.muted; for (const [dx, dz, sx, sz] of [[0, 1.3, 2.9, 0.06], [0, -1.3, 2.9, 0.06], [1.45, 0, 0.06, 2.6], [-1.45, 0, 0.06, 2.6]]) kutu(x + dx, 0.03, z + dz, sx, 0.03, sz, c, 0.6, 0, false); }
  }
  if (et) fbEtkiCiz(kutu, et, sn, R);
  if (FB.tasi) fbTasiCiz(kutu, R, sn);
  // paletler ve yoldaki parçalar
  const bekleyen = {}; let yolda = 0;
  for (const y of s.yol) { if (!(y.t0 <= t && t < y.t1)) continue; if (iz && y.job !== iz) continue;
    const a = s.N[y.a], b = s.N[y.b]; const tau = Math.min(1, (y.t1 - y.t0) / 2); const ic = (t - y.t0) / Math.max(1e-6, tau);
    const jc = durumRenkFb(y.job, R);
    if (ic < 1 && y.a !== y.b) { yolda++; const p0 = cikis(a), p1 = giris(b); const e = ic < 0.5 ? 2 * ic * ic : 1 - Math.pow(-2 * ic + 2, 2) / 2; const px = p0[0] + (p1[0] - p0[0]) * e, pz = p0[1] + (p1[1] - p0[1]) * e; const rot = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
      kutu(px, 0.2, pz, 0.75, 0.28, 0.55, R.kar(R.hazard, R.koyuGovde, 0.15), 0.1, rot); kutu(px + Math.cos(rot) * 0.32, 0.55, pz - Math.sin(rot) * 0.32, 0.1, 0.6, 0.5, R.metal, 0, rot); kutu(px, 0.48, pz, 0.5, 0.28, 0.42, jc, 0.25, rot); }
    else if (y.b !== '_sevk') (bekleyen[y.b] = bekleyen[y.b] || []).push(y); }
  for (const [id, l] of Object.entries(bekleyen)) { const n = s.N[id]; if (!n || n.ozel) continue; const g = giris(n);
    l.slice(0, 8).forEach((y, i) => { const kol = i % 2, kat = Math.floor(i / 2); const px = g[0] - 0.05, pz = g[1] - 0.45 + kol * 0.9;
      if (kat === 0) kutu(px, 0.06, pz, 0.8, 0.1, 0.8, R.kar(R.hazard, R.metal, 0.6)); kutu(px, 0.27 + kat * 0.4, pz, 0.62, 0.34, 0.62, solgun(durumRenkFb(y.job, R), id), 0.12); }); }
  FB.say = { durumlar, bekleyen, yolda };
  // opak geçiş
  gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(u.uFlat, 0); gl.uniform1f(u.uA, 1); gl.disable(gl.STENCIL_TEST);
  const ciz = k => { gl.uniform3f(u.uPos, k[0], k[1], k[2]); gl.uniform3f(u.uSca, k[3], k[4], k[5]); gl.uniform3fv(u.uC, k[6]); gl.uniform1f(u.uE, k[7]); gl.uniform1f(u.uRot, k[8]); gl.drawArrays(gl.TRIANGLES, 0, 36); };
  for (const k of L1) ciz(k);
  // gölge: zemine düzleştir, her piksel bir kez koyulaşsın diye şablon tamponu
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR); gl.disable(gl.CULL_FACE);
  gl.uniform1f(u.uFlat, 1); gl.uniform1f(u.uA, R.koyu ? 0.42 : 0.2); gl.uniform1f(u.uE, 1);
  for (const k of L1) if (k[9] && k[4] > 0.05) { gl.uniform3f(u.uPos, k[0], k[1], k[2]); gl.uniform3f(u.uSca, k[3], k[4], k[5]); gl.uniform3fv(u.uC, [0, 0, 0]); gl.uniform1f(u.uRot, k[8]); gl.drawArrays(gl.TRIANGLES, 0, 36); }
  gl.disable(gl.STENCIL_TEST); gl.uniform1f(u.uFlat, 0); gl.enable(gl.CULL_FACE);
  for (const k of L2) { gl.uniform1f(u.uA, k[10]); ciz(k); }
  gl.depthMask(true);
}
function durumRenkFb(job, R) { const i = S.D.siparisler.findIndex(s => s.id === job); const J = S.plan && S.plan.J && S.plan.J[job]; if (J && J.T > 0.05 && FB.kip !== 'iz') return R.stop; return R.is[(i < 0 ? 0 : i) % 10]; }

/* ---------- HTML katmanı: etiketler, saat ve göstergeler ---------- */
function fbKatman() {
  const s = FB.sahne; const kat = document.getElementById('fb-etiketler'); if (!kat || !s || s.bos) return;
  const t = FB.zaman; const yakin = FB.kam.uz < 26; const dar = FB.cv.clientWidth < 560;
  const liste = Object.values(s.N).map(n => { const q = fbIzdus([n.p[0], n.ozel ? 3.3 : n.fas ? 2.9 : 3.15, n.p[2]]); return { n, q }; }).filter(x => x.q).sort((a, b) => a.q[2] - b.q[2]);
  const yer = []; const gor = new Set();
  const adimNo = {}; if (FB.kip === 'iz' && FB.iz) Object.values(fbPlan().ops).filter(r => r.job === FB.iz).sort((a, b) => a.S - b.S).forEach((r, i) => { (adimNo[r.m] = adimNo[r.m] || []).push(i + 1); });
  const izVar = FB.kip === 'iz' && FB.iz; const et = fbEtki();
  for (const { n, q } of liste) {
    let el = FB.etiket[n.id]; if (!el || !el.isConnected) { el = document.createElement('button'); el.type = 'button'; el.className = 'pm-fb-et'; el.dataset.act = 'fb-sec'; el.dataset.v = n.id; kat.appendChild(el); FB.etiket[n.id] = el; }
    const du = FB.say && FB.say.durumlar[n.id]; const ozet = n.ozel ? '' : du && du.r ? `${esc(du.r.job)} · %${Math.round(Math.min(1, du.i) * 100)}` : du && du.d === 'ariza' ? 'Arızada' : 'Boş';
    if (izVar && !n.ozel && !adimNo[n.id]) { el.hidden = true; continue; }
    const genis = !dar && (yakin || n.id === FB.sec || n.ozel || izVar || (et && !!et.tez[n.id]));
    const w = genis ? 128 : 64, h = genis ? 40 : 22; const r = [q[0] - w / 2, q[1] - h, q[0] + w / 2, q[1]];
    const cak = yer.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
    const goster = (!cak || n.id === FB.sec) && q[0] > -40 && q[0] < FB.cv.clientWidth + 40 && q[1] > -10 && q[1] < FB.cv.clientHeight + 40;
    if (!goster) { el.hidden = true; continue; } yer.push(r); gor.add(n.id); el.hidden = false;
    const icerik = `${adimNo[n.id] ? `<em>${adimNo[n.id].join(', ')}</em>` : n.ozel ? '' : `<i data-durum="${du ? du.d : 'bos'}"></i>`}<b>${esc(n.ad)}</b>${et && et.tez[n.id] ? fbEtkiRozet(et.tez[n.id]) : ''}${genis && ozet ? `<span>${ozet}</span>${du && du.r ? `<span class="pm-fb-cubuk"><span style="--p:${Math.round(Math.min(1, du.i) * 100)}%"></span></span>` : ''}` : ''}`;
    if (el.dataset.ic !== icerik) { el.innerHTML = icerik; el.dataset.ic = icerik; el.setAttribute('aria-label', `${n.ad}${ozet ? ', ' + ozet : ''}`); }
    el.dataset.secili = n.id === FB.sec; el.dataset.darbogaz = FB.kip === 'doluluk' && n.id === s.darbogaz;
    el.style.transform = `translate(${Math.round(q[0])}px, ${Math.round(q[1])}px) translate(-50%, -100%)`;
  }
  // gösterge şeridi
  const g = document.getElementById('fb-gosterge'); if (g && FB.say) { const d = Object.values(FB.say.durumlar); const c = x => d.filter(y => y.d === x).length;
    const bek = Object.values(FB.say.bekleyen).reduce((a, l) => a + l.length, 0); const gec = s.siparis.filter(x => x.due != null && t > x.due && !(isFinite(x.C) && x.C <= t)).length;
    const html = `<span class="pm-fb-saat mono">${esc(fmtDT(S.D, t))}</span><span><i data-durum="calisiyor"></i>${c('calisiyor')} çalışıyor</span><span><i data-durum="ayar"></i>${c('ayar')} ayarda</span><span><i data-durum="bos"></i>${c('bos')} boş</span>${c('ariza') ? `<span><i data-durum="ariza"></i>${c('ariza')} arızada</span>` : ''}<span>${ic('box', 'k')}${bek} palet bekliyor</span><span>${ic('truck', 'k')}${FB.say.yolda} yolda</span><span data-gec="${gec > 0}">${ic('alert', 'k')}${gec} sipariş termini geçti</span>${U.hamle ? `<span class="pm-fb-onizle">${ic('target', 'k')}${FB.etkiGor === 'once' ? 'Şimdiki plan' : 'Önizleme'}: gecikme ${sayi(S.plan.ozet.wT, 1)} → ${sayi(U.hamle.plan.ozet.wT, 1)} sa</span>` : ''}`;
    if (g.dataset.ic !== html) { g.innerHTML = html; g.dataset.ic = html; } }
  const zr = document.getElementById('fb-zaman'); if (zr && document.activeElement !== zr) zr.value = t;
}

/* ---------- döngü ---------- */
function fbDongu(ms) {
  if (!FB.cv || !FB.cv.isConnected) { FB.raf = null; FB.oynat = false; return; }
  const sn = ms / 1000; const dt = FB.son ? Math.min(0.1, sn - FB.son) : 0; FB.son = sn;
  const s = FB.sahne;
  if (FB.oynat && s && !s.bos) { FB.zaman = Math.min(s.t1, FB.zaman + dt * FB.hiz); if (FB.zaman >= s.t1) { FB.oynat = false; fbOynatDugme(); } }
  if (FB.ucus) { const f = FB.ucus; const k = Math.min(1, (sn - f.t0) / f.sure); const e = 1 - Math.pow(1 - k, 3);
    FB.kam.h = f.a.h.map((v, i) => v + (f.b.h[i] - v) * e); for (const n of ['az', 'el', 'uz']) FB.kam[n] = f.a[n] + (f.b[n] - f.a[n]) * e; if (k >= 1) FB.ucus = null; }
  fbCiz(sn); fbKatman();
  const hareket = FB.oynat || FB.ucus || FB.surukle || (!AG_AZ && !document.hidden);
  FB.raf = hareket ? requestAnimationFrame(fbDongu) : null;
}
function fbTetikle() { if (!FB.raf) FB.raf = requestAnimationFrame(fbDongu); }
function fbUc(b, sure) { const a = { h: FB.kam.h.slice(), az: FB.kam.az, el: FB.kam.el, uz: FB.kam.uz }; const hedef = { h: b.h || a.h, az: b.az ?? a.az, el: b.el ?? a.el, uz: b.uz ?? a.uz };
  while (hedef.az - a.az > Math.PI) hedef.az -= 2 * Math.PI; while (a.az - hedef.az > Math.PI) hedef.az += 2 * Math.PI;
  if (AG_AZ) { Object.assign(FB.kam, hedef); FB.ucus = null; } else FB.ucus = { a, b: hedef, t0: performance.now() / 1000, sure: sure || 0.9 }; fbTetikle(); }
/* Bütün atölyeyi kadraja sığdıran uzaklık: zeminin köşeleri ekranın içinde kalana dek ikiye bölerek aranır. */
function fbSigdir(az, el, h) {
  const s = FB.sahne; const W = FB.cv.clientWidth, H = FB.cv.clientHeight; if (!W || !H) return 40;
  const k = []; for (const x of [s.x0 - 1.2, s.xs + 2.6]) for (const z of [-s.zMax - 1.4, s.zMax + 1.4]) for (const y of [0, 3]) k.push([x, y, z]);
  const eski = { kam: FB.kam, VP: FB.VP }; let lo = 4, hi = 600;
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; FB.kam = { h, az, el, uz: m }; const g = fbGoz(); FB.VP = fbM.car(fbM.per(0.68, W / H, 0.5, 400), fbM.bak(g, h));
    const ic = k.every(p => { const q = fbIzdus(p); return q && q[0] > W * 0.03 && q[0] < W * 0.97 && q[1] > H * 0.12 && q[1] < H * 0.99; }); if (ic) hi = m; else lo = m; }
  FB.kam = eski.kam; FB.VP = eski.VP; return hi;
}
function fbKamera(tur, id) {
  const s = FB.sahne; if (!s || s.bos || !FB.cv) return; const dik = FB.cv.clientWidth < FB.cv.clientHeight; const h = [(s.x0 + s.xs) / 2, 0, 0];
  if (tur === 'genel') { const az = dik ? 1.15 : 0.62, el = dik ? 0.95 : 0.8; fbUc({ h, az, el, uz: fbSigdir(az, el, h) }); }
  else if (tur === 'kus') { const az = dik ? Math.PI / 2 : 0.0001, el = 1.42; fbUc({ h, az, el, uz: fbSigdir(az, el, h) }); }
  else if (tur === 'yakin') { const n = s.N[id || FB.sec || s.darbogaz] || Object.values(s.N)[2]; if (n) fbUc({ h: [n.p[0], 1, n.p[2]], az: 0.5, el: 0.42, uz: 9 }); }
}

/* ---------- kart ---------- */
function fbKart() {
  const s = fbSahne(); if (s.bos) return kart(`${ic('cube', 'k')} Atölye ikizi`, '<p class="pm-alt">Plan yok. Önce bir plan çözün.</p>');
  const gunler = []; for (let d = Math.ceil(s.now / 24) * 24; d < s.t1; d += 24) gunler.push(d);
  const yuz = x => `${(100 * (x - s.now)) / Math.max(1, s.t1 - s.now)}%`;
  const terminler = s.siparis.filter(x => x.due != null && x.due >= s.now && x.due <= s.t1);
  const kipler = `<div class="pm-seg" role="tablist" aria-label="Gösterim">${[['durum', 'Durum', 'gauge'], ['doluluk', 'Doluluk', 'chart'], ['iz', 'Sipariş izi', 'target']].map(([id, ad, sm]) => `<button type="button" role="tab" data-act="fb-kip" data-v="${id}" aria-selected="${FB.kip === id}">${ic(sm, 'k')}${ad}</button>`).join('')}</div>`;
  const izSec = FB.kip === 'iz' ? `<select class="tc-alan-kutu" style="width:auto" data-chg="fb-iz" aria-label="İzlenecek sipariş"><option value="">Sipariş seçin</option>${s.siparis.map(x => `<option value="${esc(x.id)}" ${FB.iz === x.id ? 'selected' : ''}>${esc(x.id)}${x.T > 0.05 ? ' · gecikiyor' : ''}</option>`).join('')}</select>` : '';
  const kam = `<div class="pm-dugmeler">${[['genel', 'Genel', 'fit'], ['kus', 'Kuşbakışı', 'grid'], ['yakin', 'Yakın', 'zin']].map(([id, ad, sm]) => dugme(ad, 'fb-kam', { simge: sm, kucuk: true, hayalet: true, veri: `data-v="${id}"` })).join('')}${dugme(FB.tur < 0 ? 'Rehberli tur' : 'Turu bitir', 'fb-tur', { simge: FB.tur < 0 ? 'help' : 'x', kucuk: true, veri: `data-v="${FB.tur < 0 ? 0 : 'bitir'}"` })}</div>`;
  const oynat = `<div class="pm-fb-oynat">${dugme('', 'fb-oynat', { simge: FB.oynat ? 'pause' : 'play', kucuk: true, ad: FB.oynat ? 'Durdur' : 'Planı oynat', cls: 'tc-dugme-birincil' })}${dugme('', 'fb-basa', { simge: 'first', kucuk: true, ad: 'Şimdiye dön' })}
    <div class="pm-fb-serit"><input type="range" id="fb-zaman" min="${s.now}" max="${s.t1}" step="0.05" value="${FB.zaman}" aria-label="Plan saati"><div class="pm-fb-gunler" aria-hidden="true">${gunler.map(d => `<span style="--x:${yuz(d)}">${esc(fmtDT(S.D, d).slice(0, 5))}</span>`).join('')}${terminler.map(x => `<i style="--x:${yuz(x.due)}" data-gec="${x.T > 0.05}" title="${esc(x.id)} termini"></i>`).join('')}</div></div>
    <div class="pm-seg" role="tablist" aria-label="Oynatma hızı">${FB_HIZ.map(([h, ad]) => `<button type="button" role="tab" data-act="fb-hiz" data-v="${h}" aria-selected="${FB.hiz === h}">${ad}</button>`).join('')}</div></div>`;
  const tur = FB.tur >= 0 ? fbTurPanel() : '';
  const gov = `<div class="pm-ag-ust">${kipler}${izSec}${kam}</div>${tur}
  <div class="pm-fb-kap"><div class="pm-fb"><canvas id="fb-cv" tabindex="0" role="img" aria-label="Atölye ikizi: tezgâhlar, sıradaki paletler ve tezgâhlar arasında taşınan parçalar plan saatine göre canlanır. Sürükleyerek döndürün, Shift ya da sağ tuşla kaydırın, tekerlekle yakınlaştırın; ok tuşları, artı eksi ve boşluk da çalışır."></canvas><div class="pm-fb-etiketler" id="fb-etiketler"></div><div class="pm-fb-gosterge" id="fb-gosterge" role="status" aria-live="off"></div></div>
  <div class="pm-ag-detay" id="fb-detay">${fbDetay()}</div></div>${oynat}
  <div class="pm-lejant"><span><i data-tur="calisiyor"></i>Çalışıyor</span><span><i data-tur="ayarda"></i>Ayarda</span><span><i data-tur="gec"></i>Arızada ya da geciken sipariş</span><span><i data-tur="tezgah"></i>Boş</span><span class="pm-kucuk">${FB.kip === 'doluluk' ? 'Zemin rengi ve yan sütun önümüzdeki haftanın doluluğu; kırmızı halka darboğaz.' : 'Tezgâhın solundaki paletler sırasını bekleyen işler; zemindeki oklu yollar parça akışı, kalınlığı o yoldan geçen iş sayısı.'}</span></div>`;
  return kart(`${ic('cube', 'k')} Atölye ikizi`, gov, '', `<span class="pm-kucuk">${s.kolon.length} grup · ${Object.keys(s.N).length - 2} tezgâh · ${s.siparis.length} sipariş</span>`);
}
const FB_TUR = [
  ['Malzeme deposu', 'Her sipariş ilk işleminden bir saat önce depodan çıkar. Soldaki raflar başlangıç noktasıdır.', () => ({ h: [FB.sahne.x0 + 2, 0.8, 0], az: 0.75, el: 0.45, uz: 12 })],
  ['Tezgâh grupları', 'Tezgâhlar rotadaki sıralarına göre soldan sağa dizilir. Işık kulesi durumu gösterir: yeşil çalışıyor, sarı ayarda, kırmızı arızada.', () => { const k = FB.sahne.kolon[0]; return { h: [k.x + FB_ARA / 2, 0.8, 0], az: 0.35, el: 0.55, uz: 16 }; }],
  ['Darboğaz', 'Önümüzdeki haftada en dolu tezgâh kırmızı halkayla gösterilir. Kuyruğu en uzun olan da genelde budur; plan onu besleyecek biçimde kurulur.', () => { const n = FB.sahne.N[FB.sahne.darbogaz]; return n ? { h: [n.p[0], 0.8, n.p[2]], az: 0.6, el: 0.5, uz: 10 } : {}; }],
  ['Sipariş izi', 'Bir siparişin yolunu izleyin: geçtiği tezgâhlar yanar, diğerleri soluklaşır. Panel adımlarını ve terminle bitişi karşılaştırır.', () => ({})],
  ['Sevkiyat', 'Son işlemi biten parça bir saat içinde sevkiyata gider. Oynatıp zamanı ilerletin; çalışan, bekleyen ve yoldaki parçaları üstteki şerit sayar.', () => ({ h: [FB.sahne.xs - 1, 0.8, 0], az: -0.5, el: 0.45, uz: 12 })],
];
function fbTurPanel() { const [b, m] = FB_TUR[FB.tur]; return `<div class="pm-ag-tur" role="status"><span class="mono">${FB.tur + 1} / ${FB_TUR.length}</span><b>${esc(b)}</b><div class="pm-dugmeler">${dugme('', 'fb-tur', { simge: 'chev-left', kucuk: true, ad: 'Önceki adım', veri: `data-v="${Math.max(0, FB.tur - 1)}"` })}${FB.tur < FB_TUR.length - 1 ? dugme('Sonraki', 'fb-tur', { simge: 'next', kucuk: true, veri: `data-v="${FB.tur + 1}"` }) : dugme('Bitir', 'fb-tur', { simge: 'check', kucuk: true, veri: 'data-v="bitir"' })}</div><p>${esc(m)}</p></div>`; }
function fbTurGit(i) {
  FB.tur = i; const s = FB.sahne; if (i < 0 || !s || s.bos) return;
  if (i === 2) FB.kip = 'doluluk'; else if (i === 3) { FB.kip = 'iz'; const g = s.siparis.slice().sort((a, b) => b.T - a.T)[0]; FB.iz = g ? g.id : ''; } else FB.kip = 'durum';
  if (i === 2 && s.darbogaz) FB.sec = s.darbogaz; else if (i !== 2) FB.sec = null;
  const k = FB_TUR[i][2](); if (i === 3) fbKamera('genel'); else fbUc(k, 1.2);
}

function fbDetay() {
  const s = FB.sahne; if (!s || s.bos) return '';
  if (U.hamle) return fbEtkiPanel() + (FB.sec ? fbDetayIc(s) : '');
  return fbDetayIc(s);
}
function fbDetayIc(s) {
  const t = FB.zaman; const cx = cxAl();
  if (FB.kip === 'iz' && FB.iz) { const sp = s.siparis.find(x => x.id === FB.iz); const ops = Object.values(fbPlan().ops).filter(r => r.job === FB.iz).sort((a, b) => a.S - b.S);
    const satir = r => { const d = r.C <= t ? ['bitti', 'tamam'] : r.S <= t ? ['şimdi', 'uyari'] : ['sırada', '']; return `<li><span class="mono">${esc(fmtDT(S.D, r.S))}</span> <b>${esc(r.m)}</b> ${esc(((cx && cx.byId[r.id]) || {}).ad || r.id)} ${rozet(d[0], d[1])}</li>`; };
    const fark = sp && sp.due != null && isFinite(sp.C) ? sp.C - sp.due : null;
    return `<div class="pm-ag-sec"><span class="pm-kucuk">Sipariş izi</span><b class="mono">${esc(FB.iz)}</b>
      <p class="pm-kucuk">Termin ${sp && sp.due != null ? esc(fmtDT(S.D, sp.due)) : '—'} · bitiş ${sp && isFinite(sp.C) ? esc(fmtDT(S.D, sp.C)) : '—'}${fark == null ? '' : fark > 0.05 ? ` · ${rozet(sayi(fark, 1) + ' sa geç', 'hata')}` : ` · ${rozet(sayi(-fark, 1) + ' sa erken', 'tamam')}`}</p>
      <ol class="pm-ag-liste">${ops.map(satir).join('')}</ol><div class="pm-dugmeler">${dugme('Plan masasında gör', 'sec-is-masa', { kucuk: true, simge: 'gantt', veri: `data-v="${esc(FB.iz)}"` })}</div></div>`; }
  const n = FB.sec && s.N[FB.sec];
  if (!n) return `<p class="pm-kucuk">Bir tezgâha ya da etiketine tıklayın: şu an ne yaptığı, sıradaki işleri ve doluluğu burada görünür.</p><p class="pm-kucuk">${s.darbogaz ? `Önümüzdeki haftanın darboğazı <b>${esc(s.darbogaz)}</b>, doluluğu %${Math.round((s.dol[s.darbogaz] || 0) * 100)}.` : ''}</p>`;
  if (n.ozel) return `<div class="pm-ag-sec"><span class="pm-kucuk">${n.ozel === 'depo' ? 'Başlangıç' : 'Bitiş'}</span><b>${esc(n.ad)}</b><p class="pm-kucuk">${esc(n.alt)}</p><p class="pm-kucuk">${n.ozel === 'depo' ? `${s.yol.filter(y => y.a === '_depo' && y.t0 >= t && y.t0 < t + 24).length} iş 24 saat içinde depodan çıkacak.` : `${s.yol.filter(y => y.b === '_sevk' && y.t0 >= t && y.t0 < t + 24).length} parça 24 saat içinde sevkiyata gelecek.`}</p>${dugme('Seçimi kaldır', 'fb-sec', { kucuk: true, hayalet: true, simge: 'x', veri: 'data-v=""' })}</div>`;
  const du = fbDurum(s, n.id, t); const l = (s.kuyruk[n.id] || []).filter(r => r.S > t).slice(0, 6); const bek = (FB.say && FB.say.bekleyen[n.id]) || [];
  const dol = s.dol[n.id];
  return `<div class="pm-ag-sec"><span class="pm-kucuk">${esc(n.fas ? 'Fason' : n.grup)}</span><b>${esc(n.ad)}</b><p class="pm-kucuk">${esc(n.alt)}</p>
    <p>${rozet(FB_DURUM[du.d][0], FB_DURUM[du.d][1])}${du.r ? ` <b class="mono">${esc(du.r.job)}</b> ${esc(((cx && cx.byId[du.r.id]) || {}).ad || du.r.id)}` : ''}</p>
    ${du.r ? `<div class="pm-fb-cubuk pm-fb-cubuk-buyuk" aria-label="İlerleme %${Math.round(du.i * 100)}"><span style="--p:${Math.round(Math.min(1, du.i) * 100)}%"></span></div><p class="pm-kucuk">${du.d === 'ayar' ? 'Ayar biter' : 'İş biter'}: ${esc(fmtDT(S.D, du.d === 'ayar' ? du.r.Su : du.r.C))}</p>` : du.sonra ? `<p class="pm-kucuk">Sıradaki iş ${esc(fmtDT(S.D, du.sonra.S))} başlar.</p>` : ''}
    <p class="pm-kucuk">${bek.length} palet girişte bekliyor · haftalık doluluk ${dol == null ? 'veri yok' : '%' + Math.round(dol * 100) + (dol > 1 ? ' (çalışma saatinden fazla iş)' : '')}${n.id === s.darbogaz ? ' · ' + rozet('darboğaz', 'hata') : ''}</p>
    ${l.length ? `<span class="pm-kucuk">Sıradaki işler${yetkili('plan.yaz') && !n.fas ? ' · birini seçip başka tezgâha taşıyın' : ''}</span><ol class="pm-ag-liste pm-fb-isler">${l.map(r => fbIsSatir(r, n, cx)).join('')}</ol>${yetkili('plan.yaz') && !n.fas ? '<p class="pm-kucuk">Ya da seçili tezgâhtan 3B sahnede sürükleyip başka tezgâha bırakın; işaretli iş taşınır, yeşil zemin uygun tezgâhtır.</p>' : ''}` : '<p class="pm-kucuk">Bu saatten sonra iş yok.</p>'}
    ${yetkili('plan.yaz') && !n.fas ? `<div class="pm-fb-ariza"><span class="pm-kucuk">Ne olur: bu tezgâh ${esc(fmtDT(S.D, Math.max(s.now, FB.zaman)))} saatinden itibaren</span><div class="pm-dugmeler">${[2, 4, 8].map(h => dugme(`${h} sa arıza`, 'fb-ariza', { kucuk: true, simge: 'alert', veri: `data-v="${h}"` })).join('')}</div></div>` : ''}
    <div class="pm-dugmeler">${n.fas ? '' : dugme('Kanbanda aç', 'kanban-tezgah', { kucuk: true, simge: 'list', veri: `data-v="${esc(n.id)}"` })}${dugme('Yakından bak', 'fb-kam', { kucuk: true, simge: 'zin', veri: 'data-v="yakin"' })}${dugme('Seçimi kaldır', 'fb-sec', { kucuk: true, hayalet: true, simge: 'x', veri: 'data-v=""' })}</div></div>`;
}
function fbDetayYenile() { const d = document.getElementById('fb-detay'); if (d) d.innerHTML = fbDetay(); }
function fbSec(id) { FB.sec = id || null; fbDetayYenile(); if (id && FB.sahne && FB.sahne.N[id]) { const n = FB.sahne.N[id]; fbUc({ h: [n.p[0], 0.8, n.p[2]], uz: Math.min(FB.kam.uz, 14) }, 0.8); } fbTetikle(); }
function fbOynatDugme() { const b = document.querySelector('[data-act="fb-oynat"]'); if (b) b.outerHTML = dugme('', 'fb-oynat', { simge: FB.oynat ? 'pause' : 'play', kucuk: true, ad: FB.oynat ? 'Durdur' : 'Planı oynat', cls: 'tc-dugme-birincil' }); }

/* tıklama: tezgâh kutusunun ekrandaki köşelerinin kapsadığı alan; en yakındaki seçilir */
function fbBul(x, y) {
  const s = FB.sahne; if (!s || s.bos) return null; let en = null, ed = 1e9;
  for (const n of Object.values(s.N)) { const [a, b] = n.ozel ? [1.6, 1.8] : n.fas ? [1.5, 1.2] : [1.2, 0.9]; const hY = n.ozel || n.fas ? 2.3 : 2.9; let r = [1e9, 1e9, -1e9, -1e9], d = 0, k = 0;
    for (const dx of [-a, a]) for (const dy of [0, hY]) for (const dz of [-b, b]) { const q = fbIzdus([n.p[0] + dx, dy, n.p[2] + dz]); if (!q) continue; r = [Math.min(r[0], q[0]), Math.min(r[1], q[1]), Math.max(r[2], q[0]), Math.max(r[3], q[1])]; d += q[2]; k++; }
    if (k && x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3] && d / k < ed) { ed = d / k; en = n; } }
  return en;
}
/* Kanvas render() sonrasında yeniden yaratılmaz: her seferinde yeni WebGL bağlamı açmak tarayıcının bağlam sınırını tüketir.
   İlk kanvas bir kez kurulur, sonraki çizimlerde yer tutucunun yerine taşınır. */
function fbBagla() {
  const yer = document.getElementById('fb-cv'); if (!yer) return;
  const tema = (document.documentElement.dataset.theme || '') + (matchMedia('(prefers-color-scheme: dark)').matches ? 'd' : 'l');
  if (yer !== FB.cv) {
    if (FB.cv && FB.gl) { yer.replaceWith(FB.cv); }
    else { try { if (!fbGlKur(yer)) { FB.destek = false; render(); return; } } catch (e) { FB.destek = false; bildir('3B çizim başlatılamadı; basit görünüme geçildi.', 'hata'); render(); return; } fbOlaylar(yer); }
  }
  if (!FB.renk || FB.tema !== tema) { FB.renk = fbRenkler(); FB.tema = tema; }
  FB.etiket = {};
  if (!FB.kamKuruldu || FB.kamYenile) { FB.kamKuruldu = true; FB.kamYenile = false; fbKamera('genel'); if (FB.ucus) Object.assign(FB.kam, FB.ucus.b); FB.ucus = null; }
  const zr = document.getElementById('fb-zaman'); if (zr && !zr.dataset.bagli) { zr.dataset.bagli = '1'; zr.addEventListener('input', () => { FB.zaman = +zr.value; fbDetayYenile(); fbTetikle(); }); }
  FB.son = 0; fbTetikle();
}
function fbOlaylar(cv) {
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); FB.gl = null; FB.cv = null; });
  const nokta = o => { const r = cv.getBoundingClientRect(); return [o.clientX - r.left, o.clientY - r.top]; };
  cv.addEventListener('contextmenu', o => o.preventDefault());
  cv.addEventListener('pointerdown', o => {
    // seçili tezgâhtan başlayan sürükleme sıradaki işi taşır; başka her yerde kamera döner
    if (o.button === 0 && !o.shiftKey && FB.sec && yetkili('plan.yaz')) { const [x, y] = nokta(o); const n = fbBul(x, y); const r = n && n.id === FB.sec && !n.ozel && !n.fas ? fbTasiAday(n.id) : null;
      if (r) { FB.tasi = { r, m: n.id, x: o.clientX, y: o.clientY, oynadi: false, p: null, hedef: null }; cv.setPointerCapture(o.pointerId); return; } }
    FB.ucus = null; FB.surukle = { x: o.clientX, y: o.clientY, az: FB.kam.az, el: FB.kam.el, h: FB.kam.h.slice(), kay: o.shiftKey || o.button === 2, oynadi: false, id: o.pointerId }; cv.setPointerCapture(o.pointerId); fbTetikle(); });
  cv.addEventListener('pointermove', o => {
    const T = FB.tasi; if (T) { if (Math.abs(o.clientX - T.x) + Math.abs(o.clientY - T.y) > 5) T.oynadi = true; if (T.oynadi) { const [x, y] = nokta(o); T.p = fbZemin(x, y); const n = fbBul(x, y); T.hedef = n && !n.ozel && !n.fas && n.id !== T.m ? n.id : null; cv.style.cursor = T.hedef ? (fbUygun(T.r.id, T.hedef) ? 'copy' : 'no-drop') : 'grabbing'; fbTetikle(); } return; }
    const d = FB.surukle;
    if (d && d.id === o.pointerId) { const dx = o.clientX - d.x, dy = o.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.oynadi = true;
      if (d.kay) { const k = FB.kam.uz / Math.max(300, cv.clientHeight) * 1.1; const sa = Math.cos(FB.kam.az), so = Math.sin(FB.kam.az);
        FB.kam.h = [d.h[0] - (dx * sa - dy * so) * k, d.h[1], d.h[2] - (-dx * so - dy * sa) * k]; }
      else { FB.kam.az = d.az - dx * 0.006; FB.kam.el = Math.max(0.12, Math.min(1.45, d.el + dy * 0.005)); }
      fbTetikle(); return; }
    const [x, y] = nokta(o); const n = fbBul(x, y); const id = n ? n.id : null; if (id !== FB.ust) { FB.ust = id; cv.style.cursor = id ? 'pointer' : ''; fbTetikle(); }
  });
  const birak = o => {
    const T = FB.tasi; if (T) { FB.tasi = null; cv.style.cursor = ''; if (!T.oynadi) { fbSec(null); return; } if (T.hedef) { if (fbUygun(T.r.id, T.hedef)) kanbanTasi(T.r.id, T.hedef, null, true); else bildir(`${T.hedef} bu adımı yapamaz; rotada uygun tezgâh değil.`, 'hata'); } fbTetikle(); return; }
    const d = FB.surukle; FB.surukle = null; if (d && !d.oynadi) { const [x, y] = nokta(o); const n = fbBul(x, y); fbSec(n ? n.id : null); } fbTetikle(); };
  cv.addEventListener('pointerup', birak); cv.addEventListener('pointercancel', () => { FB.surukle = null; FB.tasi = null; });
  cv.addEventListener('pointerleave', () => { if (FB.ust) { FB.ust = null; fbTetikle(); } });
  cv.addEventListener('wheel', o => { o.preventDefault(); FB.ucus = null; FB.kam.uz = Math.max(5, Math.min(260, FB.kam.uz * Math.exp(o.deltaY * (o.deltaMode === 1 ? 0.05 : 0.0012)))); fbTetikle(); }, { passive: false });
  cv.addEventListener('keydown', o => { const k = o.key; let ok = true;
    if (k === 'ArrowLeft') FB.kam.az += 0.1; else if (k === 'ArrowRight') FB.kam.az -= 0.1; else if (k === 'ArrowUp') FB.kam.el = Math.min(1.45, FB.kam.el + 0.08); else if (k === 'ArrowDown') FB.kam.el = Math.max(0.12, FB.kam.el - 0.08);
    else if (k === '+' || k === '=') FB.kam.uz = Math.max(5, FB.kam.uz / 1.15); else if (k === '-') FB.kam.uz = Math.min(260, FB.kam.uz * 1.15);
    else if (k === ' ') { FB.oynat = !FB.oynat; if (FB.oynat && FB.zaman >= FB.sahne.t1) FB.zaman = FB.sahne.now; fbOynatDugme(); } else ok = false;
    if (ok) { o.preventDefault(); FB.ucus = null; fbTetikle(); } });
}

/* ---------- canlı etki: önizlemedeki planın şimdikiyle farkı sahnede dalga olarak yayılır ---------- */
function fbPlan() { return U.hamle && FB.etkiGor !== 'once' ? U.hamle.plan : S.plan; }
const FB_ETKI = new WeakMap();
function fbEtki() {
  const h = U.hamle; if (!h || !S.plan) return null; if (FB_ETKI.has(h)) return FB_ETKI.get(h);
  const a = S.plan.ops, b = h.plan.ops; const tez = {}, tasinan = [];
  for (const id in b) { const x = a[id], y = b[id]; if (!x || !y || !isFinite(y.S) || !isFinite(x.S)) continue; const d = y.S - x.S, dC = y.C - x.C;
    if (x.m !== y.m) tasinan.push({ id, job: y.job, a: x.m, b: y.m });
    if (Math.abs(d) < 0.05 && x.m === y.m) continue;
    for (const m of new Set([x.m, y.m])) { const e = (tez[m] = tez[m] || { d: 0, n: 0, t: 1e9, gelen: 0, giden: 0 }); e.n++; e.t = Math.min(e.t, x.S, y.S);
      if (x.m === y.m) e.d += dC; else if (m === y.m) e.gelen++; else e.giden++; } }
  const l = Object.entries(tez).sort((p, q) => p[1].t - q[1].t); l.forEach(([, e], i) => { e.sira = l.length > 1 ? i / (l.length - 1) : 0; });
  const r = { tez, tasinan, ilk: l.length ? l[0][0] : null }; FB_ETKI.set(h, r); return r;
}
function fbEtkiRozet(e) {
  const t = e.gelen || e.giden ? `${e.gelen ? '+' + e.gelen : ''}${e.gelen && e.giden ? ' ' : ''}${e.giden ? '−' + e.giden : ''} iş` : Math.abs(e.d) < 0.05 ? 'sıra değişti' : `${e.d > 0 ? '+' : '−'}${sayi(Math.abs(e.d), 1)} sa`;
  return `<s data-ton="${e.gelen || e.giden ? 'bilgi' : e.d > 0.05 ? 'kotu' : e.d < -0.05 ? 'iyi' : 'bilgi'}">${t}</s>`;
}
function fbEtkiCiz(kutu, et, sn, R) {
  const s = FB.sahne; const per = 3.4; const w = AG_AZ ? 2 : ((sn % per) / per) * 1.35;
  for (const [id, e] of Object.entries(et.tez)) { const n = s.N[id]; if (!n) continue;
    const c = e.gelen || e.giden ? R.grafik : e.d > 0.05 ? R.stop : e.d < -0.05 ? R.run : R.grafik;
    const [x, , z] = n.p;
    for (const [dx, dz, sx, sz] of [[0, 1.5, 3.1, 0.1], [0, -1.5, 3.1, 0.1], [1.55, 0, 0.1, 3.1], [-1.55, 0, 0.1, 3.1]]) kutu(x + dx, 0.035, z + dz, sx, 0.05, sz, c, 0.85, 0, false);
    const k = (w - e.sira * 0.9) * 2.2; if (k > 0 && k < 1) { const a = 1.6 + 2.4 * k; for (const [dx, dz, sx, sz] of [[0, a, 2 * a, 0.14], [0, -a, 2 * a, 0.14], [a, 0, 0.14, 2 * a], [-a, 0, 0.14, 2 * a]]) kutu(x + dx, 0.05, z + dz, sx, 0.06, sz, c, 1, 0, false, 0.85 * (1 - k)); }
    if (k > 0 && k < 1.6) kutu(x - 0.1, 3.4 + Math.sin(Math.min(1, k) * Math.PI) * 0.4, z, 0.35, 0.35, 0.35, c, 1, AG_AZ ? 0 : sn * 2); }
  // tezgâh değiştiren işler: eski tezgâhtan yenisine yay, üstünde uçan yarı saydam palet
  for (const t of et.tasinan) { const a = s.N[t.a], b = s.N[t.b]; if (!a || !b) continue; const P = u => { const q = 1 - u; const my = 6 + 0.12 * Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]); return [q * q * a.p[0] + 2 * q * u * ((a.p[0] + b.p[0]) / 2) + u * u * b.p[0], q * q * 2.6 + 2 * q * u * my + u * u * 2.6, q * q * a.p[2] + 2 * q * u * ((a.p[2] + b.p[2]) / 2) + u * u * b.p[2]]; };
    for (let i = 1; i < 24; i++) { const q = P(i / 24); kutu(q[0], q[1], q[2], 0.12, 0.12, 0.12, R.grafik, 0.9, 0, false); }
    const u = AG_AZ ? 0.5 : (sn * 0.45) % 1; const q = P(u); const jc = durumRenkFb(t.job, R);
    kutu(q[0], q[1], q[2], 0.8, 0.12, 0.8, R.kar(R.hazard, R.metal, 0.5), 0.3, 0, false, 0.7); kutu(q[0], q[1] + 0.3, q[2], 0.6, 0.45, 0.6, jc, 0.5, 0, false, 0.75);
    kutu(a.p[0] - 1.6, 0.3, a.p[2] + 0.45, 0.62, 0.34, 0.62, jc, 0.2, 0, false, 0.3); }
}
function fbEtkiPanel() {
  const h = U.hamle; const D = S.D; const e = S.plan.ozet, o = h.plan.ozet; const et = fbEtki();
  const fk = (a, b) => { const d = b - a; return Math.abs(d) < 0.05 ? '<span class="pm-kucuk">aynı</span>' : `<b class="${d < 0 ? 'pm-fark-iyi' : 'pm-fark-kotu'}">${d < 0 ? '−' : '+'}${sayi(Math.abs(d), 1)}</b>`; };
  const deg = h.degisen.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8);
  const gor = `<div class="pm-seg" role="tablist" aria-label="Hangi plan">${[['sonra', 'Önizleme'], ['once', 'Şimdiki']].map(([id, ad]) => `<button type="button" role="tab" data-act="fb-etki-gor" data-v="${id}" aria-selected="${(FB.etkiGor || 'sonra') === id}">${ad}</button>`).join('')}</div>`;
  return `<div class="pm-ag-sec pm-fb-etki"><span class="pm-kucuk">${ic('target', 'k')} Önizleme · plan henüz değişmedi</span><b>${esc(h.ad)}</b>${gor}
    <table class="pm-fb-etki-t"><tbody><tr><th scope="row">Ağırlıklı gecikme</th><td class="mono">${sayi(e.wT, 1)} → ${sayi(o.wT, 1)} sa</td><td>${fk(e.wT, o.wT)}</td></tr><tr><th scope="row">Geciken sipariş</th><td class="mono">${e.late} → ${o.late}</td><td>${fk(e.late, o.late)}</td></tr><tr><th scope="row">Etkilenen tezgâh</th><td class="mono" colspan="2">${Object.keys(et.tez).length}${et.tasinan.length ? ` · ${et.tasinan.length} iş tezgâh değiştiriyor` : ''}</td></tr></tbody></table>
    ${deg.length ? `<span class="pm-kucuk">Bitişi değişen siparişler (${h.degisen.length})</span><ul class="pm-degisen">${deg.map(x => `<li><button type="button" class="pm-fis" data-act="fb-iz-sec" data-v="${esc(x.j)}">${esc(x.j)}</button><span class="mono pm-kucuk">${x.sonra != null ? esc(fmtDT(D, x.sonra).slice(0, 15)) : 'planlanmadı'}</span><span class="${x.d < 0 ? 'pm-fark-iyi' : 'pm-fark-kotu'}">${x.d < 0 ? '−' : '+'}${sayi(Math.abs(Math.min(x.d, 999)), 1)} sa</span></li>`).join('')}</ul>` : '<p class="pm-kucuk">Hiçbir siparişin bitişi değişmiyor.</p>'}
    <p class="pm-kucuk">Halkalar değişikliğin tezgâhlara zaman sırasıyla yayılışını gösterir: yeşil işler erkene, kırmızı geçe kayıyor; mavi yay tezgâh değiştiren iş.${h.ariza ? ' Uygularsanız arıza kaydı da eklenir.' : ''}</p>
    <div class="pm-dugmeler">${dugme('Uygula', 'hamle-uygula', { birincil: true, simge: 'check', yetki: 'plan.yaz' })}${dugme('Vazgeç', 'hamle-vazgec', { simge: 'x' })}</div></div>`;
}

/* ---------- 3B'den iş taşıma ---------- */
function fbIsSatir(r, n, cx) {
  const o = cx && cx.byId[r.id]; const sec = FB.tasiOp === r.id; const yaz = yetkili('plan.yaz') && !r.done && !r.act;
  const hedef = o ? o.c.filter(c => !c.fas && c.m !== n.id).map(c => c.m) : [];
  return `<li data-secili="${sec}"><button type="button" class="pm-fb-is" data-act="fb-tasi-op" data-v="${esc(r.id)}" aria-pressed="${sec}"><span class="mono">${esc(fmtDT(S.D, r.S))}</span> <b class="mono">${esc(r.job)}</b> ${esc((o || {}).ad || r.id)}</button>${yaz && hedef.length ? `<select class="tc-alan-kutu pm-fb-tasi" data-chg="fb-tasi" data-v="${esc(r.id)}" aria-label="${esc(r.id)} işini taşı"><option value="">Taşı…</option>${hedef.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('')}</select>` : ''}</li>`;
}
function fbTasiAday(m) { const s = FB.sahne; const t = FB.zaman; const l = (s.kuyruk[m] || []).filter(r => r.S > t && !r.done && !r.act); return (FB.tasiOp && l.find(r => r.id === FB.tasiOp)) || l[0] || null; }
function fbUygun(op, m) { const cx = cxAl(); const o = cx && cx.byId[op]; return !!o && o.c.some(c => c.m === m && !c.fas); }
/* ekran noktasından zemine ışın: kamera tabanıyla kurulur, ters matris gerekmez */
function fbZemin(x, y) {
  const W = FB.cv.clientWidth, H = FB.cv.clientHeight; const e = fbGoz(); const f = fbV.nor(fbV.cik(FB.kam.h, e)); const r = fbV.nor(fbV.cap(f, [0, 1, 0])); const u = fbV.cap(r, f);
  const tn = Math.tan(0.34), nx = (x / W) * 2 - 1, ny = 1 - (y / H) * 2; const d = [0, 1, 2].map(i => f[i] + r[i] * nx * tn * (W / H) + u[i] * ny * tn);
  if (d[1] >= -1e-4) return null; const t = -e[1] / d[1]; return [e[0] + d[0] * t, 0, e[2] + d[2] * t];
}
function fbTasiCiz(kutu, R, sn) {
  const s = FB.sahne; const T = FB.tasi; const r = T.r;
  for (const n of Object.values(s.N)) { if (n.ozel || n.fas || n.id === T.m) continue; const ok = fbUygun(r.id, n.id); kutu(n.p[0], 0.02, n.p[2], 2.9, 0.02, 2.4, ok ? R.run : R.stop, 1, 0, false, ok ? (n.id === T.hedef ? 0.6 : 0.28) : 0.12); }
  if (T.p) { const jc = durumRenkFb(r.job, R); const yuk = 1.2 + (AG_AZ ? 0 : 0.15 * Math.sin(sn * 5));
    kutu(T.p[0], yuk, T.p[2], 0.85, 0.12, 0.85, R.kar(R.hazard, R.metal, 0.4), 0.3); kutu(T.p[0], yuk + 0.32, T.p[2], 0.65, 0.5, 0.65, jc, 0.4);
    const a = s.N[T.m]; const dx = T.p[0] - a.p[0], dz = T.p[2] - a.p[2], uz = Math.hypot(dx, dz); if (uz > 0.5) kutu((a.p[0] + T.p[0]) / 2, 0.04, (a.p[2] + T.p[2]) / 2, uz, 0.02, 0.1, R.grafik, 0.9, Math.atan2(-dz, dx), false); }
}
function fbArizaDene(m, saat) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return;
  const st = stOf(); const t = Math.round(Math.max(st.now, FB.zaman) * 4) / 4; const d = { m, from: t, to: t + saat };
  st.down = [...st.down, { ...d, id: 'deneme' }];
  /* sıra korunarak yeniden yerleştirilir, sonra motor kısa süre toparlar: arıza darboğazdaysa sıra sabit kalınca gecikme abartılı çıkar */
  let p, toparla = 0; try { const cx = compile(st); p = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
    const e0 = evaluate(p, st, null, true); const L = lns(st, p, null, { ms: 700, seed: 7, free: true }); const e1 = evaluate(L.plan, st, null, true);
    if (cmpEv(e1, e0) > 0 && (L.plan.fail || []).length <= (p.fail || []).length) { toparla = e0.wT - e1.wT; p = L.plan; } slack(p, cx); }
  catch (e) { bildir('Hesaplanamadı: ' + e.message, 'hata'); return; }
  hamleKur(p, st, `${m}: ${fmtDT(S.D, t)} itibarıyla ${saat} saat arıza`, { toparla }); U.hamle.ariza = d; FB.etkiGor = 'sonra'; render();
}

/* ---------- yüzen pencere: 3B kanban ve masa açıkken de görünür, önizlemeyle birlikte değişir ---------- */
function fbYuzenKur() {
  const eski = document.querySelector('.pm-fb-yuzen, .pm-fb-fab'); if (eski) eski.remove();
  if (U.sayfa === 'akis3b' || U.sayfa === 'tahta' || !S.plan || !fbDestek()) return;
  if (!U.fbYuzen) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pm-fb-fab'; b.dataset.act = 'fb-yuzen'; b.dataset.v = 'ac'; if (U.hamle) b.dataset.dikkat = '';
    b.innerHTML = `${ic('cube', 'k')}<span>${U.hamle ? '3B etki' : '3B'}</span>`; b.setAttribute('aria-label', U.hamle ? 'Önizlemenin etkisini 3B pencerede aç' : '3B atölye penceresini aç'); kok.appendChild(b); return; }
  const w = document.createElement('section'); w.className = 'pm-fb-yuzen'; w.setAttribute('aria-label', 'Atölye ikizi penceresi');
  const P = U.fbPos; if (P && innerWidth > 700) { w.style.left = Math.min(Math.max(0, P.x), innerWidth - 200) + 'px'; w.style.top = Math.min(Math.max(0, P.y), innerHeight - 120) + 'px'; w.style.width = P.w + 'px'; w.style.height = P.h + 'px'; }
  const s = fbSahne();
  w.innerHTML = `<header class="pm-fb-y-ust"><span class="pm-fb-y-tut">${ic('cube', 'k')}<b>Atölye ikizi</b>${U.hamle ? `<span class="pm-fb-onizle">${FB.etkiGor === 'once' ? 'Şimdiki' : 'Önizleme'}</span>` : ''}</span>
    ${U.hamle ? `<div class="pm-seg" role="tablist" aria-label="Hangi plan">${[['sonra', 'Sonra'], ['once', 'Önce']].map(([id, ad]) => `<button type="button" role="tab" data-act="fb-etki-gor" data-v="${id}" aria-selected="${(FB.etkiGor || 'sonra') === id}">${ad}</button>`).join('')}</div>` : ''}
    ${dugme('', 'fb-oynat', { simge: FB.oynat ? 'pause' : 'play', kucuk: true, ad: FB.oynat ? 'Durdur' : 'Planı oynat', cls: 'tc-dugme-birincil' })}${dugme('', 'fb-kam', { simge: 'fit', kucuk: true, hayalet: true, ad: 'Bütün atölye', veri: 'data-v="genel"' })}${dugme('', 'fb-yuzen', { simge: 'expand', kucuk: true, hayalet: true, ad: '3B sayfasında aç', veri: 'data-v="buyut"' })}${dugme('', 'fb-yuzen', { simge: 'x', kucuk: true, hayalet: true, ad: 'Pencereyi kapat', veri: 'data-v="kapat"' })}</header>
    <div class="pm-fb"><canvas id="fb-cv" tabindex="0" role="img" aria-label="Atölye ikizi: plan saatine göre canlanan tezgâhlar ve parça akışı."></canvas><div class="pm-fb-etiketler" id="fb-etiketler"></div><div class="pm-fb-gosterge" id="fb-gosterge" role="status" aria-live="off"></div></div>
    ${s.bos ? '' : `<input type="range" id="fb-zaman" min="${s.now}" max="${s.t1}" step="0.05" value="${FB.zaman}" aria-label="Plan saati">`}`;
  kok.appendChild(w);
  const tut = w.querySelector('.pm-fb-y-tut'); let d = null;
  tut.addEventListener('pointerdown', o => { if (innerWidth <= 700) return; const r = w.getBoundingClientRect(); d = { x: o.clientX - r.left, y: o.clientY - r.top }; tut.setPointerCapture(o.pointerId); });
  tut.addEventListener('pointermove', o => { if (!d) return; const x = Math.min(Math.max(0, o.clientX - d.x), innerWidth - 160), y = Math.min(Math.max(0, o.clientY - d.y), innerHeight - 60); w.style.left = x + 'px'; w.style.top = y + 'px'; w.style.right = 'auto'; w.style.bottom = 'auto'; });
  tut.addEventListener('pointerup', () => { if (!d) return; d = null; fbYuzenSakla(w); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { fbYuzenSakla(w); fbTetikle(); }).observe(w);
}
function fbYuzenSakla(w) { if (innerWidth <= 700 || !w.isConnected) return; const r = w.getBoundingClientRect(); U.fbPos = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }
