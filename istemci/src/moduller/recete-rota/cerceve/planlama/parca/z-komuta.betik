/* ---------- Komuta: atölye resmi tek yapı olur; gör, düzenle, yön ver, yorumla ----------
   Resmin yanında tek bir komuta paneli durur. Ne seçiliyse (hiçbir şey, tezgâh, sipariş, iş adımı) onunla yapılabilecek
   hamleler orada çıkar: öne al, önceliği değiştir, hedefe yetiştir, ek mesai, tezgâhı boşalt, başka tezgâha taşı, kaydır,
   sabitle. Her hamle motordan geçer, sepete bir adım olarak düşer ve resim hemen yeni plana kayar; panelin altında son
   adımın önce/sonra özeti ve geri alma durur. Yorum için iki şey vardır: siparişin bitişini neyin belirlediği (bekleme
   zinciri) ve "gecikme kaynağı" görünümü, yani geç siparişleri en çok hangi tezgâhın beklettiği. */
const KM = { etki: null, tasi: null };

/* geç siparişlerin bitişini belirleyen zincirde her tezgâhın beklettiği toplam süre */
function kmEtki() {
  const p = gosterilen(); if (KM.etki && KM.etki.p === p && KM.etki.dv === S.dataVer) return KM.etki;
  const cx = cxAl(); const m = {};
  for (const x of S.D.siparisler) { const J = p.J && p.J[x.id]; if (x.havuz || !J || !(J.T > 0.05)) continue; const a = ayristir(p, cx, x.id); if (!a || !a.tam) continue;
    for (const [k, ad, v] of a.kaynak) if (k === 'tezgah') { const e = m[ad] = m[ad] || { v: 0, j: new Set() }; e.v += v; e.j.add(x.id); } }
  const en = Math.max(0, ...Object.values(m).map(e => e.v));
  KM.etki = { p, dv: S.dataVer, m, en }; return KM.etki;
}
/* seçili siparişin bitiş zincirinde hangi tezgâhta ne kadar beklediği */
function kmBekleme(j) {
  const p = gosterilen(); const a = ayristir(p, cxAl(), j); const m = {};
  if (a && a.tam) for (const [k, ad, v] of a.kaynak) if (k === 'tezgah') m[ad] = (m[ad] || 0) + v;
  return { a, m };
}
/* kartın üstüne yorum rozeti: seçili siparişte bekleme, gecikme kaynağı görünümünde beklettiği süre */
function kmKartCiz(g, a, x, y, w, h, k, R, sj) {
  let v = null, ad = '', renk = R.stop;
  const op = U.gySec && S.plan.ops[U.gySec]; const ta = op && KM.tasi && KM.tasi.k === U.gySec + '|' + S.dataVer ? KM.tasi.m[a.m] : null;
  if (ta && !ta.hata) { const d = ta.wT - S.plan.ozet.wT; v = 1; ad = `buraya: ${Math.abs(d) < 0.05 ? 'gecikme aynı' : (d < 0 ? '−' : '+') + saat(Math.abs(d))}`; renk = d < -0.05 ? R.run : d > 0.05 ? R.hold : R.idle; }
  else if (op && a.m === op.m) { v = 1; ad = 'şu an burada'; renk = R.done; }
  else if (sj) { const b = KM.bek && KM.bek.j === sj && KM.bek.dv === S.dataVer ? KM.bek : (KM.bek = { j: sj, dv: S.dataVer, ...kmBekleme(sj) }); v = b.m[a.m]; ad = v ? `bekledi ${saat(v)}` : ''; }
  else if (U.atMercek === 'etki') { const e = kmEtki(); const x0 = e.m[a.m]; if (x0 && e.en > 0) { v = x0.v; ad = `+${saat(v)} · ${x0.j.size} sip.`;
    g.fillStyle = atKarisim(R.stop, 0.08 + 0.32 * (v / e.en)); atYuvarlak(g, x, y, w, h, 10 * k); g.fill(); } }
  if (!v || v < 0.25) return;
  g.font = `700 ${Math.max(10, 11 * Math.min(1.2, k * 1.4))}px ${R.mono}`; const tw = g.measureText(ad).width + 12; const th = Math.max(18, 20 * Math.min(1.2, k * 1.4));
  const bx = x + w - tw + 6, by = y + h - 6;
  g.shadowColor = atKarisim(renk, 0.4); g.shadowBlur = 8; g.fillStyle = renk; atYuvarlak(g, bx, by, tw, th, th / 2); g.fill(); g.shadowBlur = 0;
  g.fillStyle = R.panel; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ad, bx + tw / 2, by + th / 2 + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}
function kmSoluk(m) { if (U.atMercek !== 'etki' || atSecJob()) return false; const e = kmEtki(); return !e.m[m]; }

/* ---------- panel ---------- */
function kmBaslik(ust, ad, alt, kapat = true) {
  return `<header class="pm-km-bas"><span class="pm-km-tur">${esc(ust.toLocaleUpperCase('tr-TR'))}</span><div><b class="mono">${ad}</b>${alt ? `<small>${alt}</small>` : ''}</div>${kapat ? dugme('', 'at-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Seçimi kaldır' }) : ''}</header>`;
}
const kmBolum = (baslik, ic0, simge) => `<section class="pm-km-bolum"><h4>${simge ? ic(simge, 'k') : ''}${esc(baslik)}</h4>${ic0}</section>`;
function kmPlan() {
  const o = S.plan.ozet; const l = atSorunlar(); const e = kmEtki(); const enK = Object.entries(e.m).sort((a, b) => b[1].v - a[1].v)[0];
  return `${kmBaslik('Plan', 'Bütün atölye', `${o.late}/${o.n} sipariş geç · toplam gecikme ${saat(o.wT)}`, false)}
    ${enK ? `<p class="pm-km-yorum">${ic('chart', 'k')}<span>Geç siparişleri en çok <button type="button" class="pm-at-link mono" data-act="at-git-tez" data-v="${esc(enK[0])}">${esc(enK[0])}</button> bekletiyor: ${enK[1].j.size} sipariş, toplam ${saat(enK[1].v)}. ${U.atMercek === 'etki' ? '' : `<button type="button" class="pm-at-link" data-act="km-mercek" data-v="etki">Resimde göster</button>`}</span></p>` : ''}
    ${kmBolum(`Dikkat (${l.length})`, `<ul class="pm-km-liste">${l.map(x => `<li><button type="button" data-act="${x.act}" data-v="${esc(x.v)}" data-ton="${x.ton}">${ic(x.simge, 'k')}<span>${x.metin}</span>${ic('chev-right', 'k')}</button></li>`).join('') || '<li class="pm-kucuk">Sorun yok.</li>'}</ul>`, 'alert')}
    ${kmBolum('Bütün plana yön ver', `<div class="pm-km-hamleler">${dugme('Planı toparla', 'km-toparla', { kucuk: true, simge: 'bolt', yetki: 'plan.yaz' })}${dugme('Bugünü dondur', 'gy-dondur', { kucuk: true, simge: 'lock', yetki: 'plan.kilitle', veri: 'data-v="0"' })}${dugme('Nasıl okunur', 'at-kilavuz', { kucuk: true, hayalet: true, simge: 'help' })}</div>
      <p class="pm-kucuk">Bir tezgâha, siparişe ya da sıra çipine tıklayın; onunla yapabilecekleriniz burada çıkar. Çipi tutup başka tezgâha da sürükleyebilirsiniz.</p>`, 'target')}`;
}
function kmTezgah(m) {
  const s = atSahne(); const t = rsT(); const st = atDurum(s, m, t); const d = s.dol[m] || []; const d0 = rsD0(); const e = kmEtki().m[m];
  const mesai = yetkili('plan.yaz') && m[0] !== '@' ? stMesaiAdaylari(m).slice(0, 4) : [];
  return `${kmBaslik('Tezgâh', esc(m), esc(s.ist[m].ad || ''))}
    <p class="pm-km-durum" data-dur="${st.dur}">${st.dur === 'ariza' ? 'Arıza ya da bakımda.' : st.cal ? `Şu an <b class="mono">${esc(st.cal.id)}</b>, ${esc(fmtDT(S.D, st.cal.C).slice(6))}'e kadar.` : 'Boşta.'}</p>
    ${e ? `<p class="pm-km-yorum" data-ton="hata">${ic('chart', 'k')}<span>${e.j.size} geç siparişi toplam <b>${saat(e.v)}</b> bekletiyor: ${[...e.j].slice(0, 4).map(j => `<button type="button" class="pm-at-link mono" data-act="at-sip" data-v="${esc(j)}">${esc(j)}</button>`).join(', ')}.</span></p>` : ''}
    <div class="pm-at-gunler">${d.map((v, i) => `<button type="button" data-act="at-gunsec" data-v="${i}" title="${esc(olDilimAd(i, true))}: ${v == null ? 'kapalı' : '%' + Math.round(v * 100)}"><i style="height:${v == null ? 0 : Math.min(100, Math.round(v * 100))}%" ${v > 0.97 ? 'data-ton="hata"' : ''}></i><small>${esc(olDilimAd(i))}</small></button>`).join('')}</div>
    ${kmBolum('Yön ver', `<div class="pm-km-hamleler">${dugme('Bugün boşalt', 'tez-bosalt', { kucuk: true, simge: 'upload', yetki: 'plan.yaz', veri: `data-v="${esc(m)}" data-g="0"` })}${dugme('Hepsini boşalt', 'tez-bosalt', { kucuk: true, simge: 'upload', yetki: 'plan.yaz', veri: `data-v="${esc(m)}"` })}${dugme('Sırayı düzenle', 'v20-m-sira', { kucuk: true, simge: 'sort', veri: `data-v="${esc(m)}"` })}${dugme('Gün planı', 'at-gun-tez', { kucuk: true, hayalet: true, simge: 'gantt', veri: `data-v="${esc(m)}"` })}</div>
      ${mesai.length ? `<p class="pm-km-alt">${ic('clock', 'k')}Ek mesai ekle, motor yeniden dizsin:</p><div class="pm-km-hamleler">${mesai.map(x => dugme(x.ad, 'km-mesai', { kucuk: true, veri: `data-v="${x.gun}|${esc(x.vardiya)}" data-m="${esc(m)}"` })).join('')}</div>` : ''}`, 'target')}
    ${kmBolum(`Sıra (${st.bekleyen})`, `<ol class="pm-at-yol">${st.sira.map((r, i) => `<li><b class="mono">${i + 1}</b><button type="button" class="pm-at-link mono" data-act="km-is" data-v="${esc(r.id)}">${esc(r.id)}</button><small class="mono">${esc(fmtDT(S.D, r.S).slice(6))}</small></li>`).join('') || '<li class="pm-kucuk">Sırada iş yok.</li>'}</ol>`, 'list')}`;
}
function kmSiparis(j) {
  const s = atSahne(); const t = rsT(); const l = s.byJ[j] || []; const J = s.J[j] || {}; const sp = S.D.siparisler.find(x => x.id === j) || {}; const cxj = cxAl().jobs[j] || {};
  const { a, m } = kmBekleme(j); const due = cxj.due ?? null; const yaz = yetkili('plan.yaz');
  const ney = a && a.tam ? `<div class="pm-km-neden">${ayrisimCubugu(a, false)}<ul class="pm-ay-lejant">${Object.keys(KAT).filter(k => a.seg[k] > 0.01).sort((x, y) => a.seg[y] - a.seg[x]).slice(0, 4).map(k => `<li><i style="--c:${KAT[k][1]}"></i><span>${esc(KAT[k][0])}</span><b class="mono">${saat(a.seg[k])}</b></li>`).join('')}</ul></div>` : '';
  const hs = U.hedefSonuc && U.hedefSonuc.jid === j ? U.hedefSonuc : null;
  return `${kmBaslik('Sipariş', `<span class="pm-at-nokta" style="background:${esc(atIsRenk(j))}"></span> ${esc(j)}`, `${esc(urunAd(sp.urun))} · ${esc(ONCELIK[sp.oncelik] || '')} öncelik`)}
    <p class="pm-km-durum" ${J.T > 0.05 ? 'data-ton="hata"' : 'data-ton="tamam"'}>${J.C != null ? `Bitiş <b class="mono">${esc(fmtDT(S.D, J.C))}</b>${due != null ? ` · termin <span class="mono">${esc(fmtDT(S.D, due))}</span>` : ''} · ${J.T > 0.05 ? `<b>${esc(gecMetin(J.T))} geç</b>` : 'termine yetişiyor'}` : 'Bitiş belirsiz'}</p>
    ${kmBolum('Bitişi ne belirliyor', ney + (Object.keys(m).length ? `<p class="pm-kucuk">Resimde kırmızı rozetli tezgâhlarda sıra bekliyor: ${Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<b class="mono">${esc(k)}</b> ${saat(v)}`).join(', ')}.</p>` : '<p class="pm-kucuk">Tezgâh beklemesi yok; bitişi işleme, ayar ve fason süreleri belirliyor.</p>'), 'search')}
    ${kmBolum('Yön ver', `<div class="pm-km-hamleler">${dugme('Öne al', 'at-onal', { kucuk: true, birincil: J.T > 0.05, simge: 'flag', yetki: 'plan.yaz', veri: `data-v="${esc(j)}"` })}${dugme('Gün planı', 'at-gun', { kucuk: true, hayalet: true, simge: 'gantt', veri: `data-v="${esc(l[0] ? l[0].id : '')}"` })}</div>
      <p class="pm-km-alt">Öncelik</p><div class="pm-seg" role="group" aria-label="Öncelik">${[1, 2, 3].map(v => `<button type="button" data-act="km-oncelik" data-v="${v}" data-j="${esc(j)}" aria-pressed="${sp.oncelik === v}" ${yaz ? '' : 'disabled'}>${ONCELIK[v]}</button>`).join('')}</div>
      <form class="pm-km-hedef" data-form="km-hedef" novalidate><input type="hidden" name="j" value="${esc(j)}"><label class="tc-alan"><span class="tc-alan-etiket">Şu saate yetiştir</span><input class="tc-alan-kutu" type="datetime-local" name="t" value="${due == null ? '' : isoT(S.D, due).replace(' ', 'T')}" required ${yaz ? '' : 'disabled'}></label><button type="submit" class="tc-dugme tc-dugme-kucuk" ${yaz ? '' : 'disabled'}>${ic('search', 'k')}<span>Seçenek ara</span></button></form>
      ${hs ? `<ul class="pm-km-secenek">${hs.l.map((x, i) => `<li data-ton="${x.yetisir ? 'tamam' : 'uyari'}"><span><b>${esc(x.ad)}</b><small class="mono">bitiş ${esc(fmtDT(S.D, x.c))} · plan gecikmesi ${saat(x.wT)} ${fark(x.wT, S.plan.ozet.wT)}</small></span>${dugme(x.yetisir ? 'Uygula' : 'Yine de', 'hedef-uygula', { kucuk: true, birincil: i === 0 && x.yetisir, veri: `data-v="${i}"` })}</li>`).join('') || '<li class="pm-kucuk">Seçenek bulunamadı.</li>'}</ul>` : ''}`, 'target')}
    ${kmBolum('Yolculuk', `<ol class="pm-at-yol">${l.map((r, i) => `<li ${r.S <= t && r.C > t ? 'data-simdi' : r.C <= t ? 'data-bitti' : ''}><b class="mono">${i + 1}</b><button type="button" class="pm-at-link mono" data-act="km-is" data-v="${esc(r.id)}">${esc(r.m[0] === '@' ? r.m.slice(1) + ' (fason)' : r.m)}</button><small class="mono">${esc(fmtDT(S.D, r.S).slice(6))} → ${esc(fmtDT(S.D, r.C).slice(10))}</small></li>`).join('')}</ol>`, 'gantt')}`;
}
function kmIs(id) {
  const r = S.plan.ops[id]; const o = cxAl().byId[id] || {}; const kl = S.locks[id]; const yaz = yetkili('plan.yaz');
  const al = (o.c || []).filter(c => c.m !== r.m);
  return `${kmBaslik('İş adımı', esc(id), `${esc(o.ad || '')} · ${esc(r.m[0] === '@' ? r.m.slice(1) : r.m)}${kl ? ' · sabit' : ''}`)}
    <p class="pm-km-durum"><span class="mono">${esc(fmtDT(S.D, r.S))} → ${esc(fmtDT(S.D, r.C))}</span> · <button type="button" class="pm-at-link mono" data-act="at-sip" data-v="${esc(r.job)}">${esc(r.job)} siparişine git</button></p>
    ${kmBolum('Başka tezgâha taşı', al.length ? `<ul class="pm-km-secenek" id="km-tasi" data-id="${esc(id)}">${al.map(c => `<li data-m="${esc(c.m)}"><span><b class="mono">${esc(c.m[0] === '@' ? c.m.slice(1) + ' (fason)' : c.m)}</b><small class="mono" data-etki>etkisi hesaplanıyor…</small></span>${dugme('Taşı', 'km-tasi', { kucuk: true, yetki: 'plan.yaz', veri: `data-v="${esc(c.m)}"` })}</li>`).join('')}</ul>` : '<p class="pm-kucuk">Bu adımı başka tezgâh yapamıyor.</p>', 'next')}
    ${kmBolum('Zamanı', `<div class="pm-km-hamleler">${[[-24, '−1 gün'], [-2, '−2 sa'], [2, '+2 sa'], [24, '+1 gün']].map(([v, ad]) => dugme(ad, 'km-kaydir', { kucuk: true, yetki: 'plan.yaz', veri: `data-v="${v}"` })).join('')}${dugme(kl ? 'Sabitliği kaldır' : 'Burada sabitle', 'km-sabit', { kucuk: true, simge: 'lock', yetki: 'plan.kilitle' })}</div><p class="pm-kucuk">Sabit iş motorun yeniden dizmesinde yerinden oynamaz.</p>`, 'clock')}`;
}
/* taşıma seçeneklerinin etkisi çizimden sonra hesaplanır; panel beklemeden açılır */
function kmTasiHesapla() {
  const u = document.getElementById('km-tasi'); if (!u) return; const id = u.dataset.id; const r = S.plan.ops[id]; if (!r) return;
  const k = id + '|' + S.dataVer; if (!KM.tasi || KM.tasi.k !== k) KM.tasi = { k, m: {} };
  const t = Math.max(rsSimdi(), r.S); const J0 = S.plan.J[r.job] || {};
  for (const li of u.querySelectorAll('li[data-m]')) { const m = li.dataset.m; let e = KM.tasi.m[m];
    if (!e) { try { const x = v20EtkiHesapla(id, m, t); e = KM.tasi.m[m] = { wT: x.wT, c: x.p.ops[id] ? x.p.ops[id].C : null, jc: (x.p.J || {})[r.job] ? x.p.J[r.job].C : null, dusen: x.dusen }; } catch (er) { e = KM.tasi.m[m] = { hata: true }; } }
    const el = li.querySelector('[data-etki]'); if (!el) continue;
    if (e.hata) { el.textContent = 'hesaplanamadı'; continue; }
    const d = e.wT - S.plan.ozet.wT; li.dataset.ton = d < -0.05 ? 'tamam' : d > 0.05 ? 'uyari' : '';
    el.innerHTML = `adım biter ${esc(fmtDT(S.D, e.c))} · plan gecikmesi ${saat(e.wT)} ${fark(e.wT, S.plan.ozet.wT)}${e.dusen && e.dusen.length ? ` · <span data-ton="hata">geç kalır: ${esc(e.dusen.slice(0, 3).join(', '))}</span>` : ''}`; }
}
/* son hamlenin sonucu ve geri alma: her panelin altında */
function kmSonAdim() {
  if (U.hamle && !U.taslak) return `<footer class="pm-km-son"><span>${ic('eye', 'k')}<b>Önizleme:</b> ${esc(U.hamle.ad)} · gecikme ${saat(S.plan.ozet.wT)} → <b>${saat(U.hamle.plan.ozet.wT)}</b></span><div class="pm-km-hamleler">${dugme('Uygula', 'hamle-uygula', { kucuk: true, birincil: true, simge: 'check' })}${dugme('Vazgeç', 'hamle-vazgec', { kucuk: true, hayalet: true })}</div></footer>`;
  const a = U.taslak && U.taslak.adimlar; if (!a || !a.length) return '';
  const x = a[a.length - 1]; const kotu = x.o1.wT > x.o0.wT + 0.05;
  return `<footer class="pm-km-son" data-ton="${kotu ? 'uyari' : x.o1.wT < x.o0.wT - 0.05 ? 'tamam' : ''}"><span>${ic('layers', 'k')}<b>Son adım:</b> ${esc(x.ad)}</span>
    <span class="mono">gecikme ${saat(x.o0.wT)} → <b>${saat(x.o1.wT)}</b> ${fark(x.o1.wT, x.o0.wT)} · geciken ${x.o0.late} → <b>${x.o1.late}</b></span>
    ${x.dusen && x.dusen.length ? `<span data-ton="hata">Gecikmeye düşen: ${esc(x.dusen.slice(0, 4).join(', '))}</span>` : ''}
    <div class="pm-km-hamleler">${dugme('Geri al', 'taslak-don', { kucuk: true, simge: 'rotate', veri: `data-v="${a.length - 1}"` })}${kotu ? dugme('Toparla', 'km-toparla', { kucuk: true, simge: 'bolt', yetki: 'plan.yaz' }) : ''}${a.length > 1 ? dugme(`${a.length} adımın hepsini geri al`, 'taslak-don', { kucuk: true, hayalet: true, veri: 'data-v="0"' }) : ''}</div></footer>`;
}
function kmAside() {
  if (AT.kilavuz) return `<aside class="pm-at-kart" aria-label="Kılavuz">${atKart()}</aside>`;
  const sj = atSecJob(); const op = U.gySec && S.plan.ops[U.gySec] ? U.gySec : null;
  const dar = innerWidth < 900; const secim = op || sj || U.rsTez;
  if (dar && !secim && !U.kmAcik) return `<aside class="pm-at-kart pm-km" data-kapali aria-label="Komuta"><button type="button" class="pm-km-ac" data-act="km-ac">${ic('target', 'k')}<b>Yön ver</b><span class="pm-at-sayi" ${atSorunlar().length ? 'data-ton="hata"' : ''}>${atSorunlar().length}</span>${ic('up', 'k')}</button>${kmSonAdim()}</aside>`;
  const govde = op ? kmIs(op) : sj && atSahne().byJ[sj] ? kmSiparis(sj) : U.rsTez && atSahne().ist[U.rsTez] ? kmTezgah(U.rsTez) : kmPlan();
  return `<aside class="pm-at-kart pm-km" aria-label="Komuta">${dar && !secim ? `<button type="button" class="pm-km-ac" data-act="km-ac" aria-expanded="true">${ic('down', 'k')}<b>Gizle</b></button>` : ''}${govde}${kmSonAdim()}</aside>`;
}

/* ---------- hamleler ---------- */
function kmOncelik(j, v) {
  const s = S.D.siparisler.find(x => x.id === j); if (!s || s.oncelik === v || !yetkili('plan.yaz') || calisan) return;
  const eski = S.D.siparisler; S.D.siparisler = eski.map(x => x.id === j ? { ...x, oncelik: v } : x);
  let st; try { st = stOf(); } finally { S.D.siparisler = eski; }
  const cx = compile(st); const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true); const p = kisaArama(st, cx, p0, 700);
  hamleKur(p, st, `${j} önceliği ${ONCELIK[v].toLocaleLowerCase('tr-TR')}`, { kaynak: 'elle' }); U.hamle.oncelik = { id: j, v }; render();
}
function kmMesai(m, gun, vardiya) {
  if (!yetkili('plan.yaz') || calisan) return;
  const em = [...S.ekMesai, { m, gun: +gun, vardiya }]; const st = { ...stOf(), ekMesai: clone(em) }; const cx = compile(st);
  const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
  const L = lns(st, p0, null, { ms: 500, seed: 11, free: true });
  const p = cmpEv(L.e, evaluate(p0, st, null, true)) > 0 ? L.plan : p0; slack(p, cx);
  hamleKur(p, st, `Ek mesai: ${m} ${fmtDT(S.D, gun * 24).slice(0, 9)} ${vardiya}`, { ekMesai: em, kaynak: 'motor' }); render();
}
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('[data-form="km-hedef"]'); if (!f) return; e.preventDefault();
  const v = f.elements.t.value; const t = v ? parseT(S.D, v.replace('T', ' ')) : null; if (t == null) { bildir('Saat girin.', 'hata'); return; }
  hedefAra(f.elements.j.value, t);
});
const kmTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'km-ac': U.kmAcik = !U.kmAcik; render(); return true;
    case 'km-mercek': U.atMercek = U.atMercek === v ? 'durum' : v; render(); return true;
    case 'km-toparla': toparla(); return true;
    case 'km-oncelik': kmOncelik(el.dataset.j, +v); return true;
    case 'km-mesai': { const [g, vr] = String(v).split('|'); kmMesai(el.dataset.m, +g, vr); return true; }
    case 'km-is': { const r = S.plan.ops[v]; if (!r) return true; AT.kilavuz = false; U.gySec = v; U.secJob = r.job; U.rsTez = null; render(); return true; }
    case 'km-tasi': { const id = U.gySec; const r = id && S.plan.ops[id]; if (!r) return true; gyTasi(id, v, Math.max(rsSimdi(), r.S)); return true; }
    case 'km-kaydir': if (U.gySec) { U.gyCoklu = []; gyKaydir(+v); } return true;
    case 'km-sabit': { const id = U.gySec; const r = id && S.plan.ops[id]; if (!r) return true; const kl = S.locks[id];
      degistir(kl ? 'Sabitlik kaldırıldı' : 'İş sabitlendi', id, () => { if (kl) delete S.locks[id]; else S.locks[id] = { m: r.m, S: r.S }; }, 'plan.kilitle', { planKoru: true }); return true; }
  }
  return kmTekEski(act, v, el, e);
};
/* atölye resmindeyken hedef seçenekleri ve çözüm kartı komuta panelinde gösterilir */
const kmCozumEski = cozumKarti;
cozumKarti = function () { if (mercekAl() === 'resim' && U.rsKip !== 'pano') return ''; return kmCozumEski(); };
const kmRenderEski = render;
render = function () { kmRenderEski(); if (document.getElementById('km-tasi')) setTimeout(() => { kmTasiHesapla(); atTetikle(); }, 30); };
