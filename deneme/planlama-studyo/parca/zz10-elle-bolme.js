/* ---------- Elle parti bölme: iş emri ve parti sayısı (kullanıcı 20.10 01:59) ----------
   Planlamacı bir iş emri seçer, parti sayısını (2-20) verir; partiler eşit dağıtılır, istenirse adetleri tek tek değiştirilir.
   Tezgâh: bütün partiler aynı tezgâhlarda sırayla, ya da darboğaz adımında partiler o adımı yapabilen tezgâhlara sırayla dağılır.
   Bölme diğer elle değişiklikler gibi tek adım olarak işlenir; geri al bölmeyi de geri alır. Başlamış ya da bitmiş iş emri bölünmez.
   Aynı form iki yerde: Siparişler sayfasında (iş emri seçilir) ve çizelgede seçili işin panelinde (iş emri belli). */
const EB_MAKS = 20;
U.eb = null;
function ebAdaylar() {
  if (!S.plan) return [];
  return S.D.siparisler.filter(s => !s.havuz && s.adet >= 2 && Object.values(S.plan.ops).some(r => r.job === s.id) && !basladiMi(s.id))
    .sort((a, b) => ((S.plan.J[b.id] || {}).T || 0) - ((S.plan.J[a.id] || {}).T || 0) || a.id.localeCompare(b.id, 'tr'));
}
const ebEsit = (adet, n) => Array.from({ length: n }, (_, i) => Math.floor(adet / n) + (i >= n - (adet % n) ? 1 : 0));
function ebDurum(j) {
  const s = S.D.siparisler.find(x => x.id === j); if (!s) return null;
  if (!U.eb || U.eb.j !== j || U.eb.adet !== s.adet) { const n = Math.min(2, s.adet); U.eb = { j, adet: s.adet, n, adetler: ebEsit(s.adet, n), dag: 'ayni' }; }
  return U.eb;
}
function ebFormHtml(jSabit, yer) {
  const yaz = yetkili('plan.yaz'); const l = ebAdaylar();
  if (!S.plan) return '<p class="pm-kucuk">Önce plan kurulmalı.</p>';
  const j = jSabit || (U.eb && l.some(s => s.id === U.eb.j) ? U.eb.j : l[0] && l[0].id); if (!j) return '<p class="pm-kucuk">Bölünebilecek iş emri yok: plandaki iş emirleri başlamış ya da tek adet.</p>';
  const d = ebDurum(j); const s = S.D.siparisler.find(x => x.id === j); const J = S.plan.J[j] || {};
  const dar = darbogazAdimi(j); const alt = dar ? dar.alt : [];
  const top = d.adetler.reduce((a, x) => a + x, 0); const hata = top !== s.adet ? `Partilerin toplamı ${top}, iş emri ${s.adet} adet.` : d.adetler.some(x => !(x >= 1)) ? 'Her parti en az 1 adet olmalı.' : '';
  const sec = jSabit ? `<input type="hidden" name="j" value="${esc(j)}">` : `<label class="tc-alan"><span class="tc-alan-etiket">İş emri</span><select class="tc-alan-kutu" name="j" data-chg="eb-j">${l.map(x => { const t = (S.plan.J[x.id] || {}).T || 0; return `<option value="${esc(x.id)}" ${x.id === j ? 'selected' : ''}>${esc(x.id)} · ${x.adet} adet${t > 0.05 ? ` · ${sayi(t, 1)} sa gecikme` : ''}</option>`; }).join('')}</select></label>`;
  const nSec = `<label class="tc-alan"><span class="tc-alan-etiket">Parti sayısı</span><select class="tc-alan-kutu" name="n" data-chg="eb-n">${Array.from({ length: Math.min(EB_MAKS, s.adet) - 1 }, (_, i) => i + 2).map(n => `<option value="${n}" ${n === d.n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  const partiler = `<div class="pm-eb-partiler" role="group" aria-label="Parti adetleri">${d.adetler.map((x, i) => `<label class="pm-eb-parti"><span>${i + 1}. parti${d.dag === 'dag' && dar ? ` <small class="pm-kucuk">${esc([dar.r.m, ...alt][i % (alt.length + 1)])}</small>` : ''}</span><input class="tc-alan-kutu" type="number" min="1" max="${s.adet - 1}" step="1" value="${x}" data-chg="eb-adet" data-v="${i}" aria-label="${i + 1}. parti adedi"></label>`).join('')}</div>`;
  const dagSec = dar && alt.length ? `<label class="tc-alan"><span class="tc-alan-etiket">Tezgâh</span><select class="tc-alan-kutu" name="dag" data-chg="eb-dag"><option value="ayni" ${d.dag === 'ayni' ? 'selected' : ''}>Bütün partiler aynı tezgâhlarda, sırayla</option><option value="dag" ${d.dag === 'dag' ? 'selected' : ''}>${esc(dar.o.id.split('.').pop())} adımında partiler ${esc([dar.r.m, ...alt].join(', '))} arasında dağılır</option></select></label>` : '';
  const bilgi = `<p class="pm-kucuk">${esc(s.id)}: ${s.adet} adet, termin ${esc(fmtDT(S.D, parseT(S.D, s.termin) ?? 0).slice(0, 9))}${J.T > 0.05 ? `, şimdi ${sayi(J.T, 1)} sa gecikiyor` : ', zamanında'}.${dar ? ` Darboğaz adımı ${esc(dar.o.id.split('.').pop())} (${esc(dar.r.m)}).` : ''} Partiler ${esc(s.id)}/1, /2 … adıyla ayrı iş emri olur; termin, öncelik ve malzeme oranı aynı kalır.</p>`;
  return `<form class="pm-dik pm-eb" data-form="eb-bol" data-yer="${yer}" novalidate>${sec}<div class="pm-eb-ust">${nSec}${dagSec}${dugme('Eşit dağıt', 'eb-esit', { kucuk: true, hayalet: true, simge: 'grid' })}</div>${partiler}
    ${hata ? `<p class="pm-ag-uyari" role="alert">${ic('alert', 'k')} ${esc(hata)}</p>` : ''}${jSabit ? '' : bilgi}
    <div class="pm-dugmeler"><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil" ${yaz && !hata && !calisan ? '' : 'disabled'}>${ic('ruler', 'k')}Böl</button></div></form>`;
}
function ebBol(j) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return;
  const d = ebDurum(j); const s = S.D.siparisler.find(x => x.id === j); if (!d || !s) return;
  if (basladiMi(j)) { bildir('Başlamış iş emri bu denemede bölünmez.', 'hata'); return; }
  if (d.adetler.reduce((a, x) => a + x, 0) !== s.adet || d.adetler.some(x => !(x >= 1))) { bildir('Parti adetlerinin toplamı iş emrinin adedi olmalı.', 'hata'); return; }
  const dar = darbogazAdimi(j); const op = dar ? dar.o.id : Object.keys(S.plan.ops).find(id => S.plan.ops[id].job === j);
  const tez = dar ? [dar.r.m, ...dar.alt] : [];
  const parcalar = d.adetler.map((n, i) => ({ n, m: d.dag === 'dag' && tez.length > 1 && i % tez.length ? tez[i % tez.length] : null }));
  const k = op.slice(op.lastIndexOf('.') + 1);
  const ad = `${j} ${d.n} partiye bölündü (${d.adetler.join(' + ')})${d.dag === 'dag' && tez.length > 1 ? `, ${k} adımı ${parcalar.map((x, i) => x.m || tez[0]).join('/')}` : ', aynı tezgâhlarda'}`;
  const T0 = (S.plan.J[j] || {}).T || 0;
  const h = bolmeHamleN(j, op, parcalar, ad, 500); if (!h) { bildir('Parti bölünemedi.', 'hata'); return; }
  U.hamle = h; U.eb = null; U.secJob = `${j}/1`; U.secili = null;
  bildir(`${ad}. Gecikme ${sayi(T0, 1)} sa → ${sayi(h.bolmeT, 1)} sa (en geç parti). Beğenmezseniz geri alın.`, h.bolmeT < T0 - 0.05 ? 'tamam' : 'uyari');
  render();
}
/* Siparişler sayfası: kart */
{ const ys0 = YM_GORUNUM.ysiparis; YM_GORUNUM.ysiparis = function () {
  const h = ys0.apply(this, arguments); if (!yetkili('plan.yaz')) return h;
  const k = kart(`${ic('ruler', 'k')} Partiyi böl <span class="pm-kucuk">iş emri seçin, parti sayısını verin</span>`, ebFormHtml(null, 'sayfa')) + (typeof btKart === 'function' ? btKart() : '');
  return h.replace(/(<div class="pm-ym-sayfa[^"]*">)/, `$1${k}`) === h ? k + h : h.replace(/(<div class="pm-ym-sayfa[^"]*">)/, `$1${k}`); }; }
/* çizelge paneli: eski iki partili form yerine */
{ const gy0 = gyYan; gyYan = function (p, cx, sec) {
  const h = gy0.apply(this, arguments); if (!sec) return h;
  return h.replace(/<details class="pm-gy-ac"><summary>(<svg[^]*?<\/svg>)? ?Partiyi böl<\/summary><form class="pm-dik" data-form="parti-bol"[^]*?<\/form><\/details>/, () => `<details class="pm-gy-ac" ${U.eb && U.eb.j === sec.job ? 'open' : ''}><summary>${ic('ruler', 'k')} Partiyi böl</summary>${ebFormHtml(sec.job, 'panel')}</details>`); }; }
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('eb-')) return; e.stopImmediatePropagation();
  const f = el.closest('form'); const j = f && f.elements.j ? f.elements.j.value : null;
  if (c === 'eb-j') { U.eb = null; ebDurum(el.value); render(); return; }
  const d = ebDurum(j); if (!d) return;
  if (c === 'eb-n') { d.n = Math.max(2, Math.min(EB_MAKS, d.adet, +el.value || 2)); d.adetler = ebEsit(d.adet, d.n); }
  else if (c === 'eb-dag') d.dag = el.value === 'dag' ? 'dag' : 'ayni';
  else if (c === 'eb-adet') { const i = +el.dataset.v; const v = Math.round(+el.value); if (isFinite(v)) { d.adetler[i] = v;
    /* son parti kalanı alır; kullanıcı son partiyi değiştirdiyse ilk parti dengeler */
    const son = d.n - 1; const tamamla = i === son ? 0 : son; const diger = d.adetler.reduce((a, x, k) => k === tamamla ? a : a + x, 0); if (d.adet - diger >= 1) d.adetler[tamamla] = d.adet - diger; } }
  render();
}, true);
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('form[data-form="eb-bol"]'); if (!f) return;
  e.preventDefault(); e.stopImmediatePropagation(); ebBol(f.elements.j.value);
}, true);
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'eb-esit') { const f = el.closest('form'); const d = ebDurum(f && f.elements.j.value); if (d) { d.adetler = ebEsit(d.adet, d.n); render(); } return true; }
  return te0(act, v, el, e); }; }
