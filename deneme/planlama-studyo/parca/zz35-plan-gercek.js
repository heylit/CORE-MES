/* ---------- Plan ve gerçekleşen: taban plan, son canlı plan ve atölyede olan ----------
   Taban plan siparişin ilk canlıya alınan planıdır; o an siparişte taban yoksa adımlar kaydedilir ve hiç silinmez (karar 394).
   Taban ile canlı arasındaki fark planlamacının değişikliği, canlı ile gerçekleşen arasındaki fark atölyedeki sapmadır; ikisi ayrı sayılır.
   Nedenler yalnız kayıtlardan çıkar, elle değiştirilmez (karar 395): standardı %10'dan fazla aşan ayar ya da işleme süresi "Uzun ayar" ya da
   "Yavaş üretim", arıza S.down'dan, malzeme geliş saatinden, fason fason adımının gecikmesinden; açıklanmayan kalan "Geç başlama". */
const PG_ASIM = 0.1;
function tabanDondur() {
  const c = canliSen(); if (!c || !c.plan || !c.plan.ops) return 0;
  const T = S.taban = S.taban || {}; let n = 0;
  const yeni = {};
  for (const r of Object.values(c.plan.ops)) if (r.job && !T[r.job] && isFinite(r.S)) (yeni[r.job] = yeni[r.job] || {}).ops = { ...((yeni[r.job] || {}).ops || {}), [r.id]: { m: r.m, S: r.S, C: r.C } };
  for (const j in yeni) { const ops = yeni[j].ops; T[j] = { surum: c.surum || S.canliSurum || null, zaman: c.canliZaman || Date.now(), ops, C: Math.max(...Object.values(ops).map(x => x.C)) }; n++; }
  return n;
}
{ const k0 = kaydet; kaydet = function () { if (S.canli && S.canli !== U.pgCanli) { U.pgCanli = S.canli; tabanDondur(); } return k0.apply(this, arguments); }; }

const pgBitis = (p, j) => { if (!p || !p.ops) return null; let c = null; for (const r of Object.values(p.ops)) if (r.job === j && isFinite(r.C)) c = c == null ? r.C : Math.max(c, r.C); return c; };
function pgGercekBitis(j) {
  const ops = Object.values(S.plan.ops).filter(r => r.job === j); if (!ops.length) return null;
  const g = S.gercek || {}; const bitti = ops.every(r => g[r.id] && g[r.id].C != null);
  /* sayım planı oynatmaz; sürmekte olan adım sonraki adımın başlangıcını aşıyorsa aşan kısım siparişin tahmini bitişine eklenir */
  const sira = ops.slice().sort((a, b) => a.id.localeCompare(b.id, 'tr', { numeric: true })); let tas = 0;
  sira.forEach((r, i) => { const n = sira[i + 1]; if (g[r.id] && g[r.id].C == null && n && isFinite(r.C) && isFinite(n.S)) tas = Math.max(tas, r.C - n.S); });
  return { t: bitti ? Math.max(...ops.map(r => g[r.id].C)) : pgBitis(S.plan, j) + Math.max(0, tas), tahmin: !bitti, basladi: ops.some(r => g[r.id]) };
}
/* bir siparişin kayma nedenleri, saat: canlı plana göre atölyedeki sapmayı açıklar */
function pgNedenler(j) {
  const cx = cxAl(); const g = S.gercek || {}; const c = canliSen(); const cp = c && c.plan && c.plan.ops || {};
  const N = { ayar: 0, yavas: 0, ariza: 0, malzeme: 0, fason: 0, gec: 0 };
  const ops = Object.values(S.plan.ops).filter(r => r.job === j);
  for (const r of ops) {
    const o = cx.byId[r.id]; const a = g[r.id]; const q = cp[r.id];
    if (r.fas || (r.m && r.m[0] === '@')) { if (q && isFinite(q.C) && r.C - q.C > 0.01) N.fason += r.C - q.C; continue; }
    if (!a || !o) continue;
    const k = o.c.find(x => x.m === a.m) || o.c.find(x => !x.fas); const M = k && cx.M[k.m]; if (!M) continue;
    const su = k.su || 0, Su = r.Su != null ? r.Su : a.S;
    const ayar = workIn(M.sw, a.S, Su); if (su > 0 && ayar > su * (1 + PG_ASIM)) N.ayar += ayar - su;
    let ar = 0; for (const d of S.down || []) if (d.m === a.m) { const b0 = Math.max(d.from, a.S), b1 = Math.min(d.to, r.C); if (b1 > b0) ar += b1 - b0; }
    N.ariza += ar;
    const bit = a.C != null ? a.C : a.t != null ? a.t : null; const adet = a.C != null ? o.adet : a.n;
    /* takvim geçmişi kapsamıyorsa (deneme verisinde şimdiden öncesi) geçen süre saat farkından, standart ayar düşülerek alınır */
    if (bit != null && adet > 0 && k.cyc > 0) { const tk = workIn(M.rw, a.S, bit); const is = tk > 1e-6 ? workIn(M.rw, Su, bit) : Math.max(0, bit - a.S - su - ar), std = adet * k.cyc; if (is > std * (1 + PG_ASIM)) N.yavas += is - std; }
  }
  const mr = cx.mat && cx.mat.res && cx.mat.res[j]; const T = (S.taban || {})[j];
  if (mr && isFinite(mr.ready) && T) { const ilk = Math.min(...Object.values(T.ops).map(x => x.S)); if (mr.ready > ilk) N.malzeme = mr.ready - ilk; }
  const gb = pgGercekBitis(j); const cb = pgBitis(c && c.plan, j);
  const sapma = gb && gb.t != null && cb != null ? gb.t - cb : 0;
  const ac = N.ayar + N.yavas + N.ariza + N.malzeme + N.fason;
  if (sapma > 0.01 && gb.basladi) N.gec = Math.max(0, sapma - ac);
  return N;
}
const PG_NEDEN = [['fason', 'Fason gecikmesi', 'truck'], ['ayar', 'Uzun ayar', 'wrench'], ['malzeme', 'Malzeme gecikmesi', 'box'], ['yavas', 'Yavaş üretim', 'clock'], ['gec', 'Geç başlama', 'play'], ['ariza', 'Arıza', 'alert']];
function pgSatirlar() {
  const T = S.taban || {}; const c = canliSen();
  return Object.keys(T).map(j => {
    const s = S.D.siparisler.find(x => x.id === j) || {}; const gb = pgGercekBitis(j) || { t: null, tahmin: true };
    const tb = T[j].C, cb = pgBitis(c && c.plan, j), due = (cxAl().jobs[j] || {}).due;
    const fark = gb.t != null ? gb.t - tb : null;
    return { j, s, tb, cb, gb, due, fark, plan: cb != null ? cb - tb : null, N: pgNedenler(j) };
  }).sort((a, b) => Math.abs(b.fark || 0) - Math.abs(a.fark || 0));
}
const pgSa = x => x == null ? '—' : `${x > 0.05 ? '+' : x < -0.05 ? '−' : ''}${sayi(Math.abs(x), 1)} sa`;
function pgGostergeler(L) {
  const g = S.gercek || {}; const esik = sapmaEsik();
  const biten = Object.keys(g).filter(id => g[id].C != null && S.plan.ops[id] && (S.taban[S.plan.ops[id].job] || {}).ops && S.taban[S.plan.ops[id].job].ops[id]);
  const uyan = biten.filter(id => g[id].C - S.taban[S.plan.ops[id].job].ops[id].C <= esik);
  const sevk = L.filter(x => !x.gb.tahmin && x.gb.t != null); const zam = sevk.filter(x => x.due == null || x.gb.t <= x.due);
  const kay = L.filter(x => x.fark != null); const ort = kay.length ? kay.reduce((a, x) => a + x.fark, 0) / kay.length : null;
  const ilk = Math.min(...Object.values(S.taban).map(x => x.zaman)); const deg = (S.paGecmis || []).filter(x => x.zaman > ilk + 1);
  const kimler = {}; for (const x of deg) kimler[x.kim] = (kimler[x.kim] || 0) + 1;
  const kutu = (yer, ad, deger, alt) => `<div class="pm-pg-kutu" data-yer="${yer}"><span class="pm-kucuk">${ad}</span><b class="mono">${deger}</b><small class="pm-kucuk">${alt}</small></div>`;
  return `<div class="pm-pg-kutular">${kutu('uyum', 'Plana uyum', biten.length ? `%${Math.round(100 * uyan.length / biten.length)}` : '—', biten.length ? `${biten.length} biten adımın ${uyan.length}'i tabandan en çok ${saat(esik)} geç` : 'henüz biten adım yok')}
    ${kutu('sevk', 'Zamanında ve tam sevk', sevk.length ? `%${Math.round(100 * zam.length / sevk.length)}` : '—', sevk.length ? `${sevk.length} sevkin ${zam.length}'i` : 'henüz biten sipariş yok')}
    ${kutu('kayma', 'Ortalama kayma', pgSa(ort), 'bitiş, tabana göre')}
    ${kutu('degisiklik', 'Plan değişikliği', String(deg.length), deg.length ? Object.entries(kimler).map(([k, n]) => `${esc(k)} ${n}`).join(' · ') : 'taban sonrası canlıya alma yok')}</div>`;
}
function pgSerit(L) {
  const cx = cxAl(); const now = cx.st.now; const a = Math.floor(now / 24) * 24, b = a + 5 * 24; const c = canliSen(); const cp = c && c.plan && c.plan.ops || {};
  const T = S.taban || {}; const tb = {}; for (const j in T) Object.assign(tb, T[j].ops);
  const say = {}; for (const [id, x] of Object.entries(tb)) if (x.C > a && x.S < b && x.m[0] !== '@') say[x.m] = (say[x.m] || 0) + 1 + ((S.gercek || {})[id] ? 5 : 0);
  const mler = Object.entries(say).sort((x, y) => y[1] - x[1]).slice(0, 3).map(x => x[0]); if (!mler.length) return '';
  const yz = t => `${(Math.max(0, Math.min(1, (t - a) / (b - a))) * 100).toFixed(2)}%`;
  const cub = (k, S0, C0, ek = '') => C0 > a && S0 < b ? `<i class="pm-pg-c" data-k="${k}" style="--x:${yz(S0)};--w:calc(${yz(C0)} - ${yz(S0)})" ${ek}></i>` : '';
  const gunler = [0, 1, 2, 3, 4].map(i => `<span>${esc(fmtDT(S.D, a + i * 24).slice(0, 9))}</span>`).join('');
  const sat = mler.map(m => {
    const ids = Object.keys(tb).filter(id => tb[id].m === m && tb[id].C > a && tb[id].S < b);
    const is = ids.map(id => { const t0 = tb[id], q = cp[id], r = S.plan.ops[id], g = (S.gercek || {})[id];
      const fk = r && isFinite(r.C) ? r.C - t0.C : null; const k = g ? (g.C != null ? (fk > sapmaEsik() ? 'gec' : 'zaman') : 'calisiyor') : null;
      return `<div class="pm-pg-is" title="${esc(`${id} · taban ${fmtDT(S.D, t0.S)} → ${fmtDT(S.D, t0.C)}`)}">${cub('taban', t0.S, t0.C)}${q ? cub('canli', q.S, q.C) : ''}${g && r ? cub(k, g.S, g.C != null ? g.C : r.C) : ''}${g ? `<span class="pm-pg-is-ad mono" style="--x:${yz(t0.S)}">${esc(id.replace(/^SP-/, ''))} <b data-k="${k}">${pgSa(fk)}</b></span>` : ''}</div>`; }).join('');
    return `<div class="pm-pg-satir"><span class="pm-pg-m mono">${esc(m)}</span><div class="pm-pg-yol" style="--simdi:${yz(now)}">${is}</div></div>`;
  }).join('');
  return `<section class="pm-pg-blok" data-yer="pg-serit"><h4>${ic('gantt', 'k')} Tezgâhta üç çizgi <small class="pm-kucuk">${mler.map(esc).join(', ')}</small></h4>
    <div class="pm-pg-serit"><div class="pm-pg-satir pm-pg-gunler"><span></span><div class="pm-pg-gun">${gunler}</div></div>${sat}</div>
    <ul class="pm-pg-lejant"><li data-k="taban">Taban plan</li><li data-k="canli">Son canlı plan</li><li data-k="zaman">Gerçekleşen, zamanında</li><li data-k="gec">Gerçekleşen, geç</li><li data-k="calisiyor">Çalışıyor (tahmin)</li></ul>
    <p class="pm-kucuk">Rozet: bitişin taban plana göre farkı.</p></section>`;
}
function pgTablo(L) {
  const yal = U.pgSapan !== false; const l = yal ? L.filter(x => x.fark != null && Math.abs(x.fark) > sapmaEsik()) : L;
  const tt = t => t == null ? '—' : esc(fmtDT(S.D, t));
  const cip = x => { if (x.fark != null && x.fark <= sapmaEsik()) return `<span class="pm-pg-cip" data-k="uydu">${ic('check', 'k')}Plana uydu</span>`; const c = PG_NEDEN.filter(([k]) => x.N[k] > 0.05).map(([k, ad, sm]) => `<span class="pm-pg-cip" data-k="${k}">${ic(sm, 'k')}${ad} ${pgSa(x.N[k])}</span>`);
    if (x.plan != null && Math.abs(x.plan) > 0.05) c.unshift(`<span class="pm-pg-cip" data-k="plan">${ic('edit', 'k')}Plan değişikliği ${pgSa(x.plan)}</span>`);
    return c.length ? c.join('') : x.fark != null && x.fark <= sapmaEsik() ? `<span class="pm-pg-cip" data-k="uydu">${ic('check', 'k')}Plana uydu</span>` : '—'; };
  return `<section class="pm-pg-blok" data-yer="pg-tablo"><h4>${ic('list', 'k')} Sipariş bazında ${dugme(yal ? 'Hepsini göster' : 'Yalnız sapanlar', 'pg-sapan', { kucuk: true, hayalet: true, simge: 'sort' })}</h4>
    ${l.length ? `<div class="pm-pg-tablo"><table><thead><tr><th scope="col">Sipariş</th><th scope="col">Taban bitiş</th><th scope="col">Canlı bitiş</th><th scope="col">Gerçekleşen bitiş</th><th scope="col">Termin</th><th scope="col">Fark</th><th scope="col">Neden</th></tr></thead><tbody>
    ${l.map(x => `<tr data-is="${esc(x.j)}"><th scope="row"><span class="mono">${esc(x.j)}</span><small class="pm-kucuk">${esc(urunAd(x.s.urun) || '')} · ${x.s.adet || ''}</small></th><td class="mono" data-b="Taban">${tt(x.tb)}</td><td class="mono" data-b="Canlı">${tt(x.cb)}</td><td class="mono" data-b="Gerçekleşen">${tt(x.gb.t)}${x.gb.tahmin && x.gb.t != null ? ' <small class="pm-kucuk">(tahmin)</small>' : ''}</td><td class="mono" data-b="Termin">${tt(x.due)}</td><td class="mono" data-b="Fark" data-yer="fark" ${x.fark > sapmaEsik() ? 'data-gec' : ''}>${pgSa(x.fark)}</td><td><div class="pm-pg-cipler">${cip(x)}</div></td></tr>`).join('')}</tbody></table></div>` : `<p class="pm-kucuk">${yal ? 'Tabandan sapan sipariş yok.' : 'Taban planı olan sipariş yok.'}</p>`}</section>`;
}
function pgNedenOzet(L) {
  const t = {}; for (const x of L.filter(x => x.fark != null && x.fark > sapmaEsik())) for (const [k] of PG_NEDEN) if (x.N[k] > 0.05) { t[k] = t[k] || { s: 0, n: 0 }; t[k].s += x.N[k]; t[k].n++; }
  const l = PG_NEDEN.filter(([k]) => t[k]); if (!l.length) return '';
  return `<section class="pm-pg-blok" data-yer="pg-neden"><h4>${ic('chart', 'k')} Kayma nedenleri <small class="pm-kucuk">saat, canlı plana göre</small></h4><ul class="pm-pg-nedenler">${l.map(([k, ad, sm]) => `<li data-k="${k}">${ic(sm, 'k')}<span>${ad}</span><b class="mono">${pgSa(t[k].s)}</b><small class="pm-kucuk">${t[k].n} sipariş</small></li>`).join('')}</ul>
    <p class="pm-kucuk">Nedenler kendiliğinden belirlenir, elle değiştirilmez. Süre standart birim süreyi ya da ayar süresini %10'dan fazla aşarsa aşan kısım "Yavaş üretim" ya da "Uzun ayar" sayılır, kalan kayma "Geç başlama". Arıza, malzeme ve fason gecikmesi kendi kayıtlarından gelir.</p></section>`;
}
function sPlanGercek() {
  if (!S.taban || !Object.keys(S.taban).length) tabanDondur();
  const bas = `<p class="pm-kucuk pm-pg-not">${ic('help', 'k')} Taban plan siparişin ilk canlıya alınan planıdır; kendiliğinden donar, hiç değişmez. Karşılaştırma üç yönlüdür: taban plan, son canlı plan ve gerçekleşen.</p>`;
  if (!S.taban || !Object.keys(S.taban).length) return `<div class="pm-pg" data-yer="plan-gercek">${bas}<p class="pm-bos">${ic('flag', 'k')} Henüz canlıya alınmış plan yok; ilk canlıya almada her siparişin taban planı kaydedilir.</p></div>`;
  const L = pgSatirlar();
  return `<div class="pm-pg" data-yer="plan-gercek">${bas}${pgGostergeler(L)}${pgSerit(L)}${pgNedenOzet(L)}${pgTablo(L)}</div>`;
}
PS_SEK.push(['pg', 'chart', 'Plan ve gerçekleşen']);
PS_IPUCU.pg = 'Taban plan, son canlı plan ve gerçekleşeni karşılaştırın. Nedenler sayım, arıza, malzeme ve fason kayıtlarından kendiliğinden çıkar; buradan plan değişmez.';
{ const s0 = sStudyoAc; sStudyoAc = function () { if (U.sayfa === 'studyo' && U.psSek === 'pg') return sPlanGercek(); return s0.apply(this, arguments); }; }
{ const f0 = tekEylem; tekEylem = function (act) {
  if (act === 'pg-sapan') { U.pgSapan = U.pgSapan === false; render(); return true; }
  return f0.apply(this, arguments);
}; }
