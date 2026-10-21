/* ---------- Bütün resim: bütün görünümler tek ekranda ve birbirine bağlı ----------
   Ortada büyük görünüm (Gün, Zaman, Kuyruk ya da Matris), yanında dört küçük: Kuyruk, Ağ, Matris, 3B.
   Hepsi aynı seçimi, aynı zaman imlecini ve aynı karşılaştırmayı paylaşır. Gün planında iş sürüklenirken motorun
   önizlemesi küçük görünümlere de aynı anda düşer; "Fark" her görünümü yayınlanan plana (yoksa sepetin başına) göre işaretler.
   Ağ ve 3B'nin büyük hali kendi merceğidir; seçim oraya da taşınır. */
const RS = { on: null, raf: null };
const RS_PANEL = [['kuyruk', 'Kuyruk', 'sort'], ['ag', 'Ağ', 'scan'], ['matris', 'Matris', 'grid'], ['3b', '3B', 'cube']];
MERCEKLER.splice(1, 0, ['resim', 'Bütün resim', 'expand']);
/* bütün resimde sepet kendiliğinden açılıp alanı daraltmasın; kullanıcı açarsa açık kalır */
const rsMercekSecEski = mercekSec;
mercekSec = function (x) { if (x === 'resim') { U.solElle = true; U.sol = null; } rsMercekSecEski(x); };
const rsMercekEski = mercekIcerik;
mercekIcerik = function (mk, p) { return mk === 'resim' ? sResim(p) : rsMercekEski(mk, p); };

function rsSimdi() { return cxAl().st.now; }
function rsT() { const now = rsSimdi(); if (U.rsT == null || U.rsT < now) U.rsT = now; return U.rsT; }
function rsD0() { return Math.floor(rsSimdi() / 24) * 24; }
function rsSecJob(p) { return U.gySec && p.ops[U.gySec] ? p.ops[U.gySec].job : U.secJob || null; }
/* karşılaştırma tabanı: sürüklerken bugünkü plan, Fark açıksa seçilen adımın öncesi ya da yayınlanan plan, yoksa sepetin başı */
function rsRef() {
  if (RS.on) return { p: S.plan, ad: 'bırakmadan önceki plan' };
  if (!U.rsFark) return null;
  const a = U.taslak ? U.taslak.adimlar : [];
  if (U.rsAdim != null && a[U.rsAdim]) return { p: a[U.rsAdim].once.plan, ad: `${U.rsAdim + 1}. değişiklikten önceki plan` };
  const c = canliSen(); if (c && c.plan && c.plan.ops) return { p: c.plan, ad: 'yayınlanan plan' };
  if (a.length) return { p: a[0].once.plan, ad: 'sepet açıldığındaki plan' };
  return null;
}
function rsGoster() { return RS.on || gosterilen(); }
function rsKuyruklar(p) {
  const q = {}; for (const r of Object.values(p.ops)) if (isFinite(r.S) && isFinite(r.C)) (q[r.m] = q[r.m] || []).push(r);
  for (const m in q) q[m].sort((a, b) => a.S - b.S);
  return q;
}
function rsTezgahlar() { return S.D.tezgahlar.map(t => t.id); }
function rsDoluluk(p, cx) {
  const { a: d0, L } = olDilim(); const o = {};
  for (const m of rsTezgahlar()) {
    const M = cx.M[m]; if (!M) continue; o[m] = [];
    for (let g = 0; g < 7; g++) {
      const a = d0 + g * L, b = a + L; const acik = M.rw.reduce((s, [x, y]) => s + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0);
      let dolu = 0; for (const r of Object.values(p.ops)) if (r.m === m && isFinite(r.C) && r.C > a && r.S < b) dolu += workIn(M.rw, Math.max(a, r.S), Math.min(b, r.C));
      o[m].push(acik > 0.5 ? dolu / acik : null);
    }
  }
  return o;
}
function rsDegisenler(p, ref) { const s = new Set(); if (!ref) return s; for (const id in p.ops) { const a = ref.ops[id], b = p.ops[id]; if (b && isFinite(b.S) && (!a || a.m !== b.m || Math.abs(a.S - b.S) > 0.25)) s.add(id); } return s; }

/* ---------- küçük görünümler ---------- */
function rsKuyrukMini(p, ref, sj, t) {
  const Q = rsKuyruklar(p), QR = ref ? rsKuyruklar(ref) : null; const deg = rsDegisenler(p, ref);
  const sira = (Qx, m, id) => (Qx[m] || []).findIndex(r => r.id === id);
  const satir = rsTezgahlar().map(m => {
    const l = (Q[m] || []).filter(r => r.C > t); if (!l.length) return '';
    const cal = l[0].S <= t ? l[0] : null; const sonra = l.slice(cal ? 1 : 0, cal ? 3 : 2);
    const kart = (r, ad) => { const kay = QR && deg.has(r.id); const ok = kay ? (QR[r.m] && sira(QR, r.m, r.id) >= 0 ? sira(Q, m, r.id) - sira(QR, m, r.id) : null) : null;
      return `<button type="button" class="pm-rs-kk" data-act="rs-op" data-v="${esc(r.id)}" style="--c:${durumRenk(r.job)}" ${sj && r.job === sj ? 'data-secili' : ''} ${kay ? 'data-fark' : ''} title="${esc(ad)}: ${esc(r.id)} · ${esc(fmtDT(S.D, r.S))} → ${esc(fmtDT(S.D, r.C))}"><span class="mono">${esc(r.job.replace(/^[A-Za-zÇĞİÖŞÜçğıöşü]+-?/, ''))}</span>${kay ? `<small>${ok == null ? 'yeni' : ok < 0 ? '▲' + -ok : ok > 0 ? '▼' + ok : '⇄'}</small>` : ''}</button>`; };
    const ariza = S.down.some(d => d.m === m && d.from <= t && d.to > t);
    return `<li ${U.rsTez === m ? 'data-secili' : ''}><button type="button" class="pm-rs-ad mono" data-act="rs-tez" data-v="${esc(m)}">${esc(m)}</button>
      <span class="pm-rs-dur" data-dur="${ariza ? 'ariza' : cal ? 'calisiyor' : 'bos'}" title="${ariza ? 'Arıza ya da bakım' : cal ? 'Çalışıyor' : 'Boşta'}"></span>${cal ? kart(cal, 'Çalışan') : '<span class="pm-rs-bos">boşta</span>'}<span class="pm-rs-ok">${ic('chev-right', 'k')}</span>${sonra.map(r => kart(r, 'Sıradaki')).join('')}</li>`;
  }).join('');
  return `<ul class="pm-rs-kuyruk">${satir || '<li class="pm-kucuk">Bu saatten sonra iş yok.</li>'}</ul>`;
}
function rsAgMini(p, ref, sj, t) {
  const cx = cxAl(); const now = rsSimdi(); const ufuk = now + 7 * 24;
  const tez = rsTezgahlar(); const yer = {}, say = {};
  for (const j of Object.values(cx.jobs)) j.ops.forEach((o, i) => { const r = p.ops[o.id]; if (!r || r.m[0] === '@') return; const f = i / Math.max(1, j.ops.length - 1); yer[r.m] = (yer[r.m] || 0) + f; say[r.m] = (say[r.m] || 0) + 1; });
  const kol = {}; for (const m of tez) { const f = say[m] ? yer[m] / say[m] : 0.5; const k = Math.min(4, Math.round(f * 4)); (kol[k] = kol[k] || []).push(m); }
  const W = 320, H = 200, pos = {};
  Object.entries(kol).forEach(([k, l]) => l.forEach((m, i) => { pos[m] = [24 + (+k) * ((W - 48) / 4), 18 + (i + 0.5) * ((H - 30) / l.length)]; }));
  const yol = pp => { const e = {}; const byJ = {}; for (const r of Object.values(pp.ops)) if (isFinite(r.S) && r.S < ufuk && r.C > now && pos[r.m]) (byJ[r.job] = byJ[r.job] || []).push(r);
    for (const j in byJ) { const l = byJ[j].sort((a, b) => a.S - b.S); for (let i = 1; i < l.length; i++) if (l[i - 1].m !== l[i].m) { const k = l[i - 1].m + '>' + l[i].m; e[k] = (e[k] || 0) + 1; } } return { e, byJ }; };
  const Y = yol(p), YR = ref ? yol(ref) : null;
  const egri = (a, b) => { const [x1, y1] = pos[a], [x2, y2] = pos[b]; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.min(30, Math.abs(x2 - x1) * 0.25 + 8); return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; };
  const kenar = Object.entries(Y.e).map(([k, n]) => { const [a, b] = k.split('>'); const fark = YR && (YR.e[k] || 0) !== n; return `<path d="${egri(a, b)}" class="pm-rs-kenar" ${fark ? 'data-fark' : ''} style="stroke-width:${(0.8 + Math.log2(1 + n)).toFixed(2)}"><title>${esc(a)} → ${esc(b)}: ${n} parça akışı${fark ? ` (önce ${YR.e[k] || 0})` : ''}</title></path>`; }).join('');
  const secYol = sj && Y.byJ[sj] ? Y.byJ[sj].sort((a, b) => a.S - b.S) : [];
  const eskiYol = sj && YR && YR.byJ[sj] ? YR.byJ[sj].sort((a, b) => a.S - b.S) : [];
  const zincir = l => l.slice(1).map((r, i) => l[i].m !== r.m ? egri(l[i].m, r.m) : '').join(' ');
  const simdiki = secYol.find(r => r.S <= t && r.C > t) || secYol.find(r => r.S > t);
  const dugum = tez.filter(m => pos[m]).map(m => { const [x, y] = pos[m]; const kul = secYol.some(r => r.m === m); const cal = Object.values(p.ops).some(r => r.m === m && r.S <= t && r.C > t);
    return `<g class="pm-rs-dugum" data-act="rs-tez" data-v="${esc(m)}" ${kul ? 'data-yol' : ''} ${U.rsTez === m ? 'data-secili' : ''} ${simdiki && simdiki.m === m ? 'data-simdi' : ''}><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${kul ? 9 : 7}" ${cal ? 'data-cal' : ''}></circle><text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${esc(m)}</text><title>${esc(m)}</title></g>`; }).join('');
  const not = sj ? `<span class="mono">${esc(sj)}</span> yolu${simdiki ? ` · ${esc(fmtDT(S.D, t))} anında ${esc(simdiki.m)}` : ''}${eskiYol.length && zincir(eskiYol) !== zincir(secYol) ? ' · kesik: önceki yol' : ''}` : 'Kalınlık: tezgâhlar arası parça akışı (7 gün). Bir sipariş seçin, yolu yansın.';
  return `<svg class="pm-rs-ag" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tezgâhlar arası parça akışı">${kenar}${eskiYol.length ? `<path d="${zincir(eskiYol)}" class="pm-rs-yol-eski"></path>` : ''}${secYol.length ? `<path d="${zincir(secYol)}" class="pm-rs-yol"></path>` : ''}${dugum}</svg><p class="pm-rs-not">${not}</p>`;
}
function rsMatrisMini(p, ref, sj, t) {
  const cx = cxAl(); const o = rsDoluluk(p, cx), oR = ref ? rsDoluluk(ref, cx) : null; const d0 = rsD0(); const gT = Math.floor((t - d0) / 24);
  const sjG = {}; if (sj) for (const r of Object.values(p.ops)) if (r.job === sj && isFinite(r.S)) { for (let g = Math.max(0, Math.floor((r.S - d0) / 24)); g <= Math.min(6, Math.floor((r.C - 1e-6 - d0) / 24)); g++) (sjG[r.m] = sjG[r.m] || new Set()).add(g); }
  const bas = Array.from({ length: 7 }, (_, g) => `<th scope="col"><button type="button" data-act="rs-gun" data-v="${g}" ${g === gT ? 'aria-current="true"' : ''}>${esc(fmtDT(S.D, d0 + g * 24).slice(6, 9))}</button></th>`).join('');
  const sat = Object.keys(o).map(m => `<tr ${U.rsTez === m ? 'data-secili' : ''}><th scope="row"><button type="button" class="mono" data-act="rs-tez" data-v="${esc(m)}">${esc(m)}</button></th>${o[m].map((x, g) => { const r = oR && oR[m] ? oR[m][g] : null; const df = x != null && r != null ? x - r : 0;
    return `<td data-isi="${isiSeviye(x)}" ${g === gT ? 'data-imlec' : ''} ${sjG[m] && sjG[m].has(g) ? 'data-sec' : ''} ${Math.abs(df) > 0.05 ? `data-fark="${df > 0 ? 'art' : 'az'}"` : ''} title="${esc(m)} · ${esc(fmtDT(S.D, d0 + g * 24).slice(0, 9))}: ${x == null ? 'kapalı' : '%' + Math.round(x * 100)}${Math.abs(df) > 0.05 ? ` (önce %${Math.round(r * 100)})` : ''}">${x == null ? '' : Math.round(x * 100)}</td>`; }).join('')}</tr>`).join('');
  return `<div class="pm-rs-mat"><table><thead><tr><th></th>${bas}</tr></thead><tbody>${sat}</tbody></table></div>`;
}
function rs3BMini(p, ref, sj, t) {
  const tez = rsTezgahlar(); const n = tez.length; const kol = Math.max(3, Math.ceil(Math.sqrt(n * 1.4)));
  const yuk = pp => { const o = {}; for (const r of Object.values(pp.ops)) if (isFinite(r.C) && r.C > t && r.S < t + 24) o[r.m] = (o[r.m] || 0) + (Math.min(t + 24, r.C) - Math.max(t, r.S)); return o; };
  const Y = yuk(p), YR = ref ? yuk(ref) : null;
  const cw = 26, ch = 15, ox = 160, oy = 34; const kutular = tez.map((m, i) => ({ m, i: i % kol, j: Math.floor(i / kol) })).sort((a, b) => (a.i + a.j) - (b.i + b.j));
  const svg = kutular.map(({ m, i, j }) => {
    const x = ox + (i - j) * cw, y = oy + (i + j) * ch; const h = 4 + Math.min(24, Y[m] || 0) * 2.2;
    const cal = Object.values(p.ops).find(r => r.m === m && r.S <= t && r.C > t); const ariza = S.down.some(d => d.m === m && d.from <= t && d.to > t);
    const dur = ariza ? 'ariza' : cal ? 'calisiyor' : 'bos'; const sec = cal && sj && cal.job === sj; const fark = YR && Math.abs((YR[m] || 0) - (Y[m] || 0)) > 0.25;
    const ust = `${x},${y - h} ${x + cw},${y - h + ch} ${x},${y - h + 2 * ch} ${x - cw},${y - h + ch}`;
    const sol = `${x - cw},${y - h + ch} ${x},${y - h + 2 * ch} ${x},${y + 2 * ch} ${x - cw},${y + ch}`;
    const sag = `${x + cw},${y - h + ch} ${x},${y - h + 2 * ch} ${x},${y + 2 * ch} ${x + cw},${y + ch}`;
    return `<g class="pm-rs-kutu" data-act="rs-tez" data-v="${esc(m)}" data-dur="${dur}" ${sec ? 'data-secili' : ''} ${U.rsTez === m ? 'data-tez' : ''} ${fark ? 'data-fark' : ''}><polygon points="${sol}" class="pm-rs-y1"></polygon><polygon points="${sag}" class="pm-rs-y2"></polygon><polygon points="${ust}" class="pm-rs-y0"></polygon><text x="${x}" y="${y - h + ch + 4}" text-anchor="middle">${esc(m)}</text><title>${esc(m)} · ${esc(fmtDT(S.D, t))}: ${dur === 'ariza' ? 'arıza ya da bakım' : cal ? `çalışıyor (${esc(cal.id)})` : 'boşta'} · sonraki 24 saatte ${sayi(Y[m] || 0, 1)} sa iş${fark ? ` (önce ${sayi(YR[m] || 0, 1)} sa)` : ''}</title></g>`;
  }).join('');
  const sat = Math.ceil(n / kol); const H = oy + (kol + sat) * ch + 40;
  return `<svg class="pm-rs-3b" viewBox="0 0 320 ${Math.max(180, H)}" role="img" aria-label="Atölye: kutunun yüksekliği sonraki 24 saatteki iş, rengi o anki durum">${svg}</svg><p class="pm-rs-not"><i class="pm-rs-l" data-dur="calisiyor"></i>çalışıyor <i class="pm-rs-l" data-dur="bos"></i>boşta <i class="pm-rs-l" data-dur="ariza"></i>arıza · yükseklik: sonraki 24 sa iş</p>`;
}
const RS_MINI = { kuyruk: rsKuyrukMini, ag: rsAgMini, matris: rsMatrisMini, '3b': rs3BMini };

/* ---------- üst şerit ve değişim akışı ---------- */
function rsFarkOzet(p, ref) {
  if (!ref) return '';
  const deg = rsDegisenler(p, ref.p); const ev = RS.on && V20E.son ? V20E.son.wT : p.ozet ? p.ozet.wT : null; const ev0 = ref.p.ozet ? ref.p.ozet.wT : null;
  const tz = new Set([...deg].map(id => p.ops[id].m)); const sp = new Set([...deg].map(id => p.ops[id].job));
  return `<p class="pm-rs-fark" role="status">${ic('eye', 'k')}<span>${esc(ref.ad)} ile: <b>${deg.size}</b> iş yer değişti, <b>${tz.size}</b> tezgâh, <b>${sp.size}</b> sipariş${ev != null && ev0 != null ? ` · gecikme <span class="mono">${saat(ev0)} → ${saat(ev)}</span>` : ''}</span></p>`;
}
function rsAkis() {
  const a = U.taslak ? U.taslak.adimlar : []; if (!a.length) return '<p class="pm-kucuk">Değişiklik yok. Herhangi bir görünümde yaptığınız değişiklik burada satır olur; satıra tıklayınca bütün görünümler o değişikliği işaretler.</p>';
  return `<ol class="pm-rs-akis-l">${a.map((x, i) => { const son = i + 1 < a.length ? a[i + 1].once.plan : S.plan; const d = rsDegisenler(son, x.once.plan);
    return `<li><button type="button" data-act="rs-adim" data-v="${i}" aria-pressed="${U.rsFark && U.rsAdim === i}"><b class="mono">${i + 1}</b><span>${esc(x.ad)}</span><small class="mono">${d.size} iş · gecikme ${fark(x.o1.wT, x.o0.wT) || 'aynı'}</small></button></li>`; }).reverse().slice(0, 6).join('')}</ol>`;
}

function sResim(p) {
  const t = rsT(); const now = rsSimdi(); const ana = U.rsAna || 'gun'; const sj = rsSecJob(p); const ref = rsRef();
  if (ana === 'gun') { const g = Math.max(0, Math.floor(t / 24) - Math.floor(now / 24)); if (U.agGun !== g) U.agGun = g; }
  const sekme = U.rsSekme || 'ana';
  const anaHtml = ana === 'gun' ? `<div class="pm-rs-gun">${sGunYuzey()}</div>` : ana === 'zaman' ? `${zamanAraclari()}${gantt(p)}` : ana === 'kuyruk' ? sKanban() : sMatris();
  const mini = RS_PANEL.map(([k, ad, sm]) => `<section class="pm-rs-p" data-p="${k}" ${sekme === k ? 'data-etkin' : ''} aria-label="${ad}"><header>${ic(sm, 'k')}<b>${ad}</b><span class="pm-sira-ara"></span>${k === 'ag' || k === '3b' ? dugme('', 'rs-buyut', { kucuk: true, hayalet: true, simge: 'expand', ad: `${ad} merceğinde aç`, veri: `data-v="${k}"` }) : dugme('', 'rs-ana', { kucuk: true, hayalet: true, simge: 'expand', ad: `${ad} büyük görünümde`, veri: `data-v="${k}"` })}</header><div class="pm-rs-pg" data-mini="${k}">${RS_MINI[k](RS.on || p, ref && ref.p, sj, t)}</div></section>`).join('');
  const anaSec = [['gun', 'Gün', 'gantt'], ['zaman', 'Zaman', 'clock'], ['kuyruk', 'Kuyruk', 'sort'], ['matris', 'Matris', 'grid']].map(([id, ad, sm]) => `<button type="button" data-act="rs-ana" data-v="${id}" aria-pressed="${ana === id}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('');
  const sekmeler = [['ana', 'Büyük', 'expand'], ...RS_PANEL].map(([id, ad, sm]) => `<button type="button" role="tab" data-act="rs-sekme" data-v="${id}" aria-selected="${sekme === id}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('');
  const sjAd = sj ? (S.D.siparisler.find(s => s.id === sj) || {}).ad || '' : '';
  return `<div class="pm-rs" data-sekme="${sekme}">
    <header class="pm-rs-ust">
      <div class="pm-rs-secim">${sj ? `<span class="pm-rs-cip" style="--c:${durumRenk(sj)}"><i></i><b class="mono">${esc(sj)}</b><small>${esc(sjAd)}</small>${dugme('', 'rs-temizle', { kucuk: true, hayalet: true, simge: 'x', ad: 'Seçimi kaldır' })}</span>` : '<span class="pm-kucuk">Bir işe ya da tezgâha tıklayın; bütün görünümler onu gösterir.</span>'}${U.rsTez ? `<span class="pm-rs-cip"><b class="mono">${esc(U.rsTez)}</b>${dugme('', 'rs-tez', { kucuk: true, hayalet: true, simge: 'x', ad: 'Tezgâh seçimini kaldır', veri: `data-v="${esc(U.rsTez)}"` })}</span>` : ''}</div>
      <label class="pm-rs-zaman"><span>${ic('clock', 'k')}<b class="mono" id="rs-zaman-etiket">${esc(fmtDT(S.D, t))}</b></span><input type="range" min="${now}" max="${atPenB()}" step="0.25" value="${t}" data-rs-zaman aria-label="Zaman imleci"></label>
      ${dugme('Şimdi', 'rs-simdi', { kucuk: true, hayalet: true, simge: 'first' })}
      <button type="button" class="tc-dugme tc-dugme-kucuk" data-act="rs-fark" aria-pressed="${!!U.rsFark}">${ic('eye', 'k')}<span>Fark</span></button>
      <div class="pm-seg pm-rs-anasec" role="group" aria-label="Büyük görünüm">${anaSec}</div>
    </header>
    <div class="pm-rs-sekmeler pm-seg" role="tablist" aria-label="Görünüm">${sekmeler}</div>
    <div id="rs-fark-yer">${rsFarkOzet(RS.on || p, ref)}</div>
    <div class="pm-rs-izgara">
      <section class="pm-rs-ana" ${sekme === 'ana' ? 'data-etkin' : ''} data-ana="${ana}" aria-label="Büyük görünüm">${anaHtml}</section>
      <div class="pm-rs-miniler">${mini}</div>
      <section class="pm-rs-akis" aria-label="Değişim akışı"><header>${ic('layers', 'k')}<b>Değişim akışı</b></header>${rsAkis()}</section>
    </div></div>`;
}
/* sürüklerken ya da zaman imleci kayarken yalnız küçük görünümler yenilenir; büyük görünüm ve sürükleme bozulmaz */
function rsMiniYenile() {
  if (!document.querySelector('.pm-rs')) return;
  const p = rsGoster(); const ref = rsRef();
  document.querySelectorAll('.pm-rs [data-mini]').forEach(el => { el.innerHTML = RS_MINI[el.dataset.mini](p, ref && ref.p, rsSecJob(gosterilen()), rsT()); });
  const f = document.getElementById('rs-fark-yer'); if (f) f.innerHTML = rsFarkOzet(p, ref);
  rsImlecCiz();
}
function rsOnizle(p) { if (!document.querySelector('.pm-rs')) { RS.on = null; return; } RS.on = p || null; rsMiniYenile(); }
function rsImlecCiz() {
  const y = document.querySelector('.pm-rs-ana .pm-gy'); if (!y) return;
  const a = rsD0() + gyGun() * 24; const t = rsT(); const x = (t - a) / 24 * 100;
  y.querySelectorAll('.pm-rs-imlec').forEach(e => e.remove());
  if (x < 0 || x > 100) return;
  y.querySelectorAll('.pm-gy-cizgi').forEach(c => { const i = document.createElement('i'); i.className = 'pm-rs-imlec'; i.style.left = x.toFixed(3) + '%'; c.appendChild(i); });
}
document.addEventListener('input', e => {
  const el = e.target.closest && e.target.closest('[data-rs-zaman]'); if (!el) return;
  U.rsT = +el.value; const et = document.getElementById('rs-zaman-etiket'); if (et) et.textContent = fmtDT(S.D, U.rsT);
  if (RS.raf) return;
  RS.raf = requestAnimationFrame(() => { RS.raf = null;
    const g = Math.max(0, Math.floor(U.rsT / 24) - Math.floor(rsSimdi() / 24));
    if ((U.rsAna || 'gun') === 'gun' && g !== gyGun()) { render(); const r = document.querySelector('[data-rs-zaman]'); if (r) r.focus(); } else rsMiniYenile(); });
});

const rsTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'rs-op': { const r = S.plan.ops[v]; if (!r) return true; U.gySec = v; U.gyCoklu = []; U.secJob = r.job; U.rsT = Math.max(rsSimdi(), Math.min(atPenB(), r.S)); render(); return true; }
    case 'rs-tez': U.rsTez = U.rsTez === v ? null : v; render(); if (U.rsTez) { const s = document.querySelector(`.pm-rs-ana .pm-gy-satir[data-m="${CSS.escape(v)}"]`); if (s) s.scrollIntoView({ block: 'nearest' }); } return true;
    case 'rs-gun': U.rsT = rsD0() + (+v) * 24 + Math.max(0, (U.rsT || rsSimdi()) - Math.floor((U.rsT || rsSimdi()) / 24) * 24); if (U.rsT < rsSimdi()) U.rsT = rsSimdi(); render(); return true;
    case 'rs-ana': U.rsAna = v; U.rsSekme = 'ana'; render(); return true;
    case 'rs-buyut': mercekSec(v); return true;
    case 'rs-sekme': U.rsSekme = v; render(); return true;
    case 'rs-fark': U.rsFark = !U.rsFark; if (!U.rsFark) U.rsAdim = null; render(); return true;
    case 'rs-adim': { const i = +v; if (U.rsFark && U.rsAdim === i) { U.rsFark = false; U.rsAdim = null; } else { U.rsFark = true; U.rsAdim = i; } render(); return true; }
    case 'rs-simdi': U.rsT = rsSimdi(); render(); return true;
    case 'rs-temizle': U.gySec = null; U.secJob = null; U.gyCoklu = []; render(); return true;
  }
  return rsTekEski(act, v, el, e);
};
const rsRenderEski = render;
render = function () {
  rsRenderEski();
  if (document.querySelector('.pm-rs')) {
    if (typeof gyBagla === 'function') gyBagla();
    rsImlecCiz();
    if (U.rsTez) document.querySelectorAll('.pm-rs-ana .pm-gy-satir').forEach(s => s.toggleAttribute('data-rs-tez', s.dataset.m === U.rsTez));
  } else RS.on = null;
};
