/* ---------- Odak tahtası ----------
   Tahtanın bir bölümüne girip orada çalışmak: bir tezgâh grubu (bölüm) ya da tek tezgâh, tahtanın içinde kendi görünümünde açılır.
   Bölümde her tezgâh bir şerittir; tezgâhta her gün bir şerittir. Çubuk sürüklenip başka tezgâha ya da saate bırakılır, kuyruk
   yukarı aşağı dizilir, ek mesai ve bakım denenir. Her hamle önce önizlemedir; etkisi üst satırda okunur, Uygula ile plana girer. */
const OD = { surukle: null, yut: 0 };
U.odak = null;
U.odGun = null;
U.odKay = 0;

const odAd = m => m[0] === '@' ? m.slice(1) + ' (fason)' : m;
function odTezgahlar(g) {
  if (g === 'fason') { const f = new Set(); for (const r of Object.values(gosterilen().ops)) if (r.m[0] === '@') f.add(r.m); return [...f].sort(); }
  return S.D.tezgahlar.filter(t => brGrup(t.id) === g).map(t => t.id);
}
function odGruplar() {
  const v = brVeri(); const l = (v ? v.gruplar : []).filter(g => odTezgahlar(g).length);
  for (const t of S.D.tezgahlar) { const g = brGrup(t.id); if (!l.includes(g)) l.push(g); }
  return l;
}
function odPencere() {
  const gun = U.odGun || (tkDar() ? (U.odak.m ? 3 : 1) : (U.odak.m ? 7 : 3));
  const t0 = Math.floor(rsSimdi() / 24) * 24 + U.odKay * 24;
  return { gun, a: t0, b: t0 + gun * 24 };
}
/* tezgâhın açık pencereleri; fason ve takvimsiz tezgâh her zaman açıktır */
function odAcik(m, a, b) {
  const cx = cxAl(); const W = cx.M && cx.M[m] && cx.M[m].rw; if (!W) return [[a, b]];
  const l = []; for (const [x, y] of W) { if (y <= a) continue; if (x >= b) break; l.push([Math.max(a, x), Math.min(b, y)]); }
  return l;
}
function odKapali(m, a, b) {
  const l = []; let son = a; for (const [x, y] of odAcik(m, a, b)) { if (x > son + 0.01) l.push([son, x]); son = Math.max(son, y); }
  if (son < b - 0.01) l.push([son, b]); return l;
}
function odDoluluk(m, a, b, p) {
  const acik = odAcik(m, a, b); const top = acik.reduce((t, [x, y]) => t + y - x, 0); if (top < 0.01) return null;
  let dolu = 0; for (const r of Object.values(p.ops)) if (r.m === m && isFinite(r.C)) for (const [x, y] of acik) dolu += Math.max(0, Math.min(y, r.C) - Math.max(x, r.S));
  return dolu / top;
}
function odGec(p, j) { const J = p.J && p.J[j]; return !!(J && J.T > 0.05); }
/* bir şeridin içi: kapalı saatler, gün çizgileri, şimdi, işler ve önizlemede işlerin eski yerleri */
function odSerit(m, a, b, p) {
  const x = t => ((t - a) / (b - a) * 100).toFixed(3); const w = (s, c) => Math.max(0.15, (Math.min(b, c) - Math.max(a, s)) / (b - a) * 100).toFixed(3);
  const out = [];
  for (const [s, c] of odKapali(m, a, b)) out.push(`<i class="pm-od-kapali" style="left:${x(s)}%;width:${w(s, c)}%"></i>`);
  for (const d of S.down || []) if (d.m === m && d.to > a && d.from < b) out.push(`<i class="pm-od-kapali" data-ariza style="left:${x(Math.max(a, d.from))}%;width:${w(d.from, d.to)}%" title="Arıza ya da bakım"></i>`);
  for (let t = Math.ceil(a / 24) * 24; t < b; t += 24) if (t > a) out.push(`<i class="pm-od-gunc" style="left:${x(t)}%"></i>`);
  const now = rsSimdi(); if (now > a && now < b) out.push(`<i class="pm-od-simdi" style="left:${x(now)}%"></i>`);
  const bt = rsT(); if (Math.abs(bt - now) > 0.2 && bt > a && bt < b) out.push(`<i class="pm-od-saat" style="left:${x(bt)}%" title="Tahtanın saati"></i>`);
  if (U.hamle) for (const r of Object.values(S.plan.ops)) {
    if (r.m !== m || !isFinite(r.C) || r.C <= a || r.S >= b) continue; const q = p.ops[r.id];
    if (q && q.m === r.m && Math.abs(q.S - r.S) < 0.25) continue;
    out.push(`<i class="pm-od-hayalet" style="left:${x(Math.max(a, r.S))}%;width:${w(r.S, r.C)}%" title="${esc(r.id)} önizlemeden önce burada"></i>`);
  }
  const sj = U.secJob; const yaz = yetkili('plan.yaz');
  for (const r of Object.values(p.ops)) {
    if (r.m !== m || !isFinite(r.C) || r.C <= a || r.S >= b) continue;
    const ref = S.plan.ops[r.id]; const degisti = U.hamle && (!ref || ref.m !== r.m || Math.abs(ref.S - r.S) > 0.25);
    const ayar = r.C > r.S ? Math.min(100, (r.su || 0) / (r.C - r.S) * 100) : 0; const gec = odGec(p, r.job);
    const durum = r.C <= now ? 'bitti' : r.S <= now ? 'simdi' : '';
    out.push(`<button type="button" class="pm-od-is" data-act="od-is" data-v="${esc(r.id)}" ${gec ? 'data-gec' : ''} ${durum ? `data-durum="${durum}"` : ''} ${U.gySec === r.id ? 'data-secili' : ''} ${sj && r.job === sj ? 'data-ilgili' : ''} ${sj && r.job !== sj ? 'data-soluk' : ''} ${degisti ? 'data-degisti' : ''} ${yaz && r.C > now ? 'data-tasinir' : ''} ${S.locks[r.id] ? 'data-sabit' : ''}
      style="left:${x(Math.max(a, r.S))}%;width:${w(r.S, r.C)}%;--ayar:${ayar.toFixed(1)}%" title="${esc(r.id)} · ${esc(urunAd((S.D.siparisler.find(s => s.id === r.job) || {}).urun))}&#10;${esc(fmtDT(S.D, r.S))} → ${esc(fmtDT(S.D, r.C))} · ayar ${saat(r.su || 0)}, işleme ${saat(r.run || 0)}${gec ? ' · sipariş geç' : ''}"><span class="mono">${esc(r.job)}</span></button>`);
  }
  return out.join('');
}
/* zaman ekseni: gün adları, kısa pencerede saatler */
function odEksen(a, b, tekGun) {
  const x = t => ((t - a) / (b - a) * 100).toFixed(3); const gun = (b - a) / 24; const adim = tekGun || gun <= 1 ? 3 : gun <= 3 ? 6 : 24;
  const l = [];
  if (!tekGun) for (let t = Math.ceil(a / 24) * 24; t < b; t += 24) l.push(`<span style="left:${x(t)}%" data-gun>${esc(fmtDT(S.D, t + 1).slice(0, 9))}</span>`);
  if (adim < 24) for (let t = a; t < b; t += adim) { const h = Math.round(((t % 24) + 24) % 24); l.push(`<span style="left:${x(t)}%" ${tekGun ? '' : 'data-saat'}>${String(h).padStart(2, '0')}:00</span>`); }
  return `<div class="pm-od-eksen" ${!tekGun && adim < 24 ? 'data-iki' : ''} aria-hidden="true"><span class="pm-od-eksen-bas"></span><div>${l.join('')}</div></div>`;
}
/* etki satırı: tabandaki durum, önizleme ya da son adım; Uygula, Vazgeç, Geri al hep aynı yerde */
function odEtki() {
  const oz = S.plan.ozet; const a = U.taslak && U.taslak.adimlar; const x = a && a[a.length - 1];
  if (U.hamle && !U.taslak) {
    const h = U.hamle; const d = h.plan.ozet.wT - oz.wT; const ton = d < -0.05 ? 'tamam' : d > 0.05 ? 'uyari' : '';
    const ilk = h.degisen.slice().sort((p, q) => (q.gec ? 1 : 0) - (p.gec ? 1 : 0) || Math.abs(q.d) - Math.abs(p.d)).slice(0, 4);
    return `<div class="pm-od-etki" role="status" data-ton="${ton}">${ic('eye', 'k')}<span><b>Önizleme:</b> ${esc(h.ad)}</span>
      <span class="mono">gecikme ${saat(oz.wT)} → <b>${saat(h.plan.ozet.wT)}</b> ${fark(h.plan.ozet.wT, oz.wT)} · geciken ${oz.late} → <b>${h.plan.ozet.late}</b></span>
      ${ilk.length ? `<span class="pm-od-etki-l">${ilk.map(c => `<span ${c.d > 0.05 ? 'data-ton="hata"' : c.d < -0.05 ? 'data-ton="tamam"' : ''}><b class="mono">${esc(c.j)}</b> ${c.d > 0 ? '+' : '−'}${saat(Math.abs(c.d))}${c.gec ? ` (${esc(c.gec)})` : ''}</span>`).join('')}${h.degisen.length > ilk.length ? `<span>+${h.degisen.length - ilk.length} sipariş</span>` : ''}</span>` : '<span>Hiçbir siparişin bitişi değişmiyor.</span>'}
      <span class="pm-dugmeler">${dugme('Vazgeç', 'hamle-vazgec', { kucuk: true, hayalet: true })}${dugme('Uygula', 'hamle-uygula', { kucuk: true, birincil: true, simge: 'check' })}</span></div>`;
  }
  if (x) {
    const kotu = x.o1.wT > x.o0.wT + 0.05;
    return `<div class="pm-od-etki" role="status" data-ton="${kotu ? 'uyari' : x.o1.wT < x.o0.wT - 0.05 ? 'tamam' : ''}">${ic('layers', 'k')}<span><b>Son değişiklik:</b> ${esc(x.ad)}</span><span class="mono">gecikme ${saat(x.o0.wT)} → <b>${saat(x.o1.wT)}</b> ${fark(x.o1.wT, x.o0.wT)} · geciken ${x.o0.late} → <b>${x.o1.late}</b></span>
      <span class="pm-dugmeler">${dugme('Geri al', 'taslak-don', { kucuk: true, simge: 'rotate', veri: `data-v="${a.length - 1}"` })}${kotu ? dugme('Toparla', 'km-toparla', { kucuk: true, simge: 'bolt', yetki: 'plan.yaz' }) : ''}</span></div>`;
  }
  return `<div class="pm-od-etki" role="status">${ic('gauge', 'k')}<span>Planın şu hâli: toplam gecikme <b class="mono">${saat(oz.wT)}</b>, geç sipariş <b class="mono">${oz.late}</b>.</span><span class="pm-od-etki-ipucu">${tkDar() ? 'Bir işe dokunun; taşıma ve sıra düğmeleri aşağıda açılır.' : 'Çubuğu tutup başka tezgâha ya da saate bırakın; önce önizleme açılır, burada etkisini görürsünüz.'}</span></div>`;
}
function odLejant() {
  return `<ul class="pm-od-lejant" aria-label="Renkler"><li><i data-r="zam"></i>zamanında biten sipariş</li><li><i data-r="gec"></i>geç biten sipariş</li><li><i data-r="ayar"></i>ayar süresi</li><li><i data-r="kapali"></i>tezgâh kapalı</li><li><i data-r="simdi"></i>şimdi</li>${U.hamle ? '<li><i data-r="hayalet"></i>önizlemeden önceki yeri</li>' : ''}</ul>`;
}
/* seçili iş: taşıma seçenekleri ve etkileri, zaman kaydırma, sıra */
function odSecili(izin) {
  const id = U.gySec; const r = id && S.plan.ops[id]; if (!r || !izin(r.m)) return '';
  return `<section class="pm-od-blok pm-od-secili">
    <div class="pm-km">${kmIs(id)}</div>
    <div class="pm-km-hamleler">${dugme('Sırada öne', 'k-yukari', { kucuk: true, simge: 'up', yetki: 'plan.yaz', veri: `data-v="${esc(id)}"` })}${dugme('Sırada geriye', 'k-asagi', { kucuk: true, simge: 'down', yetki: 'plan.yaz', veri: `data-v="${esc(id)}"` })}${U.odak.m !== r.m ? dugme(`${odAd(r.m)} tezgâhına odaklan`, 'od-ac', { kucuk: true, hayalet: true, simge: 'zin', veri: `data-v="m:${esc(r.m)}"` }) : ''}</div></section>`;
}
/* bölümde en çok bekleyen siparişler; buradan öne alınır */
function odBekleyen(g) {
  const v = brVeri(); if (!v) return '';
  const l = []; for (const s of v.sip) for (const a of s.adim) if (a.g === g && a.bek > 0.5) l.push({ s, a });
  l.sort((p, q) => (q.s.gec ? 1 : 0) - (p.s.gec ? 1 : 0) || q.a.bek - p.a.bek);
  const top = l.reduce((t, x) => t + x.a.bek, 0);
  return `<section class="pm-od-blok"><h4>${ic('clock', 'k')}Bu bölümde bekleyenler</h4>
    <p class="pm-kucuk">${l.length ? `${l.length} adım tezgâh sırası bekliyor, toplam <b class="mono">${brSa(top)}</b>. Geç siparişler önde.` : 'Bu bölümde sıra bekleyen sipariş yok.'}</p>
    <ul class="pm-od-liste">${l.slice(0, 8).map(({ s, a }) => `<li ${s.gec ? 'data-gec' : ''} ${U.secJob === s.id ? 'data-secili' : ''}><button type="button" class="pm-at-link mono" data-act="od-sec-sip" data-v="${esc(s.id)}">${esc(s.id)}</button><span><span class="mono">${esc(odAd(a.m))}</span> · bekler <b class="mono">${brSa(a.bek)}</b>${s.gec ? ` · <b data-ton="hata">${brSa(s.T)} geç</b>` : ''}</span>${dugme('Öne al', 'one-al', { kucuk: true, hayalet: !s.gec, simge: 'flag', yetki: 'plan.yaz', veri: `data-v="${esc(s.id)}"` })}</li>`).join('')}</ul></section>`;
}
/* tezgâhın kuyruğu: sırayı buradan değiştirmek */
function odKuyruk(m, p) {
  const now = rsSimdi(); const l = Object.values(p.ops).filter(r => r.m === m && isFinite(r.C) && r.C > now).sort((a, b) => a.S - b.S);
  return `<section class="pm-od-blok"><h4>${ic('list', 'k')}Kuyruk (${l.length})</h4>
    <ol class="pm-od-kuyruk">${l.map((r, i) => `<li ${odGec(p, r.job) ? 'data-gec' : ''} ${U.gySec === r.id ? 'data-secili' : ''}><b class="mono">${i + 1}</b><button type="button" class="pm-at-link mono" data-act="od-is" data-v="${esc(r.id)}">${esc(r.id)}</button><small class="mono">${esc(fmtDT(S.D, r.S).slice(6))}</small>
      <span class="pm-od-kuyruk-d">${dugme('', 'k-yukari', { kucuk: true, hayalet: true, simge: 'up', ad: 'Sırada öne al', yetki: 'plan.yaz', veri: `data-v="${esc(r.id)}"` })}${dugme('', 'k-asagi', { kucuk: true, hayalet: true, simge: 'down', ad: 'Sırada geriye al', yetki: 'plan.yaz', veri: `data-v="${esc(r.id)}"` })}</span></li>`).join('') || '<li class="pm-kucuk">Kuyrukta iş yok.</li>'}</ol></section>`;
}
function odMesai(m) {
  const l = yetkili('plan.yaz') && m[0] !== '@' ? stMesaiAdaylari(m).slice(0, 6) : [];
  if (!l.length) return '';
  return `<section class="pm-od-blok"><h4>${ic('clock', 'k')}Ek mesai dene</h4><p class="pm-kucuk">Seçtiğiniz vardiya bu tezgâha eklenir, motor işleri yeniden dizer; önce önizleme açılır.</p><div class="pm-km-hamleler">${l.map(x => dugme(x.ad, 'km-mesai', { kucuk: true, veri: `data-v="${x.gun}|${esc(x.vardiya)}" data-m="${esc(m)}"` })).join('')}</div></section>`;
}
function odTakvim(m) { if (m[0] === '@') return ''; const o = U.rsTez; U.rsTez = m; try { return `<div class="pm-od-blok pm-od-takvim">${mzTakvim()}</div>`; } finally { U.rsTez = o; } }

function odBolum(p) {
  const g = U.odak.g; const ms = odTezgahlar(g); const { gun, a, b } = odPencere();
  const seritler = ms.map(m => { const d = odDoluluk(m, a, b, p); const kuy = Object.values(p.ops).filter(r => r.m === m && isFinite(r.C) && r.C > rsSimdi()).length;
    const T = S.D.tezgahlar.find(t => t.id === m) || {};
    return `<div class="pm-od-satir" data-m="${esc(m)}" ${U.rsTez === m ? 'data-secili' : ''}><button type="button" class="pm-od-tez" data-act="od-ac" data-v="m:${esc(m)}" title="${esc(odAd(m))} tezgâhına odaklan"><b class="mono">${esc(odAd(m))}</b><small>${esc(T.ad || '')}</small><small class="mono">${d == null ? 'kapalı' : `%${Math.round(d * 100)} dolu`} · ${kuy} iş</small></button><div class="pm-od-serit" data-m="${esc(m)}" data-a="${a}" data-b="${b}">${odSerit(m, a, b, p)}</div></div>`; }).join('');
  const izin = m => ms.includes(m);
  return { gun, ana: `${odEksen(a, b)}${seritler || '<p class="pm-kucuk">Bu bölümde tezgâh yok.</p>'}`, yan: odSecili(izin) + odBekleyen(g) };
}
function odTezgah(p) {
  const m = U.odak.m; const { gun, a } = odPencere();
  const seritler = Array.from({ length: gun }, (_, i) => { const x = a + i * 24, y = x + 24; const d = odDoluluk(m, x, y, p);
    return `<div class="pm-od-satir" data-gun="${i}"><div class="pm-od-tez" data-gunbas><b>${esc(fmtDT(S.D, x + 1).slice(0, 9))}</b><small class="mono">${d == null ? 'kapalı' : `%${Math.round(d * 100)} dolu`}</small></div><div class="pm-od-serit" data-m="${esc(m)}" data-a="${x}" data-b="${y}">${odSerit(m, x, y, p)}</div></div>`; }).join('');
  return { gun, ana: `${odEksen(a, a + 24, true)}${seritler}`, yan: odSecili(x => x === m) + odKuyruk(m, p) + odMesai(m) + odTakvim(m) };
}
function odHtml(p) {
  if (!U.odak || !p || !p.ops) return '';
  const g = U.odak.g, m = U.odak.m; const k = m ? odTezgah(p) : odBolum(p);
  const gruplar = odGruplar(); const kardes = m ? odTezgahlar(g) : gruplar;
  const iz = `<nav class="pm-od-iz" aria-label="Konum"><button type="button" data-act="od-kapat" title="Bütün tahtaya dön">${ic('home', 'k')}<span>Fabrika</span></button><span aria-hidden="true">›</span>${m ? `<button type="button" data-act="od-ac" data-v="g:${esc(g)}">${esc(BR_GRUP_AD[g] || g)}</button><span aria-hidden="true">›</span><b class="mono" aria-current="page">${esc(odAd(m))}</b>` : `<b aria-current="page">${esc(BR_GRUP_AD[g] || g)}</b>`}</nav>`;
  const sec = `<label class="pm-od-kardes"><select class="tc-alan-kutu" data-od-git aria-label="${m ? 'Başka tezgâh' : 'Başka bölüm'}">${kardes.map(x => `<option value="${m ? 'm:' : 'g:'}${esc(x)}" ${(m ? x === m : x === g) ? 'selected' : ''}>${esc(m ? odAd(x) : BR_GRUP_AD[x] || x)}</option>`).join('')}</select></label>`;
  const secenek = (m ? [[1, '1 gün'], [3, '3 gün'], [7, '7 gün'], [14, '14 gün']] : [[1, '1 gün'], [3, '3 gün'], [7, '7 gün']]).slice(0, tkDar() ? 3 : 4);
  const zaman = `<div class="pm-od-zaman" role="group" aria-label="Görünen süre">${dugme('', 'od-kay', { kucuk: true, hayalet: true, simge: 'chev-left', ad: 'Geri', veri: 'data-v="-1"' })}${dugme('Bugün', 'od-kay', { kucuk: true, hayalet: true, veri: 'data-v="0"' })}${dugme('', 'od-kay', { kucuk: true, hayalet: true, simge: 'chev-right', ad: 'İleri', veri: 'data-v="1"' })}<div class="pm-seg">${secenek.map(([v, ad]) => `<button type="button" data-act="od-gun" data-v="${v}" aria-pressed="${k.gun === v}">${ad}</button>`).join('')}</div></div>`;
  return `<section class="pm-od" id="pm-od" data-sev="${m ? 'tez' : 'grup'}" aria-label="Odak: ${esc(m ? odAd(m) : BR_GRUP_AD[g] || g)}">
    <header class="pm-od-bas">${iz}${sec}${zaman}${dugme('', 'od-ust', { kucuk: true, hayalet: true, simge: 'zout', ad: m ? 'Bölüme çık (Esc)' : 'Tahtaya dön (Esc)', cls: 'pm-od-cik' })}</header>
    ${odEtki()}
    <div class="pm-od-govde"><div class="pm-od-ana"><div class="pm-od-gantt"><div class="pm-od-ic" style="--od-gun:${m ? 1 : k.gun}">${k.ana}</div></div>${odLejant()}</div><aside class="pm-od-yan">${k.yan}</aside></div></section>`;
}
/* tahtada nereden açılırsa açılsın en anlamlı bölüm: seçili tezgâh, seçili işin tezgâhı, seçili siparişin en çok beklediği bölüm, yoksa en çok bekleten bölüm */
function odOtomatik() {
  if (U.gySec && S.plan.ops[U.gySec]) return 'm:' + S.plan.ops[U.gySec].m;
  if (U.rsTez) return 'm:' + U.rsTez;
  const v = brVeri(); if (!v) return 'g:' + (odGruplar()[0] || 'freze');
  if (U.secJob) { const s = v.sip.find(x => x.id === U.secJob); const a = s && s.adim.slice().sort((p, q) => q.bek - p.bek)[0]; if (a) return 'g:' + a.g; }
  const l = brBekleVeri(v).filter(x => x.id !== 'fason').sort((p, q) => q.bekG - p.bekG || q.bek - p.bek); return 'g:' + (l[0] ? l[0].id : odGruplar()[0]);
}
function odAc(v) {
  if (v === 'auto' || !v) v = odOtomatik();
  const [t, id] = [v.slice(0, 1), v.slice(2)];
  if (U.brTur != null) brTurBitir();
  const once = U.odak;
  /* telefonda tahta küçüktür; odak tam sayfada açılır, kapanınca eski hâline döner */
  if (!once && tkDar() && !U.tkTam) { OD.tamAc = true; U.tkTam = true; U.tkAra = false; tkTamUygula(); }
  U.odak = t === 'm' ? { g: brGrup(id), m: id } : { g: id, m: null };
  if (!once || !!once.m !== !!U.odak.m) U.odGun = null;
  if (!once) U.odKay = 0;
  if (t === 'm') U.rsTez = id;
  render();
}
function odKapat() {
  U.odak = null;
  if (OD.tamAc) { OD.tamAc = false; if (U.tkTam) { U.tkTam = false; tkTamUygula(); render(); requestAnimationFrame(() => { if (AT.cv) { atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); atTetikle(); } }); return; } }
  render();
}
function odUst() {
  if (!U.odak) return;
  if (U.odak.m) { U.odak = { g: U.odak.g, m: null }; U.odGun = null; render(); } else odKapat();
}

/* ---------- sürükleyip bırakma: fare ve kalemle; dokunmatikte seçip düğmelerle ---------- */
function odHedef(e, dx) {
  const el = document.elementFromPoint(e.clientX, e.clientY); const s = el && el.closest && el.closest('.pm-od-serit'); if (!s) return null;
  const R = s.getBoundingClientRect(); const a = +s.dataset.a, b = +s.dataset.b;
  const f = Math.max(0, Math.min(1, (e.clientX - dx - R.left) / R.width));
  return { s, m: s.dataset.m, t: Math.round((a + f * (b - a)) * 4) / 4 };
}
document.addEventListener('pointerdown', e => {
  const c = e.target.closest && e.target.closest('.pm-od-is[data-tasinir]'); if (!c || e.button !== 0 || e.pointerType === 'touch') return;
  const R = c.getBoundingClientRect(); OD.surukle = { id: c.dataset.v, el: c, x0: e.clientX, y0: e.clientY, dx: Math.min(e.clientX - R.left, R.width), acik: false, pid: e.pointerId };
});
document.addEventListener('pointermove', e => {
  const d = OD.surukle; if (!d || e.pointerId !== d.pid) return;
  if (!d.acik) { if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return; d.acik = true; d.el.dataset.surukleniyor = ''; document.getElementById('pm-od').dataset.surukle = '';
    d.ip = document.createElement('div'); d.ip.className = 'pm-od-surukle-ip'; d.ip.setAttribute('role', 'status'); document.getElementById('pm-od').appendChild(d.ip); }
  e.preventDefault();
  d.el.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;
  const h = odHedef(e, d.dx); document.querySelectorAll('.pm-od-serit[data-hedef]').forEach(x => { if (!h || x !== h.s) delete x.dataset.hedef; });
  if (h) { h.s.dataset.hedef = ''; const o = cxAl().byId[d.id]; const uygun = o && o.c.some(c => c.m === h.m); h.s.dataset.uygun = uygun ? '1' : '0';
    d.ip.textContent = uygun ? `${odAd(h.m)} · ${fmtDT(S.D, Math.max(rsSimdi(), h.t))}` : `${odAd(h.m)} bu adımı yapamaz`; d.ip.dataset.ton = uygun ? '' : 'hata'; }
  else d.ip.textContent = 'Bir şeride bırakın';
  const P = document.getElementById('pm-od').getBoundingClientRect(); d.ip.style.left = (e.clientX - P.left + 14) + 'px'; d.ip.style.top = (e.clientY - P.top + 14) + 'px';
}, { passive: false });
document.addEventListener('pointerup', e => {
  const d = OD.surukle; if (!d || e.pointerId !== d.pid) return; OD.surukle = null; if (!d.acik) return;
  OD.yut = performance.now(); const h = odHedef(e, d.dx);
  if (d.ip) d.ip.remove(); d.el.style.transform = ''; delete d.el.dataset.surukleniyor; const od = document.getElementById('pm-od'); if (od) delete od.dataset.surukle;
  document.querySelectorAll('.pm-od-serit[data-hedef]').forEach(x => delete x.dataset.hedef);
  if (!h) return; const r = S.plan.ops[d.id]; if (!r) return;
  U.gySec = d.id; U.secJob = r.job; gyTasi(d.id, h.m, h.t);
});
document.addEventListener('pointercancel', () => { const d = OD.surukle; OD.surukle = null; if (d && d.acik) { if (d.ip) d.ip.remove(); d.el.style.transform = ''; delete d.el.dataset.surukleniyor; } });
/* sürüklemenin bittiği yerdeki tıklama seçim sayılmaz */
document.addEventListener('click', e => { if (performance.now() - OD.yut < 350 && e.target.closest && e.target.closest('.pm-od')) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-od-git]'); if (s) odAc(s.value); });

/* ---------- bağlama ---------- */
const odAtEski = sAtolye;
sAtolye = function (p) {
  let h = odAtEski(p);
  const d = `<button type="button" class="tc-dugme tc-dugme-kucuk ${U.odak ? 'tc-dugme-birincil' : ''} pm-od-ac-d" data-act="${U.odak ? 'od-kapat' : 'od-ac'}" data-v="auto" aria-pressed="${!!U.odak}" title="Odak: bir bölüme ya da tezgâha girip orada çalış (O)">${ic('zin', 'k')}<span>Odak</span></button>`;
  h = h.replace('<div class="pm-at-arac">', `<div class="pm-at-arac">${d}`);
  h = h.replace('<button type="button" class="pm-tk-ray-d" data-act="br-tur"', `<button type="button" class="pm-tk-ray-d" data-act="${U.odak ? 'od-kapat' : 'od-ac'}" data-v="auto" aria-pressed="${!!U.odak}" title="Odak (O)">${ic('zin', 'k')}<span>Odak</span></button><button type="button" class="pm-tk-ray-d" data-act="br-tur"`);
  if (!U.odak) return h;
  h = h.replace('<div class="pm-at" id="pm-at"', '<div class="pm-at" id="pm-at" data-odak');
  const i = h.indexOf('<div class="pm-tk-hud">'); const ek = odHtml(p);
  return i >= 0 ? h.slice(0, i) + ek + h.slice(i) : (() => { const j = h.lastIndexOf('</div>'); return h.slice(0, j) + ek + h.slice(j); })();
};
/* tahtadaki girişler: tezgâh kartı ve bekleme bölgesindeki grup */
const odKmTezEski = kmTezgah;
kmTezgah = function (m) { return odKmTezEski(m).replace('<div class="pm-km-hamleler">', `<div class="pm-km-hamleler">${dugme('Odakla', 'od-ac', { kucuk: true, birincil: true, simge: 'zin', veri: `data-v="m:${esc(m)}"`, ipucu: 'Bu tezgâhın kendi tahtasını aç: gün gün işler, kuyruk, takvim' })}`); };
const odBekleEski = brBekle;
brBekle = function (v, sec) { return odBekleEski(v, sec).replace(/<div class="pm-br-bk-liste">/, () => `<div class="pm-br-bk-liste">${dugme(`${BR_GRUP_AD[U.brGrup] || U.brGrup} bölümüne odaklan`, 'od-ac', { kucuk: true, simge: 'zin', veri: `data-v="g:${esc(U.brGrup)}"` })}`); };
const odTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'od-ac': odAc(v); return true;
    case 'od-kapat': odKapat(); return true;
    case 'od-ust': odUst(); return true;
    case 'od-gun': U.odGun = +v; render(); return true;
    case 'od-kay': U.odKay = +v === 0 ? 0 : U.odKay + (+v) * Math.max(1, Math.round((U.odGun || odPencere().gun) / 2)); render(); return true;
    case 'od-is': { const r = S.plan.ops[v] || gosterilen().ops[v]; if (!r) return true; if (U.gySec === v) { U.gySec = null; } else { U.gySec = v; U.secJob = r.job; } render(); return true; }
    case 'od-is-kapat': U.gySec = null; render(); return true;
    case 'od-sec-sip': U.gySec = null; U.secJob = U.secJob === v ? null : v; render(); return true;
  }
  /* odaktayken siparişe ya da tezgâha git bağlantıları odakta kalır */
  if (U.odak && el && el.closest && el.closest('.pm-od')) {
    if (act === 'at-sip') { U.gySec = null; U.secJob = v; render(); return true; }
    if (act === 'km-is') return tekEylem('od-is', v, el, e);
    if (act === 'at-kapat') { U.gySec = null; render(); return true; }
  }
  return odTekEski(act, v, el, e);
};
/* yeniden çizimde kaydırma yeri korunur */
const odRenderEski = render;
render = function () {
  const g = document.querySelector('.pm-od-gantt'), y = document.querySelector('.pm-od-yan'), od = document.getElementById('pm-od');
  const k = g ? [g.scrollLeft, g.scrollTop, y ? y.scrollTop : 0, od ? od.scrollTop : 0, od ? od.dataset.sev : ''] : null;
  odRenderEski();
  const g2 = document.querySelector('.pm-od-gantt'); if (!g2 || !k) return; const od2 = document.getElementById('pm-od');
  if (od2.dataset.sev !== k[4]) return;
  g2.scrollLeft = k[0]; g2.scrollTop = k[1]; const y2 = document.querySelector('.pm-od-yan'); if (y2) y2.scrollTop = k[2]; od2.scrollTop = k[3];
};
/* Esc bir seviye çıkar; O odağı açar. Pencere üstünde yakalanır ki tahtanın kendi Esc'inden önce gelsin */
window.addEventListener('keydown', e => {
  if (!document.getElementById('pm-at') || e.ctrlKey || e.metaKey || e.altKey || (e.target.closest && e.target.closest('input, textarea, select, dialog, [contenteditable]'))) return;
  if (U.odak) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (OD.surukle) return; if (U.hamle && !U.taslak) { U.hamle = null; render(); return; } if (U.gySec) { U.gySec = null; render(); return; } odUst(); return; }
    if (e.key === 'o' || e.key === 'O') { e.preventDefault(); e.stopImmediatePropagation(); odKapat(); return; }
    if ('bBsS'.includes(e.key) && e.key.length === 1) { e.stopImmediatePropagation(); return; }
    return;
  }
  if (e.key === 'o' || e.key === 'O') { e.preventDefault(); e.stopImmediatePropagation(); odAc('auto'); }
}, true);
