/* ---------- Sade tahta, 1. adım ----------
   Tahta açılınca bütün ekranı kullanır; üstte tek ince çubuk kalır: ekranlar, tek arama, üç nabız sayısı ve planı iyileştir.
   Boşta bilgi vermeyen satırlar gizlenir; rota rozetleri ne olduklarını yazar. Kullanıcı menüleri isterse çubuktan açar. */
U.sdCikti = false;
const sdTamEski = tkTamDegistir;
/* kullanıcı menüleri açınca tahtada kalsa da tam görünüme kendiliğinden dönülmez; işaret çizimden önce konur */
tkTamDegistir = function (ac) { const hedef = ac == null ? !U.tkTam : !!ac; if (U.tkTam && !hedef) U.sdCikti = true; sdTamEski(ac); };
/* tahta sayfasında tam görünüm varsayılandır; başka sayfaya geçince menüler geri gelir */
const sdRenderEski = render;
render = function () {
  if (S && U.sayfa === 'tahta' && !U.tkTam && !U.sdCikti) { U.tkTam = true; U.tkAra = false; tkTamUygula(); requestAnimationFrame(() => { if (AT.cv) { atSigdir(AT.cv.clientWidth, AT.cv.clientHeight); atTetikle(); } }); }
  else if (S && U.sayfa !== 'tahta') { if (U.tkTam) { U.tkTam = false; tkTamUygula(); } U.sdCikti = false; }
  sdRenderEski();
};
function sdNabiz() {
  if (!S.plan || typeof nbOlc !== 'function') return '';
  const R = nbRef(); const onz = U.hamle && !U.taslak ? U.hamle.plan : null; const v = nbOlc(onz || S.plan); const kar = onz ? nbOlc(S.plan) : R.o;
  const l = [['late', v.late == null ? '—' : String(v.late), 'geç', true], ['wT', saat(v.wT), 'gecikme', true, 1], ['dar', v.dar == null ? '—' : `%${Math.round(v.dar)}`, 'darboğaz', true, 1]];
  return `<div class="pm-sb-nb" role="group" aria-label="Plan nabzı">${l.map(([id, d, ad, kucukIyi, ikincil]) => { const f = kar ? nbFark(id, v[id], kar[id], kucukIyi) : { ton: '', m: '' };
    return `<button type="button" class="pm-sb-nb-k" ${ikincil ? 'data-ikincil' : ''} data-act="br-odak" data-v="ozet" data-ton="${f.ton}" title="${esc(ad)}: ${onz ? 'önizlemede, plana göre' : esc(R.ad) + ' referansına göre'} ${esc(f.m || 'aynı')}. Göstergelere git."><b class="mono">${esc(d)}</b><span>${ad}</span>${f.ton ? `<small>${f.ton === 'iyi' ? '▼' : '▲'}</small>` : ''}</button>`; }).join('')}</div>`;
}
function sdCubuk() {
  const ek = [['tahta', 'Plan', 'gantt'], ['siparisler', 'Veri', 'layers'], ['senaryolar', 'Geçmiş', 'book']];
  const yaz = yetkili('plan.yaz'); const guncel = planGuncel();
  const durum = !S.plan ? rozet('Plan yok', 'pasif') : U.hamle ? rozet('Önizleme', 'uyari') : guncel ? rozet('Güncel', 'tamam') : rozet('Veri değişti', 'uyari');
  return `<div class="pm-sb" role="toolbar" aria-label="Plan çubuğu">
    <nav class="pm-sb-ekran" aria-label="Ekranlar">${ek.map(([id, ad, sm]) => `<button type="button" data-act="git" data-v="${id}" ${id === 'tahta' ? 'aria-current="page"' : ''}>${ic(sm, 'k')}<span>${ad}</span></button>`).join('')}</nav>
    <button type="button" class="pm-sb-ara" data-act="v20-palet" title="Sipariş, tezgâh ya da komut ara (Ctrl K)">${ic('search', 'k')}<span>Ara: sipariş, tezgâh, komut</span><kbd>Ctrl K</kbd></button>
    ${sdNabiz()}
    <span class="pm-sb-sag">${durum}${S.plan && yaz ? `<button type="button" class="tc-dugme tc-dugme-kucuk pm-sb-iyi${guncel ? '' : ' tc-dugme-birincil'}" data-act="ekip" title="Planı iyileştir" aria-label="Planı iyileştir">${ic('play', 'k')}<span>Planı iyileştir</span></button>` : ''}${dugme('', 'tk-tam', { kucuk: true, hayalet: true, simge: 'list', ad: 'Menüleri göster' })}</span></div>`;
}
const sdAtEski = sAtolye;
sAtolye = function (p) {
  const h = sdAtEski(p); if (!U.tkTam) return h;
  return h.replace('<div class="pm-at" id="pm-at" data-tam', '<div class="pm-at" id="pm-at" data-tam data-sade');
};
/* kamera ve bölgeler çubuğun altından başlar */
const sdSerbestEski = brSerbest;
brSerbest = function () { const f = sdSerbestEski(); const sb = document.querySelector('.pm-at .pm-sb'); if (sb) f.ust += sb.offsetHeight + 8; return f; };
/* boşta "henüz değişiklik yok" satırı yer kaplamaz */
const sdEtkiEski = mzEtki;
mzEtki = function () { const h = sdEtkiEski(); return h.includes('Henüz değişiklik yok') ? '' : h; };
/* rota açıkken tahtada ne görüldüğü tek satırla yazılır */
const sdHudEski = tkHud;
tkHud = function () {
  const h = sdHudEski();
  if (!(U.tkKart || []).some(c => c.tur === 'rota' && !c.kucuk)) return h;
  const u = rtUrun(); if (!u || !u.rota || !u.rota.length) return h;
  const ac = `<span class="pm-sb-rota">${ic('layers', 'k')}<b>${esc(u.ad || u.id)} rotası:</b> OP ${esc(u.rota[0].k)} → OP ${esc(u.rota[u.rota.length - 1].k)} · dolu çerçeve ana tezgâh, kesik çerçeve alternatif</span>`;
  return h.replace('<div class="pm-tk-hud">', `<div class="pm-tk-hud">${ac}`);
};
