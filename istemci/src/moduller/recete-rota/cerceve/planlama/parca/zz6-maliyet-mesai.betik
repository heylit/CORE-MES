/* ---------- Maliyet ve mesai yönetimi (kullanıcı 19.10 18:00) ----------
   Genel gider tek bir "TL/tezgâh saati" sayısı olmaktan çıkar, kalemlerden kurulur:
   - Gider kalemleri aylık tutardır (kira, enerji, su, doğalgaz, bakım sözleşmesi, sigorta, lisans, kalibrasyon, İSG ve yemek, genel sarf),
     dolaylı personel görev başına brüt ücretten (SGK işveren payı ve yan haklar dahil) hesaplanır.
   - Her kalem bir dağıtım anahtarıyla tezgâhlara dağılır: makine saati, alan, kurulu güç, operatör sayısı ya da eşit; kapsam bütün atölye ya da bir grup.
   - Amortisman tezgâhın kendisine yazılır: (alış bedeli − hurda değeri) / (faydalı ömür × 12), doğrusal.
   - Tezgâhın genel gider oranı = (dağılan pay + amortisman) / pratik kapasite saati. Pratik kapasite önümüzdeki 30 günün açık saatleri × verim.
     Normal kapasiteyle dağıtmak boş kalan saatin giderini ürüne yüklemez; plan doluluğu düşükse kalan "atıl kapasite" dönem gideridir.
   - Doğrudan makine saat maliyeti önerisi: enerji (kW × yük oranı × kWh fiyatı) + takım ve sarf + bakım + operatör (kişi ücretinden).
   Genel gider plan amacına girmez (5 b); ürün maliyetinde, teklifte ve proje maliyetinde kullanılır.
   Mesai kişi bazlıdır: saat ücreti = brüt × (1 + SGK işveren payı + yan hak) / aylık ücret saati; ek vardiya bedeli gün türünün çarpanıyla
   (hafta içi, cumartesi, pazar, resmî tatil) ve kişi başı yemek ve servisle. Her ek vardiyaya o grupta yetkin kişiler atanır ve günlük
   çalışma sınırı, gece çalışma sınırı ve yıllık fazla çalışma sınırı denetlenir. Sınır ve çarpanların varsayılanı 4857 sayılı İş Kanunu'ndan
   bilinen değerlerdir (günlük 11, gece 7,5, yıllık 270 saat, fazla çalışma %50); bu denemede belgeden doğrulanmadı, İK ve sözleşmeyle kontrol edilmelidir.
   Bütün tutarlar uydurmadır. */
const MS_TUR = [['personel', 'Dolaylı personel'], ['kira', 'Kira'], ['enerji', 'Genel enerji'], ['su', 'Su'], ['dogalgaz', 'Doğalgaz ve ısınma'], ['bakim', 'Bakım sözleşmesi'], ['sigorta', 'Sigorta'], ['bt', 'Bilgi işlem ve lisans'], ['kalite', 'Kalibrasyon ve kalite'], ['isg', 'İSG, servis ve yemek'], ['sarf', 'Genel sarf'], ['diger', 'Diğer']];
const MS_ANAHTAR = [['saat', 'Makine saati'], ['alan', 'Alan (m²)'], ['kw', 'Kurulu güç (kW)'], ['kisi', 'Operatör sayısı'], ['esit', 'Eşit']];
const MS_GRUP_VAR = { torna: [6.5e6, 10, 22, 25, 120, 60], freze: [7e6, 10, 25, 30, 150, 70], '5eksen': [18e6, 10, 35, 40, 260, 140], testere: [9e5, 8, 4, 15, 40, 20], taslama: [5e6, 10, 15, 25, 90, 60], tesviye: [3e5, 8, 2, 12, 25, 10], yikama: [6e5, 8, 9, 15, 30, 15], olcum: [4.5e6, 10, 3, 20, 10, 40] };
function msVarsayilan(D) {
  const tez = {}; for (const t of D.tezgahlar) { const v = MS_GRUP_VAR[t.grup] || [3e6, 10, 10, 20, 60, 30]; tez[t.id] = { bedel: v[0], omur: v[1], hurda: 10, kw: v[2], yuk: 0.6, alan: v[3], sarf: v[4], bakim: v[5] }; }
  return { kip: 'kalem', verim: 85, kwh: 3.4, tez,
    kalemler: [['K1', 'Dolaylı personel', 'personel', null, 'saat'], ['K2', 'Fabrika kirası', 'kira', 280000, 'alan'], ['K3', 'Aydınlatma, kompresör, iklimlendirme', 'enerji', 65000, 'kw'], ['K4', 'Su', 'su', 7000, 'kisi'],
      ['K5', 'Doğalgaz ve ısınma', 'dogalgaz', 38000, 'alan'], ['K6', 'Bakım sözleşmeleri', 'bakim', 45000, 'saat'], ['K7', 'Bina ve makine sigortası', 'sigorta', 22000, 'saat'], ['K8', 'CAM ve ERP lisansları', 'bt', 32000, 'saat'],
      ['K9', 'Kalibrasyon', 'kalite', 14000, 'saat'], ['K10', 'İSG, servis ve yemek', 'isg', 95000, 'kisi'], ['K11', 'Kesme sıvısı, yağ, temizlik', 'sarf', 24000, 'saat']].map(([id, ad, tur, aylik, anahtar]) => ({ id, ad, tur, aylik, anahtar, kapsam: '' })),
    dolayli: [['Fabrika müdürü', 120000], ['Üretim planlama', 65000], ['Kalite kontrol', 60000], ['Depo ve sevkiyat', 42000], ['Bakım teknisyeni', 55000], ['İdari işler ve muhasebe', 50000]].map(([gorev, brut], i) => ({ id: 'G' + (i + 1), gorev, brut })) };
}
function mesaiVarsayilan(D) {
  const ucret = {}; D.personel.forEach((p, i) => { ucret[p.id] = { brut: p.ayar ? 62000 : 52000, yil: (i * 37) % 230 }; });
  return { kisiBazli: true, aylikSaat: 225, sgk: 20.75, yanHak: 8, carp: { hi: 1.5, cmt: 1.5, paz: 2, tatil: 2 }, kisiEk: 250, gunlukSinir: 11, geceSinir: 7.5, yillikSinir: 270, ucret };
}
const msSis = (D = S.D) => (D.maliyetSis = D.maliyetSis || msVarsayilan(D));
const mesSis = (D = S.D) => (D.mesaiSis = D.mesaiSis || mesaiVarsayilan(D));
const msSgkKat = (D = S.D) => { const m = mesSis(D); return 1 + ((+m.sgk || 0) + (+m.yanHak || 0)) / 100; };
const msDolayliAylik = (D = S.D) => msSis(D).dolayli.reduce((t, g) => t + (+g.brut || 0) * msSgkKat(D), 0);
const msKalemTL = (k, D = S.D) => k.tur === 'personel' && k.aylik == null ? msDolayliAylik(D) : (+k.aylik || 0);
/* kişinin saat maliyeti (SGK ve yan hak dahil); ücreti girilmemişse grubun ortalaması */
function msSaat(p, D = S.D) { const m = mesSis(D); const u = (m.ucret || {})[p.id]; return u && u.brut != null ? +u.brut * msSgkKat(D) / (+m.aylikSaat || 225) : null; }
function msGrupSaat(grup, D = S.D) { const l = D.personel.filter(p => (p.gruplar || []).includes(grup)).map(p => msSaat(p, D)).filter(x => x != null); const t = l.length ? l : D.personel.map(p => msSaat(p, D)).filter(x => x != null); return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null; }

let msOn = null;
function msHesap() {
  const cx = cxAl(); if (!cx) return null; const D = S.D;
  if (msOn && msOn.dv === S.dataVer && msOn.p === S.plan) return msOn.v;
  const M = msSis(D); const now = cx.st.now; const son = now + 720;
  const tez = D.tezgahlar.map(t => { const W = cx.M[t.id] && cx.M[t.id].rw; const acik = W ? workIn(W, now, son) : 0; const x = M.tez[t.id] || {};
    const kap = acik * (+M.verim || 85) / 100; const amort = x.bedel > 0 && x.omur > 0 ? (+x.bedel * (1 - (+x.hurda || 0) / 100)) / (+x.omur * 12) : 0;
    const op = t.opOran == null ? 1 : +t.opOran; const opSaat = msGrupSaat(t.grup, D);
    const dog = { enerji: (+x.kw || 0) * (+x.yuk || 0) * (+M.kwh || 0), sarf: +x.sarf || 0, bakim: +x.bakim || 0, operator: opSaat == null ? null : opSaat * op };
    let mesgul = 0; if (S.plan) for (const r of Object.values(S.plan.ops)) if (r.m === t.id && isFinite(r.C)) mesgul += Math.max(0, Math.min(son, r.C) - Math.max(now, r.S));
    return { t, acik, kap, amort, op, dog, dogTop: dog.enerji + dog.sarf + dog.bakim + (dog.operator || 0), pay: 0, kalem: {}, mesgul, x }; });
  const taban = (k, z) => k.anahtar === 'alan' ? +z.x.alan || 0 : k.anahtar === 'kw' ? +z.x.kw || 0 : k.anahtar === 'kisi' ? z.op : k.anahtar === 'esit' ? 1 : z.kap;
  for (const k of M.kalemler) { const tl = msKalemTL(k, D); const l = tez.filter(z => !k.kapsam || z.t.grup === k.kapsam); const top = l.reduce((a, z) => a + taban(k, z), 0); if (!(top > 0) || !tl) continue;
    for (const z of l) { const p = tl * taban(k, z) / top; z.pay += p; z.kalem[k.id] = p; } }
  for (const z of tez) { z.aylik = z.pay + z.amort; z.oran = z.kap > 0 ? z.aylik / z.kap : null; z.absorbe = z.oran == null ? 0 : Math.min(z.mesgul, z.kap) * z.oran; z.atil = z.oran == null ? 0 : Math.max(0, z.kap - z.mesgul) * z.oran; }
  const top = k => tez.reduce((a, z) => a + (z[k] || 0), 0);
  const v = { tez, byM: Object.fromEntries(tez.map(z => [z.t.id, z])), aylik: top('aylik'), amort: top('amort'), kap: top('kap'), mesgul: top('mesgul'), absorbe: top('absorbe'), atil: top('atil'), kalemTop: M.kalemler.reduce((a, k) => a + msKalemTL(k, D), 0) };
  v.ort = v.kap > 0 ? v.aylik / v.kap : null;
  msOn = { dv: S.dataVer, p: S.plan, v }; return v;
}
function msGgOran(m) { const M = msSis(); if (M.kip !== 'kalem') return +ymAyar().genelGider || 0; const v = msHesap(); const z = v && v.byM[m]; return z && z.oran != null ? z.oran : (v && v.ort) || +ymAyar().genelGider || 0; }

/* sipariş maliyetinde genel gider tezgâhın kendi oranıyla; geri kalan hesap ymSipMaliyet'in aynısıdır */
{ const sm0 = ymSipMaliyet; ymSipMaliyet = function (s, p, cx, W, MP) {
  const x = sm0.apply(this, arguments); if (!x || msSis().kip !== 'kalem') return x;
  const ops = Object.values(p.ops).filter(r => r.job === s.id && !r.fas); const gy = +ymAyar().genelGider || 0;
  let gg = 0; for (const r of ops) gg += (r.run + r.su) * msGgOran(r.m);
  const fark = gg - x.gg; const y = { ...x, gg, top: x.top + fark };
  if (y.kar != null) y.kar -= fark; if (y.net != null) y.net -= fark; y.ggEski = gy;
  return y; }; }

/* ---------- mesai: gün türü, bedel, kişi ataması ---------- */
function msGunTur(D, gun) { const iso = gunTarih(gun); if ((D.tatiller || []).includes(iso)) return 'tatil'; const g = fmtDT(D, gun * 24).slice(6, 9); return g === 'Cmt' ? 'cmt' : g === 'Paz' ? 'paz' : 'hi'; }
const MS_GUN_AD = { hi: 'hafta içi', cmt: 'cumartesi', paz: 'pazar', tatil: 'resmî tatil' };
const msGece = v => { const b = hm(v.bas), e = hm(v.bit); return b >= 20 || e <= 6 && e < b; };
{ const mt0 = ymMesaiTL; ymMesaiTL = function (D, cx, e) {
  const m = mesSis(D); if (!m.kisiBazli) return mt0.apply(this, arguments);
  const t = D.tezgahlar.find(x => x.id === e.m); const h = ymVH(D, e.vardiya); const op = t && t.opOran != null ? +t.opOran : 1;
  const s = msGrupSaat(t ? t.grup : '', D); if (s == null) return mt0.apply(this, arguments);
  return h * op * s * (+m.carp[msGunTur(D, e.gun)] || 1.5) + op * (+m.kisiEk || 0);
}; }
const msGunKey = (D, gun) => ['paz', 'pzt', 'sal', 'car', 'per', 'cum', 'cmt'][new Date(gunTarih(gun) + 'T12:00:00Z').getUTCDay()];
function msAtama() {
  const D = S.D; const m = mesSis(D); const kisi = {}; for (const p of D.personel) kisi[p.id] = { p, yil: +((m.ucret || {})[p.id] || {}).yil || 0, plan: 0, gun: {} };
  const liste = [];
  for (const [i, e] of (S.ekMesai || []).map((e, i) => [i, e]).sort((a, b) => a[1].gun - b[1].gun)) {
    const t = D.tezgahlar.find(x => x.id === e.m); const v = D.vardiyalar.find(x => x.id === e.vardiya); if (!t || !v) continue;
    const h = ymVH(D, e.vardiya); const tur = msGunTur(D, e.gun); const gk = msGunKey(D, e.gun); const need = Math.max(1, Math.ceil(t.opOran == null ? 1 : +t.opOran));
    const normal = p => { const cal = (D.calismaGunleri || {})[gk] || []; const izin = (D.devamsizlik || []).some(d => (d.personel || d.kisi) === p.id && d.gun === gunTarih(e.gun)); return izin ? null : tur !== 'tatil' && cal.includes(p.vardiya) ? ymVH(D, p.vardiya) : 0; };
    const aday = D.personel.filter(p => (p.gruplar || []).includes(t.grup)).map(p => { const k = kisi[p.id]; const n = normal(p); if (n == null) return null;
      const ayni = n > 0 && p.vardiya === e.vardiya; const gunTop = n + (k.gun[e.gun] || 0) + h; const neden = [];
      if (ayni) neden.push('aynı vardiyada zaten çalışıyor'); if (gunTop > m.gunlukSinir + 1e-6) neden.push(`günde ${sayi(gunTop, 1)} sa (sınır ${sayi(m.gunlukSinir, 1)})`);
      if (k.yil + k.plan + h > m.yillikSinir + 1e-6) neden.push(`yılda ${sayi(k.yil + k.plan + h, 0)} sa (sınır ${m.yillikSinir})`);
      return { p, k, neden, ayni, gunTop, yuk: k.yil + k.plan }; }).filter(Boolean).filter(a => !a.ayni).sort((a, b) => a.neden.length - b.neden.length || a.gunTop - b.gunTop || a.yuk - b.yuk);
    const sec = aday.slice(0, need); for (const a of sec) { a.k.plan += h; a.k.gun[e.gun] = (a.k.gun[e.gun] || 0) + h; }
    const ihlal = []; if (sec.length < need) ihlal.push(`${need - sec.length} kişi eksik: grupta uygun kişi yok`);
    for (const a of sec) for (const n of a.neden) ihlal.push(`${a.p.ad}: ${n}`);
    if (msGece(v) && h > m.geceSinir + 1e-6) ihlal.push(`gece vardiyası ${sayi(h, 1)} sa (gece sınırı ${sayi(m.geceSinir, 1)} sa)`);
    liste.push({ i, e, t, h, tur, kisiler: sec.map(a => a.p), ihlal });
  }
  return { liste, kisi };
}

/* ---------- Genel gider sayfası ---------- */
const msTL = x => agTL(x);
const msSayi = (k, v, ad, o = {}) => ymSayi('ms-' + k, v, ad, o);
function sGenelGider() {
  const D = S.D; const fg = agFiyatGorur(); if (!fg) return ymKilit('Genel gider ve amortisman');
  const M = msSis(D); const v = msHesap(); const yaz = yetkili('plan.kilitle');
  if (!v) return kart(`${ic('layers', 'k')} Genel gider`, '<p class="pm-kucuk">Plan verisi derlenemedi.</p>');
  const grupSec = (k) => `<select class="tc-alan-kutu" data-chg="ms-kapsam" data-v="${esc(k.id)}" aria-label="${esc(k.ad)} kapsamı" ${yaz ? '' : 'disabled'}><option value="">Bütün atölye</option>${[...new Set(D.tezgahlar.map(t => t.grup))].map(g => `<option ${k.kapsam === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
  const sec = (chg, id, l, d, ad) => `<select class="tc-alan-kutu" data-chg="${chg}" data-v="${esc(id)}" aria-label="${esc(ad)}" ${yaz ? '' : 'disabled'}>${l.map(([k, n]) => `<option value="${k}" ${d === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const kip = `<div class="pm-seg" role="group" aria-label="Genel gider hesabı">${[['kalem', 'Kalemlerden'], ['tek', 'Tek oran']].map(([k, n]) => `<button type="button" data-act="ms-kip" data-v="${k}" aria-pressed="${M.kip === k}" ${yaz ? '' : 'disabled'}>${n}</button>`).join('')}</div>`;
  const kpi = ymKpi([['layers', 'Aylık genel gider', msTL(v.aylik), `kalemler ${msTL(v.kalemTop)} + amortisman ${msTL(v.amort)}`], ['clock', 'Pratik kapasite', `${sayi(v.kap, 0)} sa`, `30 gün, verim %${sayi(M.verim, 0)}`],
    ['lira', 'Ortalama oran', v.ort == null ? '—' : agTLs(v.ort), M.kip === 'kalem' ? 'maliyette kullanılıyor' : `kullanılan: tek oran ${agTLs(+ymAyar().genelGider || 0)}`], ['gauge', 'Plan doluluğu', v.kap ? '%' + sayi(Math.min(100, v.mesgul / v.kap * 100), 0) : '—', `${sayi(v.mesgul, 0)} sa planlı`],
    ['alert', 'Atıl kapasite gideri', msTL(v.atil), 'ürüne yüklenmez, dönem gideri', v.atil > v.aylik * 0.3 ? 'uyari' : '']]);
  const ust = kart(`${ic('layers', 'k')} Genel gider nasıl hesaplanır`, `<div class="pm-sira">${kip}<label class="pm-ym-alan"><span>Verim %</span>${msSayi('verim', M.verim, 'Pratik kapasite verimi', { adim: 1, min: 10, max: 100 })}</label><label class="pm-ym-alan"><span>Elektrik TL/kWh</span>${msSayi('kwh', M.kwh, 'Elektrik birim fiyatı', { adim: 0.1, max: 100 })}</label></div>${kpi}
    <p class="pm-kucuk">Her kalem aylık tutardır ve seçilen anahtarla tezgâhlara dağılır; amortisman tezgâhın kendisine yazılır. Tezgâhın oranı = (pay + amortisman) / pratik kapasite saati. Normal kapasiteyle dağıtıldığı için boş kalan saatin gideri ürüne yüklenmez, atıl kapasite olarak ayrı görünür. Genel gider plan amacına girmez (5 b); ürün maliyetinde, teklifte ve proje maliyetinde kullanılır. Tutarlar uydurmadır.</p>`);
  const kal = M.kalemler.map(k => { const hes = k.tur === 'personel' && k.aylik == null;
    return `<tr>${td('Kalem', `<input class="tc-alan-kutu" data-chg="ms-kad" data-v="${esc(k.id)}" value="${esc(k.ad)}" aria-label="Kalem adı" ${yaz ? '' : 'disabled'}>`)}${td('Tür', sec('ms-ktur', k.id, MS_TUR, k.tur, 'Tür'))}
      ${td('Aylık TL', hes ? `<b class="mono">${msTL(msDolayliAylik(D))}</b><small class="pm-ag-not">dolaylı personelden</small>` : msSayi('kaylik', k.aylik, k.ad + ' aylık tutarı', { adim: 100, veri: `data-v="${esc(k.id)}"` }), 'pm-num')}
      ${td('Dağıtım', sec('ms-kanahtar', k.id, MS_ANAHTAR, k.anahtar, 'Dağıtım anahtarı'))}${td('Kapsam', grupSec(k))}${td('', yaz ? dugme('', 'ms-ksil', { simge: 'trash', hayalet: true, kucuk: true, ad: 'Kalemi sil', veri: `data-v="${esc(k.id)}"` }) : '')}</tr>`; }).join('');
  const kalForm = yaz ? `<form class="pm-ym-yeni" data-form="ms-kalem" novalidate><input class="tc-alan-kutu" name="ad" placeholder="Kalem adı" aria-label="Kalem adı" required><select class="tc-alan-kutu" name="tur" aria-label="Tür">${MS_TUR.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select><input class="tc-alan-kutu" name="aylik" type="number" min="0" step="any" placeholder="Aylık TL" aria-label="Aylık TL" required><select class="tc-alan-kutu" name="anahtar" aria-label="Dağıtım">${MS_ANAHTAR.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil">${ic('plus', 'k')}Ekle</button></form>` : '';
  const kalKart = kart(`${ic('list', 'k')} Gider kalemleri`, `<div class="tc-tablo-kap"${kip_()}><table class="tc-tablo"><thead><tr><th>Kalem</th><th>Tür</th><th class="pm-num">Aylık TL</th><th>Dağıtım</th><th>Kapsam</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${kal}</tbody><tfoot><tr><th>Toplam</th><td></td><td class="pm-num"><b class="mono">${msTL(v.kalemTop)}</b></td><td colspan="3"></td></tr></tfoot></table></div>${kalForm}
    <p class="pm-kucuk">Anahtar seçimi gerçek tüketimi izlemelidir: kira ve ısınma alanla, genel enerji kurulu güçle, su ve yemek kişiyle, bakım sözleşmesi ve sigorta makine saatiyle. Bir grubun kendi gideri (ör. ölçüm odasının kalibrasyonu) kapsamı o grup seçilerek yalnız ona yazılır.</p>`);
  const dl = M.dolayli.map(g => `<tr>${td('Görev', `<input class="tc-alan-kutu" data-chg="ms-dgorev" data-v="${esc(g.id)}" value="${esc(g.gorev)}" aria-label="Görev" ${yaz ? '' : 'disabled'}>`)}${td('Brüt aylık', msSayi('dbrut', g.brut, g.gorev + ' brüt ücreti', { adim: 500, veri: `data-v="${esc(g.id)}"` }), 'pm-num')}${td('İşverene maliyet', `<b class="mono">${msTL((+g.brut || 0) * msSgkKat(D))}</b>`, 'pm-num')}${td('', yaz ? dugme('', 'ms-dsil', { simge: 'trash', hayalet: true, kucuk: true, ad: 'Sil', veri: `data-v="${esc(g.id)}"` }) : '')}</tr>`).join('');
  const dlKart = kart(`${ic('user', 'k')} Dolaylı personel`, `<div class="tc-tablo-kap"${kip_()}><table class="tc-tablo"><thead><tr><th>Görev</th><th class="pm-num">Brüt aylık</th><th class="pm-num">İşverene maliyet</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${dl}</tbody><tfoot><tr><th>Toplam</th><td></td><td class="pm-num"><b class="mono">${msTL(msDolayliAylik(D))}</b></td><td></td></tr></tfoot></table></div>
    ${yaz ? `<form class="pm-ym-yeni" data-form="ms-dolayli" novalidate><input class="tc-alan-kutu" name="gorev" placeholder="Görev" aria-label="Görev" required><input class="tc-alan-kutu" name="brut" type="number" min="0" step="any" placeholder="Brüt aylık TL" aria-label="Brüt aylık" required><button type="submit" class="tc-dugme tc-dugme-kucuk tc-dugme-birincil">${ic('plus', 'k')}Ekle</button></form>` : ''}
    <p class="pm-kucuk">Üretimde doğrudan çalışmayan kişiler genel gidere girer; operatör ve ayarcı ücretleri doğrudan işçiliktir (Ek mesai planı > Kişi ücretleri). İşverene maliyet = brüt × (1 + SGK işveren payı %${sayi(mesSis(D).sgk, 2)} + yan hak %${sayi(mesSis(D).yanHak, 1)}).</p>`);
  const ts = v.tez.map(z => { const t = z.t, x = z.x, id = esc(t.id); const n = (k, ad, o) => msSayi('tez', x[k], `${t.id} ${ad}`, { ...o, veri: `data-v="${id}" data-k="${k}"` });
    const fark = t.ucret == null ? null : z.dogTop - +t.ucret;
    return `<tr>${td('Tezgâh', `<b class="mono">${id}</b><small class="pm-ag-not">${esc(t.ad)}</small>`)}${td('Alış bedeli', n('bedel', 'alış bedeli', { adim: 10000 }), 'pm-num')}${td('Ömür yıl', n('omur', 'faydalı ömür', { adim: 1, min: 1, max: 50 }), 'pm-num')}${td('Hurda %', n('hurda', 'hurda değeri', { adim: 1, max: 100 }), 'pm-num')}
      ${td('kW', n('kw', 'kurulu güç', { adim: 0.5 }), 'pm-num')}${td('Yük', n('yuk', 'ortalama yük oranı', { adim: 0.05, max: 1 }), 'pm-num')}${td('m²', n('alan', 'alan', { adim: 1 }), 'pm-num')}${td('Takım, sarf TL/sa', n('sarf', 'takım ve sarf', { adim: 5 }), 'pm-num')}${td('Bakım TL/sa', n('bakim', 'bakım', { adim: 5 }), 'pm-num')}
      ${td('Amortisman/ay', `<span class="mono">${msTL(z.amort)}</span>`, 'pm-num')}${td('Genel gider TL/sa', `<b class="mono">${z.oran == null ? '—' : agTLs(z.oran)}</b><small class="pm-ag-not">${sayi(z.kap, 0)} sa kapasite</small>`, 'pm-num')}
      ${td('Doğrudan TL/sa', `<b class="mono">${agTLs(z.dogTop)}</b><small class="pm-ag-not">enerji ${sayi(z.dog.enerji, 0)} · takım ${sayi(z.dog.sarf, 0)} · bakım ${sayi(z.dog.bakim, 0)} · operatör ${z.dog.operator == null ? '—' : sayi(z.dog.operator, 0)}</small>`, 'pm-num')}
      ${td('Makine TL/sa şimdi', `<span class="mono">${t.ucret == null ? '—' : sayi(t.ucret, 0)}</span>${fark != null && Math.abs(fark) >= 1 ? `<small class="pm-ag-not">öneri ${fark > 0 ? '+' : '−'}${sayi(Math.abs(fark), 0)}</small>` : ''}`, 'pm-num')}${td('', yaz ? dugme('', 'ms-tez-yaz', { simge: 'check', hayalet: true, kucuk: true, ad: `${t.id} makine maliyetine önerilen değeri yaz`, veri: `data-v="${id}"` }) : '')}</tr>`; }).join('');
  const tezKart = kart(`${ic('cpu', 'k')} Tezgâh: amortisman, enerji, takım ve bakım`, `<div class="tc-tablo-kap"${kip_()}><table class="tc-tablo"><thead><tr><th>Tezgâh</th><th class="pm-num">Alış bedeli</th><th class="pm-num">Ömür yıl</th><th class="pm-num">Hurda %</th><th class="pm-num">kW</th><th class="pm-num">Yük</th><th class="pm-num">m²</th><th class="pm-num">Takım, sarf TL/sa</th><th class="pm-num">Bakım TL/sa</th><th class="pm-num">Amortisman/ay</th><th class="pm-num">Genel gider TL/sa</th><th class="pm-num">Doğrudan TL/sa</th><th class="pm-num">Makine TL/sa şimdi</th><th><span class="tc-gizli-etiket">İşlem</span></th></tr></thead><tbody>${ts}</tbody></table></div>
    <p class="pm-kucuk">Amortisman doğrusal: (alış bedeli − hurda değeri) / (ömür × 12). Doğrudan saat maliyeti = kW × yük oranı × kWh fiyatı + takım ve sarf + bakım + operatör (grubun ortalama kişi saat maliyeti × operatör oranı). Onay düğmesi önerilen doğrudan maliyeti tezgâhın makine saat maliyetine yazar; plan bunu işleme maliyetinde kullanır.</p>`, yaz ? dugme('Hepsini makine maliyetine yaz', 'ms-tez-yaz', { kucuk: true, simge: 'check', veri: 'data-v="*"' }) : '');
  const gr = {}; for (const z of v.tez) { const g = (gr[z.t.grup] = gr[z.t.grup] || { aylik: 0, kap: 0, mesgul: 0, atil: 0, n: 0 }); g.aylik += z.aylik; g.kap += z.kap; g.mesgul += z.mesgul; g.atil += z.atil; g.n++; }
  const grSat = Object.entries(gr).map(([g, x]) => `<tr>${td('Grup', `<b>${esc(g)}</b> <span class="pm-kucuk">${x.n} tezgâh</span>`)}${td('Aylık gider', msTL(x.aylik), 'pm-num')}${td('Kapasite', `${sayi(x.kap, 0)} sa`, 'pm-num')}${td('Oran', `<b class="mono">${x.kap ? agTLs(x.aylik / x.kap) : '—'}</b>`, 'pm-num')}${td('Doluluk', x.kap ? '%' + sayi(Math.min(100, x.mesgul / x.kap * 100), 0) : '—', 'pm-num')}${td('Atıl kapasite', msTL(x.atil), 'pm-num')}</tr>`).join('');
  const grKart = kart(`${ic('chart', 'k')} Gruba göre dağılım`, `<div class="tc-tablo-kap"${kip_()}><table class="tc-tablo"><thead><tr><th>Grup</th><th class="pm-num">Aylık gider</th><th class="pm-num">Kapasite</th><th class="pm-num">Oran</th><th class="pm-num">Doluluk</th><th class="pm-num">Atıl kapasite</th></tr></thead><tbody>${grSat}</tbody></table></div><p class="pm-kucuk">Doluluk önümüzdeki 30 günün planından okunur; planda o kadar iş yoksa atıl kapasite yüksek görünür (deneme verisinde sipariş yaklaşık iki haftayı dolduruyor). Atıl kapasite gideri ilk bakılacak yerdir: düşük dolu pahalı tezgâh fiyatı yükseltmek yerine iş çekme ya da vardiya azaltma adayıdır.</p>`);
  return `<div class="pm-ms">${msVeriDurum()}${ust}${kalKart}${dlKart}${tezKart}${grKart}</div>`;
}
const kip_ = () => kip();

/* ---------- Ek mesai sayfası: kurallar, kişi ücretleri, atama ---------- */
function msMesaiKartlar() {
  const D = S.D; const fg = agFiyatGorur(); const m = mesSis(D); const yaz = fg && yetkili('plan.kilitle'); const at = msAtama();
  const ata = at.liste.map(a => `<tr ${a.ihlal.length ? 'data-uyari' : ''}>${td('Ek vardiya', `<b class="mono">${esc(a.e.m)}</b> <span class="pm-kucuk">${esc(fmtDT(D, a.e.gun * 24).slice(0, 9))} · ${esc(a.e.vardiya)} ${sayi(a.h, 1)} sa · ${MS_GUN_AD[a.tur]}</span>`)}${td('Kişiler', a.kisiler.length ? esc(a.kisiler.map(p => p.ad).join(', ')) : '<span class="pm-kucuk">atanamadı</span>')}${fg ? td('Bedel', `<span class="mono">${agTL(ymMesaiTL(D, cxAl(), a.e))}</span><small class="pm-ag-not">×${sayi(m.carp[a.tur], 1)}</small>`, 'pm-num') : ''}${td('Denetim', a.ihlal.length ? `<span class="pm-ag-uyari">${ic('alert', 'k')} ${esc(a.ihlal.join('; '))}</span>` : rozet('Uygun', 'tamam'))}</tr>`).join('');
  const ihlalN = at.liste.filter(a => a.ihlal.length).length;
  const ataKart = kart(`${ic('user', 'k')} Ek vardiyaya kim gelir`, `${ihlalN ? `<p class="pm-ag-uyari">${ic('alert', 'k')} ${ihlalN} ek vardiyada sınır aşımı ya da eksik kişi var; vardiya bu hâliyle yasal ya da uygulanabilir olmayabilir.</p>` : ''}<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Ek vardiya</th><th>Kişiler</th>${fg ? '<th class="pm-num">Bedel</th>' : ''}<th>Denetim</th></tr></thead><tbody>${ata || `<tr><td colspan="4" class="pm-kucuk">Planlı ek mesai yok.</td></tr>`}</tbody></table></div>
    <p class="pm-kucuk">Her ek vardiyaya tezgâhın grubunda yetkin, o gün izinli olmayan, aynı vardiyada zaten çalışmayan ve bu yıl en az fazla mesai yapmış kişi atanır (operatör oranı kadar). Hafta içi gündüz vardiyasından çıkan kişi aynı gün 8 saatlik ek vardiyaya kalırsa günlük sınır aşılır; bu yüzden hafta içi ek vardiya çoğunlukla başka vardiyanın kişisiyle ya da kısa mesaiyle kurulur.</p>`);
  const kisiSat = D.personel.map(p => { const k = at.kisi[p.id]; const u = (m.ucret || {})[p.id] || {}; const s = msSaat(p, D); const top = k.yil + k.plan; const asim = top > m.yillikSinir;
    return `<tr ${asim ? 'data-uyari' : ''}>${td('Kişi', `<b>${esc(p.ad)}</b><small class="pm-ag-not">${esc(p.vardiya)} · ${esc((p.gruplar || []).join(', '))}${p.ayar ? ' · ayarcı' : ''}</small>`)}${fg ? td('Brüt aylık', msSayi('kbrut', u.brut, p.ad + ' brüt ücreti', { adim: 500, veri: `data-v="${esc(p.id)}"` }), 'pm-num') + td('Saat maliyeti', `<span class="mono">${s == null ? '—' : agTLs(s)}</span><small class="pm-ag-not">fazla mesai ${s == null ? '—' : agTLs(s * m.carp.hi)}</small>`, 'pm-num') : ''}
      ${td('Bu yıl yapılan', msSayi('kyil', u.yil, p.ad + ' bu yıl yaptığı fazla mesai', { adim: 1, max: 2000, veri: `data-v="${esc(p.id)}"` }), 'pm-num')}${td('Planlı', `${sayi(k.plan, 1)} sa`, 'pm-num')}${td('Yıllık sınıra kalan', `<b class="mono" ${asim ? 'data-ton="hata"' : ''}>${sayi(m.yillikSinir - top, 0)} sa</b>`, 'pm-num')}</tr>`; }).join('');
  const kisiKart = kart(`${ic('user', 'k')} Kişi ücretleri ve fazla mesai sayacı`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo"><thead><tr><th>Kişi</th>${fg ? '<th class="pm-num">Brüt aylık</th><th class="pm-num">Saat maliyeti</th>' : ''}<th class="pm-num">Bu yıl yapılan</th><th class="pm-num">Planlı</th><th class="pm-num">Yıllık sınıra kalan</th></tr></thead><tbody>${kisiSat}</tbody></table></div>
    <p class="pm-kucuk">Saat maliyeti = brüt × (1 + SGK işveren payı + yan hak) / aylık ücret saati. Ücretleri müdür ve yönetici görür. "Bu yıl yapılan" bordrodan girilir; uygulamada PDKS ve İK kayıtlarından gelmelidir.</p>`);
  const r = (k, ad, o) => `<label class="pm-ym-alan"><span>${ad}</span>${msSayi('kural', m[k], ad, { ...o, veri: `data-k="${k}"` })}</label>`;
  const c = (k, ad) => `<label class="pm-ym-alan"><span>${ad}</span>${msSayi('carp', m.carp[k], ad, { adim: 0.1, min: 1, max: 4, veri: `data-k="${k}"` })}</label>`;
  const kuralKart = fg ? kart(`${ic('book', 'k')} Mesai kuralları`, `<div class="pm-sira"><div class="pm-seg" role="group" aria-label="Mesai bedeli">${[['1', 'Kişi ücretinden'], ['0', 'Tek mesai ücreti']].map(([k, n]) => `<button type="button" data-act="ms-kisi" data-v="${k}" aria-pressed="${String(+!!m.kisiBazli) === k}" ${yaz ? '' : 'disabled'}>${n}</button>`).join('')}</div></div>
    <div class="pm-ym-alanlar">${r('aylikSaat', 'Aylık ücret saati', { adim: 1, min: 100, max: 300 })}${r('sgk', 'SGK işveren payı %', { adim: 0.25, max: 60 })}${r('yanHak', 'Yan haklar %', { adim: 0.5, max: 100 })}${r('kisiEk', 'Yemek ve servis TL/kişi', { adim: 10, max: 10000 })}
      ${c('hi', 'Hafta içi çarpanı')}${c('cmt', 'Cumartesi çarpanı')}${c('paz', 'Pazar çarpanı')}${c('tatil', 'Resmî tatil çarpanı')}
      ${r('gunlukSinir', 'Günlük çalışma sınırı sa', { adim: 0.5, min: 1, max: 24 })}${r('geceSinir', 'Gece çalışma sınırı sa', { adim: 0.5, min: 1, max: 24 })}${r('yillikSinir', 'Yıllık fazla mesai sınırı sa', { adim: 10, min: 0, max: 2000 })}</div>
    <p class="pm-kucuk">Varsayılanlar 4857 sayılı İş Kanunu'ndan bilinen değerlerdir (fazla çalışmada %50 zam, günlük 11 saat, gece 7,5 saat, yılda 270 saat); bu denemede belgeden doğrulanmadı. Pazar ve tatil çarpanları işyeri uygulamasına göre değişir; İK ve toplu sözleşmeyle kontrol edin. Ek vardiyanın bedeli = saat × operatör oranı × grubun ortalama saat maliyeti × gün çarpanı + yemek ve servis.</p>`) : '';
  return `<div class="pm-ms">${ataKart}${kisiKart}${kuralKart}</div>`;
}
{ const mp0 = YM_GORUNUM.mesaiplan; YM_GORUNUM.mesaiplan = () => { let h = mp0(); const m = mesSis();
  if (m.kisiBazli) h = h.replace(/<span>[^<]*TL\/sa, hafta sonu ×[^<]*<\/span>/, '<span>kişi ücretinden, gün türüne göre çarpan</span>');
  return h + msMesaiKartlar(); }; }
{ const ml0 = YM_GORUNUM.maliyet; YM_GORUNUM.maliyet = () => { let h = ml0(); if (!agFiyatGorur()) return h;
  const M = msSis(); const v = msHesap();
  if (M.kip === 'kalem') h = h.replace(/<label class="pm-ym-alan"><span>Genel gider TL\/tezgâh saati<\/span>[\s\S]*?<\/label>/, `<label class="pm-ym-alan"><span>Genel gider</span><b class="mono">${v && v.ort != null ? agTLs(v.ort) : '—'} ort.</b><button type="button" class="pm-at-link" data-act="git" data-v="giderler">kalemlerden, tezgâh başına</button></label>`);
  if (mesSis().kisiBazli) h = h.replace(/<label class="pm-ym-alan"><span>Mesai ücreti TL\/sa<\/span>[\s\S]*?<\/label>/, `<label class="pm-ym-alan"><span>Mesai bedeli</span><button type="button" class="pm-at-link" data-act="git" data-v="mesaiplan">kişi ücretinden, Ek mesai planı</button></label>`).replace(/<label class="pm-ym-alan"><span>Hafta sonu ve tatil mesai çarpanı<\/span>[\s\S]*?<\/label>/, '');
  return h; }; }
{ const i = YAN.findIndex(x => x[0] === 'maliyet'); YAN.splice(i + 1, 0, ['giderler', 'Genel gider', 'layers']); YAN_ID.add('giderler'); SAYFA_AD.giderler = 'Genel gider ve amortisman'; EKRAN_OF.giderler = 'plan'; YM_GORUNUM.giderler = sGenelGider; }

/* ---------- eylemler ---------- */
const msYetki = () => { if (!agFiyatGorur()) { bildir('Bunu müdür ya da yönetici yapar.', 'hata'); render(); return false; } return true; };
const msDeg = (ne, ayr, fn) => degistir(ne, ayr, fn, 'plan.kilitle', { planKoru: true });
{ const te0 = tekEylem; tekEylem = function (act, v, el, e) {
  if (!String(act).startsWith('ms-')) return te0(act, v, el, e);
  if (!msYetki()) return true; const M = msSis(); const m = mesSis();
  if (act === 'ms-kip') { if (!['kalem', 'tek'].includes(v)) return true; msDeg('Genel gider hesabı', v === 'kalem' ? 'kalemlerden' : 'tek oran', () => { M.kip = v; }); return true; }
  if (act === 'ms-kisi') { msDeg('Mesai bedeli', v === '1' ? 'kişi ücretinden' : 'tek mesai ücreti', () => { m.kisiBazli = v === '1'; }); return true; }
  if (act === 'ms-ksil') { const k = M.kalemler.find(x => x.id === v); if (!k) return true; msDeg('Gider kalemi silindi', k.ad, () => { M.kalemler = M.kalemler.filter(x => x !== k); }); return true; }
  if (act === 'ms-dsil') { const g = M.dolayli.find(x => x.id === v); if (!g) return true; msDeg('Dolaylı personel silindi', g.gorev, () => { M.dolayli = M.dolayli.filter(x => x !== g); }); return true; }
  if (act === 'ms-tez-yaz') { const h = msHesap(); if (!h) return true; const l = h.tez.filter(z => v === '*' || z.t.id === v);
    degistir('Makine saat maliyeti hesaptan', l.map(z => `${z.t.id}: ${z.t.ucret ?? '—'} → ${Math.round(z.dogTop)}`).join('; '), () => { for (const z of l) z.t.ucret = Math.round(z.dogTop); }, 'plan.kilitle'); return true; }
  return true; }; }
document.addEventListener('change', e => {
  const el = e.target; const c = el.dataset && el.dataset.chg; if (!c || !c.startsWith('ms-')) return;
  e.stopImmediatePropagation(); if (!msYetki()) return; const M = msSis(); const m = mesSis(); const id = el.dataset.v, k = el.dataset.k;
  const metin = ['ms-kad', 'ms-dgorev', 'ms-ktur', 'ms-kanahtar', 'ms-kapsam'].includes(c);
  const v = metin ? el.value.trim() : el.value === '' ? null : +el.value;
  if (!metin && v != null && (!isFinite(v) || v < +(el.min || 0) || (el.max && v > +el.max))) { bildir('Geçerli bir sayı girin.', 'hata'); render(); return; }
  const kal = M.kalemler.find(x => x.id === id), dol = M.dolayli.find(x => x.id === id);
  if (c === 'ms-kad' && kal && v) return msDeg('Gider kalemi adı', `${kal.ad} → ${v}`, () => { kal.ad = v; });
  if (c === 'ms-ktur' && kal) return msDeg('Gider kalemi türü', `${kal.ad}: ${v}`, () => { kal.tur = v; });
  if (c === 'ms-kanahtar' && kal) return msDeg('Dağıtım anahtarı', `${kal.ad}: ${(MS_ANAHTAR.find(x => x[0] === v) || [, v])[1]}`, () => { kal.anahtar = v; });
  if (c === 'ms-kapsam' && kal) return msDeg('Gider kapsamı', `${kal.ad}: ${v || 'bütün atölye'}`, () => { kal.kapsam = v; });
  if (c === 'ms-kaylik' && kal) return msDeg('Gider tutarı', `${kal.ad}: ${agTL(kal.aylik)} → ${agTL(v)}`, () => { kal.aylik = v; });
  if (c === 'ms-dgorev' && dol && v) return msDeg('Dolaylı personel görevi', `${dol.gorev} → ${v}`, () => { dol.gorev = v; });
  if (c === 'ms-dbrut' && dol) return msDeg('Dolaylı personel ücreti', `${dol.gorev}: ${agTL(dol.brut)} → ${agTL(v)}`, () => { dol.brut = v; });
  if (c === 'ms-verim' && v != null) return msDeg('Kapasite verimi', `%${M.verim} → %${v}`, () => { M.verim = v; });
  if (c === 'ms-kwh' && v != null) return msDeg('Elektrik birim fiyatı', `${M.kwh} → ${v} TL/kWh`, () => { M.kwh = v; });
  if (c === 'ms-tez' && M.tez[id] && ['bedel', 'omur', 'hurda', 'kw', 'yuk', 'alan', 'sarf', 'bakim'].includes(k)) return msDeg('Tezgâh maliyet bilgisi', `${id} ${k}: ${M.tez[id][k] ?? '—'} → ${v ?? '—'}`, () => { M.tez[id][k] = v; });
  if (c === 'ms-kbrut') { const u = (m.ucret[id] = m.ucret[id] || {}); return degistir('Kişi ücreti', `${id}: ${agTL(u.brut)} → ${agTL(v)}`, () => { u.brut = v; }, 'plan.kilitle'); }
  if (c === 'ms-kyil') { const u = (m.ucret[id] = m.ucret[id] || {}); return msDeg('Yapılan fazla mesai', `${id}: ${u.yil ?? 0} → ${v ?? 0} sa`, () => { u.yil = v; }); }
  if (c === 'ms-kural' && k in m && v != null) return degistir('Mesai kuralı', `${k}: ${m[k]} → ${v}`, () => { m[k] = v; }, 'plan.kilitle');
  if (c === 'ms-carp' && k in m.carp && v != null) return degistir('Mesai çarpanı', `${MS_GUN_AD[k]}: ×${m.carp[k]} → ×${v}`, () => { m.carp[k] = v; }, 'plan.kilitle');
  render();
}, true);
document.addEventListener('submit', e => {
  const f = e.target.closest && e.target.closest('[data-form="ms-kalem"], [data-form="ms-dolayli"]'); if (!f) return; e.preventDefault(); if (!msYetki()) return;
  const M = msSis(); const yeniId = (l, on) => on + (Math.max(0, ...l.map(x => +String(x.id).replace(/\D/g, '') || 0)) + 1);
  if (f.dataset.form === 'ms-kalem') { const ad = f.elements.ad.value.trim(); const t = +f.elements.aylik.value; if (!ad || !(t >= 0) || f.elements.aylik.value === '') { bildir('Kalem adı ve aylık tutar girin.', 'hata'); return; }
    msDeg('Gider kalemi eklendi', `${ad}: ${agTL(t)}`, () => { M.kalemler = [...M.kalemler, { id: yeniId(M.kalemler, 'K'), ad, tur: f.elements.tur.value, aylik: t, anahtar: f.elements.anahtar.value, kapsam: '' }]; }); return; }
  const g = f.elements.gorev.value.trim(); const b = +f.elements.brut.value; if (!g || !(b > 0)) { bildir('Görev ve brüt ücret girin.', 'hata'); return; }
  msDeg('Dolaylı personel eklendi', `${g}: ${agTL(b)}`, () => { M.dolayli = [...M.dolayli, { id: yeniId(M.dolayli, 'G'), gorev: g, brut: b }]; });
}, true);

/* maliyetin dayandığı girdilerden eksik olanlar tek yerde; her satır girildiği sayfaya götürür */
function msVeriDurum() {
  const D = S.D; const M = msSis(D); const m = mesSis(D);
  const l = [
    ['cpu', 'Tezgâh alış bedeli ya da ömrü', D.tezgahlar.filter(t => !((M.tez[t.id] || {}).bedel > 0 && (M.tez[t.id] || {}).omur > 0)).length, D.tezgahlar.length, 'giderler'],
    ['bolt', 'Tezgâh kurulu gücü', D.tezgahlar.filter(t => !((M.tez[t.id] || {}).kw > 0)).length, D.tezgahlar.length, 'giderler'],
    ['lira', 'Tezgâh makine saat maliyeti', D.tezgahlar.filter(t => t.ucret == null).length, D.tezgahlar.length, 'maliyet'],
    ['user', 'Kişi brüt ücreti', D.personel.filter(p => !(((m.ucret || {})[p.id] || {}).brut > 0)).length, D.personel.length, 'mesaiplan'],
    ['box', 'Malzeme kg fiyatı', (D.malzemeler || []).filter(x => x.birimFiyat == null).length, (D.malzemeler || []).length, 'maliyet'],
    ['flag', 'Sipariş tutarı', D.siparisler.filter(x => x.gelir == null).length, D.siparisler.length, 'ysiparis'],
    ['alert', 'Gecikme ceza oranı (sipariş ya da müşteri)', D.siparisler.filter(x => { try { return agBedel(D, x).eksik.includes('ceza oranı'); } catch (e) { return true; } }).length, D.siparisler.length, 'oncelik'],
  ];
  const sat = l.map(([sm, ad, n, top, git]) => `<li ${n ? 'data-eksik' : ''}>${ic(n ? 'alert' : 'check', 'k')}<span>${esc(ad)}</span><b class="mono">${n ? `${n}/${top} eksik` : 'tam'}</b><button type="button" class="pm-at-link" data-act="git" data-v="${git}">${esc(SAYFA_AD[git] || git)}</button></li>`).join('');
  const eksik = l.filter(x => x[2]).length;
  return kart(`${ic('scan', 'k')} Maliyet verisi`, `<ul class="pm-ms-veri">${sat}</ul><p class="pm-kucuk">${eksik ? 'Eksik alan maliyeti eksik gösterir ya da varsayılana düşer; uygulamada bu alanlar sahibi modülde girilir.' : 'Maliyetin dayandığı girdiler tam.'}</p>`);
}
/* kabul edilen ek vardiya kişi sınırlarını aşıyorsa hemen söylenir */
{ const te1 = tekEylem; tekEylem = function (act, v, el, e) {
  const r = te1(act, v, el, e);
  if (act === 'ym-mesai-kabul' && mesSis().kisiBazli) { const a = msAtama(); const son = a.liste.find(x => x.i === S.ekMesai.length - 1); if (son && son.ihlal.length) bildir(`Ek vardiya kabul edildi ama ${son.ihlal.join('; ')}.`, 'hata'); }
  return r; }; }
