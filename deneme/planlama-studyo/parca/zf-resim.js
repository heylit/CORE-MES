/* ---------- Bütün resim ----------
   Tahtanın kendisi: atölyenin çevresinde planın özeti durur; göstergeler, akış nehri (siparişler istasyonlardan geçip zamanında ya da
   geç biter), günlük yük ısı haritası, sürenin nereye gittiği, sipariş yarışı ve veriden kurulan yorum. Zaman tahtanın oynatıcısıdır;
   oynatınca atölye ve bütün parçalar birlikte ilerler. Sunum kamerayı tahtada parçadan parçaya gezdirir. Hiçbir şey veriyi değiştirmez. */
const BR_GRUP_AD = { testere: 'Testere', torna: 'Torna', freze: 'Freze', '5eksen': '5 eksen', taslama: 'Taşlama', tesviye: 'Tesviye', yikama: 'Yıkama', olcum: 'Ölçüm', fason: 'Fason' };
const BR_SAHNE = [['ozet', 'Plan nasıl gidiyor?', 'dash'], ['bekle', 'Siparişler nerede bekliyor?', 'clock'], ['yuk', 'Hangi gün hangi tezgâh dolu?', 'grid'], ['sure', 'Süre nereye gidiyor?', 'chart'], ['yaris', 'Siparişler zamanında bitiyor mu?', 'flag'], ['yorum', 'Ne yapmalıyım?', 'bolt']];
const brGrup = m => m[0] === '@' ? 'fason' : ((S.D.tezgahlar.find(t => t.id === m) || {}).grup || 'diger');
/* bütün hesap tek yerde; plan değişmedikçe yeniden yapılmaz */
function brVeri() {
  const p = gosterilen(); if (!p || !p.ops) return null;
  if (BR.v && BR.v.p === p && BR.v.dv === S.dataVer) return BR.v;
  const cx = cxAl(); const now = rsSimdi(); const D = S.D;
  const isler = S.D.siparisler.filter(s => !s.havuz && p.J && p.J[s.id] && cx.jobs[s.id]);
  const ops = Object.values(p.ops).filter(r => isFinite(r.S) && isFinite(r.C));
  const T0 = Math.floor(now / 24) * 24;
  const H1 = Math.ceil(Math.max(now + 24 * 7, ...isler.map(s => Math.max(p.J[s.id].C || 0, cx.jobs[s.id].due || 0))) / 24) * 24;
  const gun = Math.max(7, Math.round((H1 - T0) / 24));
  /* grupların rotadaki ortalama yeri: satır sırası */
  const yer = {}; for (const s of isler) { const l = cx.jobs[s.id].ops.map(o => p.ops[o.id]).filter(Boolean); l.forEach((r, i) => { const g = brGrup(r.m); (yer[g] = yer[g] || []).push(l.length > 1 ? i / (l.length - 1) : 0); }); }
  const gruplar = Object.keys(yer).sort((a, b) => yer[a].reduce((x, y) => x + y, 0) / yer[a].length - yer[b].reduce((x, y) => x + y, 0) / yer[b].length);
  /* sipariş başına: grup sırası, başlangıç, bitiş, termin, gecikme, süre ayrışımı */
  const sip = isler.map(s => { const j = cx.jobs[s.id]; const l = j.ops.map(o => p.ops[o.id]).filter(r => r && isFinite(r.S)).sort((a, b) => a.S - b.S);
    const yol = []; for (const r of l) { const g = brGrup(r.m); if (yol[yol.length - 1] !== g) yol.push(g); }
    const a = ayristir(p, cx, s.id); const J = p.J[s.id];
    const adim = l.map((r, i) => ({ j: s.id, m: r.m, g: brGrup(r.m), S: r.S, C: r.C, su: r.su || 0, run: r.run || 0, bek: Math.max(0, r.S - (i ? l[i - 1].C : Math.max(now, Math.min(r.S, now)))) }));
    return { id: s.id, adim, urun: urunAd(s.urun), oncelik: s.oncelik, S: l.length ? l[0].S : now, C: J.C, due: j.due, T: J.T || 0, gec: (J.T || 0) > 0.05, yol, seg: a && a.tam ? a.seg : null, kaynak: a && a.tam ? a.kaynak : [] }; });
  /* yük: tezgâh x gün dolu saat / açık saat */
  const tez = D.tezgahlar.filter(t => ops.some(r => r.m === t.id));
  /* dolu ve açık saat tezgâhın çalışma penceresinden sayılır; vardiya dışı saatler iki tarafa da girmez */
  const yuk = tez.map(t => { const W = cx.M && cx.M[t.id] && cx.M[t.id].rw; const acikS = (a, b) => b <= a ? 0 : (W ? workIn(W, a, b) : b - a);
    const g = Array.from({ length: gun }, (_, d) => { const a = T0 + d * 24, b = a + 24; const acik = acikS(a, b); if (acik < 0.01) return null; let busy = 0; for (const r of ops) if (r.m === t.id) busy += acikS(Math.max(a, r.S), Math.min(b, r.C)); return busy / acik; }); return { m: t.id, grup: t.grup, g }; });
  const gunAd = Array.from({ length: gun }, (_, d) => fmtDT(D, T0 + d * 24 + 1).slice(6, 9));
  const u = Object.entries(p.util || {}).filter(([m, x]) => m[0] !== '@' && x && x.n);
  BR.v = { p, dv: S.dataVer, cx, now, T0, H1, gun, gunAd, gruplar, sip, yuk, u, ops, oz: p.ozet };
  return BR.v;
}
/* sayıdan sonra Türkçe ek: okunuşun son hecesine göre ünlü uyumu (20'si, 6'sı, %9'unda) */
function brEk(n, tur) {
  n = Math.abs(Math.round(n)); const bir = ['ı', 'i', 'i', 'ü', 'ü', 'e', 'ı', 'i', 'i', 'u'], on = [null, 'o', 'i', 'u', 'ı', 'i', 'ı', 'i', 'e', 'a'];
  const unluB = [false, false, true, false, false, false, true, true, false, false], unluO = [false, false, true, false, false, true, false, false, false, false];
  let u, sonUnlu;
  if (n === 0) { u = 'ı'; sonUnlu = false; } else if (n % 10) { u = bir[n % 10]; sonUnlu = unluB[n % 10]; } else if (n % 100) { u = on[(n % 100) / 10]; sonUnlu = unluO[(n % 100) / 10]; } else if (n % 1000) { u = 'ü'; sonUnlu = false; } else { u = 'i'; sonUnlu = false; }
  const dort = { a: 'ı', ı: 'ı', o: 'u', u: 'u', e: 'i', i: 'i', ö: 'ü', ü: 'ü' }[u]; const iki = 'aıou'.includes(u) ? 'a' : 'e';
  const i = (sonUnlu ? 's' : '') + dort;
  return "'" + (tur === 'inde' ? i + 'n' + 'd' + iki : i);
}
const BR = { v: null, raf: 0, son: 0 };
U.brT = null;
const brX = (v, t) => Math.max(0, Math.min(1, (t - v.T0) / (v.H1 - v.T0)));
const brSa = h => `${sayi(h, h < 10 ? 1 : 0)} sa`;

function brKpi(v) {
  const n = v.sip.length, gec = v.sip.filter(s => s.gec), zam = n - gec.length; const top = gec.reduce((a, s) => a + s.T, 0);
  const ort = v.u.length ? v.u.reduce((a, [, x]) => a + x.u, 0) / v.u.length : null; const dar = v.u.slice().sort((a, b) => b[1].u - a[1].u)[0];
  const kar = [
    ['list', 'Sipariş', n, '', 'planda'],
    ['check', 'Zamanında', zam, `%${Math.round(zam / Math.max(1, n) * 100)}`, 'termininden önce biter', 'tamam'],
    ['alert', 'Geç', gec.length, brSa(top), 'toplam gecikme', gec.length ? 'hata' : 'tamam'],
    ['gauge', 'Ortalama doluluk', ort == null ? null : Math.round(ort * 100), '%', 'çalışan tezgâhlarda'],
    ['cpu', 'En yoğun tezgâh', dar ? dar[0] : '—', dar ? `%${Math.round(dar[1].u * 100)}` : '', dar ? (BR_GRUP_AD[brGrup(dar[0])] || '') : '', 'uyari'],
    ['wrench', 'Ayar', Math.round(v.oz.suH || 0), 'sa', `${v.oz.suN || 0} ayar${v.oz.famN != null ? `; aile ${v.oz.famN} kez kısalttı` : ' bu dönemde'}`],
    ['flag', 'Son iş biter', fmtDT(S.D, v.oz.Cmax).slice(6), '', 'planın sonu'],
  ];
  return `<div class="pm-br-kpiler">${kar.map(([sm, ad, x, ek, alt, ton]) => `<div class="pm-br-kpi" ${ton ? `data-ton="${ton}"` : ''}><span>${ic(sm, 'k')}${esc(ad)}</span><b ${typeof x === 'number' ? `data-say="${x}"` : ''} class="mono">${x == null ? '—' : esc(String(x))}</b><small><b>${esc(ek)}</b> ${esc(alt)}</small></div>`).join('')}</div>`;
}
/* seçim tahtanın seçimidir: sipariş (U.secJob) ya da tezgâh (U.rsTez); bütün bölgeler buna göre yanar */
function brSecim(v) {
  const j = (typeof mzSecJobEski === 'function' ? mzSecJobEski() : U.secJob) || null; const s = j && v.sip.find(x => x.id === j);
  const m = !s && U.rsTez ? U.rsTez : null; if (!s && !m) return null;
  const hucre = new Set(), tez = new Set(), grup = new Set(), sip = new Set();
  const adimlar = s ? s.adim : v.sip.flatMap(x => x.adim.filter(a => a.m === m));
  for (const a of adimlar) { tez.add(a.m); grup.add(a.g); sip.add(a.j); for (let d = Math.max(0, Math.floor((a.S - v.T0) / 24 / (v.kova || 1))); d < v.gun && v.T0 + d * (v.kova || 1) * 24 < a.C; d++) hucre.add(a.m + '|' + d); }
  if (m) { tez.add(m); grup.add(brGrup(m)); }
  return { j: s ? s.id : null, s, m, hucre, tez, grup, sip };
}
/* nerede bekliyoruz: grup başına işleme, ayar ve sıra beklemesi; geç siparişlerin beklemesi ayrı */
function brBekleVeri(v) {
  const g = {}; for (const id of v.gruplar) g[id] = { id, isl: 0, ayar: 0, bek: 0, bekG: 0, sip: {} };
  for (const s of v.sip) for (const a of s.adim) { const x = g[a.g] = g[a.g] || { id: a.g, isl: 0, ayar: 0, bek: 0, bekG: 0, sip: {} }; x.isl += a.run; x.ayar += a.su; x.bek += a.bek; if (s.gec) x.bekG += a.bek; x.sip[s.id] = (x.sip[s.id] || 0) + a.bek; }
  return v.gruplar.map(id => g[id]);
}
function brBekle(v, sec) {
  const l = brBekleVeri(v); const mx = Math.max(1, ...l.map(x => x.isl + x.ayar + x.bek));
  const satir = l.map(x => { const w = k => (k / mx * 100).toFixed(2); const acik = U.brGrup === x.id;
    const ilg = sec && sec.grup.has(x.id) ? 'data-ilgili' : '';
    const enCok = Object.entries(x.sip).filter(([, b]) => b > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `<div class="pm-br-bk-s" data-hedef ${ilg} ${acik ? 'data-acik' : ''}><button type="button" class="pm-br-bk-ad" data-act="br-grup" data-v="${esc(x.id)}" aria-expanded="${acik}" title="Bu grupta en çok bekleyen siparişler">${esc(BR_GRUP_AD[x.id] || x.id)}</button>
      <div class="pm-br-bk-cubuk" title="İşleme ${brSa(x.isl)} · ayar ${brSa(x.ayar)} · bekleme ${brSa(x.bek)}${x.bekG ? ` (geç siparişler ${brSa(x.bekG)})` : ''}"><i data-k="isl" style="width:${w(x.isl)}%"></i><i data-k="ayar" style="width:${w(x.ayar)}%"></i><i data-k="bek" style="width:${w(x.bek - x.bekG)}%"></i><i data-k="bekg" style="width:${w(x.bekG)}%"></i></div>
      <small class="mono">${brSa(x.bek)}${x.bekG > 0.5 ? ` <b>${brSa(x.bekG)}</b>` : ''}</small>
      ${acik ? `<div class="pm-br-bk-liste">${enCok.length ? enCok.map(([j, b]) => `<button type="button" class="pm-at-link mono" data-act="br-sec-sip" data-v="${esc(j)}">${esc(j)} · ${brSa(b)}</button>`).join('') : '<span>Bu grupta bekleyen sipariş yok.</span>'}</div>` : ''}</div>`; }).join('');
  return `<div class="pm-br-bk"><div class="pm-br-bk-eksen"><span></span><small>işleme · ayar · bekleme</small><small>bekleme</small></div>${satir}</div>${brYolculuk(v, sec)}`;
}
/* seçilen siparişin yolculuğu: adım adım işleme ve aradaki beklemeler, termin çizgisi */
function brYolculuk(v, sec) {
  if (!sec || !sec.s) return `<p class="pm-br-ipucu">${ic('target', 'k')}Bir siparişe dokunun: atölyedeki yolculuğu burada adım adım açılır.</p>`;
  const s = sec.s; const t0 = Math.min(v.now, s.S), t1 = Math.max(s.C, s.due); const x = t => ((t - t0) / Math.max(1, t1 - t0) * 100).toFixed(2);
  const par = []; let son = Math.max(v.now, t0);
  for (const a of s.adim) { if (a.S > son + 0.05) par.push(`<i class="pm-br-yc-bek" ${s.gec ? 'data-gec' : ''} style="left:${x(son)}%;width:${(x(a.S) - x(son)).toFixed(2)}%" title="Bekleme ${brSa(a.S - son)} (${esc(a.m)} öncesi)"></i>`);
    par.push(`<i class="pm-br-yc-is" style="left:${x(a.S)}%;width:${Math.max(0.4, x(a.C) - x(a.S)).toFixed(2)}%" title="${esc(a.m)}: ayar ${brSa(a.su)}, işleme ${brSa(a.run)} · ${esc(fmtDT(S.D, a.S))} – ${esc(fmtDT(S.D, a.C))}"><em>${esc(a.m[0] === '@' ? a.m.slice(1) : a.m)}</em></i>`); son = Math.max(son, a.C); }
  const bek = s.adim.reduce((t, a) => t + a.bek, 0), isl = s.adim.reduce((t, a) => t + a.run + a.su, 0);
  return `<div class="pm-br-yc"><p>${dugme('Kartı aç', 'br-kart-ac', { kucuk: true, hayalet: true, simge: 'expand' })}<b class="mono">${esc(s.id)}</b> ${esc(s.urun)} · ${s.adim.length} adım · işleme ${brSa(isl)}, bekleme <b>${brSa(bek)}</b> · ${s.gec ? `<b data-ton="hata">${brSa(s.T)} geç</b>` : 'zamanında'}</p>
    <div class="pm-br-yc-yol">${par.join('')}<b class="pm-br-yc-termin" style="left:${x(s.due)}%" title="Termin ${esc(fmtDT(S.D, s.due))}"><span>termin</span></b></div>
    <div class="pm-br-yc-alt"><span>${esc(fmtDT(S.D, t0))}</span><span>${esc(fmtDT(S.D, t1))}</span></div></div>`;
}
const brGunOrt = v => v.gunAd.map((_, d) => { const l = v.yuk.map(y => y.g[d]).filter(x => x != null); return l.length ? l.reduce((a, x) => a + Math.min(1, x), 0) / l.length : null; });
/* günlük yük: satır tezgâh, sütun gün; mavi koyuluk doluluk. Gün başlığı tahtayı o güne götürür, tezgâh adı tezgâhı seçer */
function brYuk(v, sec) {
  const bas = `<tr><th></th>${v.gunAd.map((g, d) => `<th data-g="${d}"><button type="button" data-act="at-gunsec" data-v="${d}" title="Tahtayı bu güne götür">${esc(g)}<small>${esc(fmtDT(S.D, v.T0 + d * (v.kova || 1) * 24 + 1).slice(0, 2))}</small></button></th>`).join('')}</tr>`;
  let son = '';
  const sat = v.yuk.map(y => { const ilk = y.grup !== son; son = y.grup; const ilgT = sec && sec.tez.has(y.m);
    return `<tr ${ilk ? 'data-ilk' : ''} ${ilgT ? 'data-ilgili' : ''}><th class="mono"><button type="button" data-act="br-sec-tez" data-v="${esc(y.m)}" title="${esc(BR_GRUP_AD[y.grup] || y.grup)}: bu tezgâhı kullanan siparişleri göster">${esc(y.m)}</button></th>${y.g.map((x, d) => { const ilg = sec && (sec.s ? sec.hucre.has(y.m + '|' + d) : ilgT) ? 'data-ilgili' : '';
      return x == null ? `<td data-g="${d}" data-kapali data-hedef ${ilg} title="${esc(y.m)} · ${esc(v.gunAd[d])}: kapalı"></td>` : `<td data-g="${d}" data-hedef ${ilg} style="--y:${Math.min(1, x).toFixed(2)}" title="${esc(y.m)} · ${esc(v.gunAd[d])}: %${Math.round(x * 100)} dolu"></td>`; }).join('')}</tr>`; }).join('');
  const gt = brGunOrt(v);
  return `<div class="pm-br-isi-kap"><table class="pm-br-isi" aria-label="Tezgâh ve güne göre doluluk"><thead>${bas}</thead><tbody>${sat}</tbody><tfoot><tr><th>Ort. %</th>${gt.map((x, d) => `<td data-g="${d}" class="mono">${x == null ? '–' : Math.round(x * 100)}</td>`).join('')}</tr></tfoot></table></div>`;
}
/* süre nereye gidiyor: bütün siparişlerin atölyede geçirdiği sürenin ayrışımı */
function brSure(v) {
  const top = {}; let hep = 0; for (const s of v.sip) if (s.seg) for (const [k, x] of Object.entries(s.seg)) { top[k] = (top[k] || 0) + x; hep += x; }
  const sira = Object.entries(top).filter(([, x]) => x > 0.01).sort((a, b) => b[1] - a[1]);
  const serit = (seg, toplam) => sira.map(([k]) => { const x = (seg[k] || 0) / Math.max(0.01, toplam) * 100; return x > 0.05 ? `<i style="width:${x.toFixed(2)}%;background:${(KAT[k] || [, 'var(--muted)'])[1]}" title="${esc((KAT[k] || [k])[0])}: %${Math.round(x)}"></i>` : ''; }).join('');
  const gec = v.sip.filter(s => s.gec && s.seg).sort((a, b) => b.T - a.T).slice(0, 6);
  return `<div class="pm-br-yuzde"><div class="pm-br-serit pm-br-serit-b">${serit(top, hep)}</div>
    <ul class="pm-br-lejl">${sira.map(([k, x]) => `<li><i style="background:${(KAT[k] || [, 'var(--muted)'])[1]}"></i><span>${esc((KAT[k] || [k])[0])}</span><b class="mono">%${Math.round(x / hep * 100)}</b></li>`).join('')}</ul>
    ${gec.length ? `<h4>Geç siparişler</h4><ul class="pm-br-gecler">${gec.map(s => { const t = Object.values(s.seg).reduce((a, b) => a + b, 0); return `<li><button type="button" class="pm-at-link mono" data-act="br-sec-sip" data-v="${esc(s.id)}">${esc(s.id)}</button><div class="pm-br-serit">${serit(s.seg, t)}</div><b class="mono">+${brSa(s.T)}</b></li>`; }).join('')}</ul>` : ''}</div>`;
}
/* sipariş yarışı: terminine göre sıralı; çubuk ilk işlemden son işleme, elmas termin; tahtanın zamanı ilerledikçe çubuk dolar */
function brYaris(v, sec) {
  const sip = v.sip.slice().sort((a, b) => a.due - b.due);
  const gunler = v.gunAd.map((g, d) => `<span style="left:${(d / v.gun * 100).toFixed(2)}%" ${d % 3 ? 'data-ara' : ''}>${esc(fmtDT(S.D, v.T0 + d * (v.kova || 1) * 24 + 1).slice(0, 2))}<em> ${esc(g)}</em></span>`).join('');
  return `<div class="pm-br-yaris"><div class="pm-br-yaris-eksen"><span></span><div>${gunler}</div><span></span></div>
    ${sip.map(s => { const a = brX(v, s.S), b = Math.max(a + 0.002, brX(v, s.C)), t = brX(v, s.due); const fark = s.C - s.due; const ilg = sec && sec.sip.has(s.id);
      return `<div class="pm-br-yaris-s" data-hedef ${s.gec ? 'data-gec' : ''} ${ilg ? 'data-ilgili' : ''} ${sec && sec.j === s.id ? 'data-secili' : ''}><button type="button" class="pm-at-link mono" data-act="br-sec-sip" data-v="${esc(s.id)}" title="${esc(s.urun)}: yolculuğunu ve tezgâhlarını göster">${esc(s.id)}</button>
        <div class="pm-br-yol"><i class="pm-br-cubuk" style="--s:${a.toFixed(4)};--e:${b.toFixed(4)}"><u></u></i><b class="pm-br-termin" style="left:${(t * 100).toFixed(2)}%" title="Termin ${esc(fmtDT(S.D, s.due))}"></b></div>
        <small class="mono" data-ton="${s.gec ? 'hata' : 'tamam'}">${s.gec ? '+' + brSa(fark) : brSa(-fark) + ' pay'}</small></div>`; }).join('')}
    <div class="pm-br-imlec" aria-hidden="true"></div></div>`;
}
/* veriden yorum: her madde bir gözlem ve bir yön */
function brYorum(v) {
  const l = []; const n = v.sip.length; const gec = v.sip.filter(s => s.gec).sort((a, b) => b.T - a.T);
  l.push({ sm: gec.length ? 'alert' : 'check', ton: gec.length ? 'hata' : 'tamam', m: gec.length ? `${n} siparişin <b>${n - gec.length}</b>${brEk(n - gec.length, 'i')} zamanında, <b>${gec.length}</b>${brEk(gec.length, 'i')} geç. En çok geciken <b>${esc(gec[0].id)}</b> (${esc(gec[0].urun)}), termininden <b>${brSa(gec[0].T)}</b> sonra bitiyor.` : `${n} siparişin hepsi termininden önce bitiyor.`, act: gec.length ? 'br-git-sip' : null, v: gec.length ? gec[0].id : null, ad: 'Tahtada göster' });
  /* geç siparişleri en çok ne bekletiyor */
  const bek = {}; for (const s of gec) for (const [k, ad, x] of s.kaynak) if (k !== 'isleme') bek[ad] = (bek[ad] || 0) + x;
  const bk = Object.entries(bek).sort((a, b) => b[1] - a[1]);
  if (bk.length) { const m = bk[0][0]; const tz = S.D.tezgahlar.find(t => t.id === m); l.push({ sm: 'target', ton: 'uyari', m: `Geç siparişleri en çok <b>${esc(m)}</b> bekletiyor: toplam <b>${brSa(bk[0][1])}</b>.${bk[1] ? ` Sonra ${esc(bk[1][0])} (${brSa(bk[1][1])}).` : ''} Bu kaynağı rahatlatmak gecikmeyi en çok azaltır.`, act: tz ? 'br-git-tez' : null, v: tz ? tz.id : null, ad: 'Tezgâha git' }); }
  /* akış verimi */
  let isl = 0, hep = 0; const top = {}; for (const s of v.sip) if (s.seg) for (const [k, x] of Object.entries(s.seg)) { hep += x; top[k] = (top[k] || 0) + x; if (k === 'isleme') isl += x; }
  if (hep) { const en = Object.entries(top).filter(([k]) => k !== 'isleme').sort((a, b) => b[1] - a[1])[0];
    l.push({ sm: 'clock', ton: 'bilgi', m: `Bir sipariş atölyede geçirdiği sürenin yalnız <b>%${Math.round(isl / hep * 100)}</b>${brEk(isl / hep * 100, 'inde')} işleniyor. En büyük pay <b>${esc((KAT[en[0]] || [en[0]])[0].toLowerCase())}</b> (%${Math.round(en[1] / hep * 100)}).` }); }
  /* en yoğun gün ve boş kapasite */
  const gt = brGunOrt(v).map(x => x == null ? -1 : x);
  const dmax = gt.indexOf(Math.max(...gt));
  if (v.yuk.length) l.push({ sm: 'grid', ton: 'bilgi', m: `En yoğun gün <b>${esc(v.gunAd[dmax])}</b> (${esc(fmtDT(S.D, v.T0 + dmax * (v.kova || 1) * 24 + 1).slice(0, 5))}): tezgâhların ortalama <b>%${Math.round(gt[dmax] * 100)}</b>${brEk(gt[dmax] * 100, 'i')} dolu.` });
  const gu = {}; for (const [m, x] of v.u) { const g = brGrup(m); (gu[g] = gu[g] || []).push(x.u); }
  const gl = Object.entries(gu).map(([g, a]) => [g, a.reduce((x, y) => x + y, 0) / a.length]).sort((a, b) => a[1] - b[1]);
  if (gl.length > 1) l.push({ sm: 'gauge', ton: 'bilgi', m: `En boş grup <b>${esc(BR_GRUP_AD[gl[0][0]] || gl[0][0])}</b> (%${Math.round(gl[0][1] * 100)}), en dolu <b>${esc(BR_GRUP_AD[gl[gl.length - 1][0]] || gl[gl.length - 1][0])}</b> (%${Math.round(gl[gl.length - 1][1] * 100)}). Dolu gruptaki adımlara boş gruptan alternatif tezgâh tanımlamak yükü dengeler.`, act: 'br-rota', ad: 'Reçete ve Rota' });
  if (v.oz.suN) l.push({ sm: 'wrench', ton: 'bilgi', m: `Ayara <b>${brSa(v.oz.suH)}</b> gidiyor (${v.oz.suN} ayar).${v.oz.famN != null ? ` Aile sıralaması ${v.oz.famN} ayarı kısalttı.` : ''}` });
  l.push({ sm: 'flag', ton: 'bilgi', m: `Plandaki son işin bitişi: <b>${esc(fmtDT(S.D, v.oz.Cmax))}</b>.` });
  return l;
}
function brYorumHtml(v, l) { return `<ol class="pm-br-yorum">${l.map(x => `<li data-ton="${x.ton}">${ic(x.sm, 'k')}<span>${x.m}${x.act ? ` <button type="button" class="pm-at-link" data-act="${x.act}" ${x.v ? `data-v="${esc(x.v)}"` : ''}>${esc(x.ad)}</button>` : ''}</span></li>`).join('')}</ol>`; }
function brCanli(v, t) {
  const cal = v.ops.filter(r => r.S <= t && r.C > t); const tz = new Set(cal.filter(r => r.m[0] !== '@').map(r => r.m)); const sp = new Set(cal.map(r => r.job));
  const biten = v.sip.filter(s => s.C <= t).length;
  return `<b class="mono">${esc(fmtDT(S.D, t))}</b><span><b>${tz.size}</b> tezgâh çalışıyor</span><span><b>${sp.size}</b> sipariş üretimde</span><span><b>${biten}</b>/${v.sip.length} sipariş bitti</span>`;
}

/* ---------- tahtadaki yerleri ----------
   Parçalar atölyenin çevresinde sabit bölgelerdir: üstte göstergeler, solda akış nehri, sağda yorum, altta yük, yarış ve süre.
   Tahtayla kayar, yakınlaşmayla büyür; uzaktan bakınca atölye ve bütün parçalar bir ekrana sığar. Telefonda parçalar atölyenin
   altına tek sütun dizilir. Kartlar bu bölgelerin dışında kalır. */
const BR_PANO = { ozet: null, bekle: 0.75, yorum: 0.6, yuk: 0.75, yaris: 1, sure: 0.6 };
const BR_ARA = 80;
U.brKat = (() => { try { return localStorage.getItem(ANAHTAR + '-br') !== '0'; } catch (e) { return true; } })();
const brKref = () => tkDar() ? 340 / Math.max(1, brAtolye().w) : 0.45;
const brAtolyeEski = tkAtolyeKutu;
function brAtolye() { const l = brAtolyeEski(); const x0 = Math.min(...l.map(e => e.x)), y0 = Math.min(...l.map(e => e.y)); return { x: x0, y: y0, w: Math.max(...l.map(e => e.x + e.w)) - x0, h: Math.max(...l.map(e => e.y + e.h)) - y0 }; }
tkAtolyeKutu = function () { const l = brAtolyeEski(); return U.brKat && BR.kutu ? [...l, ...Object.values(BR.kutu)] : l; };
/* her bölge bir soruya cevap verir: soru başlıkta, veriden cevap altında, okuma kuralı (?) ile açılır; renk anahtarı her zaman görünür */
const BR_NASIL = {
  ozet: ['Her kart bir ölçü. Renkli kenar durumu söyler: yeşil iyi, kırmızı sorun, sarı dikkat.', 'Sağ üstteki sayaç tahtanın zamanını izler: oynatınca çalışan tezgâh ve biten sipariş sayısı değişir.'],
  bekle: ['Her satır bir istasyon grubu; yukarıdan aşağı rotadaki sırası.', 'Çubuk o gruptaki bütün siparişlerin toplam süresi: yeşil işleme, açık yeşil ayar, gri sıra bekleme, kırmızı geç siparişlerin beklemesi.', 'Gri ve kırmızısı uzun grup darboğazdır; sağdaki sayı toplam bekleme (kalın: geç siparişlerin payı).', 'Grup adına dokunun: orada en çok bekleyen siparişler. Siparişe dokunun: aşağıda yolculuğu açılır.'],
  yuk: ['Satır tezgâh, sütun gün.', 'Mavi koyulaştıkça tezgâh o gün daha dolu (vardiya saatine göre). Taralı hücre: tezgâh o gün kapalı.', 'Çerçeveli sütun tahtadaki gündür. Gün başlığına dokunun: tahta o güne gider.', 'Tezgâh adına dokunun: o tezgâhı kullanan siparişler bütün bölgelerde yanar.'],
  sure: ['Bütün siparişlerin atölyede geçirdiği süre yüzde yüz sayılır.', 'Her renk bir sebep: işleme, ayar, tezgâh dolu bekledi, fasonda, tezgâh kapalı...', 'İşleme payı ne kadar küçükse sipariş o kadar çok bekliyor demektir. Altta geç siparişlerin kendi dağılımı.'],
  yaris: ['Her satır bir sipariş; terminine göre sıralı, en acil üstte.', 'Çubuk siparişin ilk işlemden son işleme kadar atölyede kaldığı süre. Elmas termin: çubuk elmasın sağına taşıyorsa sipariş geç (kırmızı).', 'Dikey çizgi tahtanın zamanı; çubuğun dolu kısmı o ana kadar geçen süre.', 'Siparişe dokunun: atölyede yolu, yük haritasında tezgâhları, beklemede grupları yanar.'],
  yorum: ['Veriden kurulan gözlemler, önem sırasıyla.', 'Kırmızı kenar sorun, sarı dikkat, yeşil iyi. Bağlantı ilgili yere götürür.'],
};
const brL = (r, ad) => `<span class="pm-br-sz"><i data-r="${r}"></i>${ad}</span>`;
const BR_LEJ = {
  ozet: () => brL('iyi', 'iyi') + brL('sorun', 'sorun') + brL('dikkat', 'dikkat'),
  bekle: () => brL('isl', 'işleme') + brL('ayar', 'ayar') + brL('bek', 'bekleme') + brL('sorun', 'geç siparişin beklemesi'),
  yuk: () => `<span class="pm-br-sz"><span class="pm-br-rampa"><i style="--y:.15"></i><i style="--y:.45"></i><i style="--y:.75"></i><i style="--y:1"></i></span>boş → dolu</span>` + brL('kapali', 'kapalı'),
  sure: () => '',
  yaris: () => brL('iyi', 'zamanında') + brL('sorun', 'geç') + `<span class="pm-br-sz"><i data-r="termin"></i>termin</span><span class="pm-br-sz"><i data-r="imlec"></i>şimdi</span>`,
  yorum: () => brL('sorun', 'sorun') + brL('dikkat', 'dikkat') + brL('iyi', 'iyi'),
};
function brCevap(v, id) {
  const n = v.sip.length, gec = v.sip.filter(s => s.gec).sort((a, b) => b.T - a.T); const top = gec.reduce((a, s) => a + s.T, 0);
  switch (id) {
    case 'ozet': return `${n} siparişin <b>${n - gec.length}</b>${brEk(n - gec.length, 'i')} zamanında${gec.length ? `, <b>${gec.length}</b>${brEk(gec.length, 'i')} geç (toplam ${brSa(top)})` : ''}. Son işin bitişi: <b>${esc(fmtDT(S.D, v.oz.Cmax))}</b>.`;
    case 'bekle': { const l = brBekleVeri(v).sort((a, b) => b.bek - a.bek); const x = l[0]; return x && x.bek > 0.5 ? `En çok bekleme <b>${esc(BR_GRUP_AD[x.id] || x.id)}</b> grubunda: ${brSa(x.bek)}${x.bekG > 0.5 ? `, bunun <b>${brSa(x.bekG)}</b>'i geç siparişlerin` : ''}.` : 'Belirgin bir bekleme yok.'; }
    case 'yuk': { const gt = brGunOrt(v).map(x => x == null ? -1 : x); const d = gt.indexOf(Math.max(...gt)); const enT = v.u.slice().sort((a, b) => b[1].u - a[1].u)[0]; return `En yoğun gün <b>${esc(v.gunAd[d])} ${esc(fmtDT(S.D, v.T0 + d * (v.kova || 1) * 24 + 1).slice(0, 5))}</b> (ortalama %${Math.round(gt[d] * 100)}). Plan boyunca en dolu tezgâh <b>${esc(enT ? enT[0] : '—')}</b>${enT ? ` (%${Math.round(enT[1].u * 100)})` : ''}.`; }
    case 'sure': { const y = (BR.yor || []).find(x => x.sm === 'clock'); return y ? y.m : ''; }
    case 'yaris': return gec.length ? `<b>${gec.length}</b> sipariş geç; en çok geciken <b>${esc(gec[0].id)}</b>, termininden ${brSa(gec[0].T)} sonra biter.` : 'Bütün siparişler termininden önce biter.';
    case 'yorum': return `Veriden çıkan <b>${(BR.yor || []).length}</b> gözlem; önce sorunlar.`;
  }
  return '';
}
/* bölgenin piksel genişliği atölyenin o anki genişliğinden; atölye yerleşimi ekran oranıyla değişebilir */
function brGenislik(id) { const F = brAtolye(); const w = tkDar() ? F.w : BR_PANO[id] == null ? F.w * (BR_PANO.bekle + 1 + BR_PANO.yorum) + 2 * BR_ARA : F.w * BR_PANO[id]; return Math.round(w * brKref()); }
function brPanoHtml(v, id, govde, ek) {
  const [, ad, sm] = BR_SAHNE.find(x => x[0] === id); const ac = U.brNasil === id;
  return `<section class="pm-br-pano" data-b="${id}" style="width:${brGenislik(id)}px" aria-label="${esc(ad)}">
    <header class="pm-br-pano-bas"><button type="button" class="pm-br-soru" data-act="br-odak" data-v="${id}" title="Yakından bak">${ic(sm, 'k')}<b>${esc(ad)}</b></button>
      <button type="button" class="pm-br-nasil-d" data-act="br-nasil" data-v="${id}" aria-expanded="${ac}" title="Nasıl okunur">${ic('help', 'k')}<span>Nasıl okunur</span></button>${ek || ''}</header>
    <p class="pm-br-cevap">${brCevap(v, id)}</p>
    ${ac ? `<ol class="pm-br-nasil">${BR_NASIL[id].map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
    ${BR_LEJ[id]() ? `<div class="pm-br-lejant">${BR_LEJ[id]()}</div>` : ''}${govde}</section>`;
}
function brKatman() {
  if (!U.brKat) return '';
  const v = brVeri(); if (!v) return '';
  const t = rsT(); const yor = brYorum(v); BR.yor = yor; const sec = brSecim(v);
  const ozet = brPanoHtml(v, 'ozet', brKpi(v), `<div class="pm-br-canli" id="br-canli">${brCanli(v, t)}</div>`);
  const l = [ozet, brPanoHtml(v, 'bekle', brBekle(v, sec)), brPanoHtml(v, 'yorum', brYorumHtml(v, yor)), brPanoHtml(v, 'yuk', brYuk(v, sec)), brPanoHtml(v, 'yaris', brYaris(v, sec)), brPanoHtml(v, 'sure', brSure(v))];
  return `<div class="pm-br-katman" id="br-katman" style="--f:${brX(v, t).toFixed(4)}" data-gun="${Math.min(v.gun - 1, Math.floor((t - v.T0) / 24 / (v.kova || 1)))}" ${sec ? 'data-vurgu' : ''} ${U.brTur != null ? `data-tur="${BR_TUR[U.brTur][0]}"` : ''}>${l.join('')}</div>`;
}
/* bölgeler panoların ölçülen boyuna göre kurulur */
function brYerlesim() {
  const kat = document.getElementById('br-katman'); if (!kat) { return; }
  const kr = brKref(); const F = brAtolye(); const G = BR_ARA; const k = {};
  /* uzaktan görünüm yazıyı büyütür ama bölgenin boyunu değiştirmez; boy yalnız yakın hâlde ölçülür */
  BR.boyH = BR.boyH || {};
  const boy = id => { const el = kat.querySelector(`[data-b="${id}"]`); if (!el) return { w: 0, h: 0 }; const gw = brGenislik(id) + 'px'; if (el.style.width !== gw) { el.style.width = gw; el.removeAttribute('data-uzak'); el.style.height = ''; } if (!el.hasAttribute('data-uzak')) BR.boyH[id] = el.offsetHeight; return { w: el.offsetWidth / kr, h: (BR.boyH[id] || el.offsetHeight) / kr }; };
  const b = {}; for (const id of Object.keys(BR_PANO)) b[id] = boy(id);
  if (tkDar()) {
    k.ozet = { x: F.x, y: F.y - G - b.ozet.h, ...b.ozet };
    let y = F.y + F.h + G; for (const id of ['bekle', 'yaris', 'yuk', 'yorum', 'sure']) { k[id] = { x: F.x, y, ...b[id] }; y += b[id].h + G; }
  } else {
    /* üstte boydan boya göstergeler; altında üç sütun: akış ve yük, atölye ve yarış, yorum ve süre */
    const xA = F.x - G - b.bekle.w, xC = F.x + F.w + G;
    k.ozet = { x: xA, y: F.y - G - b.ozet.h, ...b.ozet };
    k.bekle = { x: xA, y: F.y, ...b.bekle }; k.yuk = { x: xA, y: F.y + b.bekle.h + G, ...b.yuk };
    k.yaris = { x: F.x, y: F.y + F.h + G, ...b.yaris };
    k.yorum = { x: xC, y: F.y, ...b.yorum }; k.sure = { x: xC, y: F.y + b.yorum.h + G, ...b.sure };
  }
  const eski = BR.kutu; BR.kutu = k;
  /* bölgeler ilk kez ya da başka boyda kurulunca üstünde kalan kart en yakın boş yere geçer */
  const imza = Object.values(k).map(e => `${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.w)},${Math.round(e.h)}`).join(';');
  if (BR.imza !== imza) { BR.imza = imza; if (typeof tkCozus === 'function') { for (const c of U.tkKart || []) tkCozus(c); tkKaydet(); } }
  return eski;
}
function brKonumla() {
  const kat = document.getElementById('br-katman'); if (!kat || !AT.kam || !AT.boyut || !BR.kutu) return;
  /* atölye yeniden yerleşince (ekran oranı) bölgeler de yeniden kurulur */
  const F = brAtolye(); const fi = `${Math.round(F.x)},${Math.round(F.y)},${Math.round(F.w)},${Math.round(F.h)}`; if (BR.fImza !== fi) { BR.fImza = fi; brYerlesim(); }
  const kr = brKref(); const o = AT.kam.k / kr;
  for (const el of kat.children) { const b = BR.kutu[el.dataset.b]; if (!b) continue; const [sx, sy] = atEk(b.x, b.y);
    el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) scale(${o.toFixed(4)})`;
    /* uzaktan bakınca ana sayılar ve başlıklar ölçekle ters büyür; ayrıntı gizlenir */
    const uzak = o < 0.62; /* uzak hâlde bölgenin boyu yakın hâldeki boyda sabit kalır; büyüyen yazı yerleşimi kaydırmaz */
    if (uzak !== el.hasAttribute('data-uzak')) { el.toggleAttribute('data-uzak', uzak); el.style.height = uzak && BR.boyH && BR.boyH[el.dataset.b] ? `${BR.boyH[el.dataset.b]}px` : ''; }
    if (uzak) el.style.setProperty('--ters', Math.min(1.45, 0.7 / o).toFixed(3)); }
  /* zaman tahtanın oynatıcısından gelir */
  const t = rsT(); if (BR.sonT !== t) { BR.sonT = t; const v = brVeri(); if (v) { kat.style.setProperty('--f', brX(v, t).toFixed(4)); const d = String(Math.min(v.gun - 1, Math.floor((t - v.T0) / 24 / (v.kova || 1))));
    if (kat.dataset.gun !== d || !BR.yakildi) { kat.dataset.gun = d; BR.yakildi = true; kat.querySelectorAll('.pm-br-isi [data-gun-yak]').forEach(x => x.removeAttribute('data-gun-yak')); kat.querySelectorAll(`.pm-br-isi [data-g="${d}"]`).forEach(x => x.setAttribute('data-gun-yak', '')); }
    const c = document.getElementById('br-canli'); if (c) c.innerHTML = brCanli(v, t); } }
  /* anlatım raf dışındaki alanın ortasında, zaman çubuğunun üstünde */
  const an = document.querySelector('.pm-br-anlatim'); if (an) { const alt = (document.querySelector('.pm-at-alt') || {}).offsetHeight || 0; const ray = document.querySelector('.pm-tk-ray'); const sol = ray ? ray.offsetWidth + 24 : 0; const W = AT.boyut[0];
    an.style.bottom = `${alt + 12}px`; an.style.width = `${Math.min(760, W - sol - 32)}px`; an.style.left = `${sol + (W - sol) / 2}px`; }
}
/* kamera bir kutuya uçar; hareket azaltıldıysa hemen gelir */
function brSerbest() {
  const [W, H] = AT.boyut; const ray = document.querySelector('.pm-tk-ray'); const sol = (ray ? ray.offsetWidth + 24 : 0) + 16;
  const hud = (document.querySelector('.pm-tk-hud') || {}).offsetHeight || 0; const ust = ((document.querySelector('.pm-at-ust') || {}).offsetHeight || 0) + hud + 20;
  const an = document.querySelector('.pm-br-anlatim'); const alt = ((document.querySelector('.pm-at-alt') || {}).offsetHeight || 0) + (an ? an.offsetHeight + 16 : 0) + 16;
  return { sol, sag: 16, ust, alt, W, H };
}
function brKamHesap(b, ustHiza) {
  const f = brSerbest(); const w = Math.max(80, f.W - f.sol - f.sag), h = Math.max(80, f.H - f.ust - f.alt);
  const k = Math.max(0.06, Math.min(1.6, w / b.w, ustHiza ? Infinity : h / b.h));
  const cx = b.x + b.w / 2 - (f.sol - f.sag) / 2 / k; const cy = ustHiza ? b.y + (f.H / 2 - f.ust) / k : b.y + b.h / 2 - (f.ust - f.alt) / 2 / k;
  return { x: cx, y: cy, k };
}
function brUc(hedef) {
  if (!AT.kam || AT_AZ()) { AT.kam = hedef; atTetikle(); return; }
  BR.ucus = { a: { ...AT.kam }, b: hedef, t0: performance.now(), d: 950 }; atTetikle();
}
function brBirlesik(l) { const x0 = Math.min(...l.map(e => e.x)), y0 = Math.min(...l.map(e => e.y)); return { x: x0, y: y0, w: Math.max(...l.map(e => e.x + e.w)) - x0, h: Math.max(...l.map(e => e.y + e.h)) - y0 }; }
function brHepsi() { if (!BR.kutu) return null; return brBirlesik([brAtolye(), ...Object.values(BR.kutu)]); }
function brHepsiniGoster(anlik) { const b = brHepsi(); if (!b || !AT.boyut) return; const h = brKamHesap(b, tkDar()); if (anlik) { AT.kam = h; atTetikle(); } else brUc(h); }
const brCizEski = atCiz;
atCiz = function () {
  if (BR.ucus && AT.kam) { const u = Math.min(1, (performance.now() - BR.ucus.t0) / BR.ucus.d); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; const { a, b } = BR.ucus;
    /* yakınlık oranla değişir; uzaklaşıp yaklaşırken hız eşit görünür */
    AT.kam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k: Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e) }; if (u >= 1) BR.ucus = null; else requestAnimationFrame(() => atTetikle()); }
  const r = brCizEski.apply(this, arguments); brKonumla(); return r;
};
/* ilk açılışta ve sığdırmada bölgeler açıksa her şey görünür */
const brSigdirEski = atSigdir;
atSigdir = function (W, H) { brSigdirEski(W, H); if (U.brKat && BR.kutu && AT.boyut) { const b = brHepsi(); if (b) AT.kam = brKamHesap(b, tkDar()); } };

/* ---------- sunum: kamera tahtada parçadan parçaya gezer ---------- */
const BR_TUR = [['genel', 'Plan bir bakışta', 'dash'], ['ozet', 'Göstergeler', 'gauge'], ['bekle', 'Nerede bekliyor', 'clock'], ['atolye', 'Atölye şimdi', 'cpu'], ['yuk', 'Günlük yük', 'grid'], ['sure', 'Süre nereye gidiyor', 'clock'], ['yaris', 'Sipariş yarışı', 'flag'], ['yorum', 'Ne yapmalı', 'bolt']];
function brTurNot(id) {
  const v = brVeri(); const y = BR.yor || (v ? brYorum(v) : []); if (!v) return '';
  const n = v.sip.length, gec = v.sip.filter(s => s.gec).length;
  switch (id) {
    case 'genel': return `Tahtanın tamamı: ortada atölye, çevresinde planın özeti. ${n} sipariş, ${gec ? `${gec}${brEk(gec, 'i')} geç` : 'hepsi zamanında'}.`;
    case 'ozet': return y[0] ? y[0].m : '';
    case 'bekle': return `${brCevap(v, 'bekle')} ${(y.find(x => x.sm === 'target') || {}).m || ''}`;
    case 'atolye': { const t = rsT(); const cal = v.ops.filter(r => r.S <= t && r.C > t && r.m[0] !== '@'); return `Zaman akıyor: <b>${new Set(cal.map(r => r.m)).size}</b> tezgâh çalışıyor, parçalar istasyonlar arasında ilerliyor. Göstergeler ve yarış aynı anda değişir.`; }
    case 'yuk': return (y.find(x => x.sm === 'grid') || {}).m || '';
    case 'sure': return (y.find(x => x.sm === 'clock') || {}).m || '';
    case 'yaris': return (y.find(x => x.sm === 'flag') || {}).m || '';
    case 'yorum': return `Veriden çıkan <b>${y.length}</b> gözlem; her birinin yanındaki bağlantı ilgili yere götürür.`;
  }
  return '';
}
function brAnlatim() {
  if (U.brTur == null || !U.brKat) return '';
  const [id, ad, sm] = BR_TUR[U.brTur]; const n = BR_TUR.length;
  return `<div class="pm-br-anlatim" role="region" aria-label="Sunum" aria-live="polite">
    <nav class="pm-br-noktalar">${BR_TUR.map(([, a], i) => `<button type="button" data-act="br-tur" data-v="${i}" aria-current="${i === U.brTur}" title="${esc(a)}"><span>${i + 1}</span></button>`).join('')}</nav>
    <div class="pm-br-anlatim-g" data-k="${id}"><h2>${ic(sm, 'k')}${esc(ad)}</h2><p>${brTurNot(id)}</p></div>
    <div class="pm-br-anlatim-alt">${dugme('', 'br-tur', { kucuk: true, simge: 'chev-left', ad: 'Önceki', veri: `data-v="${(U.brTur + n - 1) % n}"` })}<span class="mono">${U.brTur + 1}/${n}</span>${dugme('', 'br-tur', { kucuk: true, simge: 'chev-right', ad: 'Sonraki', veri: `data-v="${(U.brTur + 1) % n}"` })}
      <label class="pm-br-oto"><input type="checkbox" data-br-oto ${U.brOto ? 'checked' : ''}> kendiliğinden</label>${dugme('', 'br-tur-bitir', { kucuk: true, hayalet: true, simge: 'x', ad: 'Sunumu bitir (Esc)' })}</div></div>`;
}
function brTurGit(i) {
  U.brTur = (i + BR_TUR.length) % BR_TUR.length; const id = BR_TUR[U.brTur][0]; render();
  requestAnimationFrame(() => {
    if (!BR.kutu || !AT.boyut) return;
    const b = id === 'genel' ? brHepsi() : id === 'atolye' ? brAtolye() : BR.kutu[id]; if (!b) return;
    const pay = 40 / brKref(); brUc(brKamHesap({ x: b.x - pay, y: b.y - pay, w: b.w + 2 * pay, h: b.h + 2 * pay }, false));
    if (id === 'atolye') { const now = rsSimdi(); if (rsT() >= atPenB() - 0.25) U.rsT = now; AT.oynat = true; atKatmanYenile(); atTetikle(); }
  });
  brOtoKur();
}
function brOtoKur() { clearTimeout(BR.oto); if (U.brTur != null && U.brOto) BR.oto = setTimeout(() => { if (U.brTur != null && U.brOto && document.getElementById('pm-at')) brTurGit(U.brTur + 1); }, 9000); }
function brTurBitir() { U.brTur = null; clearTimeout(BR.oto); if (BR.tamOnce === false && U.tkTam) { BR.tamOnce = null; tkTamDegistir(false); } else render(); requestAnimationFrame(() => brHepsiniGoster()); }
function brKatDegis(ac) {
  U.brKat = ac == null ? !U.brKat : !!ac; try { localStorage.setItem(ANAHTAR + '-br', U.brKat ? '1' : '0'); } catch (e) { /* tarayıcı belleği kapalı olabilir */ }
  if (!U.brKat) { U.brTur = null; clearTimeout(BR.oto); BR.kutu = null; BR.imza = null; } else BR.sayildi = false;
  render(); requestAnimationFrame(() => { if (U.brKat) brHepsiniGoster(); else if (AT.cv) { const k0 = AT.kam && { ...AT.kam }; brSigdirEski(AT.cv.clientWidth, AT.cv.clientHeight); const h = AT.kam; AT.kam = k0; brUc(h); } });
}
function brSay(kat) {
  if (AT_AZ()) return; const l = [...kat.querySelectorAll('[data-say]')]; const t0 = performance.now();
  const adim = now => { const f = Math.min(1, (now - t0) / 700); const e = 1 - Math.pow(1 - f, 3); for (const el of l) if (el.isConnected) el.textContent = Math.round(+el.dataset.say * e); if (f < 1) requestAnimationFrame(adim); };
  requestAnimationFrame(adim);
}

/* ---------- bağlama ---------- */
const brAtEski = sAtolye;
sAtolye = function (p) {
  let h = brAtEski(p);
  const d = `<button type="button" class="tc-dugme tc-dugme-kucuk ${U.brKat ? 'tc-dugme-birincil' : ''} pm-br-ac-d" data-act="br-kat" aria-pressed="${!!U.brKat}" title="Bütün resim: atölyenin çevresinde planın özeti (B)">${ic('dash', 'k')}<span>Bütün resim</span></button>`
    + `<button type="button" class="tc-dugme tc-dugme-kucuk pm-br-tur-d" data-act="br-tur" data-v="${U.brTur != null ? U.brTur : 0}" aria-pressed="${U.brTur != null}" title="Sunum: tahtada parçadan parçaya gez (S)">${ic('play', 'k')}<span>Sunum</span></button>`;
  h = h.replace('<div class="pm-at-arac">', `<div class="pm-at-arac">${d}`);
  h = h.replace('<div class="pm-tk-ray-g pm-tk-ray-son">', `<div class="pm-tk-ray-g" role="group" aria-label="Bütün resim"><small>Resim</small><button type="button" class="pm-tk-ray-d" data-act="br-kat" aria-pressed="${!!U.brKat}" title="Bütün resim (B)">${ic('dash', 'k')}<span>Bütün resim</span></button><button type="button" class="pm-tk-ray-d" data-act="br-tur" data-v="0" aria-pressed="${U.brTur != null}" title="Sunum (S)">${ic('play', 'k')}<span>Sunum</span></button></div><div class="pm-tk-ray-g pm-tk-ray-son">`);
  /* bölgeler kart katmanının altında, anlatım tahtanın altında */
  const i = h.indexOf('<div class="pm-tk-hud">'); const ek = brKatman() + brAnlatim();
  return i >= 0 ? h.slice(0, i) + ek + h.slice(i) : (() => { const j = h.lastIndexOf('</div>'); return h.slice(0, j) + ek + h.slice(j); })();
};
const brTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'br-kat': brKatDegis(); return true;
    case 'br-ac': brKatDegis(true); return true;
    case 'br-tur': {
      if (U.brTur != null && el && (el.classList.contains('pm-br-tur-d') || el.classList.contains('pm-tk-ray-d'))) { brTurBitir(); return true; }
      if (U.brOto == null) U.brOto = true;
      /* sunum tam sayfada oynar; bitince önceki hâle döner */
      const tamGerek = U.brTur == null && !U.tkTam && !tkDar(); if (U.brTur == null) BR.tamOnce = U.tkTam;
      if (!U.brKat) { U.brKat = true; try { localStorage.setItem(ANAHTAR + '-br', '1'); } catch (er) { /* yok */ } }
      if (tamGerek) { tkTamDegistir(true); requestAnimationFrame(() => requestAnimationFrame(() => brTurGit(+v || 0))); } else brTurGit(+v || 0);
      return true; }
    case 'br-tur-bitir': brTurBitir(); return true;
    case 'br-odak': { const b = BR.kutu && BR.kutu[v]; if (b) { const pay = 30 / brKref(); brUc(brKamHesap({ x: b.x - pay, y: b.y - pay, w: b.w + 2 * pay, h: b.h + 2 * pay }, tkDar())); } return true; }
    /* bölgelerden seçim: kamera yerinde kalır, bütün bölgeler ve atölye seçime göre yanar */
    case 'br-sec-sip': AT.kilavuz = false; U.secJob = U.secJob === v ? null : v; U.gySec = null; U.rsTez = null; U.tkSek = null; U.brPanoSec = U.secJob ? 'j:' + v : null; render(); return true;
    case 'br-sec-tez': AT.kilavuz = false; U.rsTez = U.rsTez === v ? null : v; U.secJob = null; U.gySec = null; U.tkSek = null; U.brPanoSec = U.rsTez ? 'm:' + v : null; render(); return true;
    case 'br-kart-ac': U.brPanoSec = null; render(); return true;
    case 'br-grup': U.brGrup = U.brGrup === v ? null : v; render(); return true;
    case 'br-nasil': U.brNasil = U.brNasil === v ? null : v; render(); return true;
    case 'br-git-sip': U.brTur = null; clearTimeout(BR.oto); return tekEylem('at-sip', v);
    case 'br-git-tez': U.brTur = null; clearTimeout(BR.oto); return tekEylem('at-git-tez', v);
    case 'br-rota': U.brTur = null; clearTimeout(BR.oto); tkAc('rota'); return true;
  }
  return brTekEski(act, v, el, e);
};
const brRenderEski = render;
render = function () {
  brRenderEski();
  const kat = document.getElementById('br-katman'); if (!kat) return;
  BR.sonT = null; BR.yakildi = false; brYerlesim(); brKonumla();
  /* içerik boyu değişirse (yazı tipi, sayaç) bölgeler yeniden kurulur */
  if (window.ResizeObserver) { if (BR.ro) BR.ro.disconnect(); BR.ro = new ResizeObserver(() => { if (!document.getElementById('br-katman')) return; const once = BR.imza; brYerlesim(); if (BR.imza !== once) brKonumla(); }); for (const el of kat.children) BR.ro.observe(el); }
  if (!BR.sayildi) { BR.sayildi = true; brSay(kat); }
  /* bölgeler ilk kez kurulduğunda kamera her şeyi gösterir */
  if (!BR.ilk && AT.boyut) { BR.ilk = true; brHepsiniGoster(true); }
};
/* bölgelerin üstünde tekerlek tahtayı yakınlaştırır, boş yerden tutunca tahta kayar */
document.addEventListener('wheel', e => { const k = e.target.closest && e.target.closest('.pm-br-katman'); if (!k || !AT.cv || !e.isTrusted || e.target === AT.cv) return; e.preventDefault(); AT.cv.dispatchEvent(new WheelEvent('wheel', { deltaY: e.deltaY, deltaX: e.deltaX, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, bubbles: true, cancelable: true })); }, { passive: false });
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-br-oto]')) { U.brOto = e.target.checked; brOtoKur(); } });
document.addEventListener('keydown', e => {
  if (!document.getElementById('pm-at') || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]'))) return;
  if (U.brTur != null) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); brTurBitir(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); brTurGit(U.brTur + (e.key === 'ArrowRight' ? 1 : -1)); return; }
  }
  if (e.key === 'Escape' && U.brKat && (U.secJob || U.rsTez || U.gySec || U.brNasil)) { e.preventDefault(); e.stopImmediatePropagation(); U.secJob = null; U.rsTez = null; U.gySec = null; U.brNasil = null; render(); return; }
  if (e.key === 'b' || e.key === 'B') { e.preventDefault(); brKatDegis(); }
  else if (e.key === 's' || e.key === 'S') { e.preventDefault(); tekEylem('br-tur', String(U.brTur != null ? U.brTur : 0), document.querySelector('.pm-br-tur-d')); }
}, true);

/* bölgeden yapılan seçimde atölyedeki seçim kartı açılmaz: bölgeler görünür kalır; tahtada aynı şeye dokununca ya da "Kartı aç" ile açılır */
const brSecimEski = tkSecim;
tkSecim = function (p) {
  const anah = U.secJob && !U.gySec ? 'j:' + U.secJob : U.rsTez && !U.secJob && !U.gySec ? 'm:' + U.rsTez : null;
  if (U.brKat && anah && U.brPanoSec === anah) return '';
  return brSecimEski(p);
};
const brTekEski2 = tekEylem;
tekEylem = function (act, v, el, e) { if (act === 'at-sip' || act === 'at-git-tez' || act === 'km-is') U.brPanoSec = null; return brTekEski2(act, v, el, e); };
