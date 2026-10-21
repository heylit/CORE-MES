/* ---------- Tahta içi: her şey tahtanın üstünde ----------
   Sabit yan panel ve alt raf yoktur. Seçilen tezgâh, sipariş ya da iş adımının kartı tahtada, o nesnenin hemen yanında açılır;
   hamleler o kartta yapılır, resim aynı anda değişir. Siparişler, kuyruklar, senaryolar, hesaplar gibi okumalar tahtaya
   bırakılan kartlardır: tahtayla birlikte kayar, tutulup taşınır, küçültülür, kapatılır. Etki ve geri alma tahtanın üstünde
   tek satırdır. Telefonda kartlar tahtanın altından açılır. */
const TK_TUR = {
  plan: ['Plan', 'target', () => kmPlan(), 360],
  siparis: ['Siparişler', 'list', p => mzSiparis(p), 560],
  kuyruk: ['Kuyruklar', 'sort', p => mzKuyruk(p), 620],
  senaryo: ['Senaryolar', 'layers', p => mzSenaryo(p), 520],
  kisit: ['Kısıt ve veri', 'gear', () => mzKisit(), 540],
  hesap: ['Hesaplar', 'chart', p => mzHesap(p), 520],
  etki: ['Ne neyi etkiliyor', 'scan', p => mzAg(p), 640],
  rota: ['Reçete ve Rota', 'tool', p => rtKart(p), 500],
};
const TK = { tut: null };
/* kartların tahta ölçüsü sabit bir yakınlığa göredir; böylece her kartın tahtada belli bir yeri ve boyu olur */
const TK_KREF = 0.5;
/* kartın tahtada ayrılan en büyük boyu (ekran pikseli, yakınlık 0,5'te) */
const TK_BOY = { plan: 520, siparis: 480, kuyruk: 480, senaryo: 480, kisit: 520, hesap: 480, etki: 480, rota: 680 };
(function () { try { const x = JSON.parse(localStorage.getItem(ANAHTAR + '-tk') || 'null'); if (x && Array.isArray(x.l)) U.tkKart = x.l.filter(k => TK_TUR[k.tur]); } catch (e) { /* tarayıcı belleği kapalı olabilir */ } })();
function tkKaydet() { try { localStorage.setItem(ANAHTAR + '-tk', JSON.stringify({ l: U.tkKart || [] })); } catch (e) { /* yok */ } }
const tkDar = () => innerWidth < 600;

/* yeni kart ekranın görünen boş yerine bırakılır; dünya koordinatında durur, tahtayla kayar */
function tkAc(tur) {
  U.tkKart = U.tkKart || []; const var0 = U.tkKart.find(k => k.tur === tur);
  const W = AT.boyut ? AT.boyut[0] : 1000, H = AT.boyut ? AT.boyut[1] : 700; const w = TK_TUR[tur][3];
  /* görünmeyen yerde kalmış kart ekrana getirilir */
  if (var0) { var0.kucuk = false; if (AT.kam) { const [ex, ey] = atEk(var0.x, var0.y); if (ex < -w / 2 || ex > W - 80 || ey < 0 || ey > H - 80) { [var0.x, var0.y] = atDunya(Math.max(16, W - w - 24), 96); var0.k = AT.kam.k; } }
    U.tkKart = [...U.tkKart.filter(k => k !== var0), var0]; tkKaydet(); render(); return; }
  const n = U.tkKart.length;
  const sx = Math.max(16, W - w - 24 - n * 28), sy = 96 + n * 28; const [x, y] = AT.kam ? atDunya(sx, sy) : [0, 0];
  U.tkKart.push({ tur, x, y, k: AT.kam ? AT.kam.k : 1, kucuk: false }); tkKaydet(); render();
}
function tkKapat(tur) { U.tkKart = (U.tkKart || []).filter(k => k.tur !== tur); tkKaydet(); render(); }

/* seçim kartı: neyin seçildiğine göre sekmeli; tezgâh için yön ver, sıra, takvim; sipariş için yön ver, rota */
function tkSecim(p) {
  const op = U.gySec && S.plan.ops[U.gySec] ? U.gySec : null; const sj = mzSecJobEski(); const s = atSahne();
  let tur = null, ank = null, sek = [], govde = '';
  if (op) { tur = 'is'; ank = S.plan.ops[op].m; govde = kmIs(op); }
  else if (sj && s.byJ[sj]) { tur = 'siparis'; const l = s.byJ[sj]; const t = rsT(); const r = l.find(x => x.C > t) || l[l.length - 1]; ank = r && r.m;
    sek = [['yon', 'Yön ver'], ['rota', 'Rota']]; const k = sek.some(x => x[0] === U.tkSek) ? U.tkSek : 'yon'; govde = k === 'rota' ? mzRota(p) : kmSiparis(sj); }
  else if (U.rsTez && s.ist[U.rsTez]) { tur = 'tezgah'; ank = U.rsTez;
    sek = [['yon', 'Yön ver'], ['takvim', 'Takvim']]; const k = sek.some(x => x[0] === U.tkSek) ? U.tkSek : 'yon'; govde = k === 'takvim' ? mzTakvim() : kmTezgah(U.rsTez); }
  if (!tur || !ank || !s.ist[ank]) return '';
  const k = sek.some(x => x[0] === U.tkSek) ? U.tkSek : 'yon';
  return `<section class="pm-tk-kart pm-tk-secim" data-ank="${esc(ank)}" aria-label="Seçim kartı">
    ${sek.length ? `<div class="pm-tk-sek" role="tablist">${sek.map(([id, ad]) => `<button type="button" role="tab" data-act="tk-sek" data-v="${id}" aria-selected="${k === id}">${esc(ad)}</button>`).join('')}</div>` : ''}
    <div class="pm-tk-govde pm-km" data-k="secim-${tur}-${k}">${govde}</div></section>`;
}
function tkKartHtml(p, k, i) {
  const [ad, sm, f, w] = TK_TUR[k.tur];
  return `<section class="pm-tk-kart pm-tk-pano" data-tur="${k.tur}" data-i="${i}" ${k.kucuk ? 'data-kucuk' : ''} style="--w:${w}px" aria-label="${esc(ad)}">
    <header class="pm-tk-bas" title="Tutup tahtada taşıyın">${ic(sm, 'k')}<b>${esc(ad)}</b><span class="pm-sira-ara"></span>${dugme('', 'tk-kucult', { kucuk: true, hayalet: true, simge: k.kucuk ? 'expand' : 'minus', ad: k.kucuk ? 'Aç' : 'Küçült', veri: `data-v="${k.tur}"` })}${dugme('', 'tk-kapat', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kartı kapat', veri: `data-v="${k.tur}"` })}</header>
    ${k.kucuk ? '' : `<div class="pm-tk-govde" data-k="${k.tur}">${f(p)}</div>`}</section>`;
}
/* tahtanın üstünde tek satır: tabana göre etki ve son adımın geri alınması */
function tkHud() {
  const a = U.taslak && U.taslak.adimlar; const x = a && a[a.length - 1];
  const onz = U.hamle && !U.taslak ? `<span class="pm-tk-onz">${ic('eye', 'k')}<b>Önizleme:</b> ${esc(U.hamle.ad)}</span>${dugme('Uygula', 'hamle-uygula', { kucuk: true, birincil: true, simge: 'check' })}${dugme('Vazgeç', 'hamle-vazgec', { kucuk: true, hayalet: true })}` : '';
  const son = x ? `<span class="pm-tk-son" title="${esc(x.ad)}">${ic('layers', 'k')}<b>${a.length}</b> değişiklik · son: ${esc(x.ad)}</span>${dugme('Geri al', 'taslak-don', { kucuk: true, simge: 'rotate', veri: `data-v="${a.length - 1}"` })}${x.o1.wT > x.o0.wT + 0.05 ? dugme('Toparla', 'km-toparla', { kucuk: true, simge: 'bolt', yetki: 'plan.yaz' }) : ''}` : '';
  return `<div class="pm-tk-hud">${onz || son}${mzEtki()}</div>`;
}
function tkEkle() {
  return `<div class="pm-tk-ekle" role="group" aria-label="Tahtaya aç">${Object.entries(TK_TUR).map(([id, [ad, sm]]) => `<button type="button" class="tc-dugme tc-dugme-kucuk" data-act="tk-ac" data-v="${id}" aria-pressed="${(U.tkKart || []).some(k => k.tur === id)}" title="${esc(ad)}: tahtaya aç">${ic(sm, 'k')}<span>${esc(ad)}</span></button>`).join('')}</div>`;
}
function tkKatman(p) {
  const l = U.tkKart || [];
  const kartlar = tkDar() ? (tkSecim(p) || (l.length ? tkKartHtml(p, l[l.length - 1], l.length - 1) : '')) : l.map((k, i) => tkKartHtml(p, k, i)).join('') + tkSecim(p);
  return `${tkHud()}<div class="pm-tk-katman" id="tk-katman">${kartlar}</div>`;
}

/* kartlar her karede kameraya göre yerleşir: tahtayla birlikte kayarlar */
function tkKonumla() {
  const kat = document.getElementById('tk-katman'); if (!kat || !AT.kam) return;
  const ustE = document.querySelector('.pm-at-ust'), altE = document.querySelector('.pm-at-alt');
  const hudE = document.querySelector('.pm-tk-hud'); const hud = hudE && hudE.offsetHeight ? hudE.offsetHeight + 4 : 0;
  const ust = (ustE ? ustE.offsetHeight : 0) + hud, alt = altE ? altE.offsetHeight : 0;
  if (tkDar()) { const H0 = (kat.parentElement || kat).clientHeight; for (const el of kat.children) { el.style.bottom = `${alt + 8}px`; el.style.maxHeight = `${Math.max(180, Math.min(H0 * 0.6, H0 - ust - alt - 16))}px`; } return; }
  const W = kat.clientWidth, H = kat.clientHeight; const s = atSahne(); if (!AT.kam) return; const k = AT.kam.k;
  for (const el of kat.children) {
    let sx, sy;
    if (el.dataset.ank) { const a = s.ist[el.dataset.ank]; if (!a) continue; const [x, y] = atEk(a.x, a.y); sx = x + AT_KW / 2 * k + 14; sy = y - AT_KH / 2 * k;
      const sol = sx + el.offsetWidth > W - 8; if (sol) sx = x - AT_KW / 2 * k - 14 - el.offsetWidth; el.toggleAttribute('data-sol', sol); }
    else {
      /* tahtanın parçası: tahtayla kayar ve yakınlaşmayla büyüyüp küçülür; okunurluk için ölçek sınırlı */
      const c = (U.tkKart || [])[+el.dataset.i]; if (!c) continue; c.k = TK_KREF; [sx, sy] = atEk(c.x, c.y);
      const o = Math.min(1.4, k / c.k); el.style.setProperty('--o', o.toFixed(3)); el.toggleAttribute('data-uzak', o < 0.55);
      el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) scale(${o.toFixed(3)})`;
      /* kartın görünen kısmı altta kalmasın: boyu ekranın kalanına göre kısalır, tahtadaki yeri değişmez */
      const tam = (TK_BOY[c.tur] || 480); el.style.maxHeight = `${Math.round(Math.max(200, Math.min(tam, sy > ust ? (H - alt - 8 - sy) / o : tam)))}px`; continue;
    }
    const rayE = document.querySelector('.pm-tk-ray'); const sol0 = rayE ? rayE.offsetWidth + 24 : 8;
    sx = Math.max(sol0, Math.min(W - Math.min(el.offsetWidth, W - 16) - 8, sx)); sy = Math.max(ust + 4, Math.min(H - alt - 48, sy));
    el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    el.style.maxHeight = `${Math.max(160, H - sy - alt - 8)}px`;
  }
}
const tkCizEski = atCiz;
atCiz = function () { const r = tkCizEski.apply(this, arguments); tkKonumla(); return r; };

/* kart başlığından tutup taşıma; tahta koordinatına yazılır */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.pm-tk-bas'); if (!b || e.target.closest('button') || tkDar()) return;
  const el = b.parentElement; const c = (U.tkKart || [])[+el.dataset.i]; if (!c || !AT.kam) return; e.preventDefault();
  const x0 = e.clientX, y0 = e.clientY, cx = c.x, cy = c.y; el.dataset.tut = '1';
  U.tkKart = [...U.tkKart.filter(k => k !== c), c]; el.parentElement.appendChild(el); el.dataset.i = U.tkKart.length - 1;
  [...el.parentElement.querySelectorAll('.pm-tk-pano')].forEach(x => { const t = x.dataset.tur; x.dataset.i = U.tkKart.findIndex(k => k.tur === t); });
  const hareket = ev => { c.x = cx + (ev.clientX - x0) / AT.kam.k; c.y = cy + (ev.clientY - y0) / AT.kam.k; tkKonumla(); };
  /* yeniden çizim başlığı değiştirebilir; dinleyiciler pencerede durur */
  const bit = () => { removeEventListener('pointermove', hareket); removeEventListener('pointerup', bit); removeEventListener('pointercancel', bit); const g = document.querySelector(`.pm-tk-pano[data-tur="${c.tur}"]`); if (g) delete g.dataset.tut; if (typeof tkCozus === 'function') tkCozus(c); tkKaydet(); tkKonumla(); };
  addEventListener('pointermove', hareket); addEventListener('pointerup', bit); addEventListener('pointercancel', bit);
});

/* ---------- bağlama: panel ve raf yerine tahta katmanı ---------- */
kmAside = function () { return AT.kilavuz ? `<aside class="pm-at-kart" aria-label="Kılavuz">${atKart()}</aside>` : ''; };
mzRaf = function () { return ''; };
const tkAtEski = sAtolye;
sAtolye = function (p) {
  let h = tkAtEski(p);
  h = h.replace('<div class="pm-at-arac">', `<div class="pm-at-arac">${tkEkle()}`);
  const i = h.lastIndexOf('</div>'); return h.slice(0, i) + tkKatman(p) + h.slice(i);
};
const tkTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  switch (act) {
    case 'tk-ac': if ((U.tkKart || []).some(k => k.tur === v) && el && el.getAttribute('aria-pressed') === 'true') tkKapat(v); else tkAc(v); return true;
    case 'tk-kapat': tkKapat(v); return true;
    case 'tk-kucult': { const c = (U.tkKart || []).find(k => k.tur === v); if (c) { c.kucuk = !c.kucuk; tkKaydet(); render(); } return true; }
    case 'tk-sek': U.tkSek = v; render(); return true;
    case 'mz-raf': tkAc(v === 'kisit' || TK_TUR[v] ? v : 'siparis'); return true;
    case 'mz-degisen': U.mzSipF = 'degisen'; tkAc('siparis'); return true;
    case 'mz-kisit-git': U.mzKisitVurgu = v; tkAc('kisit'); return true;
    case 'at-git-tez': case 'at-sip': case 'km-is': U.tkSek = null; break;
  }
  return tkTekEski(act, v, el, e);
};
/* kart içi kaydırma yeri yeniden çizimde korunur */
const tkRenderEski = render;
render = function () {
  const yer = {}; for (const g of document.querySelectorAll('.pm-tk-govde[data-k]')) yer[g.dataset.k] = [g.scrollTop, (g.querySelector('.pm-mz-tablo, .pm-mz-kolonlar') || {}).scrollLeft || 0];
  tkRenderEski();
  for (const g of document.querySelectorAll('.pm-tk-govde[data-k]')) { const y = yer[g.dataset.k]; if (!y) continue; g.scrollTop = y[0]; const t = g.querySelector('.pm-mz-tablo, .pm-mz-kolonlar'); if (t) t.scrollLeft = y[1]; }
  tkKonumla();
};
