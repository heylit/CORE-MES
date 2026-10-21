/* ---------- Sol menü: maliyet, sipariş kârı, ek mesai, fason ve satın alma planı ----------
   Kararlar 203 a (plan tek TL toplamını en aza indirir), 204 a (ek mesai ve fason önerisi parayla; kabul ve red müdürde), 205 a (siparişte ödeme vadesi).
   Kullanıcı 11:12: malzemede cins, kalite, form; birim maliyet kg fiyatından anlık. Motor dosyası değişmez: amaç karşılaştırması,
   fason kararı ve sipariş ağırlıkları hem bu sayfada hem işçide aynı küçük kodla motora bağlanır. Fiyat ve maliyeti yalnız müdür ve yönetici görür (180 a). */
const YAN = [['tahta', 'Planlama motoru', 'gantt'], ['ysiparis', 'Siparişler', 'list'], ['maliyet', 'Maliyetler', 'lira'], ['mesaiplan', 'Ek mesai planı', 'clock'], ['fasonplan', 'Fason planı', 'truck'], ['malzplan', 'Malzeme satın alma planı', 'box']];
const YAN_ID = new Set(YAN.slice(1).map(x => x[0]));
const ymYan = () => YAN_ID.has(U.sayfa);
for (const [id, ad] of YAN.slice(1)) { SAYFA_AD[id] = ad; EKRAN_OF[id] = 'plan'; }
{ const v = EKRANLAR.find(e => e[0] === 'veri'); if (v) { const i = v[3].findIndex(x => x[0] === 'malzplan'); if (i >= 0) v[3].splice(i, 1); } }

anaMenu = function () {
  const op = kim().rol === 'operator';
  const bag = ([id, ad, sm]) => { const acik = id === 'tahta' ? !ymYan() : U.sayfa === id;
    return `<a class="tc-kabuk-bag${acik ? ' tc-kabuk-bag-acik' : ''}" ${acik ? 'aria-current="page"' : ''} href="#" data-act="git" data-v="${id === 'tahta' ? (op ? 'kuyruk' : 'tahta') : id}">${ic(sm, 'k')}<span class="tc-kabuk-bag-metin">${ad}</span></a>`; };
  const kapali = (ad, sm) => `<a class="tc-kabuk-bag" aria-disabled="true" title="Bu denemede kapalı" href="#" data-act="yok">${ic(sm, 'k')}<span class="tc-kabuk-bag-metin">${ad}</span></a>`;
  return `<div class="tc-kabuk-marka"><span class="tc-kabuk-marka-isaret">TMI</span><span class="tc-kabuk-marka-metin">CORE</span></div>
  <div class="tc-kabuk-surum">V2 · deneme</div>
  <div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Üretim</div>${kapali('Üretim emirleri', 'list')}${kapali('İstasyonlar', 'cpu')}${kapali('Reçete ve Rota', 'layers')}</div>
  <div class="tc-kabuk-grup"><div class="tc-kabuk-grup-ad">Planlama</div>${(op ? YAN.slice(0, 1) : YAN).map(bag).join('')}</div>
  <p class="pm-deneme">Deneme sayfası. Uygulamaya bağlı değil; bütün veri uydurmadır.</p>`;
};
/* telefonda sol menü yoktur: aynı bağlar içeriğin başında tek satırda durur */
function ymSerit() {
  if (kim().rol === 'operator') return '';
  return `<nav class="pm-ym-serit" aria-label="Planlama sayfaları">${YAN.map(([id, ad, sm]) => { const acik = id === 'tahta' ? !ymYan() : U.sayfa === id; return `<button type="button" data-act="git" data-v="${id}" ${acik ? 'aria-current="page"' : ''}>${ic(sm, 'k')}<span>${ad}</span></button>`; }).join('')}</nav>`;
}
const ymSayfaEski = sayfaHtml;
sayfaHtml = function () {
  if (ymYan()) {
    if (kim().rol === 'operator') { U.sayfa = 'kuyruk'; return ymSayfaEski(); }
    try { return `<div class="pm-sayfa pm-ym-sayfa">${ymSerit()}${YM_GORUNUM[U.sayfa]()}</div>`; }
    catch (e) { console.error(e); return `<div class="pm-serit" data-ton="hata">${ic('alert', 'k')}<span class="pm-serit-metin">Sayfa çizilemedi: ${esc(e.message)}</span></div>`; }
  }
  const h = ymSayfaEski();
  return U.sayfa === 'tahta' || U.sayfa === 'bugun' ? h : h.replace('<div class="pm-sayfa">', `<div class="pm-sayfa">${ymSerit()}`);
};
const ymCubukEski = sdCubuk;
sdCubuk = function () { const h = ymCubukEski(); return ymYan() ? h.replace(/ aria-current="page"/g, '') : h; };

/* ---------- Malzeme: cins, kalite, form; birim maliyet kg fiyatından ---------- */
const ML_CINS = ['Karbon çeliği', 'Alaşımlı çelik', 'Paslanmaz çelik', 'Takım çeliği', 'Alüminyum', 'Titanyum', 'Bakır alaşımı', 'Plastik', 'Diğer'];
const ML_FORM = ['Çubuk', 'Levha', 'Blok', 'Boru', 'Profil', 'Dövme', 'Döküm'];
const ML_ORNEK = {
  'M-C45-40': ['Karbon çeliği', 'C45', 'Çubuk', 'Ø40'], 'M-4140-80': ['Alaşımlı çelik', '42CrMo4', 'Çubuk', 'Ø80'], 'M-7075-50': ['Alüminyum', '7075', 'Levha', '50 mm'],
  'M-6061-30': ['Alüminyum', '6061', 'Levha', '30 mm'], 'M-2379-BL': ['Takım çeliği', '1.2379', 'Blok', ''], 'M-304-60': ['Paslanmaz çelik', 'AISI 304', 'Çubuk', 'Ø60'],
  'M-S235-20': ['Karbon çeliği', 'S235', 'Levha', '20 mm'], 'M-TI-BL': ['Titanyum', 'Ti6Al4V', 'Blok', ''],
};
const mlNorm = x => String(x || '').trim().toLocaleUpperCase('tr-TR');
/* fiyat satırı kalite ve formla eşleşir; formu boş satır o kalitenin bütün formlarına geçer */
function mlSatir(D, m) {
  const l = D.kgFiyat || []; const k = mlNorm(m.kalite); if (!k) return null;
  return l.find(r => mlNorm(r.kalite) === k && mlNorm(r.form) === mlNorm(m.form)) || l.find(r => mlNorm(r.kalite) === k && !mlNorm(r.form)) || null;
}
function mlBirim(D, m) {
  const r = mlSatir(D, m); if (!r || r.fiyat == null) return null;
  if (m.birim === 'kg') return +r.fiyat;
  return m.kgBirim > 0 ? +r.fiyat * +m.kgBirim : null;
}
function mlSenkron(D) { if (!D || !D.kgFiyat) return; for (const m of D.malzemeler || []) { m.birimFiyat = mlBirim(D, m); const r = mlSatir(D, m); m.fire = r && r.fire != null ? +r.fire : null; } }
/* yüklenen veri setlerinde cins ve kg fiyatı yok: eldeki birim fiyattan bir kez kg fiyat satırı kurulur */
function mlGoc(D) {
  if (!D || D.kgFiyat) return;
  D.kgFiyat = []; let n = 0;
  for (const m of D.malzemeler || []) {
    const o = ML_ORNEK[m.kod]; if (m.cins == null) { m.cins = o ? o[0] : 'Diğer'; m.kalite = o ? o[1] : m.kod; m.form = o ? o[2] : ''; m.olcu = o ? o[3] : ''; }
    if (m.birimFiyat != null && m.birim === 'kg' && !mlSatir(D, m)) D.kgFiyat.push({ id: 'KG-' + (++n), cins: m.cins, kalite: m.kalite, form: m.form, fiyat: +m.birimFiyat, fire: null, tarih: D.meta && D.meta.baslangic || null, kim: 'geçiş' });
  }
  mlSenkron(D);
}
const ymRenderEski = render;
/* talaş satış fiyatı kalite başına tek değerdir: talaş formdan bağımsız satılır. Deneme verisinde kg fiyatının beşte biri örnek olarak konur; sonradan eklenen kalite boş gelir. */
function tlGoc(D) {
  if (!D || !D.kgFiyat) return; const ilk = !D.talasFiyat; if (ilk) D.talasFiyat = [];
  for (const r of D.kgFiyat) { if (D.talasFiyat.some(t => mlNorm(t.kalite) === mlNorm(r.kalite))) continue;
    D.talasFiyat.push(ilk ? { kalite: r.kalite, cins: r.cins, fiyat: r.fiyat != null ? Math.round(r.fiyat / 5 * 2) / 2 : null, tarih: r.tarih || null, kim: 'deneme örneği' } : { kalite: r.kalite, cins: r.cins, fiyat: null, tarih: null, kim: '' }); }
}
const tlSatir = (D, kalite) => (D.talasFiyat || []).find(t => mlNorm(t.kalite) === mlNorm(kalite)) || null;
render = function () { if (S && S.D) { mlGoc(S.D); tlGoc(S.D); for (const s of S.senaryolar || []) if (s.D) mlGoc(s.D); } return ymRenderEski(); };
/* ana veriye her yazıştan sonra birim maliyet yeniden hesaplanır: kg fiyatı ya da malzemenin kalitesi değişince maliyet de değişir */
const ymDegEski = degistir;
degistir = function (ne, ayrinti, fn, yetki = 'veri.yaz', o = {}) { return ymDegEski(ne, ayrinti, () => { const r = fn(); if (r !== false && S && S.D) mlSenkron(S.D); return r; }, yetki, o); };
if (TANIM.malzeme) {
  TANIM.malzeme.alanlar = () => [
    { k: 'kod', ad: 'Kod', tur: 'metin', zorunlu: 1 }, { k: 'ad', ad: 'Ad', tur: 'metin', zorunlu: 1 },
    { k: 'cins', ad: 'Cins', tur: 'secim', zorunlu: 1, secenek: () => ML_CINS.map(x => [x, x]) },
    { k: 'kalite', ad: 'Kalite', tur: 'metin', zorunlu: 1, liste: [...new Set([...(S.D.kgFiyat || []).map(r => r.kalite), ...S.D.malzemeler.map(m => m.kalite)].filter(Boolean))], ipucu: 'Birim maliyet bu kalitenin kg fiyatından gelir (Maliyetler)' },
    { k: 'form', ad: 'Form', tur: 'secim', secenek: () => ML_FORM.map(x => [x, x]) }, { k: 'olcu', ad: 'Ölçü', tur: 'metin', ipucu: 'Ø40, 50 mm gibi' },
    { k: 'birim', ad: 'Birim', tur: 'metin', zorunlu: 1, liste: ['kg', 'adet', 'm'] }, { k: 'kgBirim', ad: 'Bir birimin ağırlığı (kg)', tur: 'sayi', min: 0, ipucu: 'Birim kg değilse maliyet için gerekir' },
    { k: 'stok', ad: 'Serbest stok', tur: 'sayi', min: 0, zorunlu: 1 }, { k: 'muayeneGun', ad: 'Giriş muayenesi (gün)', tur: 'sayi', min: 0, adim: 0.5 }, { k: 'tedarikGun', ad: 'Tedarik süresi (gün)', tur: 'sayi', min: 0 }];
  TANIM.malzeme.sutunlar = [['kod', 'Kod', x => `<b class="mono">${esc(x.kod)}</b>`], ['ad', 'Ad'],
    ['cins', 'Cins · kalite · form', x => `<span class="pm-ml-tur">${esc(x.cins || '—')}</span> <b>${esc(x.kalite || '—')}</b> ${esc([x.form, x.olcu].filter(Boolean).join(' '))}`],
    ['stok', 'Stok', x => `${sayi(x.stok, 1)} ${esc(x.birim)}`, 1],
    ['birimFiyat', 'Birim maliyet', x => !agFiyatGorur() ? '<span class="pm-kucuk">müdürde</span>' : x.birimFiyat == null ? '<span class="pm-ag-uyari">kg fiyatı yok</span>' : `<span class="mono">${sayi(x.birimFiyat, 2)} TL/${esc(x.birim)}</span>`, 1],
    ['tedarikGun', 'Tedarik', x => x.tedarikGun != null ? x.tedarikGun + ' gün' : '—', 1]];
}

/* ---------- motora bağlanan ayarlar ----------
   Operatör ücreti girilince tezgâh saat maliyetine operatör payıyla eklenir; fire payı malzeme ihtiyacını büyütür; fason taşıma adet fiyatına eklenir.
   Ağırlıklar ve amaç işçiye st içinde gider: işçi motoru kendi PW sözlüğüyle başlar, sipariş ağırlıklarını oradan alamaz. */
var TL_AMAC = { ac: false, birim: 5, risk: 0.25 };
const YM0 = { amac: 'tl', risk: 0.25, karHedef: 25, mesaiCarpan: 1.5, operatorUcret: null, genelGider: 120 };
/* bekleme maliyeti yalnız finansmandır (212 a): alan ve elleçleme genel giderde, bozulma riski hurda payında; hesap bu bileşenleri taşır ama kapalı tutar.
   Finansman oranı ayrı değildir: Öncelik ve ağırlıktaki günlük oran kullanılır. */
const WIP0 = { ac: true, vadeBas: 'bitis', alanAc: false, ellAc: false, alfaAc: false, alan: 12.5, loj: 450, alfa: 0.05, esik: 8, paletM2: 2, paletAdet: 50, tasimaSa: 0.25 };
function wipAyar(D = S.D) { return { ...WIP0, ...((D && D.planTL && D.planTL.wip) || {}), alanAc: false, ellAc: false, alfaAc: false }; }
function ymAyar(D = S.D) { return { ...YM0, ...((D && D.planTL) || {}) }; }
const ymStEski = stOf;
stOf = function (ek, gevset) {
  const st = ymStEski(ek, gevset); const D = st.D; const Y = ymAyar(S.D);
  if (Y.operatorUcret != null) for (const m of D.tezgahlar) if (m.ucret != null) m.ucret = +m.ucret + +Y.operatorUcret * (m.opOran == null ? 1 : +m.opOran);
  const mats = Object.fromEntries((D.malzemeler || []).map(m => [m.kod, m]));
  for (const s of D.siparisler) for (const r of s.malzeme || []) { const m = mats[r.kod]; if (m && m.fire > 0) r.miktar = +r.miktar * (1 + m.fire / 100); }
  for (const f of D.fasoncular || []) if (f.tasima > 0 && f.fiyat != null) f.fiyat = +f.fiyat + +f.tasima;
  { const w = wipAyar(S.D); st.wipP = { ...w, fin: agAyar(S.D).fin }; }
  st.PWek = {}; for (const s of D.siparisler) if (PW[s.oncelik] != null) st.PWek[s.oncelik] = PW[s.oncelik];
  st.tlAmac = { ac: Y.amac === 'tl' && agAyar(S.D).kip === 'bedel', birim: typeof AG_BIRIM === 'number' ? AG_BIRIM : 5, risk: +Y.risk || 0 };
  Object.assign(TL_AMAC, st.tlAmac);
  return st;
};
/* tek TL toplamı: gecikme saati × bedel (ağırlık birimi TL/sa), tampon ihlali × bedel × risk katsayısı, bilinen maliyet (işleme, ayar, fason, mesai) */
function tlToplam(e) { return e.lex[0] * TL_AMAC.birim + e.lex[1] * TL_AMAC.birim * TL_AMAC.risk + e.lex[4]; }
/* müdürün fason kararı: kabul edilen iş yalnız talaş fasonunda, reddedilen yalnız tezgâhta yapılabilir */
function fasonKararUygula(cx, st) {
  const k = st && st.D && st.D.fasonKarar; if (!k) return;
  for (const o of cx.ops) { const x = k[o.id]; if (!x || !o.c.some(c => c.opt)) continue;
    fasonZorla(o, x.karar === 'kabul');
    /* sonraki karar önceki kilidi ve tezgâh isteğini geçersiz kılar: kilit eski tezgâhı gösteriyorsa iş hiç yerleşemezdi */
    for (const t of [st.locks, st.pref]) { const y = t && t[o.id]; if (y && !o.c.some(c => c.m === (y.m || y))) delete t[o.id]; } }
}
/* zorlanan talaş fasonu rotadaki fason adımı gibi tek seçenek olur: motor isteğe bağlı fasonu ancak tezgâh seçeneğinin yanında yerleştirir */
function fasonZorla(o, disari) {
  const l = disari ? o.c.filter(c => c.opt).map(c => ({ m: c.m, fas: 1 })) : o.c.filter(c => !c.opt); if (!l.length) return;
  o.cTum = o.cTum || o.c; o.c = l;
}
/* bekleme maliyeti plandan, üç yerde: malzemenin hazır olmasından ilk adıma, adımlar arası (öncülün bitişinden adımın başlamasına),
   son adımdan termine (mamul). Bekleyen değer = malzeme + o ana kadar biten adımların maliyeti (dağıtılmış bekleme gideri faizlenmez).
   Finansman ve bozulma bu değer üstünden, alan ve elleçleme palet sayısından. Elleçleme yalnız bekleme eşiği aşınca (ara stoka inip geri alınınca).
   Palet sayısı yukarı yuvarlanır: yarım palet de bütün palet yeri kaplar. */
function wipHesap(plan, st, cx) {
  const P = st.wipP; const out = { tl: 0, fin: 0, alan: 0, ell: 0, risk: 0, tah: 0, saat: 0, J: {} }; if (!P) return out;
  const by = {}; for (const id in plan.ops) { const r = plan.ops[id]; (by[r.job] = by[r.job] || []).push(r); }
  const U0 = Object.fromEntries((st.D.urunler || []).map(u => [u.id, u]));
  for (const j in by) {
    const job = cx.jobs[j]; if (!job) continue; const u = U0[job.urun] || {};
    const pa = Math.ceil(job.adet / (+u.paletAdet || P.paletAdet)); const m2 = +(u.paletM2 ?? P.paletM2); const ts = +(u.tasimaSa ?? P.tasimaSa);
    const mr = cx.mat.res[j]; const mal = mr && mr.fiyat != null ? mr.fiyat : 0;
    const l = by[j].map(r => { let c = 0; if (r.fas) c = r.cost || 0; else { const M = cx.M[r.m]; if (M && M.ucret != null) c = r.run * (1 - (M.pay || 0)) * M.ucret + r.su * (M.ucret + (+cx.A.ayarciUcret || 0)); } return { r, c }; }).sort((a, b) => a.r.C - b.r.C);
    const deger = t => { let v = mal; for (const x of l) { if (x.r.C <= t + 1e-9) v += x.c; else break; } return v; };
    const z = { tl: 0, fin: 0, alan: 0, ell: 0, risk: 0, tah: 0, saat: 0, ilk: 0, ara: 0, son: 0 };
    const say = (W, V, yer) => { if (!(W > 0.25)) return; const g = W / 24;
      const fin = V * P.fin / 100 * g, risk = P.alfaAc ? V * P.alfa / 100 * g : 0, alan = P.alanAc ? pa * m2 * P.alan * g : 0, ell = P.ellAc && yer === 'ara' && W >= P.esik ? pa * ts * P.loj : 0;
      z.fin += fin; z.risk += risk; z.alan += alan; z.ell += ell; z.saat += W; z[yer] += fin + risk + alan + ell; };
    const hazir = Math.max(st.now, mr && isFinite(mr.ready) ? mr.ready : st.now);
    for (const x of l) { const o = cx.byId[x.r.id]; if (!o || x.r.done) continue;
      if (!o.pr.length) { if (mal > 0) say(x.r.S - hazir, mal, 'ilk'); continue; }
      let cp = -Infinity; for (const [p] of o.pr) { const q = plan.ops[p]; if (q) cp = Math.max(cp, q.C); } if (!isFinite(cp)) continue;
      say(x.r.S - Math.max(cp, st.now), deger(cp), 'ara'); }
    /* vade üretim bitince başlıyorsa erken biten iş beklemez, parası erken gelir: termine kalan gün kadar tahsilat finansmanı kazanılır.
       Geç biten işin geç tahsilatı gecikme bedelinin finansman payındadır, burada ikinci kez sayılmaz. */
    if (job.due != null && l.length === job.ops.length) { const C = l[l.length - 1].r.C;
      if (P.vadeBas === 'termin') say(job.due - Math.max(C, st.now), deger(C), 'son');
      else if (job.gelir != null && job.due > C + 0.25) z.tah = -(+job.gelir) * P.fin / 100 * (job.due - Math.max(C, st.now)) / 24; }
    z.tl = z.fin + z.risk + z.alan + z.ell + z.tah; out.J[j] = z; for (const k of ['tl', 'fin', 'alan', 'ell', 'risk', 'tah', 'saat']) out[k] += z[k];
  }
  return out;
}
function tlAmacUygula() {
  if (self.__tlAmac) return; self.__tlAmac = 1;
  const c0 = cmpEv, w0 = lexWhy, k0 = compile, e0 = evaluate; const CX = new WeakMap();
  evaluate = function (plan, st, ref, fast) {
    const e = e0(plan, st, ref, fast);
    if (st && st.wipP && st.wipP.ac) { const cx = plan.cx || CX.get(st) || compile(st); const w = wipHesap(plan, st, cx); e.wip = w; e.tl += w.tl; e.lex[4] += w.tl; }
    return e;
  };
  cmpEv = function (a, b) {
    if (!TL_AMAC.ac) return c0(a, b);
    const d = tlToplam(b) - tlToplam(a); if (Math.abs(d) > 1) return d > 0 ? 1 : -1;
    for (const i of [2, 3]) { const x = b.lex[i] - a.lex[i]; if (Math.abs(x) > LEX_EPS[i]) return x > 0 ? 1 : -1; }
    return 0;
  };
  lexWhy = function (a, b) {
    if (!TL_AMAC.ac) return w0(a, b);
    if (Math.abs(tlToplam(b) - tlToplam(a)) > 1) return 0;
    for (const i of [2, 3]) if (Math.abs(b.lex[i] - a.lex[i]) > LEX_EPS[i]) return i;
    return -1;
  };
  compile = function (st) { const cx = k0(st); fasonKararUygula(cx, st); if (st && typeof st === 'object') CX.set(st, cx); return cx; };
  /* talaşlı fason fiyatı işin tezgâh süresinden çıkar; fasona zorlanan işte tezgâh seçenekleri kaldırıldığı için süre tam listeden alınır */
  const f0 = tFason;
  tFason = function (o, c, cx, ctx, b) { const r = f0(o, c, cx, ctx, b); if (r && r.cost == null && o.cTum && o.cTum.some(x => x.opt && x.m === c.m)) { const f = cx.FS[c.m.slice(1)]; const h = Math.min(...o.cTum.filter(x => !x.fas).map(x => x.run), Infinity); if (f && isFinite(h) && f.saatFiyat != null) r.cost = h * f.saatFiyat; } return r; };
}
tlAmacUygula();
{ const ad0 = LEX_AD[0]; Object.defineProperty(LEX_AD, 0, { get: () => TL_AMAC.ac ? 'gecikme ve maliyet TL toplamı' : ad0 }); }
const TL_ISCI = () => `var TL_AMAC = { ac: false, birim: 5, risk: 0.25 };\n${tlToplam}\n${fasonKararUygula}\n${fasonZorla}\n${wipHesap}\n${tlAmacUygula}\ntlAmacUygula();
{ const om = self.onmessage; self.onmessage = e => { const d = e.data || {};
  for (const s of [d.st, d.temel, ...((d.liste || []).map(x => x.st))]) if (s) { if (s.PWek) Object.assign(PW, s.PWek); if (s.tlAmac) Object.assign(TL_AMAC, s.tlAmac); }
  return om(e); }; }`;
isciAc = function () {
  const src = document.getElementById('motor').textContent + '\n' + opKaydi.toString() + '\n' + planKaydi.toString() + '\n' + ISCI_KODU + '\n' + TL_ISCI();
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  let w;
  try { w = new Worker(url); } catch (e) { URL.revokeObjectURL(url); bildir('Motor başlatılamadı: ' + e.message, 'hata'); return null; }
  w.bitir = () => { w.terminate(); URL.revokeObjectURL(url); calisan = null; U.ilerleme = null; };
  w.onerror = e => { w.bitir(); render(); bildir('Motor hatası: ' + (e.message || 'bilinmiyor'), 'hata'); };
  return w;
};

/* ---------- ortak hesaplar ---------- */
const ymVH = (D, id) => { const v = D.vardiyalar.find(x => x.id === id); if (!v) return 0; let h = hm(v.bit) - hm(v.bas); if (h <= 0) h += 24; return h; };
function ymGecTL(e) { let t = 0; for (const s of S.D.siparisler) { const J = e.J[s.id]; if (J && J.T > 0.05) t += agGecTL(agBedel(S.D, s), J.T); } return t; }
function ymMesaiTL(D, cx, e) { const Y = ymAyar(); const g = cx.days[e.gun]; const tat = !g || !g.vard.length; return ymVH(D, e.vardiya) * (+D.ayarlar.mesaiUcret || 0) * (tat ? +Y.mesaiCarpan || 1 : 1); }
function ymFasonTL(cx, r) {
  const f = cx.FS[r.m.slice(1)]; const o = cx.byId[r.id]; if (!f || !o) return null; const cl = o.cTum || o.c; const c = cl.find(x => x.m === r.m) || {};
  if (c.opt) { const h = Math.min(...cl.filter(x => !x.fas).map(x => x.run), Infinity); return isFinite(h) && f.saatFiyat != null ? h * f.saatFiyat + (+f.tasima || 0) * o.adet : null; }
  return f.fiyat != null ? f.fiyat * o.adet : null;
}
/* sipariş maliyeti son plandan: tezgâh seçimi, ayar ve fason planın kendisidir; malzeme fire payıyla */
/* talaş kredisi: hammadde ağırlığı (fire dahil) − parçanın net ağırlığı, kalitenin talaş fiyatıyla; net ağırlık ya da talaş fiyatı yoksa hesaplanmaz */
function ymTalas(D, s) {
  const u = D.urunler.find(x => x.id === s.urun); if (!u || u.netKg == null || !(s.malzeme || []).length) return null;
  let kg = 0, tl = 0;
  for (const r of s.malzeme) { const m = D.malzemeler.find(x => x.kod === r.kod); if (!m) return null; const kb = m.birim === 'kg' ? 1 : +m.kgBirim; const ks = mlSatir(D, m);
    const tf = tlSatir(D, m.kalite); if (!(kb > 0) || !tf || tf.fiyat == null) return null; const h = +r.miktar * kb * (1 + (+m.fire || 0) / 100); kg += h; tl += h * +tf.fiyat; }
  const t = (kg - +u.netKg) * s.adet; if (!(t > 0)) return { kg: 0, tl: 0 };
  return { kg: t, tl: tl / kg * t };
}
/* ek mesai bedeli, mesai vardiyasında o tezgâhta çalışan işlere çalıştıkları saat oranında dağıtılır */
function ymMesaiPay(p, cx) {
  const out = {}; if (!p || !cx) return out; const D = S.D;
  for (const e of S.ekMesai || []) { const v = D.vardiyalar.find(x => x.id === e.vardiya); if (!v) continue; const a = e.gun * 24 + hm(v.bas), b = a + ymVH(D, e.vardiya);
    const pay = {}; let top = 0; for (const r of Object.values(p.ops)) { if (r.m !== e.m) continue; const h = Math.min(b, r.C) - Math.max(a, r.S); if (h > 0) { pay[r.job] = (pay[r.job] || 0) + h; top += h; } }
    const tl = ymMesaiTL(D, cx, e); if (!top || !tl) continue; for (const j in pay) out[j] = (out[j] || 0) + tl * pay[j] / top; }
  return out;
}
function ymSipMaliyet(s, p, cx, W, MP) {
  if (!p || !cx) return null; const A = cx.A; const ops = Object.values(p.ops).filter(r => r.job === s.id); if (!ops.length) return null;
  let isl = 0, ayar = 0, fas = 0, gg = 0; const eksik = [];
  for (const r of ops) {
    if (r.fas) { const t = ymFasonTL(cx, r); if (t == null) eksik.push('fason fiyatı'); else fas += t; continue; }
    const M = cx.M[r.m]; if (!M || M.ucret == null) { eksik.push(r.m + ' saat maliyeti'); continue; }
    isl += r.run * (1 - (M.pay || 0)) * M.ucret; ayar += r.su * (M.ucret + (+A.ayarciUcret || 0)); gg += (r.run + r.su) * (+ymAyar().genelGider || 0);
  }
  const mr = cx.mat.res[s.id]; const mal = mr ? mr.fiyat : null; if (mal == null && (s.malzeme || []).length) eksik.push('malzeme kg fiyatı');
  const J = p.J[s.id] || {}; const due = parseT(S.D, s.termin); const Y = ymAyar(); const A2 = agAyar();
  const tutar = s.gelir == null ? null : +s.gelir;
  const fin = tutar != null && s.vade != null ? tutar * A2.fin / 100 * +s.vade : null;
  const erken = J.C != null && due != null ? Math.max(0, due - J.C) : 0;
  const tal = ymTalas(S.D, s); const talas = tal && tal.tl > 0 ? tal.tl : 0;
  const bek = W && W.J[s.id] ? W.J[s.id] : null;
  const mes = MP ? MP[s.id] || 0 : 0;
  const top = (mal || 0) - talas + isl + ayar + gg + fas + mes;
  const gec = J.T > 0.05 ? agGecTL(agBedel(S.D, s), J.T) : 0;
  return { mal, talas, talasKg: tal ? tal.kg : null, isl, ayar, gg, mes, fas, fin, bek, top, eksik: [...new Set(eksik)], tutar, gec, T: J.T, erken, kar: tutar == null || eksik.length ? null : tutar - top, net: tutar == null || eksik.length ? null : tutar - top - gec - (fin || 0) - (bek ? bek.tl : 0) };
}
const ymYuzde = x => x == null || !isFinite(x) ? '—' : '%' + sayi(x * 100, 1);
const ymKilit = ad => kart(`${ic('lock', 'k')} ${ad}`, `<p class="pm-kucuk">Fiyat, maliyet ve kâr bilgisini müdür ve yönetici görür ve girer (karar 180, öneri a). Kullanıcı menüsünden müdür ya da yöneticiye geçerek deneyebilirsiniz.</p>`);
const ymSayi = (chg, v, ad, o = {}) => `<input class="pm-mz-sec pm-ag-sayi" type="number" min="${o.min ?? 0}" ${o.max != null ? `max="${o.max}"` : ''} step="${o.adim || 'any'}" value="${v ?? ''}" placeholder="${esc(o.yer || '—')}" data-chg="${chg}" ${o.veri || ''} aria-label="${esc(ad)}">`;
const ymKpi = l => `<div class="pm-mp-kpi">${l.map(([sm, ad, d, alt, ton]) => `<div ${ton ? `data-ton="${ton}"` : ''}><small>${ic(sm, 'k')}${ad}</small><b class="mono">${esc(d)}</b><span>${alt}</span></div>`).join('')}</div>`;

/* ---------- Maliyetler ---------- */
function sMaliyetler() {
  const D = S.D; const fg = agFiyatGorur(); const Y = ymAyar(); const A = D.ayarlar || {};
  const amacSeg = `<div class="pm-seg" role="group" aria-label="Plan amacı">${[['tl', 'Tek TL toplamı'], ['sira', 'Önce gecikme (eski sıra)']].map(([k, ad]) => `<button type="button" data-act="ym-amac" data-v="${k}" aria-pressed="${Y.amac === k}" ${fg ? '' : 'disabled'}>${ad}</button>`).join('')}</div>`;
  const bedelDegil = agAyar().kip !== 'bedel';
  const amac = kart(`${ic('target', 'k')} Plan neyi en aza indirir`, `<div class="pm-sira">${amacSeg}<label class="pm-ym-alan"><span>Tampon riski katsayısı</span>${fg ? ymSayi('ym-ayar', Y.risk, 'Tampon riski katsayısı', { adim: 0.05, max: 1, veri: 'data-k="risk"' }) : `<b class="mono">${sayi(Y.risk, 2)}</b>`}</label></div>
    <p class="pm-kucuk">${Y.amac === 'tl' ? 'Plan tek bir TL toplamını en aza indirir: gecikme saati × siparişin 1 saatlik gecikme bedeli, tampon ihlali × bedel × risk katsayısı, işleme, ayar, fason ve ek mesai TL. ' + (wipAyar().ac ? ' Yarı mamul ve mamul bekleme maliyeti de toplama girer.' : '') + ' Ek mesai ve fason ancak önlediği gecikme bedelinden ucuzsa plana girer. Eşit TL\'de az değişiklik, sonra az ayar seçilir.' : 'Plan önce ağırlıklı gecikme saatine bakar, maliyete yalnız gecikme eşitse bakar (karar 203 öncesi düzen; kıyas için).'}${bedelDegil ? ' <b>Ağırlık şimdi öncelik sınıfından geliyor; tek TL toplamı yalnız gecikme bedeli kipinde çalışır (Öncelik ve ağırlık).</b>' : ''}</p>`);
  if (!fg) return amac + ymKilit('Maliyetler');
  const tez = D.tezgahlar.map(m => { const op = Y.operatorUcret != null ? +Y.operatorUcret * (m.opOran == null ? 1 : +m.opOran) : 0;
    return `<tr>${td('Tezgâh', `<b class="mono">${esc(m.id)}</b><small class="pm-ag-not">${esc(m.ad)}</small>`)}${td('Grup', esc(m.grup))}${td('Makine TL/sa', ymSayi('ym-tez', m.ucret, m.id + ' saat maliyeti', { adim: 10, veri: `data-v="${esc(m.id)}"` }), 'pm-num')}${td('Operatör payı', sayi(m.opOran == null ? 1 : m.opOran, 2), 'pm-num')}${td('Toplam TL/sa', `<b class="mono">${m.ucret == null ? '—' : sayi(+m.ucret + op, 0)}</b>`, 'pm-num')}</tr>`; }).join('');
  const tezKart = kart(`${ic('cpu', 'k')} Tezgâh saat maliyeti`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th>Grup</th><th class="pm-num">Makine TL/sa</th><th class="pm-num">Operatör payı</th><th class="pm-num">Toplam TL/sa</th></tr></thead><tbody>${tez}</tbody></table></div>
    <p class="pm-kucuk">Makine saat maliyeti doğrudan giderdir: enerji, bakım, sarf. Amortisman ve kira genel giderde durur (211 a). Operatör ücreti ayrıca girilirse operatör payıyla eklenir (yarım operatörlü tezgâhta yarısı); boşsa makine maliyetine dahil sayılır.</p>`);
  const alan = (k, ad, v, o) => `<label class="pm-ym-alan"><span>${ad}</span>${ymSayi('ym-ayar', v, ad, { ...o, veri: `data-k="${k}"` })}</label>`;
  const iscilik = kart(`${ic('user', 'k')} İşçilik ve mesai`, `<div class="pm-ym-alanlar">
    <label class="pm-ym-alan"><span>Ayarcı ücreti TL/sa</span>${ymSayi('ym-ayarlar', A.ayarciUcret, 'Ayarcı ücreti', { adim: 10, veri: 'data-k="ayarciUcret"', max: 100000 })}</label>
    ${alan('operatorUcret', 'Operatör ücreti TL/sa', Y.operatorUcret, { adim: 10, yer: 'makineye dahil' })}
    <label class="pm-ym-alan"><span>Mesai ücreti TL/sa</span>${ymSayi('ym-ayarlar', A.mesaiUcret, 'Mesai ücreti', { adim: 10, veri: 'data-k="mesaiUcret"', max: 100000 })}</label>
    ${alan('mesaiCarpan', 'Hafta sonu ve tatil mesai çarpanı', Y.mesaiCarpan, { adim: 0.1, min: 1, max: 3, yer: '1' })}
    ${alan('genelGider', 'Genel gider TL/tezgâh saati', Y.genelGider, { adim: 10, max: 100000, yer: 'yok' })}
    ${alan('karHedef', 'Varsayılan hedef kâr oranı %', Y.karHedef, { adim: 1, max: 300 })}</div>
    <p class="pm-kucuk">Finansman oranı (%${sayi(agAyar().fin, 2)}/gün) Öncelik ve ağırlık sayfasındadır. Genel gider ürün maliyetinde ve teklifte sayılır, plan amacına girmez: kira ve amortisman iş hangi tezgâhta yapılırsa yapılsın aynıdır.</p>`);
  const kul = r => D.malzemeler.filter(m => mlSatir(D, m) === r);
  const kg = (D.kgFiyat || []).map(r => { const l = kul(r);
    return `<tr>${td('Cins', esc(r.cins || '—'))}${td('Kalite', `<b>${esc(r.kalite)}</b>`)}${td('Form', esc(r.form || 'her form'))}${td('TL/kg', ymSayi('ym-kg', r.fiyat, r.kalite + ' kg fiyatı', { adim: 1, veri: `data-v="${esc(r.id)}" data-k="fiyat"` }), 'pm-num')}${td('Fire %', ymSayi('ym-kg', r.fire, r.kalite + ' fire payı', { adim: 0.5, max: 200, veri: `data-v="${esc(r.id)}" data-k="fire"`, yer: '0' }), 'pm-num')}
      ${td('Kullanan', l.length ? `<span class="pm-cipler">${l.map(m => `<span class="pm-cip" title="${esc(m.ad)}">${esc(m.kod)} · ${m.birimFiyat == null ? 'kg ağırlığı yok' : sayi(m.birimFiyat, 2) + ' TL/' + esc(m.birim)}</span>`).join('')}</span>` : '<span class="pm-kucuk">yok</span>')}${td('Güncelleme', `<span class="pm-kucuk">${esc(r.tarih || '—')} · ${esc(r.kim || '')}</span>`)}${td('', l.length ? '' : dugme('', 'ym-kg-sil', { simge: 'trash', hayalet: true, kucuk: true, ad: 'Sil', veri: `data-v="${esc(r.id)}"` }))}</tr>`; }).join('');
  const fiyatsiz = D.malzemeler.filter(m => m.birimFiyat == null);
  const kgForm = `<form class="pm-ym-yeni" data-form="ym-kg-yeni" novalidate><select class="tc-alan-kutu" name="cins" aria-label="Cins">${ML_CINS.map(x => `<option>${esc(x)}</option>`).join('')}</select>
    <input class="tc-alan-kutu" name="kalite" placeholder="Kalite" aria-label="Kalite" required><select class="tc-alan-kutu" name="form" aria-label="Form"><option value="">Her form</option>${ML_FORM.map(x => `<option>${esc(x)}</option>`).join('')}</select>
    <input class="tc-alan-kutu" name="fiyat" type="number" min="0" step="any" placeholder="TL/kg" aria-label="TL/kg" required><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil">${ic('plus', 'k')}Ekle</button></form>`;
  const kgKart = kart(`${ic('box', 'k')} Malzeme kg fiyatları`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Cins</th><th>Kalite</th><th>Form</th><th class="pm-num">TL/kg</th><th class="pm-num">Fire %</th><th>Kullanan malzemeler</th><th>Güncelleme</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${kg || '<tr><td colspan="8" class="pm-kucuk">Fiyat yok.</td></tr>'}</tbody></table></div>${kgForm}
    <p class="pm-kucuk">Malzemenin birim maliyeti buradan anlık gelir: kalite ve form eşleşen satır, yoksa kalitenin "her form" satırı. Birimi kg olmayan malzemede bir birimin ağırlığı gerekir. Fire payı (talaş ve hurda) ihtiyacı büyütür; malzeme planı ve maliyet ikisi de bunu sayar.${fiyatsiz.length ? ` <b>Kg fiyatı bulunmayan malzeme:</b> ${fiyatsiz.map(m => esc(m.kod)).join(', ')}.` : ''}</p>`);
  const fas = (D.fasoncular || []).map(f => { const talas = f.id === A.fasonTalas;
    return `<tr>${td('Fasoncu', `<b>${esc(f.ad)}</b><small class="pm-ag-not mono">${esc(f.id)}</small>`)}${td('Fiyat', talas ? `${ymSayi('ym-fas', f.saatFiyat, f.ad + ' saat fiyatı', { adim: 10, veri: `data-v="${esc(f.id)}" data-k="saatFiyat"` })} <span class="pm-kucuk">TL/sa</span>` : `${ymSayi('ym-fas', f.fiyat, f.ad + ' fiyatı', { adim: 1, veri: `data-v="${esc(f.id)}" data-k="fiyat"` })} <span class="pm-kucuk">TL/adet</span>`, 'pm-num')}${td('Taşıma', `${ymSayi('ym-fas', f.tasima, f.ad + ' taşıma', { adim: 0.5, veri: `data-v="${esc(f.id)}" data-k="tasima"`, yer: '0' })} <span class="pm-kucuk">TL/adet</span>`, 'pm-num')}${td('Süre', `${sayi(f.sureGun, 1)} gün`, 'pm-num')}</tr>`; }).join('');
  const fasKart = kart(`${ic('truck', 'k')} Fason fiyatları`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Fasoncu</th><th class="pm-num">Fiyat</th><th class="pm-num">Taşıma</th><th class="pm-num">Süre</th></tr></thead><tbody>${fas}</tbody></table></div><p class="pm-kucuk">Talaşlı fason tezgâh saatiyle fiyatlanır (işin en kısa tezgâh süresi × saat fiyatı).</p>`);
  const tl = [...(D.talasFiyat || [])].sort((a, b) => String(a.cins).localeCompare(String(b.cins), 'tr') || String(a.kalite).localeCompare(String(b.kalite), 'tr')).map(t => {
    const kg = (D.kgFiyat || []).filter(r => mlNorm(r.kalite) === mlNorm(t.kalite) && r.fiyat != null).map(r => +r.fiyat); const kf = kg.length ? Math.min(...kg) : null;
    return `<tr>${td('Cins', esc(t.cins || '—'))}${td('Kalite', `<b>${esc(t.kalite)}</b>`)}${td('Talaş TL/kg', ymSayi('ym-talas', t.fiyat, t.kalite + ' talaş satış fiyatı', { adim: 0.5, veri: `data-v="${esc(t.kalite)}"` }), 'pm-num')}${td('Hammadde oranı', kf && t.fiyat != null ? ymYuzde(t.fiyat / kf) : '—', 'pm-num')}${td('Güncelleme', `<span class="pm-kucuk">${esc(t.tarih || '—')} · ${esc(t.kim || '')}</span>`)}</tr>`; }).join('');
  const tlKart = kart(`${ic('rotate', 'k')} Malzeme talaş satış fiyatları`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Cins</th><th>Kalite</th><th class="pm-num">Talaş TL/kg</th><th class="pm-num">Hammadde oranı</th><th>Güncelleme</th></tr></thead><tbody>${tl || '<tr><td colspan="5" class="pm-kucuk">Kg fiyatı girilen kalite yok.</td></tr>'}</tbody></table></div>
    <p class="pm-kucuk">Kalite başına tek fiyat; kg fiyatı eklenen her kalite burada da görünür. Talaşın değeri malzeme maliyetinden düşülür: (hammadde kg × (1 + fire) − net parça kg) × adet × talaş fiyatı (214 a). Hammadde oranı talaş fiyatının en düşük kg fiyatına oranıdır. "deneme örneği" yazanlar kg fiyatının beşte biridir.</p>`);
  return amac + tezKart + `<div class="pm-iki">${iscilik}${fasKart}</div>` + kgKart + tlKart + ymBeklemeKart();
}

/* bekleme maliyeti ayarları; alan, elleçleme ve bozulma Proje maliyet incelemesindeki K3-K5 cevaplanana kadar kapalı başlar */
function ymBeklemeKart() {
  const D = S.D; const w = wipAyar(); const f = agAyar().fin;
  const seg = (act, k, acik, ad) => `<div class="pm-seg" role="group" aria-label="${esc(ad)}">${[[1, 'Açık'], [0, 'Kapalı']].map(([v, a]) => `<button type="button" data-act="${act}" data-v="${k}:${v}" aria-pressed="${!!acik === !!v}">${a}</button>`).join('')}</div>`;
  const ur = D.urunler.map(u => { const n = (k, ad, o) => td(ad, ymSayi('ym-urun', u[k], u.id + ' ' + ad, { ...o, veri: `data-v="${esc(u.id)}" data-k="${k}"` }), 'pm-num');
    return `<tr>${td('Ürün', `<b class="mono">${esc(u.id)}</b><small class="pm-ag-not">${esc(u.ad)}</small>`)}${n('netKg', 'Net parça kg', { adim: 0.01, yer: '—' })}</tr>`; }).join('');
  return kart(`${ic('pause', 'k')} Bekleme maliyeti`, `<div class="pm-sira"><span>Plan amacına katılsın</span>${seg('ym-wip-bil', 'ac', w.ac, 'Bekleme maliyeti plan amacında')}</div>
    <div class="pm-sira"><span>Ödeme vadesi başlar</span><div class="pm-seg" role="group" aria-label="Ödeme vadesi başlangıcı">${[['bitis', 'Üretim bitince'], ['termin', 'Terminde']].map(([k, a]) => `<button type="button" data-act="ym-wip-vade" data-v="${k}" aria-pressed="${w.vadeBas === k}">${a}</button>`).join('')}</div></div>
    <p class="pm-kucuk">${w.vadeBas === 'termin' ? 'Erken biten iş termine kadar bekler; bekleyen değerin finansmanı maliyettir.' : 'Erken biten iş teslim edilir ve vade o gün başlar: termine kalan gün kadar ödeme erken gelir, tutar × finansman oranı × gün kazanılır. Bu kazanç plan amacında eksi maliyet olarak sayılır.'}</p>
    <p class="pm-kucuk">Bekleme süresi plandan çıkar, sabit bir rota değeri değildir: malzemenin hazır olmasından ilk adıma, bir adımın bitişinden sonrakinin başlamasına ve son adımdan termine kadar. Bekleyen değer malzeme ile o ana kadar biten adımların maliyetidir. Finansman oranı %${sayi(f, 2)}/gün (aylık %${sayi(f * 30, 1)}, yıllık %${sayi(f * 365, 0)}); Öncelik ve ağırlık sayfasındaki oranın aynısıdır.</p>
    <p class="pm-kucuk">Alan ve iç taşıma genel giderde kalır; bozulma riski ayrıca eklenmez, hurda payıyla karşılanır (212 a).</p>
    <div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Ürün</th><th class="pm-num">Net parça kg</th></tr></thead><tbody>${ur}</tbody></table></div>
    <p class="pm-kucuk">Net parça ağırlığı talaş için gerekir: hammadde ağırlığı (fire dahil) ile net ağırlık farkı, kg fiyatları tablosundaki talaş satış fiyatıyla malzeme maliyetinden düşülür (214 a).</p>`);
}

/* ---------- Siparişler: maliyetten kâr oranı ---------- */
const YM_ORAN = [0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
function sSiparisKar() {
  const D = S.D; const fg = agFiyatGorur(); const p = S.plan; const cx = cxAl(); const Y = ymAyar();
  if (!fg) return ymKilit('Siparişler: maliyet ve kâr');
  if (!p) return kart(`${ic('list', 'k')} Siparişler: maliyet ve kâr`, '<p class="pm-kucuk">Maliyet plandan çıkar (tezgâh, ayar, fason). Önce plan kurulmalı.</p>');
  const W = wipHesap(p, stOf(), cx);
  const MP = ymMesaiPay(p, cx);
  const rows = D.siparisler.filter(s => !s.havuz).map(s => ({ s, x: ymSipMaliyet(s, p, cx, W, MP) }));
  const sum = f => rows.reduce((a, r) => a + (r.x && f(r.x) != null ? f(r.x) : 0), 0);
  const tutar = sum(x => x.tutar), top = sum(x => x.top), gec = sum(x => x.gec), net = sum(x => x.net); const wa = wipAyar();
  const kpi = ymKpi([['lira', 'Toplam tutar', agTL(tutar), `${rows.filter(r => r.s.gelir != null).length} fiyatlı sipariş`], ['layers', 'Toplam maliyet', agTL(top), 'malzeme, işleme, ayar, genel gider, fason, ek mesai'],
    ['chart', 'Brüt kâr oranı', ymYuzde(top ? (tutar - top) / top : null), 'maliyet üstüne'], ['clock', 'Gecikme bedeli', agTL(gec), 'bu planda', gec > 0 ? 'uyari' : 'tamam'], ['pause', 'Bekleme maliyeti', W.tl < 0 ? '−' + agTL(-W.tl) : agTL(W.tl), `${sayi(W.saat, 0)} sa bekleme${W.tah < -0.5 ? ' · erken tahsilat −' + agTL(-W.tah) : ''}${wa.ac ? '' : ' · plan amacında değil'}`], ['check', 'Net kâr', agTL(net), 'gecikme, finansman, bekleme düşülmüş', net < 0 ? 'hata' : '']]);
  const tr = rows.map(({ s, x }) => {
    if (!x) return `<tr>${td('Sipariş', `<b class="mono">${esc(s.id)}</b>`)}<td colspan="7" class="pm-kucuk">Planda yok.</td></tr>`;
    const hedef = s.karOran != null ? +s.karOran : Y.karHedef; const oner = x.eksik.length ? null : x.top * (1 + hedef / 100);
    const gercek = x.kar == null || !x.top ? null : x.kar / x.top;
    const sec = `<select class="pm-mz-sec" data-chg="ym-oran" data-v="${esc(s.id)}" aria-label="${esc(s.id)} hedef kâr oranı">${[...new Set([...YM_ORAN, hedef])].sort((a, b) => a - b).map(o => `<option value="${o}" ${o === hedef ? 'selected' : ''}>%${sayi(o, 1)}</option>`).join('')}</select>`;
    const fark = oner != null && x.tutar != null ? x.tutar - oner : null;
    return `<tr>${td('Sipariş', `<b class="mono">${esc(s.id)}</b><small class="pm-ag-not">${esc(urunAd(s.urun))} · ${sayi(s.adet, 0)} adet</small>`)}
      ${td('Maliyet', `<b class="mono">${x.eksik.length ? '—' : agTL(x.top)}</b><small class="pm-ym-dok"><span>malzeme ${agTL(x.mal)}</span>${x.talas ? `<span>talaş −${agTL(x.talas)}</span>` : ''}<span>işleme ${agTL(x.isl)}</span><span>ayar ${agTL(x.ayar)}</span>${x.gg ? `<span>genel gider ${agTL(x.gg)}</span>` : ''}${x.mes ? `<span>ek mesai ${agTL(x.mes)}</span>` : ''}${x.fas ? `<span>fason ${agTL(x.fas)}</span>` : ''}</small>${x.eksik.length ? `<span class="pm-ag-uyari">${ic('alert', 'k')}${esc(x.eksik.join(', '))} yok</span>` : ''}`, 'pm-num')}
      ${td('Tutar ve vade', `<span class="pm-ym-iki">${ymSayi('ag-sip', s.gelir, s.id + ' tutar', { adim: 100, veri: `data-k="gelir" data-v="${esc(s.id)}"`, yer: 'fiyatsız' })}<span class="pm-ym-vade">${ymSayi('ym-vade', s.vade, s.id + ' ödeme vadesi', { adim: 1, max: 365, veri: `data-v="${esc(s.id)}"`, yer: 'vade' })}<small>gün</small></span></span>`, 'pm-num')}
      ${td('Kâr oranı', `<b class="mono" ${gercek != null && gercek < hedef / 100 ? 'data-ton="uyari"' : ''}>${ymYuzde(gercek)}</b>`, 'pm-num')}
      ${td('Hedef ve önerilen fiyat', `<span class="pm-ym-oner">${sec}<b class="mono">${agTL(oner)}</b>${oner != null && (x.tutar == null || Math.abs(x.tutar - oner) >= 1) ? dugme('Uygula', 'ym-fiyat', { kucuk: true, simge: 'check', veri: `data-v="${esc(s.id)}"` }) : ''}</span>${fark != null && Math.abs(fark) >= 1 ? `<small class="pm-ym-dok">${fark > 0 ? 'tutar ' + agTL(fark) + ' üstünde' : 'tutar ' + agTL(-fark) + ' altında'}</small>` : ''}`, 'pm-num')}
      ${td('Gecikme', x.T > 0.05 ? `<span class="pm-ag-gec">${esc(saat(x.T))}</span><small class="pm-ag-not mono">${agTL(x.gec)}</small>` : x.erken > 0.05 ? `<span class="pm-kucuk">erken ${esc(saat(x.erken))}</span>` : 'yok', 'pm-num')}
      ${td('Bekleme', x.bek && Math.abs(x.bek.tl) >= 0.5 ? `<b class="mono" ${x.bek.tl < 0 ? 'data-ton="tamam"' : ''}>${x.bek.tl < 0 ? '−' + agTL(-x.bek.tl) : agTL(x.bek.tl)}</b><small class="pm-ym-dok">${[['ilk', 'malzeme'], ['ara', 'adımlar arası'], ['son', 'termine kadar']].filter(([k]) => x.bek[k] >= 0.5).map(([k, ad]) => `<span>${ad} ${agTL(x.bek[k])}</span>`).join('')}${x.bek.tah <= -0.5 ? `<span>erken tahsilat −${agTL(-x.bek.tah)}</span>` : ''}<span>${sayi(x.bek.saat, 0)} sa</span></small>` : 'yok', 'pm-num')}
      ${td('Net kâr', `<b class="mono" ${x.net != null && x.net < 0 ? 'data-ton="hata"' : ''}>${agTL(x.net)}</b>${x.fin ? `<small class="pm-ag-not">finansman ${agTL(x.fin)}</small>` : ''}`, 'pm-num')}</tr>`;
  }).join('');
  const toplu = `<div class="pm-sira"><span class="pm-kucuk pm-sira-ara">Önerilen fiyat = maliyet × (1 + hedef kâr oranı). Uygula siparişin tutarını değiştirir; gecikme bedeli ve öncelik tutardan yeniden hesaplanır.</span>${dugme('Fiyatsızlara önerilen fiyatı yaz', 'ym-fiyat-toplu', { kucuk: true, simge: 'lira' })}</div>`;
  return kart(`${ic('list', 'k')} Siparişler: maliyet ve kâr <span class="pm-kucuk">plandan</span>`, `${kpi}${toplu}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-ym-tablo"><thead><tr><th>Sipariş</th><th class="pm-num">Maliyet</th><th class="pm-num">Tutar · vade</th><th class="pm-num">Kâr oranı</th><th class="pm-num">Hedef · önerilen fiyat</th><th class="pm-num">Gecikme</th><th class="pm-num">Bekleme</th><th class="pm-num">Net kâr</th></tr></thead><tbody>${tr}</tbody></table></div>
    <p class="pm-kucuk">Maliyet son plandaki tezgâh seçimi, ayar ve fasondan; malzeme kg fiyatı ve fire payıyla. Kâr oranı maliyet üstünedir. Net kâr = tutar − maliyet − gecikme bedeli − finansman (tutar × %${sayi(agAyar().fin, 2)}/gün × vade) − bekleme maliyeti. Bekleme plandan çıkar: malzemenin hazır olmasından ilk adıma ve adımlar arasında bekleyen değerin finansmanı. ${wipAyar().vadeBas === 'termin' ? 'Vade terminde başladığı için son adımdan termine kadar bekleme de sayılır.' : 'Vade üretim bitince başladığı için erken biten siparişin parası erken gelir; bu kazanç bekleme maliyetinden düşülür (erken tahsilat).'} Ayar Maliyetler sayfasında. Talaş kredisi, net ağırlık ve talaş fiyatı girilmiş üründe malzemeden düşülür. Vade bir saatlik gecikmenin bedelini değiştirmez: gecikme ödemeyi vadeden bağımsız olarak aynı süre kaydırır.${planGuncel() ? '' : ' <b>Veri plandan sonra değişti; maliyet yeniden çözülünce güncellenir.</b>'}</p>`);
}

/* ---------- öneri ölçümü: aynı başlangıç planından kısa iyileştirme, sonra TL farkı ---------- */
function ymOlc(st, mod) {
  const cx = compile(st); const yon = mod ? mod(cx) || [] : [];
  const p0 = lnsDecode(st, { ops: S.plan.ops, fail: S.plan.fail || [] }, yon, cx, true); p0.cx = p0.cx || cx;
  const L = lns(st, p0, null, { ms: 300, seed: 11, free: true }); const e0 = evaluate(p0, st, null, true);
  const p = cmpEv(L.e, e0) > 0 ? L.plan : p0; p.cx = p.cx || cx; slack(p, cx); const e = evaluate(p, st, null, true);
  return { p, e, cx, gec: ymGecTL(e), diger: e.tl - e.mesaiTL, fail: (p.fail || []).length };
}
/* darboğaz saatinin TL değeri: tezgâhta tamponsuz kalan geç işlerin 1 saatlik gecikme bedelleri toplamı */
function ymDarbogaz(p, cx, ev) {
  const val = {}, days = {}, isler = {};
  for (const r of Object.values(p.ops)) { if (r.fas || r.pin || r.done) continue; const J = ev.J[r.job]; if (!J || !(J.T > 0.05) || !(r.sl < 0)) continue;
    const s = S.D.siparisler.find(x => x.id === r.job); if (!s) continue; const b = agBedel(S.D, s).b;
    (isler[r.m] = isler[r.m] || new Set()).add(r.job); val[r.m] = (val[r.m] || 0) + b; (days[r.m] = days[r.m] || new Set()).add(Math.floor(Math.max(r.S, 7) / 24)); }
  for (const m in val) val[m] = [...isler[m]].reduce((a, j) => a + agBedel(S.D, S.D.siparisler.find(x => x.id === j)).b, 0);
  return { val, days, isler };
}
const ymKarar = () => ['mudur', 'yonetici'].includes(kim().rol);
const ymAnahtar = e => `${e.m}|${e.gun}|${e.vardiya}`;

/* ---------- Ek mesai planı ---------- */
async function ymMesaiOner() {
  if (!S.plan || !planGuncel() || calisan) { bildir(!S.plan ? 'Önce plan kurulmalı.' : 'Önce güncel veriyle planı çözün.', 'hata'); return; }
  U.ymMs = { run: 'Darboğaz tezgâhlar bulunuyor…' }; render(); await bekleKisa();
  try {
    const st = stOf(); const cx = compile(st); const D = st.D;
    const b = ymOlc(st); const dar = ymDarbogaz(b.p, cx, b.e);
    const red = new Set(((S.D.mesaiKarar || []).filter(k => k.karar === 'red')).map(ymAnahtar)); const var0 = new Set(S.ekMesai.map(ymAnahtar));
    const top = Object.entries(dar.val).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(x => x[0]); const v1 = D.vardiyalar[0].id; const aday = [];
    for (const m of top) { let n = 0; const own = cx.M[m].vardiyalar || []; const ok = x => !own.length || own.includes(x);
      for (const d of [...dar.days[m]].sort((a, b2) => a - b2)) { if (n >= 3) break;
        if (cx.days[d] && cx.days[d].vard.length && !cx.days[d].vard.includes('V3') && D.vardiyalar.some(v => v.id === 'V3') && ok('V3')) { aday.push({ m, gun: d, vardiya: 'V3' }); n++; }
        const e = d + 1; if (e < HDAYS && cx.days[e] && !cx.days[e].vard.length) { aday.push({ m, gun: e, vardiya: v1 }); n++; } } }
    const l = [...new Map(aday.filter(a => !red.has(ymAnahtar(a)) && !var0.has(ymAnahtar(a))).map(a => [ymAnahtar(a), a])).values()].slice(0, 8); const liste = [];
    for (let i = 0; i < l.length; i++) {
      U.ymMs.run = `Motor öneriyi ölçüyor ${i + 1}/${l.length}…`; render(); await bekleKisa();
      const stC = { ...stOf(), ekMesai: [...clone(S.ekMesai), l[i]] }; const r = ymOlc(stC);
      const tl = ymMesaiTL(D, cx, l[i]); const dGec = b.gec - r.gec; const dDiger = r.diger - b.diger;
      liste.push({ ...l[i], saat: ymVH(D, l[i].vardiya), tl, dGec, dDiger, dT: b.e.sumT - r.e.sumT, net: dGec * pdKat(pdDenge()) - tl - dDiger, deger: dar.val[l[i].m] || 0, isler: [...(dar.isler[l[i].m] || [])] });
    }
    liste.sort((a, b2) => b2.net - a.net);
    U.ymMs = { dv: S.dataVer, liste, dar: top.map(m => [m, dar.val[m], [...dar.isler[m]]]) };
  } catch (e) { console.error(e); U.ymMs = { err: 'Öneri hesaplanamadı: ' + e.message }; }
  render();
}
function sMesaiPlani() {
  const D = S.D; const fg = agFiyatGorur(); const kr = ymKarar(); const cx = cxAl(); const m = U.ymMs && (U.ymMs.run || U.ymMs.err || U.ymMs.dv === S.dataVer) ? U.ymMs : null;
  const Y = ymAyar(); const kab = (S.D.mesaiKarar || []).filter(k => k.karar === 'kabul'); const kim0 = e => kab.find(k => ymAnahtar(k) === ymAnahtar(e));
  const tlE = e => cx ? ymMesaiTL(D, cx, e) : null; const topTL = S.ekMesai.reduce((a, e) => a + (tlE(e) || 0), 0); const topH = S.ekMesai.reduce((a, e) => a + ymVH(D, e.vardiya), 0);
  const butce = +(S.param.mesaiHafta ?? W0.mesaiHafta) || 0;
  const kpi = ymKpi([['clock', 'Planlı ek mesai', `${sayi(topH, 1)} sa`, `${S.ekMesai.length} vardiya`], ['lira', 'Mesai maliyeti', fg ? agTL(topTL) : 'müdürde', `${sayi(D.ayarlar.mesaiUcret, 0)} TL/sa, hafta sonu ×${sayi(Y.mesaiCarpan, 1)}`], ['gauge', 'Haftalık sınır', butce ? `${sayi(butce, 0)} sa` : 'yok', 'Kısıtlar sayfasında']]);
  const plan = S.ekMesai.map((e, i) => { const k = kim0(e);
    return `<tr>${td('Tezgâh', `<b class="mono">${esc(e.m)}</b>`)}${td('Gün', esc(fmtDT(D, e.gun * 24).slice(0, 9)))}${td('Vardiya', `${esc(e.vardiya)} · ${sayi(ymVH(D, e.vardiya), 1)} sa`)}${fg ? td('Maliyet', `<span class="mono">${agTL(tlE(e))}</span>`, 'pm-num') : ''}${td('Karar', k ? `${rozet('Kabul', 'tamam')} <span class="pm-kucuk">${esc(k.kim)}${k.net != null && fg ? ` · net ${agTL(k.net)}` : ''}</span>` : rozet('Elle girildi', 'pasif'))}${td('', kr ? dugme('', 'ym-mesai-kaldir', { simge: 'trash', hayalet: true, kucuk: true, ad: 'Kaldır', veri: `data-v="${i}"` }) : '')}</tr>`; }).join('');
  const planKart = kart(`${ic('clock', 'k')} Ek mesai planı`, `${kpi}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th>Gün</th><th>Vardiya</th>${fg ? '<th class="pm-num">Maliyet</th>' : ''}<th>Karar</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${plan || `<tr><td colspan="6" class="pm-kucuk">Planlı ek mesai yok.</td></tr>`}</tbody></table></div>`);
  let oneri;
  if (m && m.run) oneri = `<p class="pm-kucuk" role="status">${ic('cpu', 'k')} ${esc(m.run)}</p>`;
  else if (m && m.err) oneri = `<p class="pm-ag-uyari">${esc(m.err)}</p>`;
  else if (m) {
    const dar = m.dar.length ? `<div class="pm-ym-dar">${m.dar.map(([t, v, l]) => `<span><b class="mono">${esc(t)}</b> 1 saati <b class="mono">${agTLs(v)}</b> <small>${l.length} geç iş: ${esc(l.slice(0, 4).join(', '))}${l.length > 4 ? '…' : ''}</small></span>`).join('')}</div>` : '<p class="pm-kucuk">Tamponsuz kalan geç iş yok; darboğaz görünmüyor.</p>';
    const tr = m.liste.map((a, i) => { const iyi = a.net > 0;
      return `<tr>${td('Tezgâh', `<b class="mono">${esc(a.m)}</b>`)}${td('Gün', `${esc(fmtDT(D, a.gun * 24).slice(0, 9))} · ${esc(a.vardiya)} ${sayi(a.saat, 1)} sa`)}${td('Gecikme azalır', `<span class="mono">${esc(saat(a.dT))}</span><small class="pm-ag-not mono">${agTL(a.dGec)}</small>`, 'pm-num')}${fg ? td('Mesai', `<span class="mono">${agTL(a.tl)}</span>${Math.abs(a.dDiger) >= 1 ? `<small class="pm-ag-not">ayar ve işleme ${a.dDiger > 0 ? '+' : '−'}${agTL(Math.abs(a.dDiger))}</small>` : ''}`, 'pm-num') + td('Net kazanç', `<b class="mono" data-ton="${iyi ? 'tamam' : 'hata'}">${agTL(a.net)}</b>`, 'pm-num') : ''}
        ${td('Öneri', iyi ? rozet('Açılsın', 'tamam') : rozet('Ödemiyor', 'pasif'))}${td('', kr ? `<span class="pm-dugmeler">${dugme('Kabul', 'ym-mesai-kabul', { kucuk: true, birincil: iyi, simge: 'check', veri: `data-v="${i}"` })}${dugme('Red', 'ym-mesai-red', { kucuk: true, hayalet: true, simge: 'x', veri: `data-v="${i}"` })}</span>` : '<span class="pm-kucuk">kararı müdür verir</span>')}</tr>`; }).join('');
    oneri = `${dar}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th>Gün</th><th class="pm-num">Gecikme azalır</th>${fg ? '<th class="pm-num">Mesai</th><th class="pm-num">Net kazanç</th>' : ''}<th>Öneri</th><th><span class="tc-gizli-etiket">Karar</span></th></tr></thead><tbody>${tr || `<tr><td colspan="7" class="pm-kucuk">Ölçülecek aday yok (reddedilenler tekrar önerilmez).</td></tr>`}</tbody></table></div>`;
  } else oneri = `<p class="pm-kucuk">Öneri için güncel plan gerekir. Plan, darboğaz tezgâhlara ek vardiya açmayı tek tek dener ve her birini motorla ölçer.</p>`;
  const red = (S.D.mesaiKarar || []).filter(k => k.karar === 'red');
  const not = `<p class="pm-kucuk">Darboğaz tezgâhın 1 saatinin değeri, orada tamponsuz kalan geç işlerin gecikme bedelleri toplamıdır. Net kazanç = önlenen gecikme bedeli × plan dengesi çarpanı (${pdKatYaz(pdDenge())}, Termin ve kâr sayfası) − mesai maliyeti − ayar ve işleme farkı; artıysa plan "açılsın" der. Kabul edilen mesai planın takvimine girer, plan yeniden çözülünce kullanılır. Reddedilen öneri tekrar gelmez${red.length ? ` (${red.length} red)` : ''}.</p>`;
  return planKart + kart(`${ic('target', 'k')} Plan önerisi`, oneri + not, dugme(m && m.dv != null ? 'Yeniden hesapla' : 'Önerileri hesapla', 'ym-mesai-oner', { kucuk: true, birincil: !(m && m.dv != null), simge: 'play' }));
}

/* ---------- Fason planı ---------- */
async function ymFasonOner() {
  if (!S.plan || !planGuncel() || calisan) { bildir(!S.plan ? 'Önce plan kurulmalı.' : 'Önce güncel veriyle planı çözün.', 'hata'); return; }
  U.ymFs = { run: 'Fasona uygun işler bulunuyor…' }; render(); await bekleKisa();
  try {
    const st = stOf(); const cx = compile(st); const A = cx.A; const T0 = '@' + A.fasonTalas; const k = S.D.fasonKarar || {};
    const b = ymOlc(st); const dar = ymDarbogaz(b.p, cx, b.e); const aday = [];
    for (const r of Object.values(S.plan.ops)) { const o = cx.byId[r.id]; if (!o || r.done || r.act || k[r.id] || !o.c.some(c => c.opt)) continue;
      if (r.m === T0) aday.push({ id: r.id, yon: 'iceri' });
      else if (dar.val[r.m] && dar.isler[r.m].has(r.job) && r.sl < 0) aday.push({ id: r.id, yon: 'disari', m: r.m }); }
    const l = aday.sort((x, y) => (dar.val[y.m] || 1e9) - (dar.val[x.m] || 1e9)).slice(0, 8); const liste = [];
    for (let i = 0; i < l.length; i++) { const a = l[i];
      U.ymFs.run = `Motor öneriyi ölçüyor ${i + 1}/${l.length}…`; render(); await bekleKisa();
      const r = ymOlc(stOf(), c => { const o = c.byId[a.id] || c.ops.find(x => x.id === a.id); if (!o) return; fasonZorla(o, a.yon === 'disari');
        /* başlangıç planı işi eski yerinde tutar; zorlanan yere taşınmazsa yerleşemez */
        const r0 = S.plan.ops[a.id]; const m = a.yon === 'disari' ? o.c[0].m : o.c.filter(x => !x.fas).sort((x, y) => x.run - y.run)[0].m; return r0 ? [[a.id, m, r0.S]] : []; });
      if (r.fail > b.fail) continue;
      const dGec = b.gec - r.gec; const dDiger = r.diger - b.diger; const o = cx.byId[a.id];
      /* dışarı: fasona vermenin kazancı; içeri: motorun seçtiği fasonu geri almanın bedeli (eksiyse fasonda kalmalı) */
      const kT = pdKat(pdDenge()); const net = a.yon === 'disari' ? dGec * kT - dDiger : -(dGec * kT - dDiger);
      liste.push({ ...a, job: o.job, ad: o.ad, adet: o.adet, dGec, dDiger, dT: b.e.sumT - r.e.sumT, net, fasonTL: ymFasonTL(cx, { id: a.id, m: T0 }) });
    }
    liste.sort((x, y) => y.net - x.net);
    U.ymFs = { dv: S.dataVer, liste };
  } catch (e) { console.error(e); U.ymFs = { err: 'Öneri hesaplanamadı: ' + e.message }; }
  render();
}
function sFasonPlani() {
  const D = S.D; const fg = agFiyatGorur(); const kr = ymKarar(); const p = S.plan; const cx = cxAl(); const k = S.D.fasonKarar || {};
  const m = U.ymFs && (U.ymFs.run || U.ymFs.err || U.ymFs.dv === S.dataVer) ? U.ymFs : null;
  let planKart;
  if (!p || !cx) planKart = kart(`${ic('truck', 'k')} Fason planı`, '<p class="pm-kucuk">Önce plan kurulmalı.</p>');
  else {
    const fas = Object.values(p.ops).filter(r => r.fas).sort((a, b) => a.S - b.S); const T0 = '@' + cx.A.fasonTalas;
    const topTL = fas.reduce((a, r) => a + (ymFasonTL(cx, r) || 0), 0);
    const kpi = ymKpi([['truck', 'Fason sevki', String(fas.length), `${fas.filter(r => r.m === T0).length} talaşlı`], ['lira', 'Fason maliyeti', fg ? agTL(topTL) : 'müdürde', 'taşıma dahil'], ['flag', 'Müdür kararı', String(Object.keys(k).length), 'kabul ya da red']]);
    const tr = fas.map(r => { const o = cx.byId[r.id] || {}; const f = cx.FS[r.m.slice(1)] || {}; const x = k[r.id]; const talas = r.m === T0;
      return `<tr>${td('İş', `<b class="mono">${esc(r.id)}</b><small class="pm-ag-not">${esc(o.ad || '')} · ${sayi(o.adet, 0)} adet</small>`)}${td('Fasoncu', esc(f.ad || r.m))}${td('Çıkış', esc(fmtDT(D, r.S)))}${td('Dönüş', esc(fmtDT(D, r.C)))}${fg ? td('Maliyet', `<span class="mono">${agTL(ymFasonTL(cx, r))}</span>`, 'pm-num') : ''}${td('Tür', talas ? (x ? rozet('Müdür kabul etti', 'tamam') : rozet('Plan seçti', 'uyari')) : rozet('Rotada fason', 'pasif'))}</tr>`; }).join('');
    planKart = kart(`${ic('truck', 'k')} Fason planı`, `${kpi}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>İş</th><th>Fasoncu</th><th>Çıkış</th><th>Dönüş</th>${fg ? '<th class="pm-num">Maliyet</th>' : ''}<th>Tür</th></tr></thead><tbody>${tr || '<tr><td colspan="6" class="pm-kucuk">Fason sevki yok.</td></tr>'}</tbody></table></div>`);
  }
  let oneri;
  if (m && m.run) oneri = `<p class="pm-kucuk" role="status">${ic('cpu', 'k')} ${esc(m.run)}</p>`;
  else if (m && m.err) oneri = `<p class="pm-ag-uyari">${esc(m.err)}</p>`;
  else if (m) {
    const tr = m.liste.map((a, i) => { const iyi = a.net > 0; const ne = a.yon === 'disari' ? `${esc(a.m)} yerine fason` : 'Plan fasona verdi';
      return `<tr>${td('İş', `<b class="mono">${esc(a.id)}</b><small class="pm-ag-not">${esc(a.ad)} · ${sayi(a.adet, 0)} adet</small>`)}${td('Öneri türü', ne)}${td('Gecikme', `<span class="mono" data-ton="${a.dT < -0.05 ? 'hata' : ''}">${a.dT < -0.05 ? 'artar ' : 'azalır '}${esc(saat(Math.abs(a.dT)))}</span><small class="pm-ag-not mono">${agTL(Math.abs(a.dGec))}</small>`, 'pm-num')}${fg ? td('Fason', `<span class="mono">${agTL(a.fasonTL)}</span>`, 'pm-num') + td('Net kazanç', `<b class="mono" data-ton="${iyi ? 'tamam' : 'hata'}">${agTL(a.net)}</b>`, 'pm-num') : ''}
        ${td('Öneri', iyi ? rozet(a.yon === 'disari' ? 'Fasona verilsin' : 'Fasonda kalsın', 'tamam') : rozet(a.yon === 'disari' ? 'Ödemiyor' : 'İçeride yapılsın', 'pasif'))}${td('', kr ? `<span class="pm-dugmeler">${dugme('Fasona ver', 'ym-fason-kabul', { kucuk: true, birincil: iyi, simge: 'check', veri: `data-v="${i}"` })}${dugme('İçeride yap', 'ym-fason-red', { kucuk: true, hayalet: true, simge: 'x', veri: `data-v="${i}"` })}</span>` : '<span class="pm-kucuk">kararı müdür verir</span>')}</tr>`; }).join('');
    oneri = `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>İş</th><th>Öneri türü</th><th class="pm-num">Gecikme</th>${fg ? '<th class="pm-num">Fason</th><th class="pm-num">Net kazanç</th>' : ''}<th>Öneri</th><th><span class="tc-gizli-etiket">Karar</span></th></tr></thead><tbody>${tr || '<tr><td colspan="7" class="pm-kucuk">Kararı verilmemiş, fasona uygun darboğaz işi yok.</td></tr>'}</tbody></table></div>`;
  } else oneri = '<p class="pm-kucuk">Öneri için güncel plan gerekir. Plan, darboğaz tezgâhtaki fasona uygun işleri tek tek talaşlı fasona vermeyi ve kendi seçtiği fasonları geri almayı dener.</p>';
  const kl = Object.entries(k); const kararlar = kl.length ? `<div class="pm-cipler">${kl.map(([id, x]) => `<span class="pm-cip">${esc(id)} · ${x.karar === 'kabul' ? 'fasonda' : 'içeride'} · ${esc(x.kim)}${kr ? `<button type="button" data-act="ym-fason-geri" data-v="${esc(id)}" aria-label="${esc(id)} kararını kaldır">${ic('x', 'k')}</button>` : ''}</span>`).join('')}</div>` : '';
  const not = `<p class="pm-kucuk">Yalnız rotada "gerekirse fasona verilebilir" işaretli adımlar talaşlı fasona gidebilir. Net kazanç = önlenen gecikme bedeli × plan dengesi çarpanı (${pdKatYaz(pdDenge())}) − (fason − tezgâh ve ayar) maliyet farkı. Müdür kararı motora kısıt olarak girer: "Fasona ver" o adımı yalnız fasonda, "İçeride yap" yalnız tezgâhta planlatır. Karar yoksa motor tek TL toplamına göre kendisi seçer.</p>`;
  return planKart + kart(`${ic('target', 'k')} Plan önerisi`, oneri + (kararlar ? `<p class="pm-kucuk"><b>Müdür kararları</b></p>${kararlar}` : '') + not, dugme(m && m.dv != null ? 'Yeniden hesapla' : 'Önerileri hesapla', 'ym-fason-oner', { kucuk: true, birincil: !(m && m.dv != null), simge: 'play' }));
}

const YM_GORUNUM = { ysiparis: sSiparisKar, maliyet: sMaliyetler, mesaiplan: sMesaiPlani, fasonplan: sFasonPlani, malzplan: () => GORUNUM.malzplan() };

/* ---------- eylemler ---------- */
const ymTekEski = tekEylem;
tekEylem = function (act, v, el, e) {
  const fgYok = () => { if (agFiyatGorur()) return false; bildir('Bunu müdür ya da yönetici yapar.', 'hata'); return true; };
  const krYok = () => { if (ymKarar()) return false; bildir('Kabul ve red müdürdedir.', 'hata'); return true; };
  switch (act) {
    case 'ym-amac': if (fgYok()) return true; degistir('Plan amacı değişti', v === 'tl' ? 'Tek TL toplamı' : 'Önce gecikme', () => { S.D.planTL = { ...(S.D.planTL || {}), amac: v }; }, 'plan.kilitle'); return true;
    case 'ym-wip-vade': { if (fgYok() || !['bitis', 'termin'].includes(v)) return true; const w = { ...((S.D.planTL || {}).wip || {}), vadeBas: v };
      degistir('Ödeme vadesi başlangıcı', v === 'bitis' ? 'Üretim bitince' : 'Terminde', () => { S.D.planTL = { ...(S.D.planTL || {}), wip: w }; }, 'plan.kilitle'); return true; }
    case 'ym-wip-bil': { if (fgYok()) return true; const [k, b] = String(v).split(':'); const w = { ...((S.D.planTL || {}).wip || {}) };
      const ad = { ac: 'Bekleme maliyeti plan amacında' }[k]; if (!ad) return true;
      degistir('Bekleme maliyeti ayarı', `${ad}: ${b === '1' ? 'açık' : 'kapalı'}`, () => { w[k] = b === '1'; S.D.planTL = { ...(S.D.planTL || {}), wip: w }; }, 'plan.kilitle'); return true; }
    case 'ym-kg-sil': { if (fgYok()) return true; const r = (S.D.kgFiyat || []).find(x => x.id === v); if (!r) return true; degistir('Kg fiyatı silindi', `${r.kalite} ${r.form || ''}`, () => { S.D.kgFiyat = S.D.kgFiyat.filter(x => x !== r); }, 'plan.kilitle'); return true; }
    case 'ym-fiyat': case 'ym-fiyat-toplu': { if (fgYok()) return true; const cx = cxAl(); const Y = ymAyar();
      const l = act === 'ym-fiyat' ? S.D.siparisler.filter(s => s.id === v) : S.D.siparisler.filter(s => !s.havuz && s.gelir == null);
      const MP = ymMesaiPay(S.plan, cx); const yaz = l.map(s => { const x = ymSipMaliyet(s, S.plan, cx, null, MP); const o = s.karOran != null ? +s.karOran : Y.karHedef; return x && !x.eksik.length ? [s, Math.round(x.top * (1 + o / 100) / 10) * 10, o] : null; }).filter(Boolean);
      if (!yaz.length) { bildir('Önerilen fiyat çıkan sipariş yok (maliyeti eksik ya da fiyatı var).', 'hata'); return true; }
      degistir('Sipariş fiyatı maliyetten', yaz.map(([s, f, o]) => `${s.id}: ${agTL(s.gelir)} → ${agTL(f)} (%${o})`).join('; '), () => { for (const [s, f] of yaz) s.gelir = f; }, 'plan.kilitle'); return true; }
    case 'ym-mesai-oner': ymMesaiOner(); return true;
    case 'ym-fason-oner': ymFasonOner(); return true;
    case 'ym-mesai-kabul': case 'ym-mesai-red': { if (krYok()) return true; const a = U.ymMs && U.ymMs.liste && U.ymMs.liste[+v]; if (!a) return true; const kab = act === 'ym-mesai-kabul';
      const ad = `${a.m} ${fmtDT(S.D, a.gun * 24).slice(0, 9)} ${a.vardiya}`;
      degistir(kab ? 'Ek mesai kabul edildi' : 'Ek mesai reddedildi', `${ad}${agFiyatGorur() ? ` · net ${agTL(a.net)}` : ''}`, () => {
        const k = { m: a.m, gun: a.gun, vardiya: a.vardiya, karar: kab ? 'kabul' : 'red', kim: kim().ad, t: Date.now(), net: a.net };
        S.D.mesaiKarar = [...(S.D.mesaiKarar || []).filter(x => ymAnahtar(x) !== ymAnahtar(k)), k]; if (kab) S.ekMesai.push({ m: a.m, gun: a.gun, vardiya: a.vardiya }); }, 'plan.kilitle');
      return true; }
    case 'ym-mesai-kaldir': { if (krYok()) return true; const e2 = S.ekMesai[+v]; if (!e2) return true;
      degistir('Ek mesai kaldırıldı', `${e2.m} ${fmtDT(S.D, e2.gun * 24).slice(0, 9)} ${e2.vardiya}`, () => { S.ekMesai.splice(+v, 1); S.D.mesaiKarar = (S.D.mesaiKarar || []).filter(x => ymAnahtar(x) !== ymAnahtar(e2)); }, 'plan.kilitle'); return true; }
    case 'ym-fason-kabul': case 'ym-fason-red': { if (krYok()) return true; const a = U.ymFs && U.ymFs.liste && U.ymFs.liste[+v]; if (!a) return true; const kab = act === 'ym-fason-kabul';
      degistir(kab ? 'Fason kararı: fasona ver' : 'Fason kararı: içeride yap', `${a.id}${agFiyatGorur() ? ` · net ${agTL(a.net)}` : ''}`, () => { S.D.fasonKarar = { ...(S.D.fasonKarar || {}), [a.id]: { karar: kab ? 'kabul' : 'red', kim: kim().ad, t: Date.now() } }; }, 'plan.kilitle'); return true; }
    case 'ym-fason-geri': { if (krYok()) return true; if (!(S.D.fasonKarar || {})[v]) return true;
      degistir('Fason kararı kaldırıldı', v, () => { const k = { ...S.D.fasonKarar }; delete k[v]; S.D.fasonKarar = k; }, 'plan.kilitle'); return true; }
  }
  return ymTekEski(act, v, el, e);
};
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('ym-')) return;
  if (!agFiyatGorur()) { bildir('Bu alanı müdür ya da yönetici değiştirir.', 'hata'); render(); return; }
  const v = el.value === '' ? null : +el.value; if (c !== 'ym-oran' && v != null && !(v >= +(el.min || 0)) || v != null && el.max && v > +el.max) { bildir('Geçerli bir sayı girin.', 'hata'); render(); return; }
  const k = el.dataset.k, id = el.dataset.v;
  if (c === 'ym-tez') { const m = S.D.tezgahlar.find(x => x.id === id); if (!m || v == null) { render(); return; } degistir('Tezgâh saat maliyeti değişti', `${m.id}: ${m.ucret ?? '—'} → ${v} TL/sa`, () => { m.ucret = v; }, 'plan.kilitle'); return; }
  if (c === 'ym-wip') { if (v == null || !(k in WIP0)) { render(); return; } const w = { ...((S.D.planTL || {}).wip || {}) }; degistir('Bekleme maliyeti ayarı', `${k}: ${wipAyar()[k]} → ${v}`, () => { w[k] = v; S.D.planTL = { ...(S.D.planTL || {}), wip: w }; }, 'plan.kilitle'); return; }
  if (c === 'ym-urun') { const u = S.D.urunler.find(x => x.id === id); if (!u || !['netKg', 'paletAdet', 'paletM2', 'tasimaSa'].includes(k)) { render(); return; } if (k === 'paletAdet' && v != null && !(v >= 1)) { bildir('Palet adedi en az 1.', 'hata'); render(); return; }
    degistir('Ürün bekleme bilgisi', `${u.id} ${k}: ${u[k] ?? '—'} → ${v ?? '—'}`, () => { if (v == null) delete u[k]; else u[k] = v; }, 'plan.kilitle', k === 'netKg' ? { planKoru: true } : undefined); return; }
  if (c === 'ym-ayar') { const Y = { ...(S.D.planTL || {}) }; if (v == null && !['operatorUcret', 'genelGider'].includes(k)) { render(); return; } degistir('Maliyet ayarı değişti', `${k}: ${ymAyar()[k] ?? '—'} → ${v ?? '—'}`, () => { Y[k] = v; S.D.planTL = Y; }, 'plan.kilitle'); return; }
  if (c === 'ym-ayarlar') { if (v == null) { render(); return; } const A = S.D.ayarlar = S.D.ayarlar || {}; degistir('Ücret değişti', `${k === 'mesaiUcret' ? 'Mesai' : 'Ayarcı'} ücreti: ${A[k] ?? '—'} → ${v} TL/sa`, () => { A[k] = v; }, 'plan.kilitle'); return; }
  if (c === 'ym-kg') { const r = (S.D.kgFiyat || []).find(x => x.id === id); if (!r || (k === 'fiyat' && v == null)) { render(); return; }
    degistir(k === 'fiyat' ? 'Kg fiyatı değişti' : 'Fire payı değişti', `${r.kalite} ${r.form || 'her form'}: ${r[k] ?? '—'} → ${v ?? '—'}`, () => { r[k] = v; r.tarih = new Date().toISOString().slice(0, 10); r.kim = kim().ad; }, 'plan.kilitle'); return; }
  if (c === 'ym-fas') { const f = (S.D.fasoncular || []).find(x => x.id === id); if (!f) return; degistir('Fason fiyatı değişti', `${f.ad} ${k}: ${f[k] ?? '—'} → ${v ?? '—'}`, () => { if (v == null) delete f[k]; else f[k] = v; }, 'plan.kilitle'); return; }
  if (c === 'ym-talas') { tlGoc(S.D); const t = tlSatir(S.D, id); if (!t) { render(); return; } degistir('Talaş satış fiyatı değişti', `${t.kalite}: ${t.fiyat ?? '—'} → ${v ?? '—'} TL/kg`, () => { t.fiyat = v; t.tarih = new Date().toISOString().slice(0, 10); t.kim = kim().ad; }, 'plan.kilitle', { planKoru: true }); return; }
  if (c === 'ym-oran') { const s = S.D.siparisler.find(x => x.id === id); if (!s) return; s.karOran = v; kaydet(); render(); return; }
  if (c === 'ym-vade') { const s = S.D.siparisler.find(x => x.id === id); if (!s) return; degistir('Ödeme vadesi değişti', `${s.id}: ${s.vade ?? '—'} → ${v ?? '—'} gün`, () => { if (v == null) delete s.vade; else s.vade = v; }, 'plan.kilitle', { planKoru: true }); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('[data-form="ym-kg-yeni"]'); if (!f) return; e.preventDefault();
  if (!agFiyatGorur()) { bildir('Bunu müdür ya da yönetici yapar.', 'hata'); return; }
  const kal = f.elements.kalite.value.trim(); const fi = +f.elements.fiyat.value; const fo = f.elements.form.value;
  if (!kal) { bildir('Kalite yazın.', 'hata'); f.elements.kalite.focus(); return; }
  if (!(fi > 0)) { bildir('Kg fiyatı girin.', 'hata'); f.elements.fiyat.focus(); return; }
  if ((S.D.kgFiyat || []).some(r => mlNorm(r.kalite) === mlNorm(kal) && mlNorm(r.form) === mlNorm(fo))) { bildir('Bu kalite ve form için fiyat zaten var.', 'hata'); return; }
  const n = Math.max(0, ...(S.D.kgFiyat || []).map(r => +String(r.id).replace(/\D/g, '') || 0)) + 1;
  degistir('Kg fiyatı eklendi', `${kal} ${fo || 'her form'}: ${fi} TL/kg`, () => { S.D.kgFiyat = [...(S.D.kgFiyat || []), { id: 'KG-' + n, cins: f.elements.cins.value, kalite: kal, form: fo, fiyat: fi, fire: null, tarih: new Date().toISOString().slice(0, 10), kim: kim().ad }]; }, 'plan.kilitle');
});
