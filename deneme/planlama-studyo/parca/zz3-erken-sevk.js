/* ---------- Erken sevk kabul eden sipariş (değerlendirme 16:55, 1D) ----------
   Vade varsayılan olarak terminde başlar (16:50, 3 b). Erken sevki kabul eden müşterinin siparişinde vade üretim bitince başlar:
   erken biten işin parası erken gelir. Bayrak sipariştedir; varsayılan hayır. */
wipHesap = function wipHesap(plan, st, cx) {
  const P = st.wipP; const out = { tl: 0, fin: 0, alan: 0, ell: 0, risk: 0, tah: 0, saat: 0, J: {} }; if (!P) return out;
  const by = {}; for (const id in plan.ops) { const r = plan.ops[id]; (by[r.job] = by[r.job] || []).push(r); }
  const U0 = Object.fromEntries((st.D.urunler || []).map(u => [u.id, u]));
  for (const j in by) {
    const job = cx.jobs[j]; if (!job) continue; const u = U0[job.urun] || {};
    const pa = Math.ceil(job.adet / (+u.paletAdet || P.paletAdet)); const m2 = +(u.paletM2 ?? P.paletM2); const ts = +(u.tasimaSa ?? P.tasimaSa);
    const mr = cx.mat.res[j]; const mal = mr && mr.fiyat != null ? mr.fiyat : 0;
    const l = by[j].map(r => { let c = 0; if (r.fas) c = r.cost || 0; else { const M = cx.M[r.m]; if (M && M.ucret != null) c = r.run * (1 - (M.pay || 0)) * M.ucret + r.su * (M.ucret + (+cx.A.ayarciUcret || 0)); } return { r, c }; }).sort((a, b) => a.r.C - b.r.C);
    const deger = t => { let v = mal; for (const x of l) { if (x.r.C <= t + 1e-9) v += x.c; else break; } return v; };
    const z = { tl: 0, fin: 0, alan: 0, ell: 0, risk: 0, tah: 0, saat: 0, ilk: 0, ara: 0, son: 0 };
    const say = (W, V, yer) => { if (!(W > 0.25)) return; const g = W / 24;
      const fin = V * P.fin / 100 * g, risk = P.alfaAc ? V * P.alfa / 100 * g : 0, alan = P.alanAc ? pa * m2 * P.alan * g : 0, ell = P.ellAc && yer === 'ara' && W >= P.esik ? pa * ts * P.loj : 0;
      z.fin += fin; z.risk += risk; z.alan += alan; z.ell += ell; z.saat += W; z[yer] += fin + risk + alan + ell; };
    const hazir = Math.max(st.now, mr && isFinite(mr.ready) ? mr.ready : st.now);
    for (const x of l) { const o = cx.byId[x.r.id]; if (!o || x.r.done) continue;
      if (!o.pr.length) { if (mal > 0) say(x.r.S - hazir, mal, 'ilk'); continue; }
      let cp = -Infinity; for (const [p] of o.pr) { const q = plan.ops[p]; if (q) cp = Math.max(cp, q.C); } if (!isFinite(cp)) continue;
      say(x.r.S - Math.max(cp, st.now), deger(cp), 'ara'); }
    /* vade üretim bitince başlıyorsa erken biten iş beklemez, parası erken gelir: termine kalan gün kadar tahsilat finansmanı kazanılır.
       Geç biten işin geç tahsilatı gecikme bedelinin finansman payındadır, burada ikinci kez sayılmaz. */
    if (job.due != null && l.length === job.ops.length) { const C = l[l.length - 1].r.C;
      const vb = P.erken && P.erken[j] ? 'bitis' : P.vadeBas;
      if (vb === 'termin') say(job.due - Math.max(C, st.now), deger(C), 'son');
      else if (job.gelir != null && job.due > C + 0.25) z.tah = -(+job.gelir) * P.fin / 100 * (job.due - Math.max(C, st.now)) / 24; }
    z.tl = z.fin + z.risk + z.alan + z.ell + z.tah; out.J[j] = z; for (const k of ['tl', 'fin', 'alan', 'ell', 'risk', 'tah', 'saat']) out[k] += z[k];
  }
  return out;
};
{ const esSt = stOf; stOf = function (ek, gevset) { const st = esSt(ek, gevset); if (st.wipP) { const e = {}; for (const s of st.D.siparisler) if (s.erkenSevk) e[s.id] = 1; st.wipP.erken = e; } return st; }; }
{ const yb0 = ymBeklemeKart; ymBeklemeKart = function () {
  const D = S.D; const fg = agFiyatGorur(); const l = D.siparisler.filter(s => !s.havuz);
  const sat = s => `<label class="pm-es-sip"><input type="checkbox" data-chg="es-sip" data-v="${esc(s.id)}" ${s.erkenSevk ? 'checked' : ''} ${fg ? '' : 'disabled'}><span class="mono">${esc(s.id)}</span></label>`;
  return yb0() + kart(`${ic('truck', 'k')} Erken sevk kabul eden siparişler`, `<p class="pm-kucuk">İşaretli siparişte müşteri malı termin öncesi alır ve fatura teslimde başlar: erken biten işin ödemesi erken gelir. İşaretsizde vade terminde başlar. Varsayılan işaretsiz.</p>
    <div class="pm-es-liste">${l.map(sat).join('')}</div>`);
}; }
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || el.dataset.chg !== 'es-sip') return;
  if (!agFiyatGorur()) { bildir('Bu alanı müdür ya da yönetici değiştirir.', 'hata'); render(); return; }
  const s = S.D.siparisler.find(x => x.id === el.dataset.v); if (!s) return; const v = !!el.checked;
  degistir('Erken sevk değişti', `${s.id}: ${s.erkenSevk ? 'evet' : 'hayır'} → ${v ? 'evet' : 'hayır'}`, () => { s.erkenSevk = v; }, 'plan.kilitle');
});
