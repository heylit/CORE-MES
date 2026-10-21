/* ---------- Canlı plan Reçete ve Rota kaydında ----------
   Canlıya alınan planın yerleşimi kaydın tmiCanli alanına yazılır: "emir no|OP no" -> [{makineId, baslangic}]. Çerçeve bunu sunucu
   yerleşimiyle (220 a) aynı yoldan okur: iş o makinede o saatte başlar, dondurulmuş ya da elle sıralanmış sayılmaz; bu yüzden st.qorder
   ve st.assign'a yazılmaz (ikisi çerçevede planlamacının elle müdahalesidir). Fason adım atölyede yerleşmez, yazılmaz.
   Motor saatleri başlangıç gününe göre duvar saatidir; çerçeve yerel saat okur, ISO yerel saatten kurulur. */
function rrDuvarIso(D, t) {
  const u = new Date(baseMs(D) + t * 3600000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()).toISOString();
}
function rrCanliYerlesim(sen, st) {
  const P = sen && sen.plan, D = sen && sen.D; if (!P || !P.ops || !D || !D.meta) return null;
  const y = {};
  for (const r of Object.values(P.ops)) {
    if (!r || !r.m || String(r.m).startsWith('@') || !isFinite(r.S)) continue;
    const id = String(r.id), i = id.lastIndexOf('.'); if (i < 0) continue;
    const k = id.slice(i + 1), o = (st.orders || []).find(x => x.id === r.job); if (!o) continue;
    const s = ((st.routes[o.itemId] || {}).steps || []).find(x => x.plan && String(x.plan.k) === k); if (!s) continue;
    y[`${o.no}|${s.opNo > 0 ? s.opNo : s.seq}`] = [{ makineId: r.m, baslangic: rrDuvarIso(D, r.S) }];
  }
  return y;
}
const rrCanliAnahtar = () => S && S.canli ? S.canli + '#' + S.canliSurum : '';
function rrCanliEsitle() {
  if (!S || RRV.yaziyor || S.rrSavedAt == null) return;
  const an = rrCanliAnahtar(); if (RRV.canliS === S && RRV.canliK === an) return;
  const st = rrOku(); if (!st) return;
  RRV.canliS = S; RRV.canliK = an;
  const var0 = st.tmiCanli ? st.tmiCanli.id + '#' + st.tmiCanli.surum : '';
  if (var0 === an) return;
  const sen = an ? S.senaryolar.find(x => x.id === S.canli) : null;
  if (sen) st.tmiCanli = { id: sen.id, surum: S.canliSurum, ad: sen.ad, kim: sen.canliKim || '', zaman: sen.canliZaman || Date.now(), yerlesim: rrCanliYerlesim(sen, st) || {} };
  else delete st.tmiCanli;
  RRV.yaziyor = true; try { rrYaz(st); } finally { RRV.yaziyor = false; }
}
{ const k0 = kaydet; kaydet = function () { const x = k0.apply(this, arguments); try { rrCanliEsitle(); } catch (e) { console.error(e); } return x; }; }
