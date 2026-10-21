/* ---------- Plan nabzı ----------
   Her sayfanın en üstünde planın sağlığı: altı gösterge, her birinin plan sürümleri boyunca küçük eğrisi ve seçilen referansa göre farkı.
   Referans canlı plan, bir önceki sürüm ya da kullanıcının sabitlediği andır. Önizleme açıkken gösterge önce ve sonra değerini verir. */
const NB_GOSTERGE = [
  ['zam', 'Zamanında', 'check', v => v == null ? '—' : `%${Math.round(v)}`, false, 'siparisler', 'Termininden önce biten siparişlerin payı.'],
  ['late', 'Geç sipariş', 'alert', v => v == null ? '—' : String(v), true, 'siparisler', 'Termininden sonra biten sipariş sayısı.'],
  ['wT', 'Gecikme', 'clock', v => saat(v), true, 'tahta', 'Önceliğe göre ağırlıklı toplam gecikme (saat).'],
  ['dar', 'Darboğaz', 'gauge', v => v == null ? '—' : `%${Math.round(v)}`, true, 'tezgahlar', 'En dolu tezgâhın doluluğu; %95 üstü sıkışma demektir.'],
  ['suH', 'Ayar', 'wrench', v => saat(v), true, 'ayar', 'Planın toplam ayar süresi.'],
  ['deg', 'Değişen iş', 'rotate', v => v == null ? '—' : String(v), true, 'senaryolar', 'Referansa göre tezgâhı ya da 8 saatten çok yeri değişen iş.'],
];
const NB_FARK_ESIK = { zam: 0.5, late: 0.5, wT: 0.05, dar: 0.5, suH: 0.05, deg: 0.5 };
function nbOlc(p) {
  if (!p || !p.ozet) return null; const o = p.ozet;
  const u = Object.entries(p.util || {}).filter(([m, x]) => m[0] !== '@' && x && isFinite(x.u)).map(([, x]) => x.u);
  return { zam: o.n ? (o.n - o.late) / o.n * 100 : null, late: o.late, wT: o.wT, dar: u.length ? Math.max(...u) * 100 : null, suH: o.suH, cmax: o.Cmax };
}
function nbOpsKisa(ops) { const k = {}; for (const id in ops) { const r = ops[id]; if (isFinite(r.S)) k[id] = [r.m, Math.round(r.S * 4) / 4]; } return k; }
function nbDegisen(ops, ref) {
  if (!ref) return null; let n = 0;
  for (const id in ops) { const r = ops[id], q = ref[id]; if (!q || !isFinite(r.S)) continue; const qm = Array.isArray(q) ? q[0] : q.m, qs = Array.isArray(q) ? q[1] : q.S; if (qm !== r.m || Math.abs(qs - r.S) > 8) n++; }
  return n;
}
/* plan her değiştiğinde tarihçeye bir satır: neyin değiştirdiği değişiklik izinin son kaydından okunur */
function nbKaydet() {
  if (!S || !S.plan) return; S.nabiz = S.nabiz || [];
  const o = nbOlc(S.plan); const imza = [o.wT, o.late, o.suH, o.cmax, S.plan.ozet.n].map(x => x == null ? '' : Math.round(x * 100)).join('|');
  const son = S.nabiz[S.nabiz.length - 1]; if (son && son.imza === imza) return;
  S.nabiz.push({ t: Date.now(), imza, ne: (S.iz && S.iz[0] && S.iz[0].ne) || 'Plan', o, ops: nbOpsKisa(S.plan.ops) });
  if (S.nabiz.length > 30) S.nabiz.shift();
  for (let i = 0; i < S.nabiz.length - 2; i++) delete S.nabiz[i].ops;
  kaydet();
}
function nbRef() {
  const canli = canliSen(); const l = S.nabiz || []; const tur = S.nbRef || (canli && canli.plan ? 'canli' : 'onceki');
  if (tur === 'canli' && canli && canli.plan) return { tur, ad: `Canlı plan (${canli.ad})`, o: nbOlc(canli.plan), ops: canli.plan.ops };
  if (tur === 'sabit' && S.nbSabit) return { tur, ad: `Referans: ${S.nbSabit.ad}`, o: S.nbSabit.o, ops: S.nbSabit.ops };
  const x = l.length >= 2 ? l[l.length - 2] : null;
  return x ? { tur: 'onceki', ad: `Önceki sürüm (${x.ne})`, o: x.o, ops: x.ops || null } : { tur: 'onceki', ad: 'Önceki sürüm yok', o: null, ops: null };
}
function nbEgri(id, simdi) {
  const l = (S.nabiz || []).map(x => x.o && x.o[id]).filter(v => v != null && isFinite(v)).slice(-20);
  if (simdi != null && isFinite(simdi)) l.push(simdi); if (l.length < 2) return '';
  const a = Math.min(...l), b = Math.max(...l); const W = 64, H = 18; const y = v => b - a < 1e-9 ? H / 2 : H - 2 - (v - a) / (b - a) * (H - 4);
  const pt = l.map((v, i) => `${(i / (l.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`);
  return `<svg class="pm-nb-egri" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pt.join(' ')}"/><circle cx="${W}" cy="${y(l[l.length - 1]).toFixed(1)}" r="2.2"/></svg>`;
}
function nbFark(id, a, b, kucukIyi) {
  if (a == null || b == null || !isFinite(a) || !isFinite(b) || Math.abs(a - b) < NB_FARK_ESIK[id]) return { ton: '', m: 'aynı' };
  const iyi = (a < b) === kucukIyi; const d = a - b;
  const m = id === 'wT' || id === 'suH' ? `${d > 0 ? '+' : '−'}${sayi(Math.abs(d), 1)} sa` : id === 'zam' || id === 'dar' ? `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d))} puan` : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d))}`;
  return { ton: iyi ? 'iyi' : 'kotu', m };
}
function nbHtml() {
  if (!S || !S.plan) return '';
  const R = nbRef(); const onz = U.hamle && !U.taslak ? U.hamle.plan : null;
  const cur = nbOlc(onz || S.plan); const once = onz ? nbOlc(S.plan) : null;
  cur.deg = nbDegisen((onz || S.plan).ops, onz ? S.plan.ops : R.ops); if (once) once.deg = 0;
  const kar = onz ? once : R.o ? { ...R.o, deg: 0 } : null;
  let iyi = 0, kotu = 0;
  const kutu = NB_GOSTERGE.map(([id, ad, sm, bic, kucukIyi, sayfa, ipucu]) => {
    const v = cur[id]; const f = kar ? nbFark(id, v, kar[id], kucukIyi) : { ton: '', m: '' }; if (f.ton === 'iyi') iyi++; if (f.ton === 'kotu') kotu++;
    const altM = onz ? `önce ${bic(once[id])} · <b>${esc(f.m)}</b>` : kar ? `<b>${esc(f.m)}</b> <span>referansa göre</span>` : '<span>referans yok</span>';
    return `<button type="button" class="pm-nb-k" data-act="git" data-v="${sayfa}" data-ton="${f.ton}" title="${esc(ad)}: ${esc(ipucu)} Dokununca ilgili sayfa açılır.">
      <span class="pm-nb-ad">${ic(sm, 'k')}${esc(ad)}</span><b class="pm-nb-d mono">${esc(bic(v))}</b>${id === 'deg' ? '' : nbEgri(id, v)}<small class="pm-nb-f">${altM}</small></button>`; }).join('');
  const ozet = onz ? `Önizleme: ${iyi} gösterge iyileşiyor, ${kotu} kötüleşiyor.` : kar ? (kotu ? `Referansa göre ${kotu} gösterge kötü, ${iyi} iyi.` : iyi ? `Referansa göre ${iyi} gösterge iyi, kötüleşen yok.` : 'Referansla aynı.') : 'Karşılaştırma için referans yok.';
  const canli = canliSen(); const l = S.nabiz || [];
  const sec = `<select class="tc-alan-kutu" data-nb-ref aria-label="Referans"><option value="canli" ${R.tur === 'canli' ? 'selected' : ''} ${canli && canli.plan ? '' : 'disabled'}>Canlı plan</option><option value="onceki" ${R.tur === 'onceki' ? 'selected' : ''}>Önceki sürüm</option><option value="sabit" ${R.tur === 'sabit' ? 'selected' : ''} ${S.nbSabit ? '' : 'disabled'}>${S.nbSabit ? 'Sabit: ' + esc(S.nbSabit.ad) : 'Sabitlenen yok'}</option></select>`;
  const kapali = U.nbKapali;
  return `<section class="pm-nb" ${kapali ? 'data-kapali' : ''} ${onz ? 'data-onizleme' : ''} aria-label="Plan nabzı">
    <div class="pm-nb-bas"><button type="button" class="pm-nb-baslik" data-act="nb-kapa" aria-expanded="${!kapali}" title="${kapali ? 'Göstergeleri aç' : 'Göstergeleri gizle'}">${ic(kapali ? 'chev-right' : 'down', 'k')}<b>Plan nabzı</b></button>
      <span class="pm-nb-ozet" data-ton="${onz ? 'onz' : kotu ? 'kotu' : iyi ? 'iyi' : ''}">${esc(ozet)}</span>
      ${kapali ? '' : `<span class="pm-nb-ref"><span class="pm-nb-ref-ad" title="${esc(R.ad)}">${l.length} sürüm · ${esc(R.ad)}</span>${sec}${dugme('', 'nb-sabitle', { kucuk: true, hayalet: true, simge: 'flag', ad: 'Şu anki planı referans al' })}</span>`}</div>
    ${kapali ? '' : `<div class="pm-nb-l">${kutu}</div>`}</section>`;
}
const nbUstEski = ustCubuk;
ustCubuk = function (u) { return nbUstEski(u) + nbHtml(); };
const nbRenderEski = render;
render = function () {
  const once = (S && S.nabiz || []).length; try { nbKaydet(); } catch (e) { /* tarihçe yazılamazsa şerit yine çizilir */ }
  nbRenderEski();
  /* plan çizim sırasında değişmiş olabilir (taslak adımı); tarihçe ve şerit hemen yenilenir */
  const l0 = (S && S.nabiz || []).length; try { nbKaydet(); } catch (e) { /* yok */ }
  if ((S.nabiz || []).length !== l0 || l0 !== once) { const n = document.querySelector('.pm-nb'); if (n) n.outerHTML = nbHtml(); }
};
/* telefonda üst çubuk zaten iki satır; şerit kapalı başlar, tek satırlık özet görünür */
try { const x = localStorage.getItem(ANAHTAR + '-nb'); U.nbKapali = x == null ? innerWidth < 600 : x === '0'; } catch (e) { U.nbKapali = innerWidth < 600; }
const nbTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'nb-kapa': U.nbKapali = !U.nbKapali; try { localStorage.setItem(ANAHTAR + '-nb', U.nbKapali ? '0' : '1'); } catch (er) { /* yok */ } render(); return true;
    case 'nb-sabitle': {
      if (!S.plan) return true; const d = new Date(); const ad = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      S.nbSabit = { ad, o: nbOlc(S.plan), ops: nbOpsKisa(S.plan.ops), J: nbJKisa(S.plan.J) }; S.nbRef = 'sabit'; kaydet(); bildir(`Şu anki plan referans alındı (${ad}). Değişiklikler buna göre ölçülür.`); render(); return true; }
  }
  return nbTekEski(act, v, el, e);
};
document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-nb-ref]'); if (s) { S.nbRef = s.value; kaydet(); render(); } });
