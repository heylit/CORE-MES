/* ---------- plan matrisi, kanban kuyruğu, 3B atölye akışı ----------
   Üçü de aynı plandan okur; hesap motorda kalır. Kanbandaki her taşıma bir hamledir ve motorun önizlemesinden geçer. */

/* Günlük dağılım: bir işlemin üretim süresi tezgâhın çalışma pencerelerine göre günlere bölünür; adet bu oranla paylaşılır. */
const GUNLUK_ON = new WeakMap();
function gunlukDagilim(p) {
  if (GUNLUK_ON.has(p)) return GUNLUK_ON.get(p);
  const cx = cxAl(); const D = S.D; if (!cx) return null;
  const d0 = Math.floor(cx.st.now / 24);
  const tez = {}, kisi = {}, sip = {};
  const hucre = (o, k, d) => { const r = (o[k] = o[k] || {}); return (r[d] = r[d] || { adet: 0, mesgul: 0, isler: [] }); };
  const parca = [];
  for (const r of Object.values(p.ops)) {
    if (r.fas || !isFinite(r.C)) continue;
    const o = cx.byId[r.id], M = cx.M[r.m]; if (!o || !M) continue;
    const top = workIn(M.rw, r.Su, r.C) || 1;
    for (let d = Math.max(d0, Math.floor(r.S / 24)); d <= Math.floor((r.C - 1e-6) / 24); d++) {
      const a = d * 24, b = a + 24;
      const uret = workIn(M.rw, Math.max(r.Su, a), Math.min(r.C, b));
      const ayar = workIn(M.sw, Math.max(r.S, a), Math.min(r.Su, b));
      if (uret + ayar <= 1e-6) continue;
      const adet = (o.adet * uret) / top;
      const h = hucre(tez, r.m, d); h.adet += adet; h.mesgul += uret + ayar; h.isler.push({ id: r.id, job: r.job, adet, saat: uret + ayar });
      parca.push({ r, o, M, d, adet });
      const son = !(cx.succ[r.id] || []).length;
      if (son && adet > 1e-6) { const s = hucre(sip, r.job, d); s.adet += adet; s.isler.push({ id: r.id, job: r.job, adet }); }
    }
  }
  /* Motor kişi seçmez, grup başına kişi sayar. Kişi satırları bu yüzden bir atama önerisidir:
     her vardiyada tezgâh, o vardiyada çalışan ve tezgâhın grubunda yetkin, en az yüklü kişiye verilir. */
  const vs = Object.fromEntries(D.vardiyalar.map(v => [v.id, v]));
  const hm2 = s => { const [h, m] = String(s).split(':').map(Number); return h + (m || 0) / 60; };
  const vardPen = (d, sid) => { const v = vs[sid]; if (!v) return null; const a = d * 24 + hm2(v.bas); let b = d * 24 + hm2(v.bit); if (b <= a) b += 24; return [a, b]; };
  for (const { r, o, M, d } of parca) {
    const top = workIn(M.rw, r.Su, r.C) || 1;
    for (const sid of (cx.days[d] || { vard: [] }).vard) {
      const w = vardPen(d, sid); if (!w) continue;
      const uret = workIn(M.rw, Math.max(r.Su, w[0]), Math.min(r.C, w[1])); if (uret <= 1e-6) continue;
      const adet = (o.adet * uret) / top;
      const anahtar = `${d}|${sid}`;
      const aday = D.personel.filter(k => k.vardiya === sid && (k.gruplar || []).includes(M.grup));
      const yuk = k => ((kisi[k.id] || {})['_y' + anahtar] || 0);
      const yer = aday.filter(k => yuk(k) + M.opOran <= 1.0001 || ((kisi[k.id] || {})['_m' + anahtar] || []).includes(r.m)).sort((a, b) => yuk(a) - yuk(b))[0];
      const kid = yer ? yer.id : '_bos';
      const kk = (kisi[kid] = kisi[kid] || {});
      const mler = (kk['_m' + anahtar] = kk['_m' + anahtar] || []);
      if (!mler.includes(r.m)) { mler.push(r.m); kk['_y' + anahtar] = (kk['_y' + anahtar] || 0) + M.opOran; }
      const h = (kk[d] = kk[d] || { adet: 0, mesgul: 0, isler: [], tez: new Set() }); h.adet += adet; h.mesgul += uret; h.isler.push({ id: r.id, job: r.job, adet, m: r.m }); h.tez.add(r.m);
    }
  }
  const out = { d0, tez, kisi, sip, cx };
  GUNLUK_ON.set(p, out); return out;
}

const MATRIS_GORUNUM = [['tezgah', 'Tezgâh', 'cpu'], ['kisi', 'Personel', 'user'], ['siparis', 'Sipariş', 'list']];
function isiSeviye(oran) { return oran == null ? 0 : oran < 0.05 ? 0 : oran < 0.35 ? 1 : oran < 0.65 ? 2 : oran < 0.9 ? 3 : 4; }
function sMatris() {
  if (!S.plan) return `<div class="pm-bos">${ic('grid', 'b')}<strong>Henüz plan yok</strong><span>Plan çözülünce tezgâh, kişi ve sipariş başına günlük adet burada görünür.</span>${dugme('Planı çöz', 'coz-ac', { birincil: true, simge: 'play' })}</div>`;
  const p = gosterilen(); const v = gunlukDagilim(p); const D = S.D; if (!v) return '';
  const gor = U.mGor || 'tezgah', gunN = U.mGun || 7;
  const gunler = Array.from({ length: gunN }, (_, i) => v.d0 + i);
  const calisir = d => ((v.cx.days[d] || {}).vard || []).length > 0;
  const bas = gunler.map(d => { const t = fmtDT(D, d * 24); return `<th scope="col" class="pm-num" ${calisir(d) ? '' : 'data-kapali'}><span class="pm-m-gun">${esc(t.slice(6, 9))}</span><span class="pm-kucuk mono">${esc(t.slice(0, 5))}</span></th>`; }).join('');
  const tAdet = x => x < 0.5 ? (x > 1e-6 ? '<1' : '') : sayi(Math.round(x), 0);
  const ipucu = h => h.isler.slice().sort((a, b) => b.adet - a.adet).slice(0, 8).map(x => `${x.id} · ${x.adet < 1 ? '<1' : Math.round(x.adet)} adet${x.m ? ' · ' + x.m : ''}`).join('\n') + (h.isler.length > 8 ? `\n+${h.isler.length - 8} iş` : '');
  const toplamG = gunler.map(() => 0);
  const hucreler = (sat, kapasite) => {
    let top = 0;
    const tds = gunler.map((d, i) => {
      const h = sat[d]; if (!h) return `<td class="pm-m-h" data-isi="0" ${calisir(d) ? '' : 'data-kapali'}></td>`;
      const cap = kapasite(d); const oran = cap ? h.mesgul / cap : null; top += h.adet; toplamG[i] += h.adet;
      return `<td class="pm-m-h" data-isi="${isiSeviye(oran)}" data-ipucu="${esc(ipucu(h))}" tabindex="0"><b>${tAdet(h.adet)}</b>${oran != null ? `<span class="pm-kucuk">%${Math.round(oran * 100)}</span>` : ''}</td>`;
    }).join('');
    return [tds, top];
  };
  let govde = '', sutun = 'Tezgâh', not = '';
  if (gor === 'tezgah') {
    const gruplar = {}; for (const m of D.tezgahlar) (gruplar[m.grup] = gruplar[m.grup] || []).push(m);
    for (const [g, l] of Object.entries(gruplar)) {
      if (U.grup && U.grup !== g) continue;
      govde += `<tr class="pm-m-grup"><th scope="rowgroup" colspan="${gunN + 2}">${esc(g)}</th></tr>`;
      for (const m of l) {
        const M = v.cx.M[m.id]; const [tds, top] = hucreler(v.tez[m.id] || {}, d => workIn(M.rw, d * 24, d * 24 + 24));
        govde += `<tr><th scope="row"><button type="button" class="pm-m-ad" data-act="kanban-tezgah" data-v="${esc(m.id)}"><b class="mono">${esc(m.id)}</b><span class="pm-kucuk">${esc(m.ad)}</span></button></th>${tds}<td class="pm-num"><b>${top ? sayi(Math.round(top), 0) : '—'}</b></td></tr>`;
      }
    }
    not = 'Hücre: o gün üretilen parça adedi (ayar hariç). Alttaki yüzde: tezgâhın o günkü çalışma süresinin ne kadarının dolu olduğu (ayar dahil). Renk koyulaştıkça tezgâh doludur.';
  } else if (gor === 'kisi') {
    sutun = 'Personel';
    const sat = D.personel.filter(k => v.kisi[k.id]).concat(D.personel.filter(k => !v.kisi[k.id]));
    for (const k of sat) {
      const vs = D.vardiyalar.find(x => x.id === k.vardiya); const sure = vs ? ((h => h <= 0 ? h + 24 : h)(hm(vs.bit) - hm(vs.bas))) : 8;
      const [tds, top] = hucreler(v.kisi[k.id] || {}, d => calisir(d) ? sure : 0);
      govde += `<tr><th scope="row"><span class="pm-m-ad"><b>${esc(k.ad)}</b><span class="pm-kucuk">${esc(k.vardiya)} · ${esc((k.gruplar || []).join(', '))}</span></span></th>${tds}<td class="pm-num"><b>${top ? sayi(Math.round(top), 0) : '—'}</b></td></tr>`;
    }
    if (v.kisi._bos) { const [tds, top] = hucreler(v.kisi._bos, () => 0); govde += `<tr data-uyari><th scope="row"><span class="pm-m-ad"><b>${ic('alert', 'k')} Kişi atanamadı</b><span class="pm-kucuk">vardiyada yetkin kişi yok ya da dolu</span></span></th>${tds}<td class="pm-num"><b>${sayi(Math.round(top), 0)}</b></td></tr>`; }
    not = 'Motor kişi seçmez; grup ve vardiya başına kişi sayar. Bu tablo bir atama önerisidir: her vardiyada tezgâh, yetkin ve en az yüklü kişiye verilir (tezgâhın operatör oranı elverdiği kadar bir kişi birden çok tezgâh bakar). Işıksız çalışan tezgâhın vardiya dışı üretimi kişiye yazılmaz.';
  } else {
    sutun = 'Sipariş';
    const J = p.J || {};
    for (const s of D.siparisler) {
      if (U.yalnizGec && !(J[s.id] && (J[s.id].T == null || J[s.id].T > 0.05))) continue;
      const [tds, top] = hucreler(v.sip[s.id] || {}, () => 0);
      const gec = J[s.id] && J[s.id].T > 0.05;
      govde += `<tr ${gec ? 'data-uyari' : ''}><th scope="row"><button type="button" class="pm-m-ad" data-act="sec-is-masa" data-v="${esc(s.id)}"><b class="mono">${esc(s.id)}</b><span class="pm-kucuk">${esc(urunAd(s.urun))} · ${sayi(s.adet, 0)} adet${gec ? ' · ' + saat(J[s.id].T) + ' gecikme' : ''}</span></button></th>${tds}<td class="pm-num"><b>${top ? sayi(Math.round(top), 0) : '—'}</b></td></tr>`;
    }
    not = 'Hücre: siparişin son adımında o gün biten parça adedi, yani teslime hazır parça. Kırmızı satır termini kaçan siparişi gösterir.';
  }
  const alt = `<tr class="pm-m-top"><th scope="row">Toplam</th>${toplamG.map(x => `<td class="pm-num"><b>${x ? sayi(Math.round(x), 0) : ''}</b></td>`).join('')}<td class="pm-num"><b>${sayi(Math.round(toplamG.reduce((a, b) => a + b, 0)), 0)}</b></td></tr>`;
  const seg = `<div class="pm-seg" role="tablist" aria-label="Matris">${MATRIS_GORUNUM.map(([id, ad, sm]) => `<button type="button" role="tab" data-act="m-gor" data-v="${id}" aria-selected="${gor === id}">${ic(sm, 'k')}${ad}</button>`).join('')}</div>`;
  const gunSec = `<div class="pm-seg" role="tablist" aria-label="Gün sayısı">${[7, 14].map(n => `<button type="button" role="tab" data-act="m-gun" data-v="${n}" aria-selected="${gunN === n}">${n} gün</button>`).join('')}</div>`;
  const lejant = `<div class="pm-m-lejant" aria-hidden="true"><span class="pm-kucuk">Doluluk</span>${[0, 1, 2, 3, 4].map(i => `<i data-isi="${i}"></i>`).join('')}<span class="pm-kucuk">%0 → %100</span></div>`;
  return `<div class="pm-sira">${seg}${gunSec}<span class="pm-sira-ara"></span>${lejant}</div>
  <p class="pm-alt">${esc(not)}</p>
  <div class="tc-tablo-kap pm-m-kap"><table class="tc-tablo pm-matris"><thead><tr><th scope="col">${sutun}</th>${bas}<th scope="col" class="pm-num">Toplam</th></tr></thead><tbody>${govde}</tbody><tfoot>${alt}</tfoot></table></div>`;
}

/* ---------- kanban: her tezgâh bir sütun, kartlar plandaki sırasıyla ---------- */
function kanbanDurum(r, now) { return r.C <= now ? ['bitti', 'Bitti', 'check'] : r.S <= now && now < r.Su ? ['ayar', 'Ayarda', 'wrench'] : r.Su <= now && now < r.C ? ['calisiyor', 'Çalışıyor', 'play'] : ['sirada', 'Sırada', 'clock']; }
function sKanban() {
  if (kim().rol === 'operator') return sKuyruk();
  if (!S.plan) return `<div class="pm-bos">${ic('list', 'b')}<strong>Henüz plan yok</strong><span>Plan çözülünce her tezgâhın iş sırası burada kart kart görünür.</span>${dugme('Planı çöz', 'coz-ac', { birincil: true, simge: 'play' })}</div>`;
  const p = gosterilen(); const cx = cxAl(); const D = S.D; const now = cx.st.now;
  const ufuk = now + (U.kGun || 7) * 24;
  const locks = U.hamle ? U.hamle.locks : S.locks; const J = p.J || {};
  const gruplar = [...new Set(D.tezgahlar.map(m => m.grup))];
  const tezgahlar = D.tezgahlar.filter(m => !U.grup || m.grup === U.grup);
  const eski = U.hamle ? S.plan.ops : null;
  const sutunlar = tezgahlar.map(m => {
    const tum = Object.values(p.ops).filter(r => r.m === m.id && isFinite(r.C) && r.C > now).sort((a, b) => a.S - b.S);
    const l = tum.filter(r => r.S < ufuk && (!U.yalnizGec || (J[r.job] && J[r.job].T > 0.05)));
    const M = cx.M[m.id]; const cap = workIn(M.rw, now, ufuk) || 1; const dolu = l.reduce((s, r) => s + workIn(M.rw, Math.max(r.S, now), Math.min(r.C, ufuk)), 0) / cap;
    const kartlar = l.slice(0, 40).map((r, i) => {
      const o = cx.byId[r.id] || {}; const [dk, dad, dsm] = kanbanDurum(r, now);
      const gec = J[r.job] && J[r.job].T > 0.05; const kil = locks[r.id];
      const alt = (o.c || []).filter(c => !c.fas && c.m !== r.m).map(c => c.m);
      const e = eski && eski[r.id]; const degisti = eski && (!e || e.m !== r.m || Math.abs(e.S - r.S) > 0.25);
      return `<li class="pm-k-kart" draggable="true" data-id="${esc(r.id)}" data-m="${esc(m.id)}" data-durum="${dk}" ${gec ? 'data-gec' : ''} ${degisti ? 'data-degisti' : ''} style="--c:${durumRenk(r.job)}">
        <div class="pm-k-ust"><span class="pm-k-no mono">${i + 1}</span><b class="mono">${esc(r.job)}</b><span class="pm-kucuk">${esc(o.k || '')}</span><span class="pm-sira-ara"></span>${kil ? `<span class="pm-k-ikon" data-ipucu="Kilitli: motor yerini değiştirmez">${ic('lock', 'k')}</span>` : ''}<span class="pm-k-durum" data-durum="${dk}">${ic(dsm, 'k')}${dad}</span></div>
        <div class="pm-k-ad">${esc(o.ad || r.id)}</div>
        <div class="pm-k-bilgi"><span>${ic('box', 'k')}${sayi(o.adet, 0)} adet</span><span>${ic('clock', 'k')}<span class="mono">${esc(fmtDT(D, r.S).slice(6))} → ${esc(fmtDT(D, r.C).slice(r.C - r.S < 24 && Math.floor(r.C / 24) === Math.floor(r.S / 24) ? 12 : 6))}</span></span>${gec ? `<span class="pm-k-gec">${ic('alert', 'k')}${saat(J[r.job].T)} gecikme</span>` : ''}</div>
        <div class="pm-k-arac">${dugme('', 'k-yukari', { simge: 'up', kucuk: true, hayalet: true, ad: 'Sırada öne al', veri: `data-v="${esc(r.id)}"`, yetki: 'plan.yaz' })}${dugme('', 'k-asagi', { simge: 'down', kucuk: true, hayalet: true, ad: 'Sırada geriye al', veri: `data-v="${esc(r.id)}"`, yetki: 'plan.yaz' })}${alt.length && yetkili('plan.yaz') ? `<select class="tc-alan-kutu pm-k-tasi" data-chg="k-tasi" data-v="${esc(r.id)}" aria-label="Başka tezgâha taşı"><option value="">Tezgâh değiştir</option>${alt.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select>` : ''}<span class="pm-sira-ara"></span>${dugme('', 'sec-op-masa', { simge: 'gantt', kucuk: true, hayalet: true, ad: 'Plan masasında gör', veri: `data-v="${esc(r.id)}"` })}</div></li>`;
    }).join('');
    const fazla = l.length > 40 ? `<li class="pm-kucuk pm-k-fazla">+${l.length - 40} iş daha</li>` : '';
    const sonra = tum.length - l.length;
    return `<section class="pm-k-sutun" data-m="${esc(m.id)}" aria-label="${esc(m.id)} kuyruğu" ${U.kTez === m.id ? 'data-odak' : ''}>
      <header class="pm-k-bas"><div><b class="mono">${esc(m.id)}</b> <span class="pm-kucuk">${esc(m.ad)}</span></div>
        <div class="pm-k-olcu"><span>${l.length} iş</span><span class="pm-k-dolu" data-isi="${isiSeviye(dolu)}"><i style="width:${Math.min(100, Math.round(dolu * 100))}%"></i></span><span class="mono">%${Math.round(dolu * 100)}</span></div></header>
      <ol class="pm-k-liste" data-m="${esc(m.id)}">${kartlar || `<li class="pm-kucuk pm-k-bos">Bu aralıkta iş yok.</li>`}${fazla}</ol>
      ${sonra > 0 ? `<footer class="pm-kucuk pm-k-sonra">Aralık dışında ${sonra} iş daha</footer>` : ''}</section>`;
  }).join('');
  const grupSec = `<select class="tc-alan-kutu" style="width:auto" data-chg="k-grup" aria-label="Tezgâh grubu"><option value="">Bütün gruplar</option>${gruplar.map(g => `<option value="${esc(g)}" ${U.kGrup === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
  const gunSec = `<div class="pm-seg" role="tablist" aria-label="Aralık">${[[1, 'Bugün'], [3, '3 gün'], [7, '1 hafta'], [14, '2 hafta']].map(([n, ad]) => `<button type="button" role="tab" data-act="k-gun" data-v="${n}" aria-selected="${(U.kGun || 7) === n}">${ad}</button>`).join('')}</div>`;
  const gecSec = `<label class="pm-anahtar"><input type="checkbox" data-chg="k-gec" ${U.yalnizGec ? 'checked' : ''}><i></i>Yalnız geciken</label>`;
  return `<div class="pm-sira">${gunSec}<span class="pm-sira-ara"></span><span class="pm-kucuk">Kartı sürükleyip bırakın ya da oklarla sırayı değiştirin; motor her taşımayı önizler.</span></div>
  <div class="pm-kanban" role="region" aria-label="Tezgâh kuyrukları" tabindex="0">${sutunlar}</div>`;
}
/* Sıra değiştirme: işin anahtar saati komşusunun hemen önüne ya da arkasına konur; motor çözer, önizleme açılır. */
function kanbanKomsu(id, yon) {
  const p = S.plan; const r = p.ops[id]; if (!r) return null;
  const l = Object.values(p.ops).filter(x => x.m === r.m && isFinite(x.C)).sort((a, b) => a.S - b.S);
  const i = l.findIndex(x => x.id === id); return l[i + yon] ? [r, l[i + yon]] : [r, null];
}
function kanbanTasi(id, m, onceki, ayniSaat) {
  const p = S.plan; const r = p.ops[id]; if (!r) return;
  const cx = cxAl(); const o = cx.byId[id]; if (!o || !o.c.some(c => c.m === m)) { bildir(`${m} bu adımı yapamaz; rotada uygun tezgâh değil.`, 'hata'); return; }
  let t;
  if (onceki) { const q = p.ops[onceki]; if (!q || q.id === id) return; t = Math.max(cx.st.now, q.S - 0.05); }
  else if (ayniSaat) t = Math.max(cx.st.now, r.S);
  else { const l = Object.values(p.ops).filter(x => x.m === m && x.id !== id && isFinite(x.C)); t = l.length ? Math.max(cx.st.now, Math.max(...l.map(x => x.C))) : Math.max(cx.st.now, r.S); }
  t = Math.round(t * 4) / 4;
  hamleDene([[id, m, t]], `${id} → ${m}${onceki ? ', ' + onceki + ' önüne' : ayniSaat ? ', aynı saatte' : ', kuyruğun sonuna'}`, [[id, m, t]]);
}
function kanbanBagla() {
  const k = document.querySelector('.pm-kanban'); if (!k || k.dataset.bagli) return; k.dataset.bagli = '1';
  if (U.kTez) { const s = k.querySelector(`.pm-k-sutun[data-m="${CSS.escape(U.kTez)}"]`); if (s) k.scrollLeft = s.offsetLeft - k.offsetLeft - 8; U.kTez = null; }
  let tasinan = null;
  k.addEventListener('dragstart', e => { const c = e.target.closest('.pm-k-kart'); if (!c || !yetkili('plan.yaz')) { e.preventDefault(); return; } tasinan = c.dataset.id; c.dataset.tasiniyor = ''; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', tasinan); } catch (x) { /* bazı tarayıcılar veri yazmayı reddeder; kimlik değişkende tutulur */ } });
  k.addEventListener('dragend', e => { const c = e.target.closest('.pm-k-kart'); if (c) delete c.dataset.tasiniyor; k.querySelectorAll('[data-hedef]').forEach(x => delete x.dataset.hedef); });
  k.addEventListener('dragover', e => { if (!tasinan) return; const l = e.target.closest('.pm-k-liste'); if (!l) return; e.preventDefault(); k.querySelectorAll('[data-hedef]').forEach(x => delete x.dataset.hedef); const c = e.target.closest('.pm-k-kart'); (c || l).dataset.hedef = ''; });
  k.addEventListener('drop', e => { const l = e.target.closest('.pm-k-liste'); if (!l || !tasinan) return; e.preventDefault(); const c = e.target.closest('.pm-k-kart'); const id = tasinan; tasinan = null; kanbanTasi(id, l.dataset.m, c && c.dataset.id !== id ? c.dataset.id : null); });
}

/* ---------- 3B atölye akışı: tezgâhlar zeminde rota sırasıyla dizilir, kuyruklar üstlerinde yığılır, parçalar tezgâhtan tezgâha akar ---------- */
function agAtolyeSahne() {
  const p = S.plan; const cx = cxAl(); const D = S.D; if (!p || !cx) return { N: [], E: [], bos: true, atolye: true };
  /* grup sırası: rotada ortalama adım sırası; akış soldan sağa okunur */
  const sira = {}; for (const u of D.urunler) u.rota.forEach((o, i) => { const gs = o.fason ? ['@' + o.fason] : [...new Set((o.tezgahlar || []).map(t => (D.tezgahlar.find(m => m.id === t.id) || {}).grup).filter(Boolean))]; for (const g of gs) (sira[g] = sira[g] || []).push(i / Math.max(1, u.rota.length - 1)); });
  const ort = g => { const l = sira[g] || [0.5]; return l.reduce((a, b) => a + b, 0) / l.length; };
  const gruplar = [...new Set(D.tezgahlar.map(m => m.grup))].sort((a, b) => ort(a) - ort(b));
  const fasonlar = (D.fasoncular || []).filter(f => sira['@' + f.id]);
  const kolon = [...gruplar.map(g => ({ g, l: D.tezgahlar.filter(m => m.grup === g).map(m => ({ id: m.id, ad: m.ad, fas: false })) })), ...fasonlar.map(f => ({ g: '@' + f.id, l: [{ id: '@' + f.id, ad: f.ad, fas: true }] }))].sort((a, b) => ort(a.g) - ort(b.g));
  const N = [];
  kolon.forEach((k, i) => { const x = kolon.length > 1 ? -1 + (2 * i) / (kolon.length - 1) : 0;
    k.l.forEach((m, j) => { const z = m.fas ? 0.95 : k.l.length > 1 ? -0.7 + (1.4 * j) / (k.l.length - 1) : -0.1; N.push({ id: 't:' + m.id, m: m.id, ad: m.id, alt: m.fas ? 'Fason: ' + m.ad : `${m.ad} · ${k.g}`, tur: m.fas ? 'fason' : 'tezgah', grup: k.g, p: [x, -0.3, z], boy: 1 }); }); });
  const ix = Object.fromEntries(N.map(n => [n.m, n]));
  const akis = {};
  for (const o of cx.ops) for (const [pid] of o.pr) { const a = p.ops[pid], b = p.ops[o.id]; if (!a || !b || !ix[a.m] || !ix[b.m] || a.m === b.m) continue; const k = a.m + '>' + b.m; (akis[k] = akis[k] || { a: 't:' + a.m, b: 't:' + b.m, n: 0, gecis: [] }).n++; akis[k].gecis.push([a, b]); }
  const E = Object.values(akis).map(x => ({ ...x, g: x.n, tur: 'akis' }));
  const now = cx.st.now; const Cs = Object.values(p.ops).map(r => r.C).filter(isFinite).sort((a, b) => a - b);
  const t1 = Cs.length ? Cs[Math.floor(Cs.length * 0.97)] : now + 24;
  const kuyruk = {}; for (const r of Object.values(p.ops)) if (isFinite(r.C)) (kuyruk[r.m] = kuyruk[r.m] || []).push(r);
  for (const l of Object.values(kuyruk)) l.sort((a, b) => a.S - b.S);
  return { N, E, atolye: true, now, t1: Math.max(now + 24, t1), kuyruk, maxN: Math.max(1, ...E.map(e => e.n)) };
}
function agKutu(g, R, mer, boy, renk, golge) {
  const [x, y, z] = mer, [a, b, c] = boy; const W = g.canvas.clientWidth, H = g.canvas.clientHeight;
  const k = [[-a, -b, -c], [a, -b, -c], [a, b, -c], [-a, b, -c], [-a, -b, c], [a, -b, c], [a, b, c], [-a, b, c]].map(([dx, dy, dz]) => agIzdus([x + dx, y + dy, z + dz], W, H));
  const yuz = [[0, 1, 2, 3, 0.18], [4, 5, 6, 7, 0.1], [0, 1, 5, 4, 0.32], [3, 2, 6, 7, -0.12], [0, 3, 7, 4, 0.24], [1, 2, 6, 5, 0.04]];
  yuz.map(f => ({ f, d: (k[f[0]][2] + k[f[1]][2] + k[f[2]][2] + k[f[3]][2]) / 4 })).sort((p, q) => p.d - q.d).forEach(({ f }) => {
    g.beginPath(); g.moveTo(k[f[0]][0], k[f[0]][1]); for (let i = 1; i < 4; i++) g.lineTo(k[f[i]][0], k[f[i]][1]); g.closePath();
    g.fillStyle = renk; g.fill(); const s = f[4]; g.fillStyle = s > 0 ? '#000' : '#fff'; const ga = g.globalAlpha; g.globalAlpha = ga * Math.abs(s) * (golge ? 1.4 : 1); g.fill(); g.globalAlpha = ga;
    g.strokeStyle = R.zemin; g.lineWidth = 1; g.stroke();
  });
  return k;
}
function agAtolyeCiz(g, W, H, s, R) {
  const t = AG.zaman != null ? AG.zaman : s.now; const sec = AG.sec || AG.ust;
  // zemin ızgarası
  g.strokeStyle = R.edge; g.lineWidth = 1; g.globalAlpha = 0.45;
  for (let i = -6; i <= 6; i++) { const a = agIzdus([i / 5, -0.37, -1.15], W, H), b = agIzdus([i / 5, -0.37, 1.15], W, H); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  for (let i = -5; i <= 5; i++) { const a = agIzdus([-1.25, -0.37, i / 4.5], W, H), b = agIzdus([1.25, -0.37, i / 4.5], W, H); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.globalAlpha = 1;
  const ix = Object.fromEntries(s.N.map(n => [n.id, n]));
  // akış yayları: kalınlık o yoldan geçen sipariş sayısı
  const yay = (a, b, u) => { const yk = 0.25 + 0.35 * Math.min(1, Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2])); const m = [(a.p[0] + b.p[0]) / 2, a.p[1] + 0.15 + yk, (a.p[2] + b.p[2]) / 2];
    const q = 1 - u; return [q * q * a.p[0] + 2 * q * u * m[0] + u * u * b.p[0], q * q * (a.p[1] + 0.06) + 2 * q * u * m[1] + u * u * (b.p[1] + 0.06), q * q * a.p[2] + 2 * q * u * m[2] + u * u * b.p[2]]; };
  for (const e of s.E) { const a = ix[e.a], b = ix[e.b]; if (!a || !b) continue; const vurgu = sec && (e.a === sec || e.b === sec);
    g.globalAlpha = sec ? (vurgu ? 0.9 : 0.08) : 0.3; g.strokeStyle = vurgu ? R.grafik : R.muted; g.lineWidth = 1 + 4 * (e.n / s.maxN);
    g.beginPath(); for (let i = 0; i <= 16; i++) { const q = agIzdus(yay(a, b, i / 16), W, H); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.stroke();
    const uc = agIzdus(yay(a, b, 0.92), W, H), uc2 = agIzdus(yay(a, b, 1), W, H); g.beginPath(); g.arc(uc2[0], uc2[1], 2 + 2 * (e.n / s.maxN), 0, 7); g.fillStyle = g.strokeStyle; g.fill(); void uc; }
  g.globalAlpha = 1;
  // tezgâhlar ve kuyruklar, uzaktan yakına
  for (const n of s.N) n.q = agIzdus(n.p, W, H);
  const ns = s.N.slice().sort((a, b) => a.q[2] - b.q[2]);
  let calisan = 0, bekleyen = 0;
  for (const n of ns) {
    const l = s.kuyruk[n.m] || []; const simdi = l.find(r => r.S <= t && t < r.C); const sira = l.filter(r => r.S > t).slice(0, 7);
    if (simdi) calisan++; bekleyen += l.filter(r => r.S > t && r.S < t + 24).length;
    const dim = sec && sec !== n.id && !s.E.some(e => (e.a === sec && e.b === n.id) || (e.b === sec && e.a === n.id));
    g.globalAlpha = dim ? 0.25 : 1;
    const ust = simdi ? (t < simdi.Su ? R.hazard : R.run) : R.edge;
    agKutu(g, R, n.p, [0.075, 0.06, 0.07], n.tur === 'fason' ? R.is[3] : R.edge, false);
    agKutu(g, R, [n.p[0], n.p[1] + 0.065, n.p[2]], [0.06, 0.006, 0.055], ust, false);
    // kuyruk: tezgâhın üstünde, sıradaki işler aşağıdan yukarı; en alttaki ilk çalışacak olan
    sira.forEach((r, i) => agKutu(g, R, [n.p[0], n.p[1] + 0.11 + i * 0.05, n.p[2]], [0.045, 0.02, 0.045], durumRenkHam(r.job, R), false));
    if (l.filter(r => r.S > t).length > 7) { const q = agIzdus([n.p[0], n.p[1] + 0.11 + 7 * 0.05, n.p[2]], W, H); g.fillStyle = R.muted; g.font = '600 11px ' + (getComputedStyle(g.canvas).fontFamily || 'sans-serif'); g.fillText('+' + (l.filter(r => r.S > t).length - 7), q[0] - 8, q[1]); }
    n.r = Math.max(10, n.q[3] * 0.08);
    // ad
    const q = agIzdus([n.p[0], n.p[1] - 0.07, n.p[2] + 0.13], W, H); g.font = '600 12px ' + (getComputedStyle(g.canvas).fontFamily || 'sans-serif'); g.textAlign = 'center'; g.textBaseline = 'top';
    const yazi = n.tur === 'fason' ? (n.alt.replace('Fason: ', '').slice(0, 16)) : n.ad; const w = g.measureText(yazi).width; g.fillStyle = R.zemin; g.globalAlpha = dim ? 0.2 : 0.85; g.fillRect(q[0] - w / 2 - 3, q[1] - 1, w + 6, 16); g.globalAlpha = dim ? 0.3 : 1; g.fillStyle = R.ink; g.fillText(yazi, q[0], q[1]); g.textAlign = 'start';
    if (n.id === sec) { g.strokeStyle = R.ink; g.lineWidth = 2; g.beginPath(); g.arc(n.q[0], n.q[1], n.r + 6, 0, 7); g.stroke(); }
  }
  g.globalAlpha = 1;
  // yoldaki parçalar: önceki adım bitti, sonraki başlamadı; nokta yay üzerinde bekleme oranı kadar ilerler
  let yolda = 0;
  for (const e of s.E) { const a = ix[e.a], b = ix[e.b]; for (const [x, y] of e.gecis) { if (!(x.C <= t && t < y.S)) continue; yolda++; const u = Math.min(1, (t - x.C) / Math.max(0.5, y.S - x.C)); const q = agIzdus(yay(a, b, u), W, H);
    g.fillStyle = R.zemin; g.beginPath(); g.arc(q[0], q[1], 6, 0, 7); g.fill(); g.fillStyle = durumRenkHam(x.job, R); g.beginPath(); g.arc(q[0], q[1], 4.5, 0, 7); g.fill(); } }
  const o = document.getElementById('ag-zaman-ozet'); if (o) o.textContent = `${fmtDT(S.D, t)} · ${calisan} tezgâh çalışıyor · ${bekleyen} iş 24 saat içinde sırada · ${yolda} parti tezgâhlar arasında`;
}
/* kanvas CSS değişkeni okuyamaz; sipariş rengi durumRenk ile aynı sırayla R.is'ten alınır */
function durumRenkHam(job, R) { const i = S.D.siparisler.findIndex(s => s.id === job); const J = S.plan && S.plan.J && S.plan.J[job]; if (J && J.T > 0.05) return R.stop; return R.is[(i < 0 ? 0 : i) % 10]; }
function agAtolyeDetay(n) {
  const s = AG.sahne; const t = AG.zaman != null ? AG.zaman : s.now; const l = (s.kuyruk[n.m] || []).filter(r => r.C > t).slice(0, 8); const cx = cxAl();
  const satir = r => `<li><span class="mono">${esc(fmtDT(S.D, r.S).slice(6))}</span> <b class="mono">${esc(r.job)}</b> ${esc(((cx && cx.byId[r.id]) || {}).ad || r.id)}${r.S <= t ? ' · ' + rozet('şimdi', 'tamam') : ''}</li>`;
  return `<div class="pm-ag-sec"><span class="pm-kucuk">${n.tur === 'fason' ? 'Fason' : 'Tezgâh'}</span><b>${esc(n.ad)}</b><p class="pm-kucuk">${esc(n.alt || '')}</p>
    ${l.length ? `<ol class="pm-ag-liste">${l.map(satir).join('')}</ol>` : '<p class="pm-kucuk">Bu saatten sonra iş yok.</p>'}
    <div class="pm-dugmeler">${n.tur === 'fason' ? '' : dugme('Kanbanda gör', 'kanban-tezgah', { kucuk: true, simge: 'list', veri: `data-v="${esc(n.m)}"` })}${dugme('Seçimi kaldır', 'ag-sec', { kucuk: true, hayalet: true })}</div></div>`;
}
function zamanOynat() {
  if (!AG.oynat) return; const s = AG.sahne; if (!s || !s.atolye) { AG.oynat = false; return; }
  AG.zaman = (AG.zaman == null ? s.now : AG.zaman) + 0.5; if (AG.zaman > s.t1) { AG.zaman = s.t1; AG.oynat = false; const b = document.querySelector('[data-act="ag-oynat"]'); if (b) b.outerHTML = dugme('', 'ag-oynat', { simge: 'play', kucuk: true, ad: 'Planı oynat' }); }
  const r = document.getElementById('ag-zaman'); if (r) r.value = AG.zaman; agTetikle();
  setTimeout(zamanOynat, 60);
}

/* atölye yukarıdan bakılınca okunur: kamera eğik, salınım kapalı */
function agAtolyeKamera() { Object.assign(AG, { rx: -0.62, ry: 0.0, ryBas: 0.0, faz: 0, uz: 1.15, oto: false }); }
function s3B() {
  const ikiz = U.agGor !== 'basit' && fbDestek();
  const sec = `<div class="pm-sira"><div class="pm-seg" role="tablist" aria-label="3B görünüm">${[['ikiz', 'Atölye ikizi', 'cube'], ['basit', 'Basit görünümler', 'layers']].map(([id, ad, sm]) => `<button type="button" role="tab" data-act="fb-gor" data-v="${id}" aria-selected="${(U.agGor || 'ikiz') === id}">${ic(sm, 'k')}${ad}</button>`).join('')}</div>${fbDestek() ? '' : '<span class="pm-kucuk">Bu tarayıcı WebGL açmıyor; basit görünüm gösteriliyor.</span>'}</div>`;
  if (ikiz) return sec + fbKart();
  return sec + s3BBasit();
}
function s3BBasit() {
  if (AG.kip !== 'atolye' && !U.agElle) { AG.kip = 'atolye'; AG.sec = null; agAtolyeKamera(); }
  return `<p class="pm-alt">Atölye akışında tezgâhlar rotadaki sırasıyla soldan sağa dizilir. Her tezgâhın üstündeki yığın sıradaki işlerdir; en alttaki ilk çalışacak olandır. Yaylar parçaların hangi tezgâhtan hangisine gittiğini, kalınlıkları kaç siparişin o yoldan geçtiğini gösterir. Zaman çubuğunu kaydırın ya da oynatın: renkli noktalar tezgâhlar arasında bekleyen partilerdir.</p>${agKart()}`;
}
