/* ---------- adetle ilerleme: sayım ve plandan sapma ----------
   Uygulamadaki gibi: başlamış adımın kalanı (adım adedi − işlenen adet) × birim süredir, bitiş son sayım anından takvimle ilerler.
   Sayım yalnız o adımın kendi çubuğunu günceller; başka iş yerinden oynamaz. Tahmini bitiş plandakinden eşikten fazla saparsa
   "Plandan sapma" uyarısı çıkar; planı düzeltmek planlamacının kararıdır ("Canlıya göre onar", Sonuç kutusundan geçer). */
const sapmaEsik = () => (S.param && S.param.sapmaEsik != null ? +S.param.sapmaEsik : 0.5);
function sapmaOf(id) {
  const g = (S.gercek || {})[id]; const r = S.plan && S.plan.ops[id];
  if (!g || g.n == null || g.C != null || !r || g.planC == null) return null;
  const d = r.C - g.planC;
  const sonraki = Object.values(S.plan.ops).filter(q => q.m === r.m && q.id !== id && isFinite(q.S) && q.S >= r.S - 1e-6).sort((a, b) => a.S - b.S)[0] || null;
  return { id, d, r, sonraki, cakisma: sonraki ? r.C - sonraki.S : null };
}
const sapmalar = () => Object.keys(S.gercek || {}).map(sapmaOf).filter(x => x && Math.abs(x.d) > sapmaEsik());
function sapmaMetni(x) {
  const ne = x.d > 0 ? `${saat(x.d)} geç bitecek` : `${saat(-x.d)} erken bitecek`;
  const yan = !x.sonraki ? '' : x.cakisma > 0.01 ? `; sıradaki ${x.sonraki.id} ile ${saat(x.cakisma)} çakışıyor` : x.d < 0 ? `; ${x.r.m} sıradaki ${x.sonraki.id} öncesinde ${saat(-x.cakisma)} boş kalacak` : '';
  return `${x.id} plandan ${ne}${yan}.`;
}
function sapmaRozet() {
  const l = sapmalar(); if (!l.length) return '';
  return `<button type="button" class="pm-sapma-rozet" data-act="sapma-git" data-v="${esc(l[0].id)}" data-yer="sapma" title="${esc(l.map(sapmaMetni).join(' '))}">${ic('alert', 'k')}<span>Plandan sapma: ${l.length}</span></button>${U.hamle ? '' : dugme('Canlıya göre onar', 'sapma-onar', { kucuk: true, hayalet: true, simge: 'rotate', veri: `data-v="${esc(l[0].id)}" data-yer="sapma-onar"` })}`;
}
function sapmaKutu(id) {
  const x = sapmaOf(id); if (!x || Math.abs(x.d) <= sapmaEsik()) return '';
  return `<div class="pm-sapma" role="alert" data-yer="sapma-kutu">${ic('alert', 'k')}<span><b>Plandan sapma.</b> ${esc(sapmaMetni(x))} Plan kendiliğinden değişmez.</span>${dugme('Canlıya göre onar', 'sapma-onar', { kucuk: true, simge: 'rotate', veri: `data-v="${esc(id)}"` })}</div>`;
}
function ilerlemeCubugu(id) {
  const g = (S.gercek || {})[id]; const o = cxAl().byId[id]; if (!g || g.n == null || !o) return '';
  const A = adetEtkin(o, g); const y = A ? Math.max(0, Math.min(100, Math.round(g.n / A * 100))) : 100;
  return `<div class="pm-adet-ilerleme" data-yer="ilerleme"><span class="pm-adet-cubuk" style="--ilerleme:${y}%" aria-hidden="true"><i></i></span><span class="mono">${sayi(g.n, 0)}/${sayi(A, 0)} adet</span>${g.dus ? `<span class="pm-kucuk">önceki adımdan ${sayi(g.dus, 0)} hurda düştü</span>` : ''}<span class="pm-kucuk">son sayım ${esc(fmtDT(S.D, g.t != null ? g.t : g.S))}</span></div>`;
}
/* Sayım işlenir: gerçekleşen kaydına adet ve an yazılır, yalnız bu adımın çubuğu yeniden hesaplanır. */
/* hurda, adımı bitmiş önceki adımlardan sonraki adımların adedine düşer (karar 397); adım sırası iş içindeki kimlik sırasıdır */
function hurdaYay(g, job) {
  const ids = Object.keys(S.plan.ops).filter(x => S.plan.ops[x].job === job).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  let dus = 0;
  for (const x of ids) { const a = g[x]; if (a) { if (dus > 0) a.dus = dus; else delete a.dus; } if (a && a.C != null && a.hurda > 0) dus += a.hurda; }
}
const adetEtkin = (o, g) => Math.max(0, o.adet - ((g && g.dus) || 0));
function sayimIsle(id, bas, n, t, hurda) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return;
  const r = S.plan.ops[id]; const cx = cxAl(); const o = cx.byId[id]; if (!r || !o) return;
  const now = cx.st.now;
  const g0 = clone(S.gercek || {}); g0[id] = { ...(g0[id] || {}), m: r.m, S: bas }; hurdaYay(g0, r.job); const A = adetEtkin(o, g0[id]);
  if (!(n >= 0) || n > A) { bildir(`İşlenen adet 0 ile ${A} arasında olmalı.`, 'hata'); return; }
  if (t == null) t = now;
  if (t > now + 1e-6 || t < bas - 1e-6) { bildir('Son sayım başlamadan sonra ve şimdiden önce olmalı.', 'hata'); return; }
  const g = clone(S.gercek || {}); const eski = g[id] || {};
  g[id] = { m: r.m, S: bas, n, t, planC: eski.planC != null ? eski.planC : r.C }; if (hurda > 0) g[id].hurda = hurda; hurdaYay(g, r.job);
  const k = adetKalan(o, g[id], cx); if (!k) { bildir('Bu adımın birim süresi yok; adetle hesaplanamaz.', 'hata'); return; }
  S.gercek = g;
  S.plan = { ...S.plan, ops: { ...S.plan.ops, [id]: { ...r, S: bas, Su: k.Su, C: k.C, lot1: Math.min(k.C, Math.max(k.Su, r.lot1 || k.Su)), act: 1, pin: 1, adetN: n } } };
  ozetTazele();
  iz('Sayım işlendi', `${id}: ${n}/${adetEtkin(o, g[id])} adet, tahmini bitiş ${fmtDT(S.D, k.C)}`);
  kaydet(); render();
  const x = sapmaOf(id);
  bildir(x && Math.abs(x.d) > sapmaEsik() ? sapmaMetni(x) + ' Plan kendiliğinden değişmez.' : `${id}: ${n}/${adetEtkin(o, g[id])} adet işlendi; tahmini bitiş ${fmtDT(S.D, k.C)}.`, x && Math.abs(x.d) > sapmaEsik() ? (x.d > 0 ? 'uyari' : 'bilgi') : 'tamam');
}
/* Planlamacı isterse plan gerçekleşene göre onarılır: dondurma ve başlamış işler sabit kalır; sonuç önizlemedir, Uygula ile girer. */
function sapmaOnar(id) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return;
  try {
    const st = stOf(); st.gercek = clone(S.gercek || {}); const cx = compile(st);
    const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
    const p = kisaArama(st, cx, p0, 500);
    hamleKur(p, st, `${id} gerçekleşene göre onarıldı`, { kaynak: 'elle' }); U.hamle.gercek = S.gercek;
  } catch (e) { bildir('Onarım yapılamadı: ' + e.message, 'hata'); return; }
  render();
}
{ const f0 = tekEylem; tekEylem = function (act, v) {
  if (act === 'sapma-onar') { sapmaOnar(v); return true; }
  if (act === 'sapma-git') { if (U.sayfa === 'studyo') { U.psSek = 'plan'; U.psSec = [v]; render(); return true; } U.secili = v; render(); return true; }
  return f0.apply(this, arguments);
}; }
