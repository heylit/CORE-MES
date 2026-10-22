/* ---------- Sade sayfa: yan sayfalar önce özetle açılır ----------
   Kullanıcı 20.10: yan sayfalar ve Yardımcı herkesin anlayacağı biçimde değil, veri girişi zor. Her yan sayfa üç sekmedir:
   Özet (durum, şimdi ne yapmalı, nasıl çalışır), Veri gir (adım adım form), Tüm ayrıntılar (asıl sayfa, aynen). Planlama motoru sayfası değişmez. */
const SADE = {};
const sdIzin = f => !f.yetki || (typeof f.yetki === 'function' ? f.yetki() : yetkili(f.yetki));
function sdFormlar(id) { const d = SADE[id]; if (!d || !d.formlar) return []; try { return d.formlar().filter(sdIzin); } catch (e) { console.error(e); return []; } }
function sdSek(id) { const s = (U.sdSek || {})[id] || 'ozet'; return s === 'gir' && !sdFormlar(id).length ? 'ozet' : s; }
const sdTerminT = s => s && s.termin ? parseT(S.D, s.termin) : null;
const sdZaman = s => { const t = sdTerminT(s); return t == null ? '—' : fmtDT(S.D, t); };
/* bir listedeki en büyük numaranın bir sonrası: SP-118 varsa SP-119 */
function sdSonrakiNo(liste, k, onek) {
  let en = 0, on = onek, uz = 3;
  for (const x of liste) { const m = /^(.*?)(\d+)$/.exec(String(x[k] || '')); if (m && (!onek || m[1] === onek) && +m[2] >= en) { en = +m[2]; on = m[1]; uz = m[2].length; } }
  return on + String(en + 1).padStart(uz, '0');
}
/* planın geç bitirdiği siparişler, en çok geciken başta */
function sdGecikenler() {
  const p = S.plan; if (!p) return [];
  return S.D.siparisler.filter(s => !s.havuz && p.J[s.id] && (p.J[s.id].T == null || p.J[s.id].T > 0.01)).map(s => ({ s, T: p.J[s.id].T, C: p.J[s.id].C })).sort((a, b) => (b.T == null ? 1e9 : b.T) - (a.T == null ? 1e9 : a.T));
}
const sdSipSecenek = () => S.D.siparisler.map(s => [s.id, `${s.id} · ${urunAd(s.urun)} · ${sayi(s.adet, 0)} adet`]);

/* ---------- parçalar ---------- */
const sdKutu = k => `<div class="pm-sd-kutu" ${k.ton ? `data-ton="${k.ton}"` : ''}><span class="pm-sd-kutu-ad">${ic(k.simge || 'dash', 'k')}${esc(k.ad)}</span><b class="pm-sd-kutu-d">${esc(k.deger == null ? '—' : k.deger)}</b>${k.not ? `<span class="pm-sd-kutu-not">${esc(k.not)}</span>` : ''}</div>`;
function sdIs(x) {
  const d = x.act ? dugme(x.dugme || 'Aç', x.act, { kucuk: true, birincil: !!x.birincil, simge: x.dsimge || 'next', veri: x.v != null ? `data-v="${esc(x.v)}"` : '' }) : '';
  return `<li class="pm-sd-is" ${x.ton ? `data-ton="${x.ton}"` : ''}><span class="pm-sd-is-sm">${ic(x.simge || 'next', 'k')}</span><span class="pm-sd-is-m"><b>${esc(x.metin)}</b>${x.neden ? `<small>${esc(x.neden)}</small>` : ''}</span>${d}</li>`;
}
function sdOzet(id) {
  const d = SADE[id]; const kutular = d.durum ? d.durum() : []; const isler = d.yapilacak ? d.yapilacak() : [];
  const formlar = sdFormlar(id);
  const son = U.sdSon && U.sdSon.sayfa === id ? sdSonKart() : '';
  return `${son}<section class="pm-sd-bolum" aria-label="Durum"><div class="pm-sd-kutular">${kutular.map(sdKutu).join('')}</div></section>
  <section class="pm-sd-bolum" aria-label="Şimdi ne yapmalı"><h3 class="pm-sd-bas">${ic('target', 'k')}Şimdi ne yapmalı</h3>${isler.length ? `<ul class="pm-sd-isler">${isler.slice(0, 6).map(sdIs).join('')}</ul>` : `<p class="pm-sd-bos">${ic('check', 'k')}Şu an bu sayfada yapılacak bir şey yok.</p>`}</section>
  ${formlar.length ? `<section class="pm-sd-bolum" aria-label="Veri gir"><h3 class="pm-sd-bas">${ic('plus', 'k')}Veri gir</h3><div class="pm-sd-formlar">${formlar.map(f => sdFormKart(id, f)).join('')}</div></section>` : ''}
  ${d.nasil && d.nasil.length ? `<details class="pm-sd-nasil" ${(U.sdNasil || {})[id] ? 'open' : ''} data-sd-nasil="${esc(id)}"><summary>${ic('help', 'k')}Bu sayfa nasıl çalışır?</summary><ul>${d.nasil.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : ''}`;
}
const sdFormKart = (id, f) => `<button type="button" class="pm-sd-fkart" data-act="sd-form" data-v="${esc(id + ':' + f.id)}"><span class="pm-sd-is-sm">${ic(f.simge || 'plus', 'k')}</span><span class="pm-sd-is-m"><b>${esc(f.ad)}</b>${f.ne ? `<small>${esc(f.ne)}</small>` : ''}</span>${ic('chev-right', 'k')}</button>`;
function sdSonKart() {
  const s = U.sdSon; const yaz = yetkili('plan.yaz');
  return `<div class="pm-sd-son" role="status"><span class="pm-sd-is-sm">${ic('check', 'k')}</span><span class="pm-sd-is-m"><b>${esc(s.metin)}</b><small>${S.plan && !planGuncel() ? 'Plan bu değişikliği henüz içermiyor. Planı iyileştir deyince yeni plan kurulur; Planlama stüdyosunda inceleyip onaya gönderirsiniz.' : 'Kaydedildi.'}</small></span>
    <span class="pm-dugmeler">${S.plan && !planGuncel() && yaz ? dugme('Planı iyileştir', 'ekip', { kucuk: true, birincil: true, simge: 'play' }) : ''}${dugme('', 'sd-son-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat' })}</span></div>`;
}
function sdGir(id) {
  const fl = sdFormlar(id); const st = U.sdForm && U.sdForm.sayfa === id ? fl.find(f => f.id === U.sdForm.id) : null;
  if (st) return sdSihirbaz(id, st);
  const son = U.sdSon && U.sdSon.sayfa === id ? sdSonKart() : '';
  return `${son}<section class="pm-sd-bolum"><h3 class="pm-sd-bas">${ic('plus', 'k')}Ne girmek istiyorsunuz?</h3><div class="pm-sd-formlar">${fl.map(f => sdFormKart(id, f)).join('')}</div></section>`;
}

/* ---------- adım adım form ----------
   Bütün alanlar formda durur (formOku hepsini okur); yalnız o adımın alanları görünür. Değerler her girişte U.sdForm.deg'e yazılır,
   çizim yenilense de kaybolmaz. Kayıt TANIM'lı formda var olan gönderme işleyicisiyle, özel formda formun kaydet'iyle yapılır. */
function sdAlanlar(f) {
  const ham = f.tanim ? TANIM[f.tanim].alanlar() : f.alanlar();
  return ham.map(a => f.etiket && f.etiket[a.k] ? Object.assign({}, a, typeof f.etiket[a.k] === 'string' ? { ad: f.etiket[a.k] } : f.etiket[a.k]) : a);
}
function sdOku(form, alanlar) {
  const k = '__sd'; TANIM[k] = { alanlar: () => alanlar };
  try { return formOku(form, k); } finally { delete TANIM[k]; }
}
function sdHam(form, alanlar) {
  const x = {};
  for (const a of alanlar) {
    if (a.tur === 'evet') { const e = form.querySelector(`[name="${a.k}"]`); x[a.k] = !!(e && e.checked); continue; }
    if (a.tur === 'cok') { x[a.k] = [...form.querySelectorAll(`[name="${a.k}"]:checked`)].map(i => i.value); continue; }
    if (a.tur === 'malzeme') { x[a.k] = [...form.querySelectorAll('[data-satir]')].map(r => ({ kod: r.querySelector('[name="mkod"]').value, miktar: r.querySelector('[name="mmiktar"]').value })); continue; }
    const e = form.querySelector(`[name="${a.k}"]`); x[a.k] = e ? e.value : '';
  }
  return x;
}
function sdDegerYaz(a, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '—';
  if (a.tur === 'evet') return v ? 'Evet' : 'Hayır';
  if (a.tur === 'secim') { const o = a.secenek().find(([k]) => String(k) === String(v)); return o ? o[1] : String(v); }
  if (a.tur === 'cok') { const m = new Map(a.secenek().map(([k, ad]) => [String(k), ad])); return v.map(k => m.get(String(k)) || k).join(', '); }
  if (a.tur === 'malzeme') { const l = v.filter(m => m.kod); return l.length ? l.map(m => `${m.kod} × ${m.miktar || '?'}`).join(', ') : '—'; }
  if (a.tur === 'tarihsaat') { const t = parseT(S.D, DTgirdi(v)); return t == null ? String(v) : fmtDT(S.D, t); }
  return String(v);
}
function sdSihirbaz(id, f) {
  const st = U.sdForm; const alanlar = sdAlanlar(f); const n = f.adimlar.length; const adim = Math.min(st.adim || 0, n);
  if (!st.deg) st.deg = f.ilk ? f.ilk() : {};
  const deg = st.deg; const yeni = !f.duzenle; const T = f.tanim ? TANIM[f.tanim] : null;
  const gorunen = new Set(f.adimlar.flatMap(g => g.k));
  const alan = a => alanHtml(a, deg[a.k] !== undefined ? deg[a.k] : a.vars, yeni, T);
  const gruplar = f.adimlar.map((g, i) => `<fieldset class="pm-sd-adim" ${i === adim ? '' : 'hidden'}><legend class="tc-gizli-etiket">${esc(g.ad)}</legend>${g.ne ? `<p class="pm-sd-adim-ne">${esc(g.ne)}</p>` : ''}<div class="tc-form">${alanlar.filter(a => g.k.includes(a.k)).map(alan).join('')}</div></fieldset>`).join('');
  const gizli = `<div hidden>${alanlar.filter(a => !gorunen.has(a.k)).map(alan).join('')}</div>`;
  const ozet = `<div class="pm-sd-adim" ${adim === n ? '' : 'hidden'}><p class="pm-sd-adim-ne">Kontrol edin. Kaydet dediğinizde ${esc(f.sonuc || 'kayıt yapılır.')}</p><dl class="pm-sd-ozet">${alanlar.filter(a => gorunen.has(a.k)).map(a => `<div><dt>${esc(a.ad)}</dt><dd>${esc(sdDegerYaz(a, deg[a.k]))}</dd></div>`).join('')}</dl></div>`;
  const adimlar = [...f.adimlar.map(g => g.ad), 'Kontrol et'];
  const serit = `<ol class="pm-sd-adimlar">${adimlar.map((ad, i) => `<li ${i === adim ? 'aria-current="step"' : ''} ${i < adim ? 'data-bitti' : ''}><span>${i < adim ? ic('check', 'k') : i + 1}</span>${esc(ad)}</li>`).join('')}</ol>`;
  const dugmeler = `<div class="pm-sd-alt">${dugme('Vazgeç', 'sd-vazgec', { hayalet: true, simge: 'x' })}<span class="pm-sira-ara"></span>${adim > 0 ? dugme('Geri', 'sd-geri', { simge: 'up' }) : ''}${adim < n ? dugme('İleri', 'sd-ileri', { birincil: true, simge: 'next' }) : `<button type="submit" class="tc-dugme tc-dugme-birincil">${ic('check', 'k')}<span>Kaydet</span></button>`}</div>`;
  const dv = f.duzenle && T && T.kimlik ? esc(deg[T.kimlik] || '') : '';
  return `<section class="pm-sd-bolum pm-sd-sihir" aria-label="${esc(f.ad)}"><h3 class="pm-sd-bas">${ic(f.simge || 'plus', 'k')}${esc(f.ad)}</h3>${serit}
    <form data-form="${f.tanim || 'sd-ozel'}" data-sd="${esc(id + ':' + f.id)}" data-v="${dv}" novalidate>${gruplar}${gizli}${ozet}<p class="pm-form-hata" data-hata hidden></p>${dugmeler}</form></section>`;
}
function sdAktif(form) {
  if (!form || !U.sdForm) return null; const [id, fid] = String(form.dataset.sd || '').split(':');
  const f = sdFormlar(id).find(x => x.id === fid); return f ? { id, f } : null;
}
function sdHata(form, h) { const p = form.querySelector('[data-hata]'); if (p) { p.hidden = !h.length; p.textContent = h.join(' '); } }
function sdAdim(yon) {
  const form = document.querySelector('form[data-sd]'); const a = sdAktif(form); if (!a) return;
  const alanlar = sdAlanlar(a.f); U.sdForm.deg = sdHam(form, alanlar); const i = U.sdForm.adim || 0;
  if (yon > 0) {
    const g = a.f.adimlar[i]; const { x, hata } = sdOku(form, alanlar.filter(z => g.k.includes(z.k)));
    if (a.f.kontrol) { const h = a.f.kontrol(x, i, U.sdForm.deg); if (h) hata.push(...[].concat(h)); }
    if (hata.length) return sdHata(form, hata);
    if (a.f.ileri) a.f.ileri(U.sdForm.deg, i);
  }
  U.sdForm.adim = Math.max(0, Math.min(a.f.adimlar.length, i + yon)); render();
  const s = document.querySelector('.pm-sd-sihir'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  const ilk = document.querySelector('form[data-sd] .pm-sd-adim:not([hidden]) input:not([type=hidden]), form[data-sd] .pm-sd-adim:not([hidden]) select'); if (ilk) ilk.focus({ preventScroll: true });
}
['input', 'change'].forEach(t => document.addEventListener(t, e => {
  const form = e.target.closest && e.target.closest('form[data-sd]'); const a = sdAktif(form); if (!a) return;
  U.sdForm.deg = sdHam(form, sdAlanlar(a.f));
  const h = form.querySelector('[data-hata]'); if (h && !h.hidden) h.hidden = true;
}, true));
document.addEventListener('submit', e => {
  const form = e.target.closest && e.target.closest('form[data-sd]'); if (!form) return;
  const a = sdAktif(form); if (!a) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if ((U.sdForm.adim || 0) < a.f.adimlar.length) { e.preventDefault(); e.stopImmediatePropagation(); sdAdim(1); return; }
  const alanlar = sdAlanlar(a.f); const { x, hata } = sdOku(form, alanlar);
  if (a.f.tanim) {
    const T = TANIM[a.f.tanim]; const eski = a.f.duzenle ? bul(a.f.tanim, form.dataset.v) : null;
    if (T.kimlik && x[T.kimlik] && T.al().some(z => z !== eski && String(z[T.kimlik]) === String(x[T.kimlik]))) hata.push(`${x[T.kimlik]} zaten var; başka bir no yazın.`);
  }
  if (a.f.kontrol) { const h = a.f.kontrol(x, -1, U.sdForm.deg); if (h) hata.push(...[].concat(h)); }
  if (hata.length) { e.preventDefault(); e.stopImmediatePropagation(); return sdHata(form, hata); }
  const metin = a.f.bitti ? a.f.bitti(x) : `${a.f.ad}: kaydedildi`;
  if (a.f.tanim) { U.sdForm = null; U.sdSon = { sayfa: a.id, metin }; return; }
  e.preventDefault(); e.stopImmediatePropagation();
  U.sdForm = null; U.sdSon = { sayfa: a.id, metin };
  const ok = a.f.kaydet(x);
  if (ok === false) { U.sdSon = null; render(); }
}, true);
document.addEventListener('toggle', e => {
  const d = e.target; if (!d || d.tagName !== 'DETAILS') return;
  if (d.dataset.sdNasil) (U.sdNasil = U.sdNasil || {})[d.dataset.sdNasil] = d.open;
  if (d.classList.contains('pm-sd-teknik')) U.sdTeknik = d.open;
}, true);

/* ---------- sayfa çerçevesi ---------- */
function sdSayfa(id, asil) {
  const d = SADE[id]; const sek = sdSek(id); const fl = sdFormlar(id).length;
  const sekler = [['ozet', 'Özet', 'eye'], ...(fl ? [['gir', 'Veri gir', 'plus']] : []), ['tum', 'Tüm ayrıntılar', 'list']];
  let govde;
  try { govde = sek === 'tum' ? asil() : sek === 'gir' ? sdGir(id) : sdOzet(id); }
  catch (e) { console.error(e); govde = `<div class="pm-serit" data-ton="hata">${ic('alert', 'k')}<span class="pm-serit-metin">Bölüm çizilemedi: ${esc(e.message)}</span></div>`; }
  return `<div class="pm-sd"><header class="pm-sd-ust"><div class="pm-sd-baslik"><h2>${ic(d.simge || 'list', 'k')}${esc(d.ad || SAYFA_AD[id] || id)}</h2>${d.ne ? `<p>${esc(typeof d.ne === 'function' ? d.ne() : d.ne)}</p>` : ''}</div>
    <div class="pm-seg pm-sd-sek" role="tablist" aria-label="Görünüm">${sekler.map(([k, ad, sm]) => `<button type="button" role="tab" data-act="sd-sek" data-v="${esc(id + ':' + k)}" aria-selected="${sek === k}">${ic(sm, 'k')}<span>${ad}</span></button>`).join('')}</div></header>
    <div class="pm-sd-govde" data-sek="${sek}">${govde}</div></div>`;
}
{ const sh0 = sayfaHtml; sayfaHtml = function () {
  const id = U.sayfa;
  if (!ymYan() || !SADE[id] || kim().rol === 'operator' || !YM_GORUNUM[id]) return sh0();
  const asil = YM_GORUNUM[id]; YM_GORUNUM[id] = () => sdSayfa(id, asil);
  try { return sh0(); } finally { YM_GORUNUM[id] = asil; }
}; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'sd-sek': { const [id, k] = String(v).split(':'); (U.sdSek = U.sdSek || {})[id] = k; if (k !== 'gir') U.sdForm = null; render(); return true; }
    case 'sd-form': { const [id, fid] = String(v).split(':'); (U.sdSek = U.sdSek || {})[id] = 'gir'; U.sdForm = { sayfa: id, id: fid, adim: 0, deg: null }; U.sdSon = null; render(); const s = document.querySelector('.pm-sd-sihir'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); return true; }
    case 'sd-ileri': sdAdim(1); return true;
    case 'sd-geri': sdAdim(-1); return true;
    case 'sd-vazgec': U.sdForm = null; render(); return true;
    case 'sd-son-kapat': U.sdSon = null; render(); return true;
  }
  return te0(act, v, el, e);
}; }

/* ---------- Yardımcı: önce sade dil, teknik ayrıntı altta ---------- */
function sdYardimci() {
  const p = S.plan; const yaz = yetkili('plan.yaz'); const kil = yetkili('plan.canliya-al');
  const gec = sdGecikenler(); const top = S.D.siparisler.filter(s => !s.havuz).length;
  const durum = [];
  if (!p) durum.push(['alert', 'uyari', 'Henüz plan yok.', 'Planı kur ile motor bütün siparişleri tezgâhlara yerleştirir.']);
  else {
    if (!planGuncel()) durum.push(['rotate', 'uyari', 'Veri plandan sonra değişti.', 'Gösterilen saatler eski. Planı iyileştir ile yenileyin.']);
    if (!gec.length) durum.push(['check', 'tamam', `${top} siparişin hepsi zamanında bitiyor.`, '']);
    else { const g = gec[0]; durum.push(['clock', 'hata', `${top} siparişten ${gec.length} tanesi geç bitiyor.`, `En çok geciken ${g.s.id}: ${g.T == null ? 'planlanamadı' : saat(g.T) + ' geç'} (termin ${sdZaman(g.s)}).`]); }
  }
  const onay = typeof paOnayda === 'function' ? paOnayda() : []; const fark = typeof paCalismaFarkli === 'function' && paCalismaFarkli();
  if (onay.length) durum.push(['flag', 'uyari', `Onay bekleyen ${onay.length} plan var.`, kil ? 'Planlama stüdyosunda inceleyip onaylayın ya da geri gönderin.' : 'Müdür onaylayınca canlıya geçer.']);
  else if (fark && S.canli) durum.push(['flag', '', 'Üzerinde çalıştığınız plan canlıdan farklı.', 'Canlı plan siz onaya gönderip müdür onaylayana kadar değişmez.']);
  const gorevler = [];
  if (!p && yaz) gorevler.push(['play', 'Planı kur', 'Motor siparişleri sıfırdan yerleştirir.', 'coz', 'sifir']);
  if (p && yaz) gorevler.push(['play', 'Planı iyileştir', 'Motor gecikmeyi azaltmaya çalışır; sonucu görüp siz kabul edersiniz.', 'ekip', '']);
  if (p && gec.length) gorevler.push(['search', `${gec[0].s.id} siparişine bak`, 'Tahtada bu siparişin işleri seçili gelir; tezgâh ya da sıra değiştirebilirsiniz.', 'siparis-cizelge', gec[0].s.id]);
  if (p && yaz) {
    gorevler.push(['plus', 'Acil sipariş ekle', 'Yeni siparişi plana sokar ve neyin kaydığını gösterir.', 'olay-tip', 'acil']);
    gorevler.push(['wrench', 'Tezgâh arızası gir', 'Duran tezgâhın işleri başka tezgâha ya da sonraya kayar.', 'olay-tip', 'ariza']);
    gorevler.push(['box', 'Malzeme gecikti', 'Malzemesi geç gelen işler bekletilir.', 'olay-tip', 'malzeme']);
  }
  if (p && (yaz || kil)) gorevler.push(['flag', kil && onay.length ? 'Onay bekleyen planı incele' : 'Planı onaya gönder', 'Bütün değişiklikler Planlama stüdyosunda karşılaştırılır ve onaylanır.', 'pa-git', '']);
  const sepet = U.taslak ? U.taslak.adimlar : [];
  const son = sepet.slice(-3).map((a, j) => { const i = sepet.length - Math.min(3, sepet.length) + j; return `<li><span class="pm-sd-is-m"><b>${esc(a.ad || 'Değişiklik')}</b>${a.deg ? `<small>${a.deg} iş değişti</small>` : ''}</span>${yaz ? dugme('Geri al', 'taslak-don', { kucuk: true, hayalet: true, simge: 'rotate', veri: `data-v="${i}"`, ipucu: 'Bu değişiklikten öncesine döner' }) : ''}</li>`; }).reverse().join('');
  return `<div class="pm-sd-yrd">
    <ul class="pm-sd-durum">${durum.map(([sm, ton, b, m]) => `<li ${ton ? `data-ton="${ton}"` : ''}>${ic(sm, 'k')}<span><b>${esc(b)}</b>${m ? `<small>${esc(m)}</small>` : ''}</span></li>`).join('')}</ul>
    ${gorevler.length ? `<h3 class="pm-sd-bas">${ic('target', 'k')}Ne yapmak istiyorsunuz?</h3><div class="pm-sd-gorevler">${gorevler.map(([sm, b, m, act, v]) => `<button type="button" class="pm-sd-fkart" data-act="${act}" ${v ? `data-v="${esc(v)}"` : ''}><span class="pm-sd-is-sm">${ic(sm, 'k')}</span><span class="pm-sd-is-m"><b>${esc(b)}</b><small>${esc(m)}</small></span></button>`).join('')}</div>` : ''}
    ${p && yaz ? `<p class="pm-sd-ipucu">${ic('help', 'k')}<span>Bir işi elle taşımak için tahtada sürükleyin ya da işe tıklayıp Ayrıntı sekmesinden tezgâh ve saat seçin. Her değişiklik geri alınabilir.</span></p>` : ''}
    ${son ? `<h3 class="pm-sd-bas">${ic('list', 'k')}Son yaptıklarınız</h3><ul class="pm-sd-sonlar">${son}</ul>` : ''}
  </div>`;
}
{ const yd0 = yardimciHtml; yardimciHtml = function () {
  let ham = ''; try { ham = yd0(); } catch (e) { console.error(e); }
  return sdYardimci() + `<details class="pm-sd-teknik" ${U.sdTeknik ? 'open' : ''}><summary>${ic('gear', 'k')}Teknik ayrıntılar (uzman)</summary>${ham}</details>`;
}; }

/* ---------- Siparişler ---------- */
SADE.ysiparis = {
  ad: 'Siparişler', simge: 'list',
  ne: () => agFiyatGorur() ? 'Hangi sipariş ne zaman biter, hangisi gecikir ve ne kadar kâr bırakır.' : 'Hangi sipariş ne zaman biter, hangisi gecikir.',
  durum() {
    const l = S.D.siparisler; const gec = sdGecikenler(); const planda = l.filter(s => !s.havuz).length;
    const acil = l.filter(s => !s.havuz && sdTerminT(s) != null).sort((a, b) => sdTerminT(a) - sdTerminT(b))[0];
    const k = [
      { simge: 'list', ad: 'Sipariş', deger: sayi(l.length, 0), not: planda === l.length ? 'hepsi planda' : `${planda} tanesi planda` },
      { simge: 'clock', ad: 'Geç bitecek', deger: S.plan ? sayi(gec.length, 0) : '—', ton: S.plan ? (gec.length ? 'hata' : 'tamam') : '', not: gec.length ? `en çok ${gec[0].s.id}, ${gec[0].T == null ? 'planlanamadı' : saat(gec[0].T)}` : S.plan ? 'hepsi zamanında' : 'plan yok' },
      { simge: 'flag', ad: 'En yakın termin', deger: acil ? acil.id : '—', not: acil ? sdZaman(acil) : '' },
    ];
    if (agFiyatGorur()) {
      const fs = l.filter(s => s.gelir == null).length; const tutar = l.reduce((a, s) => a + (+s.gelir || 0), 0);
      k.push({ simge: 'lira', ad: 'Toplam tutar', deger: agTL(tutar), not: fs ? `${fs} sipariş fiyatsız` : 'hepsi fiyatlı', ton: fs ? 'uyari' : '' });
    }
    return k;
  },
  yapilacak() {
    const l = []; const yaz = yetkili('plan.yaz');
    if (!S.plan) { l.push({ simge: 'play', metin: 'Henüz plan yok', neden: 'Gecikme ve maliyet plandan çıkar.', act: yaz ? 'coz' : null, v: 'sifir', dugme: 'Planı kur', dsimge: 'play', birincil: true }); return l; }
    if (!planGuncel()) l.push({ simge: 'rotate', ton: 'uyari', metin: 'Veri plandan sonra değişti', neden: 'Bitiş saatleri eski veriyle hesaplı.', act: yaz ? 'ekip' : null, dugme: 'Planı iyileştir', dsimge: 'play', birincil: true });
    for (const g of sdGecikenler().slice(0, 3)) l.push({ simge: 'clock', ton: 'hata', metin: `${g.s.id} ${g.T == null ? 'planlanamadı' : saat(g.T) + ' geç bitiyor'}`, neden: `${urunAd(g.s.urun)}, ${sayi(g.s.adet, 0)} adet. Termin ${sdZaman(g.s)}${g.C != null ? `, planlanan bitiş ${fmtDT(S.D, g.C)}` : ''}.`, act: 'siparis-cizelge', v: g.s.id, dugme: 'Tahtada göster', dsimge: 'gantt' });
    const fs = S.D.siparisler.filter(s => s.gelir == null);
    if (agFiyatGorur() && fs.length) l.push({ simge: 'lira', ton: 'uyari', metin: `${fs.length} siparişin fiyatı yok`, neden: 'Fiyatsız siparişin kârı ve gecikme bedeli hesaplanamaz.', act: 'sd-form', v: 'ysiparis:fiyat', dugme: 'Fiyat gir', dsimge: 'lira' });
    const hv = S.D.siparisler.filter(s => s.havuz).length;
    if (hv) l.push({ simge: 'pause', metin: `${hv} sipariş havuzda bekliyor`, neden: 'Havuzdaki sipariş plana yerleştirilmez; tahtadaki havuzdan plana alınır.', act: 'git', v: 'tahta', dugme: 'Tahtaya git', dsimge: 'gantt' });
    return l;
  },
  nasil: [
    'Plan her siparişin adımlarını rotasındaki tezgâhlara sırayla yerleştirir. Son adımın bittiği saat termini geçerse sipariş geç sayılır.',
    'Bir saatlik gecikmenin önemi siparişin gecikme bedelinden çıkar (ceza, finansman, kâr riski, müşteri sınıfı). Önemli bir siparişi elle çarpanla öne alabilirsiniz.',
    'Yeni sipariş ya da termin değişikliği planı hemen değiştirmez. Planı iyileştir deyince yeni plan kurulur; canlıya Planlama stüdyosunda onaylanınca geçer.',
    'Maliyet ve kâr yalnız müdür ve yöneticide görünür; maliyet plandaki tezgâh, ayar ve fasondan hesaplanır.',
    'Parti bölme, parti taraması ve örtüşme gibi araçlar Tüm ayrıntılar sekmesindedir.',
  ],
  formlar() {
    const fg = agFiyatGorur(); const bedel = agAyar().kip === 'bedel'; const es = agElleSinir();
    const carpan = [[0.5, '×0,5 · daha az önemli'], [1, '×1 · normal'], [1.5, '×1,5 · önemli'], [2, '×2 · çok önemli'], [3, '×3 · en önemli (müdür)']].filter(([v]) => v <= es);
    const onek = (S.D.siparisler.find(s => /^SP-/.test(s.id)) ? 'SP-' : '');
    return [
      { id: 'yeni', ad: 'Yeni sipariş', simge: 'plus', ne: 'Ürün, adet ve termin; üç adımda.', yetki: 'veri.yaz', tanim: 'siparis',
        etiket: { ad: 'Not (isteğe bağlı)', serbest: { ad: 'En erken başlama', ipucu: 'Boş bırakırsanız hemen başlayabilir' }, oncelik: { ad: 'Öncelik', ipucu: 'Yüksek: geç kalması en pahalı olan' }, id: { ad: 'Sipariş no', ipucu: 'Bir sonraki numara önerildi; değiştirebilirsiniz' } },
        adimlar: [
          { ad: 'Ne üretilecek', ne: 'Ürünü ve adedi seçin.', k: ['urun', 'adet', 'ad'] },
          { ad: 'Ne zaman', ne: 'Termin, siparişin teslim edilmesi gereken saattir.', k: bedel ? ['termin', 'serbest'] : ['termin', 'oncelik', 'serbest'] },
          { ad: 'No ve malzeme', ne: 'Malzeme boş kalabilir; ürünün kendi malzemesi kullanılır.', k: fg ? ['id', 'gelir', 'malzeme'] : ['id', 'malzeme'] },
        ],
        ilk: () => ({ id: sdSonrakiNo(S.D.siparisler, 'id', onek), oncelik: 2 }),
        sonuc: 'sipariş listeye eklenir; plan yeniden kurulunca tezgâhlara yerleşir.',
        bitti: x => `${x.id} eklendi` },
      { id: 'termin', ad: bedel ? 'Termin değiştir' : 'Termin ya da öncelik değiştir', simge: 'flag', ne: 'Müşteri tarihi değiştirdiğinde.', yetki: 'veri.yaz',
        alanlar: () => [
          { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: 1, secenek: sdSipSecenek },
          { k: 'termin', ad: 'Yeni termin', tur: 'tarihsaat', zorunlu: bedel ? 1 : 0 },
          ...(bedel ? [] : [{ k: 'oncelik', ad: 'Öncelik', tur: 'secim', sayisal: 1, secenek: () => [[1, 'Yüksek'], [2, 'Normal'], [3, 'Düşük']] }]),
        ],
        adimlar: [{ ad: 'Hangi sipariş', k: ['sip'] }, { ad: 'Yeni değer', ne: 'Şimdiki değer dolu geldi; yalnız değişeni düzeltin.', k: bedel ? ['termin'] : ['termin', 'oncelik'] }],
        ileri: (d, i) => { if (i !== 0) return; const s = S.D.siparisler.find(x => x.id === d.sip); if (s) { d.termin = girdiDT(s.termin); d.oncelik = String(s.oncelik || 2); } },
        kontrol: (x, i, d) => { if (i === 1 || i === -1) { const s = S.D.siparisler.find(z => z.id === (x.sip || d.sip)); if (s && (x.termin || s.termin) === s.termin && (bedel || (x.oncelik || s.oncelik) === s.oncelik)) return 'Hiçbir şey değişmedi.'; } return null; },
        sonuc: 'yeni termin plana bir sonraki çözümde girer.',
        kaydet: x => { const s = S.D.siparisler.find(z => z.id === x.sip); if (!s) return false;
          return degistir('Sipariş güncellendi', `${s.id}: termin ${s.termin || '—'} → ${x.termin || s.termin}${bedel ? '' : `, öncelik ${ONCELIK[s.oncelik] || '—'} → ${ONCELIK[x.oncelik || s.oncelik]}`}`, () => { if (x.termin) s.termin = x.termin; if (!bedel && x.oncelik) s.oncelik = x.oncelik; }); },
        bitti: x => `${x.sip} güncellendi` },
      ...(bedel && es ? [{ id: 'onem', ad: 'Siparişi öne al ya da geri bırak', simge: 'up', ne: 'Önemini elle çarpanla değiştirir; gerekçe yazılır.', yetki: 'plan.kilitle',
        alanlar: () => [
          { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: 1, secenek: () => S.D.siparisler.map(s => [s.id, `${s.id} · ${urunAd(s.urun)} · şimdi ×${sayi(agElle(s), 2)}`]) },
          { k: 'v', ad: 'Önemi', tur: 'secim', zorunlu: 1, sayisal: 1, secenek: () => carpan, ipucu: '×2: bir saatlik gecikmesi iki kat pahalı sayılır, motor öne alır' },
          { k: 'g', ad: 'Gerekçe', tur: 'metin', zorunlu: 1, ipucu: 'Örnek: müşteri hat duruşunda' },
        ],
        adimlar: [{ ad: 'Hangi sipariş', k: ['sip'] }, { ad: 'Ne kadar önemli', ne: 'Motor önemli siparişin gecikmesini daha pahalı sayar ve önce onu yetiştirmeye çalışır.', k: ['v', 'g'] }],
        ileri: (d, i) => { if (i !== 0) return; const s = S.D.siparisler.find(x => x.id === d.sip); if (s) { const e = agElle(s); d.v = String(carpan.some(([k]) => k === e) ? e : 1); d.g = s.elleKim && s.elleKim !== 'geçiş' ? s.elleGerekce || '' : ''; } },
        kontrol: (x, i) => (i === 1 || i === -1) && x.g != null && String(x.g).trim().length < 3 ? 'Gerekçe en az üç harf olmalı.' : null,
        sonuc: 'yeni önem plana bir sonraki çözümde girer.',
        kaydet: x => { const s = S.D.siparisler.find(z => z.id === x.sip); if (!s) return false; const once = agElle(s);
          return degistir('Elle çarpan değişti', `${s.id}: ×${sayi(once, 2)} → ×${sayi(x.v, 2)} · ${x.g}`, () => { s.elle = x.v; s.elleGerekce = x.g; s.elleKim = kim().ad; U.agKiyas = null; }, 'plan.kilitle'); },
        bitti: x => `${x.sip} önemi ×${sayi(x.v, 2)} oldu` }] : []),
      ...(fg ? [{ id: 'fiyat', ad: 'Fiyat ve ödeme vadesi', simge: 'lira', ne: 'Siparişin tutarı ve kaç günde ödeneceği.', yetki: 'plan.kilitle',
        alanlar: () => [
          { k: 'sip', ad: 'Sipariş', tur: 'secim', zorunlu: 1, secenek: () => S.D.siparisler.map(s => [s.id, `${s.id} · ${urunAd(s.urun)} · ${s.gelir == null ? 'fiyatsız' : agTL(s.gelir)}`]) },
          { k: 'gelir', ad: 'Tutar (TL)', tur: 'sayi', min: 0, zorunlu: 1 },
          { k: 'vade', ad: 'Ödeme vadesi (gün)', tur: 'sayi', min: 0, max: 365, tam: 1, ipucu: 'Boş: peşin' },
        ],
        adimlar: [{ ad: 'Hangi sipariş', ne: 'Fiyatı olmayanlar listede "fiyatsız" yazar.', k: ['sip'] }, { ad: 'Tutar ve vade', k: ['gelir', 'vade'] }],
        ilk: () => { const s = S.D.siparisler.find(z => z.gelir == null); return s ? { sip: s.id } : {}; },
        ileri: (d, i) => { if (i !== 0) return; const s = S.D.siparisler.find(x => x.id === d.sip); if (s) { d.gelir = s.gelir == null ? '' : String(s.gelir); d.vade = s.vade == null ? '' : String(s.vade); } },
        sonuc: 'kâr ve gecikme bedeli bu tutarla yeniden hesaplanır.',
        kaydet: x => { const s = S.D.siparisler.find(z => z.id === x.sip); if (!s) return false;
          return degistir('Sipariş fiyatı değişti', `${s.id}: ${agTL(s.gelir)} → ${agTL(x.gelir)}, vade ${s.vade ?? '—'} → ${x.vade ?? '—'} gün`, () => { s.gelir = x.gelir; if (x.vade == null) delete s.vade; else s.vade = x.vade; }, 'plan.kilitle'); },
        bitti: x => `${x.sip} fiyatı kaydedildi` }] : []),
    ];
  },
};
