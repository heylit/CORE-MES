/* ---------- sonsuz tahta ----------
   Bütün plan tek kanvasta: tezgâh grupları rotadaki ortalama sıralarıyla soldan sağa dizilir, her tezgâh bir karttır
   ve kartın içinde önümüzdeki günlerin kuyruğu küçük bir zaman çizelgesi olarak durur. Yakınlık arttıkça ayrıntı açılır.
   Sorunlar ilgili tezgâhın yanına not olarak düşer; kullanıcı kendi notunu da bırakabilir. Plan yalnız önizlemeyle değişir. */
const TB = { W: 300, H: 132, AR: 40, KOL: 140, s: null };
const TB_YERLESIM = new WeakMap();
function tbYerlesim(p) {
  const oran = innerWidth < 600 ? 0.55 : innerWidth < 1024 ? 1.1 : 1.8;
  if (TB_YERLESIM.has(p) && TB_YERLESIM.get(p).dv === S.dataVer && TB_YERLESIM.get(p).oran === oran) return TB_YERLESIM.get(p);
  const cx = cxAl(); const D = S.D;
  /* montajlı üründe yarı mamul emirleri üst emirden önce biter: ağacın derinliği rotanın sırasına eklenir,
     yoksa üst emrin ilk adımı olan montaj rotanın başında sayılır */
  const ust = {}; for (const s of D.siparisler) if (s.ust) ust[s.id] = s.ust;
  const der = id => { let d = 0, x = id; while (ust[x] && d < 20) { x = ust[x]; d++; } return d; };
  const kok = id => { let x = id, d = 0; while (ust[x] && d < 20) { x = ust[x]; d++; } return x; };
  const enDer = {}; for (const id of Object.keys(cx.jobs)) { const k = kok(id); enDer[k] = Math.max(enDer[k] || 0, der(id)); }
  const sira = {}, say = {};
  for (const j of Object.values(cx.jobs)) { const H = enDer[kok(j.id)] || 0, d = der(j.id);
    j.ops.forEach((o, i) => {
    const r = p.ops[o.id]; const m = r ? r.m : (o.c[0] || {}).m; if (!m) return;
    const g = m[0] === '@' ? 'fason' : (cx.M[m] || {}).grup; if (!g) return;
    sira[g] = (sira[g] || 0) + (H - d + i / Math.max(1, j.ops.length - 1)) / (H + 1); say[g] = (say[g] || 0) + 1;
  }); }
  const gruplar = {};
  for (const m of D.tezgahlar) (gruplar[m.grup] = gruplar[m.grup] || []).push({ id: m.id, ad: m.ad });
  const fas = (D.fasoncular || []).filter(f => Object.values(p.ops).some(r => r.m === '@' + f.id));
  if (fas.length) gruplar.fason = fas.map(f => ({ id: '@' + f.id, ad: f.ad, fason: true }));
  const sirali = Object.keys(gruplar).sort((a, b) => (say[a] ? sira[a] / say[a] : 0.5) - (say[b] ? sira[b] / say[b] : 0.5));
  /* Kolonlar en çok 4 tezgâhlık bloklardır; kalabalık grup yan yana bloklara bölünür. Gruplar okuma sırasıyla satırlara
     dizilir ve satır genişliği tahtayı ekrana yakın bir orana getirir; böylece yüzlerce tezgâhta da tahta tek şerit olmaz. */
  const bloklar = sirali.map(g => { const l = gruplar[g]; const n = Math.ceil(l.length / 4); return { g, l, w: n * (TB.W + 24) - 24, h: Math.min(4, l.length) * (TB.H + 24) - 24 + 70 }; });
  const top = bloklar.reduce((t, b) => t + b.w + TB.KOL, 0); const satH = 4 * (TB.H + 24) + 70;
  const enGenis = Math.max(TB.W, ...bloklar.map(b => b.w));
  const sinir = Math.max(enGenis, Math.sqrt(top * (satH + 220) * oran));
  const kart = {}, bolge = []; let x = 0, y = 0, satirH = 0, w = 0;
  for (const b of bloklar) {
    if (x > 0 && x + b.w > sinir) { y += satirH + 220; x = 0; satirH = 0; }
    b.l.forEach((m, i) => { const bi = Math.floor(i / 4), k = i % 4; kart[m.id] = { ...m, grup: b.g, x: x + bi * (TB.W + 24), y: y + 70 + k * (TB.H + 24) }; });
    bolge.push({ g: b.g, x: x - 16, y, w: b.w + 32, h: b.h + 16, n: b.l.length });
    satirH = Math.max(satirH, b.h + 16); w = Math.max(w, x + b.w); x += b.w + TB.KOL;
  }
  const H = Math.max(y + satirH, 400); const cy = H + 240;
  /* çerçeveler geniş ekranda tahtanın sağına, dar ekranda altına */
  const sag = oran >= 1, cx0 = w + 220;
  const cer = sag ? { sip: { x: cx0, y: 0, w: 440, h: 620 }, olay: { x: cx0 + 480, y: 0, w: 340, h: 620 }, sen: { x: cx0, y: 680, w: 820, h: 620 } }
    : { sip: { x: 0, y: cy, w: 440, h: 620 }, olay: { x: 480, y: cy, w: 340, h: 620 }, sen: { x: 0, y: cy + 680, w: 820, h: 620 } };
  const out = { dv: S.dataVer, oran, kart, bolge, w, h: H, cer, cw: Math.max(...Object.values(cer).map(c => c.x + c.w)), ch: Math.max(H, ...Object.values(cer).map(c => c.y + c.h)) };
  TB_YERLESIM.set(p, out); return out;
}
function tbGorunur(p) {
  const cx = cxAl(); const now = cx.st.now; const gun = U.tbGun || 3; const t1 = now + gun * 24;
  return { now, t1, gun, px: (TB.W - 20) / (t1 - now) };
}
function tbKart(p, k, z, onc) {
  const cx = cxAl(); const D = S.D; const u = p.util && p.util[k.id];
  const ops = Object.values(p.ops).filter(r => r.m === k.id && isFinite(r.C) && r.C > z.now).sort((a, b) => a.S - b.S);
  const J = p.J || {}; const eski = U.hamle ? S.plan.ops : null; const sec = U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null);
  const gor = ops.filter(r => r.S < z.t1);
  const cip = gor.map(r => {
    const a = Math.max(r.S, z.now), b = Math.min(r.C, z.t1); const L = 10 + (a - z.now) * z.px, W = Math.max(6, (b - a) * z.px);
    const gec = J[r.job] && (J[r.job].T == null || J[r.job].T > 0.05);
    const e = eski && eski[r.id]; const deg = eski && (!e || e.m !== r.m || Math.abs(e.S - r.S) > 0.25);
    const o = cx.byId[r.id] || {};
    return `<button type="button" class="pm-tb-cip" data-act="op" data-v="${esc(r.id)}" data-job="${esc(r.job)}" draggable="true" style="left:${L.toFixed(1)}px;width:${W.toFixed(1)}px;--c:${durumRenk(r.job)}" ${gec ? 'data-gec' : ''} ${deg ? 'data-degisti' : ''} ${sec ? (r.job === sec ? 'data-secili' : 'data-soluk') : ''} title="${esc(r.id)} · ${esc(o.ad || '')} · ${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C))}${gec ? ' · sipariş gecikiyor' : ''}"><span>${esc(r.job)}</span><small>${esc(o.ad || '')}</small></button>`;
  }).join('');
  const kapali = (() => { const M = cx.M[k.id]; if (!M) return ''; let s = '', t = z.now; for (const [a, b] of M.rw) { if (a > z.t1) break; if (a > t) s += `<i class="pm-tb-kapali" style="left:${10 + (t - z.now) * z.px}px;width:${(Math.min(a, z.t1) - t) * z.px}px"></i>`; t = Math.max(t, b); } if (t < z.t1) s += `<i class="pm-tb-kapali" style="left:${10 + (t - z.now) * z.px}px;width:${(z.t1 - t) * z.px}px"></i>`; for (const d of S.down.filter(x => x.m === k.id && x.to > z.now && x.from < z.t1)) s += `<i class="pm-tb-ariza" style="left:${10 + (Math.max(d.from, z.now) - z.now) * z.px}px;width:${(Math.min(d.to, z.t1) - Math.max(d.from, z.now)) * z.px}px"></i>`; return s; })();
  const gunler = Array.from({ length: z.gun + 1 }, (_, i) => `<i class="pm-tb-gun" style="left:${10 + (Math.ceil(z.now / 24) * 24 + i * 24 - z.now) * z.px}px"></i>`).join('');
  const gecN = new Set(ops.filter(r => J[r.job] && J[r.job].T > 0.05).map(r => r.job)).size;
  const dU = onc && onc[k.id] != null && u ? u.u - onc[k.id] : null;
  const dol = u ? Math.round(u.u * 100) : null;
  const h = u ? Math.round(Math.min(1, u.u) * 280) + 8 : 8; const h0 = onc && onc[k.id] != null ? Math.round(Math.min(1, onc[k.id]) * 280) + 8 : h;
  const yol = sec && ops.some(r => r.job === sec) || (sec && Object.values(p.ops).some(r => r.job === sec && r.m === k.id));
  return `<section class="pm-tb-kart" data-m="${esc(k.id)}" style="left:${k.x}px;top:${k.y}px;--h:${h0}px" data-h="${h}" ${yol ? 'data-yol' : ''} data-isi="${isiSeviye(u ? u.u : null)}" ${U.tbTez === k.id ? 'data-secili' : ''} ${S.down.some(d => d.m === k.id && d.to > z.now) ? 'data-ariza' : ''}>
    <header class="pm-tb-kart-ust"><button type="button" class="pm-tb-ad" data-act="tb-tez" data-v="${esc(k.id)}"><b class="mono">${esc(k.fason ? k.id.slice(1) : k.id)}</b><span>${esc(k.ad)}</span></button>
      <span class="pm-tb-dol mono" title="Plan ufkunda doluluk">${dol != null ? `%${dol}` : ''}${dU != null && Math.abs(dU) > 0.01 ? ` <span class="${dU < 0 ? 'pm-fark-iyi' : 'pm-fark-kotu'}">${dU > 0 ? '+' : '−'}${Math.round(Math.abs(dU) * 100)}</span>` : ''}</span></header>
    <div class="pm-tb-cizgi" data-m="${esc(k.id)}">${kapali}${gunler}${cip}</div>
    <footer class="pm-tb-kart-alt"><span>${ops.length} iş sırada</span>${gecN ? `<span class="pm-tb-gec">${ic('alert', 'k')}${gecN} geciken sipariş</span>` : ''}</footer>
    <i class="pm-tb-kule" aria-hidden="true"></i><i class="pm-tb-kule pm-tb-kule-yan" aria-hidden="true"></i><button type="button" class="pm-tb-uzak" data-act="tb-tez" data-v="${esc(k.id)}" tabindex="-1"><b class="mono">${esc(k.fason ? k.id.slice(1) : k.id)}</b><span class="mono">${dol != null ? `%${dol}` : ''}</span></button></section>`;
}
/* Sipariş zinciri: aynı siparişin ardışık adımları kartlar arasında eğriyle bağlanır */
function tbZincirler(p, Y, z) {
  const J = p.J || {}; const cx = cxAl();
  const sec = U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null);
  const isler = new Set(sec ? [sec] : []);
  if (U.tbYol) for (const j in J) if (J[j].T == null || J[j].T > 0.05) isler.add(j);
  TB.rozet = '';
  const nokta = r => { const k = Y.kart[r.m]; if (!k) return null; const t = Math.min(Math.max((r.S + r.C) / 2, z.now), z.t1); return [k.x + 10 + (t - z.now) * z.px, k.y + 56 + 17]; };
  let s = '';
  for (const j of isler) {
    const jo = cx.jobs[j]; if (!jo) continue;
    const rs = jo.ops.map(o => p.ops[o.id]).filter(r => r && isFinite(r.C));
    for (let i = 1; i < rs.length; i++) {
      const a = nokta(rs[i - 1]), b = nokta(rs[i]); if (!a || !b) continue;
      const dx = Math.max(60, Math.abs(b[0] - a[0]) * 0.4);
      s += `<path d="M${a[0].toFixed(0)},${a[1].toFixed(0)} C${(a[0] + dx).toFixed(0)},${a[1].toFixed(0)} ${(b[0] - dx).toFixed(0)},${b[1].toFixed(0)} ${b[0].toFixed(0)},${b[1].toFixed(0)}" class="pm-tb-zincir" ${j === sec ? 'data-secili' : ''} style="--c:${durumRenk(j)}"/>`;
      const bek = rs[i].S - rs[i - 1].C;
      if (j === sec && bek > 0.5) TB.rozet += `<span class="pm-tb-bek mono" ${bek > 24 ? 'data-uzun' : ''} style="left:${((a[0] + b[0]) / 2).toFixed(0)}px;top:${((a[1] + b[1]) / 2).toFixed(0)}px">${saat(bek)} bekler</span>`;
    }
    if (j === sec) rs.forEach((r, i) => { const k = Y.kart[r.m]; if (k) TB.rozet += `<button type="button" class="pm-tb-adim-no mono" data-act="tb-adim" data-v="${esc(r.id)}" ${r.id === U.secili ? 'data-secili' : ''} style="left:${k.x - 14}px;top:${k.y - 14}px" aria-label="${i + 1}. adım">${i + 1}</button>`; });
  }
  /* uzaktan bakınca gruplar arası akış: kalınlık o yoldan geçen sipariş sayısıdır */
  const akis = {};
  for (const jo of Object.values(cx.jobs)) { const rs = jo.ops.map(o => p.ops[o.id]).filter(Boolean); for (let i = 1; i < rs.length; i++) { const a = Y.kart[rs[i - 1].m], b = Y.kart[rs[i].m]; if (!a || !b || a.grup === b.grup) continue; const key = a.grup + '>' + b.grup; akis[key] = (akis[key] || 0) + 1; } }
  const bol = Object.fromEntries(Y.bolge.map(b => [b.g, b]));
  const enCok = Math.max(1, ...Object.values(akis));
  const ak = Object.entries(akis).map(([k, n]) => { const [ga, gb] = k.split('>'); const a = bol[ga], b = bol[gb]; if (!a || !b) return ''; const ax = a.x + a.w, ay = a.y + a.h / 2, bx = b.x, by = b.y + b.h / 2; const geri = bx < ax; const dx = Math.max(80, Math.abs(bx - ax) * 0.5);
    const ac = a.x + a.w / 2, bc = b.x + b.w / 2;
    const d = b.y > a.y + 10 ? `M${ac},${a.y + a.h} C${ac},${a.y + a.h + 110} ${bc},${b.y - 110} ${bc},${b.y}` : a.y > b.y + 10 ? `M${ac},${a.y} C${ac},${a.y - 110} ${bc},${b.y + b.h + 110} ${bc},${b.y + b.h}` : geri ? `M${a.x + a.w / 2},${a.y + a.h} C${a.x + a.w / 2},${a.y + a.h + 160} ${b.x + b.w / 2},${b.y + b.h + 160} ${b.x + b.w / 2},${b.y + b.h}` : `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;
    return `<path d="${d}" class="pm-tb-akis" style="--k:${(2 + (n / enCok) * 14).toFixed(1)}px" marker-end="url(#tb-ok)"><title>${esc(ga)} → ${esc(gb)}: ${n} geçiş</title></path>`; }).join('');
  return `<svg class="pm-tb-svg" width="${Y.w + 400}" height="${Y.h + 400}" aria-hidden="true"><defs><marker id="tb-ok" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="22" markerHeight="22" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="pm-tb-ok"/></marker></defs><g class="pm-tb-akislar">${ak}</g><g>${s}</g></svg>`;
}
/* Sorun notları: işi ya da tezgâhı belli olan sorun o kartın sağına, genel sorunlar tahtanın soluna düşer */
function tbNotlar(p, Y) {
  const l = sorunlar(p); const kay = gecikmeKaynaklari(p);
  const yer = {}; const genel = [];
  for (const x of l) {
    let m = x.m;
    if (!m && x.job) { const en = kay.is[x.job]; if (en && Y.kart[en.ad]) m = en.ad; else { const cx = cxAl(); const jo = cx.jobs[x.job]; const r = jo && jo.ops.map(o => p.ops[o.id]).filter(Boolean).pop(); m = r && r.m; } }
    if (m && Y.kart[m]) (yer[m] = yer[m] || []).push(x); else genel.push(x);
  }
  const sec = U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null);
  const not = (x, L, T, i, daha) => `<article class="pm-tb-not" data-ton="${x.ton}" ${sec && x.job === sec ? 'data-yol' : ''} style="left:${L}px;top:${T}px;--d:${(Math.round(i / 37) % 3) - 1}"><b>${ic(x.simge, 'k')}${esc(x.baslik)}</b>${daha ? `<small class="pm-tb-daha">bu tezgâhta ${daha} sorun daha; karar panelinde</small>` : ''}<p>${x.html ? x.metin : esc(x.metin)}</p>${x.ek || ''}${x.eylem.length ? `<div class="pm-dugmeler">${x.eylem.slice(0, 2).map(([ad, act, v, bir]) => dugme(ad, act, { kucuk: true, birincil: !!bir, veri: `data-v="${esc(v)}"` })).join('')}</div>` : ''}</article>`;
  let s = '';
  for (const [m, xs] of Object.entries(yer)) { const k = Y.kart[m]; s += not(xs[0], k.x + TB.W - 30, k.y - 70, k.y, xs.length - 1); }
  genel.forEach((x, i) => { s += not(x, -330, 60 + i * 190, i, 0); });
  return s;
}
function tbKullaniciNotlari() {
  return (S.notlar || []).map(n => `<article class="pm-tb-not pm-tb-benim" data-not="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"><header class="pm-tb-not-tut" data-tut="${esc(n.id)}">${ic('edit', 'k')}<span>${esc(n.kim || '')}</span>${dugme('', 'tb-not-sil', { simge: 'x', kucuk: true, hayalet: true, ad: 'Notu sil', veri: `data-v="${esc(n.id)}"` })}</header><textarea data-inp="tb-not" data-v="${esc(n.id)}" aria-label="Not" rows="4">${esc(n.metin || '')}</textarea></article>`).join('');
}
function sTahta() {
  if (!S.plan) return bosPlan();
  sepetHazirla();
  const mk = mercekAl();
  const p = gosterilen(); const Y = tbYerlesim(p); const z = tbGorunur(p);
  const sec = U.secJob || (U.secili && p.ops[U.secili] ? p.ops[U.secili].job : null);
  let sahne = '';
  if (mk === 'tahta') {
    const onc = U.hamle ? Object.fromEntries(Object.entries(S.plan.util || {}).map(([m, u]) => [m, u.u])) : null;
    const bolgeler = Y.bolge.map(b => { const d = grupDoluluk(p).find(x => x.ad === b.g); return `<div class="pm-tb-bolge" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px" data-isi="${isiSeviye(d ? d.u : null)}"><span class="pm-tb-bolge-ad">${esc(b.g)}</span><span class="pm-tb-bolge-alt mono">${b.n} tezgâh${d ? ` · %${Math.round(d.u * 100)}` : ''}</span></div>`; }).join('');
    const kartlar = Object.values(Y.kart).map(k => tbKart(p, k, z, onc)).join('');
    sahne = `<div class="pm-tb-dunya" id="tb-dunya" style="width:${Y.w}px;height:${Y.h}px"><div class="pm-tb-sahne" style="transform-origin:${(Y.w / 2).toFixed(0)}px ${(Y.ch / 2).toFixed(0)}px">${bolgeler}${tbZincirler(p, Y, z)}${kartlar}${TB.rozet}${tbNotlar(p, Y)}${tbKullaniciNotlari()}${tbCerceveler(p, Y)}</div></div>`;
  } else if (mk === 'ag') sahne = `<canvas class="pm-tb-ag" id="tb-ag" role="img" aria-label="Planın sinir ağı görünümü: tezgâhlar hücre, günler katman"></canvas>${agtUstSerit()}`;
  else if (mk === 'gun') sahne = sGunYuzey();
  else sahne = `<div class="pm-tb-mercek" data-mercek="${mk}">${mercekIcerik(mk, p)}</div>`;
  const odak = sec && mk === 'tahta' ? tbOdakSeridi(p, sec) : '';
  const yak = `<div class="pm-tb-yak" role="group" aria-label="Yakınlık">${dugme('', 'tb-zoom', { simge: 'minus', kucuk: true, ad: 'Uzaklaş', veri: 'data-v="-1"' })}<span class="mono pm-tb-yuzde" id="tb-yuzde"></span>${dugme('', 'tb-zoom', { simge: 'plus', kucuk: true, ad: 'Yakınlaş', veri: 'data-v="1"' })}${dugme('', 'tb-sigdir', { simge: 'fit', kucuk: true, ad: 'Bütün tahtayı sığdır' })}</div>`;
  const HW = Math.max(Y.w, Y.cw) + 400, HH = Y.ch + 200;
  const harita = `<div class="pm-tb-harita" id="tb-harita" aria-hidden="true"><div class="pm-tb-harita-ic" style="aspect-ratio:${HW / HH}">${Y.bolge.map(b => `<i style="left:${((b.x + 360) / HW) * 100}%;top:${((b.y + 40) / HH) * 100}%;width:${(b.w / HW) * 100}%;height:${(b.h / HH) * 100}%"></i>`).join('')}${Object.values(Y.cer).map(c => `<i class="pm-tb-harita-cer" style="left:${((c.x + 360) / HW) * 100}%;top:${((c.y + 40) / HH) * 100}%;width:${(c.w / HW) * 100}%;height:${(c.h / HH) * 100}%"></i>`).join('')}<b id="tb-cerceve"></b></div></div>`;
  const onizle = U.hamle && !U.taslak ? `<div class="pm-tb-onizle" role="status">${ic('eye', 'k')}<span><b>Önizleme:</b> ${esc(U.hamle.ad)} · gecikme ${saat(S.plan.ozet.wT)} → <b>${saat(U.hamle.plan.ozet.wT)}</b> · ${U.hamle.degisen.length} siparişin bitişi değişiyor</span>${dugme('Vazgeç', 'hamle-vazgec', { kucuk: true })}${dugme('Uygula', 'hamle-uygula', { kucuk: true, birincil: true, simge: 'check' })}</div>` : '';
  return `<div class="pm-tbk" id="tbk" ${U.tamEkran ? 'data-tam' : ''} ${U.studyo ? 'data-studyo' : ''} data-mercek="${mk}">
    ${tbAracCubugu(mk, p)}
    <div class="pm-tbk-govde">${solPanel()}
      <div class="pm-tb" id="tb" data-z="orta" data-mercek="${mk}" ${sec && mk === 'tahta' && !U.studyo ? 'data-odak' : ''} tabindex="0" aria-label="${mk === 'tahta' ? 'Sonsuz tahta: sürükleyerek kaydırın, tekerlek ya da iki parmakla yakınlaşın' : 'Çalışma alanı: ' + esc((MERCEKLER.find(x => x[0] === mk) || [, ''])[1])}">
        ${sahne}${mk === 'tahta' ? yak + harita : ''}${cozumKarti()}${onizle || odak}</div>
      ${sagPanel(mk)}</div>
    ${U.studyo ? sStudyoAc() : ''}</div>`;
}
function tbTezPaneli(m) {
  const p = gosterilen(); const cx = cxAl(); const D = S.D; const M = cx.M[m]; const u = p.util && p.util[m];
  const ops = Object.values(p.ops).filter(r => r.m === m && isFinite(r.C) && r.C > cx.st.now).sort((a, b) => a.S - b.S);
  const J = p.J || {};
  const liste = ops.slice(0, 12).map((r, i) => `<li><button type="button" data-act="op" data-v="${esc(r.id)}"><b class="mono">${i + 1}</b><span><span class="mono">${esc(r.job)}</span> ${esc((cx.byId[r.id] || {}).ad || '')}<br><small class="pm-kucuk">${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C).slice(6))}${J[r.job] && J[r.job].T > 0.05 ? ' · sipariş gecikiyor' : ''}</small></span><span class="mono">${saat(r.C - r.S)}</span></button></li>`).join('');
  const yaz = yetkili('plan.yaz');
  return panel(`<span class="mono">${esc(m[0] === '@' ? m.slice(1) : m)}</span> · ${esc(M ? M.ad || '' : '')}`, `<dl class="pm-dl"><dt>Grup</dt><dd>${esc(M ? M.grup : 'fason')}</dd><dt>Doluluk</dt><dd>${u ? yuzde(u.u) : '—'}</dd><dt>Sırada</dt><dd>${ops.length} iş</dd></dl>
    <div class="pm-dugmeler">${dugme('Stüdyoda aç', 'tb-studyo', { simge: 'wrench', kucuk: true, birincil: true, veri: `data-v="${esc(m)}"` })}</div>
    ${yaz && m[0] !== '@' ? `<div class="pm-dugmeler">${dugme('Arıza ya da bakım ekle', 'tb-ariza', { simge: 'wrench', kucuk: true, veri: `data-v="${esc(m)}"` })}${dugme('Kuyrukta aç', 'kanban-tezgah', { simge: 'sort', kucuk: true, veri: `data-v="${esc(m)}"` })}</div><div class="pm-dugmeler">${dugme('Tezgâhı boşalt', 'tez-bosalt', { simge: 'trash', kucuk: true, veri: `data-v="${esc(m)}"` })}${dugme('Bugünü boşalt', 'tez-bosalt', { simge: 'sun', kucuk: true, veri: `data-v="${esc(m)}" data-g="0"` })}</div><p class="pm-kucuk">Boşaltmak işleri yapabilen en hızlı başka tezgâha taşır ve orada sabitler; başka tezgâhı olmayan iş yerinde kalır.</p>` : ''}
    <div class="pm-bolum"><h3>Kuyruk</h3><ul class="pm-zincir">${liste || '<li class="pm-kucuk">Sırada iş yok.</li>'}</ul>${ops.length > 12 ? `<p class="pm-kucuk">${ops.length - 12} iş daha.</p>` : ''}</div>
    <p class="pm-kucuk">Bir işi tutup başka tezgâhın kartına bırakın; motor sonucu önizler. Karta çift tıklayınca tezgâh stüdyosu açılır.</p>`, dugme('', 'tb-tez', { simge: 'x', hayalet: true, kucuk: true, ad: 'Kapat', veri: 'data-v=""' }));
}

/* ---------- kaydırma ve yakınlaşma: yeniden çizmeden yalnız dönüşüm değişir ---------- */
function tbUygula() {
  const tb = document.getElementById('tb'), d = document.getElementById('tb-dunya'); if (!tb || !d) return;
  const v = TB.s; d.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  tb.dataset.z = v.k < 0.42 ? 'uzak' : v.k < 1.15 ? 'orta' : 'yakin';
  const y = document.getElementById('tb-yuzde'); if (y) y.textContent = `%${Math.round(v.k * 100)}`;
  const c = document.getElementById('tb-cerceve'), Y = TB.son;
  if (c && Y) { const W = Math.max(Y.w, Y.cw) + 400, H = Y.ch + 200; const r = tb.getBoundingClientRect(); const x0 = -v.x / v.k, y0 = -v.y / v.k, w = r.width / v.k, h = r.height / v.k;
    c.style.left = `${((x0 + 360) / W) * 100}%`; c.style.top = `${((y0 + 40) / H) * 100}%`; c.style.width = `${(w / W) * 100}%`; c.style.height = `${(h / H) * 100}%`; }
  U.tbGor = { ...v };
}
function tbSigdir() {
  const tb = document.getElementById('tb'); const Y = TB.son; if (!tb || !Y) return;
  const r = tb.getBoundingClientRect(); const cer = tbKipAl() === 'c'; const x0 = -350, x1 = (cer ? Math.max(Y.w, Y.cw) : Y.w) + 240, y0 = -110, y1 = (cer ? Y.ch : Y.h) + 140; const ust = 16, alt = innerWidth < 1024 ? 24 : 40;
  const ey = U.tbEgik ? 0.72 : 1; const k = Math.max(0.08, Math.min(1.2, Math.min((r.width - 24) / (x1 - x0), (r.height - ust - alt) / ((y1 - y0) * ey))));
  TB.s = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: ust + Math.max(0, (r.height - ust - alt - (y1 - y0) * k) / 2) - y0 * k - (1 - ey) * (y1 - y0) * k / 2 }; tbUygula();
}
function tbOdakla(x, y, k) {
  const tb = document.getElementById('tb'); if (!tb) return; const r = tb.getBoundingClientRect();
  const cek = document.querySelector('.pm-tb-cekmece'); const gw = cek && innerWidth >= 1024 ? r.width - cek.offsetWidth - 24 : r.width;
  const od = document.querySelector('.pm-tb-odak'); const ust = 16, alt = (od ? od.offsetHeight + 16 : 0);
  const gh = (cek && innerWidth < 1024 ? r.height - cek.offsetHeight : r.height) - ust - alt;
  const hedef = { k, x: gw / 2 - x * k, y: ust + gh / 2 - y * k }; const bas = { ...TB.s }; const t0 = performance.now();
  const adim = t => { const a = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - a, 3); TB.s = { k: bas.k + (hedef.k - bas.k) * e, x: bas.x + (hedef.x - bas.x) * e, y: bas.y + (hedef.y - bas.y) * e }; tbUygula(); if (a < 1) requestAnimationFrame(adim); };
  requestAnimationFrame(adim);
}
function tbZoom(f, cx0, cy0) {
  const tb = document.getElementById('tb'); if (!tb) return; const r = tb.getBoundingClientRect();
  const px = cx0 == null ? r.width / 2 : cx0, py = cy0 == null ? r.height / 2 : cy0; const v = TB.s;
  const k = Math.max(0.08, Math.min(2.6, v.k * f)); const wx = (px - v.x) / v.k, wy = (py - v.y) / v.k;
  TB.s = { k, x: px - wx * k, y: py - wy * k }; tbUygula();
}
function tahtaBagla() {
  const tb = document.getElementById('tb'); if (!tb) return;
  /* üst katmanların gerçek yüksekliği: panel ve düğmeler araç çubuğunun altından başlar */
  const ustAyar = () => { const a = tb.querySelector('.pm-tb-arac'), o = tb.querySelector('.pm-tb-ozet'); const alt = Math.max(a ? a.offsetTop + a.offsetHeight : 0, o && getComputedStyle(o).top !== 'auto' && o.offsetTop < 40 ? o.offsetTop + o.offsetHeight : 0); tb.style.setProperty('--ust-alt', alt + 10 + 'px'); };
  ustAyar(); new ResizeObserver(ustAyar).observe(tb);
  TB.son = tbYerlesim(gosterilen());
  if (mercekAl() !== 'tahta') { if (mercekAl() === 'ag') agtBagla(); return; }
  if (U.tbGor) { TB.s = { ...U.tbGor }; tbUygula(); } else { TB.s = { k: 1, x: 0, y: 0 }; tbSigdir(); }
  if (U.hamle) requestAnimationFrame(() => requestAnimationFrame(() => tb.querySelectorAll('.pm-tb-kart[data-h]').forEach(k => { k.style.setProperty('--h', k.dataset.h + 'px'); })));
  const ptr = new Map(); let surukle = null, pinc = null, cipTas = null;
  const yerel = e => { const r = tb.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const dunya = (x, y) => [(x - TB.s.x) / TB.s.k, (y - TB.s.y) / TB.s.k];
  tb.addEventListener('pointerdown', e => {
    if (e.target.closest('.pm-st, .pm-tb-arac, .pm-tb-ozet, .pm-tb-yak, .pm-tb-cekmece, .pm-tb-onizle, .pm-tb-cozum, .pm-tb-odak, textarea, select, input')) return;
    if (e.target.closest('button, a')) return;
    const tut = e.target.closest('[data-tut]');
    if (tut) { const n = (S.notlar || []).find(x => x.id === tut.dataset.tut); if (n) { surukle = { not: n, el: tut.parentElement, bx: n.x, by: n.y, sx: e.clientX, sy: e.clientY }; tb.setPointerCapture(e.pointerId); e.preventDefault(); } return; }
    if (e.target.closest('button, a')) return;
    ptr.set(e.pointerId, yerel(e));
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinc = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: TB.s.k }; surukle = null; return; }
    surukle = { sx: e.clientX, sy: e.clientY, x: TB.s.x, y: TB.s.y, oynadi: false }; tb.setPointerCapture(e.pointerId); tb.dataset.tutuyor = '';
  });
  tb.addEventListener('pointermove', e => {
    if (ptr.has(e.pointerId)) ptr.set(e.pointerId, yerel(e));
    if (pinc && ptr.size === 2) { const [a, b] = [...ptr.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); tbZoom((pinc.k * d / pinc.d) / TB.s.k, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); return; }
    if (!surukle) return;
    if (surukle.not) { const n = surukle.not; n.x = surukle.bx + (e.clientX - surukle.sx) / TB.s.k; n.y = surukle.by + (e.clientY - surukle.sy) / TB.s.k; surukle.el.style.left = n.x + 'px'; surukle.el.style.top = n.y + 'px'; return; }
    TB.s = { ...TB.s, x: surukle.x + e.clientX - surukle.sx, y: surukle.y + e.clientY - surukle.sy }; if (Math.abs(e.clientX - surukle.sx) + Math.abs(e.clientY - surukle.sy) > 4) surukle.oynadi = true; tbUygula();
  });
  const bitir = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinc = null; if (surukle && surukle.not) kaydet(); surukle = null; delete tb.dataset.tutuyor; };
  tb.addEventListener('pointerup', bitir); tb.addEventListener('pointercancel', bitir);
  tb.addEventListener('wheel', e => {
    if (e.target.closest('.pm-st, .pm-tb-cekmece, textarea, .pm-tb-not p, .pm-tb-cer-ic')) return;
    e.preventDefault(); const [x, y] = yerel(e);
    const fare = e.ctrlKey || e.deltaMode === 1 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40 && e.deltaX === 0);
    if (fare) tbZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y);
    else { TB.s = { ...TB.s, x: TB.s.x - e.deltaX, y: TB.s.y - e.deltaY }; tbUygula(); }
  }, { passive: false });
  tb.addEventListener('keydown', e => {
    if (U.studyo || e.target.closest('textarea, input, select')) return;
    const a = 60; const m = { ArrowLeft: [a, 0], ArrowRight: [-a, 0], ArrowUp: [0, a], ArrowDown: [0, -a] }[e.key];
    if (m) { TB.s = { ...TB.s, x: TB.s.x + m[0], y: TB.s.y + m[1] }; tbUygula(); e.preventDefault(); }
    if (U.secJob && (e.key === '.' || e.key === ',')) { tbAdimGit(e.key === '.' ? 1 : -1); e.preventDefault(); return; } if (e.key === '+' || e.key === '=') tbZoom(1.2); if (e.key === '-') tbZoom(1 / 1.2); if (e.key === '0') tbSigdir();
  });
  /* İş kartını başka tezgâhın kartına bırakmak bir hamledir: motor önizler */
  tb.addEventListener('dragstart', e => { if (e.target.closest('.pm-st')) return; const c = e.target.closest('.pm-tb-cip'); if (!c || !yetkili('plan.yaz')) { e.preventDefault(); return; } cipTas = c.dataset.v; { const o = cxAl().byId[cipTas]; const ok = new Set(o ? o.c.map(x => x.m) : []); tb.querySelectorAll('.pm-tb-kart').forEach(k => k.toggleAttribute('data-uygun', ok.has(k.dataset.m))); } try { e.dataTransfer.setData('text/plain', cipTas); } catch (x) { /* bazı tarayıcılar reddeder */ } e.dataTransfer.effectAllowed = 'move'; tb.dataset.tasiniyor = ''; });
  tb.addEventListener('dragenter', () => { if (HAVUZ_TAS && !cipTas) { const ok = havuzMakineleri(HAVUZ_TAS); tb.querySelectorAll('.pm-tb-kart').forEach(k => k.toggleAttribute('data-uygun', ok.has(k.dataset.m))); tb.dataset.tasiniyor = ''; } });
  tb.addEventListener('dragover', e => { if (!cipTas && !HAVUZ_TAS) return; const k = e.target.closest('.pm-tb-kart[data-uygun]'); tb.querySelectorAll('.pm-tb-kart[data-hedef]').forEach(x => delete x.dataset.hedef); if (k) { e.preventDefault(); k.dataset.hedef = ''; } });
  tb.addEventListener('dragend', () => { cipTas = null; delete tb.dataset.tasiniyor; tb.querySelectorAll('[data-hedef], [data-uygun]').forEach(x => { delete x.dataset.hedef; delete x.dataset.uygun; }); });
  tb.addEventListener('drop', e => { const k = e.target.closest('.pm-tb-kart'); if (k && HAVUZ_TAS && !cipTas) { e.preventDefault(); const j = HAVUZ_TAS; HAVUZ_TAS = null; delete tb.dataset.tasiniyor; havuzdanAl(j, k.dataset.m, null); return; } if (!k || !cipTas) return; e.preventDefault(); const id = cipTas; cipTas = null; kanbanTasi(id, k.dataset.m, null, k.dataset.m !== S.plan.ops[id].m); });
  tb.addEventListener('dblclick', e => { if (U.studyo || e.target.closest('.pm-st')) return; { const sp = e.target.closest('.pm-sip'); if (sp) { e.preventDefault(); stAc('sip', sp.dataset.v); return; } const cp = e.target.closest('.pm-tb-cip'); if (cp && S.plan.ops[cp.dataset.v]) { e.preventDefault(); stAc('sip', S.plan.ops[cp.dataset.v].job); return; } const k = e.target.closest('.pm-tb-kart'); if (k && k.dataset.m) { e.preventDefault(); tbStudyoAc(k.dataset.m); return; } } });
  const h = document.getElementById('tb-harita');
  if (h) h.addEventListener('click', e => { const r = h.firstElementChild.getBoundingClientRect(); const Y = TB.son; const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height; tbOdakla(fx * (Math.max(Y.w, Y.cw) + 400) - 360, fy * (Y.ch + 200) - 40, TB.s.k); });
}
function tbNotEkle(x, y) {
  if (x == null) { const tb = document.getElementById('tb'); const r = tb.getBoundingClientRect(); x = (r.width / 2 - TB.s.x) / TB.s.k - 110; y = (r.height / 2 - TB.s.y) / TB.s.k - 60; }
  S.notlar = S.notlar || []; const n = { id: 'n' + Date.now().toString(36), x, y, metin: '', kim: kim().ad }; S.notlar.push(n); kaydet(); render();
  const t = document.querySelector(`textarea[data-v="${n.id}"]`); if (t) t.focus();
}
function tbBul(q) {
  q = (q || '').trim().toLocaleUpperCase('tr-TR'); if (!q) return; const p = gosterilen(); const Y = TB.son || tbYerlesim(p);
  if (mercekAl() !== 'tahta') { if (Y.kart[q] || Y.kart['@' + q]) { U.tbTez = (Y.kart[q] || Y.kart['@' + q]).id; U.secili = null; U.secJob = null; } else { const s0 = S.D.siparisler.find(x => x.id.toLocaleUpperCase('tr-TR') === q); if (!s0) { bildir(`${q} bulunamadı.`, 'hata'); return; } U.secJob = s0.id; U.secili = null; U.tbTez = null; } render(); return; }
  const k = Y.kart[q] || Y.kart['@' + q];
  if (k) { U.tbTez = k.id; U.secili = null; U.secJob = null; render(); tbOdakla(k.x + TB.W / 2, k.y + TB.H / 2, 1.3); return; }
  const s = S.D.siparisler.find(x => x.id.toLocaleUpperCase('tr-TR') === q);
  if (!s) { bildir(`${q} bulunamadı.`, 'hata'); return; }
  U.secJob = s.id; U.secili = null; U.tbTez = null; render();
  const rs = Object.values(p.ops).filter(r => r.job === s.id && Y.kart[r.m]);
  if (rs.length) { const xs = rs.map(r => Y.kart[r.m].x), ys = rs.map(r => Y.kart[r.m].y); const x0 = Math.min(...xs), x1 = Math.max(...xs) + TB.W, y0 = Math.min(...ys), y1 = Math.max(...ys) + TB.H;
    const tb = document.getElementById('tb').getBoundingClientRect(); const kk = Math.max(0.3, Math.min(1.2, (tb.width - 80) / (x1 - x0 + 200), (tb.height - 120) / (y1 - y0 + 200))); tbOdakla((x0 + x1) / 2, (y0 + y1) / 2, kk); }
}

/* ---------- dört düzen: kullanıcı karşılaştırıp birini seçecek ---------- */
const TB_KIP = [['a', 'A · İkisi birlikte', 'Eğik tahta ve çerçeveler'], ['b', 'B · Eğik tahta', 'Kart yüksekliği doluluk'], ['c', 'C · Her şey tahtada', 'Düz tahta ve çerçeveler'], ['d', 'D · Tam 3B sahne', 'Atölye ikizi tahtanın yerinde']];
const tbKipAl = () => 'c';
function tbKipSecici() {
  return `<div class="pm-tb-kip" role="tablist" aria-label="Düzen seçenekleri">${TB_KIP.map(([id, ad, m]) => `<button type="button" role="tab" data-act="tb-kip" data-v="${id}" aria-selected="${tbKipAl() === id}"><b>${ad}</b><small>${m}</small></button>`).join('')}</div>`;
}

/* ---------- çerçeveler: siparişler, olaylar ve senaryolar da tahtada durur ----------
   Senaryolar küçük tahta kopyalarıdır: aynı yerleşimde tezgâhlar dolulukla renklenir, yan yana bakılınca fark görünür. */
function tbCerceveler(p, Y) {
  const C = Y.cer; const yaz = yetkili('plan.yaz');
  const cer = (c, id, simge, ad, alt, ic_) => `<section class="pm-tb-cer" data-cer="${id}" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px"><header class="pm-tb-cer-ust">${ic(simge, 'k')}<b>${ad}</b><span class="pm-kucuk">${alt}</span></header><div class="pm-tb-cer-ic">${ic_}</div></section>`;
  const sip = cer(C.sip, 'sip', 'list', 'Siparişler', `${S.D.siparisler.length} sipariş, gecikene göre`, siparisListesi(p));
  const olaylar = [['ariza', 'wrench', 'Arıza ya da bakım', 'Tezgâh belli saatlerde çalışmaz'], ['acil', 'bolt', 'Acil sipariş', 'Yeni sipariş plana girer'], ['malzeme', 'box', 'Malzeme gecikmesi', 'Malzeme geç gelir'], ['eksik', 'user', 'Personel eksiği', 'Vardiyada kişi eksik'], ['fason', 'truck', 'Fason gecikmesi', 'Fasoncu geç teslim eder']];
  const isl = (S.olaylar || []).length + S.down.length;
  const olay = cer(C.olay, 'olay', 'alert', 'Olay ekle', isl ? `${isl} olay işlendi` : 'önce önizlenir', `<div class="pm-dugmeler">${dugme('Kriz masasında üç tepkiyi karşılaştır', 'st-tur', { simge: 'layers', kucuk: true, birincil: true, veri: 'data-v="kriz"' })}</div><div class="pm-tb-olaylar">${olaylar.map(([t, sm, ad, m]) => `<button type="button" class="pm-tb-olay" data-act="olay-tip" data-v="${t}" ${yaz ? '' : 'disabled'}>${ic(sm, 'k')}<span><b>${ad}</b><small>${m}</small></span></button>`).join('')}</div>`);
  const senL = S.senaryolar.filter(x => x.plan && x.durum !== 'vazgecildi').slice(-3);
  const mini = (ad, pl, alt, eylem) => { const W = 220, sk = W / Math.max(1, Y.w + 40); const kartlar = Object.values(Y.kart).map(k => { const u = pl.util && pl.util[k.id]; return `<i style="left:${((k.x + 20) * sk).toFixed(1)}px;top:${((k.y) * sk).toFixed(1)}px;width:${(TB.W * sk).toFixed(1)}px;height:${(TB.H * sk).toFixed(1)}px" data-isi="${isiSeviye(u ? u.u : null)}"></i>`; }).join('');
    return `<article class="pm-tb-mini"><header><b>${esc(ad)}</b><span class="mono">${saat(pl.ozet.wT)} · ${pl.ozet.late}/${pl.ozet.n}</span></header><div class="pm-tb-mini-tahta" style="width:${W}px;height:${((Y.h + 20) * sk).toFixed(0)}px">${kartlar}</div><p class="pm-kucuk">${alt}</p>${eylem}</article>`; };
  const simdi = mini('Şimdiki plan', S.plan, 'üzerinde çalıştığınız', '');
  const onz = U.hamle ? mini('Önizleme', U.hamle.plan, esc(U.hamle.ad), '') : '';
  const kayitli = senL.map(x => mini(x.ad, x.plan, `${esc(x.yazar || '')}${x.id === S.canli ? ' · canlı' : ''}`, `<div class="pm-dugmeler">${dugme('Aç', 'sen-ac', { kucuk: true, veri: `data-v="${esc(x.id)}"` })}</div>`)).join('');
  const kaydet_ = yaz ? `<form class="pm-sira" data-form="senaryo-kaydet" novalidate><input class="tc-alan-kutu pm-sira-ara" name="ad" placeholder="Senaryo adı" aria-label="Senaryo adı"><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil" ${planGuncel() ? '' : 'disabled'}>${ic('flag', 'k')}Kaydet</button></form>` : '';
  const sen = cer(C.sen, 'sen', 'flag', 'Senaryolar', 'aynı tahtanın küçük kopyaları', `${kaydet_}<div class="pm-dugmeler">${dugme('Stüdyoda yan yana karşılaştır', 'st-tur', { simge: 'layers', kucuk: true, veri: 'data-v="sen"' })}</div><div class="pm-tb-miniler">${simdi}${onz}${kayitli || '<p class="pm-kucuk">Kayıtlı senaryo yok. Planı kaydedince burada yan yana durur.</p>'}</div>`);
  return sip + olay + sen;
}

/* ---------- odak: seçili siparişin yolu adım adım ----------
   Yol dışındaki her şey bulanıklaşır; şerit adımları sırayla verir, aradaki bekleme yolu uzatan yeri gösterir. */
function tbYolAdimlari(p, j) {
  const jo = cxAl().jobs[j]; if (!jo) return [];
  return jo.ops.map(o => p.ops[o.id]).filter(r => r && isFinite(r.C));
}
function tbOdakSeridi(p, j) {
  const D = S.D; const cx = cxAl(); const rs = tbYolAdimlari(p, j); const Jj = (p.J || {})[j];
  const s = D.siparisler.find(x => x.id === j);
  const adimlar = rs.map((r, i) => { const bek = i ? r.S - rs[i - 1].C : null; const o = cx.byId[r.id] || {};
    return `${bek != null && bek > 0.5 ? `<span class="pm-tb-yol-bek mono" ${bek > 24 ? 'data-uzun' : ''}>${saat(bek)}</span>` : bek != null ? '<span class="pm-tb-yol-ok" aria-hidden="true"></span>' : ''}<button type="button" class="pm-tb-yol-adim" data-act="tb-adim" data-v="${esc(r.id)}" aria-current="${r.id === U.secili}"><b class="mono">${i + 1}</b><span><span class="mono">${esc(r.m[0] === '@' ? r.m.slice(1) : r.m)}</span> ${esc(o.ad || '')}<small>${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C).slice(6))}</small></span></button>`; }).join('');
  const top = rs.length ? rs[rs.length - 1].C - rs[0].S : 0; const isl = rs.reduce((t, r) => t + (r.C - r.S), 0);
  return `<div class="pm-tb-odak" role="region" aria-label="Siparişin yolu"><header><b class="mono">${esc(j)}</b><span>${s ? esc(urunAd(s.urun)) + ' · ' + s.adet + ' adet' : ''}</span>
    ${Jj ? (Jj.T > 0.05 ? rozet(saat(Jj.T) + ' geç', 'hata') : rozet('Zamanında', 'tamam')) : ''}<span class="pm-kucuk">${rs.length} adım · işlem ${saat(isl)} · bekleme ${saat(Math.max(0, top - isl))}</span>
    <span class="pm-sira-ara"></span>${dugme('', 'tb-adim-git', { simge: 'chev-left', kucuk: true, ad: 'Önceki adım (,)', veri: 'data-v="-1"' })}${dugme('', 'tb-adim-git', { simge: 'chev-right', kucuk: true, ad: 'Sonraki adım (.)', veri: 'data-v="1"' })}${yetkili('plan.yaz') ? dugme('Hedefe yetiştir', 'hedef-ac', { simge: 'target', kucuk: true, veri: `data-v="${esc(j)}"` }) : ''}${dugme('Stüdyoda aç', 'st-sip', { simge: 'wrench', kucuk: true, veri: `data-v="${esc(j)}"` })}${dugme('Ayrıntı', 'tb-cekmece', { simge: 'list', kucuk: true, veri: 'data-v="ac"' })}${dugme('Odaktan çık', 'secim-temizle', { simge: 'x', kucuk: true, hayalet: true })}</header>
    <div class="pm-tb-yol">${adimlar}</div></div>`;
}
function tbAdimGit(d) {
  const p = gosterilen(); const j = U.secJob; if (!j) return; const rs = tbYolAdimlari(p, j); if (!rs.length) return;
  const i = rs.findIndex(r => r.id === U.secili); const n = Math.max(0, Math.min(rs.length - 1, i < 0 ? 0 : i + d));
  tbAdimSec(rs[n].id, d === 0);
}
function tbAdimSec(id, butun) {
  const p = gosterilen(); const r = p.ops[id]; if (!r) return;
  U.secili = id; U.secJob = r.job; U.tbCekmece = false; render();
  const Y = TB.son; const k = Y && Y.kart[r.m];
  if (butun) { const ks = tbYolAdimlari(p, r.job).map(x => Y.kart[x.m]).filter(Boolean); if (ks.length) { const x0 = Math.min(...ks.map(q => q.x)), x1 = Math.max(...ks.map(q => q.x)) + TB.W, y0 = Math.min(...ks.map(q => q.y)), y1 = Math.max(...ks.map(q => q.y)) + TB.H;
    const tb = document.getElementById('tb').getBoundingClientRect(); const od = document.querySelector('.pm-tb-odak'); const kk = Math.max(0.2, Math.min(1.1, (tb.width - 80) / (x1 - x0 + 160), (tb.height - 110 - (od ? od.offsetHeight : 0)) / (y1 - y0 + 160))); tbOdakla((x0 + x1) / 2, (y0 + y1) / 2, kk); } }
  else if (k) tbOdakla(k.x + TB.W / 2, k.y + TB.H / 2, Math.max(TB.s.k, 0.9));
  const b = document.querySelector('.pm-tb-yol-adim[aria-current="true"]'); if (b) b.scrollIntoView({ block: 'nearest', inline: 'center' });
}
