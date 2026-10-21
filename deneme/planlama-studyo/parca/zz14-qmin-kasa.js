/* ---------- En küçük parti (Qmin) ve kasa katı (parti bölme planı adım 2) ----------
   Qmin bölünen adımda: max(adımın elle girilen en küçük partisi, ayarın iki katı kuralı). Ayarın iki katı: partinin çalışma süresi
   ayarın en az iki katı olmalı; adımın seçili tezgâhlarının en büyüğü alınır, çünkü parti hangi tezgâha düşerse düşsün kuralı sağlamalı.
   Kasa: adımın kasası, yoksa ürünün kasası, yoksa 1. Son parti dışındaki partiler kasanın katıdır, kalan son partiye gider.
   Son parti Qmin'in altında kalırsa önceki partilerden sondan başa birer kasa aktarılır; yine olmuyorsa o parti sayısı geçersizdir.
   Elle bölme, 1-20 taraması ve otomatik bölme aynı kurala uyar. */
function pqQminOran(o) {
  if (!o || o.fason) return 1;
  let q = 1; for (const t of o.tezgahlar || []) { const c = +t.cevrim, a = +t.ayar; if (c > 0 && a > 0) q = Math.max(q, Math.ceil(2 * a / c)); }
  return q;
}
function pqAdim(jid, k) {
  const s = S.D.siparisler.find(x => x.id === jid); const u = s && S.D.urunler.find(z => z.id === s.urun);
  return { u, o: u && (u.rota.find(x => x.k === k) || u.rota[0]) };
}
function pqQmin(jid, k) { const { o } = pqAdim(jid, k); return o ? Math.max(+o.minParti || 1, pqQminOran(o)) : 1; }
function pqKasa(jid, k) { const { u, o } = pqAdim(jid, k); return Math.max(1, Math.round(+(o && o.kasa) || +(u && u.kasa) || 1)); }
/* boyutları kasaya yuvarlar ve son partiyi Qmin'e tamamlar; olmuyorsa null */
function pqYuvarla(boy, kasa, qmin) {
  const top = boy.reduce((a, x) => a + x, 0), n = boy.length; if (n < 2) return boy.slice();
  const p = boy.slice(0, -1).map(x => kasa > 1 ? Math.max(kasa, Math.round(x / kasa) * kasa) : Math.max(1, Math.round(x)));
  let son = top - p.reduce((a, x) => a + x, 0);
  const alt = Math.max(qmin, kasa);
  for (let tur = 0; son < qmin && tur < 1000; tur++) { let ok = false;
    for (let i = p.length - 1; i >= 0 && son < qmin; i--) if (p[i] - kasa >= alt) { p[i] -= kasa; son += kasa; ok = true; }
    if (!ok) break; }
  const out = [...p, son];
  return out.every(x => x >= qmin && x >= 1) && son >= 1 ? out : null;
}
const pqBol = (adet, n, kasa, qmin) => pqYuvarla(ebEsit(adet, n), kasa, qmin);
function pqDenetle(adetler, kasa, qmin) {
  for (let i = 0; i < adetler.length; i++) {
    if (adetler[i] < qmin) return `${i + 1}. parti ${adetler[i]} adet; bu adımda en küçük parti ${qmin}.`;
    if (kasa > 1 && i < adetler.length - 1 && adetler[i] % kasa) return `${i + 1}. parti ${adetler[i]} adet; kasa ${kasa} adedin katı olmalı (son parti hariç).`; }
  return '';
}
const pqAdimK = j => { const d = typeof darbogazAdimi === 'function' && darbogazAdimi(j); if (d) return d.o.id.slice(d.o.id.lastIndexOf('.') + 1); const { o } = pqAdim(j, null); return o ? o.k : null; };

/* elle bölme: eşit dağıtım kasaya göre yapılır, kurala uymayan partiler formda gösterilir ve bölme yapılmaz */
{ const eskiDurum = ebDurum;
  ebDurum = function (j) { const d = eskiDurum(j); if (!d) return d;
    if (d.adetler.join() === ebEsit(d.adet, d.n).join()) { const k = pqAdimK(j); const y = pqBol(d.adet, d.n, pqKasa(j, k), pqQmin(j, k)); if (y) d.adetler = y; }
    return d; };
  const eskiForm = ebFormHtml;
  ebFormHtml = function (jSabit, yer) { let h = eskiForm(jSabit, yer); const d = U.eb; const j = jSabit || (d && d.j); if (!d || !j || d.j !== j) return h;
    const k = pqAdimK(j), q = pqQmin(j, k), ks = pqKasa(j, k); const top = d.adetler.reduce((a, x) => a + x, 0);
    const bilgi = `<p class="pm-kucuk">${ic('ruler', 'k')} ${esc(k || '')} adımında en küçük parti ${q} adet${ks > 1 ? `, kasa ${ks} adet` : ''}.</p>`;
    const hata = top === d.adet ? pqDenetle(d.adetler, ks, q) : '';
    h = h.replace('<div class="pm-dugmeler">', `${bilgi}${hata && !/role="alert"/.test(h) ? `<p class="pm-ag-uyari" role="alert">${ic('alert', 'k')} ${esc(hata)}</p>` : ''}<div class="pm-dugmeler">`);
    if (hata) h = h.replace('<button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil" ', '<button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil" disabled ');
    return h; };
  const eskiBol = ebBol;
  ebBol = function (j) { const d = ebDurum(j); if (d) { const k = pqAdimK(j); const hata = pqDenetle(d.adetler, pqKasa(j, k), pqQmin(j, k)); if (hata) { bildir(hata, 'hata'); return; } } return eskiBol(j); };
}
/* tarama: kurala uymayan parti sayıları denenmez, partiler kasaya göre */
{ const eskiAday = btAdaylar;
  btAdaylar = function (k) { return eskiAday(k).map(o => { if (!o.k) return o; const ks = pqKasa(o.j, o.k), q = pqQmin(o.j, o.k);
    return { ...o, l: o.l.filter(x => x.n === 1 || pqBol(o.s.adet, x.n, ks, q)) }; }); };
  btParcalar = function (o, sec) { const boy = (o.k && pqBol(o.s.adet, sec.n, pqKasa(o.j, o.k), pqQmin(o.j, o.k))) || ebEsit(o.s.adet, sec.n);
    return boy.map((n, i) => ({ n, m: sec.dag === 'dag' && o.tez.length > 1 && i % o.tez.length ? o.tez[i % o.tez.length] : null })); };
}
/* otomatik bölme: çeşitlerin partileri kasaya yuvarlanır, Qmin'i sağlamayan çeşit denenmez */
{ const eskiCesit = bolmeCesitleri;
  bolmeCesitleri = function (jid) { return eskiCesit(jid).map(x => { const k = x.op.slice(x.op.lastIndexOf('.') + 1);
      const y = pqYuvarla(x.parcalar.map(p => p.n), pqKasa(jid, k), pqQmin(jid, k)); if (!y) return null;
      if (y.join() === x.parcalar.map(p => p.n).join()) return x;
      const kuy = x.ad.slice(0, jid.length), ad = x.ad.slice(jid.length).replace(/\(\d+( \+ \d+)+\)/, `(${y.join(' + ')})`).replace(/(\d+) adet önce, kalan (\d+)/, `${y[0]} adet önce, kalan ${y[1]}`);
      return { ...x, parcalar: x.parcalar.map((p, i) => ({ ...p, n: y[i] })), ad: kuy + ad }; }).filter(Boolean); };
}
