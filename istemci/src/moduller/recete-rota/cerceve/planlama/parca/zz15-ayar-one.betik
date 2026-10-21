/* ---------- Ayarı parça gelmeden yapma (parti bölme planı adım 3) ----------
   Motor adımın başlangıcını ayarın başlangıcı sayar ve onu öncül adımdan parça gelince başlatır (predBound). Sahada ayar,
   tezgâh boşsa parça gelmeden yapılır. Açıkken öncülden gelen sınır ayar bitişine (işlemeye başlama) uygulanır: ayar tezgâhın
   boşaldığı andan başlayabilir, işleme parçanın geliş anından önce başlamaz. Örtüşmeli bağın bitiş koşulu (bitiş >= öncül bitişi
   + taşıma + son transfer partisi) motorda zaten var ve değişmez. Malzeme, serbest bırakma, NC programı ve kilit sınırları ayarın
   başlangıcına uygulanmaya devam eder. Kapalıyken motorun davranışı aynen kalır. */
function ayarOneKur() {
  if (self.__ayOne) return; self.__ayOne = 1;
  const eskiPB = predBound, eskiTM = tMach, eskiTF = tFason;
  /* fasonda ayar yok: gönderim parçanın gelişinden önce olamaz */
  tFason = function (o, c, cx, ctx, b) { return eskiTF(o, c, cx, ctx, b && b.gel != null ? { ...b, s: Math.max(b.s, b.gel) } : b); };
  predBound = function (o, cx, ctx) {
    const b = eskiPB(o, cx, ctx); if (!b || !cx.st.ayariOneAl || !o.pr.length) return b;
    const st = cx.st, A = cx.A, P = ctx.P, j = cx.jobs[o.job], tas = +A.tasimaSaat || 0;
    let gel = -Infinity;
    for (const [pid, ty] of o.pr) { const p = P[pid]; if (!p) return b; gel = Math.max(gel, ty === 'o' && !p.fas ? p.lot1 + tas : p.C + (p.fas ? 0 : tas)); }
    let s = st.now; if (j.rel != null && j.rel > s) s = j.rel; if (!o.program && cx.progRel > s) s = cx.progRel;
    const lk = st.locks[o.id]; if (lk && lk.S > s) s = lk.S;
    if (gel <= s + 1e-9) return b;
    return { ...b, s, gel };
  };
  tMach = function (o, c, cx, ctx, b, fast) {
    if (!b || b.gel == null) return eskiTM(o, c, cx, ctx, b, fast);
    let bb = { ...b, s: Math.max(b.s, b.gel - (c.su || 0) - (o.fai ? c.cyc || 0 : 0)) }, r = null;
    for (let i = 0; i < 12; i++) { r = eskiTM(o, c, cx, ctx, bb, fast); if (!r || r.Su >= b.gel - 1e-6) break; bb = { ...bb, s: bb.s + Math.max(b.gel - r.Su, 1e-3) }; }
    if (r && r.Su < b.gel - 1e-6) return eskiTM(o, c, cx, ctx, { ...b, s: b.gel }, fast);
    return r;
  };
}
ayarOneKur();
ISCI_EK.push(`${ayarOneKur}\nayarOneKur();`);
{ const aoSt = stOf; stOf = function (ek, gevset) { const st = aoSt(ek, gevset); st.ayariOneAl = (S.param || {}).ayariOneAl === 'acik'; return st; }; }
{ const kb = KATALOG_DUZ.bolme; if (kb && kb.p) kb.p.push(['param', 'ayariOneAl', 'Ayarı parça gelmeden yap', 'sec', [['kapali', 'Kapalı'], ['acik', 'Açık']]]); }
