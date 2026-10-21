/* ---------- Malzeme planı: alım ve bütçe ----------
   Plandan çıkar: her siparişin malzemesi ilk işleminin planlanan başlangıcında gerekir. İhtiyaç sırayla stoktan, açık satın alma
   siparişlerinden karşılanır (motorun matAlloc dağıtımı); kalan yeni alımdır. Yeni alımın tarihi en geç sipariş verme günüdür
   (ihtiyaç − muayene − tedarik süresi); açık siparişin tarihi teslim günüdür. Kırılım ortak dönem düğmesinden gelir:
   Gün günlük, Hafta haftalık, Ay aylık, Yıl yıllık. Tutar malzemenin birim fiyatıyla hesaplanır; tutarı yalnız müdür ve yönetici görür. */
U.mpGor = 'butce'; U.mpDag = 'malzeme';
const MP_KAY = [['stok', 'Stoktan', 'var(--grafik-2)'], ['acik', 'Açık siparişten', 'var(--grafik)'], ['yeni', 'Yeni alım', 'var(--hazard)']];
const MP_KIRILIM = { gun: 'Günlük', hafta: 'Haftalık', ay: 'Aylık', yil: 'Yıllık' };
const mpTarih = t => new Date(baseMs(S.D) + t * 3600000);
const mpSaat = d => (d.getTime() - baseMs(S.D)) / 3600000;
function mpKova(t) {
  const d = mpTarih(t); const y = d.getUTCFullYear(), m = d.getUTCMonth(), g = d.getUTCDate();
  if (U.olcek === 'yil') return mpSaat(new Date(Date.UTC(y, 0, 1)));
  if (U.olcek === 'ay') return mpSaat(new Date(Date.UTC(y, m, 1)));
  if (U.olcek === 'hafta') { const gn = (d.getUTCDay() + 6) % 7; return mpSaat(new Date(Date.UTC(y, m, g - gn))); }
  return mpSaat(new Date(Date.UTC(y, m, g)));
}
function mpKovaSonraki(k) {
  const d = mpTarih(k); const y = d.getUTCFullYear(), m = d.getUTCMonth(), g = d.getUTCDate();
  return mpSaat(U.olcek === 'yil' ? new Date(Date.UTC(y + 1, 0, 1)) : U.olcek === 'ay' ? new Date(Date.UTC(y, m + 1, 1)) : new Date(Date.UTC(y, m, g + (U.olcek === 'hafta' ? 7 : 1))));
}
function mpKovaAd(k, uzun) {
  const d = mpTarih(k); const g = fmtDT(S.D, k);
  if (U.olcek === 'yil') return String(d.getUTCFullYear());
  if (U.olcek === 'ay') return `${OL_AY[d.getUTCMonth()]}${uzun ? ' ' + d.getUTCFullYear() : ''}`;
  if (U.olcek === 'hafta') return uzun ? `${g.slice(0, 5)}–${fmtDT(S.D, mpKovaSonraki(k) - 24).slice(0, 5)}` : g.slice(0, 5);
  return uzun ? g.slice(0, 9) : g.slice(0, 5);
}
/* satırlar: her biri bir malzeme miktarı, kaynağı, tarihi ve siparişi */
function mpVeri() {
  const p = gosterilen(); if (!p || !p.ops) return null; const cx = cxAl(); const D = S.D; const now = cx.st.now;
  const anah = [p === S.plan ? 'p' : 'o', S.dataVer, U.olcek].join('|');
  if (U.mpV && U.mpV.p === p && U.mpV.anah === anah) return U.mpV;
  const mats = Object.fromEntries((D.malzemeler || []).map(m => [m.kod, m]));
  const ilk = {}; for (const r of Object.values(p.ops)) if (isFinite(r.S) && !r.done && (ilk[r.job] == null || r.S < ilk[r.job])) ilk[r.job] = r.S;
  const sat = [];
  for (const jid in cx.mat.res) { const ih = ilk[jid]; if (ih == null) continue;
    for (const d of cx.mat.res[jid].det) { const m = mats[d.kod] || {}; const mu = (+m.muayeneGun || 0) * 24, td = (+m.tedarikGun || 0) * 24;
      for (const u of d.use) { const po = u.k === 'sa' ? (D.satinalma || [])[u.i] : null; const tur = u.k === 'stok' ? 'stok' : po ? 'acik' : 'yeni';
        sat.push({ kod: d.kod, j: jid, q: u.q, tur, po: po ? u.i : null, ihtiyac: ih, alim: tur === 'acik' ? (parseT(D, po.gelis) ?? ih) : tur === 'yeni' ? ih - mu - td : ih, ted: po ? po.tedarikci : null }); }
      if (d.eksikQ > 0) sat.push({ kod: d.kod, j: jid, q: d.eksikQ, tur: 'yeni', ihtiyac: ih, alim: ih - mu - td, ted: null }); } }
  /* açık siparişin işe bağlanmayan kısmı da ödenecek paradır: stoğa girer */
  (D.satinalma || []).forEach((po, i) => { const kul = sat.filter(s => s.po === i).reduce((x, s) => x + s.q, 0); const kal = (+po.miktar || 0) - kul; const t = parseT(D, po.gelis);
    if (kal > 1e-6 && t != null) sat.push({ kod: po.kod, j: null, q: kal, tur: 'acik', po: i, ihtiyac: t, alim: t, ted: po.tedarikci }); });
  for (const s of sat) { const m = mats[s.kod]; s.fiyat = m && m.birimFiyat != null ? +m.birimFiyat : null; s.tl = s.fiyat == null ? null : s.fiyat * s.q; s.gec = s.tur === 'yeni' && s.alim < now; }
  /* kovalar: bugünden son tarihe kadar; geçmiş tarihli yeni alım "Hemen" kovasına düşer */
  const t0 = mpKova(now); const son = Math.max(now, ...sat.map(s => Math.max(s.ihtiyac, s.alim)));
  const kova = []; for (let k = t0; k <= son && kova.length < 400; k = mpKovaSonraki(k)) kova.push(k);
  const kno = t => { if (t < t0) return 0; let i = kova.length - 1; while (i > 0 && kova[i] > t) i--; return i; };
  for (const s of sat) { s.kA = kno(s.alim); s.kI = kno(s.ihtiyac); }
  const havuz = D.siparisler.filter(s => s.havuz || !ilk[s.id]).length;
  U.mpV = { p, anah, sat, kova, now, mats, havuz, fiyatsiz: [...new Set(sat.filter(s => s.fiyat == null).map(s => s.kod))] };
  return U.mpV;
}
const mpMiktar = (q, kod) => `${sayi(q, q < 10 ? 1 : 0)} ${esc((S.D.malzemeler.find(m => m.kod === kod) || {}).birim || '')}`;
function mpGrafik(v, fg) {
  const alan = U.mpGor === 'butce' ? 'kA' : 'kI'; const kay = U.mpGor === 'butce' ? MP_KAY.slice(1) : MP_KAY;
  const deger = s => fg ? s.tl || 0 : s.q;
  const top = v.kova.map((_, i) => Object.fromEntries(kay.map(([k]) => [k, v.sat.filter(s => s[alan] === i && s.tur === k).reduce((a, s) => a + deger(s), 0)])));
  const enB = Math.max(1e-9, ...top.map(o => Object.values(o).reduce((a, x) => a + x, 0)));
  const bic = x => fg ? agKisa(x) : sayi(x, 0);
  const sut = v.kova.map((k, i) => { const o = top[i]; const t = Object.values(o).reduce((a, x) => a + x, 0); const hemen = i === 0 && v.sat.some(s => s.gec && s[alan] === 0);
    return `<div class="pm-mp-sut" title="${esc(mpKovaAd(k, true))}: ${kay.map(([kk, ad]) => `${ad} ${bic(o[kk])}`).join(', ')}"><b class="mono">${t > 0 ? esc(bic(t)) : ''}</b><div class="pm-mp-cubuk">${kay.map(([kk, , renk]) => o[kk] > 0 ? `<i style="height:${(o[kk] / enB * 100).toFixed(2)}%;background:${renk}"></i>` : '').join('')}</div><small ${hemen ? 'data-ton="hata"' : ''}>${esc(mpKovaAd(k))}</small></div>`; }).join('');
  const lejl = `<ul class="pm-br-lejl">${kay.map(([kk, ad, renk]) => `<li><i style="background:${renk}"></i><span>${ad}</span><b class="mono">${esc(bic(top.reduce((a, o) => a + o[kk], 0)))}</b></li>`).join('')}</ul>`;
  return `<div class="pm-mp-grafik" role="img" aria-label="${U.mpGor === 'butce' ? 'Alım bütçesi' : 'Malzeme ihtiyacı'}, ${MP_KIRILIM[U.olcek].toLocaleLowerCase('tr-TR')}"><div class="pm-mp-sutunlar" style="--n:${v.kova.length}">${sut}</div></div>${lejl}`;
}
function mpDagilim(v, fg) {
  const alan = U.mpGor === 'butce' ? 'kA' : 'kI'; const l = U.mpGor === 'butce' ? v.sat.filter(s => s.tur !== 'stok') : v.sat;
  const anahtar = U.mpDag === 'siparis' ? s => s.j || 'Stoğa (bağlı iş yok)' : U.mpDag === 'tedarikci' ? s => s.ted || (s.tur === 'yeni' ? 'Tedarikçi seçilmedi' : 'Stok') : s => s.kod;
  const ad = x => x.startsWith('Stoğa') ? esc(x) : U.mpDag === 'malzeme' ? `<b class="mono">${esc(x)}</b> <span class="pm-kucuk">${esc((v.mats[x] || {}).ad || '')}</span>` : U.mpDag === 'tedarikci' ? esc((S.D.tedarikciler.find(t => t.id === x) || {}).ad || x) : `<b class="mono">${esc(x)}</b>`;
  const gr = {}; for (const s of l) (gr[anahtar(s)] = gr[anahtar(s)] || []).push(s);
  const hucre = (ls) => { if (!ls.length) return '<span class="pm-mp-bos">·</span>'; const tl = ls.some(s => s.tl == null) ? null : ls.reduce((a, s) => a + s.tl, 0);
    const q = U.mpDag === 'malzeme' ? mpMiktar(ls.reduce((a, s) => a + s.q, 0), ls[0].kod) : ''; return fg ? `${tl == null ? '<span data-ton="uyari">fiyat yok</span>' : esc(agTL(tl))}${q ? `<br><small>${q}</small>` : ''}` : q || String(ls.length); };
  const sira = Object.entries(gr).sort((a, b) => (b[1].reduce((x, s) => x + (fg ? s.tl || 0 : s.q), 0)) - (a[1].reduce((x, s) => x + (fg ? s.tl || 0 : s.q), 0)));
  const kol = v.kova.map((k, i) => ({ k, i })).filter(({ i }) => l.some(s => s[alan] === i));
  const bas = `<th>${U.mpDag === 'malzeme' ? 'Malzeme' : U.mpDag === 'siparis' ? 'Sipariş' : 'Tedarikçi'}</th>${kol.map(({ k, i }) => `<th class="pm-num">${i === 0 && l.some(s => s.gec && s[alan] === 0) ? 'Hemen · ' : ''}${esc(mpKovaAd(k, true))}</th>`).join('')}<th class="pm-num">Toplam</th>`;
  const sat = sira.map(([x, ls]) => `<tr>${td('', ad(x))}${kol.map(({ k, i }) => td(mpKovaAd(k, true), hucre(ls.filter(s => s[alan] === i)), 'pm-num')).join('')}${td('Toplam', `<b>${hucre(ls)}</b>`, 'pm-num')}</tr>`).join('');
  const alt = fg ? `<tr class="pm-mp-top">${td('', '<b>Toplam</b>')}${kol.map(({ k, i }) => td(mpKovaAd(k, true), `<b>${hucre(l.filter(s => s[alan] === i))}</b>`, 'pm-num')).join('')}${td('Toplam', `<b>${hucre(l)}</b>`, 'pm-num')}</tr>` : '';
  const seg = `<div class="pm-seg" role="group" aria-label="Dağılım">${[['malzeme', 'Malzeme'], ['siparis', 'Sipariş'], ['tedarikci', 'Tedarikçi']].map(([k, a]) => `<button type="button" data-act="mp-dag" data-v="${k}" aria-pressed="${U.mpDag === k}">${a}</button>`).join('')}</div>`;
  return `<div class="pm-sira">${seg}</div><div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-mp-tablo"><thead><tr>${bas}</tr></thead><tbody>${sat || `<tr><td colspan="${kol.length + 2}" class="pm-kucuk">Bu görünümde satır yok.</td></tr>`}${alt}</tbody></table></div>`;
}
function mpAlimListe(v, fg) {
  const y = v.sat.filter(s => s.tur === 'yeni'); const gr = {};
  for (const s of y) { const k = s.kod + '|' + s.kA; const g = gr[k] = gr[k] || { kod: s.kod, kA: s.kA, q: 0, tl: 0, fy: true, alim: s.alim, ihtiyac: s.ihtiyac, j: new Set() }; g.q += s.q; if (s.tl == null) g.fy = false; else g.tl += s.tl; g.alim = Math.min(g.alim, s.alim); g.ihtiyac = Math.min(g.ihtiyac, s.ihtiyac); g.j.add(s.j); }
  const l = Object.values(gr).sort((a, b) => a.alim - b.alim);
  if (!l.length) return '<p class="pm-kucuk">Yeni alım gerekmiyor: ihtiyaç stoktan ve açık siparişlerden karşılanıyor.</p>';
  return `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Malzeme</th><th class="pm-num">Miktar</th>${fg ? '<th class="pm-num">Tutar</th>' : ''}<th>En geç sipariş</th><th>İhtiyaç</th><th>Siparişler</th></tr></thead><tbody>${l.map(g => `<tr ${g.alim < v.now ? 'data-ton="hata"' : ''}>${td('Malzeme', `<b class="mono">${esc(g.kod)}</b> <span class="pm-kucuk">${esc((v.mats[g.kod] || {}).ad || '')}</span>`)}${td('Miktar', mpMiktar(g.q, g.kod), 'pm-num')}${fg ? td('Tutar', g.fy ? esc(agTL(g.tl)) : '<span data-ton="uyari">fiyat yok</span>', 'pm-num') : ''}${td('En geç sipariş', `<span class="mono">${esc(fmtDT(S.D, g.alim).slice(0, 9))}</span>${g.alim < v.now ? ' ' + rozet('gecikti', 'hata') : ''}`)}${td('İhtiyaç', `<span class="mono">${esc(fmtDT(S.D, g.ihtiyac).slice(0, 15))}</span>`)}${td('Siparişler', `<span class="mono">${[...g.j].map(esc).join(', ')}</span>`)}</tr>`).join('')}</tbody></table></div>`;
}
function sMalzemePlani() {
  const v = mpVeri(); if (!v) return kart(`${ic('box', 'k')} Malzeme planı`, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  const fg = agFiyatGorur(); const say = (f) => v.sat.filter(f);
  const topTL = f => { const l = say(f); return l.some(s => s.tl == null) ? null : l.reduce((a, s) => a + s.tl, 0); };
  const gec = say(s => s.gec); const gecMal = new Set(gec.map(s => s.kod)).size;
  const kut = [
    ['box', 'Toplam ihtiyaç', fg ? agTL(topTL(s => s.j)) : `${say(s => s.j).length} kalem`, 'planlı siparişlerin malzemesi'],
    ['check', 'Stoktan', fg ? agTL(topTL(s => s.tur === 'stok')) : `${say(s => s.tur === 'stok').length} kalem`, 'eldeki stok'],
    ['truck', 'Açık siparişler', fg ? agTL(topTL(s => s.tur === 'acik')) : `${say(s => s.tur === 'acik').length} kalem`, 'verilmiş satın alma; işe bağlanmayan kısım stoğa'],
    ['lira', 'Yeni alım', fg ? agTL(topTL(s => s.tur === 'yeni')) : `${say(s => s.tur === 'yeni').length} kalem`, 'verilmesi gereken sipariş', 'uyari'],
    ['alert', 'Geciken alım', String(gecMal), 'en geç sipariş günü geçmiş malzeme', gecMal ? 'hata' : 'tamam'],
  ];
  const kpi = `<div class="pm-mp-kpi">${kut.map(([sm, ad, d, alt, ton]) => `<div ${ton ? `data-ton="${ton}"` : ''}><small>${ic(sm, 'k')}${ad}</small><b class="mono">${esc(d)}</b><span>${alt}</span></div>`).join('')}</div>`;
  const gor = `<div class="pm-seg" role="group" aria-label="Grafik">${[['butce', 'Alım bütçesi'], ['ihtiyac', 'İhtiyaç']].map(([k, a]) => `<button type="button" data-act="mp-gor" data-v="${k}" aria-pressed="${U.mpGor === k}">${a}</button>`).join('')}</div>`;
  const not = [U.mpGor === 'butce' ? 'Alım bütçesi parayı çıkış gününe koyar: yeni alım en geç sipariş verme gününe, açık sipariş teslim gününe. Stoktan karşılanan alım değildir.' : 'İhtiyaç malzemenin gerektiği güne (ilk işlemin başlangıcı) konur, kaynağına göre bölünür.',
    fg ? 'Tutar birim fiyat × miktar.' : 'Tutarı müdür ve yönetici görür (karar 180 bekliyor; öneri a uygulandı); burada miktar ve kalem sayısı var.',
    v.fiyatsiz.length ? `Birim fiyatı olmayan malzeme: ${v.fiyatsiz.map(esc).join(', ')}.` : '',
    v.havuz ? `Plana alınmamış ${v.havuz} sipariş dahil değil.` : 'Bütün siparişler planda.',
    'Uydurma veride plan birkaç haftalık; aylık ve yıllık kırılım bu yüzden tek kova gösterir.'].filter(Boolean).join(' ');
  const ust = `<div class="pm-mp-ust"><span class="pm-kucuk">Kırılım: <b>${MP_KIRILIM[U.olcek]}</b></span><div class="pm-sg-sec pm-ol-ortak" role="group" aria-label="Kırılım">${OLCEK.map(([k, n]) => `<button type="button" data-act="ol-sec" data-v="${k}" aria-pressed="${U.olcek === k}">${n}</button>`).join('')}</div>${gor}</div>`;
  return kart(`${ic('box', 'k')} Malzeme planı <span class="pm-kucuk">plandan; alım ve bütçe için</span>`, `${ust}${kpi}${mpGrafik(v, fg)}<p class="pm-kucuk">${not}</p>`)
    + kart(`${ic('grid', 'k')} Dağılım ve toplam`, mpDagilim(v, fg))
    + mpSatinalmaPlani(fg);
}
GORUNUM.malzplan = sMalzemePlani;
{ const v = EKRANLAR.find(e => e[0] === 'veri'); if (v && !v[3].some(x => x[0] === 'malzplan')) { const i = v[3].findIndex(x => x[0] === 'malzeme'); v[3].splice(i < 0 ? v[3].length : i + 1, 0, ['malzplan', 'Malzeme planı', 'box']); } SAYFA_AD.malzplan = 'Malzeme planı'; EKRAN_OF.malzplan = 'veri'; }
const mpTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'mp-gor') { U.mpGor = v; render(); return true; }
  if (act === 'mp-dag') { U.mpDag = v; render(); return true; }
  if (act === 'ol-sec' && U.sayfa === 'malzplan') { U.olcek = v; U.olKay = 0; render(); return true; }
  return mpTekEski(act, v, el, e);
};

/* ---- Satın alma planı: üretim planından gerekli geliş, girilen termin ve planı karşılayıp karşılamadığı ----
   Gerekli: malzemeyi kullanan ilk işin planlanan başlangıcı eksi giriş muayenesi. En geç: siparişin terminini kaçırmadan gelebileceği son an
   (siparişin bolluğu kadar; tezgâh sırası yok sayılır). Etkin geliş: termin + tedarikçinin ortalama gecikmesi. Hesap motorun satinalmaListe'sidir. */
function mpTarihGir(t) { if (t == null || !isFinite(t)) return ''; const d = mpTarih(t); return d.toISOString().slice(0, 10); }
const mpGun = h => `${sayi(Math.abs(h) / 24, Math.abs(h) < 240 ? 1 : 0)} gün`;
function mpDurum(r, now) {
  if (r.etkin == null) return ['Termin yok', 'pasif', 'Termin girin; plan buna göre denetlenir.'];
  if (r.plan == null) return ['Bağlı iş yok', 'pasif', 'Bu alım plandaki bir işe gitmiyor; stoğa girer.'];
  if (r.enGec != null && r.etkin > r.enGec + 1e-6) return ['Siparişi geciktirir', 'hata', `En geç gelişten ${mpGun(r.etkin - r.enGec)} sonra geliyor: bağlı sipariş termini kaçırır. Termini öne çekin ya da hızlandırın.`];
  if (r.etkin > r.plan + 1e-6) return ['Plandan geç', 'uyari', `Planın istediğinden ${mpGun(r.etkin - r.plan)} sonra geliyor. Plan işi malzeme gelmeden başlatıyor (malzeme yalnız uyarı); iş kayar, sipariş termini yine tutar.`];
  if (r.etkin < r.plan - 10 * 24) return ['Karşılıyor, erken', 'tamam', `Gerekenden ${mpGun(r.plan - r.etkin)} önce geliyor; ertelenebilir.`];
  return ['Karşılıyor', 'tamam', `Gerekenden ${mpGun(r.plan - r.etkin)} önce geliyor.`];
}
function mpSatinalmaPlani(fg) {
  const p = gosterilen(); if (!p || !p.ops) return ''; const cx = cxAl(); const D = S.D; const now = cx.st.now; const yaz = yetkili('veri.yaz');
  let L = []; try { L = satinalmaListe({ ops: p.ops, cx }, { D, now }); } catch (e) { L = []; }
  const mats = Object.fromEntries((D.malzemeler || []).map(m => [m.kod, m])); const ted = D.tedarikciler || [];
  const fiyat = (kod, q) => { const m = mats[kod]; return m && m.birimFiyat != null ? m.birimFiyat * q : null; };
  const saIdx = []; (D.satinalma || []).forEach((x, i) => saIdx.push(i));
  let iSa = 0; const satir = L.map(r => {
    const mat = `<b class="mono">${esc(r.kod)}</b> <span class="pm-kucuk">${esc((mats[r.kod] || {}).ad || '')}</span>`;
    const tarih = t => t == null || !isFinite(t) ? '—' : `<span class="mono">${esc(fmtDT(D, t).slice(0, 9))}</span>`;
    if (r.tur === 'sa') { const i = saIdx[iSa++]; const po = D.satinalma[i]; const [d, ton, ip] = mpDurum(r, now);
      const termin = yaz ? `<input class="pm-mz-sec" type="date" value="${mpTarihGir(parseT(D, po.gelis))}" data-chg="mp-termin" data-i="${i}" aria-label="${esc(r.kod)} satın alma termini">` : tarih(parseT(D, po.gelis));
      return { s: r.plan ?? 1e9, h: `<tr data-ton="${ton === 'hata' ? 'hata' : ''}">${td('Malzeme', mat)}${td('Durum', `<span title="${esc(ip)}">${rozet(d, ton)}</span><br><small class="pm-kucuk">${esc(ip)}</small>`)}${td('Miktar', mpMiktar(r.miktar, r.kod), 'pm-num')}${fg ? td('Tutar', esc(agTL(fiyat(r.kod, r.miktar))), 'pm-num') : ''}${td('Siparişler', `<span class="mono">${r.jobs.map(esc).join(', ') || '—'}</span>`)}${td('Gerekli geliş', tarih(r.plan))}${td('En geç', tarih(r.enGec))}${td('Satın alma termini', `${termin}<br><small class="pm-kucuk">${esc((ted.find(t => t.id === r.tedarikci) || {}).ad || r.tedarikci || '—')}</small>`)}${td('Etkin geliş', tarih(r.etkin))}</tr>` }; }
    const form = yaz ? `<form class="pm-mp-yeni" data-form="mp-yeni" novalidate><input type="hidden" name="kod" value="${esc(r.kod)}"><input type="hidden" name="q" value="${r.miktar}"><select class="pm-mz-sec" name="ted" aria-label="Tedarikçi">${ted.map(t => `<option value="${esc(t.id)}">${esc(t.ad)}</option>`).join('')}</select><input class="pm-mz-sec" type="date" name="t" value="${mpTarihGir(r.plan)}" aria-label="Termin"><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil">${ic('plus', 'k')}<span>Sipariş ver</span></button></form>` : '<span class="pm-kucuk">Satın alma girer</span>';
    const gec = r.siparisEnGec != null && r.siparisEnGec < now;
    return { s: r.plan ?? 1e9, h: `<tr data-ton="hata">${td('Malzeme', mat)}${td('Durum', `${rozet('Sipariş yok', 'hata')}<br><small class="pm-kucuk">${r.siparisEnGec != null ? `En geç ${esc(fmtDT(D, r.siparisEnGec).slice(0, 9))} sipariş verilmeli (tedarik ${sayi((mats[r.kod] || {}).tedarikGun ?? 0, 0)} gün)${gec ? '; bu gün geçti' : ''}.` : 'Tedarik süresi yok.'}</small>`)}${td('Miktar', mpMiktar(r.miktar, r.kod), 'pm-num')}${fg ? td('Tutar', esc(agTL(fiyat(r.kod, r.miktar))), 'pm-num') : ''}${td('Siparişler', `<span class="mono">${r.jobs.map(esc).join(', ')}</span>`)}${td('Gerekli geliş', tarih(r.plan))}${td('En geç', tarih(r.enGec))}${td('Satın alma termini', form)}${td('Etkin geliş', '—')}</tr>` };
  }).sort((a, b) => a.s - b.s);
  const say = { tamam: 0, uyari: 0, hata: 0 }; for (const r of L) { const t = r.tur === 'sa' ? mpDurum(r, now)[1] : 'hata'; if (say[t] != null) say[t]++; }
  const ozet = `<div class="pm-ag-ozet"><span>${rozet(`${say.tamam} karşılıyor`, 'tamam')}</span><span>${rozet(`${say.uyari} plandan geç`, 'uyari')}</span><span>${rozet(`${say.hata} siparişi geciktirir ya da sipariş yok`, 'hata')}</span>${planGuncel() ? '' : `<span class="pm-kucuk">Veri değişti: durum yeni terminle hesaplandı; işlerin yeri için planı iyileştirin.</span>`}</div>`;
  const bas = `<th>Malzeme</th><th>Durum</th><th class="pm-num">Miktar</th>${fg ? '<th class="pm-num">Tutar</th>' : ''}<th>Siparişler</th><th>Gerekli geliş</th><th>En geç</th><th>Satın alma termini</th><th>Etkin geliş</th>`;
  const not = '<p class="pm-kucuk">Gerekli geliş: malzemeyi kullanan ilk işin planlanan başlangıcı, giriş muayenesi düşülmüş. En geç: sipariş terminini kaçırmadan gelebileceği son gün (siparişin bolluğu kadar; tezgâh sırası yok sayılır, yaklaşık). Etkin geliş: termin + tedarikçinin ortalama gecikmesi + muayene. Termini değiştirince durum hemen yeniden hesaplanır.</p>';
  return kart(`${ic('truck', 'k')} Satın alma planı <span class="pm-kucuk">üretim planına göre</span>`, `${ozet}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-mp-sa"><thead><tr>${bas}</tr></thead><tbody>${satir.map(x => x.h).join('') || `<tr><td colspan="9" class="pm-kucuk">Açık satın alma ve eksik malzeme yok.</td></tr>`}</tbody></table></div>${not}`);
}
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || el.dataset.chg !== 'mp-termin') return;
  const po = (S.D.satinalma || [])[+el.dataset.i]; if (!po) return; if (!el.value) { bildir('Tarih girin.', 'hata'); render(); return; }
  const saat = (String(po.gelis || '').split(' ')[1]) || '08:00'; const yeni = `${el.value} ${saat}`;
  degistir('Satın alma termini değişti', `${po.kod} ${po.miktar}: ${po.gelis || '—'} → ${yeni}`, () => { po.gelis = yeni; U.mpV = null; });
  render();
});
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('[data-form="mp-yeni"]'); if (!f) return; e.preventDefault();
  const kod = f.elements.kod.value, q = Math.ceil(+f.elements.q.value * 100) / 100, t = f.elements.t.value, td0 = f.elements.ted.value;
  if (!t) { bildir('Termin girin.', 'hata'); return; }
  degistir('Satın alma eklendi', `${kod} ${sayi(q, 1)}, termin ${t}, ${td0}`, () => { S.D.satinalma = S.D.satinalma || []; S.D.satinalma.push({ kod, miktar: q, gelis: `${t} 08:00`, tedarikci: td0 }); U.mpV = null; });
  render();
}, true);
