/* ---------- küçük tahta: tezgâhlar tahtadaki yerlerinde, dolulukla ya da tabana göre farkla renklenir ---------- */
function stMini(pl, taban) {
  const Y = TB.son || tbYerlesim(gosterilen()); const W = Y.w + 40, H = cerSiz(Y) + 20; const yz = (v, t) => (v / t * 100).toFixed(2) + '%';
  const kartlar = Object.values(Y.kart).map(k => { const u = pl.util && pl.util[k.id]; const t = taban && taban.util && taban.util[k.id];
    const d = u && t ? u.u - t.u : 0; const fk = taban ? (d > 0.04 ? 'kotu' : d < -0.04 ? 'iyi' : 'ayni') : null;
    return `<i style="left:${yz(k.x + 20, W)};top:${yz(k.y + 10, H)};width:${yz(TB.W, W)};height:${yz(TB.H, H)}" ${fk ? `data-fark="${fk}"` : `data-isi="${isiSeviye(u ? u.u : null)}"`} title="${esc(k.id)}${u ? ' %' + Math.round(u.u * 100) : ''}${fk && Math.abs(d) > 0.005 ? ` (${d > 0 ? '+' : '−'}%${Math.round(Math.abs(d) * 100)})` : ''}"></i>`; }).join('');
  return `<div class="pm-st-mini" style="aspect-ratio:${(W / H).toFixed(3)}" role="img" aria-label="Tezgâhların ${taban ? 'doluluk farkı' : 'doluluğu'}">${kartlar}</div>`;
}
const cerSiz = Y => Math.max(...Object.values(Y.kart).map(k => k.y + TB.H), 100);

/* ---------- Sipariş stüdyosu: bir siparişin her adımda neden beklediği ve öne almanın bedeli ---------- */
function stBekleten(p, r, hazir) {
  /* aynı tezgâhta, siparişin hazır olduğu andan başlayana kadar çalışan işlerden en uzun süreni */
  let en = null, enO = 0;
  for (const q of Object.values(p.ops)) { if (q.m !== r.m || q.id === r.id || !isFinite(q.C)) continue; const o = Math.min(q.C, r.S) - Math.max(q.S, hazir); if (o > enO + 1e-6) { enO = o; en = q; } }
  return en;
}
function sStudyoSip() {
  const j = U.studyo.j; const p = gosterilen(); const cx = cxAl(); const D = S.D; const s = D.siparisler.find(x => x.id === j) || U.hamle && U.hamle.yeniSip; const J = (p.J || {})[j];
  const yaz = yetkili('plan.yaz'); const now = cx.st.now; const tas = +cx.A.tasimaSaat || 0;
  const rs = tbYolAdimlari(p, j); const termin = s ? parseT(D, s.termin) : null;
  /* sol: sipariş ve süresinin ayrışması */
  const ay = cx.jobs[j] ? ayristir(p, cx, j) : null;
  const gecL = Object.entries(p.J || {}).filter(([k, x]) => k !== j && (x.T == null || x.T > 0.05)).sort((a, b) => (b[1].T ?? 1e9) - (a[1].T ?? 1e9)).slice(0, 8);
  const sol = `<section class="pm-st-sol" aria-label="Sipariş"><h3>${ic('list', 'k')}<span class="mono">${esc(j)}</span></h3>
    ${s ? `<p class="pm-kucuk">${esc(urunAd(s.urun))} · ${s.adet} adet · ${esc(ONCELIK[s.oncelik] || '')}</p>` : ''}
    <dl class="pm-dl"><dt>Termin</dt><dd class="mono">${esc(s && s.termin || '—')}</dd><dt>Plan bitişi</dt><dd class="mono">${J && J.C != null ? esc(fmtDT(D, J.C)) : '—'}</dd><dt>Durum</dt><dd>${!J ? rozet('Planda yok', 'pasif') : J.T == null ? rozet('Planlanmadı', 'hata') : J.T > 0.05 ? rozet(saat(J.T) + ' geç', 'hata') : rozet('Zamanında', 'tamam')}</dd></dl>
    ${ay && ay.tam ? `<h4>Süre nereye gidiyor</h4>${ayrisimCubugu(ay, true)}` : ''}
    ${gecL.length ? `<h4>Diğer geciken siparişler</h4><div class="pm-st-komsu">${gecL.map(([k, x]) => `<button type="button" class="tc-dugme tc-dugme-kucuk" data-act="st-sip" data-v="${esc(k)}">${esc(k)} <small>${x.T == null ? 'yok' : saat(x.T)}</small></button>`).join('')}</div>` : ''}</section>`;
  /* orta: adım merdiveni; her satırda bekleme (taralı) ve işlem, sağda neden ve seçenekler */
  const t0 = rs.length ? Math.min(now, rs[0].S) : now; const t1 = Math.max(rs.length ? rs[rs.length - 1].C : now + 24, termin != null ? termin : 0) + 2; const px = 100 / Math.max(1, t1 - t0);
  const sec = U.stSec && rs.some(r => r.id === U.stSec) ? U.stSec : null;
  const satir = rs.map((r, i) => {
    const o = cx.byId[r.id] || {}; const onc = i ? rs[i - 1] : null; const hazir = onc ? (onc.fas ? onc.C : (o.pr && o.pr.some(([pid, ty]) => pid === onc.id && ty === 'o') ? onc.lot1 : onc.C) + (onc.fas ? 0 : tas)) : Math.max(now, (cx.jobs[j] || {}).rel || now);
    const bek = Math.max(0, r.S - hazir); const w = r.why || {}; const kat = NEDEN_KAT[w.t] || (bek > 0.25 ? 'kapali' : null);
    const blk = kat === 'tezgah' && bek > 0.25 ? stBekleten(p, r, hazir) : null;
    const neden = bek > 0.25 && kat ? `${esc(KAT[kat][0])}${blk ? ` · <b class="mono">${esc(blk.job)}</b> bekletiyor` : ''}` : bek > 0.25 ? 'Bekledi' : 'Beklemeden başladı';
    const alt = sec === r.id && yaz ? (o.c || []).filter(c => c.m !== r.m).map(c => { const u = p.util && p.util[c.m]; return dugme(`${c.m[0] === '@' ? c.m.slice(1) : c.m}${u ? ` %${Math.round(u.u * 100)}` : ''}`, 'st-tasi', { kucuk: true, veri: `data-v="${esc(r.id)}" data-m="${esc(c.m)}"` }); }).join('') : '';
    return `<li ${sec === r.id ? 'data-secili' : ''} ${bek > 24 ? 'data-uzun' : ''}><button type="button" class="pm-st-ad" data-act="st-sec" data-v="${esc(r.id)}"><b class="mono">${i + 1}</b> <span class="mono">${esc(r.m[0] === '@' ? r.m.slice(1) : r.m)}</span> ${esc(o.ad || '')}<small>${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C).slice(6))} · işlem ${saat(r.C - r.S)}</small></button>
      <div class="pm-st-serit" aria-hidden="true">${bek > 0.05 ? `<i class="pm-st-bek" style="left:${((hazir - t0) * px).toFixed(2)}%;width:${(bek * px).toFixed(2)}%"></i>` : ''}<i class="pm-st-isl" style="left:${((r.S - t0) * px).toFixed(2)}%;width:${Math.max(0.5, (r.C - r.S) * px).toFixed(2)}%;--c:${durumRenk(j)}"></i>${termin != null ? `<i class="pm-st-termin" style="left:${((termin - t0) * px).toFixed(2)}%"></i>` : ''}</div>
      <p class="pm-st-neden"><span class="mono ${bek > 24 ? 'pm-fark-kotu' : ''}">${bek > 0.25 ? saat(bek) + ' bekleme' : ''}</span> ${neden}</p>
      ${yaz && blk ? `<div class="pm-dugmeler">${dugme(`${blk.job} önüne al`, 'st-gec', { kucuk: true, simge: 'up', veri: `data-v="${esc(r.id)}" data-once="${esc(blk.id)}" data-m="${esc(r.m)}"` })}</div>` : ''}
      ${alt ? `<p class="pm-kucuk">Başka tezgâhta aynı saatte dene (o tezgâhın doluluğu)</p><div class="pm-dugmeler">${alt}</div>` : ''}</li>`; }).join('');
  const top = rs.length ? rs[rs.length - 1].C - rs[0].S : 0; const isl = rs.reduce((t, r) => t + (r.C - r.S), 0);
  const orta = `<section class="pm-st-orta" aria-label="Adımlar"><div class="pm-st-baslik"><div><h4>Adım adım yol</h4><p class="pm-kucuk">${rs.length} adım · işlem ${saat(isl)} · bekleme ${saat(Math.max(0, top - isl))}${termin != null ? ' · dikey çizgi termin' : ''}</p></div>
    <div class="pm-dugmeler">${yaz && rs.length ? dugme('Siparişi öne al', 'st-onal', { simge: 'bolt', birincil: true, kucuk: true, veri: `data-v="${esc(j)}"` }) : ''}${dugme('Tahtada yolunu göster', 'st-yol', { simge: 'eye', kucuk: true, veri: `data-v="${esc(j)}"` })}</div></div>
    <ol class="pm-st-merdiven">${satir || '<li class="pm-kucuk">Bu sipariş planda değil.</li>'}</ol></section>`;
  const Jo = U.hamle && S.plan.J[j];
  const ek = J ? `<div class="pm-st-olcu"><small>Bu siparişin bitişi</small><b class="mono">${J.C != null ? esc(fmtDT(D, J.C)) : '—'}</b>${Jo && Jo.C != null && J.C != null && Math.abs(Jo.C - J.C) > 0.05 ? `<span class="mono">önce ${esc(fmtDT(D, Jo.C))} ${fark(J.C, Jo.C)}</span>` : ''}</div>` : '';
  return stKabuk('sip', j, sol, orta, stEtki(ek, 'Bir adımı öne alın ya da başka tezgâha taşıyın; motor bütün planı yeniden hesaplar.'));
}

/* ---------- Kriz masası: olay girilir, üç tepki yan yana hesaplanır, biri seçilip önizlenir ---------- */
function krizSt(ev) {
  const st = stOf(); let ad, yeniSip = null;
  if (ev.tip === 'ariza') { st.down = [...st.down, { m: ev.m, from: ev.bas, to: ev.bas + ev.saat, id: 'deneme' }]; ad = `${ev.m}: ${fmtDT(S.D, ev.bas)} itibarıyla ${sayi(ev.saat, 1)} saat duruş`; }
  else { ad = applyEvent(st, ev).label || olayAd(ev); if (ev.tip === 'acil') yeniSip = clone(st.D.siparisler[st.D.siparisler.length - 1]); }
  return { st, ad, yeniSip };
}
/* ek mesai tepkisi: arızalı tezgâh ya da en dolu tezgâh, olaydan sonraki ilk iki boş vardiya */
function krizMesai(ev, pl) {
  const D = S.D; const g0 = Math.floor((ev.tip === 'ariza' ? ev.bas + ev.saat : cxAl().st.now) / 24);
  const ad = m => { const t = D.tezgahlar.find(x => x.id === m); if (!t || !(t.vardiyalar || []).length) return []; const l = [];
    for (let g = g0; g < g0 + 5 && l.length < 2; g++) for (const v of D.vardiyalar) if (!t.vardiyalar.includes(v.id) && !S.ekMesai.some(e => e.m === m && e.gun === g && e.vardiya === v.id) && l.length < 2) l.push({ m, gun: g, vardiya: v.id });
    return l; };
  const grup = ev.tip === 'ariza' ? (D.tezgahlar.find(x => x.id === ev.m) || {}).grup : null;
  const sira = [...(ev.tip === 'ariza' ? [ev.m] : []), ...Object.entries(pl.util || {}).filter(([k]) => k[0] !== '@' && (!grup || (D.tezgahlar.find(x => x.id === k) || {}).grup === grup)).sort((a, b) => b[1].u - a[1].u).map(x => x[0])];
  for (const m of sira) { const l = ad(m); if (l.length) return l; }
  return [];
}
function krizHesapla(ev) {
  if (!yetkili('plan.yaz') || !S.plan || calisan) return;
  try {
    const a = krizSt(ev); const cx = compile(a.st);
    const p0 = lnsDecode(a.st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true); slack(p0, cx);
    const e0 = evaluate(p0, a.st, null, true);
    const pD = schedule(a.st, 'dagit', null, { cx }); slack(pD, cx);
    const L1 = lns(a.st, p0, null, { ms: 600, seed: 7, free: true }), L2 = lns(a.st, pD, null, { ms: 600, seed: 7, free: true });
    const L = cmpEv(L2.e, L1.e) > 0 ? L2 : L1;
    const p1 = cmpEv(L.e, e0) > 0 && (L.plan.fail || []).length <= (p0.fail || []).length ? L.plan : p0; slack(p1, cx);
    const k1 = planKaydi(p1, a.st, null);
    const sec = [
      { k: 'koru', ad: 'Sırayı koru', acik: 'Kimse yer değiştirmez; olaydan etkilenen işler kendi kuyruğunda kayar.', p: p0, st: a.st, kayit: planKaydi(p0, a.st, null) },
      { k: 'motor', ad: 'Motor toparlasın', acik: 'Motor bütün planı kısa süre yeniden düzenler; başka işlerin sırası da değişebilir.', p: p1, st: a.st, kayit: k1 },
    ];
    const ek = krizMesai(ev, k1);
    if (ek.length) {
      const b = krizSt(ev); const em = [...S.ekMesai, ...ek]; b.st.ekMesai = clone(em); const cx2 = compile(b.st);
      const q0 = lnsDecode(b.st, { ops: p1.ops, fail: p1.fail || [] }, [], cx2, true); slack(q0, cx2);
      const L3 = lns(b.st, q0, null, { ms: 600, seed: 7, free: true });
      const p2 = cmpEv(L3.e, evaluate(q0, b.st, null, true)) > 0 ? L3.plan : q0; slack(p2, cx2);
      sec.push({ k: 'mesai', ad: 'Ek mesaiyle toparla', acik: `Motorun planına ek vardiya eklenir: ${mesaiAd(ek)}.`, p: p2, st: b.st, kayit: planKaydi(p2, b.st, null), ekMesai: em });
    } else sec.push({ k: 'mesai', ad: 'Ek mesaiyle toparla', acik: 'Uygun boş vardiya yok: ilgili tezgâhlar bütün vardiyalarda çalışıyor.', yok: true });
    U.kriz = { dv: S.dataVer, ev, ad: a.ad, yeniSip: a.yeniSip, sec, secili: null }; U.hamle = null; render();
  } catch (e) { bildir('Kriz hesaplanamadı: ' + e.message, 'hata'); }
}
function krizSec(k) {
  const z = U.kriz; const o = z && z.sec.find(x => x.k === k); if (!o || o.yok) return;
  hamleKur(o.p, o.st, `${z.ad} · ${o.ad}`, { kaynak: 'olay', ekMesai: o.ekMesai || null });
  U.hamle.olay = z.ev; U.hamle.yeniSip = z.yeniSip; if (z.ev.tip === 'ariza') U.hamle.ariza = { m: z.ev.m, from: z.ev.bas, to: z.ev.bas + z.ev.saat };
  z.secili = k; render();
}
function sStudyoKriz() {
  const yaz = yetkili('plan.yaz'); const tip = U.krizTip || 'ariza'; if (U.kriz && U.kriz.dv !== S.dataVer) U.kriz = null; const z = U.kriz;
  const tipler = `<div class="pm-olay-tip" role="radiogroup" aria-label="Olay türü">${OLAY_TIP.map(([k, ad, sm]) => `<button type="button" role="radio" aria-checked="${tip === k}" data-act="kriz-tip" data-v="${k}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('')}</div>`;
  const sol = z ? `<section class="pm-st-sol" aria-label="Olay"><h3>${ic('alert', 'k')}Olay</h3><div class="pm-serit" data-ton="uyari">${ic(((OLAY_TIP.find(x => x[0] === z.ev.tip) || [])[2]) || 'alert', 'k')}<span class="pm-serit-metin">${esc(z.ad)}</span></div>
    <p class="pm-kucuk">Üç tepki bu olayla hesaplandı. Olay plana yalnız seçilen tepkiyle birlikte, Uygula deyince yazılır.</p><div class="pm-dugmeler">${dugme('Başka bir olay dene', 'kriz-yeni', { simge: 'plus', kucuk: true })}</div></section>`
    : `<section class="pm-st-sol" aria-label="Olay"><h3>${ic('alert', 'k')}Ne oldu?</h3>${yaz ? `${tipler}<form data-form="kriz" data-tip="${tip}" novalidate class="pm-dik">${olayAlanlari(tip)}<p class="pm-form-hata" data-hata hidden></p><button type="submit" class="tc-dugme tc-dugme-birincil" ${calisan ? 'disabled' : ''}>${ic('layers', 'k')}Üç tepkiyi hesapla</button></form>` : '<p class="pm-kucuk">Olay girmek için plan.yaz yetkisi gerekir.</p>'}</section>`;
  const once = S.plan.ozet;
  const kart = o => { const k = o.kayit; const degN = k ? Object.keys(k.J).filter(j => { const a = S.plan.J[j], b = k.J[j]; return !a || a.C == null || b.C == null ? a !== b : Math.abs(b.C - a.C) > 0.05; }).length : 0;
    return `<article class="pm-st-tepki" ${z.secili === o.k ? 'data-secili' : ''} ${o.yok ? 'data-yok' : ''}><header><b>${esc(o.ad)}</b>${z.secili === o.k ? rozet('Önizleniyor', 'tamam') : ''}</header><p class="pm-kucuk">${esc(o.acik)}</p>
      ${k ? `<div class="pm-st-tepki-sayi"><div><small>Gecikme</small><b class="mono">${saat(k.ozet.wT)}</b><span class="mono">${fark(k.ozet.wT, once.wT)}</span></div><div><small>Geciken</small><b class="mono">${k.ozet.late}/${k.ozet.n}</b></div><div><small>Kayan sipariş</small><b class="mono">${degN}</b></div></div>
      ${stMini(k, S.plan)}<p class="pm-kucuk pm-st-lejant"><i data-fark="kotu"></i>daha dolu <i data-fark="iyi"></i>daha boş</p>
      ${dugme(z.secili === o.k ? 'Seçildi' : 'Bunu önizle', 'kriz-sec', { kucuk: true, birincil: z.secili !== o.k, simge: 'eye', veri: `data-v="${o.k}"` })}` : ''}</article>`; };
  const enIyi = z ? z.sec.filter(o => o.kayit).reduce((a, b) => (!a || b.kayit.ozet.wT < a.kayit.ozet.wT - 0.05 ? b : a), null) : null;
  const orta = `<section class="pm-st-orta" aria-label="Tepkiler">${z ? `<div class="pm-st-baslik"><div><h4>${esc(z.ad)}</h4><p class="pm-kucuk">Üç tepki aynı olayla hesaplandı${enIyi ? `; gecikmeyi en az artıran: <b>${esc(enIyi.ad)}</b>` : ''}. Birini seçin, etkisi sağda görünür; Uygula demeden plan değişmez.</p></div></div><div class="pm-st-tepkiler">${z.sec.map(kart).join('')}</div>`
    : `<div class="pm-st-bos">${ic('alert', 'b')}<h4>Bir olay girin</h4><p class="pm-kucuk">Arıza, acil sipariş, malzeme ya da personel eksiği. Masa üç tepkiyi yan yana hesaplar: sırayı korumak, motorun toparlaması ve ek mesai. Her biri gecikme, kayan sipariş ve tezgâhların doluluk farkıyla gösterilir.</p></div>`}</section>`;
  return stKabuk('kriz', '', sol, orta, stEtki('', 'Bir tepki seçin; önce ve sonra burada görünür.'));
}

/* ---------- Senaryo stüdyosu: en çok üç plan yan yana, ilkine göre fark haritası ve karar notu ---------- */
function senAdaylari() {
  const l = [{ id: 'simdi', ad: 'Şimdiki plan', plan: S.plan }];
  if (U.hamle) l.push({ id: 'onizleme', ad: 'Önizleme: ' + U.hamle.ad, plan: U.hamle.plan });
  for (const x of S.senaryolar.filter(x => x.plan && x.durum !== 'vazgecildi')) l.push({ id: x.id, ad: x.ad, plan: x.plan, sen: x });
  return l;
}
function sStudyoSen() {
  const D = S.D; const yaz = yetkili('plan.yaz'); const ad = senAdaylari();
  let secL = (U.stSen || []).filter(id => ad.some(a => a.id === id)); if (!secL.length) secL = ad.slice(0, 3).map(a => a.id);
  const secilen = secL.map(id => ad.find(a => a.id === id)); const taban = secilen[0]; const kip = U.stSenKip || 'fark';
  const sol = `<section class="pm-st-sol" aria-label="Senaryolar"><h3>${ic('flag', 'k')}Karşılaştır</h3><p class="pm-kucuk">En çok üç tane seçin; ilk seçilen taban olur.</p>
    <ul class="pm-st-secim">${ad.map(a => `<li><label><input type="checkbox" data-chg="st-sen" data-v="${esc(a.id)}" ${secL.includes(a.id) ? 'checked' : ''} ${!secL.includes(a.id) && secL.length >= 3 ? 'disabled' : ''}><span><b>${esc(a.ad)}</b><small class="mono">${saat(a.plan.ozet.wT)} · ${a.plan.ozet.late}/${a.plan.ozet.n}${a.sen && a.sen.id === S.canli ? ' · canlı' : ''}</small></span></label></li>`).join('')}</ul>
    ${yaz ? `<h4>Şimdiki planı kaydet</h4><form class="pm-sira" data-form="senaryo-kaydet" novalidate><input class="tc-alan-kutu pm-sira-ara" name="ad" placeholder="Senaryo adı" aria-label="Senaryo adı"><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil" ${planGuncel() ? '' : 'disabled'}>${ic('flag', 'k')}Kaydet</button></form>` : ''}
    ${ad.length < 2 ? '<p class="pm-kucuk">Karşılaştırmak için önce bir senaryo kaydedin ya da bir değişikliği önizleyin.</p>' : ''}</section>`;
  const kol = (a, i) => { const o = a.plan.ozet, t = taban.plan.ozet;
    const deg = i ? Object.keys(a.plan.J).map(j => { const x = taban.plan.J[j], y = a.plan.J[j]; return x && y && x.C != null && y.C != null ? { j, d: y.C - x.C } : null; }).filter(x => x && Math.abs(x.d) > 0.05).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)) : [];
    const sat = (ad_, v, b, k = 1) => `<div><small>${ad_}</small><b class="mono">${k ? saat(v) : v}</b>${i && b != null ? `<span class="mono">${fark(v, b, k)}</span>` : ''}</div>`;
    return `<article class="pm-st-kol" ${i ? '' : 'data-taban'}><header><b>${esc(a.ad)}</b>${i ? '' : rozet('Taban', '')}</header>
      <div class="pm-st-tepki-sayi">${sat('Gecikme', o.wT, t.wT)}${sat('Geciken', o.late, t.late, 0)}${o.suH != null ? sat('Ayar', o.suH, t.suH) : ''}</div>
      ${stMini(a.plan, kip === 'fark' && i ? taban.plan : null)}
      ${i ? (deg.length ? `<p class="pm-kucuk">${deg.length} siparişin bitişi farklı</p><ul class="pm-st-deg">${deg.slice(0, 5).map(x => `<li><b class="mono">${esc(x.j)}</b><span class="mono ${x.d > 0 ? 'pm-fark-kotu' : 'pm-fark-iyi'}">${x.d > 0 ? '+' : '−'}${saat(Math.abs(x.d))}</span></li>`).join('')}</ul>` : '<p class="pm-kucuk">Sipariş bitişleri tabanla aynı.</p>') : '<p class="pm-kucuk">Diğerleri buna göre ölçülür.</p>'}
      ${a.sen ? `<label class="tc-alan"><span class="tc-alan-etiket">Karar notu</span><textarea class="tc-alan-kutu" rows="2" data-inp="sen-not" data-v="${esc(a.id)}" placeholder="Neden bu senaryo?" ${yaz ? '' : 'readonly'}>${esc(a.sen.not || '')}</textarea></label><div class="pm-dugmeler">${dugme('Bu planı aç', 'sen-ac', { kucuk: true, veri: `data-v="${esc(a.id)}"` })}</div>` : ''}</article>`; };
  const orta = `<section class="pm-st-orta" aria-label="Yan yana"><div class="pm-st-baslik"><div><h4>Yan yana</h4><p class="pm-kucuk">Küçük tahtalar tezgâhları tahtadaki yerlerinde gösterir.</p></div>
    <div class="pm-seg" role="group" aria-label="Renk">${[['fark', 'Tabana göre fark'], ['doluluk', 'Doluluk']].map(([k, a]) => `<button type="button" data-act="st-sen-kip" data-v="${k}" aria-pressed="${kip === k}">${a}</button>`).join('')}</div></div>
    ${kip === 'fark' ? '<p class="pm-kucuk pm-st-lejant"><i data-fark="kotu"></i>tabandan daha dolu <i data-fark="iyi"></i>daha boş <i data-fark="ayni"></i>aynı</p>' : ''}
    <div class="pm-st-kollar">${secilen.map(kol).join('')}</div></section>`;
  const en = secilen.reduce((a, b) => (b.plan.ozet.wT < a.plan.ozet.wT - 0.05 ? b : a));
  const ek = secilen.length > 1 ? `<div class="pm-st-olcu"><small>En az gecikme</small><b>${esc(en.ad)}</b><span class="mono">${saat(en.plan.ozet.wT)} · ${en.plan.ozet.late} geciken</span></div>` : '';
  return stKabuk('sen', '', sol, orta, stEtki(ek, 'Kayıtlı bir senaryoyu açmak şimdiki planın yerine geçer; önce kaydetmeyi unutmayın.'));
}
