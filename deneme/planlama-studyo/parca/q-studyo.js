/* ---------- Tezgâh stüdyosu ----------
   Tahtadan çift tıklamayla açılır; tahta arkada bulanık kalır. Üç parça: solda bağlam, ortada kuyruğun büyük zaman çizgisi,
   sağda etki. Her deneme motorun önizlemesinden geçer; Uygula demeden plan değişmez. */
function tbStudyoAc(m) { stAc('tez', m); }
function tbStudyoKapat() { U.studyo = null; U.stSec = null; render(); }
/* Stüdyolar: aynı kabuk, aynı üç parça; başlıktaki sekmeyle birinden ötekine geçilir, son bakılan tezgâh ve sipariş hatırlanır. */
const ST_TUR = [['tez', 'wrench', 'Tezgâh'], ['sip', 'list', 'Sipariş'], ['kriz', 'alert', 'Kriz masası'], ['sen', 'flag', 'Senaryo']];
function stAc(tur, v) {
  if (!S.plan) return; const p = gosterilen();
  if (tur === 'tez') { const m = v || (U.studyo && U.studyo.m) || U.stM || Object.entries(p.util || {}).filter(([k]) => k[0] !== '@').sort((a, b) => b[1].u - a[1].u).map(x => x[0])[0]; U.stM = m; U.studyo = { tur, m }; }
  else if (tur === 'sip') { const j = v || U.stJ || U.secJob || Object.entries(p.J || {}).sort((a, b) => (b[1].T || 0) - (a[1].T || 0)).map(x => x[0])[0]; U.stJ = j; U.studyo = { tur, j }; }
  else U.studyo = { tur };
  U.stSec = null; U.tbTez = null; U.tbCekmece = false; render();
}
function stKabuk(tur, kimlik, sol, orta, sag) {
  const sek = ST_TUR.map(([k, sm, ad]) => `<button type="button" role="tab" aria-selected="${tur === k}" data-act="st-tur" data-v="${k}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('');
  const ad = (ST_TUR.find(x => x[0] === tur) || [])[2] || '';
  return `<div class="pm-st" data-tur="${tur}" role="dialog" aria-label="${esc(ad)} stüdyosu${kimlik ? ': ' + esc(kimlik) : ''}"><header class="pm-st-ust"><div class="pm-st-sek" role="tablist" aria-label="Stüdyolar">${sek}</div>${kimlik ? `<span class="mono pm-st-kim">${esc(kimlik)}</span>` : ''}<span class="pm-sira-ara"></span><span class="pm-kucuk">Esc ile tahtaya dön</span>${dugme('Tahtaya dön', 'st-kapat', { simge: 'x', kucuk: true })}</header>
    <div class="pm-st-govde">${sol}${orta}${sag}</div>${U.hamle ? `<div class="pm-st-mkarar" role="status"><span class="mono">gecikme ${saat(S.plan.ozet.wT)} → <b>${saat(U.hamle.plan.ozet.wT)}</b></span>${dugme('Vazgeç', 'hamle-vazgec', { kucuk: true })}${dugme('Uygula', 'hamle-uygula', { kucuk: true, birincil: true, simge: 'check' })}</div>` : ''}</div>`;
}
/* Sağ parça her stüdyoda aynı: etki önce ve sonra, değişen siparişler, tek Uygula */
function stEtki(ek = '', bos = 'Bir değişiklik deneyin; etkisi burada önce ve sonra olarak görünür.') {
  const p = gosterilen(); const o = p.ozet, on = U.hamle ? S.plan.ozet : null;
  const olcu = (ad, a, b, k = 1) => `<div class="pm-st-olcu"><small>${ad}</small><b class="mono">${k ? saat(a) : a}</b>${b != null ? `<span class="mono">önce ${k ? saat(b) : b} ${fark(a, b, k)}</span>` : ''}</div>`;
  const deg = U.hamle ? U.hamle.degisen.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 8) : [];
  return `<section class="pm-st-sag" aria-label="Etki"><h3>${ic('gauge', 'k')}Etki</h3>${U.hamle ? `<p class="pm-kucuk">${esc(U.hamle.ad)}</p>` : `<p class="pm-kucuk">${bos}</p>`}
    ${olcu('Ağırlıklı gecikme', o.wT, on && on.wT)}${olcu('Geciken sipariş', o.late, on && on.late, 0)}${ek}
    ${deg.length ? `<h4>Bitişi değişen siparişler</h4><ul class="pm-st-deg">${deg.map(x => `<li><b class="mono">${esc(x.j)}</b><span class="pm-kucuk">${esc(x.gec || '')}</span><span class="mono ${x.d > 0.05 ? 'pm-fark-kotu' : x.d < -0.05 ? 'pm-fark-iyi' : ''}">${x.d > 0 ? '+' : x.d < 0 ? '−' : ''}${saat(Math.abs(x.d))}</span></li>`).join('')}</ul>` : ''}
    ${U.taslak ? taslakPaneli(true) : ''}
    ${U.hamle ? `<div class="pm-dugmeler pm-st-karar">${dugme('Vazgeç', 'hamle-vazgec', {})}${dugme('Uygula', 'hamle-uygula', { birincil: true, simge: 'check' })}</div>` : ''}</section>`;
}
function sStudyoAc() { const t = U.studyo.tur; return t === 'sip' ? sStudyoSip() : t === 'kriz' ? sStudyoKriz() : t === 'sen' ? sStudyoSen() : sStudyoTez(); }
/* çizelge ufku: gün, düğme adı, saat başına piksel; dar ufuk büyük ölçekle çizilir, alan yatay kayar */
const ST_UFUK = [[1, '1 g', 40], [3, '3 g', 16], [7, '1 hafta', 9], [14, '2 hafta', 6]];
function stKuyruk(p, m) { const now = cxAl().st.now; return Object.values(p.ops).filter(r => r.m === m && isFinite(r.C) && r.C > now).sort((a, b) => a.S - b.S); }
function stGunluk(p, m, gun) {
  const cx = cxAl(); const M = cx.M[m]; const d0 = Math.floor(cx.st.now / 24) * 24;
  return Array.from({ length: gun }, (_, g) => { const a = d0 + g * 24, b = a + 24; let acik = 0, dolu = 0;
    if (M) for (const [x, y] of M.rw) { if (y <= a || x >= b) continue; acik += Math.min(y, b) - Math.max(x, a); } else acik = 24;
    for (const r of Object.values(p.ops)) if (r.m === m && isFinite(r.C)) { const o = Math.min(r.C, b) - Math.max(r.S, a); if (o > 0) dolu += o; }
    return { g, a, acik, dolu }; });
}
/* ek mesai adayları: tezgâhın çalışmadığı vardiyalar, önümüzdeki beş gün */
function stMesaiAdaylari(m) {
  const D = S.D; const t = D.tezgahlar.find(x => x.id === m); if (!t || !(t.vardiyalar || []).length) return [];
  const d0 = Math.floor(cxAl().st.now / 24); const var_ = new Set(S.ekMesai.filter(e => e.m === m).map(e => e.gun + '/' + e.vardiya));
  const l = []; for (let g = 0; g < 5; g++) for (const v of D.vardiyalar) if (!t.vardiyalar.includes(v.id) && !var_.has((d0 + g) + '/' + v.id)) l.push({ m, gun: d0 + g, vardiya: v.id, ad: `${fmtDT(D, (d0 + g) * 24).slice(0, 9)} ${v.id} ${v.bas}-${v.bit}` });
  return l.slice(0, 10);
}
function stMesaiOnizle(gun, vardiya) {
  const m = U.studyo && U.studyo.m; if (!m || !yetkili('plan.yaz')) return;
  const em = [...S.ekMesai, { m, gun: +gun, vardiya }]; const st = { ...stOf(), ekMesai: clone(em) }; const cx = compile(st);
  const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, [], cx, true);
  const L = lns(st, p0, null, { ms: 500, seed: 11, free: true });
  const p = cmpEv(L.e, evaluate(p0, st, null, true)) > 0 ? L.plan : p0; slack(p, cx);
  hamleKur(p, st, `Ek mesai: ${m} ${fmtDT(S.D, gun * 24).slice(0, 9)} ${vardiya}`, { ekMesai: em, kaynak: 'motor' }); render();
}
function sStudyoTez() {
  const m = U.studyo.m; const p = gosterilen(); const cx = cxAl(); const D = S.D; const M = cx.M[m] || {}; const J = p.J || {};
  const kuy = stKuyruk(p, m); const now = cx.st.now; const gun = ST_UFUK.some(x => x[0] === U.stUfuk) ? U.stUfuk : 7; const t1 = now + gun * 24;
  const yaz = yetkili('plan.yaz'); const sec = U.stSec && p.ops[U.stSec] ? U.stSec : null;
  /* sol: bağlam */
  const gl = stGunluk(p, m, 7); const glOnce = U.hamle ? stGunluk(S.plan, m, 7) : null;
  const gunler = gl.map((d, i) => { const o = d.acik ? d.dolu / d.acik : 0; const oo = glOnce && glOnce[i].acik ? glOnce[i].dolu / glOnce[i].acik : null;
    return `<li><span class="mono">${esc(fmtDT(D, d.a).slice(0, 9))}</span><span class="pm-st-bar" data-isi="${isiSeviye(d.acik ? o : null)}"><i style="width:${Math.min(100, o * 100).toFixed(0)}%"></i>${oo != null && Math.abs(oo - o) > 0.01 ? `<b style="left:${Math.min(100, oo * 100).toFixed(0)}%" title="önce"></b>` : ''}</span><span class="mono">${d.acik ? '%' + Math.round(o * 100) : 'kapalı'}</span></li>`; }).join('');
  const once = {}, sonra = {};
  for (const jo of Object.values(cx.jobs)) { const rs = jo.ops.map(o => p.ops[o.id]).filter(Boolean); for (let i = 1; i < rs.length; i++) { if (rs[i].m === m && rs[i - 1].m !== m) once[rs[i - 1].m] = (once[rs[i - 1].m] || 0) + 1; if (rs[i - 1].m === m && rs[i].m !== m) sonra[rs[i].m] = (sonra[rs[i].m] || 0) + 1; } }
  const komsu = (o, ad) => { const l = Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5); return l.length ? `<p class="pm-kucuk">${ad}</p><div class="pm-st-komsu">${l.map(([k, n]) => `<button type="button" class="tc-dugme tc-dugme-kucuk" data-act="st-git" data-v="${esc(k)}">${esc(k[0] === '@' ? k.slice(1) : k)} <small>${n}</small></button>`).join('')}</div>` : ''; };
  const gecenler = [...new Set(kuy.filter(r => J[r.job] && J[r.job].T > 0.05).map(r => r.job))];
  const sol = `<section class="pm-st-sol" aria-label="Bağlam"><h3>${ic('cpu', 'k')}<span class="mono">${esc(m[0] === '@' ? m.slice(1) : m)}</span> ${esc(M.ad || '')}</h3><p class="pm-kucuk">${esc(M.grup || 'fason')} · ${kuy.length} iş sırada${gecenler.length ? ` · <b class="pm-fark-kotu">${gecenler.length} geciken sipariş</b>` : ''}</p>
    <h4>Günlük doluluk</h4><ul class="pm-st-gunler">${gunler}</ul>${komsu(once, 'İşin geldiği tezgâhlar')}${komsu(sonra, 'İşin gittiği tezgâhlar')}</section>`;
  /* orta: zaman çizgisi ve sıra */
  const px = 100 / (t1 - now);
  const kapali = (() => { let s = '', t = now; for (const [a, b] of (M.rw || [])) { if (a > t1) break; if (a > t) s += `<i class="pm-st-kapali" style="left:${((t - now) * px).toFixed(2)}%;width:${((Math.min(a, t1) - t) * px).toFixed(2)}%"></i>`; t = Math.max(t, b); } if (M.rw && t < t1) s += `<i class="pm-st-kapali" style="left:${((t - now) * px).toFixed(2)}%;width:${((t1 - t) * px).toFixed(2)}%"></i>`; return s; })();
  const gunCiz = Array.from({ length: gun + 1 }, (_, i) => { const t = Math.ceil(now / 24) * 24 + i * 24; return t < t1 ? `<i class="pm-st-gun" style="left:${((t - now) * px).toFixed(2)}%"><span class="mono">${esc(fmtDT(D, t).slice(0, 9))}</span></i>` : ''; }).join('');
  const eski = U.hamle ? S.plan.ops : null;
  const bloklar = kuy.filter(r => r.S < t1).map(r => { const a = Math.max(r.S, now), b = Math.min(r.C, t1); const o = cx.byId[r.id] || {}; const gec = J[r.job] && J[r.job].T > 0.05; const e = eski && eski[r.id]; const deg = eski && (!e || e.m !== r.m || Math.abs(e.S - r.S) > 0.25);
    return `<button type="button" class="pm-st-blok" data-act="st-sec" data-v="${esc(r.id)}" data-op="${esc(r.id)}" draggable="${yaz}" style="left:${((a - now) * px).toFixed(2)}%;width:${Math.max(0.6, (b - a) * px).toFixed(2)}%;--c:${durumRenk(r.job)}" ${gec ? 'data-gec' : ''} ${deg ? 'data-degisti' : ''} ${sec === r.id ? 'data-secili' : ''} title="${esc(r.id)} · ${esc(o.ad || '')} · ${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C))}"><b class="mono">${esc(r.job)}</b><small>${esc(o.ad || '')}</small></button>`; }).join('');
  const satir = kuy.slice(0, 40).map((r, i) => { const o = cx.byId[r.id] || {}; const gec = J[r.job] && J[r.job].T > 0.05; const onceki = kuy[i - 1];
    return `<li data-op="${esc(r.id)}" draggable="${yaz}" ${sec === r.id ? 'data-secili' : ''}><span class="pm-st-tut" aria-hidden="true">${ic('sort', 'k')}</span><b class="mono">${i + 1}</b><button type="button" class="pm-st-ad" data-act="st-sec" data-v="${esc(r.id)}" ${yaz ? 'aria-keyshortcuts="ArrowUp ArrowDown"' : ''}><span class="mono" style="--c:${durumRenk(r.job)}">${esc(r.job)}</span> ${esc(o.ad || '')}<small>${esc(fmtDT(D, r.S))} → ${esc(fmtDT(D, r.C).slice(6))} · ${saat(r.C - r.S)}${gec ? ' · sipariş gecikiyor' : ''}</small></button>${yaz ? `<span class="pm-st-oklar">${onceki ? dugme('', 'st-one', { simge: 'up', kucuk: true, hayalet: true, ad: 'Bir öne al', veri: `data-v="${esc(r.id)}" data-once="${esc(onceki.id)}"` }) : ''}${kuy[i + 1] ? dugme('', 'st-sonra', { simge: 'down', kucuk: true, hayalet: true, ad: 'Bir sonraya at', veri: `data-v="${esc(r.id)}"` }) : ''}</span>` : ''}</li>`; }).join('');
  const op = sec ? cx.byId[sec] : null;
  const alt = op ? op.c.filter(c => c.m !== m).map(c => { const u = p.util && p.util[c.m]; return dugme(`${c.m[0] === '@' ? c.m.slice(1) : c.m}${u ? ` %${Math.round(u.u * 100)}` : ''}`, 'st-tasi', { kucuk: true, veri: `data-v="${esc(sec)}" data-m="${esc(c.m)}"`, yetki: 'plan.yaz' }); }).join('') : '';
  const mesai = stMesaiAdaylari(m);
  const kh = (ST_UFUK.find(x => x[0] === gun) || [0, 0, 9])[2];
  const ufuk = `<div class="pm-st-cizgi-bas"><h4>${ic('gantt', 'k')}Çizelge <span class="pm-kucuk">${gun === 1 ? '1 gün' : gun === 7 ? '1 hafta' : gun === 14 ? '2 hafta' : gun + ' gün'}</span></h4><div class="pm-seg" role="group" aria-label="Çizelge ufku">${ST_UFUK.map(([g, ad]) => `<button type="button" data-act="st-ufuk" data-v="${g}" aria-pressed="${g === gun}">${ad}</button>`).join('')}</div></div>`;
  const orta = `<section class="pm-st-orta" aria-label="Kuyruk">${ufuk}<div class="pm-st-cizgi-kap" id="st-cizgi-kap"><div class="pm-st-cizgi" id="st-cizgi" data-t0="${now}" data-t1="${t1}" style="width:${Math.round(gun * 24 * kh)}px">${kapali}${gunCiz}${bloklar}</div></div>
    <div class="pm-st-alt"><div class="pm-st-sira"><h4>${ic('sort', 'k')}Sıra <span class="pm-kucuk">sürükleyin, ↑ ↓ tuşları ya da oklar</span></h4><ol class="pm-st-liste" id="st-liste">${satir || '<li class="pm-kucuk">Sırada iş yok.</li>'}</ol></div>
    <div class="pm-st-arac">${sec ? `<h4>${esc(sec)}</h4><p class="pm-kucuk">${esc(op ? op.ad || '' : '')}</p>${alt ? `<p class="pm-kucuk">Başka tezgâha taşı (o tezgâhın doluluğu)</p><div class="pm-dugmeler">${alt}</div>` : '<p class="pm-kucuk">Bu adımı yalnız bu tezgâh yapabiliyor.</p>'}${yaz ? `<div class="pm-dugmeler">${dugme('Sıranın başına al', 'st-basa', { simge: 'first', kucuk: true, veri: `data-v="${esc(sec)}"` })}</div>` : ''}` : '<p class="pm-kucuk">Bir iş seçin: başka tezgâha taşıma ve öne alma burada açılır.</p>'}
      ${mesai.length && yaz ? `<h4>Ek mesai</h4><p class="pm-kucuk">Tezgâhın çalışmadığı vardiyayı açmayı deneyin.</p><div class="pm-dugmeler">${mesai.map(x => dugme(x.ad, 'st-mesai', { kucuk: true, veri: `data-v="${x.gun}" data-vardiya="${esc(x.vardiya)}"` })).join('')}</div>` : ''}</div></div></section>`;
  /* sağ: etki */
  const u = p.util && p.util[m], uo = U.hamle && S.plan.util ? S.plan.util[m] : null;
  const sag = stEtki(u ? `<div class="pm-st-olcu"><small>Bu tezgâhın doluluğu</small><b class="mono">%${Math.round(u.u * 100)}</b>${uo ? `<span class="mono">önce %${Math.round(uo.u * 100)} ${fark(u.u * 100, uo.u * 100, 1)}</span>` : ''}</div>` : '');
  return stKabuk('tez', m[0] === '@' ? m.slice(1) : m, sol, orta, sag);
}
function stBagla() {
  const st = document.querySelector('.pm-st'); if (!st || st.dataset.bagli) return; st.dataset.bagli = '1';
  let tasi = null;
  st.addEventListener('dragstart', e => { const el = e.target.closest('[data-op]'); if (!el || !yetkili('plan.yaz')) return; tasi = el.dataset.op; try { e.dataTransfer.setData('text/plain', tasi); } catch (x) { /* bazı tarayıcılar reddeder */ } e.dataTransfer.effectAllowed = 'move'; st.dataset.tasiniyor = ''; });
  /* çizelgede boş bir yere bırakılan iş o saate alınır; saat çeyreğe oturur, bırakmadan önce çizgide gösterilir */
  const cizSaat = (cz, x) => { const R = cz.getBoundingClientRect(); const t0 = +cz.dataset.t0, t1 = +cz.dataset.t1; return Math.max(t0, Math.round((t0 + (x - R.left) / R.width * (t1 - t0)) * 4) / 4); };
  const isaret = (cz, t) => { let i = cz.querySelector('.pm-st-birak'); if (!i) { i = document.createElement('i'); i.className = 'pm-st-birak'; cz.appendChild(i); } const t0 = +cz.dataset.t0, t1 = +cz.dataset.t1; i.style.left = ((t - t0) / (t1 - t0) * 100).toFixed(2) + '%'; i.dataset.metin = fmtDT(S.D, t); };
  const temizle = () => { st.querySelectorAll('[data-hedef]').forEach(x => delete x.dataset.hedef); st.querySelectorAll('.pm-st-birak').forEach(x => x.remove()); };
  st.addEventListener('dragover', e => { if (!tasi) return; const h = e.target.closest('[data-op]'); const cz = e.target.closest('#st-cizgi'); st.querySelectorAll('[data-hedef]').forEach(x => delete x.dataset.hedef);
    if (h && h.dataset.op !== tasi && !h.classList.contains('pm-st-blok')) { e.preventDefault(); h.dataset.hedef = ''; st.querySelectorAll('.pm-st-birak').forEach(x => x.remove()); return; }
    if (cz) { e.preventDefault(); isaret(cz, cizSaat(cz, e.clientX)); } });
  st.addEventListener('dragend', () => { tasi = null; delete st.dataset.tasiniyor; temizle(); });
  st.addEventListener('drop', e => { if (!tasi) return; const id = tasi; const h = e.target.closest('[data-op]'); const cz = e.target.closest('#st-cizgi');
    if (h && h.dataset.op !== id && !h.classList.contains('pm-st-blok')) { e.preventDefault(); tasi = null; temizle(); kanbanTasi(id, U.studyo.m, h.dataset.op, false); return; }
    if (cz) { e.preventDefault(); tasi = null; const t = cizSaat(cz, e.clientX); temizle(); const m = U.studyo.m; hamleDene([[id, m, t]], `${id} → ${m.replace('@', 'fason ')}, ${fmtDT(S.D, t)}`, [[id, m, t]]); } });
  /* klavye: seçili iş ↑ bir öne, ↓ bir sonraya */
  st.addEventListener('keydown', e => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; const b = e.target.closest('.pm-st-ad[data-v]'); if (!b || !yetkili('plan.yaz')) return; e.preventDefault();
    const li = b.closest('li'); const d = li && li.querySelector(`[data-act="${e.key === 'ArrowUp' ? 'st-one' : 'st-sonra'}"]`); if (d) d.click(); });
}
