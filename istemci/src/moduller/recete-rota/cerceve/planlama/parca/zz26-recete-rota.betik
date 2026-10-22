/* ---------- Reçete ve Rota bölümleri: planlama ile tek modül ----------
   338 a (20.10): depodaki Reçete ve Rota çerçevesi aynen gelir; tanım, emir ve stok bölümleri onundur, Plan, Stüdyo ve Kanban yerine
   bu denemenin plan sayfaları geçer. Çerçeve uygulamadaki gibi yalıtılmış bir iframe'dedir ve görünümü aynı sözleşmeyle alır
   (window.tmiGorunum: kaydet, bildir, sayaclar). Çerçeve her çizimde yeniden kurulmaz: yeniden kurmak durumunu ve kaydırmasını sıfırlar. */
const RR_SEK = [['orders', 'Üretim emirleri', 'list'], ['stock', 'Stok', 'box'], ['schema', 'Ürün ve rotalar', 'layers'], ['ops', 'Operasyonlar', 'edit'], ['sureler', 'Süreler', 'clock'], ['items', 'Malzemeler', 'cube'], ['res', 'Kaynaklar', 'cpu']];
/* çerçevenin plan sekmeleri bu modülde planlama sayfalarıdır */
const RR_PLAN = { plan: 'tahta', studio: 'studyo', kanban: 'tahta', op: 'tahta', sim: 'tahta' };
const rrId = ad => 'rr-' + ad;
const rrMi = id => typeof id === 'string' && id.startsWith('rr-') && RR_SEK.some(x => rrId(x[0]) === id);
for (const [ad, baslik] of RR_SEK) { const id = rrId(ad); SAYFA_AD[id] = baslik; EKRAN_OF[id] = 'plan'; YAN_ID.add(id); YM_GORUNUM[id] = () => rrYerHtml(ad); }

const RR = { el: null, al: null, bekleyen: null, son: null, alindi: false, sayac: null };
window.RR_KOPRU = {
  gorunum: () => ({
    kaydet(fn) { RR.al = fn; if (RR.bekleyen) { const a = RR.bekleyen; RR.bekleyen = null; RR.alindi = true; fn(a); } },
    /* içeride sekme değişti: tanım bölümüyse menü izler, plan sekmesiyse planlama sayfasına gidilir */
    bildir(ad) {
      if (!RR.alindi || ad === RR.son) return;
      if (RR_PLAN[ad]) { RR.son = null; U.sayfa = kim().rol === 'operator' ? 'kuyruk' : RR_PLAN[ad]; render(); return; }
      if (!RR_SEK.some(x => x[0] === ad)) return;
      RR.son = ad; if (U.sayfa !== rrId(ad)) { U.sayfa = rrId(ad); render(); }
    },
    sayaclar(o) { RR.sayac = o && typeof o === 'object' ? o : null; },
  }),
};
function rrCerceve() {
  if (RR.el) return RR.el;
  const f = document.createElement('iframe');
  f.className = 'pm-rr-cerceve'; f.title = 'Reçete ve Rota'; f.hidden = true; f.srcdoc = RR_HTML;
  document.body.appendChild(f); RR.el = f; return f;
}
function rrGoster(ad) {
  if (RR.son === ad && RR.alindi) return; RR.son = ad;
  if (RR.al) { RR.alindi = true; RR.al(ad); } else RR.bekleyen = ad;
}
function rrYerHtml(ad) { return `<div class="pm-rr-yer" data-rr="${esc(ad)}" aria-busy="${RR.al ? 'false' : 'true'}"><p class="pm-kucuk">${ic('rotate', 'k')} Reçete ve Rota açılıyor…</p></div>`; }
/* çerçeve gövdeye takılıdır; yer tutucunun üstüne oturtulur, yer tutucu kalan yüksekliği doldurur */
function rrYerlestir() {
  const yer = document.querySelector('.pm-rr-yer');
  if (!yer) { if (RR.el) RR.el.hidden = true; return; }
  const f = rrCerceve();
  const r0 = yer.getBoundingClientRect(); yer.style.height = Math.max(360, innerHeight - r0.top - 12) + 'px';
  const r = yer.getBoundingClientRect();
  Object.assign(f.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  f.hidden = false; rrGoster(yer.dataset.rr);
}
{ const r0 = render; render = function () { const x = r0.apply(this, arguments); try { rrYerlestir(); } catch (e) { console.error(e); } return x; }; }
addEventListener('resize', () => { if (RR.el && !RR.el.hidden) rrYerlestir(); });
document.addEventListener('scroll', () => { if (RR.el && !RR.el.hidden) rrYerlestir(); }, true);

/* menü: Üretim grubunun yerinde Reçete ve Rota bölümleri */
{ const am0 = anaMenu; anaMenu = function () {
  const h = am0();
  if (kim().rol === 'operator') return h;
  const bag = ([ad, baslik, sm]) => { const id = rrId(ad); const acik = U.sayfa === id; return `<a class="tc-kabuk-bag${acik ? ' tc-kabuk-bag-acik' : ''}" ${acik ? 'aria-current="page"' : ''} href="#" data-act="git" data-v="${id}">${ic(sm, 'k')}<span class="tc-kabuk-bag-metin">${baslik}</span></a>`; };
  const grup = `<div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Reçete ve Rota</div>${RR_SEK.map(bag).join('')}</div>`;
  return h.replace(/<div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Üretim<\/div>[^]*?<\/div>(?=\s*<div class="tc-kabuk-grup">)/, grup);
}; }
/* telefonda menü yok: şerit iki satırdır, Reçete ve Rota bölümleri ve planlama sayfaları */
{ const ys0 = ymSerit; ymSerit = function () {
  const h = ys0(); if (!h) return h;
  const rr = `<nav class="pm-ym-serit pm-rr-serit" aria-label="Reçete ve Rota bölümleri">${RR_SEK.map(([ad, baslik, sm]) => { const id = rrId(ad); return `<button type="button" data-act="git" data-v="${id}" ${U.sayfa === id ? 'aria-current="page"' : ''}>${ic(sm, 'k')}<span>${baslik}</span></button>`; }).join('')}</nav>`;
  return rrMi(U.sayfa) ? rr + h.replace(/ aria-current="page"/g, '') : h + rr;
}; }
