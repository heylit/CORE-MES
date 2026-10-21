/* ---------- Parti taraması: 1-20 parti ve iş emirleri arası birleşimler (kullanıcı 20.10 03:58) ----------
   En çok geciken N iş emrinin her biri için seçenekler: bölünmez, 2..20 eşit parti aynı tezgâhlarda, 2..20 parti darboğaz adımında
   tezgâhlara dağıtılmış. Önce her iş emri tek başına denenir, sonra birleşimler. Birleşim sayısı sınırın altındaysa hepsi denenir;
   üstündeyse (tek tek denemenin ölçülen hızıyla hepsi BT_TAM_MS'i aşacaksa) koordinat taraması yapılır: sırayla her iş emrinin bütün seçenekleri, ötekiler o anki en iyide sabitken denenir,
   bir tur hiçbir şeyi değiştirmeyene kadar (en çok BT_TUR tur). Bu her birleşimi denemez; yerel en iyiyi bulur.
   Ölçüm aramasızdır (bugünkü sıra korunarak çözülür): aynı veride aynı sonucu verir, küçük farklar gürültüden ayrılır.
   Önizleme en iyi birleşimi kısa aramayla yeniden çözer; sonuç ölçümden biraz farklı olabilir.
   Sıralama planın amacıyla (TL toplamı); yerleşmeyen adım artan birleşim kazanamaz. Her parti ayar süresini yeniden öder. */
const BT_MAKS_IS = 10, BT_MAKS_N = 20, BT_TAM_MS = 600000, BT_TUR = 5, BT_ILK = 10;
U.bt = null; U.btK = 3;
function btAdaylar(k) {
  /* geciken mamullerin yarı mamul iş emirleri de taramaya girer: kendi gecikmeleri yoktur, montajı bekletirler */
  const l = ebAdaylar(); const kok = id => String(id).split('/')[0];
  const sec = l.filter(s => !s.ust && ((S.plan.J[s.id] || {}).T || 0) > 0.05).slice(0, k); const kokler = new Set(sec.map(s => kok(s.id)));
  const ustKok = s => { let u = s.ust; for (let i = 0; i < 6 && u; i++) { const x = S.D.siparisler.find(z => kok(z.id) === u); if (!x || !x.ust) return u; u = x.ust; } return u; };
  for (const s of l) if (s.ust && kokler.has(ustKok(s)) && sec.length < BT_MAKS_IS) sec.push(s);
  return sec.map(s => {
    const dar = darbogazAdimi(s.id); const tez = dar ? [dar.r.m, ...dar.alt] : [];
    const l = [{ n: 1, dag: 'ayni' }];
    for (let n = 2; n <= Math.min(BT_MAKS_N, s.adet); n++) { l.push({ n, dag: 'ayni' }); if (tez.length > 1) l.push({ n, dag: 'dag' }); }
    return { j: s.id, s, dar, tez, k: dar ? dar.o.id.slice(dar.o.id.lastIndexOf('.') + 1) : null, l };
  });
}
function btParcalar(o, sec) { return ebEsit(o.s.adet, sec.n).map((n, i) => ({ n, m: sec.dag === 'dag' && o.tez.length > 1 && i % o.tez.length ? o.tez[i % o.tez.length] : null })); }
/* A: adaylar, idx: her aday için seçenek sırası; ms verilirse kısa arama da yapılır */
function btKur(A, idx, ms) {
  const bol = A.map((o, i) => ({ o, sec: o.l[idx[i]] })).filter(x => x.sec.n > 1);
  const Y = {};
  for (const { o, sec } of bol) { const pr = btParcalar(o, sec);
    Y[o.j] = { o, pr, yeni: pr.map((x, i) => ({ ...clone(o.s), id: `${o.j}/${i + 1}`, adet: x.n, gelir: o.s.gelir == null ? null : Math.round(o.s.gelir * x.n / o.s.adet), malzeme: (o.s.malzeme || []).map(m => ({ ...m })) })) }; }
  const eski = S.D.siparisler;
  S.D.siparisler = eski.flatMap(x => Y[x.id] ? Y[x.id].yeni : [x]);
  let st; try { st = stOf(); } finally { S.D.siparisler = eski; }
  const ops = {};
  for (const [id, r] of Object.entries(S.plan.ops)) { const y = Y[r.job]; if (!y || !id.startsWith(r.job + '.')) { ops[id] = r; continue; }
    const kk = id.slice(r.job.length + 1);
    y.pr.forEach((x, i) => { const j = `${r.job}/${i + 1}`; ops[`${j}.${kk}`] = { ...r, id: `${j}.${kk}`, job: j, S: r.S + i * 1e-3, m: x.m && kk === y.o.k ? x.m : r.m }; }); }
  for (const jid in Y) { const y = Y[jid], pref = jid + '.';
    for (const id of Object.keys(st.locks)) if (id.startsWith(pref)) { const kk = id.slice(pref.length), l = st.locks[id]; delete st.locks[id]; y.pr.forEach((x, i) => { st.locks[`${jid}/${i + 1}.${kk}`] = { ...l }; }); }
    const r0 = y.o.dar ? S.plan.ops[y.o.dar.o.id] : null;
    y.pr.forEach((x, i) => { if (x.m) st.locks[`${jid}/${i + 1}.${y.o.k}`] = { m: x.m, S: r0 ? r0.S : st.now }; }); }
  const cx = compile(st);
  let p = lnsDecode(st, { ops, fail: S.plan.fail || [] }, [], cx, true);
  if (ms) p = kisaArama(st, cx, p, ms);
  const e = evaluate(p, st, null, true);
  return { st, cx, p, e, liste: Object.values(Y).map(y => ({ eski: y.o.j, yeni: y.yeni })) };
}
function btOlc(A, idx) {
  const { p, e } = btKur(A, idx);
  const T = A.map(o => { let t = null; for (const j in e.J) if (j === o.j || j.startsWith(o.j + '/')) t = Math.max(t ?? 0, e.J[j].T || 0); return t; });
  return { tl: tlToplam(e), wT: e.wT, fail: (p.fail || []).length, T };
}
const btIyi = (r, e) => !e || r.fail < e.fail || (r.fail === e.fail && r.tl < e.tl - 1e-6);
function btSecAd(o, sec, kisa) {
  if (sec.n === 1) return kisa ? 'bölünmez' : `${o.j} bölünmez`;
  return `${kisa ? '' : o.j + ' '}${sec.n} parti${sec.dag === 'dag' ? `, ${o.k}. adım ${o.tez.join('/')}` : ''}`;
}
function* btIs(d) {
  const A = d.adaylar; const sifir = A.map(() => 0);
  const olc = idx => { const r = btOlc(A, idx); d.i++; d.denenen++;
    if (btIyi(r, d.en && d.en.r)) d.en = { idx: idx.slice(), r };
    const an = idx.join(','); if (!d.ilk.some(x => x.an === an)) { d.ilk.push({ an, idx: idx.slice(), r }); d.ilk.sort((a, b) => a.r.fail - b.r.fail || a.r.tl - b.r.tl); d.ilk.length = Math.min(d.ilk.length, BT_ILK); }
    return r; };
  d.taban = olc(sifir); yield;
  d.tek = A.map(o => o.l.map(() => null)); d.tek.forEach(t => { t[0] = d.taban; });
  for (let a = 0; a < A.length; a++) for (let k = 1; k < A[a].l.length; k++) { const idx = sifir.slice(); idx[a] = k; d.tek[a][k] = olc(idx); yield; }
  if (A.length < 2) return;
  d.faz = 'capraz';
  const ms = (Date.now() - d.t0) / Math.max(1, d.denenen);
  d.kip = U.btKip || (d.top * ms <= BT_TAM_MS ? 'tam' : 'koordinat');
  d.n = d.i + (d.kip === 'tam' ? d.top - d.i : 1 + BT_TUR * A.reduce((p, o) => p + o.l.length - 1, 0));
  if (d.kip === 'tam') {
    const idx = sifir.slice();
    for (;;) { let a = 0; while (a < A.length && ++idx[a] >= A[a].l.length) { idx[a] = 0; a++; } if (a === A.length) break;
      if (idx.filter(x => x).length < 2) continue;
      olc(idx); yield; }
    return;
  }
  /* koordinat: tek başına en iyilerin birleşiminden başlar */
  const cur = A.map((o, a) => { let b = 0; d.tek[a].forEach((r, k) => { if (btIyi(r, d.tek[a][b]) && r !== d.tek[a][b]) b = k; }); return b; });
  let curR = olc(cur); yield;
  if (btIyi(d.taban, curR)) { cur.fill(0); curR = d.taban; }
  for (let tur = 0; tur < BT_TUR; tur++) { d.tur = tur + 1; let degisti = false;
    for (let a = 0; a < A.length; a++) { let bk = cur[a], bR = curR;
      for (let k = 0; k < A[a].l.length; k++) { if (k === cur[a]) continue; const idx = cur.slice(); idx[a] = k; const r = olc(idx); if (btIyi(r, bR)) { bk = k; bR = r; } yield; }
      if (bk !== cur[a]) { cur[a] = bk; curR = bR; degisti = true; } }
    if (!degisti) break; }
}
function btHesapla() {
  if (!S.plan) { bildir('Önce plan kurulmalı.', 'hata'); return; }
  if (calisan) { bildir('Önce süren çözüm bitsin.', 'bilgi'); return; }
  const A = btAdaylar(U.btK); if (!A.length) { bildir('Geciken ve bölünebilen iş emri yok.', 'bilgi'); return; }
  const top = A.reduce((p, o) => p * o.l.length, 1); const tekN = 1 + A.reduce((p, o) => p + o.l.length - 1, 0);
  const kip = A.length < 2 ? 'tek' : 'tam';
  const n = A.length < 2 ? tekN : top;
  const d = U.bt = { anah: moAnah(), durum: 'hesap', adaylar: A, kip, top, i: 0, n, denenen: 0, ilk: [], en: null, faz: 'tek', tur: 0, t0: Date.now() };
  const g = btIs(d); render();
  const adim = () => {
    if (U.bt !== d || d.durum !== 'hesap') return;
    if (calisan || d.anah !== moAnah()) { d.durum = 'hata'; d.hata = 'plan değişti, tarama durdu'; render(); return; }
    const t0 = Date.now();
    try { while (Date.now() - t0 < 120) { if (g.next().done) { d.durum = 'bitti'; d.sure = (Date.now() - d.t0) / 1000; render(); return; } } }
    catch (e) { d.durum = 'hata'; d.hata = String(e.message || e); render(); return; }
    btIlerlemeYaz(); setTimeout(adim, 0);
  };
  setTimeout(adim, 0);
}
function btIlerlemeYaz() { const d = U.bt; const el = document.querySelector('[data-bt-ilerleme]'); if (el && d) { el.max = Math.max(d.n, d.i); el.value = d.i; }
  const m = document.querySelector('[data-bt-metin]'); if (m && d) m.textContent = btIlerlemeMetin(d); }
function btIlerlemeMetin(d) { return d.faz === 'tek' ? `Her iş emri tek başına: ${d.i} deneme` : `Birleşimler${d.kip === 'koordinat' ? `, tur ${d.tur || 1}` : ''}: ${sayi(d.denenen, 0)} deneme`; }
function btOnizle() {
  const d = U.bt; if (!d || d.durum !== 'bitti' || !d.en || !yetkili('plan.yaz') || calisan) return;
  if (d.anah !== moAnah()) { bildir('Plan değişti; taramayı yeniden yapın.', 'hata'); return; }
  const A = d.adaylar; const idx = d.en.idx;
  if (idx.every(k => k === 0)) { bildir('En iyisi bölmemek; plan değişmedi.', 'bilgi'); return; }
  let k; try { k = btKur(A, idx, 500); } catch (e) { bildir('Önizleme kurulamadı: ' + e.message, 'hata'); return; }
  const ad = `Parti taraması: ${A.map((o, i) => idx[i] ? btSecAd(o, o.l[idx[i]]) : '').filter(Boolean).join('; ')}`;
  hamleKur(k.p, k.st, ad, { kaynak: 'elle' });
  U.hamle.bolme = null; U.hamle.bolmeListe = k.liste; U.hamle.hedef = null;
  render();
}
function btHucre(d, a, n) {
  const o = d.adaylar[a]; const fg = agFiyatGorur(); const t = d.taban;
  const ks = o.l.map((s, k) => s.n === n ? k : -1).filter(k => k >= 0); if (!ks.length) return '<td class="pm-num"><span class="pm-kucuk">—</span></td>';
  let b = ks[0]; for (const k of ks) if (btIyi(d.tek[a][k], d.tek[a][b])) b = k;
  const r = d.tek[a][b]; const enIyi = d.tek[a].every(x => !btIyi(x, r));
  const fark = fg ? r.tl - t.tl : r.wT - t.wT; const ton = r.fail > t.fail ? 'hata' : fark < -(fg ? MO_GURULTU : 0.5) ? 'iyi' : fark > (fg ? MO_GURULTU : 0.5) ? 'kotu' : '';
  const v = r.fail > t.fail ? `+${r.fail - t.fail} yerleşmez` : n === 1 ? (fg ? 'taban' : '0') : fg ? tlKisa(fark) : `${fark < 0 ? '−' : '+'}${sayi(Math.abs(fark), 0)}`;
  return `<td class="pm-num"><span class="pm-bt-h" ${ton ? `data-ton="${ton}"` : ''} ${enIyi ? 'data-en' : ''} title="${esc(btSecAd(o, o.l[b]))}: ağırlıklı gecikme ${sayi(r.wT, 1)} sa · ${o.j} ${sayi(r.T[a] ?? 0, 1)} sa">${v}</span></td>`;
}
function btKart() {
  const bas = `${ic('grid', 'k')} Parti taraması <span class="pm-kucuk">1-${BT_MAKS_N} parti, iş emirleri arası birleşimler</span>`;
  if (!S.plan) return kart(bas, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  const fg = agFiyatGorur(); const d = U.bt; const bayat = d && d.anah !== moAnah(); const yaz = yetkili('plan.yaz');
  const A = d && !bayat ? d.adaylar : btAdaylar(U.btK);
  const top = A.reduce((p, o) => p * o.l.length, 1);
  const kSec = `<label class="tc-alan"><span class="tc-alan-etiket">En çok geciken kaç iş emri</span><select class="tc-alan-kutu" data-chg="bt-k" ${d && d.durum === 'hesap' ? 'disabled' : ''}>${[1, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${k === U.btK ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`;
  const kapsam = A.length ? `<p class="pm-kucuk">${A.map(o => `<b class="mono">${esc(o.j)}</b>${o.s.ust ? ' <span class="pm-kucuk">yarı mamul</span>' : ''} ${o.s.adet} adet, ${o.l.length} seçenek`).join(' · ')}. ${A.length < 2 ? 'Tek iş emri: bütün seçenekler denenir.' : `Çapraz ${sayi(top, 0)} birleşim. Önce her iş emri tek başına denenir; ölçülen hızla hepsi ${sayi(BT_TAM_MS / 60000, 0)} dakikaya sığıyorsa bütün birleşimler denenir, sığmıyorsa koordinat taraması yapılır: her iş emrinin bütün seçenekleri ötekiler en iyide sabitken denenir, değişiklik kalmayana kadar (en çok ${BT_TUR} tur).`}</p>` : '<p class="pm-kucuk">Geciken ve bölünebilen iş emri yok.</p>';
  const dg = d && d.durum === 'hesap' ? dugme('Durdur', 'bt-dur', { kucuk: true, hayalet: true, simge: 'x' }) : dugme(d && d.durum === 'bitti' && !bayat ? 'Yeniden tara' : 'Tara', 'bt-hesapla', { simge: 'rotate', yetki: 'plan.yaz' });
  const ust = `<div class="pm-eb-ust">${kSec}</div>${kapsam}`;
  if (!d || bayat) return kart(bas, `${bayat ? `<p class="pm-ag-uyari">${ic('alert', 'k')} Plan ya da veri değişti; tarama yeniden yapılmalı.</p>` : ''}${ust}`, dg);
  if (d.durum === 'hesap') return kart(bas, `${ust}<p class="pm-kucuk" data-bt-metin>${esc(btIlerlemeMetin(d))}</p><progress data-bt-ilerleme value="${d.i}" max="${Math.max(d.n, d.i)}" aria-label="Parti taraması"></progress>`, dg);
  if (d.durum === 'hata') return kart(bas, `${ust}<p class="pm-ag-uyari">${ic('alert', 'k')} Tarama tamamlanamadı: ${esc(d.hata)}</p>`, dg);
  const t = d.taban, en = d.en; const idx = en.idx; const bolunmez = idx.every(k => k === 0);
  const ozet = bolunmez ? `<p class="pm-mo-ozet">${ic('check', 'k')}<span>Denenen ${sayi(d.denenen, 0)} durumun hiçbiri bugünkü plandan iyi değil: bu iş emirlerini bölmek gecikmeyi azaltmıyor.</span></p>`
    : `<p class="pm-mo-ozet">${ic('flag', 'k')}<span>En iyi birleşim: ${A.map((o, i) => `<b class="mono">${esc(o.j)}</b> ${esc(btSecAd(o, o.l[idx[i]], true))}`).join(' · ')}. Ağırlıklı gecikme ${sayi(t.wT, 1)} → <b>${sayi(en.r.wT, 1)} sa</b>${fg ? `, TL ${esc(tlKisa(en.r.tl - t.tl))}` : ''}.</span></p>`;
  const ns = Array.from({ length: BT_MAKS_N }, (_, i) => i + 1);
  const isi = `<h3 class="pm-yl-alt">Tek başına bölününce ${fg ? 'TL farkı' : 'ağırlıklı gecikme farkı (sa)'}</h3><p class="pm-kucuk">Sütun parti sayısı; kalın çerçeve iş emrinin en iyisi, hücrenin üstüne gelince seçenek görünür.</p><div class="tc-tablo-kap pm-bt-kap"><table class="tc-tablo pm-bt-isi"><thead><tr><th>İş emri</th>${ns.map(n => `<th class="pm-num">${n}</th>`).join('')}</tr></thead><tbody>${A.map((o, a) => `<tr><th scope="row" class="mono">${esc(o.j)}</th>${ns.map(n => btHucre(d, a, n)).join('')}</tr>`).join('')}</tbody></table></div>`;
  const ilk = A.length > 1 ? `<h3 class="pm-yl-alt">En iyi ${d.ilk.length} durum</h3><div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>#</th>${A.map(o => `<th class="mono">${esc(o.j)}</th>`).join('')}<th class="pm-num">Ağırlıklı gecikme</th>${fg ? '<th class="pm-num">TL farkı</th>' : ''}</tr></thead><tbody>${d.ilk.map((x, r) => `<tr ${r === 0 && !bolunmez ? 'data-ton="uyari"' : ''}>${td('#', String(r + 1), 'pm-num')}${A.map((o, i) => td(o.j, esc(btSecAd(o, o.l[x.idx[i]], true)))).join('')}${td('Ağırlıklı gecikme', `${sayi(x.r.wT, 1)} sa${x.r.fail > t.fail ? ` <span class="pm-kucuk">+${x.r.fail - t.fail} yerleşmez</span>` : ''}`, 'pm-num')}${fg ? td('TL farkı', `<span class="mono">${esc(x.idx.every(k => !k) ? 'taban' : tlKisa(x.r.tl - t.tl))}</span>`, 'pm-num') : ''}</tr>`).join('')}</tbody></table></div>` : '';
  const not = `<p class="pm-kucuk">${sayi(d.denenen, 0)} durum denendi (${d.kip === 'tam' ? 'bütün birleşimler' : d.kip === 'koordinat' ? `koordinat taraması, ${d.tur} tur; her birleşim denenmedi` : 'tek iş emri'})${d.sure != null ? `, ${sayi(d.sure, 1)} sn` : ''}. Ölçüm bugünkü sırayla, aramasız; önizleme kısa aramayla yeniden çözer, sonuç biraz farklı olabilir. Partiler eşit adetli; her parti ayarı yeniden öder.</p>`;
  const onz = !bolunmez && yaz ? `<div class="pm-dugmeler">${dugme('En iyi birleşimi önizle', 'bt-onizle', { birincil: true, simge: 'eye', yetki: 'plan.yaz' })}</div>` : '';
  return kart(bas, `${ust}${ozet}${onz}${isi}${ilk}${not}`, dg);
}
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || el.dataset.chg !== 'bt-k') return; e.stopImmediatePropagation();
  U.btK = Math.max(1, Math.min(6, +el.value || 3)); if (U.bt && U.bt.durum !== 'hesap') U.bt = null; render();
}, true);
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (act === 'bt-hesapla') { btHesapla(); return true; }
  if (act === 'bt-dur') { if (U.bt) { U.bt.durum = 'hata'; U.bt.hata = 'durduruldu'; } render(); return true; }
  if (act === 'bt-onizle') { btOnizle(); return true; }
  return te0(act, v, el, e); }; }
