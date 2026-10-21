/* ---------- Isı haritası: on planlama sayfası satır × sütun ızgarası; hücre seçilince satırın altında neden, dolu form ve seçenekler ---------- */
const ISI = {};
U.isSec = U.isSec || {}; U.isTum = U.isTum || {}; U.isFs = U.isFs || {}; U.isBas = U.isBas || {}; U.isFi = U.isFi || {};
const IS_AY = '¦';
/* eski sekmeli düzeni ölçen testler için kapatılabilir */
let isKapali = false;
/* bekleme ya da gecikme saatinden kademe: sekiz saatlik bir vardiya, bir gün, üç gün */
const isKdSaat = h => h == null ? null : h <= 0.05 ? 0 : h < 8 ? 1 : h < 24 ? 2 : h < 72 ? 3 : 4;
const isKdOran = (x, e) => x == null || !isFinite(x) ? null : x < e[0] ? 0 : x < e[1] ? 1 : x < e[2] ? 2 : x < e[3] ? 3 : 4;
const isSure = h => h == null ? '' : h < 48 ? `${Math.round(h)}s` : `${Math.round(h / 24)}g`;
const isGun = t => Math.floor(t / 24);
const isTL = x => x == null || !isFinite(x) ? '' : Math.abs(x) >= 1e6 ? `${sayi(x / 1e6, 1)} Mn` : Math.abs(x) >= 1e4 ? `${sayi(x / 1e3, 0)} bin` : sayi(Math.round(x), 0);
const IS_GRUP = g => (typeof BR_GRUP_AD !== 'undefined' && BR_GRUP_AD[g]) || (g === 'montaj' ? 'Montaj' : g);
function isGunSut(now, n) {
  const g0 = isGun(now); const l = [];
  for (let g = g0; g < g0 + n; g++) { const s = fmtDT(S.D, g * 24); l.push({ k: 'g' + g, g, ad: s.slice(0, 5), alt: s.slice(6, 9), bugun: g === g0 }); }
  return { g0, n, l, kis: g => Math.min(Math.max(g, g0), g0 + n - 1), ic: g => g >= g0 && g < g0 + n };
}
/* hücre birleştirme: sonraki işaret öncekinin kademesini düşürmez */
function isHucre(h, k, o) { const c = h[k] || (h[k] = {}); for (const [a, v] of Object.entries(o)) { if (v === undefined) continue; if (a === 'kd' && c.kd != null && v != null && c.kd > v) continue; if (a === 'etiket' && c.etiket) { c.etiket += ', ' + v; continue; } c[a] = v; } return c; }
const isBul = (V, rk) => V && V.satirlar ? V.satirlar.find(r => r.k === rk) || null : null;

const IS_LEJ = { 1: 'Az', 2: 'Orta', 3: 'Çok', 4: 'Termini kaydırır' };
function isLejant(L) {
  const kut = (a, m) => `<span><i class="pm-isi-l" ${a}></i>${esc(m)}</span>`;
  const s = (L.kd || [1, 2, 4]).map(k => kut(`data-kd="${k}"`, (L.kdAd || {})[k] || IS_LEJ[k])).join('');
  return `<p class="pm-isi-lejant" aria-hidden="true">${s}${L.iyi ? kut('data-iyi', L.iyi) : ''}${L.is ? kut('data-is', L.is) : ''}${L.tahmin ? kut('data-tahmin', L.tahmin) : ''}${L.bayrak ? kut('data-bayrak', L.bayrak) : ''}${L.oneri ? kut('data-oneri', L.oneri) : ''}${(L.simge || []).map(([sm, m]) => `<span>${ic(sm, 'k')}${esc(m)}</span>`).join('')}</p>`;
}
function isHucreHtml(id, r, c, h, secK) {
  const k = `${id}${IS_AY}${r.k}${IS_AY}${c.k}`;
  if (!h || (h.kd == null && !h.v && !h.sm && !h.is && !h.iyi && !h.bayrak && !h.oneri)) {
    return `<span class="pm-isi-h" data-bos ${h && h.kapali ? 'data-kapali' : ''} ${c.bugun ? 'data-bugun' : ''} aria-hidden="true"></span>`;
  }
  const et = `${r.ad}, ${c.ad}${c.alt ? ' ' + c.alt : ''}: ${h.etiket || (h.v ? String(h.v) : '')}${h.tahmin ? `, tahmini (${h.tahmin})` : ''}`;
  return `<button type="button" class="pm-isi-h" data-act="isi-sec" data-v="${esc(k)}" ${h.kd != null ? `data-kd="${h.kd}"` : ''} ${h.tahmin ? 'data-tahmin' : ''} ${h.iyi ? 'data-iyi' : ''} ${h.is ? 'data-is' : ''} ${h.bayrak ? 'data-bayrak' : ''} ${h.oneri ? 'data-oneri' : ''} ${c.bugun ? 'data-bugun' : ''} aria-pressed="${secK === k}" aria-label="${esc(et)}" title="${esc(et)}">${h.sm && !(h.v != null && String(h.v).length > 2) ? ic(h.sm, 'k') : ''}${h.v != null && h.v !== '' ? `<span>${esc(h.v)}</span>` : ''}</button>`;
}
function isIzgara(id, V, sec) {
  const [srk, sck] = sec ? sec.split(IS_AY) : [];
  const secK = sec ? `${id}${IS_AY}${sec}` : null;
  const n = V.sutunlar.length; const tum = !!U.isTum[id];
  const gor = V.satirlar.filter(r => tum || !r.gizli || r.k === srk); const giz = V.satirlar.length - gor.length;
  const bas = `<div class="pm-isi-sat pm-isi-bas" style="--n:${n}"><span class="pm-isi-ad">${esc(V.satirAd || '')}</span>${V.sutunlar.map(c => `<span class="pm-isi-sut" ${c.bugun ? 'data-bugun' : ''} title="${esc(c.uzun || c.ad)}"><b>${esc(c.ad)}</b>${c.alt ? `<small>${esc(c.alt)}</small>` : ''}</span>`).join('')}</div>`;
  const sat = gor.map(r => {
    const satir = `<div class="pm-isi-sat" style="--n:${n}" ${r.k === srk ? 'data-secili' : ''}><span class="pm-isi-ad" ${r.ton ? `data-ton="${r.ton}"` : ''}>${r.simge ? ic(r.simge, 'k') : ''}<span><b class="mono">${esc(r.ad)}</b>${r.alt ? `<small>${esc(r.alt)}</small>` : ''}</span></span>${V.sutunlar.map(c => isHucreHtml(id, r, c, r.h[c.k], secK)).join('')}</div>`;
    return satir + (r.k === srk ? isAcilim(id, V, srk, sck) : '');
  }).join('');
  const dg = giz || (tum && V.satirlar.some(r => r.gizli)) ? `<div class="pm-dugmeler pm-isi-tum">${dugme(tum ? 'Yalnız bakılması gerekenler' : `${giz} satır daha göster${V.gizliAd ? ` (${V.gizliAd})` : ''}`, 'isi-tum', { kucuk: true, hayalet: true, simge: tum ? 'minus' : 'plus', veri: `data-v="${esc(id)}"` })}</div>` : '';
  return `<div class="pm-isi-kap" role="group" aria-label="${esc(V.baslik || 'Isı haritası')}"><div class="pm-isi-tablo" style="--n:${n}" data-genis="${V.genis || 'gun'}">${bas}${sat}</div></div>${dg}`;
}
/* satırın hemen altındaki açılım: neden, o kaleme dolu gelen form, en çok iki seçenek */
function isAcilim(id, V, rk, ck) {
  let A = null; try { A = ISI[id].acilim(V, rk, ck); } catch (e) { console.error(e); }
  if (!A) return '';
  const fs = U.isFs[id] || id;
  const f = U.sdForm && U.sdForm.sayfa === fs ? sdFormlar(fs).find(x => x.id === U.sdForm.id) : null;
  let form = f ? sdSihirbaz(fs, f) : '';
  if (f && (U.isBas[id] || 0) >= 1 && (U.sdForm.adim || 0) <= U.isBas[id]) form = form.replace(/<button[^>]*data-act="sd-geri"[^>]*>[^]*?<\/button>/, '');
  const son = U.sdSon && U.sdSon.sayfa === fs ? sdSonKart() : '';
  const izinli = (A.formlar || []).map((x, i) => ({ x, i })).filter(({ x }) => sdFormlar(x.sayfa || id).some(z => z.id === x.id));
  const fi = U.isFi[id] ?? (izinli[0] ? izinli[0].i : -1);
  let govde = form || son;
  if (!form) {
    const ana = izinli.find(z => z.i === fi) || izinli[0];
    if (ana) govde += dugme(son ? 'Yeniden düzenle' : ana.x.ad, 'isi-form', { birincil: !son, simge: 'edit', veri: `data-v="${esc(id + IS_AY + ana.i)}"` });
    else if ((A.formlar || []).length) govde += `<p class="pm-kucuk">${ic('lock', 'k')} Bunu değiştirme yetkiniz yok.</p>`;
  }
  const sec = [...izinli.filter(z => z.i !== fi).map(z => ({ ad: z.x.ad, etki: z.x.etki || '', act: 'isi-form', v: id + IS_AY + z.i, simge: z.x.simge || 'edit' })), ...(A.secenekler || [])].slice(0, 2);
  const yada = sec.length ? `<div class="pm-isi-yada"><span class="pm-isi-yada-b">Ya da</span>${sec.map(s => `<button type="button" class="pm-sd-fkart pm-isi-secenek" data-act="${esc(s.act)}" ${s.v != null ? `data-v="${esc(s.v)}"` : ''}><span class="pm-sd-is-sm">${ic(s.simge || 'next', 'k')}</span><span class="pm-sd-is-m"><b>${esc(s.ad)}</b>${s.etki ? `<small>${esc(s.etki)}</small>` : ''}</span></button>`).join('')}</div>` : '';
  const dl = A.bilgi && A.bilgi.length ? `<dl class="pm-gv-dl pm-isi-dl">${A.bilgi.map(([a, v]) => `<div><dt>${esc(a)}</dt><dd>${esc(v == null || v === '' ? '—' : v)}</dd></div>`).join('')}</dl>` : '';
  return `<section class="pm-isi-ac" aria-label="${esc(A.baslik)}" data-ton="${A.ton || ''}"><div class="pm-isi-ac-ust"><b>${ic(A.simge || 'target', 'k')}<span>${esc(A.baslik)}</span></b>${dugme('', 'isi-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat', veri: `data-v="${esc(id)}"` })}</div>
    <div class="pm-isi-ac-ic"><div class="pm-isi-ac-sol"><p class="pm-gv-neden pm-isi-neden" data-ton="${A.ton || ''}">${esc(A.neden)}</p>${dl}<div class="pm-isi-form">${govde}</div></div>${yada}</div></section>`;
}
function isSayfa(id, asil) {
  const d = SADE[id]; const P = ISI[id]; let V = null, hata = '';
  try { V = P.veri(); } catch (e) { console.error(e); hata = e.message; }
  let sec = U.isSec[id] || null; if (sec && V && !isBul(V, sec.split(IS_AY)[0])) sec = null;
  const ust = V && V.ust; let govde;
  if (hata) govde = `<div class="pm-serit" data-ton="hata">${ic('alert', 'k')}<span class="pm-serit-metin">Isı haritası çizilemedi: ${esc(hata)}</span></div>`;
  else if (!V || V.bos) govde = `<div class="pm-sd-bos pm-isi-bos">${ic(V && V.bosSimge || 'grid', 'k')}<span>${esc(V ? V.bos : 'Plan kurulunca bu harita dolar.')}</span>${V && V.bosEylem || ''}</div>`;
  else govde = `${isLejant(V.lejant || {})}${isIzgara(id, V, sec)}${V.not ? `<p class="pm-kucuk pm-isi-not">${esc(V.not)}</p>` : ''}`;
  /* satırsız açılan form (yapılacaklar listesinden): başlığın altında */
  let ayri = '';
  if (!sec && U.sdForm && U.sdForm.sayfa === id) { const f = sdFormlar(id).find(x => x.id === U.sdForm.id); if (f) ayri = `<section class="pm-isi-ac" aria-label="${esc(f.ad)}"><div class="pm-isi-ac-ust"><b>${ic(f.simge || 'edit', 'k')}<span>${esc(f.ad)}</span></b></div>${sdSihirbaz(id, f)}</section>`; }
  else if (!sec && U.sdSon && U.sdSon.sayfa === id) ayri = sdSonKart();
  let tum = ''; try { tum = asil(); } catch (e) { console.error(e); }
  return `<div class="pm-isi" data-isi="${esc(id)}"><header class="pm-gv-ust pm-isi-ust"><h2>${ic(d.simge || 'grid', 'k')}${esc(d.ad || SAYFA_AD[id] || id)}${V && V.baslik ? `<small>${esc(V.baslik)}</small>` : ''}</h2>
    ${ust ? `<p class="pm-gv-durum pm-isi-durum" data-ton="${ust.ton || ''}" role="status">${ic(ust.simge || 'dash', 'k')}<span>${esc(ust.metin)}</span>${ust.eylem || ''}</p>` : ''}</header>
    ${ayri}<section class="pm-isi-ana" aria-label="Isı haritası">${govde}</section>
    ${tum ? `<details class="pm-gv-tum pm-isi-tumsat" ${(U.gvTum || {})[id] ? 'open' : ''} data-gv-tum="${esc(id)}"><summary>${ic('list', 'k')}Tüm satırlar</summary><div class="pm-gv-tum-ic">${tum}</div></details>` : ''}</div>`;
}
function isFormAc(id, i) {
  const s = U.isSec[id]; if (!s) return false; const [rk, ck] = s.split(IS_AY);
  let V = null, A = null; try { V = ISI[id].veri(); A = ISI[id].acilim(V, rk, ck); } catch (e) { console.error(e); return false; }
  const x = A && (A.formlar || [])[i]; if (!x) return false; const sp = x.sayfa || id;
  const f = sdFormlar(sp).find(z => z.id === x.id); if (!f) return false;
  let ilk = {}; try { ilk = f.ilk ? f.ilk() || {} : {}; } catch (e) { ilk = {}; }
  const deg = Object.assign({}, ilk, x.deg || {});
  const adim = Math.min(x.adim ?? (Object.keys(x.deg || {}).length ? 1 : 0), f.adimlar.length);
  if (f.ileri && adim >= 1) f.ileri(deg, 0);
  U.sdForm = { sayfa: sp, id: f.id, adim, deg }; U.sdSon = null; U.isFs[id] = sp; U.isBas[id] = adim; U.isFi[id] = i;
  return true;
}
function isIlkForm(id) {
  const s = U.isSec[id]; if (!s) return; const [rk, ck] = s.split(IS_AY);
  let A = null; try { A = ISI[id].acilim(ISI[id].veri(), rk, ck); } catch (e) { console.error(e); return; }
  const i = (A && A.formlar || []).findIndex(x => sdFormlar(x.sayfa || id).some(z => z.id === x.id));
  if (i >= 0) isFormAc(id, i);
}
function isOdak(v) {
  const ac = document.querySelector('.pm-isi-ac'); if (!ac) return;
  if (ac.scrollIntoView) ac.scrollIntoView({ block: 'nearest' });
  const g = ac.querySelector('form[data-sd] .pm-sd-adim:not([hidden]) input:not([type=hidden]), form[data-sd] .pm-sd-adim:not([hidden]) select, form[data-sd] button[type=submit]') || (v ? null : ac.querySelector('button'));
  if (g) g.focus({ preventScroll: true });
}
function isKapat(id) {
  const s = U.isSec[id]; U.isSec[id] = null; U.isFi[id] = undefined;
  if (U.sdForm && (U.sdForm.sayfa === id || U.sdForm.sayfa === U.isFs[id])) U.sdForm = null; U.sdSon = null; render();
  if (s) { const b = [...document.querySelectorAll('.pm-isi-h[data-act="isi-sec"]')].find(x => x.dataset.v === id + IS_AY + s); if (b) b.focus({ preventScroll: true }); }
}
{ const sh0 = sdSayfa; sdSayfa = function (id, asil) { return ISI[id] && !isKapali ? isSayfa(id, asil) : sh0(id, asil); }; }
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'isi-sec': { const s = String(v); const i = s.indexOf(IS_AY); const id = s.slice(0, i), k = s.slice(i + 1);
      const ayni = U.isSec[id] === k; U.isSec[id] = ayni ? null : k; U.isFi[id] = undefined; U.sdSon = null; U.sdForm = null;
      if (!ayni) isIlkForm(id); render(); if (!ayni) isOdak(); return true; }
    case 'isi-form': { const s = String(v); const i = s.lastIndexOf(IS_AY); const id = s.slice(0, i); isFormAc(id, +s.slice(i + 1)); render(); isOdak(); return true; }
    case 'isi-kapat': isKapat(String(v)); return true;
    case 'isi-tum': U.isTum[v] = !U.isTum[v]; render(); return true;
    case 'sd-form': { const [id] = String(v).split(':'); if (ISI[id]) { U.isSec[id] = null; U.isFs[id] = id; } break; }
    case 'sd-sek': { const [id] = String(v).split(':'); if (ISI[id] && !isKapali && ymYan()) { (U.gvTum = U.gvTum || {})[id] = true; render(); const t = document.querySelector('.pm-isi-tumsat'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' }); return true; } break; }
    case 'sd-vazgec': { const id = U.sayfa; if (ISI[id] && U.isSec[id]) { isKapat(id); return true; } break; }
  }
  return te0(act, v, el, e);
}; }
document.addEventListener('keydown', e => { if (e.key !== 'Escape' || e.defaultPrevented) return; const id = U.sayfa; if (ISI[id] && document.querySelector('.pm-isi-ac') && (U.isSec[id] || U.sdForm)) { e.preventDefault(); if (U.isSec[id]) isKapat(id); else { U.sdForm = null; U.sdSon = null; render(); } } });

/* ---------- Terminler: malzeme ve fason kalemi × gün ---------- */
const IS_TAHMIN = 'tarih girilmedi, olağan süreye göre';
ISI.terminler = {
  veri() {
    const K = gvTmKalemler(); const yaz = stkYaz();
    if (!S.plan || !K) return { bos: 'Henüz plan yok; malzemenin ve fasonun ne zaman gerektiği plandan çıkar.', bosEylem: yaz ? dugme('Planı kur', 'coz', { kucuk: true, birincil: true, simge: 'play', veri: 'data-v="sifir"' }) : '' };
    const G = isGunSut(K.now, 21); const satirlar = [];
    for (const x of [...K.L].sort((a, b) => GV_SIRA[a.ton] - GV_SIRA[b.ton] || (a.ger ?? 1e12) - (b.ger ?? 1e12))) {
      const h = {}; const tah = x.tahmini ? IS_TAHMIN : undefined; const gec = x.son != null && x.ger != null && x.son > x.ger + 0.05;
      const kd = x.ton === 'hata' ? 4 : 2; const sm = x.grup === 'mal' ? 'box' : 'truck';
      if (x.bas != null && x.son != null) { const a = Math.max(isGun(x.bas), G.g0), b = Math.min(isGun(gec ? x.ger : x.son) - (gec ? 0 : 1), G.g0 + G.n - 1); for (let g = a; g <= b; g++) isHucre(h, 'g' + g, { is: 1, etiket: x.grup === 'mal' ? 'yolda' : 'fasoncuda' }); }
      if (gec) { for (let g = Math.max(isGun(x.ger), G.g0); g <= Math.min(isGun(x.son), G.g0 + G.n - 1); g++) isHucre(h, 'g' + g, { kd, tahmin: tah, etiket: 'bekleniyor' }); }
      if (x.son != null) { const g = isGun(x.son); const dis = !G.ic(g); isHucre(h, 'g' + G.kis(g), { sm, kd: gec ? kd : undefined, iyi: gec ? undefined : 1, tahmin: tah, v: gec ? `+${Math.ceil((x.son - x.ger) / 24)}g` : dis ? '»' : '', etiket: `geliş ${stkGun(x.son)}${gec ? `, gerekenden ${Math.ceil((x.son - x.ger) / 24)} gün geç` : ''}` }); }
      else if (x.ger != null) isHucre(h, 'g' + G.kis(isGun(x.ger)), { kd: 4, sm: 'alert', v: '!', etiket: 'geliş tarihi yok' });
      if (x.ger != null) isHucre(h, 'g' + G.kis(isGun(x.ger)), { bayrak: 1, etiket: `plan ${stkGun(x.ger)} istiyor` });
      satirlar.push({ k: x.k, ad: x.ad, alt: x.durum, simge: x.simge, ton: x.ton, gizli: x.ton === 'tamam', h, x, gun: gec ? (x.son - x.ger) / 24 : x.son == null ? null : 0 });
    }
    const hata = satirlar.filter(r => r.ton === 'hata'); const bek = satirlar.filter(r => r.gun > 0);
    const en = [...satirlar].filter(r => r.ton !== 'tamam').sort((a, b) => (b.ton === 'hata') - (a.ton === 'hata') || (b.gun ?? 99) - (a.gun ?? 99))[0];
    let metin;
    if (!en) metin = `Bütün ${satirlar.length} malzeme ve fason kalemi gerektiği gün geliyor.`;
    else metin = `En koyu satır ${en.ad}: ${en.x.son == null ? `geliş tarihi yok, plan ${stkGun(en.x.ger)} istiyor` : `plan ${stkGun(en.x.ger)} istiyor, geliş ${stkGun(en.x.son)} (${sayi(en.gun, 1)} gün bekleme)`}. ${bek.length} kalem gerekenden geç geliyor, ${satirlar.filter(r => r.x.son == null).length} kalemin geliş tarihi yok; ${hata.length} kalem işi kaydırıyor.`;
    const u = stkTmUyari(); const eylem = u && yaz ? dugme(`${u.js.length} işi ileri at`, 'tm-ileri', { kucuk: true, simge: 'next', veri: `data-v="${esc(u.js.join(',') + '|' + u.g)}"` }) : '';
    return { baslik: 'Kalem × gün, neyi bekliyor', satirAd: 'Kalem', genis: 'gun', sutunlar: G.l, satirlar, gizliAd: 'zamanında gelenler',
      ust: { ton: hata.length ? 'hata' : en ? 'uyari' : 'tamam', simge: hata.length ? 'alert' : en ? 'clock' : 'check', metin, eylem },
      lejant: { kd: [2, 4], kdAd: { 2: 'Bekleme', 4: 'İşi kaydıran bekleme' }, is: 'Yolda / fasoncuda', iyi: 'Zamanında geliş', tahmin: 'Tahmini tarih', bayrak: 'Plan istiyor', simge: [['box', 'Malzeme'], ['truck', 'Fason']] } };
  },
  acilim(V, rk) {
    const r = isBul(V, rk); if (!r) return null; const x = r.x;
    const job = (x.bilgi.find(([a]) => a === 'Bağlı siparişler' || a === 'Sipariş') || [])[1];
    const j1 = job && job !== '—' ? String(job).split(', ')[0] : null; const u = stkTmUyari();
    const sec = [];
    if (u && stkYaz() && x.son == null) sec.push({ ad: `${u.js.length} işi ileri at`, etki: 'Tarihi olmayan malzemeyi bekleyen işler malzemenin tahmini gelişine kadar başlamaz; plan gerçekçi olur.', act: 'tm-ileri', v: u.js.join(',') + '|' + u.g, simge: 'next' });
    if (j1) sec.push({ ad: `${j1} çizelgede`, etki: 'Bu kalemi bekleyen siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: j1, simge: 'gantt' });
    if (x.grup === 'mal') sec.push({ ad: 'Satın alma planı', etki: 'Bütün malzemelerin sipariş günlerini ve miktarlarını gösterir.', act: 'git', v: 'malzplan', simge: 'box' });
    return { baslik: `${x.ad} · ${x.durum}`, simge: x.simge, ton: x.ton, neden: x.neden, bilgi: x.bilgi.slice(0, 4), formlar: x.form ? [{ id: x.form.id, ad: x.form.ad, deg: x.form.deg, adim: 1 }] : [], secenekler: sec };
  },
};

/* ---------- Siparişler: sipariş × hafta, termin riski ---------- */
function isHafta(now, n) {
  const g0 = isGun(now); const l = [];
  for (let b = 0; b < n; b++) { const s = fmtDT(S.D, (g0 + 7 * b) * 24); l.push({ k: 'w' + b, ad: s.slice(0, 5), alt: b === 0 ? 'bu hafta' : 'hafta', uzun: `${s.slice(0, 5)} haftası`, bugun: b === 0 }); }
  l.push({ k: 'w' + n, ad: 'Sonra', alt: '', uzun: `${n} haftadan sonra` });
  return { l, b: t => Math.min(Math.max(Math.floor((t / 24 - g0) / 7), 0), n) };
}
function isIsBas() { const m = {}; for (const r of Object.values(S.plan.ops)) if (m[r.job] == null || r.S < m[r.job]) m[r.job] = r.S; return m; }
ISI.ysiparis = {
  veri() {
    const p = S.plan; const cx = cxAl(); if (!p || !cx) return { bos: 'Plan kurulunca her siparişin hangi hafta biteceği burada görünür.', bosEylem: stkYaz() ? dugme('Planı kur', 'coz', { kucuk: true, birincil: true, simge: 'play', veri: 'data-v="sifir"' }) : '' };
    const now = cx.st.now; const H = isHafta(now, 8); const bas = isIsBas(); const satirlar = [];
    for (const s of S.D.siparisler.filter(z => !z.havuz)) {
      const J = p.J[s.id]; const due = parseT(S.D, s.termin); const h = {}; const T = J ? J.T : null; const C = J ? J.C : null; const gec = T != null && T > 0.05;
      if (C != null && bas[s.id] != null) for (let b = H.b(bas[s.id]); b <= H.b(gec && due != null ? due : C); b++) isHucre(h, 'w' + b, { is: 1, etiket: 'üretimde' });
      if (gec && due != null) for (let b = H.b(due); b <= H.b(C); b++) isHucre(h, 'w' + b, { kd: isKdSaat(T), etiket: 'termin geçti' });
      if (C != null) isHucre(h, 'w' + H.b(C), { sm: gec ? 'clock' : 'check', iyi: gec ? undefined : 1, kd: gec ? isKdSaat(T) : undefined, v: gec ? '+' + isSure(T) : '', etiket: `plan ${stkGun(C)} bitiriyor${gec ? `, ${saat(T)} geç` : ', zamanında'}` });
      else if (due != null) isHucre(h, 'w' + H.b(due), { kd: 4, sm: 'alert', v: '!', etiket: 'plana sığmadı' });
      if (due != null) isHucre(h, 'w' + H.b(due), { bayrak: 1, etiket: `termin ${stkGun(due)}` });
      satirlar.push({ k: s.id, ad: s.id, alt: `${urunAd(s.urun)} · ${sayi(s.adet, 0)} adet`, simge: 'flag', ton: C == null || gec ? (isKdSaat(T) >= 3 || C == null ? 'hata' : 'uyari') : 'tamam', gizli: !gec && C != null, h, s, T, C, due });
    }
    satirlar.sort((a, b) => (b.C == null) - (a.C == null) || (b.T ?? 0) - (a.T ?? 0) || (a.due ?? 1e12) - (b.due ?? 1e12));
    const gecL = satirlar.filter(r => r.T > 0.05); const top = gecL.reduce((a, r) => a + r.T, 0); const en = gecL[0]; const yok = satirlar.filter(r => r.C == null && r.due != null);
    const metin = en ? `En koyu satır ${en.ad}: termin ${stkGun(en.due)}, plan ${stkGun(en.C)} bitiriyor, ${saat(en.T)} geç. ${gecL.length} sipariş geç, toplam kayma ${saat(top)}${yok.length ? `; ${yok.length} sipariş plana sığmadı` : ''}.`
      : yok.length ? `${yok.length} sipariş plana sığmadı; diğerleri termininde bitiyor.` : `Bütün ${satirlar.length} sipariş termininde bitiyor.`;
    return { baslik: 'Sipariş × hafta, termin riski', satirAd: 'Sipariş', genis: 'hafta', sutunlar: H.l, satirlar, gizliAd: 'zamanında',
      ust: { ton: en || yok.length ? (en && isKdSaat(en.T) >= 3 ? 'hata' : 'uyari') : 'tamam', simge: en ? 'alert' : 'check', metin, eylem: !planGuncel() && stkYaz() ? dugme('Planı iyileştir', 'ekip', { kucuk: true, birincil: true, simge: 'play' }) : '' },
      lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '8 saatten az', 2: 'Bir güne kadar', 3: 'Üç güne kadar', 4: 'Üç günden çok' }, is: 'Üretimde', iyi: 'Zamanında biter', bayrak: 'Termin haftası' } };
  },
  acilim(V, rk) {
    const r = isBul(V, rk); if (!r) return null; const s = r.s;
    const neden = r.C == null ? `${s.id} plana sığmadı; termin ${stkGun(r.due)}. Termini ya da önceliği değiştirmek planın onu yerleştirmesine yardım eder.`
      : r.T > 0.05 ? `${s.id} termini ${stkGun(r.due)}, plan ${stkGun(r.C)} bitiriyor: ${saat(r.T)} geç. Müşteri yeni tarih verdiyse termini değiştirin; vermediyse önemini artırın.`
        : `${s.id} termini ${stkGun(r.due)}, plan ${stkGun(r.C)} bitiriyor; zamanında.`;
    return { baslik: `${s.id} · ${urunAd(s.urun)}`, simge: 'flag', ton: r.ton, neden, bilgi: [['Termin', stkGun(r.due)], ['Planlanan bitiş', r.C == null ? 'plana sığmadı' : stkGun(r.C)], ['Gecikme', r.T > 0.05 ? saat(r.T) : 'yok'], ['Adet', sayi(s.adet, 0)]],
      formlar: [{ id: 'termin', ad: 'Termini değiştir', deg: { sip: s.id }, etki: 'Yeni termin plana bir sonraki çözümde girer.', simge: 'flag' },
        { id: 'onem', ad: 'Öne al ya da geri bırak', deg: { sip: s.id }, etki: 'Motor önemli siparişin gecikmesini daha pahalı sayar, önce onu yetiştirir.', simge: 'up' },
        { id: 'fiyat', ad: 'Fiyat ve ödeme vadesi', deg: { sip: s.id }, etki: 'Kâr ve gecikme bedeli bu tutardan hesaplanır.', simge: 'lira' }],
      secenekler: [{ ad: `${s.id} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: s.id, simge: 'gantt' }] };
  },
};

/* ---------- Maliyetler: sipariş × maliyet kalemi ---------- */
const IS_MAL_SUT = [['mal', 'Malzeme'], ['isl', 'Tezgâh'], ['ayar', 'Ayar'], ['gg', 'Genel gider'], ['fas', 'Fason'], ['mes', 'Ek mesai'], ['gec', 'Gecikme'], ['kar', 'Kâr']];
function isSipMal() {
  const cx = cxAl(); const p = S.plan; if (!p || !cx) return null; const W = wipHesap(p, stOf(), cx); const MP = ymMesaiPay(p, cx);
  return S.D.siparisler.filter(s => !s.havuz).map(s => ({ s, m: ymSipMaliyet(s, p, cx, W, MP) })).filter(z => z.m);
}
function isEnTez(sid) { const m = {}; for (const r of Object.values(S.plan.ops)) if (r.job === sid && !r.fas) m[r.m] = (m[r.m] || 0) + (r.C - r.S); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k]) => k).find(k => S.D.tezgahlar.some(t => t.id === k)) || null; }
ISI.maliyet = {
  veri() {
    if (!agFiyatGorur()) return { bos: 'Tutarları yalnız müdür ve yönetici görür.', bosSimge: 'lock' };
    const L = isSipMal(); if (!L) return { bos: 'Plan kurulunca her siparişin maliyeti kalem kalem burada görünür.' };
    const satirlar = L.map(({ s, m }) => {
      const h = {}; const top = m.top || null; const ek = m.eksik || [];
      const deg = { mal: m.mal == null ? null : m.mal - (m.talas || 0), isl: m.isl, ayar: m.ayar, gg: m.gg, fas: m.fas, mes: m.mes, gec: m.gec };
      for (const [k, ad] of IS_MAL_SUT) {
        if (k === 'kar') { const v = m.net ?? m.kar; isHucre(h, k, v == null ? { sm: 'alert', v: '?', etiket: ek.length ? `${ek.join(', ')} eksik` : 'tutar girilmedi' } : { v: isTL(v), kd: v < 0 ? 4 : undefined, iyi: v >= 0 ? 1 : undefined, etiket: `${ad} ${agTL(v)}` }); continue; }
        const v = deg[k];
        if (v == null) { const eks = k === 'mal' ? ek.includes('malzeme kg fiyatı') : k === 'fas' ? ek.includes('fason fiyatı') : (k === 'isl' || k === 'ayar') && ek.some(x => /saat maliyeti/.test(x)); if (eks) isHucre(h, k, { sm: 'alert', v: '?', etiket: `${ad} fiyatı eksik` }); continue; }
        const pay = top ? v / top * 100 : null;
        isHucre(h, k, { v: v ? isTL(v) : '0', kd: v ? isKdOran(pay, [3, 8, 15, 30]) : 0, etiket: `${ad} ${agTL(v)}${pay != null ? `, toplam içindeki payı %${sayi(pay, 0)}` : ''}` });
      }
      return { k: s.id, ad: s.id, alt: `${agTL(m.top)} · ${urunAd(s.urun)}`, simge: 'lira', ton: (m.net ?? 0) < 0 ? 'hata' : ek.length ? 'uyari' : '', h, s, m };
    }).sort((a, b) => (a.m.net ?? 1e12) - (b.m.net ?? 1e12));
    let en = null; for (const r of satirlar) for (const [k] of IS_MAL_SUT) { const c = r.h[k]; if (c && c.kd != null && k !== 'kar' && (!en || c.kd > en.c.kd)) en = { r, k, c }; }
    const zarar = satirlar.filter(r => r.m.net != null && r.m.net < 0); const eks = satirlar.filter(r => (r.m.eksik || []).length);
    const metin = `${en ? `En sıcak hücre ${en.r.ad} ${IS_MAL_SUT.find(x => x[0] === en.k)[1].toLocaleLowerCase('tr')}: ${en.c.etiket.replace(/^[^ ]+ /, '')}. ` : ''}${zarar.length ? `${zarar.length} sipariş zarar ediyor` : 'Zarar eden sipariş yok'}${eks.length ? `, ${eks.length} siparişte fiyat eksik` : ''}.`;
    return { baslik: 'Sipariş × maliyet kalemi, toplam içindeki payı', satirAd: 'Sipariş', genis: 'kalem', sutunlar: IS_MAL_SUT.map(([k, ad]) => ({ k, ad })), satirlar,
      ust: { ton: zarar.length ? 'hata' : eks.length ? 'uyari' : 'tamam', simge: zarar.length ? 'alert' : 'lira', metin },
      lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '%3-8', 2: '%8-15', 3: '%15-30', 4: '%30 ve üstü ya da zarar' }, iyi: 'Kâr', simge: [['alert', 'Fiyat eksik']] }, not: 'Hücre, kalemin siparişin toplam maliyeti içindeki payıyla koyulaşır; hedef maliyet tutulmadığı için sapma gösterilmez.' };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const { s, m } = r; const ad = (IS_MAL_SUT.find(x => x[0] === ck) || [, ck])[1]; const c = r.h[ck] || {};
    const tez = isEnTez(s.id); const F = []; const sec = []; let neden;
    if (ck === 'mal') {
      const kod = ((s.malzeme || [])[0] || {}).kod; const mz = S.D.malzemeler.find(z => z.kod === kod) || {};
      const kg = (S.D.kgFiyat || []).find(z => z.kalite === mz.kalite && (!z.form || z.form === mz.form));
      neden = m.mal == null ? `${s.id} malzemesinin (${kod || 'ürünün malzemesi'}) kg fiyatı yok; malzeme maliyeti hesaplanamıyor.` : `${s.id} malzemesi ${agTL(m.mal)}${m.talas ? `, talaş geri dönüşü ${agTL(m.talas)}` : ''}. Fiyat ${mz.kalite || ''} kg fiyatından gelir.`;
      if (kg) F.push({ id: 'kgdegis', ad: `${kg.kalite} kg fiyatını değiştir`, deg: { r: kg.id }, etki: 'Bu kalitedeki bütün malzemelerin maliyeti değişir.' });
      else if (mz.kalite) F.push({ id: 'kgyeni', ad: `${mz.kalite} kg fiyatı ekle`, deg: { kalite: mz.kalite, cins: mz.cins || '', form: mz.form || '' }, adim: 1, etki: 'Bu kalitedeki bütün malzemeler bu fiyatı kullanır.' });
    } else if (ck === 'fas') {
      const op = Object.values(S.plan.ops).find(z => z.job === s.id && z.fas); const fid = op ? String(op.m).replace(/^@/, '') : null;
      neden = op ? `${s.id} fason adımı ${fid}; tutar ${m.fas ? agTL(m.fas) : 'yok'}.` : `${s.id} fasona gitmiyor.`;
      if (fid) F.push({ id: 'fason', ad: 'Fason fiyatını değiştir', deg: { fas: fid }, etki: 'Fason önerileri ve maliyet yeni fiyatla hesaplanır.' });
      sec.push({ ad: 'Fason planı', etki: 'Hangi işin dışarıda yapılacağını gösterir.', act: 'git', v: 'fasonplan', simge: 'truck' });
    } else if (ck === 'mes') {
      neden = `${s.id} ek mesai payı ${agTL(m.mes)}. Pay, siparişin ek vardiyada çalışan saatlerinden gelir.`;
      F.push({ id: 'iscilik', ad: 'İşçilik ücretleri', deg: {}, adim: 0, etki: 'Ek mesai ve ayar maliyeti bu ücretlerden hesaplanır.' });
      sec.push({ ad: 'Ek mesai planı', etki: 'Hangi tezgâha ne zaman ek vardiya açıldığını gösterir.', act: 'git', v: 'mesaiplan', simge: 'clock' });
    } else if (ck === 'gec' || ck === 'kar') {
      neden = ck === 'gec' ? `${s.id} ${m.T > 0.05 ? `${saat(m.T)} geç bitiyor; gecikme bedeli ${agTL(m.gec)}` : 'zamanında bitiyor; gecikme bedeli yok'}.` : m.net == null ? `${s.id} kârı hesaplanamıyor: ${(m.eksik || []).join(', ') || 'sipariş tutarı girilmedi'}.` : `${s.id} tutarı ${agTL(m.tutar)}, maliyeti ${agTL(m.top)}, gecikme ve finansman sonrası ${agTL(m.net)}.`;
      F.push({ sayfa: 'ysiparis', id: ck === 'gec' ? 'termin' : 'fiyat', ad: ck === 'gec' ? 'Termini değiştir' : 'Fiyat ve ödeme vadesi', deg: { sip: s.id }, etki: ck === 'gec' ? 'Müşteri yeni tarih verdiyse gecikme bedeli düşer.' : 'Kâr bu tutardan hesaplanır.' });
      sec.push({ ad: 'Termin ve kâr', etki: 'Termin uzatmasının gecikmeyi ve kârı nasıl değiştirdiğini gösterir.', act: 'git', v: 'denge', simge: 'gauge' });
    } else {
      neden = `${s.id} ${ad.toLocaleLowerCase('tr')} ${agTL(m[ck])}. En çok ${tez || '—'} tezgâhında çalışıyor; tutar o tezgâhın saat ücretinden gelir.`;
      if (tez) F.push({ id: 'tezucret', ad: `${tez} saat ücreti`, deg: { tez }, etki: 'Bu tezgâhta çalışan bütün siparişlerin maliyeti değişir.' });
      if (ck === 'gg') sec.push({ ad: 'Genel gider', etki: 'Kira, enerji ve amortismanın tezgâhlara nasıl dağıldığını gösterir.', act: 'git', v: 'giderler', simge: 'layers' });
    }
    sec.push({ ad: `${s.id} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: s.id, simge: 'gantt' });
    return { baslik: `${s.id} · ${ad}`, simge: 'lira', ton: c.kd >= 4 ? 'hata' : c.sm === 'alert' ? 'uyari' : '', neden, bilgi: [['Toplam maliyet', agTL(m.top)], ['Tutar', agTL(m.tutar)], ['Net', agTL(m.net)]], formlar: F, secenekler: sec };
  },
};

/* ---------- Genel gider: gider kalemi × tezgâh grubu ---------- */
ISI.giderler = {
  veri() {
    if (!agFiyatGorur()) return { bos: 'Tutarları yalnız müdür ve yönetici görür.', bosSimge: 'lock' };
    const v = msHesap(); if (!v || !v.tez) return { bos: 'Tezgâh ve gider bilgisi girilince dağılım burada görünür.' };
    const M = msSis(); const gr = [...new Set(S.D.tezgahlar.map(t => t.grup))];
    const sutunlar = gr.map(g => ({ k: g, ad: IS_GRUP(g), alt: `${S.D.tezgahlar.filter(t => t.grup === g).length} tezgâh` }));
    const top = (f, g) => { const l = v.tez.filter(z => z.t.grup === g).map(f).filter(x => x != null); return l.length ? l.reduce((a, b) => a + b, 0) : null; };
    const satirlar = [...M.kalemler.map(k => ({ k: k.id, ad: k.ad, alt: `${agTL(msKalemTL(k))}/ay · ${(MS_ANAHTAR[k.anahtar] || k.anahtar || '')}`, simge: 'layers', f: z => z.kalem[k.id] ?? null, kal: k })),
      { k: 'amort', ad: 'Amortisman', alt: 'tezgâh başına', simge: 'cpu', f: z => z.amort ?? null }];
    let mx = 0; for (const r of satirlar) for (const g of gr) { const x = top(r.f, g); if (x != null) mx = Math.max(mx, x); }
    for (const r of satirlar) { r.h = {}; for (const g of gr) { const x = top(r.f, g); if (x == null) continue; isHucre(r.h, g, { v: x ? isTL(x) : '0', kd: mx > 0 ? isKdOran(x / mx, [0.05, 0.15, 0.35, 0.6]) : 0, etiket: `${agTL(x)} / ay` }); } r.top = gr.reduce((a, g) => a + (top(r.f, g) || 0), 0); }
    let en = null; for (const r of satirlar) for (const g of gr) { const c = r.h[g]; if (c && (!en || (top(r.f, g) || 0) > en.x)) en = { r, g, x: top(r.f, g) || 0 }; }
    const eksA = sdgEksikAmort(); const atil = v.atil;
    const metin = `${en ? `En sıcak hücre ${en.r.ad}, ${IS_GRUP(en.g)}: ayda ${agTL(en.x)}. ` : ''}Aylık genel gider ${agTL(v.aylik)}${atil != null ? `, bunun ${agTL(atil)} tutarı boş tezgâh saatlerine düşüyor` : ''}${eksA.length ? `; ${eksA.length} tezgâhın amortisman bilgisi eksik` : ''}.`;
    return { baslik: 'Gider kalemi × tezgâh grubu, aylık pay', satirAd: 'Gider kalemi', genis: 'kalem', sutunlar, satirlar,
      ust: { ton: eksA.length ? 'uyari' : '', simge: 'layers', metin }, lejant: { kd: [1, 2, 3, 4], kdAd: { 1: 'Küçük pay', 2: 'Orta', 3: 'Büyük', 4: 'En büyük paylar' } },
      not: 'Bütçe tutulmadığı için ay ay sapma yerine kalemin tezgâh gruplarına dağılımı gösterilir; boş hücre o kalemin o gruba yazılmadığını söyler.' };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const tz = S.D.tezgahlar.filter(t => t.grup === ck); const c = r.h[ck] || {};
    const sec = [{ ad: 'Maliyetler', etki: 'Bu payın siparişlerin maliyetine nasıl girdiğini gösterir.', act: 'git', v: 'maliyet', simge: 'lira' }];
    if (rk === 'amort') {
      const eks = sdgEksikAmort().find(t => t.grup === ck); const t = eks || tz[0];
      return { baslik: `Amortisman · ${IS_GRUP(ck)}`, simge: 'cpu', ton: eks ? 'uyari' : '', neden: `${IS_GRUP(ck)} grubunda ${tz.length} tezgâh; aylık amortisman ${c.etiket || 'yok'}.${eks ? ` ${eks.id} için alış bedeli ya da ömür girilmedi.` : ''}`,
        bilgi: [['Tezgâhlar', tz.map(z => z.id).join(', ')]], formlar: t ? [{ id: 'amort', ad: `${t.id} amortismanı`, deg: { tez: t.id }, etki: 'Tezgâhın aylık payı alış bedeli ve ömürden hesaplanır.' }, { id: 'tezbilgi', ad: `${t.id} enerji, alan, bakım`, deg: { tez: t.id }, etki: 'Kira ve enerji payı bu bilgilerle dağıtılır.', simge: 'gauge' }] : [], secenekler: sec };
    }
    const k = r.kal;
    return { baslik: `${k.ad} · ${IS_GRUP(ck)}`, simge: 'layers', ton: '', neden: `${k.ad} ayda ${agTL(msKalemTL(k))}; ${MS_ANAHTAR[k.anahtar] || k.anahtar} ölçüsüyle dağılıyor, ${IS_GRUP(ck)} grubuna ${c.etiket || 'pay düşmüyor'}.`,
      bilgi: [['Aylık', agTL(msKalemTL(k))], ['Dağıtım ölçüsü', MS_ANAHTAR[k.anahtar] || k.anahtar], ['Kapsam', k.kapsam || 'bütün tezgâhlar']],
      formlar: [{ id: 'kalemdegis', ad: 'Gider kalemini değiştir', deg: { kal: k.id }, etki: 'Tutar ya da dağıtım ölçüsü değişince bütün tezgâhların saat maliyeti yeniden hesaplanır.' }], secenekler: sec };
  },
};

/* ---------- Ek mesai planı: tezgâh × gün, doluluk ---------- */
ISI.mesaiplan = {
  veri() {
    const p = S.plan; const cx = cxAl(); if (!p || !cx) return { bos: 'Plan kurulunca tezgâhların günlük doluluğu burada görünür.' };
    const G = isGunSut(cx.st.now, 14); const o = sdMsOneri(); const ops = Object.values(p.ops).filter(r => !r.fas);
    const satirlar = S.D.tezgahlar.map(t => {
      const M = cx.M[t.id]; const h = {}; let mx = 0; let ozel = false;
      for (const c of G.l) {
        const a = c.g * 24, b = a + 24; const acik = M ? workIn(M.rw, Math.max(a, cx.st.now), b) : 0;
        const dolu = M ? ops.filter(r => r.m === t.id && r.C > a && r.S < b).reduce((s, r) => s + workIn(M.rw, Math.max(r.S, a, cx.st.now), Math.min(r.C, b)), 0) : 0;
        const ek = S.ekMesai.filter(e => e.m === t.id && e.gun === c.g); const on = o ? o.liste.map((x, i) => ({ x, i })).filter(z => z.x.m === t.id && z.x.gun === c.g && z.x.net > 0) : [];
        if (acik <= 0.05 && !ek.length && !on.length) { h[c.k] = { kapali: 1 }; continue; }
        const pct = acik > 0.05 ? Math.min(100, dolu / acik * 100) : null; if (pct != null) mx = Math.max(mx, pct);
        const sm = ek.length ? 'plus' : on.length ? 'target' : undefined; if (sm) ozel = true;
        isHucre(h, c.k, { v: pct == null ? '' : `${Math.round(pct)}`, kd: pct == null ? undefined : isKdOran(pct, [50, 75, 90, 98]), sm, oneri: on.length ? 1 : undefined, etiket: `${pct == null ? 'vardiya yok' : `%${Math.round(pct)} dolu (${saat(dolu)} / ${saat(acik)})`}${ek.length ? `, ${ek.map(e => e.vardiya).join(', ')} ek vardiya planlı` : ''}${on.length ? `, ek vardiya önerisi: gecikme ${saat(on[0].x.dT)} azalır` : ''}`, ek, on });
      }
      return { k: t.id, ad: t.id, alt: t.ad, simge: 'cpu', ton: mx >= 98 ? 'hata' : mx >= 90 ? 'uyari' : '', gizli: mx < 75 && !ozel, h, t, mx };
    }).sort((a, b) => b.mx - a.mx);
    const dolu = satirlar.filter(r => r.mx >= 98); const iyi = o ? o.liste.filter(a => a.net > 0) : null; const en = satirlar[0];
    let blok = null; if (en) { const gl = G.l.filter(c => (en.h[c.k] || {}).kd >= 4); if (gl.length) blok = `${gl[0].ad}${gl.length > 1 ? `–${gl[gl.length - 1].ad}` : ''}`; }
    const metin = `${en && blok ? `En sıcak blok ${en.ad}, ${blok}: tezgâh tam dolu. ` : ''}İki haftada ${dolu.length} tezgâh en az bir gün tam dolu; ${S.ekMesai.length} ek vardiya planlı${iyi ? `, ${iyi.length} öneri gecikmeyi azaltıyor` : ', öneriler henüz hesaplanmadı'}.`;
    const eylem = !o && yetkili('plan.yaz') && !(U.ymMs && U.ymMs.run) ? dugme('Önerileri hesapla', 'ym-mesai-oner', { kucuk: true, birincil: true, simge: 'play' }) : '';
    return { baslik: 'Tezgâh × gün, doluluk ve ek mesai', satirAd: 'Tezgâh', genis: 'gun', sutunlar: G.l, satirlar, gizliAd: 'doluluğu %75 altında',
      ust: { ton: dolu.length ? 'uyari' : 'tamam', simge: 'clock', metin, eylem }, lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '%50-75', 2: '%75-90', 3: '%90-98', 4: 'Tam dolu' }, oneri: 'Ek vardiya önerisi', simge: [['plus', 'Planlı ek vardiya'], ['target', 'Öneri']] },
      not: 'Hücre, günün açık saatlerinde tezgâhın dolu olduğu yüzdedir; boş hücre o gün vardiya olmadığını söyler.' };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const c = r.h[ck] || {}; const g = +String(ck).slice(1); const gAd = fmtDT(S.D, g * 24).slice(0, 9).trim();
    const sec = []; const F = [];
    if (c.on && c.on.length) { const z = c.on[0]; F.push({ id: 'karar', ad: 'Öneriyi kabul et', deg: { oneri: String(z.i), karar: 'kabul' }, etki: 'Ek vardiya plana girer; plan yeniden kurulunca kullanılır.', simge: 'flag' }); }
    const vard = (S.D.vardiyalar.find(v => !S.ekMesai.some(e => e.m === r.k && e.gun === g && e.vardiya === v.id)) || {}).id;
    if (vard) F.push({ id: 'ekle', ad: 'Ek vardiya aç', deg: { m: r.k, gun: gunTarih(g), vardiya: vard }, etki: `${r.k} ${gAd} günü ek vardiyayla açılır.`, simge: 'plus' });
    if (c.ek && c.ek.length) { const i = S.ekMesai.indexOf(c.ek[0]); if (i >= 0 && yetkili('veri.yaz')) sec.push({ ad: `${c.ek[0].vardiya} ek vardiyasını kaldır`, etki: 'Ek vardiya takvimden çıkar; plan yeniden kurulunca kullanılmaz.', act: 'mesai-sil', v: i, simge: 'trash' }); }
    if (!sdMsOneri() && yetkili('plan.yaz')) sec.push({ ad: 'Önerileri hesapla', etki: 'Plan gecikmeye yol açan tezgâhlarda ek vardiyayı tek tek dener ve kazancı ölçer.', act: 'ym-mesai-oner', simge: 'play' });
    const neden = c.on && c.on.length ? `${r.k} ${gAd}: ${c.etiket}. Plan bu günü denedi; ${c.on[0].x.vardiya} ek vardiyası gecikmeyi ${saat(c.on[0].x.dT)} azaltıyor.` : `${r.k} ${gAd}: ${c.etiket || 'vardiya yok'}.${c.kd >= 3 ? ' Tezgâh dolu; ek vardiya bekleyen işleri öne çeker.' : ''}`;
    return { baslik: `${r.k} · ${gAd}`, simge: 'clock', ton: c.kd >= 4 ? 'hata' : c.kd >= 3 ? 'uyari' : '', neden, formlar: F, secenekler: sec };
  },
};

/* ---------- Fason planı: fasoncu × gün ---------- */
ISI.fasonplan = {
  veri() {
    const f = tmFason(); const cx = cxAl(); if (!f || !cx || !S.plan) return { bos: 'Plan kurulunca fasona giden işler burada gün gün görünür.' };
    const G = isGunSut(f.now, 21); const FS = Object.values(cx.FS);
    const satirlar = FS.map(fs => {
      const L = f.L.filter(x => x.f && x.f.id === fs.id); const h = {}; let kotu = 0;
      for (const c of G.l) {
        const a = c.g * 24, b = a + 24; const ak = L.filter(x => x.r.S < b && (x.T ?? x.r.C) > a); if (!ak.length) continue;
        const kd0 = Math.max(...ak.map(x => { const t = tmFasonDurum(x)[1]; return t === 'hata' ? 4 : t === 'uyari' ? 2 : 1; }));
        const fazla = fs.kapasite != null && ak.length > fs.kapasite; const kd = fazla ? Math.max(kd0, 3) : kd0; kotu = Math.max(kotu, kd);
        const tah = ak.some(x => x.T == null);
        isHucre(h, c.k, { v: String(ak.length), kd, sm: fazla ? 'alert' : undefined, tahmin: tah ? 'fasoncu dönüş tarihi vermedi' : undefined, etiket: `${ak.length} iş fasoncuda${fs.kapasite != null ? ` (kapasite ${fs.kapasite})` : ''}`, ak });
      }
      return { k: fs.id, ad: fs.ad || fs.id, alt: `${L.length} iş · ${fs.sureGun ?? '—'} gün`, simge: 'truck', ton: kotu >= 4 ? 'hata' : kotu >= 2 ? 'uyari' : '', h, fs, L, kotu };
    }).sort((a, b) => b.kotu - a.kotu);
    const tah = f.L.filter(x => x.T == null).length; const gec = f.L.filter(x => tmFasonDurum(x)[1] === 'hata').length; const en = satirlar[0];
    const blok = en ? G.l.filter(c => (en.h[c.k] || {}).kd >= Math.max(en.kotu, 1)) : [];
    const metin = `${en && en.kotu >= 2 && blok.length ? `En sıcak blok ${en.ad}, ${blok[0].ad}${blok.length > 1 ? `–${blok[blok.length - 1].ad}` : ''}: ${en.h[blok[0].k].etiket}. ` : ''}${f.L.length} fason işinden ${gec} tanesi siparişi geciktiriyor, ${tah} tanesinin dönüş tarihi yok.`;
    return { baslik: 'Fasoncu × gün, kapasite ve gecikme', satirAd: 'Fasoncu', genis: 'gun', sutunlar: G.l, satirlar,
      ust: { ton: gec ? 'hata' : tah ? 'uyari' : 'tamam', simge: 'truck', metin }, lejant: { kd: [1, 2, 3, 4], kdAd: { 1: 'Zamanında', 2: 'Plandan geç', 3: 'Kapasite aşılıyor', 4: 'Siparişi geciktirir' }, tahmin: 'Dönüş tarihi yok', simge: [['alert', 'Kapasite aşımı']] },
      not: 'Hücredeki sayı o gün fasoncuda olan iş sayısıdır.' };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const c = r.h[ck] || {}; const ak = (c.ak || []).slice().sort((a, b) => (tmFasonDurum(a)[1] === 'hata' ? 0 : a.T == null ? 1 : 2) - (tmFasonDurum(b)[1] === 'hata' ? 0 : b.T == null ? 1 : 2));
    const gAd = fmtDT(S.D, +String(ck).slice(1) * 24).slice(0, 9).trim(); const x = ak[0];
    const neden = x ? `${r.ad} ${gAd}: ${c.etiket}. ${x.id} ${tmFasonDurum(x)[0].toLocaleLowerCase('tr')}; dönüş ${stkGun(x.T ?? x.r.C)}${x.T == null ? ' (tahmini)' : ''}, sonraki adım ${stkGun(x.ger)}.` : `${r.ad} ${gAd}: iş yok.`;
    return { baslik: `${r.ad} · ${gAd}`, simge: 'truck', ton: c.kd >= 4 ? 'hata' : c.kd >= 2 ? 'uyari' : '', neden, bilgi: ak.slice(0, 4).map(z => [z.id, `${tmFasonDurum(z)[0]} · dönüş ${stkGun(z.T ?? z.r.C)}`]),
      formlar: ak.slice(0, 3).map(z => ({ id: 'termin', ad: `${z.id} dönüş tarihi`, deg: { is: z.id }, etki: 'Girilen gün kesin süre sayılır; plan onu kullanır.', simge: 'flag' })),
      secenekler: x ? [{ ad: `${x.r.job} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: x.r.job, simge: 'gantt' }] : [] };
  },
};

/* ---------- Malzeme satın alma planı: malzeme × gün ---------- */
ISI.malzplan = {
  veri() {
    const v = sdMp(); if (!v || !S.plan) return { bos: 'Plan kurulunca malzemenin ne zaman gerektiği ve ne zaman sipariş verilmesi gerektiği burada görünür.' };
    const G = isGunSut(v.now, 21); const now = v.now;
    const satirlar = v.L.map(r => {
      const h = {}; const [d, ton] = v.durum(r); const tah = r.tm !== 'termin' ? (r.src == null ? 'sipariş verilmedi, tedarik süresine göre' : 'tedarikçi tarih vermedi') : undefined;
      const gel = r.etkin; const gec = gel != null && r.plan != null && gel > r.plan + 0.05; const kd = ton === 'hata' ? 4 : 2;
      if (r.src != null && gel != null) for (let g = G.g0; g <= Math.min(isGun(gec ? r.plan : gel) - (gec ? 0 : 1), G.g0 + G.n - 1); g++) isHucre(h, 'g' + g, { is: 1, etiket: 'yolda' });
      if (gec) for (let g = Math.max(isGun(r.plan), G.g0); g <= Math.min(isGun(gel), G.g0 + G.n - 1); g++) isHucre(h, 'g' + g, { kd, tahmin: tah, etiket: 'eksik' });
      if (r.src == null && r.siparisGun != null) { const gc = r.siparisGun < now; isHucre(h, 'g' + G.kis(isGun(r.siparisGun)), { kd: gc ? 4 : 1, sm: gc ? 'alert' : 'clock', v: gc ? 'geçti' : 'son', etiket: `en geç sipariş günü ${stkGun(r.siparisGun)}${gc ? ' (geçti)' : ''}` }); }
      if (gel != null) isHucre(h, 'g' + G.kis(isGun(gel)), { sm: 'box', iyi: gec ? undefined : 1, kd: gec ? kd : undefined, tahmin: tah, v: gec ? `+${Math.ceil((gel - r.plan) / 24)}g` : '', etiket: `geliş ${stkGun(gel)}` });
      if (r.plan != null) isHucre(h, 'g' + G.kis(isGun(r.plan)), { bayrak: 1, v: gec || r.src == null ? sdMpMiktar(Math.ceil(r.miktar), r.kod) : undefined, etiket: `plan ${stkGun(r.plan)} istiyor, ${sdMpMiktar(Math.ceil(r.miktar), r.kod)}` });
      return { k: r.kod + (r.src != null ? '-' + r.src : ''), ad: r.kod, alt: `${(v.mats[r.kod] || {}).ad || ''} · ${d}`, simge: 'box', ton: ton === 'tamam' ? 'tamam' : ton, gizli: ton === 'tamam', h, r, d };
    }).sort((a, b) => GV_SIRA[a.ton === 'tamam' ? 'tamam' : a.ton === 'hata' ? 'hata' : 'uyari'] - GV_SIRA[b.ton === 'tamam' ? 'tamam' : b.ton === 'hata' ? 'hata' : 'uyari']);
    const sor = satirlar.filter(r => r.ton === 'hata'); const en = sor[0];
    const metin = `${en ? `En sıcak satır ${en.ad}: ${en.d.toLocaleLowerCase('tr')}, plan ${stkGun(en.r.plan)} istiyor${en.r.etkin != null ? `, geliş ${stkGun(en.r.etkin)}` : ''}. ` : ''}${v.yeni.length} malzeme için sipariş verilmedi, ${sor.length} malzeme işi geciktirebilir${v.tutar != null && agFiyatGorur() ? `; açık alım ${agTL(v.tutar)}` : ''}.`;
    return { baslik: 'Malzeme × gün, stok yetiyor mu', satirAd: 'Malzeme', genis: 'gun', sutunlar: G.l, satirlar, gizliAd: 'karşılananlar',
      ust: { ton: sor.length ? 'hata' : v.yeni.length ? 'uyari' : 'tamam', simge: 'box', metin }, lejant: { kd: [1, 2, 4], kdAd: { 1: 'Son sipariş günü', 2: 'Eksik', 4: 'İşi geciktirir' }, is: 'Yolda', iyi: 'Zamanında geliş', tahmin: 'Tahmini geliş', bayrak: 'Plan istiyor (miktar)' } };
  },
  acilim(V, rk) {
    const row = isBul(V, rk); if (!row) return null; const r = row.r; const v = sdMp();
    const neden = r.src == null ? `${r.kod} için sipariş verilmedi; plan ${stkGun(r.plan)} günü ${sdMpMiktar(Math.ceil(r.miktar), r.kod)} istiyor.${r.siparisGun != null ? ` Zamanında gelmesi için en geç ${sdGunYaz(r.siparisGun)} sipariş verilmeli.` : ''}`
      : `${r.kod} ${row.d.toLocaleLowerCase('tr')}: plan ${stkGun(r.plan)} istiyor, geliş ${stkGun(r.etkin)}${r.tm !== 'termin' ? ' (tedarikçi tarih vermedi)' : ''}.`;
    const F = r.src == null ? (v.yeni.some(z => z.kod === r.kod) ? [{ id: 'siparis', ad: 'Sipariş ver', deg: { kod: [r.kod] }, etki: 'Miktar plandan gelir; tedarikçi ve termin seçilir.', simge: 'truck' }] : [])
      : [{ id: 'termin', ad: 'Geliş tarihini gir', deg: { po: String(r.src) }, etki: 'Girilen gün kesin süre sayılır; durum hemen yeniden hesaplanır.', simge: 'flag' }];
    const sec = [];
    if (r.src == null && stkYaz()) sec.push({ ad: 'Tek tıkla sipariş ver', etki: 'Kendi tedarikçisinden, termin beklenerek sipariş açılır.', act: 'tm-ver', v: r.kod, simge: 'truck' });
    if ((r.jobs || [])[0]) sec.push({ ad: `${r.jobs[0]} çizelgede`, etki: 'Bu malzemeyi bekleyen siparişin adımlarını gösterir.', act: 'siparis-cizelge', v: r.jobs[0], simge: 'gantt' });
    return { baslik: `${r.kod} · ${row.d}`, simge: 'box', ton: row.ton === 'tamam' ? '' : row.ton, neden, bilgi: [['Gerekli', stkGun(r.plan)], ['Geliş', stkGun(r.etkin)], ['Miktar', sdMpMiktar(Math.ceil(r.miktar), r.kod)], ['Bağlı siparişler', (r.jobs || []).join(', ')]], formlar: F, secenekler: sec };
  },
};

/* ---------- Termin ve kâr: sipariş × termin uzatma senaryosu ---------- */
const IS_UZ = [0, 1, 2, 3, 5];
ISI.denge = {
  veri() {
    const p = S.plan; if (!p) return { bos: 'Plan kurulunca geç biten siparişler ve termin uzatmasının etkisi burada görünür.' };
    const fg = agFiyatGorur(); const ML = fg ? isSipMal() || [] : [];
    let L = S.D.siparisler.filter(s => !s.havuz && p.J[s.id] && parseT(S.D, s.termin) != null).map(s => ({ s, T: p.J[s.id].T, C: p.J[s.id].C }));
    const gec = L.filter(z => z.T > 0.05); const yalnizGec = gec.length > 0;
    L = (yalnizGec ? gec : L).sort((a, b) => (b.T ?? 1e9) - (a.T ?? 1e9) || (a.C ?? 0) - (b.C ?? 0)).slice(0, 12);
    const sutunlar = [...IS_UZ.map(d => ({ k: 'u' + d, ad: d ? `+${d} gün` : 'Şimdi', alt: d ? 'uzatma' : 'plan' })), ...(fg ? [{ k: 'kar', ad: 'Kâr', alt: 'şimdi' }] : [])];
    const satirlar = L.map(({ s, T, C }) => {
      const h = {};
      for (const d of IS_UZ) { if (T == null) { isHucre(h, 'u' + d, { kd: 4, sm: 'alert', v: '!', etiket: 'plana sığmadı' }); continue; }
        const k = Math.max(0, T - d * 24); isHucre(h, 'u' + d, k > 0.05 ? { kd: isKdSaat(k), v: isSure(k), etiket: `${saat(k)} geç kalır` } : { iyi: 1, sm: 'check', etiket: 'zamanında' }); }
      if (fg) { const m = (ML.find(z => z.s.id === s.id) || {}).m; const v = m ? m.net ?? m.kar : null; isHucre(h, 'kar', v == null ? { sm: 'alert', v: '?', etiket: 'kâr hesaplanamıyor' } : { v: isTL(v), kd: v < 0 ? 4 : undefined, iyi: v >= 0 ? 1 : undefined, etiket: `net ${agTL(v)}` }); }
      return { k: s.id, ad: s.id, alt: `termin ${stkGun(parseT(S.D, s.termin))} · ${urunAd(s.urun)}`, simge: 'flag', ton: T == null || T >= 24 ? 'hata' : T > 0.05 ? 'uyari' : '', h, s, T, C };
    });
    const en = satirlar[0]; const kurt = en && en.T != null ? IS_UZ.find(d => en.T - d * 24 <= 0.05) : null;
    const metin = !yalnizGec ? `Geç biten sipariş yok; termine en yakın ${satirlar.length} sipariş gösteriliyor.` : `En sıcak satır ${en.ad}: şimdiki planda ${en.T == null ? 'plana sığmadı' : `${saat(en.T)} geç`}. ${kurt != null ? `${kurt} gün uzatma gecikmeyi kapatıyor.` : 'Beş günlük uzatma da yetmiyor.'} ${gec.length} sipariş geç.`;
    return { baslik: 'Sipariş × termin uzatması, kalan gecikme', satirAd: 'Sipariş', genis: 'kalem', sutunlar, satirlar,
      ust: { ton: yalnizGec ? 'uyari' : 'tamam', simge: 'gauge', metin, eylem: yalnizGec && !calisan ? dugme('Uzatma etkisini motorla ölç', 'pd-uzat', { kucuk: true, simge: 'play' }) : '' },
      lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '8 saatten az', 2: 'Bir güne kadar', 3: 'Üç güne kadar', 4: 'Üç günden çok' }, iyi: 'Zamanında' },
      not: 'Uzatma sütunları kalan gecikmeyi şimdiki plandan hesaplar (gecikme eksi uzatma); diğer siparişlerin yeniden yerleşmesi motorla ölçülünce görünür.' };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const d = ck === 'kar' ? 2 : +String(ck).slice(1) || 1; const c = r.h[ck] || {};
    const neden = r.T == null ? `${r.ad} plana sığmadı; uzatma tek başına yetmeyebilir.` : ck === 'kar' ? `${r.ad} ${c.etiket}; şimdiki planda ${r.T > 0.05 ? saat(r.T) + ' geç' : 'zamanında'}.` : `${r.ad} şimdi ${r.T > 0.05 ? saat(r.T) + ' geç' : 'zamanında'}; ${d} gün uzatmayla ${c.etiket}.`;
    return { baslik: `${r.ad} · ${(V.sutunlar.find(x => x.k === ck) || {}).ad || ''}`, simge: 'gauge', ton: c.kd >= 4 ? 'hata' : c.kd >= 2 ? 'uyari' : '', neden,
      formlar: [{ id: 'uzat', ad: `Termini ${d} gün uzat`, deg: { sip: r.ad, gun: String(d) }, etki: 'Müşterinin kabul ettiği uzatma termine yazılır.', simge: 'flag' }],
      secenekler: [...(!calisan ? [{ ad: 'Uzatma etkisini motorla ölç', etki: 'Her siparişe uzatmayı tek tek dener, diğerlerinin yeniden yerleşmesiyle ölçer.', act: 'pd-uzat', simge: 'play' }] : []),
        { ad: `${r.ad} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: r.ad, simge: 'gantt' }] };
  },
};

/* ---------- Yıllık plan: tezgâh grubu × dönem ---------- */
ISI.yillik = {
  veri() {
    const o = stkYlOzet(); const yaz = yetkili('plan.kilitle');
    if (!o) return { bos: U.yl && U.yl.durum === 'calisiyor' ? 'Yıllık plan hesaplanıyor.' : 'Yıllık plan henüz hesaplanmadı; hesaplanınca tezgâh gruplarının dönem dönem doluluğu burada görünür.', bosSimge: 'chart',
      bosEylem: yaz ? dugme('Yıllık planı çöz', 'yl-coz', { kucuk: true, birincil: true, simge: 'cpu' }) : '' };
    const { v, P, sonuc } = U.yl;
    const sutunlar = P.map((x, i) => ({ k: 'p' + i, ad: x.ad, alt: x.tur === 'hafta' ? 'hafta' : x.tur === 'ay' ? 'ay' : '', uzun: x.uzun }));
    const satirlar = v.gruplar.map(g => {
      const h = {}; let mx = 0;
      sonuc.grup[g].forEach((x, i) => { if (!(x.kap > 0)) { if (x.yuk > 0) isHucre(h, 'p' + i, { kd: 4, sm: 'alert', v: '!', etiket: 'kapasite yok, yük var', x }); return; }
        const pct = x.yuk / x.kap * 100; mx = Math.max(mx, pct);
        isHucre(h, 'p' + i, { v: `${Math.round(pct)}`, kd: x.e > 0.5 ? 4 : isKdOran(pct, [50, 75, 90, 100]), sm: x.e > 0.5 ? 'alert' : x.o > 0.5 ? 'clock' : undefined, etiket: `%${Math.round(pct)} dolu (${saat(x.yuk)} / ${saat(x.kap)})${x.o > 0.5 ? `, ${saat(x.o)} ek mesai` : ''}${x.e > 0.5 ? `, ${saat(x.e)} karşılanamıyor` : ''}`, x }); });
      return { k: g, ad: IS_GRUP(g), alt: v.sinir && v.sinir[g] === 'kisi' ? 'kişi sınırlı' : 'tezgâh sınırlı', simge: 'layers', ton: mx >= 100 ? 'hata' : mx >= 90 ? 'uyari' : '', h, mx };
    }).sort((a, b) => b.mx - a.mx);
    const en = satirlar[0]; const blok = en ? sutunlar.filter(c => (en.h[c.k] || {}).kd >= Math.min(4, isKdOran(en.mx, [50, 75, 90, 100]))) : [];
    const metin = `${en ? `En sıcak blok ${en.ad}, ${blok.length ? `${blok[0].ad}${blok.length > 1 ? `–${blok[blok.length - 1].ad}` : ''}` : ''}: en çok %${Math.round(en.mx)} dolu. ` : ''}${o.acil > 0.5 ? `${saat(o.acil)} yük karşılanamıyor` : 'Bütün yük karşılanıyor'}${o.mesai > 0.5 ? `, ${saat(o.mesai)} ek mesai gerekiyor` : ''}.`;
    return { baslik: 'Tezgâh grubu × dönem, kapasite kullanımı', satirAd: 'Tezgâh grubu', genis: 'donem', sutunlar, satirlar,
      ust: { ton: o.acil > 0.5 ? 'hata' : o.mesai > 0.5 ? 'uyari' : 'tamam', simge: 'chart', metin, eylem: yaz ? dugme('Yeniden çöz', 'yl-coz', { kucuk: true, simge: 'cpu' }) : '' },
      lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '%50-75', 2: '%75-90', 3: '%90-100', 4: 'Kapasite aşılıyor' }, simge: [['clock', 'Ek mesai'], ['alert', 'Karşılanamıyor']] } };
  },
  acilim(V, rk, ck) {
    const r = isBul(V, rk); if (!r) return null; const c = r.h[ck] || {}; const P = U.yl.P[+String(ck).slice(1)] || {};
    return { baslik: `${r.ad} · ${P.uzun || P.ad || ''}`, simge: 'chart', ton: c.kd >= 4 ? 'hata' : c.kd >= 3 ? 'uyari' : '', neden: `${r.ad} ${P.uzun || ''}: ${c.etiket}. ${c.kd >= 3 ? 'Kapasite sınırı ve ek mesai sınırı varsayımlardan gelir.' : 'Kapasite yetiyor.'}`,
      formlar: [{ id: 'varsayim', ad: 'Kapasite varsayımları', deg: {}, adim: 1, etki: 'Ek mesai sınırı ve yeni tezgâh önerisi değişir; yıllık plan yeniden çözülür.', simge: 'gear' }],
      secenekler: [{ ad: 'Yıllık planı yeniden çöz', etki: 'Son varsayımlarla bütün dönemleri yeniden hesaplar.', act: 'yl-coz', simge: 'cpu' }] };
  },
};

/* ---------- Sevkiyat: sipariş × gün, termine kalan süre ---------- */
ISI.sevkiyat = {
  veri() {
    const x = stkSv(); if (!x || !S.plan) return { bos: 'Plan kurulunca siparişlerin sevk günleri burada görünür.' };
    const G = isGunSut(x.v.now, 21); const sv = S.sevkEdildi || {};
    const satirlar = [...x.l].sort((a, b) => ((a.due ?? 1e12) - a.C) - ((b.due ?? 1e12) - b.C)).map(z => {
      const h = {}; const gec = z.T > 0.05; const ev = sv[z.s.id] && sv[z.s.id].t;
      if (z.due != null && gec) for (let g = Math.max(isGun(z.due), G.g0); g <= Math.min(isGun(z.C), G.g0 + G.n - 1); g++) isHucre(h, 'g' + g, { kd: isKdSaat(z.T), etiket: 'termin geçti' });
      if (ev) { const t = parseT(S.D, ev) ?? (gunIndeks(ev) * 24); isHucre(h, 'g' + G.kis(isGun(t)), { sm: 'check', iyi: 1, etiket: `sevk edildi ${ev}` }); }
      else isHucre(h, 'g' + G.kis(isGun(z.C)), { sm: 'truck', iyi: gec ? undefined : 1, kd: gec ? isKdSaat(z.T) : undefined, v: gec ? '+' + isSure(z.T) : '', etiket: `plan ${stkGun(z.C)} sevke hazır${gec ? `, ${saat(z.T)} geç` : ''}` });
      if (z.due != null) isHucre(h, 'g' + G.kis(isGun(z.due)), { bayrak: 1, etiket: `termin ${stkGun(z.due)}` });
      return { k: z.s.id, ad: z.s.id, alt: `${z.mu || ''} · ${sayi(z.s.adet, 0)} adet`, simge: 'truck', ton: ev ? 'tamam' : gec ? (z.T >= 24 ? 'hata' : 'uyari') : 'tamam', gizli: !gec && !ev && z.due != null && z.due - z.C >= 72, h, z, ev };
    });
    const iki = x.l.filter(z => z.C < x.v.now + 14 * 24); const zam = iki.filter(z => !(z.T > 0.05)); const en = satirlar.find(r => r.z.T > 0.05);
    const metin = `${en ? `En sıcak satır ${en.ad}: termin ${stkGun(en.z.due)}, plan ${stkGun(en.z.C)} diyor. ` : ''}Önümüzdeki iki haftadaki ${iki.length} sevkin ${zam.length} tanesi zamanında; ${x.hazir.length} sipariş sevke hazır.`;
    return { baslik: 'Sipariş × gün, termine kalan süre', satirAd: 'Sipariş', genis: 'gun', sutunlar: G.l, satirlar, gizliAd: 'termine üç günden çok pay',
      ust: { ton: x.gec.length ? 'uyari' : 'tamam', simge: 'truck', metin }, lejant: { kd: [1, 2, 3, 4], kdAd: { 1: '8 saatten az geç', 2: 'Bir güne kadar', 3: 'Üç güne kadar', 4: 'Üç günden çok' }, iyi: 'Zamanında / sevk edildi', bayrak: 'Termin', simge: [['truck', 'Sevke hazır'], ['check', 'Sevk edildi']] } };
  },
  acilim(V, rk) {
    const r = isBul(V, rk); if (!r) return null; const z = r.z;
    const neden = r.ev ? `${z.s.id} ${r.ev} sevk edildi.` : `${z.s.id} termini ${stkGun(z.due)}, plan ${stkGun(z.C)} sevke hazır diyor${z.T > 0.05 ? `: ${saat(z.T)} geç` : z.due != null ? `; ${saat(z.due - z.C)} pay var` : ''}.`;
    return { baslik: `${z.s.id} · ${z.mu || ''}`, simge: 'truck', ton: r.ton === 'tamam' ? '' : r.ton, neden, bilgi: [['Termin', stkGun(z.due)], ['Hazır', stkGun(z.C)], ['Adet', sayi(z.s.adet, 0)]],
      formlar: [{ id: 'sevk', ad: r.ev ? 'Sevk tarihini değiştir' : 'Sevk edildi olarak işaretle', deg: { sip: z.s.id }, etki: 'Gönderilen sipariş listeden düşer.', simge: 'truck' }],
      secenekler: [{ ad: `${z.s.id} çizelgede`, etki: 'Siparişin adımlarını tezgâh çizelgesinde gösterir.', act: 'siparis-cizelge', v: z.s.id, simge: 'gantt' }] };
  },
};
