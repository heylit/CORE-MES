/* ---------- Malzeme öne çekme listesi ----------
   Açık satın alma siparişlerinden hangisini tedarikçiden kaç gün önce istemek ne kazandırır.
   Her sipariş için geliş 1, 3 ve 5 gün öne alınır; plan aynı sırayla yeniden çözülür (sıra korunur, yalnız zamanlar kayar)
   ve gecikme ile TL farkı ölçülür. Yeniden arama yapılmaz: arama zamanla sınırlı olduğundan aynı veride farklı sonuç verir,
   küçük kazancı gürültüden ayırmak olmaz. Aynı sırayla çözüm eskisinden kötü çıkarsa eski plan geçerli sayılır (erken gelen malzeme onu bozmaz).
   Gerçek kazanç bundan büyük olabilir; bu liste alt sınırdır.
   Motor gecikmeyi sözleşme tarihinin önüne geçirmez (geliş en erken söz verilen gündür), bu yüzden deneme sözleşme
   tarihini değiştirir; tedarikçinin ortalama gecikmesi ve giriş muayenesi aynen eklenir. */
const MO_GUN = [1, 3, 5];
const MO_GURULTU = 500;
U.moCek = null;
function moAnah() { return [S.dataVer, S.plan ? (S.plan.ozet || {}).wT : '', Object.keys((S.plan || {}).ops || {}).length].join('|'); }
function moAdaylar() {
  const cx = cxAl(); if (!cx || !S.plan) return []; const D = cx.D;
  const bag = {};
  for (const jid in cx.mat.res) for (const d of cx.mat.res[jid].det) for (const u of d.use) if (u.k === 'sa') (bag[u.i] = bag[u.i] || new Set()).add(jid);
  return Object.entries(bag).map(([i, js]) => { const po = (D.satinalma || [])[+i]; if (!po) return null; const soz = parseT(D, po.gelis);
    return { i: +i, kod: po.kod, ted: po.tedarikci, soz, isler: [...js] }; }).filter(a => a && a.soz != null && a.soz > 0);
}
function moOlc(a, X) {
  const st = stOf(); if (a) st.D.satinalma[a.i].gelis = a.soz - X * 24;
  const cx = compile(st); const p = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
  const e = evaluate(p, st, null, true);
  const T = {}; for (const j of (a ? a.isler : Object.keys(e.J))) T[j] = e.J[j] ? e.J[j].T : null;
  return { tl: tlToplam(e), wT: e.wT, sumT: e.sumT, late: e.late, fail: (p.fail || []).length, T };
}
function moHesapla() {
  if (!S.plan) { bildir('Önce plan kurulmalı.', 'hata'); return; }
  const anah = moAnah(); const ad = moAdaylar();
  const durum = U.moCek = { anah, durum: 'hesap', i: 0, n: ad.length * MO_GUN.length + 1, liste: [], taban: null };
  render();
  const isler = [() => { durum.taban = moOlc(null, 0); durum.taban.T0 = durum.taban.T; }];
  for (const a of ad) { const r = { ...a, g: {} }; durum.liste.push(r);
    for (const X of MO_GUN) isler.push(() => { const o = moOlc(a, X); const t = durum.taban;
      const kur = a.isler.filter(j => t.T0 && t.T0[j] > 0.05 && (o.T[j] ?? 1e9) < 0.05);
      /* erken gelen malzeme eski planı bozmaz: aynı sırayla çözüm daha kötüyse eski plan geçerli kalır, kazanç sıfırdır */
      const iyi = o.fail <= t.fail && o.tl < t.tl;
      r.g[X] = iyi ? { tl: t.tl - o.tl, sa: Math.max(0, t.sumT - o.sumT), late: t.late - o.late, kur } : { tl: 0, sa: 0, late: 0, kur: [] }; }); }
  durum.n = isler.length;
  const adim = () => {
    if (U.moCek !== durum) return;
    const t0 = Date.now();
    try { while (durum.i < isler.length && Date.now() - t0 < 120) isler[durum.i++](); }
    catch (e) { durum.durum = 'hata'; durum.hata = String(e.message || e); render(); return; }
    if (durum.i < isler.length) { if (U.sayfa === 'malzplan') moIlerlemeYaz(); setTimeout(adim, 0); return; }
    durum.durum = 'bitti'; render();
  };
  setTimeout(adim, 0);
}
function moIlerlemeYaz() { const el = document.querySelector('[data-mo-ilerleme]'); const d = U.moCek; if (el && d) { el.value = d.i; el.max = d.n; } }
function moKart() {
  const fg = agFiyatGorur(); const d = U.moCek; const D = S.D;
  const bayat = d && d.anah !== moAnah();
  const dg = dugme(d && d.durum === 'bitti' && !bayat ? 'Yeniden hesapla' : 'Hesapla', 'mo-hesapla', { simge: 'rotate' });
  const bas = `${ic('truck', 'k')} Malzeme öne çekme <span class="pm-kucuk">hangi açık siparişi erken istemeli</span>`;
  const acik = '<p class="pm-kucuk">Her açık satın alma siparişinin gelişi 1, 3 ve 5 gün öne alınır, plan aynı sırayla yeniden çözülür. Kazanç sıra korunarak ölçülür; motor yeniden planlarsa daha fazlası çıkabilir. Tedarikçiyle konuşmadan önce bakılacak liste budur; tedarikçi erken teslimi kabul etmezse kazanç yoktur.</p>';
  if (!S.plan) return kart(bas, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  if (!d || bayat) return kart(bas, `${bayat ? '<p class="pm-ag-uyari">' + ic('alert', 'k') + ' Plan ya da veri değişti; liste yeniden hesaplanmalı.</p>' : ''}${acik}`, dg);
  if (d.durum === 'hesap') return kart(bas, `<p class="pm-kucuk">Hesaplanıyor: her sipariş için üç deneme.</p><progress data-mo-ilerleme value="${d.i}" max="${d.n}" aria-label="Öne çekme hesabı"></progress>`);
  if (d.durum === 'hata') return kart(bas, `<p class="pm-ag-uyari">${ic('alert', 'k')} Hesap tamamlanamadı: ${esc(d.hata)}</p>`, dg);
  const olcu = r => fg ? r.g[3].tl : r.g[3].sa * 1000 + r.g[5].sa;
  const l = [...d.liste].sort((a, b) => olcu(b) - olcu(a) || a.soz - b.soz);
  const anlamli = g => fg ? g.tl >= MO_GURULTU : g.sa >= 0.5;
  const hucre = g => { if (!anlamli(g)) return '<span class="pm-kucuk">fark yok</span>';
    return `<span class="pm-mo-h">${fg ? `<b class="mono">${esc(agTL(g.tl))}</b>` : ''}<small>${g.sa >= 0.05 ? `gecikme −${sayi(g.sa, 1)} sa` : 'gecikme aynı'}${g.kur.length ? ` · ${g.kur.length} iş zamanında` : ''}</small>`; };
  const ted = id => esc((D.tedarikciler.find(t => t.id === id) || {}).ad || id || '—');
  const mal = k => esc((D.malzemeler.find(m => m.kod === k) || {}).ad || '');
  const sat = l.map(r => `<tr ${anlamli(r.g[3]) ? 'data-ton="uyari"' : ''}>${td('Malzeme', `<b class="mono">${esc(r.kod)}</b> <span class="pm-kucuk">${mal(r.kod)}</span>`)}${td('Tedarikçi', ted(r.ted))}${td('Söz verilen geliş', `<span class="mono">${esc(fmtDT(D, r.soz).slice(0, 9))}</span>`)}${td('Bağlı işler', `<span class="mono">${esc(r.isler.slice(0, 3).join(', '))}</span>${r.isler.length > 3 ? ` <span class="pm-kucuk">+${r.isler.length - 3}</span>` : ''}`)}${MO_GUN.map(X => td(`${X} gün önce`, hucre(r.g[X]), 'pm-num')).join('')}</tr>`).join('');
  const ust = l.filter(r => anlamli(r.g[3])).slice(0, 3);
  const ozet = ust.length ? `<p class="pm-mo-ozet">${ic('flag', 'k')}<span>${ust.map(r => `<b class="mono">${esc(r.kod)}</b> (${ted(r.ted)}) 3 gün önce gelirse ${fg ? `<b>${esc(agTL(r.g[3].tl))}</b> kazanılır, ` : ''}gecikme ${sayi(r.g[3].sa, 1)} sa azalır`).join('; ')}.</span></p>`
    : `<p class="pm-mo-ozet">${ic('check', 'k')}<span>Hiçbir açık siparişi öne çekmek planı belirgin iyileştirmiyor; malzeme bu planda darboğaz değil.</span></p>`;
  const not = `<p class="pm-kucuk">${fg ? `${sayi(MO_GURULTU, 0)} TL altındaki fark "fark yok" sayılır. TL, planın amaç toplamındaki düşüştür (gecikme cezası, finansman, risk). ` : 'TL farkını müdür ve yönetici görür; burada gecikme saati var. '}Taban: bugünkü plan, aynı sırayla çözüldüğünde.</p>`;
  return kart(bas, `${ozet}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Malzeme</th><th>Tedarikçi</th><th>Söz verilen geliş</th><th>Bağlı işler</th>${MO_GUN.map(X => `<th class="pm-num">${X} gün önce</th>`).join('')}</tr></thead><tbody>${sat || `<tr><td colspan="${4 + MO_GUN.length}" class="pm-kucuk">Plandaki işlere bağlı açık satın alma siparişi yok.</td></tr>`}</tbody></table></div>${not}${acik}`, dg);
}
{ const mp0 = YM_GORUNUM.malzplan; YM_GORUNUM.malzplan = function () { return mp0.apply(this, arguments) + moKart(); }; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) { if (act === 'mo-hesapla') { moHesapla(); return true; } return te0(act, v, el, e); }; }
