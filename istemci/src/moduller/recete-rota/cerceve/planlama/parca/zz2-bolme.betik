/* ---------- Bölme senaryoları (kullanıcı 19.10 17:03) ----------
   En çok geciken siparişlerin önerilerine parti bölme seçenekleri eklenir: yarı yarıya aynı tezgâhlarda, yarı yarıya ikinci parti
   darboğaz adımında başka tezgâhta, üçte bir ile üçte iki başka tezgâhta. Motor partiyi kendiliğinden bölmez (157 b): her bölme bir
   öneridir, planlamacı kabul edince sepete düşer. Darboğaz adımı, siparişin en uzun kaynak beklemesi olan adımıdır. */
function bolmeHamle(jid, opId, a, altM) {
  const s = S.D.siparisler.find(x => x.id === jid); if (!s || !(a >= 1 && a < s.adet)) return null;
  const k = opId.slice(opId.lastIndexOf('.') + 1);
  const parca = (n, ek) => ({ ...clone(s), id: `${jid}/${ek}`, adet: n, gelir: s.gelir == null ? null : Math.round(s.gelir * n / s.adet), malzeme: (s.malzeme || []).map(x => ({ ...x })) });
  const yeni = [parca(a, 1), parca(s.adet - a, 2)]; const eski = S.D.siparisler; const once = U.hamle;
  try {
    S.D.siparisler = eski.flatMap(x => x.id === jid ? yeni : [x]);
    let st; try { st = stOf(); } finally { S.D.siparisler = eski; }
    const ops = {}; const pref = jid + '.';
    for (const [id, r] of Object.entries(S.plan.ops)) {
      if (!id.startsWith(pref)) { ops[id] = r; continue; }
      const kk = id.slice(pref.length);
      ops[`${jid}/1.${kk}`] = { ...r, id: `${jid}/1.${kk}`, job: `${jid}/1` }; ops[`${jid}/2.${kk}`] = { ...r, id: `${jid}/2.${kk}`, job: `${jid}/2`, S: r.S + 1e-3, m: altM && kk === k ? altM : r.m };
    }
    for (const id of Object.keys(st.locks)) if (id.startsWith(pref)) { const kk = id.slice(pref.length), l = st.locks[id]; delete st.locks[id]; st.locks[`${jid}/1.${kk}`] = { ...l }; st.locks[`${jid}/2.${kk}`] = { ...l }; }
    if (altM) { const r = S.plan.ops[opId]; st.locks[`${jid}/2.${k}`] = { m: altM, S: r ? r.S : st.now }; }
    const cx = compile(st);
    const p0 = lnsDecode(st, { ops, fail: S.plan.fail || [] }, [], cx, true);
    const p = kisaArama(st, cx, p0, 400);
    hamleKur(p, st, `${jid} ikiye bölündü: ${a} + ${s.adet - a}${altM ? ` · ikinci parti ${k} adımı ${altM}` : ', aynı tezgâhlarda'}`, { kaynak: 'elle' });
    const h = U.hamle; h.bolme = { eski: jid, yeni }; h.hedef = null;
    const J1 = h.plan.J[`${jid}/1`] || {}, J2 = h.plan.J[`${jid}/2`] || {};
    h.bolmeT = Math.max(J1.T || 0, J2.T || 0); h.bolmeC = Math.max(J1.C ?? 1e9, J2.C ?? 1e9);
    return h;
  } catch (e) { return null; } finally { U.hamle = once; }
}
function bolmeAdaylari(jid) {
  const s = S.D.siparisler.find(x => x.id === jid); if (!s || s.adet < 2 || !S.plan || basladiMi(jid)) return [];
  const cx = cxAl(); if (!cx || !cx.jobs[jid]) return [];
  const BEK = new Set(['tezgah', 'personel', 'yetkin', 'ayarci', 'aparat']);
  let dar = null, enW = -1;
  for (const o of cx.jobs[jid].ops) { const r = S.plan.ops[o.id]; if (!r || r.fas || r.done || r.act) continue;
    let hazir = S.plan.ops[o.id].S; if (r.why && BEK.has(r.why.t)) { let cp = -Infinity; for (const [p] of o.pr) { const q = S.plan.ops[p]; if (q) cp = Math.max(cp, q.C); } hazir = isFinite(cp) ? cp : cx.st.now; }
    const w = r.S - hazir + r.run * 0.01; if (w > enW) { enW = w; dar = { o, r }; } }
  if (!dar) return [];
  const alt = dar.o.c.filter(c => !c.fas && !c.opt && c.m !== dar.r.m).sort((x, y) => (x.run + x.su) - (y.run + y.su))[0];
  const yari = Math.floor(s.adet / 2), ucte = Math.max(1, Math.round(s.adet / 3));
  const l = [[yari, null]]; if (alt) l.push([yari, alt.m], [ucte, alt.m]);
  const c0 = S.plan.J[jid] ? (S.plan.J[jid].C ?? 1e9) : 1e9;
  return l.map(([a, m]) => bolmeHamle(jid, dar.o.id, a, m)).filter(Boolean).map(h => ({ c: h.bolmeC, h, iyi: h.bolmeC < c0 - 0.05, bolme: true }));
}
{ const oa0 = oneAlAdaylari; oneAlAdaylari = function (jid) { const l = oa0(jid); return U.bolmeOneri === false ? l : l.concat(bolmeAdaylari(jid)); }; }
/* öneri kartı bu siparişin yeni gecikmesini plan satırından okur; bölünmüş siparişte satır yoktur, iki partinin en geç olanı yazılır */
{ const py0 = v20PencereYenile; v20PencereYenile = function () {
  const O = V20.oneri; if (O) for (const x of O.liste) for (const a of x.adaylar || []) if (a.h.bolme && a.T1 == null) a.T1 = a.h.bolmeT;
  return py0.apply(this, arguments); }; }
if (KATALOG_DUZ.bolme) Object.assign(KATALOG_DUZ.bolme, { not: 'Plan partiyi kendiliğinden bölmez (157 b). İş panelinde "Partiyi böl" elle böler; Öneriler ve "Hedefe yetiştir" geciken siparişte üç bölme seçeneğini de dener (yarı yarıya, ikinci parti darboğaz adımında başka tezgâhta, üçte bir); kabul edilen sepete düşer.' });
