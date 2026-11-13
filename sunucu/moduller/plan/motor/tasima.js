// @ts-check
/* ---------- Elle taşımanın takvimi (2790 a, 2794) ----------
   Taşıma kuralı (tasima-kurallar.ts) saftır; tezgâhın takvimini motorun kendi derlemesinden alır, böylece önizleme ve kilit motorun
   kilitYeri'nin yerleştireceği yeri gösterir (vardiya, mola, duruş, ek mesai aynı). Girdi sayfanın gördüğü birleşmiş çalışmadır, şimdi
   planın ekseninde saattir. Öncüller yalnız aynı emirdendir: başka emrin işi itilmez (2790-2 a).
   Dönen: { donuk, ufuk, tasimaSaat, onculler, opNo, emirler, yer, saatMetni, tezgahAdi }. emirler: emrin adımları rota sırasında, her birinin
   aday tezgâhları (plana almanın girdisi; planda yeri olmayan emir de derlemededir). yer(id, m, t): işin m tezgâhında t'den sonraki ilk açık anda kilitlenince
   kapladığı { S, C, lot1 }; tezgâh işe uygun değilse null, ufukta yer yoksa bitiş sonsuz. tezgahAdi(m): iletideki ad. */
function sunucuTasimaTakvimi(S, now) {
  const st = stTamKur(S);
  st.now = now;
  const cx = compile(st);
  const onculler = {}, opNo = {}, emirler = {};
  for (const o of cx.ops) {
    opNo[o.id] = String(o.k);
    (emirler[o.job] = emirler[o.job] || []).push({ id: o.id, adaylar: o.c.filter(x => !x.fas).map(x => String(x.m)), fas: o.c.length > 0 && o.c.every(x => !!x.fas) });
    onculler[o.id] = o.pr.filter(([p]) => cx.byId[p] && cx.byId[p].job === o.job).map(([p, t]) => [p, t === 'o' ? 'o' : 'b']);
  }
  const yer = (id, m, t) => {
    const o = cx.byId[id];
    if (!o) return null;
    const c = o.c.find(x => x.m === m && !x.fas), M = c && cx.M[c.m];
    if (!M) return null;
    const a = openAt(c.su > 0 || o.fai ? M.sw : M.rw, Math.max(t, now));
    const r = isFinite(a) ? kilitYeri(o, { m, S: a }, cx) : null;
    return r ? { S: r.S, C: r.C, lot1: r.lot1 } : { S: Infinity, C: Infinity, lot1: Infinity };
  };
  const ad = Object.fromEntries((cx.D.tezgahlar || []).map(x => [String(x.id), String(x.ad || x.id)]));
  return { donuk: now + (+st.w.dondurma || 0), ufuk: HDAYS * 24, tasimaSaat: +cx.A.tasimaSaat || 0, onculler, opNo, emirler, yer, saatMetni: t => fmtDT(cx.D, t), tezgahAdi: m => ad[m] || m };
}
