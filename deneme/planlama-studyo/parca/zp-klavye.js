/* ---------- Klavyeyle düzenleme: tek Düzenle menüsü, Değişiklikler, kısayol listesi ----------
   Plan pek çok yerden değişebiliyordu (sürükle, sağ tık, kuyruk okları, merkez, palet, havuz, stüdyolar); hepsi aynı hamleye
   ve aynı değişiklik listesine iner. Burada her görünümde aynı menü açılır: seçili işe, siparişe ya da tezgâha göre
   numaralı komutlar. Sayıya basmak komutu çalıştırır; Düzenle açıkken oklar işi saatte ve tezgâhta kaydırır. */
U.kbPan = null; U.kbAlt = null;
const kbTez = m => m && m[0] === '@' ? 'fason ' + m.slice(1) : m;
/* Menü en son seçilen şeyi düzenler: iş adımı, sipariş ya da tezgâh. Eski bir seçim arkada kalsa da son dokunulan öne geçer;
   üstteki hedef düğmeleri (Tab) hedefi açıkça değiştirir. */
U.kbSon = null; U.kbHedef = null; let kbOnceki = {};
function kbSecimIzle() {
  const n = { is: U.gySec || null, sip: U.secJob || null, tez: U.rsTez || U.tbTez || null };
  for (const k of ['is', 'sip', 'tez']) if (n[k] && n[k] !== kbOnceki[k]) U.kbSon = k;
  if (U.kbSon && !n[U.kbSon]) U.kbSon = null;
  kbOnceki = n;
}
function kbSipIsi(job) {
  const now = rsSimdi(); const l = Object.values(S.plan.ops).filter(r => r.job === job && isFinite(r.S) && !r.done).sort((a, b) => a.S - b.S);
  return l.find(x => !x.act && x.S >= now) || l.find(x => !x.act) || l[0] || null;
}
function kbHedefler() {
  const p = S.plan; if (!p) return []; const l = [];
  if (U.gySec && p.ops[U.gySec]) l.push({ tur: 'is', r: p.ops[U.gySec] });
  if (U.secJob && !(U.gySec && p.ops[U.gySec] && p.ops[U.gySec].job === U.secJob)) { const r = kbSipIsi(U.secJob); if (r) l.push({ tur: 'is', r, sip: true }); }
  const m = U.rsTez || U.tbTez; if (m) l.push({ tur: 'tez', m });
  const anah = h => h.tur === 'tez' ? 'tez' : h.sip ? 'sip' : 'is';
  if (U.kbSon) l.sort((a, b) => (anah(b) === U.kbSon) - (anah(a) === U.kbSon));
  return l.map(h => ({ ...h, k: anah(h) }));
}
function kbBaglam() {
  const l = kbHedefler(); if (!l.length) return null;
  return l.find(h => h.k === U.kbHedef) || l[0];
}
function kbIsKomutlari(r) {
  const yaz = yetkili('plan.yaz'), kil = yetkili('plan.kilitle'); const l = [];
  const ek = (ad, simge, kos, ipucu = '') => l.push({ ad, simge, kos, ipucu });
  if (yaz) {
    ek(`${r.job} siparişini öne al`, 'flag', () => oneAl(r.job), 'öne almanın yollarını dener, en iyisini uygular');
    const n = kbTasiKomutlari(r).length;
    if (n) ek('Başka tezgâha taşı', 'next', () => { U.kbAlt = 'tasi'; kbKur(); }, `yapabilen ${n} tezgâh`);
    ek('1 saat sonraya', 'chev-right', () => gyTasi(r.id, r.m, r.S + 1, 'kb:' + r.id), '→, Shift ile çeyrek saat');
    ek('1 saat önceye', 'chev-left', () => gyTasi(r.id, r.m, Math.max(rsSimdi(), r.S - 1), 'kb:' + r.id), '←');
    ek('Kuyrukta bir öne', 'up', () => kbSira(r.id, -1), '[');
    ek('Kuyrukta bir arkaya', 'down', () => kbSira(r.id, 1), ']');
  }
  if (kil) ek(S.locks[r.id] ? 'Sabitliği kaldır' : 'Bu saate sabitle', 'lock', () => eylem('v20-m-sabit', r.id), 'motor sabit işe dokunmaz');
  if (yaz) ek(`${r.job} siparişini havuza geri al`, 'box', () => havuzaAt([r.job]), 'plandan çıkar, sonra yeniden yerleştirilir');
  ek(`${kbTez(r.m)} sırasını düzenle`, 'sort', () => eylem('v20-m-sira', r.m), 'tezgâhın bütün kuyruğu');
  return l;
}
function kbTezKomutlari(m) {
  const yaz = yetkili('plan.yaz'); const l = [];
  const ek = (ad, simge, kos, ipucu = '') => l.push({ ad, simge, kos, ipucu });
  ek(`${kbTez(m)} sırasını düzenle`, 'sort', () => eylem('v20-m-sira', m), 'sürükleyerek ya da oklarla');
  if (yaz) { ek(`${kbTez(m)} bugün boşalt`, 'next', () => tezBosalt(m, 0), 'bugünkü işler yapabilen tezgâhlara'); ek(`${kbTez(m)} tamamen boşalt`, 'next', () => tezBosalt(m), 'bütün bekleyen işler taşınır'); }
  return l;
}
/* yapabilen tezgâhlar: işin süresi kısa olandan uzuna */
function kbTasiKomutlari(r) {
  const o = cxAl().byId[r.id]; if (!o) return [];
  return o.c.filter(c => c.m !== r.m).sort((a, b) => (a.run + a.su) - (b.run + b.su)).slice(0, 9)
    .map(c => ({ ad: kbTez(c.m), simge: c.fas ? 'truck' : 'target', ipucu: `${saat(c.run + c.su)} sürer`, kos: () => gyTasi(r.id, c.m, Math.max(rsSimdi(), r.S)) }));
}
function kbSira(id, yon) {
  const p = S.plan; const r = p.ops[id]; if (!r) return;
  const q = Object.values(p.ops).filter(x => x.m === r.m && isFinite(x.C)).sort((a, b) => a.S - b.S); const i = q.findIndex(x => x.id === id); const n = q[i + yon];
  if (!n) { bildir(yon < 0 ? 'İş zaten kuyruğun başında.' : 'İş zaten kuyruğun sonunda.', 'bilgi'); return; }
  if (n.act || n.done) { bildir(`${n.id} başlamış; önüne geçilemez.`, 'bilgi'); return; }
  const t = Math.max(rsSimdi(), yon < 0 ? n.S - 1e-3 : n.S + 1e-3);
  hamleDene([[id, r.m, t]], `${id}, ${kbTez(r.m)} kuyruğunda ${n.id} ${yon < 0 ? 'önüne' : 'arkasına'}`, [[id, r.m, t]], [], { birlestir: 'sira:' + id });
}
function kbListe() {
  const b = kbBaglam(); if (!b) return { b, l: [] };
  if (b.tur === 'tez') return { b, l: kbTezKomutlari(b.m) };
  return { b, l: U.kbAlt === 'tasi' ? kbTasiKomutlari(b.r) : kbIsKomutlari(b.r) };
}
const kbSatir = (k, i) => `<li><button type="button" class="pm-kb-k" data-act="kb-kos" data-v="${i}">${i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd></kbd>'}${ic(k.simge, 'k')}<span><b>${esc(k.ad)}</b>${k.ipucu ? `<small>${esc(k.ipucu)}</small>` : ''}</span></button></li>`;
function kbDuzenleHtml() {
  const { b, l } = kbListe();
  const hl = kbHedefler(); const AD = { is: 'İş adımı', sip: 'Sipariş', tez: 'Tezgâh' };
  const cip = hl.length > 1 ? `<div class="pm-kb-hedef" role="group" aria-label="Neyi düzenle (Tab)">${hl.map(h => `<button type="button" data-act="kb-hedef" data-v="${h.k}" aria-pressed="${b && h.k === b.k}"><small>${AD[h.k]}</small><b class="mono">${esc(h.k === 'tez' ? kbTez(h.m) : h.k === 'sip' ? h.r.job : h.r.id)}</b></button>`).join('')}<kbd>Tab</kbd></div>` : '';
  const bas = !b ? '' : `${cip}<div class="pm-kb-bas"><span class="pm-kb-tur">${AD[b.k]}</span>${b.tur === 'tez' ? `<b class="mono">${esc(kbTez(b.m))}</b><small>bu tezgâhın kuyruğu</small>` : `<b class="mono">${esc(b.sip ? b.r.job : b.r.id)}</b><small>${b.sip ? `sıradaki adımı ${esc(b.r.id)} · ` : ''}${esc(kbTez(b.r.m))} · ${esc(fmtDT(S.D, b.r.S))}${S.locks[b.r.id] ? ' · sabit' : ''}</small>`}</div>`;
  const govde = !b ? '<p>Önce bir iş, sipariş ya da tezgâh seçin; sonra E.</p>' : l.length ? `<ol class="pm-kb-l">${l.map(kbSatir).join('')}</ol>` : '<p>Bu iş başka tezgâhta yapılamıyor.</p>';
  const ipucu = b && b.tur === 'is' && yetkili('plan.yaz') ? '<p class="pm-kb-ip"><kbd>←</kbd><kbd>→</kbd> saat · <kbd>↑</kbd><kbd>↓</kbd> tezgâh · <kbd>Shift</kbd> çeyrek saat · <kbd>Ctrl Z</kbd> geri al</p>' : '';
  return `<section class="pm-yp pm-kb" role="dialog" aria-label="Düzenle"><header><b>${ic('wrench', 'k')}${U.kbAlt === 'tasi' ? 'Hangi tezgâha?' : 'Düzenle'}</b>${U.kbAlt ? dugme('', 'kb-geri', { kucuk: true, hayalet: true, simge: 'chev-left', ad: 'Geri (Backspace)' }) : ''}${dugme('', 'kb-pan', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat (Esc)', veri: 'data-v="dz"' })}</header>
    ${bas}${govde}${ipucu}</section>`;
}
function kbSepetHtml() {
  const a = U.taslak ? U.taslak.adimlar : [];
  return `<section class="pm-yp pm-kb" role="dialog" aria-label="Değişiklikler"><header><b>${ic('layers', 'k')}Değişiklikler</b>${dugme('', 'kb-pan', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat (Esc)', veri: 'data-v="sp"' })}</header>
    <p>Plan her değişiklikte hemen güncellenir. Bir satırın geri düğmesi o değişiklikten öncesine döner.</p>${taslakPaneli(false)}
    <p class="pm-kb-ip"><kbd>Ctrl Z</kbd> geri al · <kbd>Ctrl Shift Z</kbd> yinele · <kbd>Ctrl Enter</kbd> onayla, listeyi temizle</p></section>`;
}
const KB_KISAYOL = [
  ['Görünüm', [['G', 'Özet'], ['H', 'Harita'], ['C', 'Çizelge'], ['K', 'Keşfet'], ['F', 'Sığdır'], ['+ -', 'Yakınlaş, uzaklaş'], ['1 - 8', 'Kartlar (Plan, Siparişler...)'], ['O', 'Seçili bölümün çizelgesi']]],
  ['Bul ve seç', [['/', 'Sipariş, tezgâh ya da komut ara'], ['Ctrl K', 'Komut arama'], ['Esc', 'Menüyü, sonra seçimi kapat']]],
  ['Düzenle', [['E', 'Seçilene göre Düzenle menüsü'], ['1 - 9', 'Menüdeki komut'], ['← →', 'İşi 1 saat kaydır (Shift: çeyrek)'], ['↑ ↓', 'Yapabilen bir önceki ya da sonraki tezgâh'], ['[ ]', 'Kuyrukta bir öne, bir arkaya'], ['Backspace', 'Menüde geri']]],
  ['Değişiklikler', [['D', 'Değişiklik listesi'], ['Ctrl Z', 'Geri al'], ['Ctrl Shift Z', 'Yinele'], ['Ctrl Enter', 'Onayla, listeyi temizle']]],
  ['Diğer', [['Y', 'Yapılacaklar'], ['?', 'Bu liste']]]
];
function kbKisayolHtml() {
  return `<section class="pm-yp pm-kb pm-kb-kl" role="dialog" aria-label="Klavye kısayolları"><header><b>${ic('help', 'k')}Klavye kısayolları</b>${dugme('', 'kb-pan', { kucuk: true, hayalet: true, simge: 'x', ad: 'Kapat (Esc)', veri: 'data-v="kl"' })}</header>
    ${KB_KISAYOL.map(([g, l]) => `<small>${esc(g)}</small><dl>${l.map(([t, a]) => `<dt>${t.split(' ').map(x => `<kbd>${esc(x)}</kbd>`).join('')}</dt><dd>${esc(a)}</dd>`).join('')}</dl>`).join('')}</section>`;
}

/* alt sağdaki sıra: Değişiklikler, Düzenle, Yapılacaklar; aynı anda tek pencere açık */
const kbYpEski = ypHtml;
ypHtml = function () {
  if (!S.plan || kim().rol === 'operator') return '';
  const yp = kbYpEski();
  const pan = U.kbPan === 'dz' ? kbDuzenleHtml() : U.kbPan === 'sp' ? kbSepetHtml() : U.kbPan === 'kl' ? kbKisayolHtml() : '';
  const n = U.taslak ? U.taslak.adimlar.length : 0; const b = kbBaglam();
  const sp = n ? `<button type="button" class="pm-yp-fab pm-kb-fab" data-act="kb-pan" data-v="sp" aria-expanded="${U.kbPan === 'sp'}" title="Değişiklikler (D)">${ic('layers', 'k')}<span>Değişiklikler</span><b class="mono">${n}</b></button>` : '';
  const dz = b && kim().rol !== 'operator' ? `<button type="button" class="pm-yp-fab pm-kb-fab" data-act="kb-pan" data-v="dz" aria-expanded="${U.kbPan === 'dz'}" title="Seçileni düzenle (E)">${ic('wrench', 'k')}<span>Düzenle</span><kbd>E</kbd></button>` : '';
  const fab = yp.match(/<button type="button" class="pm-yp-fab"[\s\S]*<\/button>$/); const ust = fab ? yp.slice(0, fab.index) : yp;
  return `${pan}${ust}<div class="pm-yp-sira">${sp}${dz}${fab ? fab[0] : ''}</div>`;
};
function kbPanAc(v) { U.kbAlt = null; U.kbHedef = null; U.kbPan = U.kbPan === v ? null : v; if (U.kbPan) U.ypAcik = false; ypKur(); const f = document.querySelector('.pm-kb .pm-kb-k'); if (f) f.focus({ preventScroll: true }); }
function kbKur() { ypKur(); }
function kbKos(i) { const { l } = kbListe(); const k = l[i]; if (!k) return; const alt = U.kbAlt; k.kos(); if (U.kbAlt === alt) { U.kbAlt = null; if (alt === 'tasi' || !/saat|Kuyrukta/.test(k.ad)) U.kbPan = null; } ypKur(); }

const kbTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  if (act === 'kb-pan') { kbPanAc(v); return true; }
  if (act === 'kb-kos') { kbKos(+v); return true; }
  if (act === 'kb-geri') { U.kbAlt = null; ypKur(); return true; }
  if (act === 'kb-hedef') { U.kbHedef = v; U.kbAlt = null; ypKur(); return true; }
  if (['sg-don', 'sg-gor', 'sg-cizelge'].includes(act)) { U.kbPan = null; U.kbAlt = null; U.kbHedef = null; }
  if (act === 'yp-ac') { U.kbPan = null; }
  return kbTekEski(act, v, el, e);
};
document.addEventListener('pointerdown', e => { if (U.kbPan && !(e.target.closest && e.target.closest('.pm-yp-kap, #pm-v20-menu, .pm-pencere, dialog'))) { U.kbPan = null; U.kbAlt = null; ypKur(); } }, true);

/* tuşlar: yazı alanında, açık pencerede ve komut aramasında çalışmaz */
window.addEventListener('keydown', e => {
  if (!S.plan || U.sayfa !== 'tahta' || U.pencere || U.onay || kim().rol === 'operator') return;
  const t = e.target; if (t.closest && t.closest('input, textarea, select, dialog, [contenteditable]')) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  const dur = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (mod && k === 'Enter') { if (U.taslak && U.taslak.adimlar.length) { dur(); U.kbPan = null; taslakBitir(); } return; }
  if (mod || e.altKey) return;
  if (k === 'Escape' && U.kbPan) { dur(); if (U.kbAlt) U.kbAlt = null; else U.kbPan = null; ypKur(); return; }
  if (U.kbPan === 'dz') {
    if (/^[1-9]$/.test(k)) { dur(); kbKos(+k - 1); return; }
    if (k === 'Tab') { const hl = kbHedefler(); if (hl.length > 1) { dur(); const b0 = kbBaglam(); const i = hl.findIndex(h => h.k === b0.k); U.kbHedef = hl[(i + (e.shiftKey ? hl.length - 1 : 1)) % hl.length].k; U.kbAlt = null; ypKur(); } return; }
    if (k === 'Backspace' && U.kbAlt) { dur(); U.kbAlt = null; ypKur(); return; }
    const b = kbBaglam();
    if (b && b.tur === 'is' && yetkili('plan.yaz') && /^Arrow/.test(k)) {
      dur(); const r = b.r; U.gySec = r.id;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const d = (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.25 : 1); gyTasi(r.id, r.m, Math.max(rsSimdi(), r.S + d), 'kb:' + r.id); }
      else { const l = cxAl().byId[r.id]; const sira = Object.keys((TB.son || tbYerlesim(S.plan)).kart).filter(m => l && l.c.some(c => c.m === m)); const i = sira.indexOf(r.m); const m = sira[i + (k === 'ArrowDown' ? 1 : -1)];
        if (!m) bildir('Bu yönde bu işi yapabilen tezgâh yok.'); else gyTasi(r.id, m, r.S, 'kb:' + r.id); }
      ypKur(); return;
    }
  }
  if (U.kbPan === 'sp' && k === 'Enter') { dur(); U.kbPan = null; taslakBitir(); return; }
  const h = k.toLocaleLowerCase('tr-TR');
  if (h === 'e') { dur(); kbPanAc('dz'); return; }
  if (h === 'd') { dur(); kbPanAc('sp'); return; }
  if (h === 'y') { dur(); U.kbPan = null; eylem('yp-ac'); return; }
  if (k === '?') { dur(); kbPanAc('kl'); return; }
  if ((k === '[' || k === ']') && U.gySec && yetkili('plan.yaz')) { dur(); kbSira(U.gySec, k === '[' ? -1 : 1); return; }
  if (document.querySelector('.pm-od')) return;
  const gor = { g: 'genel', h: 'atolye', k: 'kesif' }[h];
  if (gor) { dur(); eylem(U.tkTam ? 'sg-gor' : 'sg-don', gor); return; }
  if ((h === 'c' || h === 'ç') && U.tkTam) { dur(); eylem('sg-cizelge'); }
}, true);

/* Başka menüsü ve komut aramasında kısayol listesi */
const kbMenuEski = sgMenu;
sgMenu = function () { const h = kbMenuEski(); return h && h.replace('<small>Düzen</small>', `<small>Düzen</small><button type="button" role="menuitem" data-act="kb-pan" data-v="kl">${ic('help', 'k')}<span>Klavye kısayolları</span><kbd>?</kbd></button>`); };
const kbKomutEski = v20Komutlar;
v20Komutlar = function () { const l = kbKomutEski(); l.unshift({ ad: 'Klavye kısayolları', simge: 'help', kos: () => kbPanAc('kl'), grup: 'Yardım', ipucu: '?' }); if (kbBaglam()) l.unshift({ ad: 'Seçileni düzenle', simge: 'wrench', kos: () => kbPanAc('dz'), grup: 'Plan', ipucu: 'E' }); return l; };
const kbRenderEski = render;
render = function () { kbSecimIzle(); kbRenderEski(); };
